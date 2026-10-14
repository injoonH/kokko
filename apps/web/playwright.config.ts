import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:8097",
    trace: "retain-on-failure",
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },
  webServer: {
    command:
      "cd ../server && KOKKO_BROWSER_TEST=1 go test ./internal/kokko -run ^TestBrowserHarness$ -count=1 -timeout=10m",
    url: "http://127.0.0.1:8097/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  reporter: "list",
});
