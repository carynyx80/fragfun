import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("homepage communicates the product and has working CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Your Clips\./ })).toBeVisible();
    await expect(page.getByText("Turn viral gaming moments into tradable tokens on Solana.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "How Fragfun works" })).toBeVisible();
    await page.getByTestId("cta-launch").click();
    await expect(page).toHaveURL(/\/create$/);
  });

  for (const [path, heading] of [
    ["/explore", "Explore"],
    ["/leaderboard", "Leaderboard"],
    ["/activity", "Activity"],
    ["/wars", "Clip Wars"],
    ["/terms", "Terms of service"],
    ["/privacy", "Privacy policy"],
  ] as const) {
    test(`${path} renders`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: false }).first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("error states: unknown clip, unknown token, no search results, admin restricted", async ({ page }) => {
    await page.goto("/clip/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("Clip not found").filter({ visible: true }).first()).toBeVisible();
    await page.goto("/token/61XhiiYkJATrSJ9PrNmVJPgqgk21NkwUJx3PssXepump");
    await expect(page.getByText("Token not found on Fragfun").filter({ visible: true }).first()).toBeVisible();
    await page.goto("/explore?q=zzzz-no-such-thing");
    await expect(page.getByText(/No results for/).filter({ visible: true }).first()).toBeVisible();
    await page.goto("/admin");
    await expect(page.getByText("restricted to Fragfun administrators").filter({ visible: true }).first()).toBeVisible();
    await page.goto("/definitely-not-a-page");
    await expect(page.getByText("Page not found").filter({ visible: true }).first()).toBeVisible();
  });

  test("explore shows published clips and the vertical feed", async ({ page }) => {
    await page.goto("/explore?sort=new");
    await page.waitForLoadState("networkidle");
    const cards = page.getByTestId("clip-card");
    if ((await cards.count()) === 0) test.skip(true, "No published clips in this database yet");
    await page.getByRole("button", { name: "Feed view" }).click();
    await expect(page.getByTestId("feed-item").first()).toBeVisible();
  });
});
