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
REVIEW = '<!-- notis-review -->'


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


def comment(target, body_file):
    """Upsert this flow's one review comment, even before a preview is ready."""
    raw = gh(target, 'pr', 'view', '--json', 'number,state')
    if raw is None:
        raise RuntimeError('No associated pull request.')
    pr = json.loads(raw)
    if pr['state'] != 'OPEN':
        raise RuntimeError('The associated pull request is not open.')
    body = body_file.read_text()
    if REVIEW not in body:
        body += '\n\n' + REVIEW
    try:
        body = merge(body, preview.run('url', target))
    except (OSError, ValueError, KeyError, RuntimeError):
        pass  # The marker lets later sync attach the verified URL.
    pages = json.loads(gh(target, 'api', f'repos/{{owner}}/{{repo}}/issues/{pr["number"]}/comments', '--paginate', '--slurp'))
    viewer = json.loads(gh(target, 'api', 'user'))['login']
    matches = [c for page in pages for c in page if REVIEW in (c.get('body') or '') and c['user']['login'] == viewer]
    if len(matches) > 1:
        raise RuntimeError('Multiple existing review comments; do not create another.')
    if matches and matches[0]['body'] == body:
        return
    route = (f'repos/{{owner}}/{{repo}}/issues/comments/{matches[0]["id"]}' if matches else
             f'repos/{{owner}}/{{repo}}/issues/{pr["number"]}/comments')
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as file:
        json.dump({'body': body}, file)
        file.flush()
        # An uncertain POST is never automatically retried. A subsequent call
        # lists the marked comment first and reuses it if GitHub committed it.
        gh(target, 'api', '--method', 'PATCH' if matches else 'POST', route, '--input', file.name)


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
    candidates = [c for page in pages for c in page
                  if START in (c.get('body') or '') or REVIEW in (c.get('body') or '')]
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
    parser.add_argument('--comment-file', type=Path)
    args = parser.parse_args()
    try:
        if args.comment_file:
            comment(args.target, args.comment_file)
        else:
            sync(args.target, args.body_file)
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        parser.exit(1, 'error: GitHub preview sync failed; retry workspace sync.\n')
