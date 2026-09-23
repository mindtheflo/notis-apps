"""Every row operation used to re-derive which database it was talking to.

Resolution costs two platform round trips (list the databases, then list the
installed apps to break the slug tie), and `remove` does two row operations, so
archiving one workspace paid six round trips to do two things. That is what made
bulk archive look frozen. These tests pin the cost down at the seam every read
and write goes through.
"""

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))

DATABASE_ID = '00000000-0000-4000-8000-0000000000aa'
OTHER_ID = '00000000-0000-4000-8000-0000000000bb'
APP_ID = '00000000-0000-4000-8000-0000000000cc'


def load(state_root):
    """A fresh import, the way each `notis_rows.py` invocation starts."""
    spec = importlib.util.spec_from_file_location('notis_rows', SCRIPTS / 'notis_rows.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.STATE_ROOT = Path(state_root)
    module.CURRENT_APP_ID = APP_ID
    return module


class Platform:
    """A stand-in for the CLI that records what each row operation asked for."""

    def __init__(self, *, database_id=DATABASE_ID):
        self.calls = []
        self.database_id = database_id
        self.rejected = []

    def tool_exec(self, tool, arguments, **_):
        self.calls.append((tool, arguments))
        if tool == 'LOCAL_NOTIS_DATABASE_LIST_DATABASES':
            return {'databases': [
                {'id': self.database_id, 'slug': 'workspaces', 'owner_app_id': APP_ID},
                {'id': OTHER_ID, 'slug': 'workspaces', 'owner_app_id': 'another-app'},
            ]}
        requested = arguments.get('database_id')
        if requested in self.rejected:
            raise RuntimeError(f'{tool}: Database not found')
        return {'documents': [], 'database_id': requested}

    def counted(self, tool):
        return sum(1 for name, _ in self.calls if name == tool)


class DatabaseResolutionTests(unittest.TestCase):
    def test_repeat_row_operations_resolve_the_database_once(self):
        platform = Platform()
        with tempfile.TemporaryDirectory() as root:
            rows = load(root)
            with patch.object(rows, 'tool_exec', platform.tool_exec), \
                    patch.object(rows, '_installed_app_id', return_value=APP_ID):
                rows.call_for_database('LOCAL_NOTIS_DATABASE_QUERY', 'workspaces', {})
                rows.call_for_database('LOCAL_NOTIS_DATABASE_UPSERT_ROW', 'workspaces', {})

        self.assertEqual(platform.counted('LOCAL_NOTIS_DATABASE_LIST_DATABASES'), 1)
        self.assertEqual(
            [arguments['database_id'] for _, arguments in platform.calls
             if _ != 'LOCAL_NOTIS_DATABASE_LIST_DATABASES'],
            [DATABASE_ID, DATABASE_ID],
        )

    def test_a_later_invocation_reuses_the_recorded_database(self):
        with tempfile.TemporaryDirectory() as root:
            first = Platform()
            rows = load(root)
            with patch.object(rows, 'tool_exec', first.tool_exec), \
                    patch.object(rows, '_installed_app_id', return_value=APP_ID):
                rows.call_for_database('LOCAL_NOTIS_DATABASE_QUERY', 'workspaces', {})

            second = Platform()
            rows = load(root)
            with patch.object(rows, 'tool_exec', second.tool_exec), \
                    patch.object(rows, '_installed_app_id',
                                 side_effect=AssertionError('resolved again')):
                rows.call_for_database('LOCAL_NOTIS_DATABASE_QUERY', 'workspaces', {})

        self.assertEqual(second.counted('LOCAL_NOTIS_DATABASE_LIST_DATABASES'), 0)
        self.assertEqual(second.calls[0][1]['database_id'], DATABASE_ID)

    def test_a_database_the_platform_no_longer_knows_is_resolved_again(self):
        """A reinstall changes the id. A cache that cannot heal is worse than none."""
        with tempfile.TemporaryDirectory() as root:
            (Path(root) / APP_ID).mkdir(parents=True, exist_ok=True)
            (Path(root) / APP_ID / 'databases.json').write_text(json.dumps({'workspaces': OTHER_ID}))
            platform = Platform()
            platform.rejected = [OTHER_ID]
            rows = load(root)
            with patch.object(rows, 'tool_exec', platform.tool_exec), \
                    patch.object(rows, '_installed_app_id', return_value=APP_ID):
                result = rows.call_for_database('LOCAL_NOTIS_DATABASE_QUERY', 'workspaces', {})

            self.assertEqual(result['database_id'], DATABASE_ID)
            self.assertEqual(
                json.loads((Path(root) / APP_ID / 'databases.json').read_text())['workspaces'],
                DATABASE_ID,
            )


if __name__ == '__main__':
    unittest.main()
