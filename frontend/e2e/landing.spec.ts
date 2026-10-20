import { expect, test, type Page } from "@playwright/test";
import { noHorizontalOverflow, watchErrors } from "./helpers";

const JOURNEY = "section[data-mode]";

async function scrollJourney(page: Page, p: number) {
  await page.evaluate((p) => {
    const s = document.querySelector("section[data-mode]") as HTMLElement;
    const top = s.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top + p * (s.offsetHeight - window.innerHeight));
  }, p);
}

test.describe("landing journey", () => {
  test("hero: product name, tagline and working calls to action", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "CHRONOHERITAGE" })).toBeVisible();
    await expect(page.getByText("Reading the sky through the memory of stone.").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Enter the Observatory" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore the Science" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Create account" }).first()).toBeVisible();
    await expect(page.getByText(/original fortress-observatory/).first()).toBeAttached();
    await noHorizontalOverflow(page);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test("desktop renders the 3D fortress and scroll reveals each scene", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "3D checked on desktop");
    await page.goto("/?view=3d"); // explicit 3D: the slow-device fallback is off when the visitor asks for 3D
    await expect(page.locator(JOURNEY)).toHaveAttribute("data-mode", "3d");
    await expect(page.locator(`${JOURNEY} canvas`)).toBeAttached({ timeout: 30_000 });
    for (const [p, title] of [[0.22, "The gateway"], [0.4, "The courtyard of time"], [0.57, "The instrument chamber"], [0.73, "The evidence vault"], [0.985, "The research workspace"]] as const) {
      await scrollJourney(page, p);
      await expect(page.locator("div[style*='visible'] h2", { hasText: title }).first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test("phones get the layered 2D journey, not WebGL", async ({ page }, info) => {
    test.skip(info.project.name !== "phone", "phone only");
    await page.goto("/");
    await expect(page.locator(JOURNEY)).toHaveAttribute("data-mode", "layers");
    await expect(page.locator("canvas")).toHaveCount(0);
    await scrollJourney(page, 0.22);
    await expect(page.locator("div[style*='visible'] h2", { hasText: "The gateway" }).first()).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test("scene C shows a live engine calculation, scene E the live evidence ledger", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "data panels checked once");
    await page.goto("/");
    await scrollJourney(page, 0.42);
    await expect(page.locator("div[style*='visible'] svg[aria-label*='predicted June-solstice sunrise azimuth']")).toBeVisible({ timeout: 30_000 });
    // the same live values are in the screen-reader narrative as a table
    await expect(page.getByRole("table", { name: /Predicted June-solstice sunrise azimuth by year/ }).first()).toBeAttached();
    await expect(page.getByText(/illustrative observer at 27.0° N/).first()).toBeVisible();
    await scrollJourney(page, 0.74);
    await expect(page.getByText("Phase 0 — Evidence (dataset feasibility)").first()).toBeVisible();
    await expect(page.getByText(/illustrative\./).first()).toBeVisible();
  });

  test("the visitor is never trapped: skip link, scene index and the back button work", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop");
    await page.goto("/?view=3d");
    await expect(page.locator(JOURNEY)).toHaveAttribute("data-mode", "3d");
    await page.getByRole("link", { name: "Skip the introduction" }).click();
    await expect(page.getByRole("heading", { name: "Where to begin" })).toBeInViewport();
    await expect(page.locator("#after-journey")).toBeFocused();
    await page.getByRole("button", { name: /Scene 4: The instrument chamber/ }).click();
    await expect(page.locator("div[style*='visible'] h2", { hasText: "The instrument chamber" }).first()).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator("a:visible", { hasText: "Enter the Observatory" }).first().click();
    await expect(page).toHaveURL(/\/atlas$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/(\?view=3d)?(#after-journey)?$/);
    // the landing page is restored (not a stale atlas under the landing URL)
    await expect(page.locator("h1")).toHaveText("CHRONOHERITAGE");
    await expect(page.getByRole("heading", { name: "Where to begin" })).toBeAttached();
  });

  test("a device that cannot render 3D smoothly is moved to the layered view", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "desktop");
    // Headless Chromium draws WebGL in software (SwiftShader), far below 15 frames per second for this scene.
    await page.goto("/");
    await expect(page.locator(JOURNEY)).toHaveAttribute("data-mode", "3d");
    await expect(page.locator(JOURNEY)).toHaveAttribute("data-mode", "layers", { timeout: 30_000 });
    await expect(page.getByText(/rendered the 3D scene too slowly/)).toBeVisible();
  });

  test("full narrative is available to assistive technology", async ({ page }) => {
    await page.goto("/");
    for (const t of ["The gateway", "The courtyard of time", "The instrument chamber", "The evidence vault", "The research workspace"]) {
      await expect(page.getByRole("heading", { name: t }).first()).toBeAttached();
    }
  });

  test("the visitor can switch to still images and back", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "toggle checked on desktop");
    await page.goto("/");
    await expect(page.locator(JOURNEY)).toHaveAttribute("data-mode", /^(3d|layers)$/); // hydrated and decided
    await page.getByRole("button", { name: "Use still images" }).click();
    await expect(page.locator("section[data-mode='static']")).toBeVisible();
    await expect(page.getByText("You chose still images.")).toBeVisible();
    await page.getByRole("button", { name: "Show the animated journey" }).click();
    await expect(page.locator(JOURNEY)).toHaveAttribute("data-mode", /^(3d|layers)$/);
  });
});

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });
  test("replaces every scroll-driven scene with still images", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("section[data-mode='static']")).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.getByText(/Motion is reduced/)).toBeVisible();
    await expect(page.getByRole("img", { name: /the gateway seen up close/ })).toBeVisible();
    await noHorizontalOverflow(page);
  });
});
