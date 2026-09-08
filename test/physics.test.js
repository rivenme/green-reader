import test from 'node:test';
import assert from 'node:assert/strict';
import {launch,rollStep,simulate,capSpeedAt} from '../src/physics.js';
import {STEP} from '../src/constants.js';
const flat={baseGrad:{x:0,y:0},bumps:[],feats:[],hole:{x:50,y:30},holeR:.35};
test('flat roll settles; faster greens roll farther',()=>{
  const start={x:10,y:10,vx:6,vy:0};
  const slow=simulate(flat,start,{stimp:7}),fast=simulate(flat,start,{stimp:14});
  assert.equal(slow.ball.moving,false);assert.equal(fast.ball.moving,false);assert.ok(fast.ball.x>slow.ball.x);assert.equal(fast.ball.y,10);
});
test('central putts drop at any speed',()=>{
  const l={...flat,hole:{x:20,y:10}};
  const slow=launch(19.99,10,2,0);assert.equal(rollStep(slow,l),'holed');
  const hot=launch(19.99,10,12,0);assert.equal(rollStep(hot,l),'holed');assert.equal(hot.moving,false);
  assert.ok(capSpeedAt(0,.35)>capSpeedAt(.34,.35));
});
test('cup intersection is accepted without flag or lip bounce',()=>{
  const l={...flat,hole:{x:20,y:10}};const b=launch(19.98,10.31,4,0);
  assert.equal(rollStep(b,l),'holed');assert.equal(b.moving,false);assert.equal(b.x,20);assert.equal(b.y,10);
  assert.notEqual(rollStep(b,l),'holed');
});
test('boundary reflects only the crossed axis',()=>{
  const b=launch(.61,20,-6,2);rollStep(b,flat);assert.ok(b.vx>0);assert.ok(b.vy>0);assert.equal(b.x,.6);
});
test('prediction and fixed-step playback end at exactly the same position',()=>{
  const start={x:10,y:10,vx:8,vy:2};const predicted=simulate(flat,start);
  for(const fps of [30,60,144]){
    const b=launch(start.x,start.y,start.vx,start.vy);let acc=0;
    for(let f=0;f<fps*30&&b.moving;f++){
      acc+=1/fps;while(acc>=STEP&&b.moving){acc-=STEP;rollStep(b,flat);}
    }
    assert.equal(b.x,predicted.ball.x);assert.equal(b.y,predicted.ball.y);
  }
});
test('downhill slope curves the shot and grain changes roll',()=>{
  const l={...flat,baseGrad:{x:0,y:.02},grain:{hx:1,hy:0,mag:.004}};
  const a=simulate(l,{x:10,y:10,vx:6,vy:0},{grain:false});
  const b=simulate(l,{x:10,y:10,vx:6,vy:0},{grain:true});
  assert.ok(a.ball.y<10);assert.ok(b.ball.x>a.ball.x);
});
