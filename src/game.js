import * as THREE from 'three';
import { createScene, heightColor, disposeObj } from './rendering.js';
import { GW, GH, VS, G, MAXSPEED, BALL_R, STEP, COURSE_VERSION } from './constants.js';
import { makeLevel, mulberry32, dist } from './course.js';
import { elevOf, gradOf } from './terrain.js';
import { launch, rollStep, simulate, effectiveGradient, onFringe } from './physics.js';
import { resultTier, golfTerm, streakMultiplier, nextStreak, holeScore, RANKS, rankFor, nextRank, ACHIEVEMENTS, newlyEarned, BALL_SKINS, GREEN_THEMES, isUnlocked } from './scoring.js';
import { createAudio } from './audio.js?v=20260909';
import { createStore, freshRun, validateRun } from './storage.js';
import { announce, createDialogs } from './ui.js';
import { bindSlingshot } from './input.js';
import { distanceCalibration, lieRange, createDragGesture,strokeSpeed,strokePercent,strokeMaxSpeed,preferredPull } from './aiming.js';
import {assessPace,straightRead,describeFinish,suggestAdjustment,amount} from './feedback.js';
import {DRILLS,makeDrill,gradeDrill,recordDrill} from './drills.js';
import {createHaptics} from './haptics.js';

export function startGame(){
// ---- world constants ------------------------------------------------------
function maxDragPx(){ return preferredPull(innerWidth,innerHeight); }
function dragBounds(){return document.getElementById('dragBounds').getBoundingClientRect();}
let level=null, LV=1;
let userStimp=10, stimp=10;      // Stimp 10 ≈ a well-kept members' club green
let mode='practice';               // 'career' | 'practice' (set by the panel mode tabs)
let nextLevelTimer=null;         // post-hole advance timer, cancelled on menu

function elev(fx,fy){ return elevOf(level,fx,fy); }
function grad(fx,fy){ return gradOf(level,fx,fy); }

function physicsOptions(){ return { stimp, grain:document.getElementById('optGrain').checked,cupMode:mode==='career'||tutorial?'forgiving':settings.cupMode }; }
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
let dragGesture=null,dragAim=null,dragRange=0,dragViewport=null;
let trailPts=[];
let puttStart=null, firstPuttD=0, sessionSG=0; // strokes-gained bookkeeping
let runScore=0, streakCount=0;   // career run total + consecutive par-or-better

// ---- career runtime: persistence, run stats, toasts, progression -----------
let storage;
try { storage=window.localStorage; } catch {}
const store=createStore(storage,message=>{document.getElementById('saveStatus').textContent=message;});
let career=store.state.career, settings=store.state.settings;
let drill=null,drillStats=store.state.drills,drillReturnRun=null,lastAttempt=null,firstLeave=null;
let readView=false,coachKey='',lastResult=null;
let runStats=freshRun(), completed=false, ready=false, activeRun=false, modalOpen=false, contextLost=false;
let tutorial=false, tutorialStep=0, savedRun=store.state.run;
const audio=createAudio(()=>settings.optSnd && !document.hidden);
const {sndClick,sndCelebrate,sndDrop}=audio;
const haptics=createHaptics(()=>settings.optHaptics && !document.hidden && !contextLost);
const reducedMotion=()=>settings.optMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
const paused=()=>document.hidden || modalOpen || contextLost;
const dialogs=createDialogs(value=>{modalOpen=value;if(ready){cancelAim();if(value)audio.pause();}});
function snapshot(){
  return {courseVersion:COURSE_VERSION,mode,LV,ball:{...ball},strokes,totalVsPar,holed,completed,runScore,streakCount,runStats:{...runStats},sessionSG,puttStart,firstLeave};
}
function persist(){
  if(!ready)return;
  if(!tutorial && !drill && activeRun)savedRun=snapshot();
  store.save({career,settings,stats,drills:drillStats,run:savedRun});
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
  if(strokes===2)runStats.twoPutts++;
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
    `One-putts ${runStats.onePutts} · Two-putts ${runStats.twoPutts} · Good leaves ${runStats.goodLeaves}<br>`+
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
    const [r,g,b]=onFringe(fx,fz)?[.2,.29,.12]:heightColor(mx-mn<0.001?0.5:(h-mn)/rng);
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
  if(level.cupActive===false){
    cup.visible=pole.visible=flag.visible=false;
    const zone=new THREE.RingGeometry(level.targetRadius-.06,level.targetRadius,64).rotateX(-Math.PI/2);
    zone.translate(x,0,y);
    holeGroup.add(new THREE.Mesh(drape(zone,.09),new THREE.MeshBasicMaterial({color:0x8cd4fa,side:THREE.DoubleSide})));
  }
  if(level.gate){
    const g=level.gate,angle=Math.atan2(level.hole.y-level.ball.y,level.hole.x-level.ball.x);
    for(const side of [-1,1]){
      const gx=g.x-Math.sin(angle)*(g.halfWidth+BALL_R+.04)*side,gy=g.y+Math.cos(angle)*(g.halfWidth+BALL_R+.04)*side;
      const tee=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.8,8),new THREE.MeshBasicMaterial({color:0xffdc7c}));
      tee.position.set(gx,elev(gx,gy)*VS+.4,gy);holeGroup.add(tee);
    }
  }
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

// ---- actual-terrain preview, sharing the exact launch and roll step ----------
const PRED_MAX=1200;
const predGeo=new THREE.BufferGeometry();
predGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PRED_MAX*3),3).setUsage(THREE.DynamicDrawUsage));
predGeo.setDrawRange(0,0);
const predPts=new THREE.Points(predGeo, new THREE.PointsMaterial({color:0x7ee081, size:0.13, transparent:true, opacity:0.9,depthTest:false}));
predPts.frustumCulled=false;
scene.add(predPts);
const predLine=new THREE.Line(predGeo,new THREE.LineBasicMaterial({color:0x7ee081,transparent:true,opacity:.85,depthTest:false}));
predLine.frustumCulled=false;predLine.renderOrder=1;scene.add(predLine);
const finishGeo=new THREE.RingGeometry(0.35,0.46,40).rotateX(-Math.PI/2);
const finishRing=new THREE.Mesh(finishGeo,new THREE.MeshBasicMaterial({color:0x7ee081,side:THREE.DoubleSide,depthTest:false}));
finishRing.renderOrder=2;finishRing.visible=false;scene.add(finishRing);
const finishLabel=document.getElementById('finishMarkerLabel');
function hidePrediction(){predGeo.setDrawRange(0,0);finishRing.visible=false;finishLabel.hidden=true;document.getElementById('finishTarget').hidden=true;document.getElementById('dragRoll').hidden=true;}

let predictionKey='',predictionResult=null,flightPreview=null,finishTitle='';
function updatePredicted(){
  const show=mode==='practice' && (tutorial||document.getElementById('optPath').checked);
  if(ball.moving){
    if(show&&flightPreview){predLine.material.opacity=.35;predPts.material.opacity=.35;return;}
    hidePrediction();return;
  }
  flightPreview=null;
  const aim=currentAim();
  if(!show || holed || !aim){ predictionKey='';predictionResult=null;hidePrediction(); return; }
  const key=JSON.stringify([LV,ball.x,ball.y,aim,physicsOptions(),document.getElementById('optErr').checked]);
  if(key===predictionKey)return;predictionKey=key;
  const start={x:ball.x,y:ball.y,vx:aim.vx,vy:aim.vy};
  const prediction=predictionResult=simulate(level,start,physicsOptions());
  predLine.material.opacity=.85;predPts.material.opacity=.9;
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
  finishTitle=prediction.holed?'In cup':prediction.ball.recovered?'Stop at fringe edge':'Expected stop';
  let detail=describeFinish(start,level.hole,prediction.ball);
  if(prediction.holed){
    const pace=assessPace(level,start,physicsOptions());
    detail=pace.kind==='good'?'Good arrival pace':pace.offset.longitudinal>1.5?amount(pace.offset.longitudinal)+' past if cup missed':pace.label;
  }
  if(document.getElementById('optErr').checked)detail+=' · before stroke error';
  document.getElementById('finishDetail').textContent=detail;
  document.getElementById('dragRoll').hidden=false;
  document.getElementById('dragRoll').textContent=prediction.ball.moving?'Still rolling after 30 s':prediction.travel.toFixed(1)+' ft roll on this green';
}
function positionFinishLabel(){
  finishLabel.hidden=!finishRing.visible || modalOpen;
  const target=document.getElementById('finishTarget');target.hidden=finishLabel.hidden;
  if(finishLabel.hidden)return;
  const point=finishRing.position.clone().project(camera);
  const offscreen=point.z< -1||point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1;
  target.hidden=offscreen;
  const ground=worldToScreen(finishRing.position.x,finishRing.position.z);
  target.style.left=ground.x+'px';target.style.top=ground.y+'px';
  const px=point.z>1?-point.x:point.x,py=point.z>1?-point.y:point.y;
  const bearing=Math.round(Math.atan2(-py,px)*4/Math.PI);
  const arrow=['→','↘','↓','↙','←','↖','↑','↗'][(bearing+8)%8];
  document.getElementById('finishTitle').textContent=offscreen?arrow+' Stop off screen':finishTitle;
  finishLabel.classList.toggle('offscreen',offscreen);
  const bounds=dragBounds(),width=finishLabel.offsetWidth,height=finishLabel.offsetHeight;
  const left=Math.max(bounds.left+width/2,Math.min(bounds.right-width/2,(px+1)*innerWidth/2));
  let minTop=bounds.top;
  for(const id of ['readCard','lesson','drillPanel','gameNav']){
    const el=document.getElementById(id),rect=el.getBoundingClientRect();
    if(el.getClientRects().length&&left+width/2>rect.left&&left-width/2<rect.right)minTop=Math.max(minTop,rect.bottom+8);
  }
  minTop=Math.min(minTop,bounds.bottom-height);
  let top=Math.max(minTop,Math.min(bounds.bottom-height,(1-py)*innerHeight/2-height-16));
  const meter=document.getElementById('dragPower'),rect=meter.getBoundingClientRect();
  if(!meter.hidden&&left+width/2>rect.left&&left-width/2<rect.right&&top+height>rect.top&&top<rect.bottom)top=Math.max(minTop,rect.top-height-8);
  finishLabel.style.left=left+'px';finishLabel.style.top=top+'px';
}

function updatePaceFeedback(){
  if(!level)return;
  const panel=document.getElementById('paceFeedback');
  panel.hidden=mode!=='practice'||tutorial||!!drill||ball.moving||holed||!document.getElementById('optPace').checked;
  document.getElementById('dragPace').hidden=panel.hidden||document.getElementById('optPath').checked;
  if(ball.moving||holed)return;
  if(aiming&&!dragAim){
    coachKey='';panel.dataset.pace='none';document.getElementById('paceLabel').textContent='Pull back to choose pace';
    document.getElementById('dragPace').textContent='Pull back to choose pace';document.getElementById('dragPower').dataset.pace='none';
    document.getElementById('lineLabel').textContent='';document.getElementById('uiBreakFt').textContent='—';return;
  }
  const aim=currentAim()||valueAim();
  const key=JSON.stringify([LV,ball.x,ball.y,aim.vx,aim.vy,physicsOptions(),panel.hidden,document.getElementById('optErr').checked]);
  if(key===coachKey)return;coachKey=key;
  if(mode==='practice')updateRead();
  if(panel.hidden)return;
  const read=assessPace(level,{x:ball.x,y:ball.y,vx:aim.vx,vy:aim.vy},physicsOptions());
  panel.dataset.pace=read.kind;
  document.getElementById('dragPower').dataset.pace=read.kind;
  document.getElementById('dragPace').textContent=read.label;
  document.getElementById('paceLabel').textContent=read.label;
  document.getElementById('lineLabel').textContent=read.line+(document.getElementById('optErr').checked?' · before stroke error':'');
}
let ghostLine=null;
function clearGhost(){if(ghostLine){scene.remove(ghostLine);disposeObj(ghostLine);ghostLine=null;}}
function drawGhost(result){
  clearGhost();if(!result?.pts?.length)return;
  const points=result.pts.map(p=>new THREE.Vector3(p.x,elev(p.x,p.y)*VS+.12,p.y));
  ghostLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:0xc5d1c8,dashSize:.18,gapSize:.18,transparent:true,opacity:.4}));
  ghostLine.computeLineDistances();scene.add(ghostLine);
}
function invalidateFeedback(){
  lastAttempt=null;lastResult=null;coachKey='';predictionKey='';predictionResult=null;flightPreview=null;
  document.getElementById('puttFeedback').hidden=true;clearGhost();
}
function showPuttFeedback(){
  if(!lastAttempt)return;
  document.getElementById('feedbackDetails').hidden=true;
  document.getElementById('feedbackToggle').setAttribute('aria-expanded','false');
  document.getElementById('feedbackToggle').textContent='Details';
  lastResult=simulate(level,lastAttempt.start,lastAttempt.options);
  const title=ball.recovered?'At the fringe edge · play from here':describeFinish(lastAttempt.start,level.hole,ball);
  document.getElementById('finishText').textContent=title;
  document.getElementById('uiLast').textContent=title;
  const advice=mode==='practice'&&!drill?suggestAdjustment(level,lastAttempt.start,lastAttempt.options):null;
  let suggestion=advice?.text;
  if(advice && Math.abs(advice.angle-Math.atan2(lastAttempt.start.vy,lastAttempt.start.vx))<1e-8){
    if(inputMode()==='stroke'){
      const scale=advice.speed>strokeMaxSpeed(settings.strokeScale)?'long':settings.strokeScale;
      suggestion=`Try ${strokePercent(advice.speed,scale).toFixed(1)}% strength${scale!==settings.strokeScale?' with Long stroke':''} on the same line`;
    }else suggestion=`Try ${distanceCalibration(stimp).distanceForSpeed(advice.speed).toFixed(1)} ft on the same line`;
  }
  document.getElementById('adjustmentText').textContent=suggestion?'On a replay: '+suggestion:mode==='practice'?'Replay to compare with this roll.':'Read the next putt from here.';
  document.getElementById('retryLast').hidden=mode!=='practice';
  document.getElementById('puttFeedback').hidden=tutorial||!!drill;
}
function retryLastPutt(){
  if(mode!=='practice'||ball.moving||!lastAttempt||drill)return;
  const attempt=lastAttempt;
  cancelAim();drawGhost(lastResult);resetTrail();
  Object.assign(ball,launch(attempt.start.x,attempt.start.y,0,0),{moving:false,rolling:true});
  strokes=attempt.strokes;holed=false;dropT=1;puttStart=null;accumulator=0;
  if(strokes===0)firstLeave=null;
  restoreAttemptControls(attempt);
  coachKey='';predictionKey='';document.getElementById('puttFeedback').hidden=true;
  snapCamera();syncKeyboard();updateUI();refreshBestRoute();persist();
  announce('Same lie. Previous roll shown with a dotted line.');
}
function restoreAttemptControls(attempt){
  const speed=attempt.intendedSpeed;
  if(inputMode()==='stroke' && speed>strokeMaxSpeed(settings.strokeScale)){
    settings.strokeScale='long';document.getElementById('strokeScale').value='long';
  }
  keyDistance=inputMode()==='stroke'?strokePercent(speed,settings.strokeScale):distanceCalibration(stimp).distanceForSpeed(speed);
  if(inputMode()!=='stroke' && keyDistance>rangeForControl())fullRange=true;
  distanceRange=rangeForControl();keyAngle=attempt.keyAngle;
}
function updateDrillStats(){
  document.getElementById('drillStats').textContent=Object.keys(DRILLS).filter(type=>drillStats[type].attempts).map(type=>{
    const s=drillStats[type];return `${DRILLS[type].name}: ${s.hits}/${s.attempts} · best streak ${s.bestStreak}${type==='pace'?' · mean leave '+(s.totalLeave/s.attempts).toFixed(1)+' ft':''}`;
  }).join(' · ')||'Your drill results will be saved on this device.';
}
function startDrill(type){
  if(mode!=='practice'||ball.moving||!DRILLS[type])return;
  if(!drill)drillReturnRun=activeRun?snapshot():savedRun;
  drill={type,index:0,attempts:0,hits:0,streak:0,done:false,previousLeave:null};
  activeRun=false;tutorial=false;dialogs.close();
  panelEl.classList.add('hidden');document.getElementById('panelToggle').setAttribute('aria-expanded','false');
  document.getElementById('quickBtns').style.display='';
  loadDrill();
}
function loadDrill(){
  cancelAim();stopSolver();drawBestRoute(null);invalidateFeedback();resetTrail();
  level=makeDrill(drill.type,drill.index,settings.drillSlope);stimp=userStimp;
  Object.assign(ball,launch(level.ball.x,level.ball.y,0,0),{moving:false,rolling:true});
  strokes=0;holed=false;dropT=1;puttStart=null;firstLeave=null;accumulator=0;drill.done=false;
  firstPuttD=dist(level.ball,level.hole);applySettings();
  buildTerrain();buildHole();buildFlow();computeBreakStat();resetKeyboard();updateUI();
  document.getElementById('drillTitle').textContent=`${DRILLS[drill.type].name} · ${drill.index+1}/${DRILLS[drill.type].total}`;
  document.getElementById('drillInstruction').textContent=drill.type==='pace'?`${firstPuttD.toFixed(0)} ft · stop inside the blue zone. The target does not catch the ball.`:drill.type==='circle'?'3 ft · find the pace from every side of the cup.':'Start the ball between the two gold tees.';
  document.getElementById('drillResult').textContent=`${drill.hits}/${drill.attempts} successful attempts · ${settings.drillSlope} green`;
  document.getElementById('drillAgain').hidden=document.getElementById('drillNext').hidden=true;
  document.getElementById('puttFeedback').hidden=true;snapCamera();renderer.domElement.focus();
}
function finishDrillAttempt(made){
  if(drill.done)return;
  lastResult=simulate(level,lastAttempt.start,lastAttempt.options);
  const result=gradeDrill(level,lastResult),previous=drill.previousLeave;
  drill.done=true;drill.attempts++;if(result.success)drill.hits++;
  const recorded=recordDrill(drillStats,drill.type,result,drill.streak);drillStats=recorded.stats;drill.streak=recorded.streak;
  const improvement=previous!==null && result.leave<previous-.1?` · ${amount(previous-result.leave)} closer`:'';
  drill.previousLeave=result.leave;
  document.getElementById('drillResult').textContent=`${result.success?'Nice touch':'Keep practicing'} · ${result.detail}${improvement} · ${drill.hits}/${drill.attempts}`;
  document.getElementById('drillNext').textContent=drill.index+1===DRILLS[drill.type].total?'Finish drill':'Next putt';
  document.getElementById('drillAgain').hidden=document.getElementById('drillNext').hidden=false;
  puttStart=null;updateUI();updateDrillStats();persist();
  if(result.success&&!made)haptics.drop();announce(document.getElementById('drillResult').textContent);
}
function retryDrill(){
  if(!drill||ball.moving)return;
  const previous=lastResult,attempt=lastAttempt;
  loadDrill();drawGhost(previous);
  if(attempt){restoreAttemptControls(attempt);syncKeyboard();persist();}
}
function nextDrill(){
  if(!drill?.done)return;
  if(drill.index+1===DRILLS[drill.type].total){
    document.getElementById('drillSummaryText').textContent=`${DRILLS[drill.type].name}: ${drill.hits} successes in ${drill.attempts} attempts. Best saved streak: ${drillStats[drill.type].bestStreak}.`;
    dialogs.open('drillSummary');return;
  }
  drill.index++;drill.previousLeave=null;loadDrill();
}
function exitDrill(){
  const previous=drillReturnRun;drill=null;drillReturnRun=null;dialogs.close();
  if(previous){savedRun=previous;resumeRun();}else startMode('practice');
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
  // Compare a direct line using this selected stroke through the shared roll.
  const d0=dist(ball,h);
  if(d0<0.8){ document.getElementById('uiBreakFt').textContent='—'; return; }
  const aim=currentAim()||valueAim();
  document.getElementById('uiBreakFt').textContent=straightRead(level,ball,Math.hypot(aim.vx,aim.vy),physicsOptions());
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

let solverWorker=null,solverRequest=0,comparisonMeshes=[];
function clearComparisons(){comparisonMeshes.forEach(mesh=>{scene.remove(mesh);disposeObj(mesh);});comparisonMeshes=[];document.getElementById('compareLegend').hidden=true;}
function drawComparisons(routes){
  clearComparisons();
  routes.forEach((route,i)=>{
    if(!route?.holed || route.pts.length<2)return;
    const points=route.pts.map(p=>new THREE.Vector3(p.x,elev(p.x,p.y)*VS+.2,p.y));
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color:i?0xffc075:0x8cd4fa,dashSize:.25,gapSize:.15,transparent:true,opacity:.8}));
    line.computeLineDistances();scene.add(line);comparisonMeshes.push(line);
  });
  const legend=document.getElementById('compareLegend');
  legend.hidden=comparisonMeshes.length===0;
  legend.innerHTML=comparisonMeshes.length===2?'<span>● Soft</span> <span>● Firm</span> · possible lines, not your selected shot':routes[0]?.holed?'Only a soft route found':'Only a firm route found';
}
function stopSolver(){ solverRequest++;solverWorker?.terminate();solverWorker=null;clearComparisons(); }
function refreshBestRoute(){
  stopSolver();
  const on=document.getElementById('optBest').checked,compare=document.getElementById('optCompare').checked;
  if(mode!=='practice' || drill || (!on&&!compare) || ball.moving || holed){
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
      if(!data.error){drawBestRoute(on?data.route:null);if(compare)drawComparisons(data.routes||[]);}
      solverWorker.terminate();solverWorker=null;
    };
    solverWorker.onerror=()=>{document.getElementById('guideStatus').textContent='Guide unavailable. Try again.';stopSolver();};
    solverWorker.postMessage({id,level,ball:{...ball},options:physicsOptions(),compare});
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
  const strength=aim?Math.max(0,Math.min(1,aim.controlValue/(aiming?dragRange:distanceRange))):0;
  document.getElementById('pwrFill').style.width=(strength*100)+'%';
  document.getElementById('pwrFill').style.background=
    '#7ee081';
  const meter=document.getElementById('dragPower');
  meter.hidden=!aiming || settings.shotInput!=='drag' || paused();
  document.getElementById('dragPowerFill').style.width=(strength*100)+'%';
  document.getElementById('dragPowerCaption').textContent=inputMode()==='stroke'?'Stroke':'Flat reach';
  document.getElementById('dragPowerValue').textContent=formatControl(aim?.controlValue||0);
  document.getElementById('uiCarry').textContent=
    aim ? aim.distance.toFixed(1)+' ft on flat ground' : '—';
  if(aiming){
    document.getElementById('powerValue').textContent=formatControl(aim?.controlValue||0);
    document.getElementById('shotPower').value=aim?.controlValue||0;
    document.getElementById('shotPower').setAttribute('aria-valuetext',controlDescription(aim?.controlValue||0));
    document.getElementById('reachHint').textContent=reachDescription(aim?.distance||0);
    document.getElementById('aimValue').textContent=keyAngle===0?'At cup':Math.abs(keyAngle).toFixed(1)+'° '+(keyAngle>0?'right':'left');
  }
  if((!aiming && !keyboardAim) || !aim) return;
  // The short white arrow only shows launch direction. The green simulation
  // carries the distance information all the way to the actual stopping point.
  const len=Math.max(.8,Math.min(2.2,dist(ball,level.hole)*.35));
  const dir={x:aim.vx, y:aim.vy};
  const dl=Math.hypot(dir.x,dir.y)||1;
  const pts=[];
  const N=30;
  for(let i=0;i<=N;i++){
    const fx=ball.x + dir.x/dl*len*i/N;
    const fz=ball.y + dir.y/dl*len*i/N;
    pts.push(new THREE.Vector3(fx, elev(fx,fz)*VS+0.22, fz));
  }
  const tip=pts.at(-1),ux=dir.x/dl,uz=dir.y/dl;
  pts.push(new THREE.Vector3(tip.x-ux*.35-uz*.2,tip.y,tip.z-uz*.35+ux*.2),tip.clone(),new THREE.Vector3(tip.x-ux*.35+uz*.2,tip.y,tip.z-uz*.35-ux*.2));
  aimTube=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xe1eee5,transparent:true,opacity:.9,depthTest:false}));
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
function dragViewportUnchanged(){
  return dragViewport?.width===window.innerWidth && dragViewport?.height===window.innerHeight;
}
function updateDragAim(sample){
  if(sample.distance<0.2){dragAim=null;return;}
  rayAt({clientX:sample.x,clientY:sample.y});
  aimPlanePt=planeHit();if(!aimPlanePt)return;
  const dx=aimOriginPt.x-aimPlanePt.x, dz=aimOriginPt.z-aimPlanePt.z;     // slingshot direction (world)
  if(Math.hypot(dx,dz)<1e-4){dragAim=null;return;}
  const ang=Math.atan2(dz,dx);
  dragAim=valueAim(sample.distance,ang);
  keyDistance=sample.distance;
  keyAngle=((ang-Math.atan2(level.hole.y-ball.y,level.hole.x-ball.x))*180/Math.PI+540)%360-180;
}

function clearAim(){
  aiming=false;aimPointerId=null;controls.enabled=!ball.moving;
  dragGesture=null;dragAim=null;dragViewport=null;
  aimPlanePt=null;aimOriginPt=null;aimStartPx=aimNowPx=null;keyboardAim=null;
  document.body.classList.remove('aiming');
  document.getElementById('btnPutt').textContent='Putt';if(level)syncKeyboard(false);updatePredicted();
}
function cancelAim(){ input.cancel(); }
function takeShot(aim){
  if(!aim || ball.moving || holed || paused() || drill?.done)return;
  updatePredicted();flightPreview=predictionResult;
  let {vx,vy}=aim;
  if(mode==='practice' && !drill && document.getElementById('optErr').checked){
    const ea=gauss()*0.014*aim.power,ev=1+gauss()*0.018*(0.5+aim.power);
    const ca=Math.cos(ea),sa=Math.sin(ea);
    [vx,vy]=[(vx*ca-vy*sa)*ev,(vx*sa+vy*ca)*ev];
  }
  camAnim=null;controls.enabled=false;
  lastAttempt={start:{x:ball.x,y:ball.y,vx,vy},options:physicsOptions(),strokes,intendedSpeed:Math.hypot(aim.vx,aim.vy),keyAngle};
  lastResult=null;document.getElementById('puttFeedback').hidden=true;
  Object.assign(ball,launch(ball.x,ball.y,vx,vy));
  accumulator=0;puttStart={x:ball.x,y:ball.y,d:dist(ball,level.hole)};
  sndClick(aim.power);haptics.strike();resetTrail();pushTrail(ball.x,ball.y);
  stopSolver();drawBestRoute(null);strokes++;cancelAim();controls.enabled=false;updateUI();persist();
  announce('Putt '+strokes+'. Ball rolling.');
  if(tutorial)setLesson(2);
}
const input=bindSlingshot(renderer.domElement,{
  canStart:()=>settings.shotInput==='drag' && !ball.moving && !holed && !paused() && !drill?.done,
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
    document.body.classList.add('aiming');
    dragRange=distanceRange;dragAim=null;
    dragViewport={width:window.innerWidth,height:window.innerHeight};
    const bounds=dragBounds();
    dragGesture=createDragGesture({x:e.clientX,y:e.clientY,maxPull:maxDragPx(),range:dragRange,time:e.timeStamp,
      bounds:{left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom}});
    document.getElementById('btnPutt').textContent='Release to putt';
    if(tutorial)setLesson(1);
  },
  onMove:e=>{
    if(!dragViewportUnchanged()){cancelAim();return;}
    updateDragAim(dragGesture.move(e.clientX,e.clientY,e.timeStamp));updateAimTube();
  },
  // Safari can deliver pointerup before the resize event after a rotation.
  onRelease:()=>{if(dragViewportUnchanged())takeShot(currentAim());},
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
  document.body.classList.toggle('rolling',ball.moving);
  for(const id of ['btnPutt','aimLeft','aimRight','shotPower','fullRange'])document.getElementById(id).disabled=ball.moving||holed||!!drill?.done;
  for(const id of ['optPath','optBest','optGrain','optErr','stimpSlider','optPace','optCompare','cupMode'])document.getElementById(id).disabled=mode==='career'||tutorial||ball.moving||!!drill;
  for(const id of ['controlMode','strokeScale','startPaceDrill','startCircleDrill','startGateDrill','drillSlope'])document.getElementById(id).disabled=ball.moving||tutorial||mode==='career';
  for(const id of ['qbRead','btnCam','qbRetry','btnRetry'])document.getElementById(id).disabled=ball.moving;
  document.getElementById('uiLevel').textContent=LV+' / 50';
  document.getElementById('hudLevel').textContent=drill?'Practice':'Lv '+LV;
  document.getElementById('uiPar').textContent=level.par;
  document.getElementById('uiStrokes').textContent=strokes;
  document.getElementById('uiTotal').textContent=fmtVsPar(totalVsPar);
  document.getElementById('hudVsPar').textContent=drill?`${drill.hits}/${drill.attempts}`:fmtVsPar(totalVsPar);
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
  sndDrop();haptics.drop();controls.enabled=true;updateUI();
  if(drill){finishDrillAttempt(true);return;}
  if(lastAttempt)lastResult=simulate(level,lastAttempt.start,lastAttempt.options);
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
    showMsg(completed?'Course complete!':strokes===2?'Two-putt · Par':golfTerm(strokes,level.par),`Holed in ${strokes} · ${firstPuttD.toFixed(1)} ft · ${fmtVsPar(totalVsPar)} total vs par${firstLeave!==null&&firstLeave<=2?' · Good leave: '+amount(firstLeave):''}`);
  }
  persist();announce('Holed in '+strokes+'. '+(LV<50?'Continue when ready.':'Course complete.'));
}
function onStopped(){
  controls.enabled=true;
  showPuttFeedback();
  if(drill){finishDrillAttempt(false);if(settings.optAutoCamera)snapCamera(true);return;}
  if(tutorial){
    puttStart=null;updateUI();updateRead();resetKeyboard();
    setLesson(3);if(settings.optAutoCamera)snapCamera(true);return;
  }
  if(puttStart){
    const fin=dist(ball,level.hole);
    document.getElementById('uiLast').textContent=describeFinish(puttStart,level.hole,ball);
    if(strokes===1){
      firstLeave=fin;
      if(firstPuttD>=10 && fin<=2){
        if(mode==='career')runStats.goodLeaves++;
        toast('Good leave · '+amount(fin)+' for your second putt');
      }
    }
    recordPutt(puttStart.d, false);
    puttStart=null;
  }
  updateUI();
  document.getElementById('btnPutt').textContent='Putt';
  refreshBestRoute(); updateRead();
  resetKeyboard();persist();announce(document.getElementById('uiLast').textContent);
  if(settings.optAutoCamera)snapCamera(true);
}

// Career celebration: scale the juice to the hole result and bank points.
function celebrate(){
  streakCount = nextStreak(streakCount, strokes, level.par);
  const r = holeScore({ distFt:firstPuttD, diff:level.diff,
    stimp, strokes, par:level.par, streak:streakCount,firstLeave });
  if(r.lagBonus)toast('Good two-putt · +'+r.lagBonus+' touch bonus');
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
controls.addEventListener('start',()=>{camAnim=null;});
function moveCamera(toP,toT,offset={x:0,y:0},animate=true){
  const fromOffset={x:camera.view?.enabled?camera.view.offsetX:0,y:camera.view?.enabled?camera.view.offsetY:0};
  if(animate && !reducedMotion()){
    camAnim={t:0,fromP:camera.position.clone(),fromT:controls.target.clone(),toP,toT,fromOffset,toOffset:offset};
  }else{
    camAnim=null;camera.position.copy(toP);controls.target.copy(toT);
    camera.setViewOffset(innerWidth,innerHeight,offset.x,offset.y,innerWidth,innerHeight);controls.update();
  }
}
function snapCamera(animate){
  if(ball.moving || aiming)return;
  readView=false;document.getElementById('qbRead').setAttribute('aria-pressed','false');
  const bx=ball.x, bz=ball.y;
  const hx=level.hole.x, hz=level.hole.y;
  const d=Math.hypot(hx-bx,hz-bz)||1;
  const dx=(hx-bx)/d, dz=(hz-bz)/d;
  const w=innerWidth,h=innerHeight,shotControls=document.getElementById('shotControls'),shotRect=shotControls.getBoundingClientRect();
  const centerX=h<500&&w>600&&shotControls.getClientRects().length?Math.max(150,(shotRect.left-16)/2):w/2;
  let top=64;
  for(const id of ['readCard','lesson','drillPanel','gameNav']){
    const el=document.getElementById(id),rect=el.getBoundingClientRect();
    if(el.getClientRects().length&&rect.left<centerX+24&&rect.right>centerX-24)top=Math.max(top,rect.bottom+20);
  }
  const safe=dragBounds();
  // Reserve the whole pull below the ball, including a comfortable finger gap.
  let bottom=safe.bottom-(settings.shotInput==='drag'?maxDragPx()+16:24);
  for(const id of ['shotControls','puttFeedback']){
    const el=document.getElementById(id),rect=el.getBoundingClientRect();
    if(el.getClientRects().length&&rect.left<centerX+24&&rect.right>centerX-24)bottom=Math.min(bottom,rect.top-28);
  }
  top=Math.min(top,bottom-100);
  const laneHeight=bottom-top,centerY=(top+bottom)/2;
  const toT=new THREE.Vector3((bx+hx)/2,(elev(bx,bz)+elev(hx,hz))*VS/2,(bz+hz)/2);
  const offset=new THREE.Vector3(-dx*(14+d*.5),12+d*.65,-dz*(14+d*.5));
  const view=camera.clone();view.clearViewOffset();
  let projected=[];
  for(let i=0;i<12;i++){
    view.position.copy(toT).add(offset);view.lookAt(toT);view.updateMatrixWorld(true);
    projected=[new THREE.Vector3(bx,elev(bx,bz)*VS,bz).project(view),new THREE.Vector3(hx,elev(hx,hz)*VS,hz).project(view)];
    if(Math.abs(projected[0].y-projected[1].y)*h/2<laneHeight*(settings.shotInput==='drag'?.9:.66))break;
    offset.multiplyScalar(1.15);
  }
  const rawCenterY=(1-(projected[0].y+projected[1].y)/2)*h/2;
  const toP=toT.clone().add(offset);
  moveCamera(toP,toT,{x:w/2-centerX,y:rawCenterY-centerY},!!animate);
}

function loadLevel(n, fixed){
  cancelAim();
  clearTimeout(nextLevelTimer); nextLevelTimer=null;   // cancel any pending auto-advance so manual nav can't double-skip
  LV=n;stimp=mode==='career'||tutorial?10:userStimp;
  level=makeLevel(n, fixed);invalidateFeedback();firstLeave=null;
  document.getElementById('puttFeedback').hidden=true;
  ball.x=level.ball.x; ball.y=level.ball.y;
  ball.vx=ball.vy=0; ball.moving=false; ball.rolling=true;
  controls.enabled=true;
  strokes=0; holed=false; dropT=1; aiming=false; aimPlanePt=null;
  puttStart=null;
  firstPuttD=dist(level.ball, level.hole);
  document.getElementById('uiLast').textContent='—';
  updateStatsUI();
  resetTrail();
  buildTerrain(); buildHole(); buildFlow();
  computeBreakStat(); updateUI(); hideMsg();
  refreshBestRoute();
  document.getElementById('btnPutt').textContent='Putt';
  resetKeyboard();snapCamera();updateRead();persist();
}

// replay keeps the same pin & ball so you can retry the exact line
function replayLevel(){
  if(ball.moving)return;
  if(drill){retryDrill();return;}
  if(tutorial){startLesson();return;}
  if(mode!=='practice')return;
  if(holed && !tutorial){totalVsPar-=strokes-level.par;sessionSG-=expPutts(firstPuttD)-strokes;}
  completed=false;
  // Restart this hole from the same pin & ball (retry the line).
  const previous=lastResult;
  loadLevel(LV, { hole:level.hole, ball:level.ball });drawGhost(previous);
}
document.getElementById('btnRetry').onclick=()=>replayLevel();
function skipLevel(){
  if(mode==='practice' && LV<50 && !tutorial && !ball.moving && !drill) loadLevel(LV+1);
}
document.getElementById('btnNext').onclick=skipLevel;
document.getElementById('btnCam').onclick=()=>snapCamera(true);
document.getElementById('stimpSlider').oninput=e=>{
  if(mode!=='practice' || ball.moving || tutorial||drill)return;
  userStimp=+e.target.value; stimp=userStimp; settings.stimp=userStimp;invalidateFeedback();
  distanceRange=rangeForControl();keyDistance=Math.min(keyDistance,distanceRange);
  updateUI();refreshBestRoute();syncKeyboard();persist();
};
document.getElementById('optBest').onchange=()=>refreshBestRoute();
document.getElementById('optGrain').onchange=()=>{invalidateFeedback();refreshBestRoute();syncKeyboard();};

// crouch read: drop to ball height and sight down the line, like a real read
function readCamera(){
  if(ball.moving || aiming)return;
  readView=true;document.getElementById('qbRead').setAttribute('aria-pressed','true');
  const bx=ball.x, bz=ball.y, hl=level.hole;
  const d=Math.hypot(hl.x-bx,hl.y-bz)||1;
  const dx=(hl.x-bx)/d, dz=(hl.y-bz)/d;
  const bY=elev(bx,bz)*VS;
  moveCamera(new THREE.Vector3(bx-dx*5,bY+1.7,bz-dz*5),new THREE.Vector3(hl.x,elev(hl.x,hl.y)*VS+0.3,hl.y));
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
    e.preventDefault();if(ball.moving || holed || paused() || aiming || drill?.done)return;
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
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize',()=>{cancelAim();onResize();if(level&&!ball.moving&&!modalOpen)snapCamera();});
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
document.getElementById('qbRead').onclick=()=>readView?snapCamera(true):readCamera();
const optPathEl=document.getElementById('optPath');
function syncPathBtn(){ document.getElementById('qbPath').classList.toggle('active', optPathEl.checked); }
document.getElementById('qbPath').onclick=()=>toggleAid('optPath');

const rollAxis=new THREE.Vector3();
let last=performance.now();
function frame(now){
  const dt=Math.min(0.25,(now-last)/1000); last=now;
  if(paused()){audio.pause();finishLabel.hidden=true;document.getElementById('finishTarget').hidden=true;document.getElementById('ballHandle').hidden=true;if(level && !contextLost){ballMesh.position.set(ball.x,elev(ball.x,ball.y)*VS+BALL_R,ball.y);renderer.render(scene,camera);}requestAnimationFrame(frame);return;}
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

  if(aiming){
    if(dragViewportUnchanged())updateDragAim(dragGesture.sample(now));
    else cancelAim();
  }
  if(aiming || keyboardAim) updateAimTube();
  updatePaceFeedback();
  updatePredicted();
  if(flow.pts)flow.pts.material.opacity=(aiming||ball.moving) ? .18 : .65;
  if(!reducedMotion())updateFlow(dt);

  // camera glide to the ball's new lie
  if(camAnim){
    camAnim.t+=dt/0.9;
    const k=Math.min(1,camAnim.t);
    const e=k*k*(3-2*k);                       // smoothstep ease
    camera.position.lerpVectors(camAnim.fromP, camAnim.toP, e);
    controls.target.lerpVectors(camAnim.fromT, camAnim.toT, e);
    camera.setViewOffset(innerWidth,innerHeight,
      THREE.MathUtils.lerp(camAnim.fromOffset.x,camAnim.toOffset.x,e),
      THREE.MathUtils.lerp(camAnim.fromOffset.y,camAnim.toOffset.y,e),innerWidth,innerHeight);
    if(k>=1) camAnim=null;
  }
  updateFx(dt);
  tickScore();
  if(!aiming&&!ball.moving)controls.update();
  const handle=document.getElementById('ballHandle'),point=worldToScreen(ball.x,ball.y);
  handle.hidden=settings.shotInput!=='drag'||ball.moving||holed||!!drill?.done;
  handle.style.left=point.x+'px';handle.style.top=point.y+'px';
  const meter=document.getElementById('dragPower');
  if(!meter.hidden){
    const bounds=dragBounds();
    const beside=point.x+32+meter.offsetWidth<=bounds.right?point.x+32:point.x-meter.offsetWidth-32;
    meter.style.left=Math.max(bounds.left,Math.min(bounds.right-meter.offsetWidth,beside))+'px';
    meter.style.top=Math.max(bounds.top,Math.min(bounds.bottom-meter.offsetHeight,point.y-58))+'px';
  }
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
function applyInputStyle(){
  const drag=settings.shotInput==='drag';
  document.body.classList.toggle('dragMode',drag);
  document.body.classList.toggle('detailedRead',settings.optDetails);
  document.getElementById('shotControls').hidden=drag;
  document.getElementById('keyboardHint').textContent=(drag?'Drag back from the ball and release.':'Use the aim buttons, slider, and Putt.')+' Arrow keys aim and choose pace; Space putts.';
  document.getElementById('shotInput').value=settings.shotInput;
  for(const button of document.querySelectorAll('[data-shot-input]'))button.setAttribute('aria-pressed',String(button.dataset.shotInput===settings.shotInput));
  document.documentElement.style.setProperty('--putt-controls-height',document.getElementById('shotControls').getBoundingClientRect().height+'px');
  coachKey='';
  if(tutorial)setLesson(tutorialStep);
}
function setShotInput(value){
  if(!['drag','buttons'].includes(value))return;
  cancelAim();settings.shotInput=value;applyInputStyle();
  if(level){syncKeyboard(false);updateUI();if(!ball.moving&&!modalOpen)snapCamera(true);}
  persist();
}
function applySettings(){
  userStimp=settings.stimp;stimp=mode==='career'||tutorial?10:userStimp;
  document.body.classList.toggle('careerMode',mode==='career');
  document.body.classList.toggle('tutorialMode',tutorial);
  document.body.classList.toggle('reducedMotion',reducedMotion());
  for(const id of ['optSlope','optPath','optBest','optGrid','optGrain','optErr','optSnd','optMotion','optHaptics','optPace','optCompare','optAutoCamera','optDetails']){
    const el=document.getElementById(id);el.checked=settings[id];
  }
  for(const id of ['optPath','optBest','optGrain','optErr','stimpSlider']){
    document.getElementById(id).disabled=mode==='career' || tutorial || ball.moving;
  }
  if(tutorial)document.getElementById('optErr').checked=false;
  if(drill){document.getElementById('optErr').checked=false;document.getElementById('optGrain').checked=false;}
  if(mode==='career'){
    document.getElementById('optPath').checked=false;document.getElementById('optBest').checked=false;
    document.getElementById('optGrain').checked=true;document.getElementById('optErr').checked=false;
    document.getElementById('optPace').checked=false;document.getElementById('optCompare').checked=false;
  }
  document.getElementById('stimpSlider').value=stimp;
  document.getElementById('quality').value=settings.quality;
  for(const id of ['controlMode','strokeScale','cupMode','drillSlope'])document.getElementById(id).value=settings[id];
  document.getElementById('cupMode').value=mode==='career'||tutorial?'forgiving':settings.cupMode;
  document.getElementById('drillSettings').hidden=mode==='career'||tutorial;
  document.getElementById('drillPanel').hidden=!drill;
  document.body.classList.toggle('drillMode',!!drill);
  for(const id of ['btnNext','btnRetry','qbRetry','qbPath'])document.getElementById(id).hidden=mode==='career';
  document.getElementById('modeLabel').textContent=tutorial?'First putt':drill?DRILLS[drill.type].name:mode==='career'?'Competition':'Practice';
  document.getElementById('rules').textContent=mode==='career'?'50 fixed holes · Stimp 10 · no retries or shot guides':'Free retries · adjustable speed · optional shot guides';
  document.getElementById('btnCareer').setAttribute('aria-pressed',String(mode==='career'));
  document.getElementById('btnPractice').setAttribute('aria-pressed',String(mode==='practice'));
  flow.pts && (flow.pts.visible=document.getElementById('optSlope').checked);
  uContour.value=settings.optGrid?1:0;syncPathBtn();
  applyInputStyle();updateDrillStats();
}
function startMode(m){
  drill=null;drillReturnRun=null;
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
  drill=null;
  dialogs.close();tutorial=false;document.getElementById('lesson').hidden=true;
  ready=false;mode=r.mode;applySettings();loadLevel(r.LV);
  ({strokes,totalVsPar,holed,completed,runScore,streakCount,runStats,sessionSG,puttStart}=r);
  firstLeave=r.firstLeave??null;
  Object.assign(ball,r.ball);firstPuttD=dist(level.ball,level.hole);ready=true;
  scoreShown=scoreTarget=runScore;document.getElementById('runScore').textContent=runScore.toLocaleString();
  document.getElementById('runStreak').textContent=streakCount>=2?'🔥 ×'+streakCount:'';
  updateUI();updateStatsUI();updateCareerUI();snapCamera();resetKeyboard();refreshBestRoute();updateRead();
  if(holed){resultActions();showMsg(completed?'Course complete!':'Hole complete',`${runScore.toLocaleString()} points · ${fmtVsPar(totalVsPar)} total vs par`);}
  else renderer.domElement.focus();
}
let keyAngle=0,keyDistance=40,distanceRange=100,fullRange=false,lastStrokeValue=40,lastDistanceValue=8;
function inputMode(){return tutorial?'distance':settings.controlMode;}
function valueAim(value=keyDistance,angle){
  angle??=Math.atan2(level.hole.y-ball.y,level.hole.x-ball.x)+keyAngle*Math.PI/180;
  const speed=inputMode()==='stroke'?strokeSpeed(value,settings.strokeScale):distanceCalibration(stimp).speedForDistance(value);
  return {vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,power:speed/MAXSPEED,
    distance:distanceCalibration(stimp).distanceForSpeed(speed),controlValue:value};
}
function rangeForControl(){
  if(inputMode()==='stroke')return 100;
  const max=Math.floor(distanceCalibration(stimp).maxDistance*10)/10;
  return tutorial?16:fullRange?max:inputMode()==='adaptive'?lieRange(dist(ball,level.hole),max):Math.min(60,max);
}
function formatControl(value){return inputMode()==='stroke'?value.toFixed(1)+'%':value.toFixed(1)+' ft';}
function controlDescription(value){return inputMode()==='stroke'?value.toFixed(1)+' percent stroke strength':value.toFixed(1)+' feet on flat ground';}
function reachDescription(distance){return inputMode()==='stroke'?`${settings.strokeScale==='precision'?'Precision · ':''}Flat reach ${distance.toFixed(1)} ft · slopes change the finish`:'Flat-ground reach · slopes change the finish';}
function resetKeyboard(show=false){
  keyAngle=0;
  distanceRange=rangeForControl();
  keyDistance=Math.max(.2,Math.min(distanceRange,tutorial?8:inputMode()==='stroke'?lastStrokeValue:lastDistanceValue));
  keyboardAim=null;syncKeyboard(show);
}
function syncKeyboard(show=true){
  const aim=valueAim();
  if(show)keyboardAim=aim;
  if(!tutorial){if(inputMode()==='stroke')lastStrokeValue=keyDistance;else lastDistanceValue=keyDistance;}
  document.getElementById('aimValue').textContent=keyAngle===0?'At cup':Math.abs(keyAngle).toFixed(1)+'° '+(keyAngle>0?'right':'left');
  document.getElementById('powerCaption').textContent=inputMode()==='stroke'?(settings.strokeScale==='precision'?'Short stroke':settings.strokeScale==='long'?'Long stroke':'Stroke'):'Aim for';
  document.getElementById('powerValue').textContent=formatControl(keyDistance);
  document.getElementById('shotPower').max=distanceRange;
  document.getElementById('shotPower').value=keyDistance;
  document.getElementById('shotPower').setAttribute('aria-label',inputMode()==='stroke'?'Stroke strength':'Putt distance');
  document.getElementById('shotPower').setAttribute('aria-valuetext',controlDescription(keyDistance));
  document.getElementById('fullRange').textContent=inputMode()==='stroke'?(settings.strokeScale==='long'?'Standard stroke':'Long stroke'):(fullRange?'Standard reach':'Extend range');
  document.getElementById('fullRange').setAttribute('aria-pressed',String(inputMode()==='stroke'?settings.strokeScale==='long':fullRange));
  document.getElementById('reachHint').textContent=reachDescription(aim.distance);
  updateAimTube();updatePaceFeedback();
}
function adjustKeyboard(angle,power){
  if(ball.moving||holed||aiming||drill?.done)return;
  keyAngle=Math.max(-90,Math.min(90,keyAngle+angle*0.5));
  keyDistance=Math.max(0.2,Math.min(distanceRange,Math.round((keyDistance+power*(inputMode()==='stroke'?1:.1))*10)/10));syncKeyboard();
}
const lessons=[
  ['1 · Choose a line','This first green is flat. Grab the ball and pull back to aim.'],
  ['2 · Set the distance','Pull back until the readout shows 8 ft, then release.'],
  ['3 · Watch the roll','The green path and ring show the expected roll and stop. Watch how the ball follows them.'],
  ['Try the finish','Adjust your pace and putt again. Retry lesson resets the ball.']
];
function setLesson(step){
  tutorialStep=step;document.getElementById('lessonTitle').textContent=lessons[step][0];
  document.getElementById('lessonText').textContent=settings.shotInput==='buttons'&&step<2?
    (step===0?'This first green is flat. Use the aim buttons and distance slider below.':'Set the distance to 8 ft, then press Putt.'):lessons[step][1];
}
function startLesson(){
  drill=null;drillReturnRun=null;
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
  if(inputMode()==='stroke'){
    const speed=Math.hypot(valueAim().vx,valueAim().vy);
    settings.strokeScale=settings.strokeScale==='long'?'standard':'long';
    keyDistance=strokePercent(speed,settings.strokeScale);document.getElementById('strokeScale').value=settings.strokeScale;
  }else fullRange=!fullRange;
  distanceRange=rangeForControl();
  keyDistance=Math.min(keyDistance,distanceRange);syncKeyboard();
  if(lastAttempt && !document.getElementById('puttFeedback').hidden)showPuttFeedback();
  persist();
};
document.getElementById('shotInput').onchange=e=>setShotInput(e.target.value);
for(const button of document.querySelectorAll('[data-shot-input]'))button.onclick=()=>setShotInput(button.dataset.shotInput);
document.getElementById('feedbackToggle').onclick=()=>{
  const details=document.getElementById('feedbackDetails'),button=document.getElementById('feedbackToggle');
  details.hidden=!details.hidden;button.setAttribute('aria-expanded',String(!details.hidden));button.textContent=details.hidden?'Details':'Hide';
};
for(const id of ['controlMode','strokeScale'])document.getElementById(id).onchange=e=>{
  if(e.target.disabled)return;
  cancelAim();const old=valueAim(),speed=Math.hypot(old.vx,old.vy);
  settings[id]=e.target.value;distanceRange=rangeForControl();
  keyDistance=Math.max(.2,Math.min(distanceRange,inputMode()==='stroke'?strokePercent(speed,settings.strokeScale):old.distance));
  syncKeyboard();
  if(lastAttempt && !document.getElementById('puttFeedback').hidden)showPuttFeedback();
  persist();
};
document.getElementById('cupMode').onchange=e=>{
  if(e.target.disabled)return;
  settings.cupMode=e.target.value;invalidateFeedback();syncKeyboard();refreshBestRoute();persist();
};
document.getElementById('drillSlope').onchange=e=>{
  if(e.target.disabled)return;
  settings.drillSlope=e.target.value;if(drill)startDrill(drill.type);persist();
};
document.getElementById('retryLast').onclick=retryLastPutt;
document.getElementById('startPaceDrill').onclick=()=>startDrill('pace');
document.getElementById('startCircleDrill').onclick=()=>startDrill('circle');
document.getElementById('startGateDrill').onclick=()=>startDrill('gate');
document.getElementById('drillAgain').onclick=retryDrill;
document.getElementById('drillNext').onclick=nextDrill;
document.getElementById('exitDrill').onclick=exitDrill;
document.getElementById('drillSummaryExit').onclick=exitDrill;
document.getElementById('drillRestart').onclick=()=>startDrill(drill.type);
for(const id of ['optSlope','optPath','optBest','optGrid','optGrain','optErr','optSnd','optMotion','optPace','optCompare','optHaptics','optAutoCamera','optDetails']){
  document.getElementById(id).addEventListener('change',e=>{
    if(e.target.disabled)return;settings[id]=e.target.checked;persist();
    if(id==='optPath')syncPathBtn();
    if(id==='optMotion')document.body.classList.toggle('reducedMotion',reducedMotion());
    if(id==='optDetails'){document.body.classList.toggle('detailedRead',settings.optDetails);if(!ball.moving)snapCamera(true);}
    if(id==='optSnd' && !settings.optSnd)audio.pause();
    if(id==='optCompare')refreshBestRoute();
    coachKey='';updatePaceFeedback();
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
