#!/usr/bin/env python3
"""Maintain one preview section without replacing human-authored PR content."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile

import preview

START = '<!-- notis-workspace-preview -->'
END = '<!-- /notis-workspace-preview -->'


def merge(body, url):
    url = preview.validate_test_url(url)
    section = f'{START}\n### Development preview\n\n[Test this workspace]({url}) (sign in as the workspace owner).\n{END}'
    pattern = re.escape(START) + r'.*?' + re.escape(END)
    if re.search(pattern, body, flags=re.S):
        first = True
        def replace(match):
            nonlocal first
            result = section if first else ''
            first = False
            return result
        return re.sub(pattern, replace, body, flags=re.S)
    if START in body or END in body:
        raise RuntimeError('Incomplete preview section; preserve the existing description for manual repair.')
    return body + ('\n\n' if body else '') + section


def gh(target, *args):
    result = subprocess.run(['gh', *args], cwd=target, capture_output=True, text=True, timeout=90)
    if result.returncode:
        if 'no pull requests found' in result.stderr.lower():
            return None
        raise RuntimeError('GitHub preview update unavailable; retry workspace sync.')
    return result.stdout


def sync(target, body_file=None):
    try:
        url = preview.run('url', target)
    except (OSError, ValueError, KeyError, RuntimeError):
        return  # Never publish an unverified link.
    if body_file:
        body_file.write_text(merge(body_file.read_text(), url))
        return
    raw = gh(target, 'pr', 'view', '--json', 'number,state,body')
    if raw is None:
        return
    pr = json.loads(raw)
    if pr['state'] != 'OPEN':
        return
    body = pr.get('body') or ''
    updated = merge(body, url)
    if updated != body:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.md') as file:
            file.write(updated)
            file.flush()
            gh(target, 'pr', 'edit', str(pr['number']), '--body-file', file.name)
    # Only maintain already-associated, explicitly marked comments authored by
    # this GitHub identity. No new comments and no unrelated comment edits.
    comments = gh(target, 'api', f'repos/{{owner}}/{{repo}}/issues/{pr["number"]}/comments', '--paginate', '--slurp')
    pages = json.loads(comments or '[]')
    candidates = [c for page in pages for c in page if START in (c.get('body') or '')]
    if not candidates:
        return
    viewer = json.loads(gh(target, 'api', 'user'))['login']
    for comment in candidates:
        if comment['user']['login'] != viewer:
            continue
        updated = merge(comment['body'], url)
        if updated != comment['body']:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as file:
                json.dump({'body': updated}, file)
                file.flush()
                gh(target, 'api', '--method', 'PATCH', f'repos/{{owner}}/{{repo}}/issues/comments/{comment["id"]}', '--input', file.name)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('target', type=Path)
    parser.add_argument('--body-file', type=Path)
    args = parser.parse_args()
    try:
        sync(args.target, args.body_file)
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        parser.exit(1, 'error: GitHub preview sync failed; retry workspace sync.\n')
