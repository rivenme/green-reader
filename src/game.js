import * as THREE from 'three';
import { createScene, heightColor, disposeObj } from './rendering.js';
import { GW, GH, VS, G, MAXSPEED, BALL_R, STEP, COURSE_VERSION } from './constants.js';
import { makeLevel, mulberry32, dist } from './course.js';
import { elevOf, gradOf } from './terrain.js';
import { launch, rollStep, simulate, effectiveGradient } from './physics.js';
import { resultTier, golfTerm, streakMultiplier, nextStreak, holeScore, RANKS, rankFor, nextRank, ACHIEVEMENTS, newlyEarned, BALL_SKINS, GREEN_THEMES, isUnlocked } from './scoring.js';
import { createAudio } from './audio.js?v=20260909';
import { createStore, freshRun, validateRun } from './storage.js';
import { announce, createDialogs } from './ui.js';
import { bindSlingshot } from './input.js';
import { distanceCalibration, lieRange, createDragGesture } from './aiming.js';

export function startGame(){
// ---- world constants ------------------------------------------------------
function maxDragPx(){ return Math.min(185, window.innerWidth*0.48); }
let level=null, LV=1;
let userStimp=10, stimp=10;      // Stimp 10 ≈ a well-kept members' club green
let mode='practice';               // 'career' | 'practice' (set by the panel mode tabs)
let nextLevelTimer=null;         // post-hole advance timer, cancelled on menu

function elev(fx,fy){ return elevOf(level,fx,fy); }
function grad(fx,fy){ return gradOf(level,fx,fy); }

function physicsOptions(){ return { stimp, grain:document.getElementById('optGrain').checked }; }
function gradEff(x,y){ return effectiveGradient(level,x,y,physicsOptions().grain); }

// Box-Muller gaussian for stroke dispersion
function gauss(){ return Math.sqrt(-2*Math.log(1-Math.random()))*Math.cos(Math.PI*2*Math.random()); }

// ---------------------------------------------------------------------------
//  BALL & GAME STATE  (plan coords in feet: ball.x = fx, ball.y = fz)
// ---------------------------------------------------------------------------
let ball={x:0,y:0,vx:0,vy:0,moving:false,rolling:true,skidU:0};
let strokes=0, totalVsPar=0, holed=false, dropT=1;
let aiming=false, aimPlanePt=null, aimStartPx=null, aimNowPx=null;
let aimPointerId=null, aimOriginPt=null;
let keyboardAim=null;
let dragGesture=null,dragAim=null,dragRange=0;
let trailPts=[];
let puttStart=null, firstPuttD=0, sessionSG=0; // strokes-gained bookkeeping
let runScore=0, streakCount=0;   // career run total + consecutive par-or-better

function frictionDecel(){ const v0=6.0; return (v0*v0)/(2*stimp); }

// ---- career runtime: persistence, run stats, toasts, progression -----------
let storage;
try { storage=window.localStorage; } catch {}
const store=createStore(storage,message=>{document.getElementById('saveStatus').textContent=message;});
let career=store.state.career, settings=store.state.settings;
let runStats=freshRun(), completed=false, ready=false, activeRun=false, modalOpen=false, contextLost=false;
let tutorial=false, tutorialStep=0, savedRun=store.state.run;
const audio=createAudio(()=>settings.optSnd && !document.hidden);
const {sndClick,sndCelebrate,sndDrop}=audio;
const reducedMotion=()=>settings.optMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
const paused=()=>document.hidden || modalOpen || contextLost;
const dialogs=createDialogs(value=>{modalOpen=value;if(ready){cancelAim();if(value)audio.pause();}});
function snapshot(){
  return {courseVersion:COURSE_VERSION,mode,LV,ball:{...ball},strokes,totalVsPar,holed,completed,runScore,streakCount,runStats:{...runStats},sessionSG,puttStart};
}
function persist(){
  if(!ready)return;
  if(!tutorial && activeRun)savedRun=snapshot();
  store.save({career,settings,stats,run:savedRun});
}
function saveCareer(){ persist(); }

function toast(msg, big){
  const el=document.createElement('div');
  el.className='toast'+(big?' big':'');
  el.textContent=msg;
  document.getElementById('toasts').appendChild(el);
  void el.offsetWidth; el.classList.add('show');
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),400); }, 2600);
}

// Called once per holed putt in Competition (after celebrate computes result r).
function careerProgress(r){
  runStats.holes++;
  if(r.tier==='onePutt'){ runStats.onePutts++; runStats.onePuttStreak++; } else runStats.onePuttStreak=0;
  runStats.longest=Math.max(runStats.longest, streakCount);
  runStats.best=Math.max(runStats.best, r.points);
  const oldRank=rankFor(career.xp).name;
  career.xp += r.points;                 // bestRun is set at run completion (runSummary)
  const ctx={ tier:r.tier, bomb:r.bomb, streak:streakCount, onePuttStreak:runStats.onePuttStreak,
    level:LV, cleared50:false, runScore, xp:career.xp };
  for(const id of newlyEarned(ctx, career.ach)){
    career.ach.push(id);
    toast('🏅 '+ACHIEVEMENTS.find(a=>a.id===id).label);
  }
  if(rankFor(career.xp).name!==oldRank) toast('⭐ RANK UP — '+rankFor(career.xp).name, true);
  updateCareerUI();
}

// End-of-run recap (cleared level 50).
function runSummary(){
  if(completed)return;
  completed=true;
  const ctx={ tier:'', bomb:false, streak:streakCount, onePuttStreak:runStats.onePuttStreak,
    level:50, cleared50:runStats.holes===50, runScore, xp:career.xp };
  for(const id of newlyEarned(ctx, career.ach)){
    career.ach.push(id);
    toast('🏅 '+ACHIEVEMENTS.find(a=>a.id===id).label);
  }
  career.runs++;
  const isBest = runScore>career.bestRun;
  if(isBest) career.bestRun=runScore;
  updateCareerUI();
  showMsg('🏆 Run complete!',
    `Score <b style="color:var(--accent)">${runScore.toLocaleString()}</b>${isBest?' · <b style="color:#ffd84a">NEW BEST!</b>':''}<br>`+
    `One-putts ${runStats.onePutts} · Longest streak ${runStats.longest} · Best hole ${runStats.best.toLocaleString()}<br>`+
    `Rank: <b style="color:var(--accent)">${rankFor(career.xp).name}</b> · Pick a mode to play again`);
}

function updateCareerUI(){
  const r=rankFor(career.xp), nx=nextRank(career.xp);
  document.getElementById('uiRank').textContent=r.name;
  document.getElementById('uiXp').textContent=Math.round(career.xp).toLocaleString()+(nx?(' / '+nx.xp.toLocaleString()):' (max)');
  document.getElementById('uiBest').textContent=Math.round(career.bestRun).toLocaleString();
  document.getElementById('uiBadges').textContent=career.ach.length+'/'+ACHIEVEMENTS.length;
}

// Badges overlay
function renderBadges(){
  const grid=document.getElementById('badgeGrid');
  grid.innerHTML=ACHIEVEMENTS.map(a=>{
    const got=career.ach.includes(a.id);
    return `<div class="badge${got?' got':''}">${got?'🏅':'🔒'} ${a.label}</div>`;
  }).join('');
}

// ---- cosmetics (Phase 4) ---------------------------------------------------
function currentBall(){ return BALL_SKINS.find(b=>b.id===career.ball)||BALL_SKINS[0]; }
function currentTheme(){ return GREEN_THEMES.find(t=>t.id===career.theme)||GREEN_THEMES[0]; }
function applyCosmetics(){
  const b=currentBall(), t=currentTheme();
  ballMesh.material.color.set(b.color);
  trailLine.material.color.set(b.trail);
  scene.background.set(t.bg);
  if(scene.fog) scene.fog.color.set(t.bg);
  if(level) buildTerrain();
}
function renderLocker(){
  const mk=(items, kind, sel)=>items.map(it=>{
    const lk=isUnlocked(it, career.xp), eq=(it.id===sel);
    return `<button type="button" ${lk?'':'disabled'} aria-pressed="${eq}" class="lk${lk?'':' lock'}${eq?' eq':''}" data-kind="${kind}" data-id="${it.id}">`+
      `${eq?'✓ ':lk?'':'🔒 '}${it.name}${lk?'':'<br><small>'+it.xp.toLocaleString()+' XP</small>'}</button>`;
  }).join('');
  document.getElementById('ballGrid').innerHTML=mk(BALL_SKINS,'ball',career.ball);
  document.getElementById('themeGrid').innerHTML=mk(GREEN_THEMES,'theme',career.theme);
}
function equipItem(kind, id){
  const list=(kind==='ball')?BALL_SKINS:GREEN_THEMES;
  const it=list.find(x=>x.id===id);
  if(!it || !isUnlocked(it, career.xp)) return;
  if(kind==='ball') career.ball=id; else career.theme=id;
  saveCareer(); applyCosmetics(); renderLocker();
}


// Illustrative fixed reference table; not a validated or current Tour dataset.
function expPutts(d){
  const T=[[3,1.04],[5,1.23],[8,1.50],[10,1.61],[15,1.78],[20,1.87],[30,1.98],[40,2.06],[50,2.14],[60,2.21]];
  if(d<=T[0][0]) return 1.0+(d/3)*0.04;
  for(let i=1;i<T.length;i++){
    if(d<=T[i][0]){
      const [d0,p0]=T[i-1],[d1,p1]=T[i];
      return p0+(p1-p0)*(d-d0)/(d1-d0);
    }
  }
  return 2.21+(d-60)*0.004;
}
const PGA_MAKE={'0–5 ft':88,'5–10 ft':55,'10–20 ft':29,'20–30 ft':12,'30+ ft':6};
function bucketName(d){ return d<5?'0–5 ft':d<10?'5–10 ft':d<20?'10–20 ft':d<30?'20–30 ft':'30+ ft'; }
let stats=store.state.stats;
function recordPutt(d, made){
  const k=bucketName(d);
  stats[k]=stats[k]||[0,0];
  stats[k][0]+=made?1:0; stats[k][1]++;

  updateStatsUI();
}
function updateStatsUI(){
  document.getElementById('uiSG').textContent=(sessionSG>=0?'+':'')+sessionSG.toFixed(2);
  const keys=Object.keys(PGA_MAKE).filter(k=>stats[k]);
  document.getElementById('uiBuckets').innerHTML = keys.length
    ? keys.map(k=>{
        const [m,a]=stats[k];
        return `${k}: <b style="color:var(--accent)">${m}/${a}</b> (${Math.round(m/a*100)}% · reference ${PGA_MAKE[k]}%)`;
      }).join('<br>')
    : 'No putts yet.';
}

let accumulator=0;
function physics(dt){
  if(!ball.moving){ accumulator=0;return; }
  accumulator+=dt;
  while(accumulator>=STEP && ball.moving){
    accumulator-=STEP;
    const event=rollStep(ball,level,physicsOptions());
    if(event==='holed'){ holed=true;dropT=0;onHoled(); }
    else if(event==='stopped')onStopped();
  }
  pushTrail(ball.x,ball.y);
}
function simulatePath(x,y,vx,vy){ return simulate(level,{x,y,vx,vy},physicsOptions()).pts; }

// Scene and terrain presentation.
const {renderer,scene,camera,controls,sun,rough}=createScene(document.getElementById('stage'));
renderer.domElement.addEventListener('webglcontextlost',e=>{
  e.preventDefault();contextLost=true;cancelAim();audio.pause();persist();dialogs.open('graphicsLost');
});
renderer.domElement.addEventListener('webglcontextrestored',()=>{
  // Reload the checkpoint to rebuild all GPU resources together.
  location.reload();
});
// grid/contour toggle uniform shared with the terrain shader
const uContour={value:1};

let terrain=null, holeGroup=null;

function buildTerrain(){
  if(terrain){ scene.remove(terrain); disposeObj(terrain); }
  const SEGX=settings.quality==='low'?90:150, SEGZ=settings.quality==='low'?60:100;
  const geo=new THREE.PlaneGeometry(GW, GH, SEGX, SEGZ);
  geo.rotateX(-Math.PI/2);
  geo.translate(GW/2, 0, GH/2);
  const pos=geo.attributes.position;

  // elevation range for the colour ramp
  let mn=1e9,mx=-1e9;
  for(let i=0;i<pos.count;i++){
    const h=elev(pos.getX(i), pos.getZ(i));
    if(h<mn)mn=h; if(h>mx)mx=h;
  }
  const rng=(mx-mn)||1;

  const colors=new Float32Array(pos.count*3);
  const tn=currentTheme().tint;                 // green-theme colour multiplier
  for(let i=0;i<pos.count;i++){
    const fx=pos.getX(i), fz=pos.getZ(i);
    const h=elev(fx,fz);
    pos.setY(i, h*VS);
    const [r,g,b]=heightColor(mx-mn<0.001?0.5:(h-mn)/rng);
    colors[i*3]=Math.min(1,r*tn[0]); colors[i*3+1]=Math.min(1,g*tn[1]); colors[i*3+2]=Math.min(1,b*tn[2]);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  geo.computeVertexNormals();

  const mat=new THREE.MeshStandardMaterial({vertexColors:true, roughness:0.92, metalness:0});
  // inject contour lines (iso-elevation every 0.25 ft) into the standard shader
  mat.onBeforeCompile=(sh)=>{
    sh.uniforms.uContour=uContour;
    sh.vertexShader=sh.vertexShader
      .replace('#include <common>','#include <common>\nvarying float vHft;\nvarying vec2 vGpos;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>\nvHft = position.y * ${(1/VS).toFixed(6)};\nvGpos = vec2(position.x, position.z);`);
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nvarying float vHft;\nvarying vec2 vGpos;\nuniform float uContour;')
      .replace('#include <color_fragment>',`#include <color_fragment>
      {
        // contour lines every 0.25 ft of elevation
        float hh = vHft / 0.25;
        float f  = abs(fract(hh) - 0.5);
        float w  = fwidth(hh) * 1.2;
        float line = 1.0 - smoothstep(0.0, max(w, 1e-4), f);
        diffuseColor.rgb *= 1.0 - line * 0.30 * uContour;
        // GSPro-style putting grid draped on the surface, 2 ft squares
        vec2 gp = vGpos / 2.0;
        vec2 gf = abs(fract(gp) - 0.5);
        vec2 gw = fwidth(gp) * 1.1;
        float gl = max(1.0 - smoothstep(0.0, max(gw.x,1e-4), gf.x),
                       1.0 - smoothstep(0.0, max(gw.y,1e-4), gf.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82,0.92,0.84), gl * 0.15 * uContour);
      }`);
  };
  terrain=new THREE.Mesh(geo, mat);
  terrain.receiveShadow=true;
  scene.add(terrain);

  rough.position.set(GW/2, mn*VS-0.35, GH/2);
}

function buildHole(){
  if(holeGroup){ scene.remove(holeGroup); disposeObj(holeGroup); }
  holeGroup=new THREE.Group();
  const {x,y}=level.hole;
  const hY=elev(x,y)*VS;
  // cup disc + rim, draped vertex-by-vertex on the terrain so the circle never
  // gets swallowed by a slope (a flat disc at one height clips into the green)
  const drape=(geo,lift)=>{
    const p=geo.attributes.position;
    for(let i=0;i<p.count;i++){
      p.setY(i, elev(p.getX(i), p.getZ(i))*VS + lift);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const cupGeo=new THREE.CircleGeometry(level.holeR*1.15, 48).rotateX(-Math.PI/2);
  cupGeo.translate(x, 0, y);
  const cup=new THREE.Mesh(drape(cupGeo,0.05), new THREE.MeshBasicMaterial({color:0x05140a}));
  holeGroup.add(cup);
  const rimGeo=new THREE.RingGeometry(level.holeR*1.15, level.holeR*1.32, 48).rotateX(-Math.PI/2);
  rimGeo.translate(x, 0, y);
  const rim=new THREE.Mesh(drape(rimGeo,0.05), new THREE.MeshBasicMaterial({
    color:0xe8efe6, transparent:true, opacity:0.55,
  }));
  holeGroup.add(rim);
  const pole=new THREE.Mesh(
    new THREE.CylinderGeometry(0.04,0.04,4.4,8),
    new THREE.MeshStandardMaterial({color:0xf2f2f2, roughness:0.4})
  );
  pole.position.set(x, hY+2.2, y);
  pole.castShadow=true;
  holeGroup.add(pole);
  const flagGeo=new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0,0,0,  1.3,-0.22,0,  0,-0.45,0
  ],3));
  flagGeo.computeVertexNormals();
  const flag=new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({color:0xe0413f, side:THREE.DoubleSide}));
  flag.position.set(x, hY+4.3, y);
  holeGroup.add(flag);
  scene.add(holeGroup);
}

// ---- break flow field (GSPro / PGA-2K style) --------------------------------
// Thousands of small dots that drift downhill along the local gradient.
// Flow speed & brightness encode slope severity; they fade in/out and respawn
// on a jittered grid so coverage stays even. Far more readable than arrows.
const flow={pts:null, geo:null, N:0, homeX:null, homeZ:null, age:null, life:2.4};

let _dotTex=null;
function dotSprite(){
  if(_dotTex) return _dotTex;
  const c=document.createElement('canvas'); c.width=c.height=64;
  const g=c.getContext('2d');
  const r=g.createRadialGradient(32,32,0,32,32,30);
  r.addColorStop(0,'rgba(255,255,255,1)');
  r.addColorStop(0.6,'rgba(255,255,255,.85)');
  r.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=r; g.fillRect(0,0,64,64);
  _dotTex=new THREE.CanvasTexture(c);
  return _dotTex;
}

function buildFlow(){
  if(flow.pts){ scene.remove(flow.pts); flow.geo.dispose(); flow.pts.material.dispose(); }
  const spc=settings.quality==='low'?1.8:1.3, jit=0.55;
  const xs=Math.floor((GW-2)/spc), zs=Math.floor((GH-2)/spc);
  const N=flow.N=xs*zs;
  const posA=new Float32Array(N*3), colA=new Float32Array(N*3);
  flow.homeX=new Float32Array(N); flow.homeZ=new Float32Array(N);
  flow.age=new Float32Array(N);
  const rnd=mulberry32(level.n*7919+13);
  let i=0;
  for(let zi=0; zi<zs; zi++){
    for(let xi=0; xi<xs; xi++){
      const hx=1+xi*spc + (rnd()-0.5)*jit;
      const hz=1+zi*spc + (rnd()-0.5)*jit;
      flow.homeX[i]=hx; flow.homeZ[i]=hz;
      flow.age[i]=rnd()*flow.life;            // staggered so dots don't pulse in sync
      posA[i*3]=hx; posA[i*3+1]=elev(hx,hz)*VS+0.09; posA[i*3+2]=hz;
      i++;
    }
  }
  flow.geo=new THREE.BufferGeometry();
  flow.geo.setAttribute('position', new THREE.BufferAttribute(posA,3).setUsage(THREE.DynamicDrawUsage));
  flow.geo.setAttribute('color',    new THREE.BufferAttribute(colA,3).setUsage(THREE.DynamicDrawUsage));
  flow.pts=new THREE.Points(flow.geo, new THREE.PointsMaterial({
    size:0.16, vertexColors:true, transparent:true, map:dotSprite(),
    blending:THREE.AdditiveBlending, depthWrite:false,
  }));
  flow.pts.frustumCulled=false;
  flow.pts.visible=document.getElementById('optSlope').checked;
  scene.add(flow.pts);updateFlow(0);
}

function updateFlow(dt){
  if(!flow.pts || !flow.pts.visible) return;
  const p=flow.geo.attributes.position, c=flow.geo.attributes.color;
  for(let i=0;i<flow.N;i++){
    let a=flow.age[i]+dt;
    let x=p.getX(i), z=p.getZ(i);
    if(a>flow.life || x<0.5 || x>GW-0.5 || z<0.5 || z>GH-0.5){
      a=0; x=flow.homeX[i]; z=flow.homeZ[i];
    }
    const g=gradEff(x,z);
    const mag=Math.hypot(g.x,g.y);
    if(mag>1e-4){
      const spd=Math.min(3.2, mag*75);        // visual ft/s: steeper = faster drift
      x += (-g.x/mag)*spd*dt;
      z += (-g.y/mag)*spd*dt;
    }
    p.setXYZ(i, x, elev(x,z)*VS+0.09, z);
    const fade=Math.sin(Math.PI*Math.min(1, a/flow.life));
    const bright=Math.min(1, 0.15+mag*20)*fade;
    c.setXYZ(i, bright, bright, bright);
    flow.age[i]=a;
  }
  p.needsUpdate=true; c.needsUpdate=true;
}

// ---- ball -----------------------------------------------------------------
const ballMesh=new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 24, 18),
  new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.35})
);
ballMesh.castShadow=true;
scene.add(ballMesh);

// ---- trail (preallocated line) ---------------------------------------------
const TRAIL_MAX=4000;
const trailGeo=new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX*3),3).setUsage(THREE.DynamicDrawUsage));
trailGeo.setDrawRange(0,0);
const trailLine=new THREE.Line(trailGeo, new THREE.LineBasicMaterial({color:0xffffff, transparent:true, opacity:0.65}));
trailLine.frustumCulled=false;
scene.add(trailLine);
let trailCount=0;

function pushTrail(fx,fz){
  if(trailCount>=TRAIL_MAX) return;
  const a=trailGeo.attributes.position;
  a.setXYZ(trailCount, fx, elev(fx,fz)*VS+0.12, fz);
  trailCount++;
  trailGeo.setDrawRange(0,trailCount);
  a.needsUpdate=true;
}
function resetTrail(){ trailCount=0; trailGeo.setDrawRange(0,0); }

// ---- predicted path (points cloud reads as a dashed line) -------------------
const PRED_MAX=1200;
const predGeo=new THREE.BufferGeometry();
predGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PRED_MAX*3),3).setUsage(THREE.DynamicDrawUsage));
predGeo.setDrawRange(0,0);
const predPts=new THREE.Points(predGeo, new THREE.PointsMaterial({color:0xffeb78, size:0.16, transparent:true, opacity:0.9}));
predPts.frustumCulled=false;
scene.add(predPts);
const finishGeo=new THREE.RingGeometry(0.35,0.46,40).rotateX(-Math.PI/2);
const finishRing=new THREE.Mesh(finishGeo,new THREE.MeshBasicMaterial({color:0xffeb78,side:THREE.DoubleSide,depthTest:false}));
finishRing.renderOrder=2;finishRing.visible=false;scene.add(finishRing);
const finishLabel=document.getElementById('finishMarkerLabel');
function hidePrediction(){predGeo.setDrawRange(0,0);finishRing.visible=false;finishLabel.hidden=true;}

let predictionKey='';
function updatePredicted(){
  const show=mode==='practice' && document.getElementById('optPath').checked;
  const aim=currentAim();
  if(!show || ball.moving || holed || !aim){ predictionKey='';hidePrediction(); return; }
  const key=JSON.stringify([LV,ball.x,ball.y,aim,physicsOptions(),document.getElementById('optErr').checked]);
  if(key===predictionKey)return;predictionKey=key;
  const prediction=simulate(level,{x:ball.x,y:ball.y,vx:aim.vx,vy:aim.vy},physicsOptions());
  const pts=prediction.pts;
  const a=predGeo.attributes.position;
  const n=Math.min(pts.length, PRED_MAX);
  for(let i=0;i<n;i++){
    a.setXYZ(i, pts[i].x, elev(pts[i].x,pts[i].y)*VS+0.15, pts[i].y);
  }
  predGeo.setDrawRange(0,n);
  a.needsUpdate=true;
  // A simulation that reaches its time limit has no known stopping point.
  finishRing.visible=!prediction.ball.moving;
  finishRing.position.set(prediction.ball.x,elev(prediction.ball.x,prediction.ball.y)*VS+0.24,prediction.ball.y);
  finishLabel.textContent=prediction.holed?'Expected finish · in cup':'Expected finish';
  if(document.getElementById('optErr').checked)finishLabel.textContent+=' · before stroke error';
}
function positionFinishLabel(){
  finishLabel.hidden=!finishRing.visible || modalOpen;
  if(finishLabel.hidden)return;
  const point=finishRing.position.clone().project(camera);
  if(point.z< -1 || point.z>1 || Math.abs(point.x)>1 || Math.abs(point.y)>1){finishLabel.hidden=true;return;}
  finishLabel.style.left=Math.max(90,Math.min(innerWidth-90,(point.x+1)*innerWidth/2))+'px';
  finishLabel.style.top=Math.max(24,Math.min(innerHeight-40,(1-point.y)*innerHeight/2-28))+'px';
}

// ---- green read (the caddie card) ---------------------------------------------
// Numbers a caddie would give you: rise/fall to the cup, slope % at the hole,
// and how far a dead-straight putt at holing pace would miss — the concrete
// "aim X feet into the hill" read that teaches green-reading fastest.
function updateRead(){
  const h=level.hole;
  // rise / fall
  const dh=elev(h.x,h.y)-elev(ball.x,ball.y);
  document.getElementById('uiElev').textContent=
    Math.abs(dh)<0.05 ? 'flat' : (dh>0?'+':'')+dh.toFixed(1)+' ft '+(dh>0?'uphill':'downhill');
  // slope % at the hole
  const gh=grad(h.x,h.y);
  document.getElementById('uiSlopeHole').textContent=(Math.hypot(gh.x,gh.y)*100).toFixed(1)+'%';
  // grain direction & strength (screen arrows: default camera looks "up" the green)
  if(level.grain && document.getElementById('optGrain').checked){
    const dirs=['→','↘','↓','↙','←','↖','↑','↗'];
    const idx=((Math.round(Math.atan2(level.grain.hy,level.grain.hx)/(Math.PI/4))%8)+8)%8;
    const m=level.grain.mag;
    document.getElementById('uiGrain').textContent=
      dirs[idx]+' '+(m<0.003?'light':m<0.0045?'medium':'strong');
  }else{
    document.getElementById('uiGrain').textContent='off';
  }
  // straight-aim miss: simulate aiming dead at the cup at holing pace
  const d0=dist(ball,h);
  if(d0<0.8){ document.getElementById('uiBreakFt').textContent='—'; return; }
  const mu=frictionDecel();
  const ang=Math.atan2(h.y-ball.y, h.x-ball.x);
  const v=Math.min(MAXSPEED, Math.sqrt(2*mu*(d0+1.5)));   // pace to die ~1.5 ft past
  const pts=simulatePath(ball.x, ball.y, Math.cos(ang)*v, Math.sin(ang)*v);
  const end=pts[pts.length-1];
  if(Math.hypot(end.x-h.x,end.y-h.y)<level.holeR+0.02){
    document.getElementById('uiBreakFt').textContent='drops straight';
    return;
  }
  // player's right = (-sin, cos) of the aim angle, seen from behind the ball
  const latR=-(end.x-h.x)*Math.sin(ang) + (end.y-h.y)*Math.cos(ang);
  document.getElementById('uiBreakFt').textContent=
    Math.abs(latR)<0.2 ? '≈ straight' : Math.abs(latR).toFixed(1)+' ft '+(latR>0?'right →':'← left');
}

// ---- best line to hole (solver) ----------------------------------------------
// Searches aim angle × speed through the real physics for a putt that holes
// out, preferring a soft "dying" arrival (~2.5 ft/s) — the line a pro would
// pick. Falls back to the closest-finishing putt if nothing holes (shown amber).
let bestLineMesh=null;
function drawBestRoute(route){
  if(bestLineMesh){ scene.remove(bestLineMesh); bestLineMesh.geometry.dispose(); bestLineMesh.material.dispose(); bestLineMesh=null; }
  if(!route || route.pts.length<2) return;
  const step=Math.max(1, Math.floor(route.pts.length/100));
  const v3=[];
  for(let i=0;i<route.pts.length;i+=step){
    const p=route.pts[i];
    v3.push(new THREE.Vector3(p.x, elev(p.x,p.y)*VS+0.18, p.y));
  }
  const last=route.pts[route.pts.length-1];
  v3.push(new THREE.Vector3(last.x, elev(last.x,last.y)*VS+0.18, last.y));
  bestLineMesh=new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v3), 120, 0.055, 6, false),
    new THREE.MeshBasicMaterial({color:route.holed?0x7ee081:0xffa340, transparent:true, opacity:0.85})
  );
  scene.add(bestLineMesh);
}

let solverWorker=null,solverRequest=0;
function stopSolver(){ solverRequest++;solverWorker?.terminate();solverWorker=null; }
function refreshBestRoute(){
  stopSolver();
  const on=document.getElementById('optBest').checked;
  if(!on || ball.moving || holed){
    document.getElementById('guideStatus').textContent='';drawBestRoute(null); return;
  }
  drawBestRoute(null);
  const id=solverRequest;
  document.getElementById('guideStatus').textContent='Finding a line…';
  try{
    solverWorker=new Worker(new URL('./solver.worker.js',import.meta.url),{type:'module'});
    solverWorker.onmessage=({data})=>{
      if(data.id!==solverRequest)return;
      document.getElementById('guideStatus').textContent=data.error?'Guide unavailable. Try again.':data.route?.holed?'Makeable line · solid green':'Closest route found · amber';
      if(!data.error)drawBestRoute(data.route);
      solverWorker.terminate();solverWorker=null;
    };
    solverWorker.onerror=()=>{document.getElementById('guideStatus').textContent='Guide unavailable. Try again.';stopSolver();};
    solverWorker.postMessage({id,level,ball:{...ball},options:physicsOptions()});
  }catch{document.getElementById('guideStatus').textContent='Guide unavailable in this browser.';}

}

// ---- aim tube ---------------------------------------------------------------
let aimTube=null;
let aimRenderKey='';
function updateAimTube(){
  const value=currentAim();const key=JSON.stringify([value,ball.x,ball.y,aiming,distanceRange]);
  if(key===aimRenderKey)return;aimRenderKey=key;
  if(aimTube){ scene.remove(aimTube); aimTube.geometry.dispose(); aimTube.material.dispose(); aimTube=null; }
  const aim=currentAim();
  const strength=aim?Math.min(1,aim.distance/(aiming?dragRange:distanceRange)):0;
  document.getElementById('pwrFill').style.width=(strength*100)+'%';
  document.getElementById('pwrFill').style.background=
    strength>0.8 ? '#e85050' : strength>0.5 ? '#ffce5a' : 'var(--accent)';
  document.getElementById('uiCarry').textContent=
    aim ? aim.distance.toFixed(1)+' ft on flat ground' : '—';
  if(aiming){
    document.getElementById('powerValue').textContent=(aim?.distance||0).toFixed(1)+' ft';
    document.getElementById('shotPower').value=aim?.distance||0;
    document.getElementById('shotPower').setAttribute('aria-valuetext',(aim?.distance||0).toFixed(1)+' feet on flat ground');
  }
  if((!aiming && !keyboardAim) || !aim) return;
  const len=aim.distance;
  const dir={x:aim.vx, y:aim.vy};
  const dl=Math.hypot(dir.x,dir.y)||1;
  const pts=[];
  const N=30;
  for(let i=0;i<=N;i++){
    const fx=ball.x + dir.x/dl*len*i/N;
    const fz=ball.y + dir.y/dl*len*i/N;
    pts.push(new THREE.Vector3(fx, elev(fx,fz)*VS+0.22, fz));
  }
  const curve=new THREE.CatmullRomCurve3(pts);
  const col=strength>0.8?0xe85050:strength>0.5?0xffce5a:0x7ee081;
  aimTube=new THREE.Mesh(
    new THREE.TubeGeometry(curve, 30, 0.07, 6, false),
    new THREE.MeshBasicMaterial({color:col, transparent:true, opacity:0.95})
  );
  scene.add(aimTube);
}

// ---------------------------------------------------------------------------
//  AIMING (slingshot via raycast onto the ball-height plane)
// ---------------------------------------------------------------------------
const raycaster=new THREE.Raycaster();
const ndc=new THREE.Vector2();

function rayAt(e){
  const r=renderer.domElement.getBoundingClientRect();
  ndc.x=((e.clientX-r.left)/r.width)*2-1;
  ndc.y=-((e.clientY-r.top)/r.height)*2+1;
  raycaster.setFromCamera(ndc, camera);
}
function planeHit(){
  const plane=new THREE.Plane(new THREE.Vector3(0,1,0), -(elev(ball.x,ball.y)*VS));
  const out=new THREE.Vector3();
  return raycaster.ray.intersectPlane(plane, out) ? out : null;
}
function currentAim(){
  return aiming?dragAim:keyboardAim;
}
function updateDragAim(e){
  const sample=dragGesture.move(e.clientX,e.clientY,e.timeStamp);
  if(sample.distance<0.2){dragAim=null;return;}
  rayAt({clientX:sample.x,clientY:sample.y});
  aimPlanePt=planeHit();if(!aimPlanePt)return;
  const dx=aimOriginPt.x-aimPlanePt.x, dz=aimOriginPt.z-aimPlanePt.z;     // slingshot direction (world)
  if(Math.hypot(dx,dz)<1e-4){dragAim=null;return;}
  const ang=Math.atan2(dz,dx);
  const sp=distanceCalibration(stimp).speedForDistance(sample.distance);
  dragAim={vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp,power:sp/MAXSPEED,distance:sample.distance};
}

function clearAim(){
  aiming=false;aimPointerId=null;controls.enabled=true;
  dragGesture=null;dragAim=null;
  aimPlanePt=null;aimOriginPt=null;aimStartPx=aimNowPx=null;keyboardAim=null;
  document.getElementById('btnPutt').textContent='Putt';if(level)syncKeyboard(false);updatePredicted();
}
function cancelAim(){ input.cancel(); }
function takeShot(aim){
  if(!aim || ball.moving || holed || paused())return;
  let {vx,vy}=aim;
  if(mode==='practice' && document.getElementById('optErr').checked){
    const ea=gauss()*0.014*aim.power,ev=1+gauss()*0.018*(0.5+aim.power);
    const ca=Math.cos(ea),sa=Math.sin(ea);
    [vx,vy]=[(vx*ca-vy*sa)*ev,(vx*sa+vy*ca)*ev];
  }
  Object.assign(ball,launch(ball.x,ball.y,vx,vy));
  accumulator=0;puttStart={x:ball.x,y:ball.y,d:dist(ball,level.hole)};
  sndClick(aim.power);resetTrail();pushTrail(ball.x,ball.y);
  stopSolver();drawBestRoute(null);strokes++;cancelAim();updateUI();persist();
  announce('Putt '+strokes+'. Ball rolling.');
  if(tutorial)setLesson(2);
}
const input=bindSlingshot(renderer.domElement,{
  canStart:()=>!ball.moving && !holed && !paused(),
  hit:e=>{
    rayAt(e);const point=planeHit();if(!point)return null;
    // A screen-space target remains comfortable at every camera zoom.
    const screen=worldToScreen(ball.x,ball.y);
    const radius=e.pointerType==='touch'?44:28;
    return Math.hypot(e.clientX-screen.x,e.clientY-screen.y)<=radius?point:null;
  },
  onStart:(e,point)=>{
    camAnim=null;keyboardAim=null;aiming=true;aimPointerId=e.pointerId;aimOriginPt=point.clone();aimPlanePt=point;
    aimStartPx={x:e.clientX,y:e.clientY};aimNowPx=aimStartPx;controls.enabled=false;
    dragRange=distanceRange;dragAim=null;
    dragGesture=createDragGesture({x:e.clientX,y:e.clientY,maxPull:maxDragPx(),range:dragRange,time:e.timeStamp});
    document.getElementById('btnPutt').textContent='Release to putt';
    if(tutorial)setLesson(1);
  },
  onMove:e=>updateDragAim(e),
  onRelease:()=>takeShot(currentAim()),
  onCancel:clearAim,
});

// ---------------------------------------------------------------------------
//  GAME FLOW & UI
// ---------------------------------------------------------------------------
let breakStat='—';
function computeBreakStat(){
  let mx=0;
  for(let t=0;t<=1;t+=0.05){
    const x=level.ball.x+(level.hole.x-level.ball.x)*t;
    const y=level.ball.y+(level.hole.y-level.ball.y)*t;
    const g=grad(x,y); mx=Math.max(mx,Math.hypot(g.x,g.y));
  }
  breakStat = mx<0.012?'gentle':mx<0.03?'moderate':mx<0.05?'strong':'severe';
}
function fmtVsPar(v){return v===0?'E':(v>0?'+'+v:''+v);}
function updateUI(){
  for(const id of ['btnPutt','aimLeft','aimRight','shotPower','fullRange'])document.getElementById(id).disabled=ball.moving||holed;
  for(const id of ['optPath','optBest','optGrain','optErr','stimpSlider'])document.getElementById(id).disabled=mode==='career'||tutorial||ball.moving;
  document.getElementById('uiLevel').textContent=LV+' / 50';
  document.getElementById('hudLevel').textContent='Lv '+LV;
  document.getElementById('uiPar').textContent=level.par;
  document.getElementById('uiStrokes').textContent=strokes;
  document.getElementById('uiTotal').textContent=fmtVsPar(totalVsPar);
  document.getElementById('hudVsPar').textContent=fmtVsPar(totalVsPar);
  // compact score chip (visible on phones)
  document.getElementById('scLevel').textContent=LV+'/50';
  document.getElementById('scPar').textContent=level.par;
  document.getElementById('scStrokes').textContent=strokes;
  document.getElementById('scTotal').textContent=fmtVsPar(totalVsPar);
  document.getElementById('uiDist').textContent=dist(ball,level.hole).toFixed(1)+' ft';
  document.getElementById('uiStimp').textContent=stimp.toFixed(1);
  document.getElementById('uiBreak').textContent=breakStat;
}
function showMsg(t,s){document.getElementById('msgText').innerHTML=t+(s?`<small>${s}</small>`:'');dialogs.open('result');}
function hideMsg(){if(document.getElementById('result').classList.contains('hidden')===false)dialogs.close();}

function resultActions(){
  document.getElementById('continueHole').hidden=LV>=50 || tutorial;
  document.getElementById('replayResult').hidden=mode!=='practice' || tutorial;
  document.getElementById('finishLesson').hidden=!tutorial;
  document.getElementById('restartResult').hidden=tutorial;
}
function onHoled(){
  sndDrop();
  if(tutorial){
    settings.tutorialDone=true;persist();resultActions();
    showMsg('Your first read, made.', 'You controlled direction and pace. Next, try a sloping practice green.');return;
  }
  if(mode==='career')celebrate();
  if(puttStart){recordPutt(puttStart.d,true);puttStart=null;}
  sessionSG+=expPutts(firstPuttD)-strokes;totalVsPar+=strokes-level.par;
  updateStatsUI();updateUI();resultActions();
  if(LV===50 && mode==='career')runSummary();
  else {
    completed=LV===50;
    showMsg(completed?'Course complete!':golfTerm(strokes,level.par),`Holed in ${strokes} · ${firstPuttD.toFixed(1)} ft · ${fmtVsPar(totalVsPar)} total vs par`);
  }
  persist();announce('Holed in '+strokes+'. '+(LV<50?'Continue when ready.':'Course complete.'));
}
function onStopped(){
  if(tutorial){
    puttStart=null;updateUI();updateRead();resetKeyboard();
    setLesson(3);return;
  }
  if(puttStart){
    const fin=dist(ball,level.hole);
    // same side of the hole as where you started = left it short
    const side=(ball.x-level.hole.x)*(puttStart.x-level.hole.x)
             + (ball.y-level.hole.y)*(puttStart.y-level.hole.y);
    document.getElementById('uiLast').textContent=
      `${fin.toFixed(1)} ft ${side>0?'short':'past'}`;
    recordPutt(puttStart.d, false);
    puttStart=null;
  }
  updateUI();
  document.getElementById('btnPutt').textContent='Putt';
  refreshBestRoute(); updateRead();
  resetKeyboard();persist();announce(document.getElementById('uiLast').textContent);
  snapCamera(true);                 // glide behind the ball's new lie
}

// Career celebration: scale the juice to the hole result and bank points.
function celebrate(){
  streakCount = nextStreak(streakCount, strokes, level.par);
  const r = holeScore({ distFt:firstPuttD, diff:level.diff,
    stimp, strokes, par:level.par, streak:streakCount });
  runScore += r.points;
  setRunScore(runScore);

  const cup=worldToScreen(level.hole.x, level.hole.y);
  scorePopup(cup.x, cup.y, r.points);

  const label=golfTerm(strokes, level.par);
  if(r.tier==='onePutt'){
    bigText(r.bomb?('💣 '+label):('⛳ '+label), '#ffd84a');
    burstConfetti(cup.x, cup.y, 90, ['#7ee081','#ffce5a','#ffffff','#e0413f','#5aa9ff']);
    sndCelebrate(true);
  } else if(r.tier==='birdie'){
    bigText(label, '#7ee081');
    burstConfetti(cup.x, cup.y, 36, ['#7ee081','#ffce5a','#ffffff']);
    sndCelebrate(false);
  } else if(r.tier==='par'){
    bigText(label, '#e8f0e6');
  } else {
    bigText(label, '#9bb0a2');
  }

  const sEl=document.getElementById('runStreak');
  sEl.textContent = streakCount>=2 ? ('🔥 ×'+streakCount) : '';

  careerProgress(r);
}

let camAnim=null;
function snapCamera(animate){
  const bx=ball.x, bz=ball.y;
  const hx=level.hole.x, hz=level.hole.y;
  const d=Math.hypot(hx-bx,hz-bz)||1;
  const dx=(hx-bx)/d, dz=(hz-bz)/d;
  const bY=elev(bx,bz)*VS;
  // higher & pitched down: horizon at the top edge (no wasted sky) and the
  // ball ~60% down the screen so there is drag room beneath it
  const adv=Math.min(4, d*0.2);
  const extra=Math.max(0,d-12), back=14+extra*1.2, height=12+extra*0.9;
  const toP=new THREE.Vector3(bx-dx*back, bY+height, bz-dz*back);
  const toT=new THREE.Vector3(bx+dx*adv, elev(bx+dx*adv, bz+dz*adv)*VS, bz+dz*adv);
  if(animate && !reducedMotion()){
    camAnim={t:0, fromP:camera.position.clone(), fromT:controls.target.clone(), toP, toT};
  }else{
    camAnim=null;
    camera.position.copy(toP);
    controls.target.copy(toT);
    controls.update();
  }
}

function loadLevel(n, fixed){
  cancelAim();
  clearTimeout(nextLevelTimer); nextLevelTimer=null;   // cancel any pending auto-advance so manual nav can't double-skip
  LV=n;stimp=mode==='career'||tutorial?10:userStimp;
  level=makeLevel(n, fixed);predictionKey='';
  ball.x=level.ball.x; ball.y=level.ball.y;
  ball.vx=ball.vy=0; ball.moving=false; ball.rolling=true;
  strokes=0; holed=false; dropT=1; aiming=false; aimPlanePt=null;
  puttStart=null;
  firstPuttD=dist(level.ball, level.hole);
  document.getElementById('uiLast').textContent='—';
  updateStatsUI();
  resetTrail();
  buildTerrain(); buildHole(); buildFlow();
  computeBreakStat(); updateUI(); hideMsg();
  refreshBestRoute(); updateRead();
  document.getElementById('btnPutt').textContent='Putt';
  snapCamera();resetKeyboard();persist();
}

// replay keeps the same pin & ball so you can retry the exact line
function replayLevel(){
  if(tutorial){startLesson();return;}
  if(mode!=='practice')return;
  if(holed && !tutorial){totalVsPar-=strokes-level.par;sessionSG-=expPutts(firstPuttD)-strokes;}
  completed=false;
  // Restart this hole from the same pin & ball (retry the line).
  loadLevel(LV, { hole:level.hole, ball:level.ball });
}
document.getElementById('btnRetry').onclick=()=>replayLevel();
function skipLevel(){
  if(mode==='practice' && LV<50 && !tutorial) loadLevel(LV+1);
}
document.getElementById('btnNext').onclick=skipLevel;
document.getElementById('btnCam').onclick=()=>snapCamera(true);
document.getElementById('stimpSlider').oninput=e=>{
  if(mode!=='practice' || ball.moving || tutorial)return;
  userStimp=+e.target.value; stimp=userStimp; settings.stimp=userStimp;updateUI(); refreshBestRoute(); updateRead();resetKeyboard();persist();
};
document.getElementById('optBest').onchange=()=>refreshBestRoute();
document.getElementById('optGrain').onchange=()=>{refreshBestRoute(); updateRead();resetKeyboard();};

// crouch read: drop to ball height and sight down the line, like a real read
function readCamera(){
  const bx=ball.x, bz=ball.y, hl=level.hole;
  const d=Math.hypot(hl.x-bx,hl.y-bz)||1;
  const dx=(hl.x-bx)/d, dz=(hl.y-bz)/d;
  const bY=elev(bx,bz)*VS;
  camAnim={t:0, fromP:camera.position.clone(), fromT:controls.target.clone(),
    toP:new THREE.Vector3(bx-dx*5, bY+1.7, bz-dz*5),
    toT:new THREE.Vector3(hl.x, elev(hl.x,hl.y)*VS+0.3, hl.y)};
  if(reducedMotion()){camera.position.copy(camAnim.toP);controls.target.copy(camAnim.toT);camAnim=null;controls.update();}
}
document.getElementById('optSlope').onchange=e=>{flow.pts.visible=e.target.checked;};
document.getElementById('optGrid').onchange=e=>{uContour.value=e.target.checked?1:0;};
function toggleAid(id){
  const el=document.getElementById(id);if(el.disabled)return;
  el.checked=!el.checked;el.dispatchEvent(new Event('change'));
}
window.addEventListener('keydown',e=>{
  if(modalOpen)return;
  if(e.target.matches('input,select,textarea,button,summary,a') && e.target!==renderer.domElement)return;
  const key=e.key.toLowerCase();
  if(['arrowleft','arrowright','arrowup','arrowdown',' '].includes(key)){
    e.preventDefault();if(ball.moving || holed || paused())return;
    if(!keyboardAim)resetKeyboard(true);
    if(key==='arrowleft')adjustKeyboard(-1,0);
    if(key==='arrowright')adjustKeyboard(1,0);
    if(key==='arrowup')adjustKeyboard(0,1);
    if(key==='arrowdown')adjustKeyboard(0,-1);
    if(key===' '){takeShot(keyboardAim);return;}
    return;
  }
  if(key==='escape')cancelAim();
  if(key==='r')replayLevel();
  if(key==='p')toggleAid('optPath');
  if(key==='b')toggleAid('optBest');
  if(key==='s')toggleAid('optSlope');
  if(key==='c')snapCamera(true);
  if(key==='v')readCamera();
  if(key==='n')skipLevel();
  if(key==='h')togglePanels();
});

// ---------------------------------------------------------------------------
//  RESIZE & MAIN LOOP
// ---------------------------------------------------------------------------
function onResize(){
  const w=window.innerWidth, h=window.innerHeight;
  renderer.setPixelRatio(settings.quality==='low'?1:Math.min(window.devicePixelRatio,settings.quality==='high'?2:1.5));
  renderer.shadowMap.enabled=settings.quality!=='low';
  renderer.setSize(w,h);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize',()=>{cancelAim();onResize();});
new ResizeObserver(([entry])=>{
  document.documentElement.style.setProperty('--putt-controls-height',entry.target.getBoundingClientRect().height+'px');
}).observe(document.getElementById('shotControls'));

const panelEl=document.getElementById('panel');
const readCardEl=document.getElementById('readCard');
const isPhone=()=>window.innerWidth<760;
function togglePanels(){
  const hide=!panelEl.classList.contains('hidden');
  panelEl.classList.toggle('hidden', hide);
  document.getElementById('panelToggle').setAttribute('aria-expanded',String(!hide));
  // ☰ only opens/closes the control panel; the green-read card stays up.
  // On phones the floating quick buttons make way for the open bottom sheet.
  document.getElementById('quickBtns').style.display = !hide && isPhone() ? 'none' : '';
}
document.getElementById('panelToggle').onclick=togglePanels;
panelEl.classList.add('hidden');   // control panel starts collapsed — tap ☰ to open

// phone quick buttons: retry + best-line toggle without opening the sheet
document.getElementById('qbRetry').onclick=()=>replayLevel();
const optPathEl=document.getElementById('optPath');
function syncPathBtn(){ document.getElementById('qbPath').classList.toggle('active', optPathEl.checked); }
document.getElementById('qbPath').onclick=()=>toggleAid('optPath');

const rollAxis=new THREE.Vector3();
let last=performance.now();
function frame(now){
  const dt=Math.min(0.25,(now-last)/1000); last=now;
  if(paused()){audio.pause();finishLabel.hidden=true;if(level && !contextLost){ballMesh.position.set(ball.x,elev(ball.x,ball.y)*VS+BALL_R,ball.y);renderer.render(scene,camera);}requestAnimationFrame(frame);return;}
  if(!level){ requestAnimationFrame(frame); return; }
  physics(dt);

  // live distance-to-hole readout while the ball rolls
  if(ball.moving) document.getElementById('uiDist').textContent=dist(ball,level.hole).toFixed(1)+' ft';

  // ball placement + rolling rotation + sink animation
  let bY=elev(ball.x,ball.y)*VS + BALL_R;
  if(holed && dropT<1){
    dropT=Math.min(1, dropT+dt*3);
    bY -= dropT*(BALL_R*2.4);
  }
  ballMesh.position.set(ball.x, bY, ball.y);
  ballMesh.visible = !(holed && dropT>=1);
  const sp=Math.hypot(ball.vx,ball.vy);
  if(sp>1e-3){
    rollAxis.set(ball.vy/sp, 0, -ball.vx/sp);          // up × v
    ballMesh.rotateOnWorldAxis(rollAxis, -sp*dt/BALL_R * 0.5);
  }

  if(aiming || keyboardAim) updateAimTube();
  updatePredicted();
  if(!reducedMotion())updateFlow(dt);

  // camera glide to the ball's new lie
  if(camAnim){
    camAnim.t+=dt/0.9;
    const k=Math.min(1,camAnim.t);
    const e=k*k*(3-2*k);                       // smoothstep ease
    camera.position.lerpVectors(camAnim.fromP, camAnim.toP, e);
    controls.target.lerpVectors(camAnim.fromT, camAnim.toT, e);
    if(k>=1) camAnim=null;
  }
  updateFx(dt);
  tickScore();
  if(!aiming)controls.update();
  positionFinishLabel();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// --- FX: 2D overlay for particles + DOM popups -------------------------------
const fxCv=document.getElementById('fx'), fxCtx=fxCv.getContext('2d');
function fxResize(){ fxCv.width=window.innerWidth; fxCv.height=window.innerHeight; }
fxResize(); window.addEventListener('resize', fxResize);
let particles=[];
function burstConfetti(sx, sy, n, hues){
  if(reducedMotion())return;
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, sp=2+Math.random()*6;
    particles.push({ x:sx, y:sy, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-3,
      life:1, hue:hues[Math.floor(Math.random()*hues.length)], sz:3+Math.random()*4 });
  }
}
function updateFx(dt){
  fxCtx.clearRect(0,0,fxCv.width,fxCv.height);
  for(const p of particles){
    p.vy += 14*dt; p.x += p.vx; p.y += p.vy; p.life -= dt*0.9;
    fxCtx.globalAlpha=Math.max(0,p.life);
    fxCtx.fillStyle=p.hue;
    fxCtx.fillRect(p.x, p.y, p.sz, p.sz);
  }
  fxCtx.globalAlpha=1;
  particles=particles.filter(p=>p.life>0 && p.y<fxCv.height+20);
}
// world (feet) -> screen pixel, for placing popups at the cup
function worldToScreen(fx, fz){
  const v=new THREE.Vector3(fx, elev(fx,fz)*VS, fz).project(camera);
  return { x:(v.x*0.5+0.5)*fxCv.width, y:(-v.y*0.5+0.5)*fxCv.height };
}
function bigText(txt, color){
  if(reducedMotion())return;
  const el=document.getElementById('bigText');
  el.textContent=txt; el.style.color=color;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function scorePopup(px, py, pts){
  if(reducedMotion())return;
  const el=document.createElement('div');
  el.className='scorePop'; el.textContent='+'+pts.toLocaleString();
  el.style.left=px+'px'; el.style.top=py+'px';
  document.body.appendChild(el);
  void el.offsetWidth; el.classList.add('show');
  setTimeout(()=>el.remove(), 1300);
}
// count-up the run-score HUD
let scoreShown=0, scoreTarget=0;
function setRunScore(v){ scoreShown=scoreTarget=v;document.getElementById('runScore').textContent=v.toLocaleString(); }
function tickScore(){
  if(scoreShown!==scoreTarget){
    const d=scoreTarget-scoreShown;
    scoreShown += Math.sign(d)*Math.max(1, Math.ceil(Math.abs(d)*0.18));
    if((d>0&&scoreShown>scoreTarget)||(d<0&&scoreShown<scoreTarget)) scoreShown=scoreTarget;
    document.getElementById('runScore').textContent=Math.round(scoreShown).toLocaleString();
  }
}
// Mode is selected from tabs in the side panel (no separate menu screen).
const modeTabs={ career:document.getElementById('btnCareer'), practice:document.getElementById('btnPractice') };
function applySettings(){
  userStimp=settings.stimp;stimp=mode==='career'||tutorial?10:userStimp;
  document.body.classList.toggle('careerMode',mode==='career');
  document.body.classList.toggle('tutorialMode',tutorial);
  document.body.classList.toggle('reducedMotion',reducedMotion());
  for(const id of ['optSlope','optPath','optBest','optGrid','optGrain','optErr','optSnd','optMotion']){
    const el=document.getElementById(id);el.checked=settings[id];
  }
  for(const id of ['optPath','optBest','optGrain','optErr','stimpSlider']){
    document.getElementById(id).disabled=mode==='career' || tutorial || ball.moving;
  }
  if(tutorial)document.getElementById('optErr').checked=false;
  if(mode==='career'){
    document.getElementById('optPath').checked=false;document.getElementById('optBest').checked=false;
    document.getElementById('optGrain').checked=true;document.getElementById('optErr').checked=false;
  }
  document.getElementById('stimpSlider').value=stimp;
  document.getElementById('quality').value=settings.quality;
  for(const id of ['btnNext','btnRetry','qbRetry','qbPath'])document.getElementById(id).hidden=mode==='career';
  document.getElementById('modeLabel').textContent=tutorial?'First putt':mode==='career'?'Competition':'Practice';
  document.getElementById('rules').textContent=mode==='career'?'50 fixed holes · Stimp 10 · no retries or shot guides':'Free retries · adjustable speed · optional shot guides';
  document.getElementById('btnCareer').setAttribute('aria-pressed',String(mode==='career'));
  document.getElementById('btnPractice').setAttribute('aria-pressed',String(mode==='practice'));
  flow.pts && (flow.pts.visible=document.getElementById('optSlope').checked);
  uContour.value=settings.optGrid?1:0;syncPathBtn();
}
function startMode(m){
  activeRun=true;
  dialogs.close();tutorial=false;document.getElementById('lesson').hidden=true;
  mode=m;completed=false;totalVsPar=0;runScore=0;streakCount=0;scoreShown=scoreTarget=0;sessionSG=0;
  runStats=freshRun();document.getElementById('runScore').textContent='0';document.getElementById('runStreak').textContent='';
  applySettings();updateCareerUI();loadLevel(1);persist();renderer.domElement.focus();
}
function openHome(){
  persist();document.getElementById('resumeRun').hidden=!savedRun;
  document.getElementById('resumeRun').textContent=savedRun?`Resume ${savedRun.mode==='career'?'competition':'practice'} · hole ${savedRun.LV}`:'Resume';
  dialogs.open('welcome');
}
function resumeRun(){
  const r=validateRun(savedRun);if(!r)return;activeRun=true;
  dialogs.close();tutorial=false;document.getElementById('lesson').hidden=true;
  ready=false;mode=r.mode;applySettings();loadLevel(r.LV);
  ({strokes,totalVsPar,holed,completed,runScore,streakCount,runStats,sessionSG,puttStart}=r);
  Object.assign(ball,r.ball);firstPuttD=dist(level.ball,level.hole);ready=true;
  scoreShown=scoreTarget=runScore;document.getElementById('runScore').textContent=runScore.toLocaleString();
  document.getElementById('runStreak').textContent=streakCount>=2?'🔥 ×'+streakCount:'';
  updateUI();updateStatsUI();updateCareerUI();snapCamera();resetKeyboard();refreshBestRoute();updateRead();
  if(holed){resultActions();showMsg(completed?'Course complete!':'Hole complete',`${runScore.toLocaleString()} points · ${fmtVsPar(totalVsPar)} total vs par`);}
  else renderer.domElement.focus();
}
let keyAngle=0,keyDistance=8,distanceRange=18,fullRange=false;
function resetKeyboard(show=false){
  keyAngle=0;fullRange=false;
  distanceRange=lieRange(dist(ball,level.hole),distanceCalibration(stimp).maxDistance);
  keyDistance=Math.max(0.2,Math.min(distanceRange,Math.round((dist(ball,level.hole)+0.5)*10)/10));
  keyboardAim=null;syncKeyboard(show);
}
function syncKeyboard(show=true){
  const angle=Math.atan2(level.hole.y-ball.y,level.hole.x-ball.x)+keyAngle*Math.PI/180;
  const speed=distanceCalibration(stimp).speedForDistance(keyDistance);
  if(show)keyboardAim={vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,power:speed/MAXSPEED,distance:keyDistance};
  document.getElementById('aimValue').textContent=keyAngle===0?'At cup':Math.abs(keyAngle).toFixed(1)+'° '+(keyAngle>0?'right':'left');
  document.getElementById('powerValue').textContent=keyDistance.toFixed(1)+' ft';
  document.getElementById('shotPower').max=distanceRange;
  document.getElementById('shotPower').value=keyDistance;
  document.getElementById('shotPower').setAttribute('aria-valuetext',keyDistance.toFixed(1)+' feet on flat ground');
  document.getElementById('fullRange').textContent=fullRange?'Use close range':'Extend range';
  document.getElementById('fullRange').setAttribute('aria-pressed',String(fullRange));
  updateAimTube();
}
function adjustKeyboard(angle,power){
  if(ball.moving||holed||aiming)return;
  keyAngle=Math.max(-90,Math.min(90,keyAngle+angle*0.5));
  keyDistance=Math.max(0.2,Math.min(distanceRange,Math.round((keyDistance+power*0.1)*10)/10));syncKeyboard();
}
const lessons=[
  ['1 · Choose a line','This first green is flat. Grab the ball, or use the aim buttons below.'],
  ['2 · Set the distance','Try 8 ft for this flat putt. Drag back, then release; or set the distance and press Putt.'],
  ['3 · Watch the roll','The bar shows flat-ground reach. On sloping greens, uphill stops shorter and downhill runs farther.'],
  ['Try the finish','Adjust your pace and putt again. Retry lesson resets the ball.']
];
function setLesson(step){tutorialStep=step;document.getElementById('lessonTitle').textContent=lessons[step][0];document.getElementById('lessonText').textContent=lessons[step][1];}
function startLesson(){
  dialogs.close();ready=false;activeRun=false;tutorial=true;mode='practice';completed=false;
  loadLevel(1,{ball:{x:30,y:24},hole:{x:30,y:16}});
  level={...level,baseGrad:{x:0,y:0},bumps:[],feats:[],grain:null};
  totalVsPar=0;sessionSG=0;stimp=10;ball.x=30;ball.y=24;strokes=0;firstPuttD=8;computeBreakStat();
  buildTerrain();buildHole();buildFlow();snapCamera();applySettings();updateUI();updateRead();resetKeyboard();
  document.getElementById('lesson').hidden=false;setLesson(0);ready=true;renderer.domElement.focus();
}
modeTabs.career.onclick=modeTabs.practice.onclick=openHome;
document.getElementById('openHome').onclick=openHome;
document.getElementById('startPractice').onclick=()=>startMode('practice');
document.getElementById('startCareer').onclick=()=>startMode('career');
document.getElementById('resumeRun').onclick=resumeRun;
document.getElementById('startLesson').onclick=startLesson;
document.getElementById('lessonRetry').onclick=startLesson;
document.getElementById('lessonSkip').onclick=()=>{tutorial=false;document.getElementById('lesson').hidden=true;openHome();};
document.getElementById('finishLesson').onclick=()=>startMode('practice');
document.getElementById('continueHole').onclick=()=>{if(holed && LV<50){dialogs.close();loadLevel(LV+1);renderer.domElement.focus();}};
document.getElementById('replayResult').onclick=()=>{dialogs.close();replayLevel();renderer.domElement.focus();};
document.getElementById('restartResult').onclick=openHome;
document.getElementById('btnPutt').disabled=false;
document.getElementById('btnPutt').onclick=()=>{if(!keyboardAim)syncKeyboard();takeShot(keyboardAim);};
document.getElementById('aimLeft').onclick=()=>adjustKeyboard(-1,0);
document.getElementById('aimRight').onclick=()=>adjustKeyboard(1,0);
document.getElementById('shotPower').oninput=e=>{if(ball.moving||holed||aiming)return;keyDistance=+e.target.value;syncKeyboard();};
document.getElementById('fullRange').onclick=()=>{
  if(ball.moving||holed||aiming)return;
  fullRange=!fullRange;
  const calibration=distanceCalibration(stimp);
  distanceRange=fullRange?Math.floor(calibration.maxDistance*10)/10:lieRange(dist(ball,level.hole),calibration.maxDistance);
  keyDistance=Math.min(keyDistance,distanceRange);syncKeyboard();
};
for(const id of ['optSlope','optPath','optBest','optGrid','optGrain','optErr','optSnd','optMotion']){
  document.getElementById(id).addEventListener('change',e=>{
    if(e.target.disabled)return;settings[id]=e.target.checked;persist();
    if(id==='optPath')syncPathBtn();
    if(id==='optMotion')document.body.classList.toggle('reducedMotion',reducedMotion());
    if(id==='optSnd' && !settings.optSnd)audio.pause();
  });
}
document.getElementById('quality').onchange=e=>{settings.quality=e.target.value;onResize();buildTerrain();buildFlow();persist();};
document.getElementById('btnBadges').onclick=e=>{renderBadges();dialogs.open('badges',e.currentTarget);};
document.getElementById('btnLocker').onclick=e=>{renderLocker();dialogs.open('locker',e.currentTarget);};
document.getElementById('btnHelp').onclick=e=>dialogs.open('help',e.currentTarget);
document.getElementById('graphicsReload').onclick=()=>location.reload();
document.getElementById('ballGrid').onclick=e=>{const el=e.target.closest('[data-id]');if(el)equipItem(el.dataset.kind,el.dataset.id);};
document.getElementById('themeGrid').onclick=e=>{const el=e.target.closest('[data-id]');if(el)equipItem(el.dataset.kind,el.dataset.id);};
window.addEventListener('blur',()=>{cancelAim();audio.pause();});
document.addEventListener('visibilitychange',()=>{cancelAim();audio.pause();last=performance.now();persist();});
window.addEventListener('pagehide',persist);
applyCosmetics();onResize();applySettings();loadLevel(1);
requestAnimationFrame(frame);openHome();ready=true;
}
