import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test",
  testMatch: "*.browser.mjs",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4181" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1100 },
      },
    },
  ],
  webServer: {
    command: "node test/serve-with-fake-testril.mjs",
    env: { PORT: "4181" },
    url: "http://127.0.0.1:4181",
    reuseExistingServer: false,
  },
});
