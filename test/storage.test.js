import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore,validateCareer,validateStats,validateSettings,validateRun,freshRun,SAVE_KEY} from '../src/storage.js';
import {COURSE_VERSION} from '../src/constants.js';
const storage=()=>{const m=new Map();return{getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
const run=()=>({courseVersion:COURSE_VERSION,mode:'career',LV:1,ball:{x:10,y:10,vx:0,vy:0,moving:false,rolling:true,skidU:0},strokes:0,totalVsPar:0,holed:false,completed:false,runScore:0,streakCount:0,runStats:freshRun(),sessionSG:0,puttStart:null});
test('malformed values do not poison saved data',()=>{
  for(const x of [null,[],false,'bad',{}, {ach:null,xp:'3'}, {xp:Infinity}])assert.equal(validateCareer(x).xp,0);
  assert.deepEqual(validateStats({'0–5 ft':[9,1]}),{});
  assert.equal(validateSettings({stimp:100,optSnd:'yes'}).stimp,10);
  assert.equal(validateCareer({xp:0,ball:'gold'}).ball,'white');
});
test('legacy XP migrates and new envelope roundtrips atomically',()=>{
  const s=storage();s.setItem('gr3d-career',JSON.stringify({xp:6000,ach:['bomb','bad']}));
  const store=createStore(s);assert.equal(store.state.career.xp,6000);assert.deepEqual(store.state.career.ach,['bomb']);
  assert.ok(store.save({...store.state,run:run()}));assert.deepEqual(createStore(s).state.run,run());assert.ok(s.getItem(SAVE_KEY));
});
test('missing storage and corrupt JSON recover without throwing',()=>{
  const messages=[];const s=createStore(undefined,m=>messages.push(m));assert.equal(s.save(s.state),false);assert.equal(messages.length,1);
  const mem=storage();mem.setItem(SAVE_KEY,'{oops');assert.equal(createStore(mem).state.run,null);
});
test('run validation rejects skipped competition, nonfinite positions and invalid completion',()=>{
  assert.ok(validateRun(run()));assert.equal(validateRun({...run(),LV:50}),null);
  assert.equal(validateRun({...run(),ball:{...run().ball,x:NaN}}),null);
  assert.equal(validateRun({...run(),completed:true}),null);
});
test('future save versions are preserved instead of overwritten',()=>{
  const s=storage(),raw=JSON.stringify({version:999,career:{xp:100}});s.setItem(SAVE_KEY,raw);
  const store=createStore(s);assert.equal(store.save(store.state),false);assert.equal(s.getItem(SAVE_KEY),raw);
});
