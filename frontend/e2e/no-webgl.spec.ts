import { expect, test } from "@playwright/test";

// A browser without WebGL still gets the whole journey: as layered 2D illustrations, or as still images when
// motion is reduced.
test.use({ launchOptions: { args: ["--disable-webgl", "--disable-3d-apis"] } });

test("without WebGL the journey uses layered illustrations", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop");
  await page.goto("/");
  await expect(page.locator("section[data-mode='layers']")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "The research workspace" }).first()).toBeAttached();
});

test.describe("without WebGL and with reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  test("falls back to still images", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop");
    await page.goto("/");
    await expect(page.locator("section[data-mode='static']")).toBeVisible();
    await expect(page.getByRole("heading", { name: "The research workspace" })).toBeVisible();
  });
});
