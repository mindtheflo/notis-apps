import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS=Path(__file__).parents[1]/'scripts'
sys.path.insert(0,str(SCRIPTS))
spec=importlib.util.spec_from_file_location('preview',SCRIPTS/'preview.py')
preview=importlib.util.module_from_spec(spec);spec.loader.exec_module(preview)
ID='00000000-0000-4000-8000-000000000001'
URL='https://app.notis.ai/sandbox-preview/'+ID

class PreviewTests(unittest.TestCase):
    def test_cached_url_does_not_wake_or_discover(self):
        with tempfile.TemporaryDirectory() as root:
            target=Path(root);(target/'.context').mkdir()
            (target/'.context/notis-preview.json').write_text(json.dumps({'id':ID,'url':URL,'verified_at':'2026-09-06T00:00:00Z'}))
            with patch.object(preview,'discover',side_effect=AssertionError('unexpected network')):
                self.assertEqual(preview.run('url',target),URL)

    def test_unknown_open_outcome_keeps_identity_without_command_replay(self):
        with tempfile.TemporaryDirectory() as root:
            target=Path(root)
            with patch.object(preview,'discover',return_value='discovered-tool'), patch.object(preview,'execute',side_effect=[{'id':ID,'url':URL},RuntimeError('lost response')]) as execute:
                with self.assertRaisesRegex(RuntimeError,'lost response'):
                    preview.run('open',target,'./dev.sh --foreground')
                self.assertEqual(execute.call_count,2)
                self.assertEqual(json.loads((target/'.context/notis-preview.json').read_text()),{'id':ID,'url':URL})
                self.assertEqual((target/'.context/notis-preview.json').stat().st_mode & 0o777,0o600)

    def test_busy_stop_is_not_reported_as_stopped(self):
        with tempfile.TemporaryDirectory() as root:
            target=Path(root);(target/'.context').mkdir()
            (target/'.context/notis-preview.json').write_text(json.dumps({'id':ID,'url':URL}))
            with patch.object(preview,'discover',return_value='discovered-tool'), patch.object(preview,'execute',return_value={'id':ID,'url':URL,'state':'busy'}):
                with self.assertRaisesRegex(RuntimeError,'Retry dev-stop'):preview.run('stop',target)

if __name__=='__main__':unittest.main()
