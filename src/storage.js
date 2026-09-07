import { ACHIEVEMENTS, BALL_SKINS, GREEN_THEMES } from './scoring.js';
import { COURSE_VERSION, GW, GH, MAXSPEED } from './constants.js';
export const SAVE_KEY='green-reader-v1';
export const freshRun=()=>({onePutts:0,longest:0,best:0,holes:0,onePuttStreak:0});
export const defaultCareer=()=>({xp:0,bestRun:0,runs:0,ach:[],ball:'white',theme:'classic'});
export const defaultSettings=()=>({stimp:10,optSlope:true,optPath:false,optBest:false,optGrid:true,optGrain:true,optErr:false,optSnd:true,optMotion:false,quality:'auto',tutorialDone:false});
const record=x=>x!==null && typeof x==='object' && !Array.isArray(x);
const finite=(x,min,max)=>typeof x==='number' && Number.isFinite(x) && x>=min && x<=max;
const count=x=>Number.isSafeInteger(x) && x>=0 && x<=1e12;
export function validateCareer(raw){
  const c=defaultCareer();if(!record(raw))return c;
  for(const k of ['xp','bestRun','runs'])if(count(raw[k]))c[k]=raw[k];
  if(Array.isArray(raw.ach))c.ach=[...new Set(raw.ach.filter(id=>ACHIEVEMENTS.some(a=>a.id===id)))];
  if(BALL_SKINS.some(b=>b.id===raw.ball && b.xp<=c.xp))c.ball=raw.ball;
  if(GREEN_THEMES.some(t=>t.id===raw.theme && t.xp<=c.xp))c.theme=raw.theme;
  return c;
}
export function validateSettings(raw){
  const s=defaultSettings();if(!record(raw))return s;
  for(const k of Object.keys(s))if(typeof s[k]==='boolean' && typeof raw[k]==='boolean')s[k]=raw[k];
  if(finite(raw.stimp,7,14))s.stimp=Math.round(raw.stimp*2)/2;
  if(['auto','low','high'].includes(raw.quality))s.quality=raw.quality;
  return s;
}
const BUCKETS=['0–5 ft','5–10 ft','10–20 ft','20–30 ft','30+ ft'];
export function validateStats(raw){
  const s={};if(!record(raw))return s;
  for(const k of BUCKETS){const v=raw[k];if(Array.isArray(v)&&v.length===2&&v.every(count)&&v[0]<=v[1]&&v[1]>0)s[k]=[...v];}
  return s;
}
export function validateRun(r){
  if(!record(r)||r.courseVersion!==COURSE_VERSION||!['practice','career'].includes(r.mode))return null;
  if(!Number.isInteger(r.LV)||!finite(r.LV,1,50)||typeof r.holed!=='boolean'||typeof r.completed!=='boolean')return null;
  if(!count(r.strokes)||!count(r.runScore)||!count(r.streakCount)||!finite(r.totalVsPar,-150,1e6)||!finite(r.sessionSG,-1e6,1e6))return null;
  if(!record(r.runStats)||Object.keys(freshRun()).some(k=>!count(r.runStats[k])))return null;
  if(r.mode==='career' && r.runStats.holes!==r.LV-1+(r.holed?1:0))return null;
  if(r.completed && (r.LV!==50 || !r.holed))return null;
  const b=r.ball;
  if(!record(b)||!finite(b.x,0,GW)||!finite(b.y,0,GH)||!finite(b.vx,-MAXSPEED*2,MAXSPEED*2)||!finite(b.vy,-MAXSPEED*2,MAXSPEED*2)||typeof b.moving!=='boolean'||typeof b.rolling!=='boolean'||!finite(b.skidU,0,MAXSPEED*2))return null;
  if(r.holed && (b.moving || r.strokes<1))return null;
  if(r.puttStart!==null && (!record(r.puttStart)||!finite(r.puttStart.x,0,GW)||!finite(r.puttStart.y,0,GH)||!finite(r.puttStart.d,0,80)))return null;
  if(b.moving && (!r.puttStart || r.strokes<1))return null;
  return structuredClone(r);
}
export function createStore(storage, onIssue=()=>{}){
  let warned=false;
  const report=message=>{if(!warned){warned=true;onIssue(message);}};
  const get=k=>{try{return JSON.parse(storage?.getItem(k)||'null');}catch{report('Saved data could not be read. You can still play.');return null;}};
  let raw=get(SAVE_KEY);
  const unsupported=record(raw) && raw.version!==1;
  if(unsupported)report('This save uses a newer or unsupported version. Saving is paused to preserve it.');
  const valid=record(raw)&&raw.version===1;
  const state={version:1,career:validateCareer(valid?raw.career:get('gr3d-career')),settings:validateSettings(valid?raw.settings:null),stats:validateStats(valid?raw.stats:get('gr3d-stats')),run:valid?validateRun(raw.run):null};
  if(valid && raw.run && !state.run)report('The saved run was invalid. Your valid XP and settings were recovered.');
  return {state,save(next){
    if(unsupported)return false;
    try{if(!storage)throw new Error('Unavailable');storage.setItem(SAVE_KEY,JSON.stringify({...next,version:1}));return true;}
    catch{report('Progress cannot be saved in this browser. Keep this tab open to continue.');return false;}
  }};
}
