import assert from 'node:assert/strict';
import test from 'node:test';
import {dailyMealSummaries,onTargetDays,chartCalories,groupMeals,totalsForMeals,type Meal} from './calories-core';
const meal=(date:string,calories:number)=>({id:date,title:'Synthetic meal',date,calories,protein:87,carbs:271,fat:62} as Meal);
test('three logged days in one month remain three daily observations in a year',()=>{
 const meals=[meal('2026-09-20T12:00:00',2030),meal('2026-09-21T12:00:00',2030),meal('2026-09-22T12:00:00',2030)];
 assert.equal(dailyMealSummaries(meals).length,3);
 assert.equal(totalsForMeals(meals).calories/dailyMealSummaries(meals).length,2030);
 const buckets=groupMeals(meals,new Date(2026,0,1),'year');
 assert.equal(chartCalories(buckets[8],'year'),2030);
 assert.equal(chartCalories(buckets[0],'year'),0);
});
test('over-goal days are not counted as on target by a clamped progress percentage',()=>{
 const days=dailyMealSummaries([meal('2026-09-20',1870),meal('2026-09-21',2200),meal('2026-09-22',2201),meal('2026-09-23',1869)]);
 assert.equal(onTargetDays(days,2200),2);
 assert.equal(onTargetDays(days,0),0);
});
