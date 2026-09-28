import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  outputDir: '.cache/playwright-results',
  snapshotDir: './tests/visual/__snapshots__',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'zh-TW',
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'iphone-portrait', use: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true } },
    { name: 'iphone-landscape', use: { viewport: { width: 956, height: 440 }, isMobile: true, hasTouch: true } },
    { name: 'android-small', use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
  ],
});
