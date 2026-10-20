import { expect, test } from "@playwright/test";
import { noHorizontalOverflow, register } from "./helpers";

// Runs on the tablet (768), phone (390) and narrow phone (320) projects.

test("menu opens, traps focus, closes with Escape and navigates", async ({ page }) => {
  await page.goto("/atlas");
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#mobile-menu a").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  await menu.click();
  await page.locator("#mobile-menu").getByRole("link", { name: /Benchmarks/ }).click();
  await expect(page).toHaveURL(/\/benchmarks$/);
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});

test("touch targets in the navigation and forms are at least 40 px tall", async ({ page }) => {
  await page.goto("/register");
  for (const loc of [page.getByRole("button", { name: "Menu" }), page.getByRole("button", { name: "Create account" }), page.getByRole("textbox", { name: "Email" })]) {
    const box = await loc.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
  }
});

test("atlas: list and map are both usable, one at a time on small screens", async ({ page }, info) => {
  await page.goto("/atlas");
  await expect(page.getByRole("region", { name: /Map of sites/ })).toBeHidden();
  await page.getByRole("button", { name: "map", exact: true }).click();
  const map = page.getByRole("region", { name: /Map of sites/ });
  await expect(map).toBeVisible();
  await expect(map.locator("canvas")).toBeAttached({ timeout: 20_000 });
  const box = await map.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(info.project.use.viewport!.width);
  await page.getByRole("button", { name: "list", exact: true }).click();
  await expect(page.getByRole("link", { name: /Aster Hill/ })).toBeVisible();
  await noHorizontalOverflow(page);
});

test("sky explorer charts fit the screen", async ({ page }) => {
  await page.goto("/sky?site=ill-aster-hill");
  await page.getByLabel("Target").selectOption("sun_december_solstice_rise");
  await page.getByRole("button", { name: "Compute" }).click();
  const chart = page.getByRole("img", { name: /Angular scale centred on the prediction/ });
  await expect(chart).toBeVisible({ timeout: 30_000 });
  const vw = page.viewportSize()!.width;
  const b = await chart.boundingBox();
  expect(b!.x + b!.width).toBeLessThanOrEqual(vw + 1);
  await noHorizontalOverflow(page);
});

test("registration and sign-in work on a small screen with the virtual keyboard types", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveAttribute("inputmode", "email");
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveAttribute("autocomplete", "email");
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("autocomplete", "new-password");
  await register(page);
  await noHorizontalOverflow(page);
});
