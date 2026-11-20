import { expect, test } from "@playwright/test";

test.describe("mobile layout", () => {
  for (const path of ["/", "/explore", "/create", "/leaderboard", "/activity", "/wars", "/settings"]) {
    test(`${path} has no horizontal overflow and shows the tab bar`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expect(page.getByRole("navigation", { name: "Mobile" })).toBeVisible();
    });
  }

  test("desktop nav collapses on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: "Explore" }).click();
    await expect(page).toHaveURL(/\/explore/);
  });
});
