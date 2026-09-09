import { elevOf, gradOf } from './terrain.js';
import { launch, rollStep, simulate, effectiveGradient, frictionDecel } from './physics.js';
import { GW, GH, MAXSPEED, G } from './constants.js';
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}

export function pinIsPlayable(field,hole,stimp=14){
  // Test the whole return-putt area, including grain, at the fastest supported
  // green speed. Reserve resistance headroom for a controllable return putt.
  for(let dx=-2.5;dx<=2.5;dx+=1.25)for(let dy=-2.5;dy<=2.5;dy+=1.25){
    const g=effectiveGradient(field,hole.x+dx,hole.y+dy,true);
    if(G*Math.hypot(g.x,g.y)>frictionDecel(stimp)*.65)return false;
  }
  const l={...field,hole,holeR:.35};
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,dx=Math.cos(a),dy=Math.sin(a);
    const r=simulate(l,{x:hole.x+dx*2.5,y:hole.y+dy*2.5,vx:-dx*2.2,vy:-dy*2.2},
      {stimp,grain:true,ignoreCup:true},false);
    if(r.ball.moving || r.ball.recovered || dist(r.ball,hole)>4)return false;
  }
  return true;
}

function makeLevel(n, fixed){
  const rnd = mulberry32(0x9e37 + n*2654435761 >>> 0);
  const R = (a,b)=>a+(b-a)*rnd();
  const diff = Math.min(1,(n-1)/29);          // ramps to max difficulty by ~level 30


  // Real greens: mostly 1-3% slope, 4-5% only in small areas. Tilt caps ~3%
  // so even a long uphill putt is comfortably reachable at full power.
  const tiltMag = n===1?0:R(0.004, 0.01) + diff*0.016;
  const tiltDir = R(0, Math.PI*2);
  const baseGrad = { x: Math.cos(tiltDir)*tiltMag, y: Math.sin(tiltDir)*tiltMag };

  // Broad, gentle undulations (max local slope ≈ 0.6·amp/sig stays under ~5%).
  // Hollows are shallower than mounds — greens are built to drain, deep bowls
  // collect water and don't exist on real courses.
  const nBumps = n<=2?0:3 + Math.round(diff*5) + Math.round(R(0,2));
  const bumps=[];
  for(let i=0;i<nBumps;i++){
    const hollow = rnd()<0.45;
    bumps.push({
      x: R(4, GW-4), y: R(4, GH-4),
      amp: (hollow?-0.6:1) * R(0.15, 0.3+diff*0.18),  // gentler peaks
      sig: R(6.0, 11.0),                              // broader = lower slope
    });
  }

  // Structural features real green architects use: tiers (a smooth step
  // between two levels) and ridges/spines that split the green.
  const feats=[];
  if(n>=5 && rnd()<0.35){
    const a=R(0,6.28);
    feats.push({t:'tier', x:GW/2+R(-8,8), y:GH/2+R(-6,6),
      nx:Math.cos(a), ny:Math.sin(a),
      amp:(rnd()<0.5?-1:1)*R(0.25,0.45), w:R(8,11)});
  }
  if(n>=3 && rnd()<0.4){
    const a=R(0,6.28);
    feats.push({t:'ridge', x:GW/2+R(-10,10), y:GH/2+R(-8,8),
      nx:Math.cos(a), ny:Math.sin(a),
      amp:(rnd()<0.6?1:-1)*R(0.18,0.35), sig:R(2.5,4)});
  }

  // Grass grain: the nap direction. Down-grain rolls faster, into it slower,
  // across it the ball drifts — modelled as a constant micro-slope.
  const ga=R(0,6.28);
  const grain=n<10?null:{hx:Math.cos(ga), hy:Math.sin(ga), mag:R(0.001,0.002)+diff*0.001};

  // Seed terrain, pin and lie together for reproducible challenges.
  const RR = R;
  const Ltmp={baseGrad, bumps, feats,grain};

  const pins=Array.from({length:80},()=>({x:RR(GW*.18,GW*.82),y:RR(6,16)}));
  let hole;
  for(let pass=0;pass<12 && !hole;pass++){
    hole=pins.find(p=>pinIsPlayable(Ltmp,p));
    if(!hole){
      baseGrad.x*=.75;baseGrad.y*=.75;
      bumps.forEach(b=>b.amp*=.75);feats.forEach(f=>f.amp*=.75);
    }
  }
  if(!hole){baseGrad.x=baseGrad.y=0;bumps.length=feats.length=0;hole=pins[0];}

  // Screen candidate lies with the shared roll at Stimp 7 and 85% power.
  function rollReaches(p, ang){
    const v=0.85*MAXSPEED;
    const b=launch(p.x,p.y,Math.cos(ang)*v,Math.sin(ang)*v);
    const field={...Ltmp,grain,hole,holeR:0.35};
    for(let i=0;i<2400;i++){
      const event=rollStep(b,field,{stimp:7,grain:true,ignoreCup:true});
      if(Math.hypot(b.x-hole.x,b.y-hole.y)<0.5)return true;
      if(event!=='moving')break;
    }
    return false;
  }
  const reachable=(p)=>{
    const base=Math.atan2(hole.y-p.y, hole.x-p.x), mu7=36/14;
    for(let off=-32; off<=32; off+=4)
      if(rollReaches(p, base+off*Math.PI/180, mu7)) return true;
    return false;
  };
  // Pick a seeded candidate that passes the bounded reachability search.
  const minDist = n<=2?3:8 + diff*14;
  let cands=[];
  for(let i=0;i<400 && cands.length<4;i++){
    const p=n<=2?{x:hole.x,y:hole.y+(n===1?5:8)}:{ x:RR(GW*0.14, GW*0.86), y:RR(GH*0.42, GH-4) };
    const d=dist(p,hole);
    if(d>=minDist && d<=40 && reachable(p)) cands.push(p);
  }
  if(!cands.length)                         // relax distance on extreme greens
    for(let i=0;i<400 && cands.length<2;i++){
      const p={ x:RR(GW*0.14, GW*0.86), y:RR(GH*0.35, GH-4) };
      if(dist(p,hole)>=8 && reachable(p)) cands.push(p);
    }
  const pick = rnd();
  const ballPos = cands.length
    ? cands[Math.floor(pick*cands.length)]
    : { x:hole.x, y:Math.min(GH-5, hole.y+10) };
  if(fixed){hole={...fixed.hole};Object.assign(ballPos,fixed.ball);}
  const par = 2;
  return { n, baseGrad, bumps, feats, grain, hole, ball: ballPos, par, holeR: 0.35, diff };
}


export { makeLevel, mulberry32, dist };
