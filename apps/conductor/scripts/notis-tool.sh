#!/usr/bin/env bash
#
# Run one Notis tool through the repo-lease CLI and print only the tool's own
# payload. The CLI wraps every result in four layers of envelope (command ->
# data -> results[] -> response -> data), which makes ad-hoc jq unreadable and
# hides errors behind a successful outer envelope.
#
# Usage: scripts/notis-tool.sh TOOL_NAME '<json arguments>'
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TOOL="$1"
# Quoted default: inside ${…:-} an unquoted {\} expands to the literal
# backslash form, which is invalid JSON.
ARGS="${2:-"{}"}"

node "$REPO_ROOT/packages/cli/src/cli.js" tools exec "$TOOL" --arguments "$ARGS" 2>&1 \
  | python3 -c '
import json, sys

raw = sys.stdin.read()
start = raw.find("{")
if start < 0:
    sys.stderr.write(raw)
    raise SystemExit(1)
try:
    envelope = json.loads(raw[start:])
except json.JSONDecodeError:
    sys.stderr.write(raw)
    raise SystemExit(1)


def unwrap(node, depth=0):
    """Walk down to the innermost tool payload."""
    if depth > 8 or not isinstance(node, dict):
        return node
    for key in ("data", "result"):
        if key in node and isinstance(node[key], (dict, list)):
            return unwrap(node[key], depth + 1)
    if "results" in node and node["results"]:
        return unwrap(node["results"][0], depth + 1)
    if "response" in node:
        return unwrap(node["response"], depth + 1)
    return node


payload = unwrap(envelope)
print(json.dumps(payload, indent=2, ensure_ascii=False))
if isinstance(payload, dict) and payload.get("status") == "error":
    raise SystemExit(1)
'
