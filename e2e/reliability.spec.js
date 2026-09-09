import {test,expect} from '@playwright/test';
import {SAVE_KEY,defaultCareer,defaultSettings,freshRun} from '../src/storage.js';
import {makeLevel} from '../src/course.js';
import {solveBestRoute} from '../src/solver.js';
import {COURSE_VERSION} from '../src/constants.js';

const checkpoint=(mode='practice',LV=1)=>{
  const level=makeLevel(LV);
  return {courseVersion:COURSE_VERSION,mode,LV,ball:{...level.ball,vx:0,vy:0,moving:false,rolling:true,skidU:0},strokes:0,totalVsPar:0,holed:false,completed:false,runScore:0,streakCount:0,runStats:{...freshRun(),holes:mode==='career'?LV-1:0},sessionSG:0,puttStart:null};
};
async function seed(page,run){
  await page.addInitScript(({key,run,career,settings})=>{
    if(!sessionStorage.getItem('seeded')){
      localStorage.setItem(key,JSON.stringify({version:1,run,career,settings,stats:{}}));sessionStorage.setItem('seeded','yes');
    }
  },{key:SAVE_KEY,run,career:defaultCareer(),settings:defaultSettings()});
}

test('welcome reload preserves an existing checkpoint and lesson leaves it intact',async({page})=>{
  await seed(page,checkpoint('career',7));await page.goto('/');await expect(page.locator('#resumeRun')).toContainText('hole 7');
  await page.reload();await expect(page.locator('#resumeRun')).toContainText('hole 7');
  await page.locator('#startLesson').click();await page.locator('#lessonSkip').click();
  await expect(page.locator('#resumeRun')).toContainText('hole 7');await page.locator('#resumeRun').click();
  await expect(page.locator('#hudLevel')).toHaveText('Lv 7');
});

test('saved moving putt resumes, finishes once, and waits for Continue',async({page})=>{
  const r=checkpoint('career');const l=makeLevel(1),route=solveBestRoute(l,l.ball,{stimp:10,grain:true});
  r.strokes=1;r.ball={...r.ball,vx:Math.cos(route.angle)*route.speed,vy:Math.sin(route.angle)*route.speed,moving:true,rolling:false,skidU:.85*route.speed};r.puttStart={...l.ball,d:Math.hypot(l.ball.x-l.hole.x,l.ball.y-l.hole.y)};
  await seed(page,r);await page.goto('/');await page.locator('#resumeRun').click();
  await expect(page.locator('#result')).toBeVisible({timeout:15000});
  const score=await page.locator('#runScore').textContent();
  const xp=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).career.xp,SAVE_KEY);
  await page.reload();await page.locator('#resumeRun').click();await expect(page.locator('#runScore')).toHaveText(score);
  await expect(page.locator('#hudLevel')).toHaveText('Lv 1');
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).career.xp,SAVE_KEY)).toBe(xp);
  await page.locator('#continueHole').click();await expect(page.locator('#hudLevel')).toHaveText('Lv 2');
});

test('solver responds without blocking controls and settings persist',async({page})=>{
  await page.goto('/');await page.locator('#startPractice').click();await page.locator('#panelToggle').click();
  await page.getByText('Green speed & learning aids',{exact:true}).click();await page.locator('#optBest').check();
  await expect(page.locator('#guideStatus')).toContainText(/Makeable line|Closest route/,{timeout:15000});
  await page.locator('#optSnd').uncheck();await page.locator('#optMotion').check();
  await page.reload();await page.locator('#resumeRun').click();await page.locator('#panelToggle').click();
  await expect(page.locator('#optSnd')).not.toBeChecked();await expect(page.locator('#optMotion')).toBeChecked();
});

test('startup graphics failure gives recovery controls',async({page})=>{
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(kind.includes('webgl'))return null;return original.call(this,kind,...args);};});
  await page.goto('/');await expect(page.locator('.fallbackCanvas')).toBeVisible();
  await expect(page.locator('#boot')).toHaveClass(/hidden/);
});

test('layout captures keep required controls inside viewport',async({page},info)=>{
  await page.goto('/');await expect(page.locator('#welcome')).toBeVisible();await page.screenshot({path:info.outputPath('welcome.png')});
  await page.locator('[data-shot-input="buttons"]').click();
  await page.locator('#startPractice').click();
  for(const id of ['btnPutt','aimLeft','aimRight','shotPower','panelToggle']){
    const box=await page.locator('#'+id).boundingBox();const size=page.viewportSize();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width);expect(box.y+box.height).toBeLessThanOrEqual(size.height);
  }
  await page.screenshot({path:info.outputPath('practice.png')});
  await page.locator('#panelToggle').click();await page.screenshot({path:info.outputPath('settings.png')});
});

test('drag restart cancels the stroke and releases pointer ownership',async({page})=>{
  await page.goto('/');await page.locator('#startLesson').click();
  await expect(page.locator('#ballHandle')).toBeVisible();
  const box=await page.locator('#ballHandle').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x,y+30,{steps:5});
  await expect(page.locator('#btnPutt')).toHaveText('Release to putt');
  await page.keyboard.press('r');await page.mouse.up();
  await expect(page.locator('#btnPutt')).toHaveText('Putt');await expect(page.locator('#uiStrokes')).toHaveText('0');
});

test('landscape retains navigation and putting controls',async({page},info)=>{
  await page.setViewportSize({width:740,height:360});await page.goto('/');await page.locator('[data-shot-input="buttons"]').click();await page.locator('#startPractice').click();
  await expect(page.locator('#btnPutt')).toBeInViewport();await expect(page.locator('#panelToggle')).toBeInViewport();
  await page.screenshot({path:info.outputPath('landscape.png')});
});

test('collect rendering frame timings on the test host',async({page},info)=>{
  test.skip(info.project.name!=='chromium','One host measurement, not a device performance claim.');
  await page.goto('/');await page.locator('#startPractice').click();
  const times=await page.evaluate(()=>new Promise(resolve=>{
    let previous=performance.now();const frames=[];
    function tick(now){frames.push(now-previous);previous=now;if(frames.length<90)requestAnimationFrame(tick);else resolve(frames.slice(10));}requestAnimationFrame(tick);
  }));
  times.sort((a,b)=>a-b);
  await info.attach('frame-timings',{body:JSON.stringify({samples:times.length,p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)]}),contentType:'application/json'});
});
