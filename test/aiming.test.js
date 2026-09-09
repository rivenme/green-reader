import test from 'node:test';
import assert from 'node:assert/strict';
import {distanceCalibration,flatRollDistance,lieRange,pullDistance,createDragGesture,strokeSpeed,strokePercent} from '../src/aiming.js';
import {MAXSPEED} from '../src/constants.js';

test('chosen distances match the full skid and roll simulation on every green speed',()=>{
  for(const stimp of [7,8.5,10,12,14]){
    const calibration=distanceCalibration(stimp);
    for(const distance of [.2,.5,1,3,8,15,30,50,calibration.maxDistance]){
      if(distance>calibration.maxDistance)continue;
      const speed=calibration.speedForDistance(distance);
      assert.ok(Math.abs(flatRollDistance(speed,stimp)-distance)<.04,`${stimp}, ${distance}`);
    }
    assert.equal(calibration.speedForDistance(1e6),MAXSPEED);
    assert.equal(calibration.speedForDistance(0),0);
    assert.equal(distanceCalibration(stimp),calibration);
  }
});
test('changing stroke range can preserve launch speed while faster greens roll farther',()=>{
  const percentage=pullDistance(100,185,100),speed=strokeSpeed(percentage);
  assert.ok(flatRollDistance(speed,14)>flatRollDistance(speed,7));
  assert.ok(strokeSpeed(percentage,'precision')<speed);
  assert.ok(Math.abs(strokeSpeed(strokePercent(speed,'long'),'long')-speed)<1e-12);
});
test('tap-ins have a small range; longer lies retain distance headroom',()=>{
  assert.equal(lieRange(1,90),6);
  assert.ok(lieRange(30,90)>30);
  assert.equal(lieRange(70,90),90);
});
test('dead zone gives no shot and gentle pulls have finer distance control',()=>{
  assert.equal(pullDistance(5,185,20),0);
  assert.equal(pullDistance(6,185,20),0);
  assert.equal(pullDistance(185,185,20),20);
  assert.equal(pullDistance(500,185,20),20);
  assert.ok(pullDistance(50,185,20)-pullDistance(40,185,20)<pullDistance(170,185,20)-pullDistance(160,185,20));
});
test('gesture smoothing rejects sudden finger jitter and keeps its initial range',()=>{
  const options={x:200,y:200,maxPull:185,range:20,time:0};
  const gesture=createDragGesture(options);
  assert.equal(gesture.move(202,201,10).distance,0);
  const first=gesture.move(200,280,100);
  options.range=100;
  const jitter=gesture.move(220,282,104);
  assert.ok(jitter.x<205);
  assert.ok(Math.abs(jitter.distance-first.distance)<1);
  assert.equal(gesture.move(200,200,200).distance,0);
});
test('a held pull settles to the finger even when move events arrive together',()=>{
  const gesture=createDragGesture({x:200,y:200,maxPull:185,range:100,time:0});
  gesture.move(200,210,10);
  gesture.move(200,255,11);
  for(let t=16;t<=256;t+=16)gesture.sample(t);
  assert.equal(gesture.sample(272).distance,pullDistance(55,185,100));
  assert.equal(gesture.sample(300).y,255);
  gesture.move(202,201,320);
  assert.equal(gesture.sample(400).distance,0);
});
