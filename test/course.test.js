import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLevel,pinIsPlayable} from '../src/course.js';
import {elevOf,gradOf} from '../src/terrain.js';
import {solveBestRoute} from '../src/solver.js';
import {simulate} from '../src/physics.js';
test('all 50 layouts reproduce and stay inside the green',()=>{
  for(let n=1;n<=50;n++){
    const a=makeLevel(n),b=makeLevel(n);assert.deepEqual(a,b);
    for(const p of [a.ball,a.hole]){assert.ok(p.x>.6&&p.x<59.4);assert.ok(p.y>.6&&p.y<39.4);}
    assert.ok(Math.hypot(gradOf(a,a.hole.x,a.hole.y).x,gradOf(a,a.hole.x,a.hole.y).y)<.05);
  }
});
test('all pins support a stopping area and return putts at every supported speed',()=>{
  for(let n=1;n<=50;n++){
    const level=makeLevel(n);
    for(const stimp of [7,10,14])assert.ok(pinIsPlayable(level,level.hole,stimp),`hole ${n}, Stimp ${stimp}`);
    const replay=makeLevel(n,{hole:level.hole,ball:level.ball});
    assert.deepEqual(replay,level);
  }
});
test('analytic gradient agrees with sampled elevation',()=>{
  const l=makeLevel(30),h=.0001;
  for(const [x,y] of [[10,10],[30,20],[45,30]]){
    const g=gradOf(l,x,y);
    assert.ok(Math.abs(g.x-(elevOf(l,x+h,y)-elevOf(l,x-h,y))/(2*h))<1e-6);
    assert.ok(Math.abs(g.y-(elevOf(l,x,y+h)-elevOf(l,x,y-h))/(2*h))<1e-6);
  }
});
test('solver make is executable through shared gameplay physics',()=>{
  const l=makeLevel(1),r=solveBestRoute(l,l.ball,{stimp:10,grain:true});
  assert.ok(r.holed);
  assert.ok(simulate(l,{...l.ball,vx:Math.cos(r.angle)*r.speed,vy:Math.sin(r.angle)*r.speed},{stimp:10,grain:true}).holed);
});
