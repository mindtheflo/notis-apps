import assert from 'node:assert/strict';
import test from 'node:test';
import {countOpenActionItems,toActionItem} from './meetings';
const item=(id:string,status:string,meeting:string[])=>toActionItem({id,title:id,properties:{Status:status,Meeting:meeting}} as any);
test('live ledger counts change after completion without relying on captured meeting totals',()=>{
 const pending=item('a','PENDING',['m']);const done=item('b','COMPLETED',['m']);
 assert.equal(countOpenActionItems([pending,done]).get('m'),1);
 assert.equal(countOpenActionItems([{...pending,status:'COMPLETED'},done]).get('m')??0,0);
});
test('duplicate relation values do not double count and unlinked items stay uncounted',()=>{
 const counts=countOpenActionItems([item('a','PENDING',['m','m']),item('b','PENDING',[])]);
 assert.deepEqual([...counts],[['m',1]]);
});
