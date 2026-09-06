"""Real git/workspace/job/setup flow; fake only account API and preview service."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPTS = Path(__file__).parents[1] / 'scripts'
URL = 'https://beta.notis.ai/sandbox-preview/00000000-0000-4000-8000-000000000001'


class ShellFlowTests(unittest.TestCase):
    def test_new_prepares_then_later_pr_receives_one_preview(self):
        with tempfile.TemporaryDirectory() as root:
            root = Path(root)
            scripts = root / 'scripts'
            shutil.copytree(SCRIPTS, scripts, ignore=shutil.ignore_patterns('__pycache__'))
            repo = root / 'repos/demo'
            repo.mkdir(parents=True)
            env = dict(os.environ, NOTIS_WORKSPACES_STATE=str(root / 'state'),
                       NOTIS_REPOS_ROOT=str(root / 'repos'), NOTIS_TREES_ROOT=str(root / 'trees'),
                       NOTIS_ROWS_COMMAND=f'python3 {root}/rows.py',
                       PATH=str(root / 'bin') + ':' + os.environ['PATH'], FIXTURE_ROOT=str(root))
            def run(*args, cwd=None):
                result = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True, timeout=65)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                return result.stdout
            run('git', 'init', '--bare', str(root / 'origin.git'))
            run('git', 'init', '-b', 'main', str(repo))
            run('git', 'config', 'user.name', 'Fixture', cwd=repo)
            run('git', 'config', 'user.email', 'fixture@example.com', cwd=repo)
            (repo / 'README.md').write_text('Fixture')
            run('git', 'add', '.', cwd=repo)
            run('git', 'commit', '-m', 'Fixture', cwd=repo)
            run('git', 'remote', 'add', 'origin', str(root / 'origin.git'), cwd=repo)
            run('git', 'push', '-u', 'origin', 'main', cwd=repo)
            (root / 'rows.py').write_text('''import json,sys
if sys.argv[1]=='get':
 print(json.dumps({'document_id':'repo-id','Default branch':'main','Setup command':'printf ready > setup-proof','Dev command':'serve'}))
else: print('{}')
''')
            # The service boundary is deterministic; run the actual wait_ready
            # helper, persistence, setup orchestration and detached job scripts.
            with (scripts / 'preview.py').open('a') as file:
                file.write('')
            original = (scripts / 'preview.py').read_text()
            injected = f'''
def discover(): return 'fixture-preview'
def execute(tool, args): return {{'id':'00000000-0000-4000-8000-000000000001','url':{URL!r},'state':'ready'}}
def verify_route(result): return True
'''
            (scripts / 'preview.py').write_text(original.replace("if __name__ == '__main__':", injected + "\nif __name__ == '__main__':"))
            (root / 'bin').mkdir()
            gh = root / 'bin/gh'
            gh.write_text('''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
p=Path(os.environ['FIXTURE_ROOT'])/'pr.json';a=sys.argv[1:]
if a[:2]==['pr','view']:
 if not p.exists(): print('no pull requests found',file=sys.stderr);sys.exit(1)
 print(p.read_text())
elif a[:2]==['pr','create']:
 body=Path(a[a.index('--body-file')+1]).read_text()
 p.write_text(json.dumps({'number':1,'url':'https://github.com/fixture/demo/pull/1','state':'OPEN','isDraft':True,'body':body}))
elif a[:2]==['pr','edit']:
 d=json.loads(p.read_text());d['body']=Path(a[a.index('--body-file')+1]).read_text();p.write_text(json.dumps(d))
elif a[0]=='api':print('[[]]')
''')
            gh.chmod(0o755)
            output = run('bash', str(scripts / 'workspace.sh'), 'new', 'demo', '--task', 'automatic preview', '--name', 'task')
            self.assertIn('"preview_state": "ready"', output)
            self.assertIn(URL, output)
            target = root / 'trees/demo/task'
            self.assertEqual((target / 'setup-proof').read_text(), 'ready')
            self.assertTrue((root / 'state/jobs/preview-demo-task/status').exists())
            self.assertNotIn('.context', run('git', 'status', '--porcelain', cwd=target))
            run('git', 'add', 'setup-proof', cwd=target)
            run('git', 'commit', '-m', 'Prepared workspace', cwd=target)
            body = root / 'body.md';body.write_text('Human description\nwith literal `$(echo untouched)`.')
            run('bash', str(scripts / 'workspace.sh'), 'pr', 'demo', 'task', '--draft', '--title', 'Fixture', '--body-file', str(body))
            first = json.loads((root / 'pr.json').read_text())['body']
            run('bash', str(scripts / 'workspace.sh'), 'sync', 'demo', 'task')
            second = json.loads((root / 'pr.json').read_text())['body']
            self.assertEqual(first, second)
            self.assertIn(body.read_text(), second)
            self.assertEqual(second.count(URL), 1)


if __name__ == '__main__':
    unittest.main()
