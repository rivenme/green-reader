import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDrill,gradeDrill,recordDrill,freshDrillStats} from '../src/drills.js';
import {distanceCalibration} from '../src/aiming.js';
import {simulate} from '../src/physics.js';
import {validateDrillStats,validateSettings} from '../src/storage.js';

test('pace ladder rewards actual stopping distance without cup capture',()=>{
  for(const [index,distance] of [[0,10],[3,20],[6,30]]){
    const level=makeDrill('pace',index),speed=distanceCalibration(10).speedForDistance(distance);
    const r=simulate(level,{...level.ball,vx:0,vy:-speed});
    assert.equal(r.holed,false);assert.equal(gradeDrill(level,r).success,true);
    const long=simulate(level,{...level.ball,vx:0,vy:-distanceCalibration(10).speedForDistance(distance+5)});
    assert.equal(gradeDrill(level,long).success,false);
  }
});
test('circle changes viewing direction and gate measures start line rather than final make',()=>{
  assert.notDeepEqual(makeDrill('circle',0).ball,makeDrill('circle',1).ball);
  const l=makeDrill('gate');
  assert.equal(gradeDrill(l,{ball:{x:32,y:20},holed:false,pts:[l.ball,{x:30,y:21}]}).success,true);
  assert.equal(gradeDrill(l,{ball:l.hole,holed:true,pts:[l.ball,{x:31,y:21},l.hole]}).success,false);
  assert.equal(gradeDrill(l,{ball:l.ball,holed:false,pts:[l.ball]}).success,false);
});
test('drill stats count every attempt, reset streaks on a miss, and reject corrupt saves',()=>{
  const a=recordDrill(freshDrillStats(),'pace',{success:true,leave:.5},0);
  const b=recordDrill(a.stats,'pace',{success:false,leave:3},a.streak);
  assert.equal(b.streak,0);assert.deepEqual(b.stats.pace,{attempts:2,hits:1,totalLeave:3.5,bestStreak:1});
  assert.deepEqual(validateDrillStats(b.stats),b.stats);
  assert.deepEqual(validateDrillStats({pace:{attempts:1,hits:3,totalLeave:NaN,bestStreak:4}}),freshDrillStats());
  const settings=validateSettings({controlMode:'distance',strokeScale:'precision',cupMode:'realistic',optHaptics:false});
  assert.equal(settings.cupMode,'realistic');assert.equal(settings.optHaptics,false);
  assert.equal(validateSettings({cupMode:'oops'}).cupMode,'forgiving');
});
