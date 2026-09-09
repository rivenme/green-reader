import {test,expect} from '@playwright/test';

async function settledBall(page){
  const handle=page.locator('#ballHandle');
  await expect(handle).toBeVisible();
  let previous=null,stable=0,box;
  await expect.poll(async()=>{
    box=await handle.boundingBox();
    const next=box&&`${Math.round(box.x)},${Math.round(box.y)}`;
    stable=next&&next===previous?stable+1:0;previous=next;
    return stable;
  },{timeout:10000,intervals:[150]}).toBeGreaterThanOrEqual(3);
  return {x:box.x+box.width/2,y:box.y+box.height/2};
}
async function settledPower(page){
  let previous=null,stable=0;
  await expect.poll(async()=>{
    const next=await page.locator('#dragPowerValue').textContent();
    stable=next===previous?stable+1:0;previous=next;return stable;
  },{intervals:[150]}).toBeGreaterThanOrEqual(3);
  return {width:(await page.locator('#dragPowerFill').boundingBox()).width,value:parseFloat(previous)};
}

test('drag layout stays clear and its visible power meter grows, shrinks, and cancels',async({page},info)=>{
  await page.goto('/');await page.locator('#startPractice').click();
  await expect(page.locator('#shotControls')).toBeHidden();
  await expect(page.locator('#quickBtns button:visible')).toHaveCount(1);
  await expect(page.locator('#readCard .row:visible')).toHaveCount(2);
  await expect(page.locator('#dragPower')).toBeHidden();
  const {x,y}=await settledBall(page);
  await page.screenshot({path:info.outputPath('drag-clear-screen.png')});
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+45,{steps:5});
  await expect(page.locator('#dragPower')).toBeInViewport();
  await expect(page.locator('#dragPowerValue')).toHaveText(/\d+\.\d+%/);
  await expect(page.locator('#dragPace')).toHaveText('Short');
  // Compare held pulls after the gesture's time-based smoothing has settled.
  const weak=await settledPower(page);
  await page.screenshot({path:info.outputPath('drag-low-power.png')});
  await page.mouse.move(x,y+120,{steps:8});
  const strong=await settledPower(page);
  expect(strong.width).toBeGreaterThan(weak.width+15);expect(strong.value).toBeGreaterThan(weak.value);
  await page.screenshot({path:info.outputPath('drag-high-power.png')});
  await page.mouse.move(x,y+45,{steps:8});
  await expect.poll(async()=>Math.abs((await page.locator('#dragPowerFill').boundingBox()).width-weak.width)).toBeLessThan(1);
  await page.keyboard.press('Escape');await page.mouse.up();
  await expect(page.locator('#dragPower')).toBeHidden();
  await expect(page.locator('#uiStrokes')).toHaveText('0');
});

test('button choice persists and can switch back to drag without restarting the round',async({page},info)=>{
  await page.goto('/');await page.locator('[data-shot-input="buttons"]').click();
  await expect(page.locator('[data-shot-input="buttons"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('#startPractice').click();
  await expect(page.locator('#shotControls')).toBeVisible();
  await expect(page.locator('#ballHandle')).toBeHidden();
  await page.locator('#stage canvas').press('n');
  await page.reload();await page.locator('#resumeRun').click();
  await expect(page.locator('#shotControls')).toBeVisible();
  await expect(page.locator('#hudLevel')).toHaveText('Lv 2');
  await page.screenshot({path:info.outputPath('button-screen.png')});
  await page.locator('#panelToggle').click();await page.locator('#shotInput').selectOption('drag');await page.locator('#panelToggle').click();
  await expect(page.locator('#shotControls')).toBeHidden();
  await expect(page.locator('#ballHandle')).toBeInViewport();
  await expect(page.locator('#hudLevel')).toHaveText('Lv 2');
  await page.reload();await page.locator('#resumeRun').click();
  await expect(page.locator('#shotControls')).toBeHidden();
});

for(const automatic of [true,false])test(`camera ${automatic?'reframes the next putt':'respects manual framing'} after the ball stops`,async({page},info)=>{
  await page.goto('/');await page.locator('[data-shot-input="buttons"]').click();await page.locator('#startPractice').click();
  await page.locator('#panelToggle').click();await page.getByText('Touch & cup',{exact:true}).click();
  await page.locator('#controlMode').selectOption('distance');
  await page.locator('#optAutoCamera').setChecked(automatic);await page.locator('#panelToggle').click();
  await page.locator('#shotPower').fill('2');
  await page.locator('#panelToggle').click();await page.locator('#shotInput').selectOption('drag');await page.locator('#panelToggle').click();
  await page.locator('#qbRead').click();await settledBall(page);
  await expect(page.locator('#qbRead')).toHaveAttribute('aria-pressed','true');
  await page.locator('#stage canvas').press('Space');
  await expect(page.locator('#puttFeedback')).toBeVisible({timeout:20000});
  await expect(page.locator('#feedbackDetails')).toBeHidden();
  await expect(page.locator('#qbRead')).toHaveAttribute('aria-pressed',String(!automatic));
  const finish=await settledBall(page);
  await expect(page.locator('#ballHandle')).toBeInViewport();
  await page.screenshot({path:info.outputPath('after-putt.png')});
  await page.locator('#stage canvas').press('c');
  const reframed=await settledBall(page),change=Math.hypot(reframed.x-finish.x,reframed.y-finish.y);
  if(automatic)expect(change).toBeLessThan(2);
  else expect(change).toBeGreaterThan(10);
});
