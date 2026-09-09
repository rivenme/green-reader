import {test,expect} from '@playwright/test';
import {SAVE_KEY,defaultSettings,defaultCareer,freshRun} from '../src/storage.js';
import {makeLevel} from '../src/course.js';
import {COURSE_VERSION} from '../src/constants.js';

async function practiceAt(page,LV,settings={}){
  const level=makeLevel(LV);
  const run={courseVersion:COURSE_VERSION,mode:'practice',LV,ball:{...level.ball,vx:0,vy:0,moving:false,rolling:true,skidU:0},strokes:0,totalVsPar:0,holed:false,completed:false,runScore:0,streakCount:0,runStats:freshRun(),sessionSG:0,puttStart:null};
  await page.addInitScript(({key,state})=>localStorage.setItem(key,JSON.stringify(state)),{
    key:SAVE_KEY,state:{version:1,run,settings:{...defaultSettings(),...settings},career:defaultCareer(),stats:{}}
  });
  await page.goto('/');await page.locator('#resumeRun').click();
}
async function center(locator){const r=await locator.boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2};}
async function heldPower(page){
  let previous='',stable=0;
  await expect.poll(async()=>{
    const value=await page.locator('#dragPowerValue').textContent();stable=value===previous?stable+1:0;previous=value;return stable;
  },{intervals:[150]}).toBeGreaterThanOrEqual(3);
}
for(const [name,width,height,pull] of [['portrait',390,664,185],['landscape',740,360,108],['a compact screen',320,568,153.6]]){
  test(`a long putt has room for full drag power in ${name}`,async({page},info)=>{
    await page.setViewportSize({width,height});await practiceAt(page,50);
    const p=await center(page.locator('#ballHandle')),bounds=await page.locator('#dragBounds').boundingBox();
    expect(p.y+pull).toBeLessThanOrEqual(bounds.y+bounds.height);
    await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x,p.y+pull,{steps:8});
    await expect(page.locator('#dragPowerValue')).toHaveText('100.0%');
    await expect(page.locator('#finishMarkerLabel')).toBeInViewport();
    await expect(page.locator('#dragRoll')).toContainText('ft roll on this green');
    const meter=await page.locator('#dragPower').boundingBox();
    expect(meter.x+meter.width<p.x-6||meter.x>p.x+6||meter.y+meter.height<p.y-16).toBe(true);
    await page.screenshot({path:info.outputPath('full-pull.png')});
    await page.keyboard.press('Escape');await page.mouse.up();
    await expect(page.locator('#uiStrokes')).toHaveText('0');
  });
}
test('a sloping-green shot finishes at the displayed target and matches its preview',async({page},info)=>{
  await practiceAt(page,3,{optAutoCamera:false});
  const p=await center(page.locator('#ballHandle'));
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+18,p.y+90,{steps:8});
  await heldPower(page);
  await expect(page.locator('#finishTarget')).toBeInViewport();
  await expect(page.locator('#finishTitle')).toHaveText('Expected stop');
  const target=await center(page.locator('#finishTarget')),description=await page.locator('#finishDetail').textContent();
  await page.screenshot({path:info.outputPath('terrain-preview.png')});
  await page.mouse.up();await expect(page.locator('#finishTarget')).toBeVisible();
  await expect(page.locator('#puttFeedback')).toBeVisible({timeout:20000});
  await expect(page.locator('#finishText')).toHaveText(description);
  const actual=await center(page.locator('#ballHandle'));
  expect(Math.hypot(target.x-actual.x,target.y-actual.y)).toBeLessThan(2);
  await page.screenshot({path:info.outputPath('actual-stop.png')});
});
test('terrain preview can be disabled and the preference survives reopening',async({page})=>{
  await page.goto('/');await page.locator('#startPractice').click();
  await page.locator('#panelToggle').click();await page.getByText('Green speed & learning aids',{exact:true}).click();
  await page.locator('#optPath').uncheck();await page.locator('#panelToggle').click();
  await page.reload();await page.locator('#resumeRun').click();
  const p=await center(page.locator('#ballHandle'));
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x,p.y+80,{steps:6});
  await expect(page.locator('#dragPower')).toBeVisible();await expect(page.locator('#finishMarkerLabel')).toBeHidden();
  await page.keyboard.press('Escape');await page.mouse.up();
});
