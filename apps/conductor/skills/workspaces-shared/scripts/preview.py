#!/usr/bin/env python3
"""Durable owner-only dev links. No credentials are stored in the workspace."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import subprocess
import uuid
import re
import time
from datetime import datetime, timezone
import urllib.request
import urllib.error
from urllib.parse import urlsplit

from notis_rows import _cli_argv, _unwrap, NEUTRAL_CWD
def validate_test_url(value):
    if not isinstance(value, str) or re.search(r"\s", value):
        raise ValueError('Expected an owner-authenticated preview URL')
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or parsed.netloc not in {'app.notis.ai', 'beta.notis.ai'} or parsed.query or parsed.fragment:
        raise ValueError('Expected an owner-authenticated preview URL')
    if not re.fullmatch(r'/sandbox-preview/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', parsed.path, re.I):
        raise ValueError('Expected an owner-authenticated preview URL')
    return value


def cli(*args):
    result = subprocess.run(_cli_argv()+list(args), capture_output=True, text=True,
                            timeout=180, cwd=NEUTRAL_CWD if os.path.isdir(NEUTRAL_CWD) else None)
    raw = result.stdout
    start = raw.find('{')
    if result.returncode != 0 or start < 0:
        raise RuntimeError('Preview service is unavailable; no dev command was replayed.')
    envelope = json.loads(raw[start:])
    if envelope.get('ok') is False:
        raise RuntimeError('Preview request was rejected.')
    return _unwrap(envelope)


def discover():
    found = cli('tools','search','Register, open, inspect or stop an owner-authenticated wakeable Cloud Computer dev preview','--timeout-ms','90000')
    def names(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key in {'name','tool_name','tool_slug'} and isinstance(item,str): yield item
                if key in {'primary_tool_slugs','related_tool_slugs'} and isinstance(item,list):
                    yield from (name for name in item if isinstance(name,str))
                yield from names(item)
        elif isinstance(value, list):
            for item in value: yield from names(item)
    matches = {name for name in names(found) if name == 'LOCAL_NOTIS_SANDBOX_PREVIEW'}
    if len(matches) != 1:
        raise RuntimeError('Wakeable previews are not available on this Notis environment yet.')
    return matches.pop()


def execute(tool, args):
    params = ['tools','exec',tool,'--timeout-ms','90000','--arguments',json.dumps(args)]
    if args['action'] != 'status': cli(*params,'--dry-run')
    result = cli(*params)
    if not isinstance(result,dict) or not result.get('id') or not result.get('url'):
        raise RuntimeError('Preview request returned no durable identity.')
    uuid.UUID(result['id'])
    validate_test_url(result['url'])
    return result


def save(record, value):
    record.parent.mkdir(parents=True, exist_ok=True)
    temporary = record.with_suffix('.tmp.' + uuid.uuid4().hex)
    temporary.write_text(json.dumps(value) + '\n')
    temporary.chmod(0o600)
    temporary.replace(record)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def verify_route(result):
    # Probe the provider route, never consume the Portal's one-time sign-in
    # artifact or copy its query/fragment into logs, persistence or GitHub.
    parsed = urlsplit(result.get('target_url', ''))
    if (parsed.scheme != 'https' or not (parsed.hostname or '').endswith('.vercel.run')
            or parsed.username or parsed.password or parsed.port):
        raise RuntimeError('Preview has no verifiable external route.')
    url = 'https://' + parsed.hostname + '/'
    opener = urllib.request.build_opener(NoRedirect, urllib.request.ProxyHandler({}))
    try:
        with opener.open(url, timeout=10) as response:
            code = response.status
    except urllib.error.HTTPError as error:
        code = error.code
    except (OSError, urllib.error.URLError):
        return False
    return 200 <= code < 400 or code in (401, 403)


def wait_ready(tool, result, timeout=300):
    deadline = time.monotonic() + timeout
    while True:
        if result.get('state') in ('failed', 'stopped'):
            raise RuntimeError('Dev server stopped before readiness. Fix its saved command and retry workspace prepare.')
        if result.get('state') == 'ready' and verify_route(result):
            return result
        if time.monotonic() >= deadline:
            raise RuntimeError('Preview readiness timed out. Inspect dev-status before retrying; no command was replayed.')
        time.sleep(min(3, max(0, deadline - time.monotonic())))
        # Status is deliberately read-only and does not probe the process.
        # Heartbeats refresh readiness without restarting a failed process.
        result = execute(tool, {'action': 'heartbeat', 'preview_id': result['id']})


def run(action, target, command=None, entry_artifact=False):
    record = target / '.context/notis-preview.json'
    if action == 'url':
        saved = json.loads(record.read_text())
        if not saved.get('verified_at'):
            raise RuntimeError('Preview has not passed external readiness verification.')
        return validate_test_url(saved['url'])
    tool = discover()
    if action == 'open':
        if not command:
            raise ValueError('A saved dev command is required')
        result = execute(tool, {'action': 'register', 'cwd': str(target), 'command': command,
                                'path': '/', 'entry_artifact': entry_artifact})
        saved = {'id': result['id'], 'url': result['url']}
        save(record, saved)
        # Registration is idempotent by workspace. Save identity before open;
        # a lost response must not lose the identity or trigger another launch.
        result = execute(tool, {'action': 'open', 'preview_id': result['id']})
        wait_ready(tool, result)
        save(record, {**saved, 'verified_at': datetime.now(timezone.utc).isoformat()})
        return saved['url']
    saved = json.loads(record.read_text())
    result = execute(tool, {'action': action, 'preview_id': str(uuid.UUID(saved['id']))})
    if action == 'stop' and result['state'] != 'stopped':
        raise RuntimeError('A preview request is still finishing. Retry dev-stop shortly.')
    # Do not expose the transient secret-bearing target URL from the service.
    return json.dumps({key: value for key, value in {**result, 'entry_url': result['url']}.items()
                       if key != 'target_url'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action',choices=['open','status','url','stop'])
    parser.add_argument('target',type=Path)
    parser.add_argument('--command')
    parser.add_argument('--entry-artifact', action='store_true')
    args = parser.parse_args()
    try: print(run(args.action,args.target.resolve(),args.command,args.entry_artifact))
    except (ValueError,KeyError,OSError,RuntimeError,subprocess.TimeoutExpired) as error:
        parser.exit(1,f'error: {error}\n')
