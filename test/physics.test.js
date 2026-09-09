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
test('outer fringe stops the ball for recovery without a reflecting wall',()=>{
  const b=launch(.61,20,-6,2);assert.equal(rollStep(b,flat),'stopped');
  assert.equal(b.vx,0);assert.equal(b.vy,0);assert.equal(b.x,.6);assert.equal(b.recovered,true);
});
test('fringe slows roll before the outer edge',()=>{
  const rough=simulate(flat,{x:1,y:10,vx:0,vy:6},{ignoreCup:true});
  const green=simulate(flat,{x:10,y:10,vx:0,vy:6},{ignoreCup:true});
  assert.ok(rough.ball.y<green.ball.y);assert.equal(rough.ball.recovered,false);
});
test('realistic cup accepts soft centers but lets hot and shallow entries roll over',()=>{
  const l={...flat,hole:{x:20,y:10}},options={cupMode:'realistic'};
  assert.equal(rollStep(launch(19.99,10,2,0),l,options),'holed');
  const hot=launch(19.99,10,12,0);assert.equal(rollStep(hot,l,options),'moving');assert.ok(hot.vx>0);
  const shallow=launch(19.99,10.34,3,0);assert.equal(rollStep(shallow,l,options),'moving');assert.ok(shallow.vx>0);
});
test('a ghost target never captures and friction never reverses a flat putt',()=>{
  const l={...flat,hole:{x:20,y:10},cupActive:false};
  assert.notEqual(rollStep(launch(19.99,10,2,0),l),'holed');
  const b=launch(10,10,.015,0);for(let i=0;i<20;i++){rollStep(b,flat);assert.ok(b.vx>=0);}
  assert.equal(b.moving,false);
});
test('terrain preview and fixed-step playback agree for slopes, grain, fringe, and cup rules',()=>{
  const start={x:10,y:10,vx:8,vy:2};
  for(const level of [flat,{...flat,baseGrad:{x:.04,y:0}},{...flat,baseGrad:{x:-.04,y:0}},
    {...flat,baseGrad:{x:0,y:.03},grain:{hx:1,hy:0,mag:.004}},
    {...flat,hole:{x:14,y:11}},{...flat,hole:{x:14,y:11},baseGrad:{x:-.1,y:.01}}]){
  for(const options of [{stimp:7,grain:false},{stimp:14,grain:true,cupMode:'realistic'}]){
  const predicted=simulate(level,start,options);
  assert.ok(predicted.travel>=Math.hypot(predicted.ball.x-start.x,predicted.ball.y-start.y)-1e-9);
  assert.deepEqual(predicted.pts.at(-1),{x:predicted.ball.x,y:predicted.ball.y});
  for(const fps of [30,60,144]){
    const b=launch(start.x,start.y,start.vx,start.vy);let acc=0;
    for(let f=0;f<fps*30&&b.moving;f++){
      acc+=1/fps;while(acc>=STEP&&b.moving){acc-=STEP;rollStep(b,level,options);}
    }
    assert.equal(b.x,predicted.ball.x);assert.equal(b.y,predicted.ball.y);
  }
  }}
});
test('downhill slope curves the shot and grain changes roll',()=>{
  const l={...flat,baseGrad:{x:0,y:.02},grain:{hx:1,hy:0,mag:.004}};
  const a=simulate(l,{x:10,y:10,vx:6,vy:0},{grain:false});
  const b=simulate(l,{x:10,y:10,vx:6,vy:0},{grain:true});
  assert.ok(a.ball.y<10);assert.ok(b.ball.x>a.ball.x);
});
