import { MAXSPEED } from './constants.js';
import { dist } from './course.js';
import { simulate, frictionDecel } from './physics.js';
export function solveBestRoute(level, ball, options={}){
  const hole=level.hole;
  const d0=dist(ball,hole);
  if(d0<0.6) return null;
  const mu=frictionDecel(options.stimp ?? 10);
  const baseAng=Math.atan2(hole.y-ball.y, hole.x-ball.x);
  const vFlat=Math.sqrt(2*mu*d0);
  let best=null;
  const consider=(ang,v,h)=>{
    const r=simulate(level,{x:ball.x,y:ball.y,vx:Math.cos(ang)*v,vy:Math.sin(ang)*v},options,false);
    // misses prefer slow near-misses — their neighbourhood holds the makes
    const score = r.holed ? Math.abs(r.arrSp-1.5) : 100+r.minD+0.04*r.spAtMin;
    if(!best || score<best.score) best={score,ang,v};
    return score;
  };
  // coarse sweep: ±30° around the direct line, speeds from die-at-hole to firm.
  // Keep the best result per line — big-breaking putts can live 20°+ off the
  // direct line in a separate basin the single-best refinement would abandon.
  const perLine=[];
  for(let ai=-30; ai<=30; ai+=2){
    const ang=baseAng+ai*Math.PI/180;
    let lineBest=null;
    for(let vi=0; vi<13; vi++){
      const v=Math.min(MAXSPEED, vFlat*(0.9+vi*0.09));
      const sc=consider(ang, v, 1/60);
      if(!lineBest || sc<lineBest.score) lineBest={score:sc, ang, v};
    }
    perLine.push(lineBest);
  }
  perLine.sort((a,b)=>a.score-b.score);
  // fine refinement around the winner
  let c={...best};
  for(let ai=-2; ai<=2; ai+=0.5){
    for(let vi=-3; vi<=3; vi++){
      consider(c.ang+ai*Math.PI/180, Math.min(MAXSPEED, c.v*(1+vi*0.025)), 1/120);
    }
  }
  // micro refinement — realistic cup capture windows are tight
  c={...best};
  for(let ai=-0.6; ai<=0.6; ai+=0.15){
    for(let vi=-2; vi<=2; vi++){
      consider(c.ang+ai*Math.PI/180, Math.min(MAXSPEED, c.v*(1+vi*0.008)), 1/120);
    }
  }
  // dense speed ladders on the most promising lines — once a line is right,
  // holing is a narrow speed band
  for(const cand of perLine.slice(0,3)){
    for(let ai=-0.8; ai<=0.8; ai+=0.2){
      for(let vi=0; vi<22; vi++){
        consider(cand.ang+ai*Math.PI/180, Math.min(MAXSPEED, vFlat*(0.88+vi*0.05)), 1/120);
      }
    }
  }
  // still nothing holed: one last very fine pass around the closest miss
  if(best.score>=100){
    c={...best};
    for(let ai=-0.4; ai<=0.4; ai+=0.08){
      for(let vi=-4; vi<=4; vi++){
        consider(c.ang+ai*Math.PI/180, Math.min(MAXSPEED, c.v*(1+vi*0.01)), 1/120);
      }
    }
  }
  const r=simulate(level,{x:ball.x,y:ball.y,vx:Math.cos(best.ang)*best.v,vy:Math.sin(best.ang)*best.v},options,true);
  return {pts:r.pts, holed:r.holed, angle:best.ang, speed:best.v};
}

