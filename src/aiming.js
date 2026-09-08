import { MAXSPEED } from './constants.js';
import { simulate } from './physics.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const flat={baseGrad:{x:0,y:0},bumps:[],feats:[],grain:null,hole:{x:0,y:0},holeR:0};
const tables=new Map();
// Calibrate with the same skid, rolling resistance and stopping rule as play.
// Remove only the cup and boundaries from this flat-ground reference.
export function flatRollDistance(speed,stimp){
  return simulate(flat,{x:0,y:0,vx:speed,vy:0},
    {stimp,grain:false,ignoreCup:true,ignoreBounds:true},false).ball.x;
}
export function distanceCalibration(stimp){
  if(tables.has(stimp))return tables.get(stimp);
  const samples=256,distances=Array.from({length:samples+1},(_,i)=>flatRollDistance(i*MAXSPEED/samples,stimp));
  const maxDistance=distances[samples];
  const speedForDistance=distance=>{
    const target=clamp(distance,0,maxDistance);
    if(target===0)return 0;
    let lo=0,hi=samples;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(distances[mid]<target)lo=mid;else hi=mid;}
    const fraction=(target-distances[lo])/(distances[hi]-distances[lo]||1);
    return (lo+fraction)*MAXSPEED/samples;
  };
  const calibration={maxDistance,speedForDistance};tables.set(stimp,calibration);return calibration;
}
export function lieRange(cupDistance,maxDistance){
  return Math.floor(Math.min(maxDistance,Math.max(6,cupDistance*1.75+4))*10)/10;
}
export function pullDistance(pull,maxPull,range,deadZone=6){
  if(pull<=deadZone)return 0;
  const fraction=clamp((pull-deadZone)/(maxPull-deadZone),0,1);
  // Gentle near the ball for tap-ins, with progressively more reach.
  return Math.round(range*Math.pow(fraction,1.5)*10)/10;
}
export function createDragGesture({x,y,maxPull,range,time=0}){
  let smooth={x,y},lastTime=time,started=false;
  return {move(nextX,nextY,nextTime){
    const rawPull=Math.hypot(nextX-x,nextY-y);
    if(rawPull<=6){smooth={x,y};started=false;lastTime=nextTime;return {...smooth,distance:0};}
    const alpha=started?1-Math.exp(-clamp(nextTime-lastTime,1,100)/24):1;
    smooth.x+=(nextX-smooth.x)*alpha;smooth.y+=(nextY-smooth.y)*alpha;
    lastTime=nextTime;started=true;
    return {...smooth,distance:pullDistance(Math.hypot(smooth.x-x,smooth.y-y),maxPull,range)};
  }};
}
