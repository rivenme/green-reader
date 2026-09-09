import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',fullyParallel:true,workers:process.env.CI?1:2,retries:process.env.CI?1:0,
  timeout:process.env.CI?60000:30000,
  maxFailures:process.env.CI?3:0,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:5173',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome']}},
    {name:'firefox',use:{...devices['Desktop Firefox'],launchOptions:process.env.CI?{
      // Virtual macOS displays can stall hardware vsync; keep real-time frames.
      firefoxUserPrefs:{'layout.frame_rate':60}
    }:{}}},
    {name:'webkit',use:{...devices['Desktop Safari']}},
    {name:'mobile-chrome',use:{...devices['Pixel 7']}},
    {name:'mobile-safari',use:{...devices['iPhone 13']}}
  ],
  webServer:{command:'npm run dev -- --port 5173',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI,timeout:30000}
});
