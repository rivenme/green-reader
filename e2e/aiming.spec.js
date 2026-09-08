import {test,expect} from '@playwright/test';

test('distance control holes an eight-foot lesson and displays feet',async({page})=>{
  await page.goto('/');await page.locator('#startLesson').click();
  await page.getByRole('slider',{name:'Putt distance'}).fill('8');
  await expect(page.locator('#powerValue')).toHaveText('8.0 ft');
  await expect(page.locator('#shotPower')).toHaveAttribute('aria-valuetext','8.0 feet on flat ground');
  await page.locator('#btnPutt').click();
  await expect(page.locator('#msgText')).toContainText('Your first read, made.',{timeout:15000});
});

test('practice preview shows an endpoint, disappears for the shot, and stays off in competition',async({page},info)=>{
  await page.goto('/');await page.locator('#startPractice').click();
  await page.locator('#panelToggle').click();
  await page.getByText('Green speed & learning aids',{exact:true}).click();
  await page.locator('#optPath').check();await page.locator('#panelToggle').click();
  await page.locator('#shotPower').fill('5');
  await expect(page.locator('#finishMarkerLabel')).toBeVisible();
  await page.screenshot({path:info.outputPath('distance-preview.png')});
  const max=Number(await page.locator('#shotPower').getAttribute('max'));
  await page.locator('#fullRange').click();
  expect(Number(await page.locator('#shotPower').getAttribute('max'))).toBeGreaterThanOrEqual(max);
  await expect(page.locator('#powerValue')).toHaveText('5.0 ft');
  await page.locator('#btnPutt').click();await expect(page.locator('#finishMarkerLabel')).toBeHidden();
  await page.locator('#openHome').click();await page.locator('#startCareer').click();
  await page.locator('#shotPower').fill('5');await expect(page.locator('#finishMarkerLabel')).toBeHidden();
});

test('tap on the ball does not shoot; drag commits exactly the displayed distance',async({page})=>{
  await page.goto('/');await page.locator('#startLesson').click();
  const {width,height}=page.viewportSize();const x=width/2,y=height*.56;
  await page.mouse.move(x,y);await page.mouse.down();
  await expect(page.locator('#btnPutt')).toHaveText('Release to putt');
  await page.mouse.move(x+2,y+2);await page.mouse.up();
  await expect(page.locator('#uiStrokes')).toHaveText('0');
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+70,{steps:8});
  await expect(page.locator('#powerValue')).not.toHaveText('0.0 ft');
  const distance=parseFloat(await page.locator('#powerValue').textContent());
  expect(distance).toBeGreaterThan(.2);
  await page.mouse.up();await expect(page.locator('#uiStrokes')).toHaveText('1');
  await expect(page.locator('#btnPutt')).toBeEnabled({timeout:15000});
  const remaining=parseFloat(await page.locator('#uiDist').textContent());
  expect(Math.abs(remaining-(8-distance))).toBeLessThan(.15);
});
