import test from 'node:test';
import assert from 'node:assert/strict';
import {createHaptics} from '../src/haptics.js';

test('native strike and cup feedback load once and use distinct events',async()=>{
  const calls=[];let loads=0;
  const haptics=createHaptics(()=>true,{isNative:()=>true,load:()=>{
    loads++;
    return {Haptics:{impact:value=>calls.push(value),notification:value=>calls.push(value)},
      ImpactStyle:{Light:'LIGHT'},NotificationType:{Success:'SUCCESS'}};
  }});
  await haptics.strike();await haptics.drop();
  assert.equal(loads,1);
  assert.deepEqual(calls,[{style:'LIGHT'},{type:'SUCCESS'}]);
});
test('web and disabled haptics do not load the native bridge',async()=>{
  let loads=0;
  const load=()=>{loads++;};
  await createHaptics(()=>true,{isNative:()=>false,load}).strike();
  await createHaptics(()=>false,{isNative:()=>true,load}).drop();
  assert.equal(loads,0);
});
test('disabling feedback while the bridge loads cancels the pending vibration',async()=>{
  let enabled=true,resolve,calls=0;
  const haptics=createHaptics(()=>enabled,{isNative:()=>true,load:()=>new Promise(done=>{resolve=done;})});
  const pending=haptics.strike();enabled=false;
  resolve({Haptics:{impact:()=>calls++},ImpactStyle:{Light:'LIGHT'}});
  await pending;assert.equal(calls,0);
});
test('unavailable native feedback never interrupts gameplay',async()=>{
  await createHaptics(()=>true,{isNative:()=>true,load:()=>Promise.reject(new Error('Unavailable'))}).drop();
  await createHaptics(()=>true,{isNative:()=>true,load:()=>{throw new Error('Unavailable');}}).strike();
  await createHaptics(()=>true,{isNative:()=>true,load:()=>({Haptics:{impact:()=>Promise.reject(new Error('Unsupported'))},ImpactStyle:{Light:'LIGHT'}})}).strike();
});
