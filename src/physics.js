import { GW, GH, G, STEP, FRINGE } from './constants.js';
import { gradOf } from './terrain.js';

export const frictionDecel = stimp => 18 / stimp;
// A deliberately forgiving speed window for the optional realistic cup.
// Shorter chords across the opening allow less time to drop. No pole collision.
export const capSpeedAt = (d, radius) => radius>0 ? 4.6*Math.sqrt(Math.max(0,1-(d/radius)**2)) : 0;
export function onFringe(x,y){return x<FRINGE || x>GW-FRINGE || y<FRINGE || y>GH-FRINGE;}
export function effectiveGradient(level, x, y, grain=true) {
  const g=gradOf(level,x,y);
  if(grain && level.grain){
    g.x-=level.grain.mag*level.grain.hx;
    g.y-=level.grain.mag*level.grain.hy;
  }
  return g;
}
export function launch(x,y,vx,vy){
  return {x,y,vx,vy,moving:true,rolling:false,skidU:0.85*Math.hypot(vx,vy),lipCooldown:0,recovered:false,arrivalSpeed:0};
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
  if(!options.ignoreBounds && onFringe(b.x,b.y))resistance*=4;
  b.vx+=ax*h; b.vy+=ay*h;
  // Friction may stop a ball, but must never reverse it on a flat surface.
  const acceleratedSpeed=Math.hypot(b.vx,b.vy);
  const retained=Math.max(0,1-resistance*h/(acceleratedSpeed||1));
  b.vx*=retained;b.vy*=retained;
  let nx=b.x+b.vx*h, ny=b.y+b.vy*h;
  const hx=level.hole.x, hy=level.hole.y, radius=level.holeR;
  const dx=nx-b.x, dy=ny-b.y;
  const t=Math.max(0,Math.min(1,((hx-b.x)*dx+(hy-b.y)*dy)/(dx*dx+dy*dy||1)));
  const cx=b.x+dx*t-hx, cy=b.y+dy*t-hy, closest=Math.hypot(cx,cy);
  const speed=Math.hypot(b.vx,b.vy);
  b.lipCooldown=Math.max(0,(b.lipCooldown||0)-h);
  const capture=()=>{ b.arrivalSpeed=speed;b.x=hx;b.y=hy;b.vx=b.vy=0;b.moving=false;return 'holed'; };
  const cupActive=!options.ignoreCup && level.cupActive!==false;
  const forgiving=options.cupMode!=='realistic';
  if(cupActive && closest<radius && (forgiving || speed<=capSpeedAt(closest,radius))){
    return capture();
  }
  b.x=nx;b.y=ny;
  const m=0.6;
  if(!options.ignoreBounds && (b.x<m||b.x>GW-m||b.y<m||b.y>GH-m)){
    b.x=Math.max(m,Math.min(GW-m,b.x));b.y=Math.max(m,Math.min(GH-m,b.y));
    b.vx=b.vy=0;b.moving=false;b.recovered=true;return 'stopped';
  }
  if(Math.hypot(b.vx,b.vy)<0.12 && G*Math.hypot(g.x,g.y)<resistance*1.02){
    if(cupActive && Math.hypot(b.x-hx,b.y-hy)<radius+(forgiving?0.09:0)) return capture();
    b.vx=b.vy=0;b.moving=false;return 'stopped';
  }
  return 'moving';
}
export function simulate(level, start, options={}, collect=true){
  const b=launch(start.x,start.y,start.vx,start.vy);
  const pts=collect?[{x:b.x,y:b.y}]:null;
  let minD=Math.hypot(b.x-level.hole.x,b.y-level.hole.y),spAtMin=0,event='moving',crossing=null,travel=0;
  const initialDistance=minD||1,ux=(level.hole.x-start.x)/initialDistance,uy=(level.hole.y-start.y)/initialDistance;
  for(let i=0;i<3600;i++){
    const px=b.x,py=b.y;
    event=rollStep(b,level,options);
    travel+=Math.hypot(b.x-px,b.y-py);
    const before=(px-level.hole.x)*ux+(py-level.hole.y)*uy;
    const after=(b.x-level.hole.x)*ux+(b.y-level.hole.y)*uy;
    if(!crossing && before<0 && after>=0){
      const t=-before/(after-before),x=px+(b.x-px)*t,y=py+(b.y-py)*t;
      crossing={x,y,lateral:-(x-level.hole.x)*uy+(y-level.hole.y)*ux,speed:Math.hypot(b.vx,b.vy)};
    }
    const d=Math.hypot(b.x-level.hole.x,b.y-level.hole.y);
    if(d<minD){ minD=d;spAtMin=Math.hypot(b.vx,b.vy); }
    if(collect && (i%4===0 || event!=='moving'))pts.push({x:b.x,y:b.y});
    if(event!=='moving')break;
  }
  if(collect)pts.push({x:b.x,y:b.y});
  return {holed:event==='holed',minD,spAtMin,arrSp:b.arrivalSpeed||0,pts,ball:b,crossing,travel};
}
