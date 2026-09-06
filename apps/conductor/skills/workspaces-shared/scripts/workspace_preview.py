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
            log = target / '.context/preview-start.log'
            with open(log, 'w', opener=lambda path, flags: os.open(path, flags, 0o600)) as file:
                os.chmod(log, 0o600)
                file.write(result.stdout or '')
                file.write(result.stderr or '')
            # Never copy raw shell logs: they can contain env or sign-in URLs.
            raise RuntimeError('Preview startup or external readiness failed. Inspect dev-status and .context/preview-start.log; fix the Dev command and retry prepare.')
        url = preview.run('url', target)
        try:
            github = command('python3', str(HERE / 'preview_github.py'), str(target))
            github_pending = github.returncode != 0
        except (OSError, subprocess.TimeoutExpired):
            github_pending = True
        preview.save(record, {'preview_state': 'ready', 'preview_url': url,
                              'github_state': 'pending_sync' if github_pending else 'synced'})
        print(json.dumps(completion(target)))
        return 0
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        message = str(error) if isinstance(error, RuntimeError) else 'Workspace preparation interrupted; inspect the job and retry prepare.'
        preview.save(record, {'preview_state': 'failed', 'error': message,
                              'retry_command': f'bash {HERE}/workspace.sh prepare {repo} {name}'})
        print(json.dumps(completion(target)))
        return 1


def response(result, repo, name):
    state = result['preview_state']
    complete = state in ('ready', 'failed')
    value = {**result, 'complete': complete, 'user_response': None}
    if state != 'ready':
        value.pop('preview_url', None)
    if state == 'ready':
        url = preview.validate_test_url(result['preview_url'])
        value['user_response'] = f'Workspace {repo}/{name} is ready. [Development preview]({url}) (sign in as the workspace owner).'
        if result.get('github_state') == 'pending_sync':
            value['user_response'] += ' GitHub preview propagation is pending; retry workspace sync.'
    elif state == 'failed':
        value.pop('preview_url', None)
        value['user_response'] = f"Workspace {repo}/{name} was created, but its preview is unavailable. {result.get('error', 'Preparation failed.')}"
    return value


def wait(repo, name, target, timeout=40, require_complete=False):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = completion(target)
        if result['preview_state'] in ('ready', 'failed'):
            print(json.dumps(response(result, repo, name)))
            return 1 if require_complete and result['preview_state'] == 'failed' else 0
        time.sleep(1)
    result = completion(target)
    job = command('bash', str(HERE / 'job.sh'), 'status', f'preview-{repo}-{name}')
    if result['preview_state'] == 'starting' and not job.stdout.startswith('running'):
        result = {'preview_state': 'failed', 'error': 'Preparation job exited without a completion result.',
                  'retry_command': f'bash {HERE}/workspace.sh prepare {repo} {name}'}
        preview.save(target / '.context/workspace-completion.json', result)
    result['next_command'] = f'bash {HERE}/workspace.sh preview-wait {repo} {name}'
    print(json.dumps(response(result, repo, name)))
    if require_complete:
        return 1 if result['preview_state'] == 'failed' else 0 if result['preview_state'] == 'ready' else 2
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'wait', 'reset', 'complete'])
    parser.add_argument('repo')
    parser.add_argument('name')
    parser.add_argument('target', type=Path)
    args = parser.parse_args()
    if args.action == 'reset':
        preview.save(args.target / '.context/workspace-completion.json', {'preview_state': 'starting'})
        raise SystemExit(0)
    if args.action == 'complete':
        raise SystemExit(wait(args.repo, args.name, args.target, require_complete=True))
    raise SystemExit((prepare if args.action == 'prepare' else wait)(args.repo, args.name, args.target))
