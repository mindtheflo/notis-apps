import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('reconcile', Path(__file__).with_name('reconcile-preview-source.py'))
reconcile = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reconcile)


class ReconciliationTests(unittest.TestCase):
    def fixture(self, root):
        app, target = root / 'reviewed', root / 'pulled'
        (app / 'report').mkdir(parents=True)
        (target / '.notis').mkdir(parents=True)
        (target / 'first').write_text('v27 first')
        (target / 'second').write_text('v27 second')
        (target / 'newer-feature').write_text('preserve me')
        (target / '.notis/state.json').write_text(json.dumps({'profiles': {'beta': {
            'app_id': 'conductor', 'version': 27, 'expected_updated_at': 'revision-27'}}}))
        files = []
        for name in ['first', 'second']:
            (app / name).write_text('reviewed ' + name)
            files.append({'path': name, 'before_sha256': reconcile.digest(target / name),
                          'after_sha256': reconcile.digest(app / name)})
        (app / 'report/automatic-preview-v27.json').write_text(json.dumps({
            'app_id': 'conductor', 'version': 27, 'expected_updated_at': 'revision-27', 'files': files}))
        return app, target

    def test_applies_only_reviewed_files_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as root:
            app, target = self.fixture(Path(root))
            with patch.object(reconcile, 'APP', app):
                self.assertEqual(reconcile.reconcile(target, check=True)['changed_files'], 2)
                self.assertEqual((target / 'first').read_text(), 'v27 first')
                self.assertEqual(reconcile.reconcile(target)['changed_files'], 2)
                self.assertEqual(reconcile.reconcile(target)['changed_files'], 0)
                self.assertEqual((target / 'newer-feature').read_text(), 'preserve me')
                self.assertEqual(json.loads((target / '.notis/state.json').read_text())['profiles']['beta']['version'], 27)

    def test_local_edits_reject_entire_plan_before_writing(self):
        with tempfile.TemporaryDirectory() as root:
            app, target = self.fixture(Path(root))
            (target / 'second').write_text('local change')
            with patch.object(reconcile, 'APP', app), self.assertRaisesRegex(ValueError, 'local edits'):
                reconcile.reconcile(target)
            self.assertEqual((target / 'first').read_text(), 'v27 first')
            self.assertEqual((target / 'second').read_text(), 'local change')

    def test_newer_release_requires_fresh_reconciliation(self):
        with tempfile.TemporaryDirectory() as root:
            app, target = self.fixture(Path(root))
            state = target / '.notis/state.json'
            state.write_text(state.read_text().replace('27', '28'))
            with patch.object(reconcile, 'APP', app), self.assertRaisesRegex(ValueError, 'v27'):
                reconcile.reconcile(target)
            self.assertEqual((target / 'first').read_text(), 'v27 first')


if __name__ == '__main__':
    unittest.main()
