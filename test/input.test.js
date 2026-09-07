import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSlingshot} from '../src/input.js';
test('only owner moves, releases or cancels; reset releases capture',()=>{
  const handlers={},captured=new Set();let released=0,moved=0,cancelled=0;
  const canvas={addEventListener:(n,f)=>handlers[n]=f,setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)};
  const input=bindSlingshot(canvas,{canStart:()=>true,hit:()=>({}),onStart:()=>{},onMove:()=>moved++,onRelease:()=>released++,onCancel:()=>cancelled++});
  const event=id=>({pointerId:id,button:0,stopImmediatePropagation(){}});
  handlers.pointerdown(event(1));handlers.pointerdown(event(2));handlers.pointermove(event(2));handlers.pointerup(event(2));handlers.pointercancel(event(2));
  assert.equal(moved,0);assert.equal(released,0);assert.equal(cancelled,0);
  handlers.pointermove(event(1));handlers.pointerup(event(1));assert.equal(moved,1);assert.equal(released,1);assert.equal(captured.size,0);
  handlers.pointerdown(event(3));input.cancel();assert.equal(captured.size,0);handlers.pointerup(event(3));assert.equal(released,1);
});
