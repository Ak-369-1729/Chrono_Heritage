import { expect, test } from "@playwright/test";
import { noHorizontalOverflow, watchErrors } from "./helpers";

const ROUTES = ["/", "/atlas", "/sites/ill-aster-hill", "/sites/new", "/feasibility", "/sky", "/analysis", "/analysis/new", "/benchmarks",
  "/compare", "/reports", "/documentation", "/gates", "/login", "/register", "/account", "/admin"];

for (const route of ROUTES) {
  test(`${route}: one h1, skip link, no horizontal overflow, no console errors`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(route);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeAttached();
    await page.waitForLoadState("networkidle");
    await noHorizontalOverflow(page);
    // content starts below the fixed navigation bar
    const top = await page.locator("h1").evaluate((h) => h.getBoundingClientRect().top + window.scrollY);
    const navH = await page.locator("header").first().evaluate((h) => h.getBoundingClientRect().height);
    expect(top).toBeGreaterThanOrEqual(navH);
    expect(errors).toEqual([]);
  });
}

test("keyboard users can reach the primary action on the landing page", async ({ page }, info) => {
  test.skip(!["desktop", "laptop"].includes(info.project.name), "desktop keyboard");
  await page.goto("/");
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const name = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText ?? "");
    if (name.includes("Enter the Observatory")) return;
  }
  throw new Error("Enter the Observatory was not reachable by keyboard within 25 tab stops");
});

test("skip link moves focus to the main content", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop keyboard");
  await page.goto("/atlas");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});
