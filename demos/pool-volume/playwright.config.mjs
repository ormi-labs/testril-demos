import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  testMatch: "*.browser.mjs",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL: "http://127.0.0.1:4177", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1100 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node test/browser-server.mjs",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: false,
  },
});
