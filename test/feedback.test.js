import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPace,straightRead,suggestAdjustment,describeFinish} from '../src/feedback.js';
import {distanceCalibration} from '../src/aiming.js';
import {simulate} from '../src/physics.js';
const level={baseGrad:{x:0,y:0},bumps:[],feats:[],grain:null,hole:{x:30,y:20},holeR:.35};
const start=(feet,angle=0)=>{const v=distanceCalibration(10).speedForDistance(feet);return {x:20,y:20,vx:Math.cos(angle)*v,vy:Math.sin(angle)*v};};

test('pace uses rollout without the cup so forgiving capture cannot conceal excess strength',()=>{
  for(const [feet,kind] of [[8,'short'],[10.5,'good'],[14,'long']]){
    const aim=start(feet),assessment=assessPace(level,aim,{stimp:10});
    assert.equal(assessment.kind,kind);
    if(feet>10)assert.equal(simulate(level,aim,{stimp:10}).holed,true);
  }
});
test('pace and line are independent, with an explicit off-line state for extreme misses',()=>{
  const aim=start(10.5,Math.atan2(.8,10));
  assert.equal(assessPace(level,aim).kind,'good');
  assert.match(assessPace(level,aim).line,/right of cup/);
  assert.equal(simulate(level,aim).holed,false);
  assert.equal(assessPace(level,start(10.5,Math.PI/3)).kind,'line');
  assert.equal(assessPace(level,start(10.5,Math.PI)).kind,'line');
});
test('straight read reports the cup crossing at the selected pace and explicitly reports short shots',()=>{
  assert.equal(straightRead(level,start(8),Math.hypot(start(8).vx,start(8).vy)),'Finishes short');
  assert.equal(straightRead(level,start(12),Math.hypot(start(12).vx,start(12).vy)),'≈ straight');
  const slope={...level,baseGrad:{x:0,y:.02}},aim=start(14);
  const r=assessPace(slope,aim);
  assert.ok(r.rollout.crossing.lateral<0);
  assert.match(straightRead(slope,aim,Math.hypot(aim.vx,aim.vy)),/left/);
});
test('an adjustment is backed by a better simulated outcome',()=>{
  const aim=start(10.5,5*Math.PI/180),advice=suggestAdjustment(level,aim);
  assert.ok(advice);
  const before=simulate(level,aim),after=simulate(level,{x:aim.x,y:aim.y,vx:Math.cos(advice.angle)*advice.speed,vy:Math.sin(advice.angle)*advice.speed});
  const error=r=>Math.hypot(r.ball.x-level.hole.x,r.ball.y-level.hole.y);
  assert.ok(error(after)<error(before)*.8);
});
test('finish feedback distinguishes sideways miss from distance past the cup',()=>{
  assert.equal(describeFinish({x:20,y:20},level.hole,{x:31,y:20.5}),'6 in right · 12 in long');
});
