#!/usr/bin/env python3
"""Read and write Conductor's rows from inside the cloud computer.

Rows go through ``LOCAL_NOTIS_DATABASE_UPSERT_ROW``, the platform's generic row
writer: it takes the database by slug and the values in ``properties``, and a
partial payload leaves every property it does not name alone. That is what lets
a script touch one field without reconstructing the whole row -- and it is why
there is no longer a per-database tool name to discover or cache here.

Why a script and not direct tool calls, then: the read-merge-write around a row
(find it by name, decide create versus update, coerce shell strings into typed
values) is the same every time, and doing it in one place keeps the agent from
reinventing it per call.

Slugs are unique per owning app rather than per workspace, so a lookup can come
back ambiguous -- an old `-dev` twin from an app development session is the
usual cause. The writer answers that with the candidate ids, and `resolve_id`
below picks the app's own database and retries by id.

Python 3.9 compatible on purpose: that is what the sandbox image ships.

    notis_rows.py resolve repositories
    notis_rows.py get repositories --name notis
    notis_rows.py get workspaces --name fix-auth --match-json-field 'Repository=["repo-id"]'
    notis_rows.py list workspaces
    notis_rows.py set repositories --name notis --field Status=Ready
    notis_rows.py set repositories --name notis --json-field 'Environment files={...}'
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

CURRENT_APP_ID = os.environ.get("NOTIS_CODING_APP_ID", "")


# --------------------------------------------------------------------------
# CLI transport
# --------------------------------------------------------------------------

def _cli_argv() -> List[str]:
    """Prefer an installed CLI; fall back to npx.

    npx re-resolves the package on a cold cache, which costs ten seconds or
    more on every call. A globally installed binary makes a multi-step setup
    noticeably faster, so use it when it is there.
    """
    binary = shutil.which("notis")
    if binary:
        return [binary]
    return ["npx", "--yes", "--package", "@notis_ai/cli@latest", "--", "notis"]


def _unwrap(node: Any, depth: int = 0) -> Any:
    """Strip the CLI's nested result envelope down to the tool's own payload."""
    if depth > 8 or not isinstance(node, dict):
        return node
    for key in ("data", "result"):
        if isinstance(node.get(key), (dict, list)):
            return _unwrap(node[key], depth + 1)
    results = node.get("results")
    if isinstance(results, list) and results:
        return _unwrap(results[0], depth + 1)
    if "response" in node:
        return _unwrap(node["response"], depth + 1)
    return node


# Anywhere outside a checkout. A repository that ships its own dev tooling can
# leave a CLI lease in .context/, and the CLI resolves that by walking up from
# the working directory -- so running from inside the tree we just set up would
# point our own calls at that project's dev runtime instead of Notis.
NEUTRAL_CWD = "/vercel/sandbox"


def tool_exec(tool: str, arguments: Dict[str, Any], *, timeout: int = 180) -> Any:
    # The CLI's own default is 30s, which a full-table read can exceed on a
    # cold call. Raise the request deadline rather than letting a slow read
    # look like a failed one.
    argv = _cli_argv() + [
        "tools", "exec", tool,
        "--timeout-ms", "90000",
        "--arguments", json.dumps(arguments),
    ]
    proc = subprocess.run(
        argv, capture_output=True, text=True, timeout=timeout,
        cwd=NEUTRAL_CWD if os.path.isdir(NEUTRAL_CWD) else None,
    )
    raw = proc.stdout or proc.stderr
    start = raw.find("{")
    if start < 0:
        raise RuntimeError(f"{tool}: no JSON in CLI output: {raw[:400]}")
    envelope = json.loads(raw[start:])
    if envelope.get("ok") is False:
        error = envelope.get("error") or {}
        raise RuntimeError(f"{tool}: {error.get('code')}: {error.get('message')}")
    payload = _unwrap(envelope)
    # A refused call can also arrive inside a successful envelope. Treating it
    # as a payload is how an ambiguous slug used to look like an empty result.
    if isinstance(payload, dict) and payload.get("status") == "error":
        raise RuntimeError(f"{tool}: {payload.get('message') or 'call failed'}")
    return payload


# --------------------------------------------------------------------------
# Database resolution
# --------------------------------------------------------------------------

_UUID = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)

# The two ways naming a database by slug can fail. Anything else -- a rejected
# property value, an expired credential -- is a real answer and must not be
# retried against a different database, which would turn one clear error into a
# confusing pair of them.
_UNRESOLVED = re.compile(r"several databases use the slug|database not found", re.I)


def _installed_app_id() -> Optional[str]:
    """Resolve only the explicitly selected installed Coding app."""
    if not _UUID.fullmatch(CURRENT_APP_ID):
        raise RuntimeError("Set NOTIS_CODING_APP_ID to the selected installed Coding app ID before running a helper.")
    proc = subprocess.run(
        _cli_argv() + ["apps", "list", "--json"],
        capture_output=True,
        text=True,
        timeout=90,
        cwd=NEUTRAL_CWD if os.path.isdir(NEUTRAL_CWD) else None,
    )
    raw = proc.stdout or proc.stderr
    start = raw.find("{")
    if proc.returncode != 0 or start < 0:
        return None
    payload = _unwrap(json.loads(raw[start:]))
    apps = payload.get("apps") if isinstance(payload, dict) else []
    matches = [
        app
        for app in apps or []
        if isinstance(app, dict)
        and str(app.get("app_id") or app.get("id") or "") == CURRENT_APP_ID
        and not bool((app.get("manifest") or {}).get("is_dev"))
        and not str(app.get("slug") or "").endswith("-dev")
    ]
    # `apps list` names the identifier `app_id`; older payloads said `id`.
    identifier = matches[0].get("app_id") or matches[0].get("id") if len(matches) == 1 else None
    return str(identifier) if identifier else None


def _pick(candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Choose between databases that share a slug.

    Prefer the stable installed Conductor app id. A database's row count is not
    identity: both a new installed database and its dev twin can be empty.
    """
    app_id = _installed_app_id()
    if not app_id:
        return {}
    owned = [item for item in candidates if str(item.get("owner_app_id") or "") == app_id]
    if len(owned) == 1:
        return owned[0]
    return {}


def resolve_id(slug: str, error_message: str = "") -> Optional[str]:
    """Resolve a slug to a database id after an ambiguous or failed lookup.

    Listing is the primary answer because it carries the owning app and the row
    count. The rejection itself also names the candidate ids, so a listing that
    comes back empty or unhelpful still leaves something to choose from.
    """
    try:
        payload = tool_exec("LOCAL_NOTIS_DATABASE_LIST_DATABASES", {})
        everything = payload.get("databases") or payload.get("results") or []
    except RuntimeError:
        everything = []
    candidates = [
        item for item in everything
        if isinstance(item, dict) and item.get("slug") == slug and item.get("id")
    ]
    if candidates:
        return _pick(candidates).get("id")

    # Fall back to the ids the writer listed in its own rejection, reading each
    # one so the same "owned, then busiest" rule still decides.
    described: List[Dict[str, Any]] = []
    for database_id in dict.fromkeys(_UUID.findall(error_message or "")):
        try:
            database = tool_exec(
                "LOCAL_NOTIS_DATABASE_GET_DATABASE", {"database_id": database_id}
            ).get("database") or {}
        except RuntimeError:
            continue
        if database.get("id"):
            described.append(database)
    return _pick(described).get("id") if described else None


# Which database a slug means does not change while Conductor stays installed,
# but working it out costs two platform round trips -- and every read and write
# used to pay them again. Remember the answer next to the other workspace state
# so a row operation is one call, which is the difference between a bulk archive
# that moves and one that looks frozen.
STATE_ROOT = Path(os.environ.get("NOTIS_WORKSPACES_STATE", "/vercel/sandbox/.notis/workspaces"))
_RESOLVED: Dict[str, str] = {}


def _cache_path() -> Path:
    if not _UUID.fullmatch(CURRENT_APP_ID):
        raise RuntimeError("An exact installed Coding app ID is required for the database cache.")
    return STATE_ROOT / CURRENT_APP_ID / "databases.json"


def _cached_database_id(slug: str) -> Optional[str]:
    if slug in _RESOLVED:
        return _RESOLVED[slug]
    try:
        stored = json.loads(_cache_path().read_text())
    except (OSError, ValueError):
        return None
    identifier = stored.get(slug) if isinstance(stored, dict) else None
    if isinstance(identifier, str) and identifier:
        _RESOLVED[slug] = identifier
        return identifier
    return None


def _remember_database_id(slug: str, database_id: str) -> None:
    _RESOLVED[slug] = database_id
    path = _cache_path()
    try:
        stored = json.loads(path.read_text())
        if not isinstance(stored, dict):
            stored = {}
    except (OSError, ValueError):
        stored = {}
    stored[slug] = database_id
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        # Rename rather than write in place: two workspace scripts can archive
        # at the same time, and a half-written cache is a puzzle to debug.
        scratch = path.with_suffix(f".{os.getpid()}.tmp")
        scratch.write_text(json.dumps(stored, indent=1, sort_keys=True))
        scratch.replace(path)
    except OSError:
        # A read-only or missing state directory costs speed, never correctness.
        pass


def _forget_database_id(slug: str) -> None:
    _RESOLVED.pop(slug, None)
    path = _cache_path()
    try:
        stored = json.loads(path.read_text())
    except (OSError, ValueError):
        return
    if isinstance(stored, dict) and stored.pop(slug, None) is not None:
        try:
            path.write_text(json.dumps(stored, indent=1, sort_keys=True))
        except OSError:
            pass


def call_for_database(tool: str, slug: str, arguments: Dict[str, Any]) -> Any:
    """Run a database tool only against the installed Conductor app's DB id."""
    remembered = _cached_database_id(slug)
    if remembered:
        try:
            return tool_exec(tool, dict(arguments, database_id=remembered))
        except RuntimeError as exc:
            # Only a database that is gone or ambiguous is worth a second
            # attempt, and only that answer proves the call did nothing. A
            # rejected value or an expired credential is a real reply and is
            # never replayed against a freshly resolved database.
            if not _UNRESOLVED.search(str(exc)):
                raise
            _forget_database_id(slug)

    database_id = resolve_id(slug)
    if not database_id:
        raise RuntimeError(
            f"No database with slug '{slug}' owned by the installed Conductor app. "
            "Conductor has to be installed before its rows can be read or written."
        )
    _remember_database_id(slug, database_id)
    return tool_exec(tool, dict(arguments, database_id=database_id))


def describe(slug: str) -> Dict[str, Any]:
    """The database's id and property names, for diagnosis.

    The only place the schema itself is wanted, so the only place
    ``GET_DATABASE`` is still called.
    """
    payload = call_for_database("LOCAL_NOTIS_DATABASE_GET_DATABASE", slug, {})
    database = payload.get("database") or {}
    if not database.get("id"):
        raise RuntimeError(f"No database with slug '{slug}'")
    return {
        "database_id": database["id"],
        "properties": [p["name"] for p in database.get("schema", {}).get("properties", [])],
    }


# --------------------------------------------------------------------------
# Row reads
# --------------------------------------------------------------------------

def _flatten_value(prop: Dict[str, Any]) -> Any:
    """Turn one stored property into a plain scalar the shell can use."""
    kind = prop.get("type")
    if kind in ("title", "rich_text"):
        parts = prop.get(kind) or prop.get("rich_text") or []
        return "".join(part.get("text", {}).get("content", "") for part in parts)
    if kind == "select":
        return (prop.get("select") or {}).get("name")
    if kind == "multi_select":
        return [item.get("name") for item in prop.get("multi_select") or []]
    if kind == "status":
        return (prop.get("status") or {}).get("name")
    if kind == "number":
        return prop.get("number")
    if kind == "checkbox":
        return prop.get("checkbox")
    if kind in ("url", "email", "phone_number"):
        return prop.get(kind)
    if kind == "date":
        value = prop.get("date")
        if isinstance(value, dict):
            return value.get("start")
        return value
    if kind == "relation":
        return [item.get("id") for item in prop.get("relation") or []]
    if kind == "secret":
        # Already redacted by the platform: reference, status and metadata and
        # nothing else, whatever the property is pointing at.
        return {
            "present": prop.get("present"),
            "reference": prop.get("reference"),
            "status": prop.get("status"),
            "metadata": prop.get("metadata"),
        }
    return prop.get(kind)


def _flatten_document(document: Dict[str, Any]) -> Dict[str, Any]:
    flat = {
        "document_id": document.get("id") or document.get("document_id"),
        "title": document.get("title"),
        "url": document.get("url"),
    }
    for name, prop in (document.get("properties") or {}).items():
        if isinstance(prop, dict):
            flat[name] = _flatten_value(prop)
        else:
            flat[name] = prop
    return flat


def list_rows(slug: str, *, page_size: int = 100) -> List[Dict[str, Any]]:
    """Every row, following pagination to the end.

    Stopping at the first page is how `set_row` once decided a 101st row did
    not exist and forked a duplicate on every sync.
    """
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        arguments: Dict[str, Any] = {"query": {"page_size": page_size}}
        if offset:
            arguments["offset"] = offset
        payload = call_for_database("LOCAL_NOTIS_DATABASE_QUERY", slug, arguments)
        documents = payload.get("documents") or payload.get("results") or []
        rows.extend(_flatten_document(doc) for doc in documents)
        next_offset = payload.get("next_offset")
        if not payload.get("has_more") or not isinstance(next_offset, int) or not documents:
            return rows
        offset = next_offset


def get_row(
    slug: str,
    name: str,
    *,
    match_fields: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    match_fields = match_fields or {}
    for row in list_rows(slug):
        if (
            (row.get("title") or row.get("Name")) == name
            and all(row.get(key) == value for key, value in match_fields.items())
        ):
            return row
    return None


# --------------------------------------------------------------------------
# Row writes
# --------------------------------------------------------------------------

def _coerce(raw: str) -> Any:
    """Interpret a --field value.

    Numbers and booleans have to survive the shell round trip, and an empty
    value has to be able to clear a field rather than write the string "".
    """
    if raw == "":
        return None
    lowered = raw.lower()
    if lowered in ("true", "false"):
        return lowered == "true"
    if lowered in ("null", "none"):
        return None
    try:
        if raw.lstrip("-").isdigit():
            return int(raw)
        return float(raw) if "." in raw and raw.replace(".", "", 1).lstrip("-").isdigit() else raw
    except ValueError:
        return raw


def set_row(slug: str, *, name: Optional[str], document_id: Optional[str],
            fields: Dict[str, Any], match_fields: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    existing_id = document_id
    if not existing_id and name:
        row = get_row(slug, name, match_fields=match_fields)
        existing_id = (row or {}).get("document_id")

    arguments: Dict[str, Any] = {
        "operation": "update" if existing_id else "create",
        # Properties left out are preserved, so a caller that names one field
        # is not silently clearing the other fifteen.
        "properties": dict(fields),
    }
    if existing_id:
        arguments["document_id"] = existing_id
    if name:
        # `title` writes the title property, whatever the database calls it.
        arguments["title"] = name

    payload = call_for_database("LOCAL_NOTIS_DATABASE_UPSERT_ROW", slug, arguments)
    document = payload.get("document") or {}
    return {
        "document_id": document.get("id"),
        "operation": arguments["operation"],
        "title": document.get("title"),
        "url": document.get("url"),
    }


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="action", required=True)

    p_resolve = sub.add_parser("resolve")
    p_resolve.add_argument("slug")

    p_list = sub.add_parser("list")
    p_list.add_argument("slug")

    p_get = sub.add_parser("get")
    p_get.add_argument("slug")
    p_get.add_argument("--name", required=True)
    p_get.add_argument("--match-field", action="append", default=[])
    p_get.add_argument("--match-json-field", action="append", default=[])

    p_set = sub.add_parser("set")
    p_set.add_argument("slug")
    p_set.add_argument("--name")
    p_set.add_argument("--id", dest="document_id")
    p_set.add_argument("--field", action="append", default=[],
                       help="Property=value, repeatable")
    p_set.add_argument("--json-field", action="append", default=[],
                       help="Property=<json>, for relations, secrets and other structured values")
    p_set.add_argument("--match-field", action="append", default=[],
                       help="Property=value identity constraint used with --name")
    p_set.add_argument("--match-json-field", action="append", default=[],
                       help="Property=<json> identity constraint used with --name")

    args = parser.parse_args(argv)

    try:
        if args.action == "resolve":
            print(json.dumps(describe(args.slug), indent=1))
        elif args.action == "list":
            print(json.dumps(list_rows(args.slug), indent=1))
        elif args.action == "get":
            matches: Dict[str, Any] = {}
            for pair in args.match_field:
                key, _, value = pair.partition("=")
                matches[key] = _coerce(value)
            for pair in args.match_json_field:
                key, _, value = pair.partition("=")
                matches[key] = json.loads(value)
            print(json.dumps(get_row(args.slug, args.name, match_fields=matches), indent=1))
        elif args.action == "set":
            fields: Dict[str, Any] = {}
            for pair in args.field:
                key, _, value = pair.partition("=")
                fields[key] = _coerce(value)
            for pair in args.json_field:
                key, _, value = pair.partition("=")
                fields[key] = json.loads(value)
            matches: Dict[str, Any] = {}
            for pair in args.match_field:
                key, _, value = pair.partition("=")
                matches[key] = _coerce(value)
            for pair in args.match_json_field:
                key, _, value = pair.partition("=")
                matches[key] = json.loads(value)
            if not args.name and not args.document_id:
                raise SystemExit("set needs --name or --id")
            print(json.dumps(
                set_row(args.slug, name=args.name,
                        document_id=args.document_id, fields=fields,
                        match_fields=matches),
                indent=1,
            ))
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
