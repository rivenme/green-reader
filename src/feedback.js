import {simulate} from './physics.js';
import {MAXSPEED} from './constants.js';

export function finishOffset(start,hole,finish){
  const d=Math.hypot(hole.x-start.x,hole.y-start.y)||1;
  const ux=(hole.x-start.x)/d,uy=(hole.y-start.y)/d;
  return {lateral:-(finish.x-hole.x)*uy+(finish.y-hole.y)*ux,
    longitudinal:(finish.x-hole.x)*ux+(finish.y-hole.y)*uy,
    remaining:Math.hypot(finish.x-hole.x,finish.y-hole.y)};
}
export function amount(feet){return Math.abs(feet)<2?Math.round(Math.abs(feet)*12)+' in':Math.abs(feet).toFixed(1)+' ft';}
export function describeFinish(start,hole,finish){
  const {lateral,longitudinal}=finishOffset(start,hole,finish);
  const side=Math.abs(lateral)<1/24?'On line':amount(lateral)+(lateral>0?' right':' left');
  const pace=Math.abs(longitudinal)<1/24?'level with cup':amount(longitudinal)+(longitudinal>0?' long':' short');
  return side+' · '+pace;
}
// Pace describes a counterfactual roll with no cup, not a guarantee of a make.
export function assessPace(level,start,options={}){
  const rollout=simulate(level,start,{...options,ignoreCup:true},false);
  const offset=finishOffset(start,level.hole,rollout.ball);
  const d=Math.hypot(level.hole.x-start.x,level.hole.y-start.y);
  const lateral=rollout.crossing?.lateral??offset.lateral;
  const towardCup=start.vx*(level.hole.x-start.x)+start.vy*(level.hole.y-start.y);
  let kind,label;
  if(rollout.ball.moving){kind='unsettled';label='Keeps rolling';}
  else if(rollout.ball.recovered){kind='long';label='Reaches the fringe';}
  else if(towardCup<=0 || Math.abs(lateral)>Math.max(3,d*.2)){kind='line';label='Check starting line';}
  else if(offset.longitudinal<-.35){kind='short';label='Short';}
  else if(offset.longitudinal>1.5){kind='long';label='Long';}
  else if((rollout.crossing?.speed||0)>3.5){kind='firm';label='Firm arrival';}
  else {kind='good';label='Good pace';}
  return {kind,label,rollout,offset,line:rollout.crossing
    ?(Math.abs(lateral)<level.holeR?'Across cup':amount(lateral)+(lateral>0?' right of cup':' left of cup'))
    :'Does not reach cup line'};
}
export function straightRead(level,ball,speed,options={}){
  const angle=Math.atan2(level.hole.y-ball.y,level.hole.x-ball.x);
  const r=simulate(level,{...ball,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed},{...options,ignoreCup:true},false);
  if(r.ball.moving)return 'Keeps rolling';
  if(!r.crossing)return 'Finishes short';
  const lateral=r.crossing.lateral;
  return Math.abs(lateral)<.1?'≈ straight':amount(lateral)+(lateral>0?' right →':' ← left');
}
export function suggestAdjustment(level,start,options={}){
  const base=simulate(level,start,options,false);
  if(base.holed || base.ball.moving)return null;
  const error=r=>r.holed?0:Math.hypot(r.ball.x-level.hole.x,r.ball.y-level.hole.y);
  const original=error(base),speed=Math.hypot(start.vx,start.vy),angle=Math.atan2(start.vy,start.vx);
  let best={error:original};
  const tryShot=(a,v,text)=>{
    if(v<=0 || v>MAXSPEED)return;
    const r=simulate(level,{x:start.x,y:start.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v},options,false);
    const miss=error(r);
    if(!r.ball.moving && !r.ball.recovered && miss<best.error)best={error:miss,text,speed:v,angle:a};
  };
  for(const factor of [.65,.8,.9,.95,1.05,1.1,1.2,1.35])
    tryShot(angle,speed*factor,`Try ${Math.round(Math.abs(1-factor)*100)}% ${factor<1?'softer':'firmer'} on the same line`);
  for(const degrees of [-6,-3,-1.5,-.5,.5,1.5,3,6])
    tryShot(angle+degrees*Math.PI/180,speed,`Try ${Math.abs(degrees)}° ${degrees>0?'right':'left'} with the same stroke`);
  return best.text && best.error<original*.8 && original-best.error>.15?best:null;
}
