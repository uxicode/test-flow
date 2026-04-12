import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("loads example.com", async ({ page }) => {
    await page.goto("https://example.com/");
    await expect(page.getByRole("heading", { name: "Example Domain" })).toBeVisible();
  });
});
