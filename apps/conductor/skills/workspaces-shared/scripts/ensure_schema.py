#!/usr/bin/env python3
"""Bring the `repositories` database schema up to what the scripts write.

The app's databases are snapshotted from whatever schema the live rows had at
deploy time, so a schema change ships as code long before any given install's
database has it. This script closes that gap idempotently, from wherever the
skills already run:

1. `Environment files` must exist and be the platform's `secret` kind. The
   kind only exists on servers that ship it; older ones silently degrade an
   unknown kind to rich text, so the server is probed first and the script
   simply reports "not yet" instead of half-migrating.
2. Rows still carrying the three legacy properties (`Secrets status`,
   `Secrets path`, `Secret files`) are folded into the secret pointer.
3. The legacy properties are removed only after every row has been folded.

Safe to run any number of times; a converged database costs one read.

    ensure_schema.py            # migrate if needed, report what it did
    ensure_schema.py --check    # report only, change nothing
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from notis_rows import (  # noqa: E402
    NEUTRAL_CWD,
    _cli_argv,
    _flatten_value,
    resolve_id,
    tool_exec,
)

DATABASE_SLUG = "repositories"
SECRET_PROPERTY = "Environment files"
LEGACY_STATUS = "Secrets status"
LEGACY_PATH = "Secrets path"
LEGACY_FILES = "Secret files"
LEGACY_PROPERTIES = (LEGACY_STATUS, LEGACY_PATH, LEGACY_FILES)


def server_supports_secret_kind() -> Optional[bool]:
    """Probe the schema tool's property-type enum for the `secret` kind.

    Best-effort: schema discovery can fail for reasons unrelated to the enum
    (a broken third-party toolkit 500s the whole discovery request), so an
    unreadable answer is None, not False. The alter-and-verify step below is
    the real gate — on a server without the kind the added property degrades
    to rich text, verification catches it, and nothing destructive happens.
    """
    argv = _cli_argv() + [
        "tools", "exec", "LOCAL_NOTIS_DATABASE_UPSERT_DATABASE", "--get-schema",
    ]
    try:
        proc = subprocess.run(
            argv, capture_output=True, text=True, timeout=120,
            cwd=NEUTRAL_CWD if os.path.isdir(NEUTRAL_CWD) else None,
        )
    except Exception:
        return None
    raw = proc.stdout or proc.stderr or ""
    if '"secret"' in raw:
        return True
    if '"enum"' in raw or '"property"' in raw.lower():
        return False
    return None


def get_database_detail(slug: str) -> Dict[str, Any]:
    database_id = resolve_id(slug)
    if not database_id:
        raise RuntimeError(
            f"No database with slug '{slug}' owned by the installed Conductor app"
        )
    payload = tool_exec("LOCAL_NOTIS_DATABASE_GET_DATABASE", {"database_id": database_id})
    detail = payload.get("database") if isinstance(payload, dict) else None
    if not isinstance(detail, dict):
        raise RuntimeError(f"get_database returned no detail for '{slug}'")
    return detail


def schema_properties(detail: Dict[str, Any]) -> List[Dict[str, Any]]:
    """The property list, wherever the payload shape carries it.

    `get_database` nests it as `database.schema.properties`; older shapes used
    a top-level `properties` list. Reading both keeps this script working
    across server versions.
    """
    schema = detail.get("schema")
    if isinstance(schema, dict) and isinstance(schema.get("properties"), list):
        return [prop for prop in schema["properties"] if isinstance(prop, dict)]
    if isinstance(detail.get("properties"), list):
        return [prop for prop in detail["properties"] if isinstance(prop, dict)]
    return []


def property_by_name(detail: Dict[str, Any], name: str) -> Optional[Dict[str, Any]]:
    for prop in schema_properties(detail):
        if prop.get("name") == name:
            return prop
    return None


def alter_schema(database_id: str, properties: List[Dict[str, Any]]) -> None:
    tool_exec(
        "LOCAL_NOTIS_DATABASE_UPSERT_DATABASE",
        {"operation": "update", "database_id": database_id, "properties": properties},
    )


def list_rows(database_id: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        payload = tool_exec(
            "LOCAL_NOTIS_DATABASE_QUERY",
            {"database_id": database_id, "query": {"page_size": 100}, "offset": offset},
        )
        documents = payload.get("documents") or []
        rows.extend(documents)
        if not payload.get("has_more"):
            return rows
        next_offset = payload.get("next_offset")
        if not documents or not isinstance(next_offset, int) or next_offset <= offset:
            raise RuntimeError("database query returned an invalid pagination cursor")
        offset = next_offset


def row_value(properties: Dict[str, Any], name: str) -> Any:
    """A property's plain value, unwrapping the query's typed envelope."""
    prop = properties.get(name)
    if isinstance(prop, dict) and "type" in prop:
        return _flatten_value(prop)
    return prop


def legacy_text(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def row_has_unfolded_legacy(row: Dict[str, Any]) -> bool:
    """True when legacy values exist and the secret pointer does not."""
    properties = row.get("properties") or {}
    secret = row_value(properties, SECRET_PROPERTY)
    already = isinstance(secret, dict) and (
        secret.get("reference") or secret.get("status") or secret.get("metadata")
    )
    has_legacy = any(
        legacy_text(row_value(properties, name)) for name in LEGACY_PROPERTIES
    )
    return has_legacy and not already


def fold_row(database_id: str, row: Dict[str, Any]) -> bool:
    """Fold a row's legacy secrets fields into the secret pointer. True if written."""
    properties = row.get("properties") or {}
    if not row_has_unfolded_legacy(row):
        return False
    status = legacy_text(row_value(properties, LEGACY_STATUS))
    path = legacy_text(row_value(properties, LEGACY_PATH))
    files_raw = legacy_text(row_value(properties, LEGACY_FILES))
    files = [line.strip() for line in (files_raw or "").splitlines() if line.strip()]
    tool_exec(
        "LOCAL_NOTIS_DATABASE_UPSERT_ROW",
        {
            "database_id": database_id,
            "operation": "update",
            "document_id": row.get("id"),
            "properties": {
                SECRET_PROPERTY: {
                    "reference": path,
                    "status": status,
                    "metadata": {"files": files} if files else None,
                },
            },
        },
    )
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report only, change nothing")
    args = parser.parse_args()

    supports_secret = server_supports_secret_kind()
    if supports_secret is False:
        print("This server does not know the 'secret' property kind yet; nothing to do.")
        return 0
    if supports_secret is None:
        print("Could not read the schema tool's enum; relying on alter-and-verify.")

    detail = get_database_detail(DATABASE_SLUG)
    database_id = detail.get("id")
    secret_prop = property_by_name(detail, SECRET_PROPERTY)
    legacy_present = [name for name in LEGACY_PROPERTIES if property_by_name(detail, name)]

    if secret_prop and secret_prop.get("type") == "secret" and not legacy_present:
        print(f"'{SECRET_PROPERTY}' is already a secret property and no legacy fields remain.")
        return 0
    if args.check:
        print(json.dumps({
            "secret_property": secret_prop.get("type") if secret_prop else None,
            "legacy_properties": legacy_present,
        }))
        return 0

    if not secret_prop:
        try:
            alter_schema(database_id, [{
                "action": "add",
                "name": SECRET_PROPERTY,
                "type": "secret",
                "description": (
                    "Pointer to the repository's staged environment files on the "
                    "cloud computer. Never holds a value."
                ),
            }])
        except RuntimeError as error:
            # A stale discovery cache can hide a property the previous run
            # already added; existing is the state this script wants.
            if "already exists" not in str(error):
                raise
    elif secret_prop.get("type") != "secret":
        alter_schema(database_id, [{
            "action": "update",
            "property_id": secret_prop.get("id"),
            "name": SECRET_PROPERTY,
            "type": "secret",
        }])

    # The read side may lag the write behind a discovery cache; give it a few
    # rounds before concluding the server degraded the kind.
    secret_prop = None
    for attempt in range(6):
        detail = get_database_detail(DATABASE_SLUG)
        secret_prop = property_by_name(detail, SECRET_PROPERTY)
        if secret_prop and secret_prop.get("type") == "secret":
            break
        time.sleep(min(30, 2 ** (attempt + 1)))
    if not secret_prop or secret_prop.get("type") != "secret":
        print(
            f"Could not make '{SECRET_PROPERTY}' a secret property (server degraded the "
            "kind?); leaving legacy fields in place.",
            file=sys.stderr,
        )
        return 1

    folded = 0
    removed: List[str] = []
    if legacy_present:
        for row in list_rows(database_id):
            if fold_row(database_id, row):
                folded += 1
        # Removing a property discards its stored values, so it only happens
        # once a re-read proves no row still carries unfolded legacy values —
        # a partial fold leaves the legacy fields in place for the next run.
        remaining = [row for row in list_rows(database_id) if row_has_unfolded_legacy(row)]
        if remaining:
            print(
                f"{len(remaining)} row(s) still carry unfolded legacy secrets fields; "
                "keeping the legacy properties for the next run.",
                file=sys.stderr,
            )
            return 1
        alter_schema(
            database_id,
            [
                {"action": "remove", "property_id": property_by_name(detail, name).get("id"), "name": name}
                for name in legacy_present
            ],
        )
        removed = legacy_present

    print(
        f"'{SECRET_PROPERTY}' is a secret property; folded {folded} row(s); "
        f"removed legacy properties: {', '.join(removed) or 'none'}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
