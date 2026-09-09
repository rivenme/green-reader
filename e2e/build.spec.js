import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';

test('built app and worker load beneath the GitHub Pages subpath without a CDN',async({page})=>{
  const root=resolve('dist'),prefix='http://production.test/green-reader/',unexpected=[];
  await page.route('**/*',async route=>{
    const url=route.request().url();
    if(!url.startsWith(prefix)){unexpected.push(url);return route.abort();}
    const name=new URL(url).pathname.slice('/green-reader/'.length)||'index.html';
    const file=resolve(root,name);
    if(!file.startsWith(root+sep))return route.abort();
    try{
      const body=await readFile(file);
      const contentType={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream';
      await route.fulfill({body,contentType});
    }catch{return route.fulfill({status:404,body:'Missing build asset'});}
  });
  await page.goto(prefix);await page.locator('#startPractice').click();await page.locator('#panelToggle').click();
  await page.getByText('Green speed & learning aids',{exact:true}).click();await page.locator('#optBest').check();
  await expect(page.locator('#guideStatus')).toContainText(/Makeable line|Closest route/,{timeout:15000});
  expect(unexpected).toEqual([]);
});

test('unavailable storage shows a notice outside the closed settings panel',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage blocked','SecurityError');}}));
  await page.goto('/');await page.locator('#startPractice').click();
  await expect(page.locator('#panel')).toBeHidden();await expect(page.locator('#saveStatus')).toBeVisible();
  await expect(page.locator('#saveStatus')).toContainText('cannot be saved');await expect(page.locator('#ballHandle')).toBeVisible();
});
