import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 20_000,
  use: {
    browserName: "chromium",
    viewport: {
      width: 1440,
      height: 900,
    },
  },
});
