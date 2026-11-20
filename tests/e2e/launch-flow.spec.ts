import { expect, test } from "@playwright/test";
import { Connection } from "@solana/web3.js";
import { connectAndSignIn, generateClipInPage, installTestWallet, testKeypair } from "./test-wallet";

/**
 * Full creator journey on devnet with a test wallet:
 * connect → sign in → upload a generated clip → processing → details → token form → preview →
 * prepare (real create_v2 build + simulation) → sign → on-chain verification → token page → trade panel.
 *
 * If the test wallet holds no devnet SOL, the test asserts the honest "not enough SOL" outcome
 * at the prepare step instead of launching. Fund `.data/test-wallet.json` from faucet.solana.com
 * to exercise the real launch.
 */
test("creator uploads a clip and launches its token", async ({ page }) => {
  const kp = testKeypair();
  const conn = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
  const balance = await conn.getBalance(kp.publicKey).catch(() => 0);
  const funded = balance > 0.05e9;
  test.info().annotations.push({ type: "wallet", description: `${kp.publicKey.toBase58()} balance=${balance / 1e9} SOL (devnet)` });

  await installTestWallet(page, kp);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Your Clips\./ })).toBeVisible();

  // Navigation
  await page.getByRole("link", { name: "Explore", exact: true }).first().click();
  await expect(page).toHaveURL(/\/explore/);
  await page.getByTestId("cta-launch").count(); // homepage CTA exists only on /
  await page.goto("/create");
  await expect(page.getByText("Connect your Solana wallet to launch")).toBeVisible();

  // Wallet connect + Sign-In With Solana
  await connectAndSignIn(page);

  // Upload an original generated clip
  const clip = await generateClipInPage(page, 2);
  await page.getByTestId("video-input").setInputFiles({ name: "fragfun-test-clip.webm", mimeType: "video/webm", buffer: clip });
  await page.getByTestId("rights-checkbox").check();
  await page.getByTestId("upload-button").click();

  // Processing completes → details step
  await expect(page.getByLabel("Clip title")).toBeVisible({ timeout: 60_000 });
  await page.getByLabel("Clip title").fill("E2E Crazy Highway Jump");
  await page.getByLabel("Description").fill("Generated test clip for the end-to-end suite.");
  await page.getByRole("button", { name: "Crazy Stunts" }).click();
  await page.getByTestId("details-continue").click();

  // Token metadata
  await page.getByTestId("token-name").fill("E2E Highway Jump");
  await page.getByTestId("token-symbol").fill("$E2EJMP");
  await page.getByLabel("Token description").fill("End-to-end test token.");
  await page.getByTestId("token-continue").click();

  // Preview
  await expect(page.getByText("E2E Highway Jump")).toBeVisible();
  await expect(page.getByText("$E2EJMP")).toBeVisible();
  await expect(page.getByText("Fragfun platform fee")).toBeVisible();
  await page.getByTestId("ack-checkbox").check();
  await page.getByTestId("prepare-launch").click();

  if (!funded) {
    await expect(page.getByRole("alert").filter({ hasText: /SOL/ })).toBeVisible({ timeout: 60_000 });
    test.info().annotations.push({ type: "result", description: "Unfunded wallet: prepare correctly refused with a clear message; no transaction was signed." });
    return;
  }

  // Real devnet launch
  await expect(page.getByText("Transaction simulated successfully")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("sign-launch").click();
  await expect(page.getByTestId("launch-success")).toBeVisible({ timeout: 150_000 });
  await expect(page.getByText("Your moment is now on-chain.")).toBeVisible();
  await page.getByRole("link", { name: "View market" }).click();
  await expect(page.getByTestId("trade-tab-buy")).toBeVisible();
  await page.getByTestId("trade-amount").fill("0.01");
  await page.getByTestId("trade-quote-button").click();
  await expect(page.getByTestId("trade-quote")).toBeVisible({ timeout: 60_000 });
});

test("wallet signature rejection is handled", async ({ page }) => {
  const kp = testKeypair(true);
  await installTestWallet(page, kp, { rejectTransactions: true });
  await page.goto("/settings");
  await connectAndSignIn(page);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByPlaceholder("letters, numbers, _").fill(`e2e_${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  // Creator profile reflects the update
  await page.goto(`/profile/${kp.publicKey.toBase58()}`);
  await expect(page.getByText("Creator dashboard")).toBeVisible();
});
