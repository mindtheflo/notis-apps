import test from 'node:test';
import assert from 'node:assert/strict';
import { skillDetailsFromList } from './skills-api';

test('list response keeps readable skills and drops deleted rows', () => {
  const skills = skillDetailsFromList({
    status: 'success',
    installed_skills: [
      { id: 'active', name: 'Active', status: 'active', skill_md: '# Active' },
      { id: 'disabled', name: 'Disabled', status: 'disabled', skill_md: '# Disabled' },
      { id: 'deleted', name: 'Deleted', status: 'deleted', skill_md: '# Deleted' },
    ],
  });

  assert.deepEqual(skills.map((skill) => skill.id), ['active', 'disabled']);
  assert.equal(skills[0].skill_md, '# Active');
});

test('list response surfaces tool errors', () => {
  assert.throws(
    () => skillDetailsFromList({ status: 'error', message: 'Tool unavailable' }),
    /Tool unavailable/,
  );
});
