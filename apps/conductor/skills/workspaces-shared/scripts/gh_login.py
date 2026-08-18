#!/usr/bin/env python3
"""Sign the cloud computer's GitHub CLI in without a terminal.

``gh auth login --web`` needs a TTY: it prints a one-time code and then blocks
on Enter. Nothing in a sandbox shell can answer that, so this drives the same
OAuth device flow directly and hands the resulting token to
``gh auth login --with-token``, which is non-interactive.

The client id is the GitHub CLI's own published one, so the grant the user sees
on github.com names the tool they think they are authorising.

    gh_login.py status              is this host already signed in
    gh_login.py start               begin a grant; prints the code to show the user
    gh_login.py poll                finish a pending grant once the user approves
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

GH_CLIENT_ID = "178c6fc778ccc68e1d6a"
SCOPES = "repo read:org workflow gist"

STATE_ROOT = os.environ.get("NOTIS_WORKSPACES_STATE", "/vercel/sandbox/.notis/workspaces")
PENDING_FILE = os.path.join(STATE_ROOT, "cache", "gh-device-grant.json")


def _post(url: str, payload: Dict[str, str]) -> Dict[str, Any]:
    body = urllib.parse.urlencode(payload).encode()
    request = urllib.request.Request(
        url, data=body, headers={"Accept": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def status() -> Dict[str, Any]:
    proc = subprocess.run(
        ["gh", "auth", "status"], capture_output=True, text=True
    )
    logged_in = proc.returncode == 0
    account = None
    if logged_in:
        who = subprocess.run(
            ["gh", "api", "user", "--jq", ".login"], capture_output=True, text=True
        )
        account = (who.stdout or "").strip() or None
    return {
        "logged_in": logged_in,
        "account": account,
        "detail": (proc.stdout or proc.stderr).strip(),
    }


def start() -> Dict[str, Any]:
    current = status()
    if current["logged_in"]:
        return {"already_authenticated": True, **current}

    grant = _post(
        "https://github.com/login/device/code",
        {"client_id": GH_CLIENT_ID, "scope": SCOPES},
    )
    os.makedirs(os.path.dirname(PENDING_FILE), exist_ok=True)
    with open(PENDING_FILE, "w") as handle:
        json.dump({**grant, "created_at": time.time()}, handle)
    os.chmod(PENDING_FILE, 0o600)

    return {
        "already_authenticated": False,
        "user_code": grant["user_code"],
        "verification_uri": grant["verification_uri"],
        "expires_in": grant.get("expires_in"),
        "instructions": (
            f"Open {grant['verification_uri']} and enter the code "
            f"{grant['user_code']}."
        ),
    }


def poll(budget_seconds: int = 240) -> Dict[str, Any]:
    try:
        with open(PENDING_FILE) as handle:
            grant = json.load(handle)
    except (OSError, ValueError):
        return {"status": "no_pending_grant"}

    interval = max(int(grant.get("interval", 5)), 5)
    deadline = time.time() + budget_seconds

    while time.time() < deadline:
        result = _post(
            "https://github.com/login/oauth/access_token",
            {
                "client_id": GH_CLIENT_ID,
                "device_code": grant["device_code"],
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
        )
        token = result.get("access_token")
        if token:
            login = subprocess.run(
                ["gh", "auth", "login", "--with-token"],
                input=token, capture_output=True, text=True,
            )
            if login.returncode != 0:
                return {
                    "status": "token_rejected",
                    "detail": (login.stderr or login.stdout).strip(),
                }
            os.remove(PENDING_FILE)
            # Route git over the same credential so pushes from a worktree do
            # not prompt. The sandbox .gitconfig already points at gh; this
            # makes it explicit and idempotent.
            subprocess.run(
                ["gh", "auth", "setup-git"], capture_output=True, text=True
            )
            return {"status": "authenticated", **status()}

        error = result.get("error")
        if error == "authorization_pending":
            time.sleep(interval)
            continue
        if error == "slow_down":
            interval += 5
            time.sleep(interval)
            continue
        if error in ("expired_token", "access_denied"):
            os.remove(PENDING_FILE)
            return {"status": error, "detail": result.get("error_description")}
        return {"status": "unexpected", "detail": json.dumps(result)}

    return {
        "status": "pending",
        "detail": (
            "The grant has not been approved yet. Show the code again and call "
            "poll once more."
        ),
        "user_code": grant.get("user_code"),
        "verification_uri": grant.get("verification_uri"),
    }


def main(argv: Optional[list] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("action", choices=["status", "start", "poll"])
    parser.add_argument("--budget", type=int, default=240,
                        help="Seconds to keep polling before returning pending")
    args = parser.parse_args(argv)

    if args.action == "status":
        result = status()
    elif args.action == "start":
        result = start()
    else:
        result = poll(args.budget)

    print(json.dumps(result, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
