import {test,expect} from '@playwright/test';

async function openSettings(page){
  if(!(await page.locator('#panel').isVisible()))await page.locator('#panelToggle').click();
}
async function distanceAssist(page){
  await openSettings(page);
  if(await page.locator('#controlSettings').getAttribute('open')===null)await page.getByText('Touch & cup',{exact:true}).click();
  await page.locator('#controlMode').selectOption('distance');
  await page.locator('#panelToggle').click();
}
async function drill(page,button){
  await openSettings(page);
  if(await page.locator('#drillSettings').getAttribute('open')===null)await page.getByText('Practice drills',{exact:true}).click();
  await page.locator(button).click();
}
test('stroke repeats between lies; changing range preserves the shot and pace assessment',async({page},info)=>{
  await page.goto('/');await page.locator('#startPractice').click();
  await page.getByRole('slider',{name:'Stroke strength'}).fill('38');
  const pace=await page.locator('#paceLabel').textContent(),reach=await page.locator('#reachHint').textContent();
  await page.locator('#fullRange').click();
  await expect(page.locator('#paceLabel')).toHaveText(pace);
  await expect(page.locator('#reachHint')).toHaveText(reach);
  const strength=await page.locator('#powerValue').textContent();
  await page.locator('#stage canvas').press('n');
  await expect(page.locator('#powerValue')).toHaveText(strength);await expect(page.locator('#reachHint')).toHaveText(reach);
  await page.screenshot({path:info.outputPath('stroke-controls.png')});
});
test('a short miss explains its finish and retries the same lie and selected stroke',async({page},info)=>{
  await page.goto('/');await page.locator('#startPractice').click();await distanceAssist(page);
  const original=await page.locator('#uiDist').textContent();
  await page.locator('#shotPower').fill('2');await expect(page.locator('#paceLabel')).toHaveText('Short');
  await page.locator('#btnPutt').click();
  await expect(page.locator('#puttFeedback')).toBeVisible({timeout:15000});
  await expect(page.locator('#finishText')).toContainText('short');
  await expect(page.locator('#adjustmentText')).toContainText('On a replay: Try');
  await page.screenshot({path:info.outputPath('finish-feedback.png')});
  await page.locator('#retryLast').click();
  await expect(page.locator('#uiDist')).toHaveText(original);await expect(page.locator('#uiStrokes')).toHaveText('0');
  await expect(page.locator('#powerValue')).toHaveText('2.0 ft');
  await page.locator('#btnPutt').click();await expect(page.locator('#puttFeedback')).toBeVisible({timeout:15000});
  await openSettings(page);await page.locator('#controlMode').selectOption('stroke');await page.locator('#panelToggle').click();
  await page.locator('#fullRange').click();await page.locator('#retryLast').click();
  await expect(page.locator('#reachHint')).toContainText('Flat reach 2.0 ft');
  await expect(page.locator('#uiDist')).toHaveText(original);
});
test('pace drill measures rollout, supports retries, and saves results without replacing the round',async({page},info)=>{
  test.setTimeout(60000);
  await page.goto('/');await page.locator('#startPractice').click();await page.locator('#stage canvas').press('n');
  await distanceAssist(page);await drill(page,'#startPaceDrill');
  await expect(page.locator('#drillInstruction')).toContainText('10 ft');
  await page.locator('#shotPower').fill('14');await page.locator('#btnPutt').click();
  await expect(page.locator('#drillResult')).toContainText('Keep practicing',{timeout:20000});
  await expect(page.locator('#result')).toBeHidden();
  await page.locator('#drillAgain').click();await page.locator('#shotPower').fill('10');await page.locator('#btnPutt').click();
  await expect(page.locator('#drillResult')).toContainText('Nice touch',{timeout:20000});
  await expect(page.locator('#drillResult')).toContainText('1/2');
  await expect(page.locator('#hudVsPar')).toHaveText('1/2');
  await page.screenshot({path:info.outputPath('pace-ladder.png')});
  await page.locator('#drillNext').click();await expect(page.locator('#drillTitle')).toContainText('2/9');
  await page.locator('#exitDrill').click();await expect(page.locator('#hudLevel')).toHaveText('Lv 2');
  await page.reload();await page.locator('#resumeRun').click();await openSettings(page);
  await page.getByText('Practice drills',{exact:true}).click();await expect(page.locator('#drillStats')).toContainText('Pace ladder: 1/2');
});
for(const [button,feet,text] of [['#startCircleDrill','3','Clean make'],['#startGateDrill','8','Through the gate']]){
  test(`${text} is graded by its practice drill`,async({page},info)=>{
    await page.goto('/');await page.locator('#startPractice').click();await distanceAssist(page);await drill(page,button);
    await page.locator('#shotPower').fill(feet);await page.locator('#btnPutt').click();
    await expect(page.locator('#drillResult')).toContainText(text,{timeout:15000});
    await expect(page.locator('#drillNext')).toBeVisible();
    await page.screenshot({path:info.outputPath('practice-drill.png')});
  });
}
test('realistic cup lets a fast crossing pass; competition locks cup rules and pre-shot assistance',async({page})=>{
  await page.goto('/');await page.locator('#startPractice').click();await distanceAssist(page);await openSettings(page);
  await page.locator('#cupMode').selectOption('realistic');await page.locator('#panelToggle').click();
  await page.locator('#shotPower').fill('18');await expect(page.locator('#paceLabel')).toHaveText('Long');await page.locator('#btnPutt').click();
  await expect(page.locator('#puttFeedback')).toBeVisible({timeout:15000});await expect(page.locator('#result')).toBeHidden();
  await page.locator('#openHome').click();await page.locator('#startCareer').click();
  await expect(page.locator('#paceFeedback')).toBeHidden();await openSettings(page);
  await page.getByText('Touch & cup',{exact:true}).click();await expect(page.locator('#cupMode')).toBeDisabled();
  await expect(page.locator('#cupMode')).toHaveValue('forgiving');
  await expect(page.locator('#drillSettings')).toBeHidden();
});
test('soft and firm comparison is available in Practice and does not block the putt control',async({page},info)=>{
  await page.goto('/');await page.locator('#startPractice').click();await page.locator('#stage canvas').press('n');await page.locator('#stage canvas').press('n');
  await openSettings(page);await page.getByText('Green speed & learning aids',{exact:true}).click();await page.locator('#optCompare').check();
  await expect(page.locator('#compareLegend')).toBeVisible({timeout:20000});await page.locator('#panelToggle').click();
  await expect(page.locator('#btnPutt')).toBeEnabled();await page.screenshot({path:info.outputPath('pace-comparison.png')});
});
test('rotation cancels a pull and landscape quick actions stay clear of Settings',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('#startPractice').click();
  await expect(page.locator('#ballHandle')).toBeVisible();
  const b=await page.locator('#ballHandle').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+40,{steps:4});
  await expect(page.locator('#btnPutt')).toHaveText('Release to putt');
  await page.setViewportSize({width:740,height:360});await page.mouse.up();
  await expect(page.locator('#uiStrokes')).toHaveText('0');await expect(page.locator('#btnPutt')).toHaveText('Putt');
  const menu=await page.locator('#panelToggle').boundingBox();
  for(const id of ['qbRead','qbPath','qbRetry']){
    const box=await page.locator('#'+id).boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(menu.y+menu.height);
  }
  await expect(page.locator('#ballHandle')).toBeInViewport();await page.screenshot({path:info.outputPath('rotated-layout.png')});
});
test('dragging a stroke updates its flat reach and plays that distance on a flat green',async({page})=>{
  await page.goto('/');await page.locator('#startPractice').click();
  const original=parseFloat(await page.locator('#uiDist').textContent());
  await expect(page.locator('#ballHandle')).toBeVisible();
  const box=await page.locator('#ballHandle').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await expect(page.locator('#paceLabel')).toHaveText('Pull back to choose pace');
  await page.mouse.move(x,y+55,{steps:6});
  await expect(page.locator('#powerValue')).toHaveText('14.3%');
  const hint=await page.locator('#reachHint').textContent(),feet=Number(hint.match(/Flat reach ([\d.]+)/)[1]);
  expect(feet).toBeGreaterThan(0);expect(feet).toBeLessThan(original-1);
  await page.mouse.up();await expect(page.locator('#puttFeedback')).toBeVisible({timeout:15000});
  const remaining=parseFloat(await page.locator('#uiDist').textContent());
  expect(Math.abs(remaining-(original-feet))).toBeLessThan(.15);
});
