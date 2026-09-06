#!/usr/bin/env python3
"""Tracked setup/preview completion; workspace creation survives slow installs."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import time

import preview

HERE = Path(__file__).resolve().parent
STATE = Path(os.environ.get('NOTIS_WORKSPACES_STATE', '/vercel/sandbox/.notis/workspaces'))


def command(*args, timeout=180):
    return subprocess.run(list(args), capture_output=True, text=True, timeout=timeout)


def completion(target):
    try:
        return json.loads((target / '.context/workspace-completion.json').read_text())
    except (OSError, ValueError):
        return {'preview_state': 'starting'}


def prepare(repo, name, target):
    record = target / '.context/workspace-completion.json'
    preview.save(record, {'preview_state': 'starting'})
    try:
        # A completed setup can be reused on a preview retry. A running one
        # belongs to job.sh and is joined, never killed/restarted here.
        setup = STATE / 'jobs' / f'setup-{repo}-{name}'
        running = command('bash', str(HERE / 'job.sh'), 'running', f'setup-{repo}-{name}').returncode == 0
        if not running and (not (setup / 'status').exists() or (setup / 'status').read_text().strip() != '0'):
            result = command('bash', str(HERE / 'workspace.sh'), 'setup', repo, name)
            if result.returncode:
                raise RuntimeError('Repository setup could not start. Inspect the saved Setup command and setup job log.')
        result = command('bash', str(HERE / 'job.sh'), 'wait', f'setup-{repo}-{name}', '1200', timeout=1220)
        if result.returncode:
            raise RuntimeError('Repository setup failed or is still running. Inspect the setup job log, then retry prepare.')
        result = command('bash', str(HERE / 'workspace.sh'), 'dev', repo, name, timeout=660)
        if result.returncode:
            # Never copy raw shell logs: they can contain env or sign-in URLs.
            raise RuntimeError('Preview startup or external readiness failed. Inspect dev-status and the private preview job log; fix the Dev command and retry prepare.')
        url = preview.run('url', target)
        preview.save(record, {'preview_state': 'ready', 'preview_url': url})
        github = command('python3', str(HERE / 'preview_github.py'), str(target))
        if github.returncode:
            preview.save(record, {'preview_state': 'ready', 'preview_url': url,
                                  'github_state': 'pending_sync'})
        print(json.dumps(completion(target)))
        return 0
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        message = str(error) if isinstance(error, RuntimeError) else 'Workspace preparation interrupted; inspect the job and retry prepare.'
        preview.save(record, {'preview_state': 'failed', 'error': message,
                              'retry_command': f'bash {HERE}/workspace.sh prepare {repo} {name}'})
        print(json.dumps(completion(target)))
        return 1


def wait(repo, name, target, timeout=40):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = completion(target)
        if result['preview_state'] in ('ready', 'failed'):
            print(json.dumps(result))
            return 0  # The workspace exists even if its preview failed.
        time.sleep(1)
    result = completion(target)
    result['next_command'] = f'bash {HERE}/workspace.sh preview-wait {repo} {name}'
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'wait', 'reset'])
    parser.add_argument('repo')
    parser.add_argument('name')
    parser.add_argument('target', type=Path)
    args = parser.parse_args()
    if args.action == 'reset':
        preview.save(args.target / '.context/workspace-completion.json', {'preview_state': 'starting'})
        raise SystemExit(0)
    raise SystemExit((prepare if args.action == 'prepare' else wait)(args.repo, args.name, args.target))
