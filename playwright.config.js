const { defineConfig, devices } = require('@playwright/test');

// Tests the static frontend (backend/src/main/resources/static) directly —
// no Kotlin backend involved. Every backend call the app makes is
// intercepted with page.route() and fed fixture data, the same way
// BoardRoutesTest.kt swaps in InMemoryBoardRepository instead of hitting
// Firestore for real.
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8123',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-static.js',
    url: 'http://localhost:8123/index.html',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // This environment pre-installs Chromium outside Playwright's usual
        // cache location; point at it explicitly instead of letting
        // Playwright try to download its own copy.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
});
