#!/usr/bin/env python3
"""Apply only the reviewed preview files to an exact pulled Conductor v27.

This is local source reconciliation, never app deployment. Every changed file
must match its recorded v27 preimage or the already-applied reviewed content.
Unrelated source, SDK, package version, app link and runtime data are untouched.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import tempfile
import os

APP = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def reconcile(target, check=False):
    target = target.resolve(strict=True)
    manifest = json.loads((APP / 'report/automatic-preview-v27.json').read_text())
    state = json.loads((target / '.notis/state.json').read_text())
    links = [v for v in state.get('profiles', {}).values() if v.get('app_id') == manifest['app_id']]
    if len(links) != 1 or links[0].get('version') != manifest['version'] or links[0].get('expected_updated_at') != manifest['expected_updated_at']:
        raise ValueError('Expected the recorded Conductor v27 app link; pull/reconcile a newer release separately.')
    plan = []
    for item in manifest['files']:
        source, destination = APP / item['path'], target / item['path']
        if not destination.resolve().is_relative_to(target) or destination.is_symlink():
            raise ValueError('Refusing a source path outside the pulled app.')
        reviewed = digest(source)
        if reviewed != item['after_sha256']:
            raise ValueError('Reviewed source changed; regenerate the compatibility manifest first.')
        actual = digest(destination)
        if actual not in (item['before_sha256'], reviewed):
            raise ValueError(f'Preserving unexpected local edits: {item["path"]}')
        if actual != reviewed:
            plan.append((source, destination))
    # Validate every preimage before writing anything; a mismatched file never
    # leaves a partly-reconciled checkout behind.
    if not check:
        for source, destination in plan:
            destination.parent.mkdir(parents=True, exist_ok=True)
            fd, temporary = tempfile.mkstemp(dir=destination.parent)
            try:
                with os.fdopen(fd, 'wb') as file:
                    file.write(source.read_bytes())
                os.chmod(temporary, source.stat().st_mode & 0o777)
                os.replace(temporary, destination)
            finally:
                Path(temporary).unlink(missing_ok=True)
    return {'app_id': manifest['app_id'], 'version': manifest['version'],
            'changed_files': len(plan), 'check_only': check, 'deployed': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    try:
        print(json.dumps(reconcile(args.target, args.check)))
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, f'{error}\n')
