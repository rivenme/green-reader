import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',fullyParallel:true,workers:process.env.CI?1:2,retries:process.env.CI?1:0,
  timeout:process.env.CI?60000:30000,
  maxFailures:process.env.CI?3:0,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:5173',trace:process.env.CI?'on-first-retry':'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome']}},
    // Exercise the macOS window compositor in CI; local runs remain headless.
    {name:'firefox',use:{...devices['Desktop Firefox'],headless:!process.env.CI}},
    {name:'webkit',use:{...devices['Desktop Safari']}},
    {name:'mobile-chrome',use:{...devices['Pixel 7']}},
    {name:'mobile-safari',use:{...devices['iPhone 13']}}
  ],
  webServer:{command:'npm run dev -- --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI,timeout:30000}
});
