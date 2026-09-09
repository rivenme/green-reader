import {finishOffset,amount} from './feedback.js';

export const DRILLS={pace:{name:'Pace ladder',total:9},circle:{name:'Short-putt circle',total:12},gate:{name:'Starting-line gate',total:9}};
export function makeDrill(type,index=0,slope='flat'){
  if(!DRILLS[type])throw new Error('Unknown drill');
  const stage=Math.floor(index/3),distance=type==='pace'?[10,20,30][Math.min(2,stage)]:type==='circle'?3:8;
  const hole={x:30,y:type==='pace'?6:20};
  const angle=type==='circle'?(index%4)*Math.PI/2:Math.PI/2;
  const ball={x:hole.x+Math.cos(angle)*distance,y:hole.y+Math.sin(angle)*distance};
  const baseGrad=slope==='gentle'?{x:.012,y:0}:slope==='mixed'?{x:.012,y:-.01}:{x:0,y:0};
  const level={n:1,baseGrad,bumps:[],feats:[],grain:null,hole,ball,par:2,holeR:.35,diff:0,
    drill:type,cupActive:type!=='pace',targetRadius:1.5};
  if(type==='gate')level.gate={x:ball.x+(hole.x-ball.x)*.25,y:ball.y+(hole.y-ball.y)*.25,halfWidth:.16};
  return level;
}
export function gradeDrill(level,result){
  const leave=Math.hypot(result.ball.x-level.hole.x,result.ball.y-level.hole.y);
  if(level.drill==='pace')return {success:!result.ball.moving&&!result.ball.recovered&&leave<=level.targetRadius,
    leave,detail:amount(leave)+' from target'};
  if(level.drill==='circle')return {success:result.holed,leave,detail:result.holed?'Clean make':amount(leave)+' left to putt'};
  const pts=result.pts||[];
  for(let i=1;i<pts.length;i++){
    const a=finishOffset(level.ball,level.gate,pts[i-1]),b=finishOffset(level.ball,level.gate,pts[i]);
    if(a.longitudinal<0 && b.longitudinal>=0){
      const t=-a.longitudinal/(b.longitudinal-a.longitudinal),lateral=a.lateral+(b.lateral-a.lateral)*t;
      return {success:Math.abs(lateral)<=level.gate.halfWidth,leave,detail:Math.abs(lateral)<=level.gate.halfWidth?'Through the gate':amount(lateral)+(lateral>0?' right of gate':' left of gate')};
    }
  }
  return {success:false,leave,detail:'Did not reach the gate'};
}
export function freshDrillStats(){return Object.fromEntries(Object.keys(DRILLS).map(k=>[k,{attempts:0,hits:0,totalLeave:0,bestStreak:0}]));}
export function recordDrill(stats,type,result,streak){
  const old=stats[type],next=streak+(result.success?1:-streak);
  return {stats:{...stats,[type]:{attempts:old.attempts+1,hits:old.hits+(result.success?1:0),
    totalLeave:old.totalLeave+result.leave,bestStreak:Math.max(old.bestStreak,next)}},streak:next};
}
