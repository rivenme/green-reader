import {test,expect} from '@playwright/test';
import {SAVE_KEY,freshRun,defaultSettings,defaultCareer} from '../src/storage.js';
import {makeLevel} from '../src/course.js';
import {COURSE_VERSION} from '../src/constants.js';

test('loads without runtime errors and teaches the first putt',async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Read the break. Find your pace.'})).toBeVisible();
  await page.getByRole('button',{name:'Learn with your first putt'}).click();
  await expect(page.locator('#lessonTitle')).toHaveText('1 · Choose a line');
  await page.screenshot({path:info.outputPath('lesson.png')});
  await page.getByRole('slider',{name:'Putt distance'}).fill('8');
  await page.getByRole('button',{name:'Putt',exact:true}).click();
  await expect(page.locator('#uiStrokes')).toHaveText('1');
  await expect(page.locator('#msgText')).toContainText('Your first read, made.',{timeout:15000});
  await page.locator('#finishLesson').click();
  await expect(page.locator('#modeLabel')).toHaveText('Practice');
  expect(errors).toEqual([]);
});

test('competition rules cannot be bypassed with shortcuts',async({page})=>{
  await page.goto('/');await page.locator('#startCareer').click();
  await page.locator('#stage canvas').press('n');
  await expect(page.locator('#hudLevel')).toHaveText('Lv 1');
  await page.locator('#stage canvas').press('p');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByText('Green speed & learning aids',{exact:true}).click();
  await expect(page.locator('#optPath')).toBeDisabled();await expect(page.locator('#optPath')).not.toBeChecked();
  await expect(page.locator('#stimpSlider')).toBeDisabled();
  await expect(page.locator('#btnRetry')).toBeHidden();
});

test('practice skip and resume survive reload',async({page})=>{
  await page.goto('/');await page.locator('#startPractice').click();
  await page.locator('#stage canvas').press('n');await expect(page.locator('#hudLevel')).toHaveText('Lv 2');
  await page.reload();await page.locator('#resumeRun').click();await expect(page.locator('#hudLevel')).toHaveText('Lv 2');
});

test('corrupt storage recovers to a playable game',async({page})=>{
  await page.addInitScript(({key})=>{localStorage.setItem(key,'{"version":1,"career":{"ach":null,"xp":"bad"},"stats":null,"run":{"mode":"career"}}');},{key:SAVE_KEY});
  await page.goto('/');await page.locator('#startPractice').click();
  await expect(page.locator('#stage canvas')).toBeVisible();await expect(page.locator('#btnPutt')).toBeEnabled();
});

test('final practice result can be replayed',async({page})=>{
  const l=makeLevel(50);const run={courseVersion:COURSE_VERSION,mode:'practice',LV:50,ball:{...l.hole,vx:0,vy:0,moving:false,rolling:true,skidU:0},strokes:2,totalVsPar:0,holed:true,completed:true,runScore:0,streakCount:0,runStats:freshRun(),sessionSG:0,puttStart:null};
  await page.addInitScript(({key,run,settings,career})=>localStorage.setItem(key,JSON.stringify({version:1,run,settings,career,stats:{}})),{key:SAVE_KEY,run,settings:defaultSettings(),career:defaultCareer()});
  await page.goto('/');await page.locator('#resumeRun').click();await page.locator('#replayResult').click();
  await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#btnPutt')).toBeEnabled();await expect(page.locator('#hudLevel')).toHaveText('Lv 50');
});

test('keyboard focus stays within help and returns to opener',async({page})=>{
  await page.goto('/');await page.locator('#startPractice').click();await page.locator('#btnHelp').click();
  await expect(page.locator('#app')).toHaveAttribute('inert','');
  await page.getByRole('button',{name:'Back to the green'}).press('Tab');
  await expect(page.getByRole('link',{name:'Report a problem or suggest an improvement'})).toBeFocused();
  await page.keyboard.press('Escape');await expect(page.locator('#btnHelp')).toBeFocused();
});
