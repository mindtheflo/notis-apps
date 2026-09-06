import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
import preview
import preview_github as github
import workspace_preview as workflow

ID = '00000000-0000-4000-8000-000000000001'
URL = 'https://beta.notis.ai/sandbox-preview/' + ID
READY = {'id': ID, 'url': URL, 'state': 'ready', 'target_url': 'https://owned.vercel.run/?token=private'}


class ReadinessTests(unittest.TestCase):
    def test_starting_uses_heartbeat_then_persists_verified_link(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root)
            with patch.object(preview, 'discover', return_value='tool'), patch.object(preview, 'execute', side_effect=[
                {'id': ID, 'url': URL}, {'id': ID, 'url': URL, 'state': 'starting'}, READY
            ]) as execute, patch.object(preview.time, 'sleep'), patch.object(preview, 'verify_route', return_value=True):
                self.assertEqual(preview.run('open', target, 'npm run dev'), URL)
                self.assertEqual(execute.call_args_list[-1].args[1]['action'], 'heartbeat')
            saved = (target / '.context/notis-preview.json').read_text()
            self.assertNotIn('private', saved)
            self.assertIn('verified_at', saved)
            self.assertEqual(preview.run('url', target), URL)

    def test_failed_and_timeout_do_not_replay_or_publish_url(self):
        for state in ['failed', 'starting']:
            with self.subTest(state=state), patch.object(preview, 'execute') as execute:
                with self.assertRaises(RuntimeError):
                    preview.wait_ready('tool', {**READY, 'state': state}, timeout=0)
                execute.assert_not_called()

    def test_unverified_cached_link_is_not_usable(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root)
            preview.save(target / '.context/notis-preview.json', {'id': ID, 'url': URL})
            with self.assertRaises(RuntimeError):
                preview.run('url', target)

    def test_external_probe_discards_secret_and_does_not_follow_redirect(self):
        with patch.object(preview.urllib.request, 'build_opener') as build:
            build.return_value.open.return_value.__enter__.return_value.status = 200
            self.assertTrue(preview.verify_route(READY))
            build.return_value.open.assert_called_once_with('https://owned.vercel.run/', timeout=10)
            self.assertEqual(build.call_args.args[0], preview.NoRedirect)
        for target in ['http://localhost:3000', 'https://evil.example', 'https://user:pass@owned.vercel.run']:
            with self.assertRaises(RuntimeError):
                preview.verify_route({**READY, 'target_url': target})


class GithubTests(unittest.TestCase):
    def test_body_preserved_and_repeated_updates_identical(self):
        original = 'Fix login.\n\n- [ ] review\nLiteral `$(secret)` stays literal.'
        updated = github.merge(original, URL)
        self.assertTrue(updated.startswith(original))
        self.assertEqual(updated, github.merge(updated, URL))
        self.assertEqual(updated.count(github.START), 1)
        doubled = updated + '\n' + updated[updated.index(github.START):]
        self.assertEqual(github.merge(doubled, URL).count(github.START), 1)

    def test_rejects_secret_local_and_malformed_links(self):
        for url in [URL + '?token=secret', 'http://localhost:3000', 'https://beta.notis.ai/elsewhere']:
            with self.assertRaises(ValueError):
                github.merge('body', url)

    def test_later_pr_and_only_own_marked_comments_updated(self):
        old_url = URL.replace('000000000001', '000000000002')
        old = github.merge('Original comment', old_url)
        calls = []
        def gh(target, *args):
            calls.append(args)
            if args[:2] == ('pr', 'view'):
                return json.dumps({'number': 3, 'state': 'OPEN', 'body': 'Human PR text'})
            if '--slurp' in args:
                return json.dumps([[{'id': 7, 'body': old, 'user': {'login': 'me'}},
                                    {'id': 8, 'body': old, 'user': {'login': 'other'}},
                                    {'id': 9, 'body': 'Unrelated', 'user': {'login': 'me'}}]])
            if args == ('api', 'user'):
                return '{"login":"me"}'
            file = Path(args[-1])
            self.assertIn(URL, file.read_text())
            return ''
        with patch.object(preview, 'run', return_value=URL), patch.object(github, 'gh', side_effect=gh):
            github.sync(Path('/tmp'))
        edits = [c for c in calls if 'edit' in c or 'PATCH' in c]
        self.assertEqual(len(edits), 2)
        self.assertIn('repos/{owner}/{repo}/issues/comments/7', edits[-1])

    def test_no_pr_or_unverified_link_causes_no_write(self):
        with patch.object(preview, 'run', return_value=URL), patch.object(github, 'gh', return_value=None) as gh:
            github.sync(Path('/tmp'))
            self.assertEqual(gh.call_count, 1)
        with patch.object(preview, 'run', side_effect=RuntimeError), patch.object(github, 'gh') as gh:
            github.sync(Path('/tmp'))
            gh.assert_not_called()


class PreparationTests(unittest.TestCase):
    def test_setup_failure_persisted_and_dev_never_started(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root)
            with patch.object(workflow, 'STATE', target / 'state'), patch.object(workflow, 'command', return_value=subprocess.CompletedProcess([], 1)) as run, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(workflow.prepare('repo', 'task', target), 1)
                self.assertFalse(any('dev' in call.args for call in run.call_args_list))
                result = workflow.completion(target)
                self.assertEqual(result['preview_state'], 'failed')
                self.assertNotIn('preview_url', result)
                self.assertIn('prepare repo task', result['retry_command'])

    def test_running_setup_joined_success_in_response_and_retry_skips_setup(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root)
            output = io.StringIO()
            with patch.object(workflow, 'STATE', target / 'state'), patch.object(workflow, 'command', return_value=subprocess.CompletedProcess([], 0)) as run, patch.object(preview, 'run', return_value=URL), contextlib.redirect_stdout(output):
                self.assertEqual(workflow.prepare('repo', 'task', target), 0)
                self.assertFalse(any('setup' in call.args for call in run.call_args_list))
                self.assertTrue(any('dev' in call.args for call in run.call_args_list))
                self.assertEqual(json.loads(output.getvalue())['preview_url'], URL)
                self.assertEqual(workflow.completion(target)['preview_url'], URL)

    def test_dev_failure_has_no_success_url(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root)
            def run(*args, **kwargs):
                return subprocess.CompletedProcess([], 1 if 'dev' in args else 0)
            with patch.object(workflow, 'STATE', target / 'state'), patch.object(workflow, 'command', side_effect=run), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(workflow.prepare('repo', 'task', target), 1)
                self.assertNotIn('preview_url', workflow.completion(target))


if __name__ == '__main__':
    unittest.main()
