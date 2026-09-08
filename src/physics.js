import { GW, GH, G, STEP } from './constants.js';
import { gradOf } from './terrain.js';

export const frictionDecel = stimp => 18 / stimp;
export const capSpeedAt = (d, radius) => 1.8 + 2.8 * Math.max(0, 1 - d / radius);
export function effectiveGradient(level, x, y, grain=true) {
  const g=gradOf(level,x,y);
  if(grain && level.grain){
    g.x-=level.grain.mag*level.grain.hx;
    g.y-=level.grain.mag*level.grain.hy;
  }
  return g;
}
export function launch(x,y,vx,vy){
  return {x,y,vx,vy,moving:true,rolling:false,skidU:0.85*Math.hypot(vx,vy),lipCooldown:0};
}
// One fixed simulation step, shared by play, prediction, reach checks and solver.
export function rollStep(b, level, options={}, h=STEP){
  if(!b.moving) return 'stopped';
  const mu=frictionDecel(options.stimp ?? 10);
  const sp=Math.hypot(b.vx,b.vy);
  if(!b.rolling && sp<b.skidU) b.rolling=true;
  const g=effectiveGradient(level,b.x,b.y,options.grain ?? true);
  let ax=-G*g.x, ay=-G*g.y;
  if(!b.rolling && sp>0.001){
    const along=(ax*b.vx+ay*b.vy)/sp;
    ax=along*b.vx/sp+(ax-along*b.vx/sp)*0.45;
    ay=along*b.vy/sp+(ay-along*b.vy/sp)*0.45;
  }
  let resistance=mu*(b.rolling?1:2.2)*(sp<1.2?1+(1.2-sp)*0.5:1);
  if(sp>0.001 && options.grain!==false && level.grain){
    resistance*=1-0.1*(b.vx*level.grain.hx+b.vy*level.grain.hy)/sp;
  }
  if(sp>0.001){ ax-=resistance*b.vx/sp; ay-=resistance*b.vy/sp; }
  b.vx+=ax*h; b.vy+=ay*h;
  let nx=b.x+b.vx*h, ny=b.y+b.vy*h;
  const hx=level.hole.x, hy=level.hole.y, radius=level.holeR;
  const dx=nx-b.x, dy=ny-b.y;
  const t=Math.max(0,Math.min(1,((hx-b.x)*dx+(hy-b.y)*dy)/(dx*dx+dy*dy||1)));
  const cx=b.x+dx*t-hx, cy=b.y+dy*t-hy, closest=Math.hypot(cx,cy);
  const speed=Math.hypot(b.vx,b.vy);
  b.lipCooldown=Math.max(0,(b.lipCooldown||0)-h);
  const capture=()=>{ b.arrivalSpeed=speed;b.x=hx;b.y=hy;b.vx=b.vy=0;b.moving=false;return 'holed'; };
  if(!options.ignoreCup && closest<radius && b.lipCooldown===0){
    // Real cups accept a little speed and off-centre entry. Keep the flag and
    // rim readable while making a well aimed putt reliably drop.
    const cap=capSpeedAt(closest,radius)*1.25;
    if(speed<cap) return capture();
    // Only an off-centre graze catches the lip. Move it outside the cup so
    // the next step cannot count the same impact as a fresh capture.
    if(closest>radius*0.3 && speed<cap*2.2){
      const rx=cx/closest, ry=cy/closest, tx=-ry, ty=rx;
      const tangent=b.vx*tx+b.vy*ty;
      b.vx=tx*tangent*0.82+rx*speed*0.14;
      b.vy=ty*tangent*0.82+ry*speed*0.14;
      nx=hx+rx*(radius+0.02);ny=hy+ry*(radius+0.02);
      b.lipCooldown=0.15;
    }
  }
  b.x=nx;b.y=ny;
  const m=0.6;
  if(b.x<m||b.x>GW-m){b.x=Math.max(m,Math.min(GW-m,b.x));b.vx*=-0.25;}
  if(b.y<m||b.y>GH-m){b.y=Math.max(m,Math.min(GH-m,b.y));b.vy*=-0.25;}
  if(Math.hypot(b.vx,b.vy)<0.12 && G*Math.hypot(g.x,g.y)<resistance*1.02){
    if(!options.ignoreCup && Math.hypot(b.x-hx,b.y-hy)<radius+0.09 && b.lipCooldown===0) return capture();
    b.vx=b.vy=0;b.moving=false;return 'stopped';
  }
  return 'moving';
}
export function simulate(level, start, options={}, collect=true){
  const b=launch(start.x,start.y,start.vx,start.vy);
  const pts=collect?[{x:b.x,y:b.y}]:null;
  let minD=Math.hypot(b.x-level.hole.x,b.y-level.hole.y),spAtMin=0,event='moving';
  for(let i=0;i<3600;i++){
    event=rollStep(b,level,options);
    const d=Math.hypot(b.x-level.hole.x,b.y-level.hole.y);
    if(d<minD){ minD=d;spAtMin=Math.hypot(b.vx,b.vy); }
    if(collect && (i%4===0 || event!=='moving'))pts.push({x:b.x,y:b.y});
    if(event!=='moving')break;
  }
  if(collect)pts.push({x:b.x,y:b.y});
  return {holed:event==='holed',minD,spAtMin,arrSp:b.arrivalSpeed||0,pts,ball:b};
}
