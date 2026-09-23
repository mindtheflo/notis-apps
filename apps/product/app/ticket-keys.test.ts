import assert from 'node:assert/strict';
import test from 'node:test';
import {nextTicketKey} from './product';
test('preserves the installer ticket prefix',()=>assert.equal(nextTicketKey([{key:'LUM-101'},{key:'LUM-106'}]),'LUM-107'));
test('empty and malformed datasets use a neutral prefix',()=>{assert.equal(nextTicketKey([]),'TASK-1');assert.equal(nextTicketKey([{key:'not a key'}]),'TASK-1');});
test('minority imported prefixes do not change the current convention',()=>assert.equal(nextTicketKey([{key:'LUM-2'},{key:'LUM-8'},{key:'EXT-999'}]),'LUM-9'));
