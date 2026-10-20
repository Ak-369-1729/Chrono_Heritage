import { defineConfig, devices } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// Headless Chromium renders WebGL through SwiftShader (software), so the 3D scene can be exercised in CI.
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
// Firefox and WebKit run the same suites when their browsers are installed (E2E_ENGINES=chromium,firefox,webkit).
const ENGINES = (process.env.E2E_ENGINES ?? "chromium").split(",").map((s) => s.trim());

const viewports = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  phone: { width: 390, height: 844 },
  narrow: { width: 320, height: 640 },
};

const chromium = [
  { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: viewports.desktop, launchOptions: { args: GL } }, testIgnore: /mobile/ },
  { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: viewports.laptop, launchOptions: { args: GL } }, testMatch: /responsive|landing/ },
  { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: viewports.tablet, hasTouch: true, launchOptions: { args: GL } }, testMatch: /responsive|mobile/ },
  { name: "phone", use: { ...devices["Pixel 7"], viewport: viewports.phone, launchOptions: { args: GL } }, testMatch: /responsive|landing|mobile|auth/ },
  { name: "narrow", use: { ...devices["Pixel 7"], viewport: viewports.narrow, launchOptions: { args: GL } }, testMatch: /responsive|mobile|auth/ },
];
const others = ENGINES.filter((e) => e !== "chromium").flatMap((engine) => [
  { name: `${engine}-desktop`, use: { ...(engine === "firefox" ? devices["Desktop Firefox"] : devices["Desktop Safari"]), viewport: viewports.desktop }, testMatch: /responsive|auth|journeys/ },
  { name: `${engine}-phone`, use: { ...(engine === "firefox" ? devices["Desktop Firefox"] : devices["iPhone 13"]), viewport: viewports.phone }, testMatch: /responsive|mobile/ },
]);

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "e2e-results.json" }]],
  use: { baseURL: BASE, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [...(ENGINES.includes("chromium") ? chromium : []), ...others],
});
