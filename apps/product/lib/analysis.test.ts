import test from 'node:test';import assert from 'node:assert/strict';import type {DocumentRecord} from '@notis/sdk';
import {number,scalar,matchingRevision,featureDelta} from './analysis';
const row=(id:string,p:Record<string,unknown>)=>({id,title:id,properties:p} as DocumentRecord);
test('null and wrapped unknown values never become zero',()=>{assert.equal(number(row('a',{'Adopters':null}),'Adopters'),null);assert.equal(number(row('b',{'Adopters':{type:'number',number:0}}),'Adopters'),0);assert.equal(scalar({type:'select',select:{name:'Measured'}}),'Measured');});
test('child records cannot cross result revisions',()=>{const p={'Snapshot key':'r:week','Result digest':'old'};assert.equal(matchingRevision(row('a',p),row('b',{...p,'Result digest':'new'})),false);});
test('adoption delta requires comparable measured evidence; zero prior is not infinity',()=>{const p={Comparable:true,'Measurement status':'Measured',Adopters:3,'Previous adopters':0};assert.equal(featureDelta(row('a',p)),'New adoption');assert.equal(featureDelta(row('a',{...p,'Measurement status':'Proxy'})),'Not comparable');assert.equal(featureDelta(row('a',{...p,Adopters:null})),'Unknown');});
