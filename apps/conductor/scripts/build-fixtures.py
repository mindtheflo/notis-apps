#!/usr/bin/env python3
"""Generate metadata/screenshot-fixtures.json.

The verify harness and the screenshot capture both run against canned tool
responses rather than a live account, so the fixture file has to reproduce the
exact wire shape the real database tools return -- Notion-style property
envelopes and all. Hand-writing several hundred lines of that is where mistakes
live, so the rows are declared as plain values here and wrapped once.

    python3 apps/conductor/scripts/build-fixtures.py
"""

from __future__ import annotations

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "metadata" / "screenshot-fixtures.json"

REPOSITORY_TYPES = {
    "Name": "title",
    "Git URL": "url",
    "Owner": "rich_text",
    "Repo": "rich_text",
    "Default branch": "rich_text",
    "Path": "rich_text",
    "Setup command": "rich_text",
    "Dev command": "rich_text",
    "Archive command": "rich_text",
    "Status": "select",
    "Environment files": "secret",
    "Setup verified at": "date",
    "Notes": "rich_text",
}

WORKSPACE_TYPES = {
    "Name": "title",
    "Repository": "relation",
    "Branch": "rich_text",
    "Base": "rich_text",
    "Task": "rich_text",
    "Path": "rich_text",
    "Status": "select",
    "PR state": "select",
    "PR number": "number",
    "PR URL": "url",
    "Checks": "rich_text",
    "Ahead": "number",
    "Dirty files": "number",
    "Thread": "rich_text",
    "Last synced": "date",
    "Notes": "rich_text",
}

REPOSITORIES = [
    {
        "__id": "repo-notis",
        "Name": "notis",
        "Git URL": "https://github.com/mindtheflo/notis",
        "Owner": "mindtheflo",
        "Repo": "notis",
        "Default branch": "beta",
        "Path": "/vercel/sandbox/repositories/notis",
        "Setup command": "./setup.sh",
        "Dev command": "./dev.sh",
        "Archive command": "./archive.sh",
        "Status": "Ready",
        # A secret property: a pointer to where the files are and what state
        # they are in, never a value. There is no field here that could hold
        # one.
        "Environment files": {
            "reference": "/vercel/sandbox/.notis/workspaces/secrets/notis",
            "status": "Verified",
            "files": ["electron/.env", "portal/.env", "server/.env", "website/.env"],
        },
        "Setup verified at": "2026-08-15T18:40:00Z",
        "Notes": None,
    },
    {
        "__id": "repo-website",
        "Name": "notis-website",
        "Git URL": "https://github.com/mindtheflo/notis-website",
        "Owner": "mindtheflo",
        "Repo": "notis-website",
        "Default branch": "main",
        "Path": "/vercel/sandbox/repositories/notis-website",
        "Setup command": "npm install",
        "Dev command": "npm run dev",
        "Archive command": None,
        "Status": "Configuring",
        "Environment files": {
            "reference": "/vercel/sandbox/.notis/workspaces/secrets/notis-website",
            "status": "Staged",
            "files": [".env.local"],
        },
        "Setup verified at": None,
        "Notes": None,
    },
]

WORKSPACES = [
    {
        "__id": "ws-reminders",
        "Name": "fix-duplicate-reminders-on-lapsed-accounts",
        "Repository": ["repo-notis"],
        "Branch": "notis/fix-duplicate-reminders-on-lapsed-accounts",
        "Base": "beta",
        "Task": "Fix duplicate reminders firing for lapsed accounts after the paywall wind-down.",
        "Path": "/vercel/sandbox/workspaces/notis/fix-duplicate-reminders-on-lapsed-accounts",
        "Status": "Working",
        "PR state": "Open",
        "PR number": 1873,
        "PR URL": "https://github.com/mindtheflo/notis/pull/1873",
        "Checks": "3 success, 1 pending",
        "Ahead": 4,
        "Dirty files": 0,
        "Thread": None,
        "Last synced": "2026-08-15T18:52:00Z",
        "Notes": None,
    },
    {
        "__id": "ws-slack",
        "Name": "review-the-slack-retry-patch",
        "Repository": ["repo-notis"],
        "Branch": "notis/review-the-slack-retry-patch",
        "Base": "pull request #1829",
        "Task": "Review the Slack retry patch and add a regression test for the gating path.",
        "Path": "/vercel/sandbox/workspaces/notis/review-the-slack-retry-patch",
        "Status": "Working",
        "PR state": "Draft",
        "PR number": 1876,
        "PR URL": "https://github.com/mindtheflo/notis/pull/1876",
        "Checks": "1 pending",
        "Ahead": 1,
        "Dirty files": 3,
        "Thread": None,
        "Last synced": "2026-08-15T18:31:00Z",
        "Notes": None,
    },
    {
        "__id": "ws-kpis",
        "Name": "weekly-report-kpi-trends",
        "Repository": ["repo-notis"],
        "Branch": "notis/weekly-report-kpi-trends",
        "Base": "beta",
        "Task": "Add conversation-first KPI trends to the weekly report.",
        "Path": "/vercel/sandbox/workspaces/notis/weekly-report-kpi-trends",
        "Status": "Ready",
        "PR state": "None",
        "PR number": None,
        "PR URL": None,
        "Checks": None,
        "Ahead": 0,
        "Dirty files": 0,
        "Thread": None,
        "Last synced": "2026-08-15T17:05:00Z",
        "Notes": None,
    },
    {
        "__id": "ws-egress",
        "Name": "egress-proxy-transport-notes",
        "Repository": ["repo-notis"],
        "Branch": "notis/egress-proxy-transport-notes",
        "Base": "beta",
        "Task": "Record why chisel replaced wstunnel for the sandbox egress relay.",
        "Path": "/vercel/sandbox/workspaces/notis/egress-proxy-transport-notes",
        "Status": "Archived",
        "PR state": "Merged",
        "PR number": 1868,
        "PR URL": "https://github.com/mindtheflo/notis/pull/1868",
        "Checks": "5 success",
        "Ahead": 0,
        "Dirty files": 0,
        "Thread": None,
        "Last synced": "2026-08-15T12:10:00Z",
        "Notes": None,
    },
    {
        "__id": "ws-site",
        "Name": "pricing-page-copy-pass",
        "Repository": ["repo-website"],
        "Branch": "notis/pricing-page-copy-pass",
        "Base": "main",
        "Task": "Shorten the pricing hero to one sentence.",
        "Path": "/vercel/sandbox/workspaces/notis-website/pricing-page-copy-pass",
        "Status": "Setting up",
        "PR state": "None",
        "PR number": None,
        "PR URL": None,
        "Checks": None,
        "Ahead": 0,
        "Dirty files": 0,
        "Thread": None,
        "Last synced": "2026-08-15T18:58:00Z",
        "Notes": None,
    },
]


def wrap(kind: str, value):
    """Wrap a plain value in the property envelope the tools actually return."""
    if value is None:
        if kind == "secret":
            return {
                "type": "secret",
                "present": False,
                "reference": None,
                "status": None,
                "metadata": None,
            }
        return {"type": kind, kind: None}
    if kind in ("title", "rich_text"):
        return {
            "type": kind,
            kind: [{"type": "text", "text": {"content": str(value)}}],
        }
    if kind == "select":
        return {"type": "select", "select": {"id": f"opt-{value}", "name": value}}
    if kind == "relation":
        return {"type": "relation", "relation": [{"id": item} for item in value]}
    if kind == "date":
        return {"type": "date", "date": {"start": value, "end": None}}
    if kind == "secret":
        # The redacted stub the read path builds: never nested under a `secret`
        # key, and never carrying anything but the pointer.
        return {
            "type": "secret",
            "present": True,
            "reference": value["reference"],
            "status": value["status"],
            "metadata": {"files": value["files"]},
        }
    return {"type": kind, kind: value}


def document(row: dict, types: dict) -> dict:
    return {
        "id": row["__id"],
        "title": row["Name"],
        "url": None,
        "properties": {
            name: wrap(kind, row.get(name)) for name, kind in types.items()
        },
    }


def main() -> int:
    fixtures = {
        # Keyed by slug: `useDatabaseSubscription` addresses a database by slug
        # and never looks its id up first, so a key scoped to an id would match
        # nothing and every route would render its empty state.
        "tools": {
            "LOCAL_NOTIS_DATABASE_QUERY#database_slug=repositories": {
                "status": "success",
                "documents": [document(row, REPOSITORY_TYPES) for row in REPOSITORIES],
                "has_more": False,
            },
            "LOCAL_NOTIS_DATABASE_QUERY#database_slug=workspaces": {
                "status": "success",
                "documents": [document(row, WORKSPACE_TYPES) for row in WORKSPACES],
                "has_more": False,
            },
            # The GitHub control checks `gh auth status` on mount. Without a
            # canned answer every captured screenshot shows its error state.
            "LOCAL_NOTIS_RUN_SANDBOX_SHELL": {
                "status": "success",
                "exit_code": 0,
                "stdout": json.dumps({"logged_in": True, "account": "mindtheflo"}),
                "stderr": "",
            },
        },
        "requests": {},
        "scenarios": {
            # A scenario's `tools` override the file-level ones key by key, so
            # this one only has to blank the two queries the page reads to put
            # the app back into its first-run onboarding state.
            "onboarding-empty": {
                "tools": {
                    # First run means GitHub is not signed in either. Leaving
                    # the file-level "logged in" answer in place would draw a
                    # green line under an unfinished step.
                    "LOCAL_NOTIS_RUN_SANDBOX_SHELL": {
                        "status": "success",
                        "exit_code": 0,
                        "stdout": json.dumps({"logged_in": False, "account": None}),
                        "stderr": "",
                    },
                    "LOCAL_NOTIS_DATABASE_QUERY#database_slug=repositories": {
                        "status": "success",
                        "documents": [],
                        "has_more": False,
                    },
                    "LOCAL_NOTIS_DATABASE_QUERY#database_slug=workspaces": {
                        "status": "success",
                        "documents": [],
                        "has_more": False,
                    },
                }
            },
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fixtures, indent=2) + "\n")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
