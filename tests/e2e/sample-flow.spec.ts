import { expect, test } from "@playwright/test";
import { SHOTS, openFresh, waitReady } from "./fixtures";

test("sample clip → waveform + captions → parse → review → red nodes → undo", async ({ page }) => {
  await openFresh(page);
  await page.screenshot({ path: `${SHOTS}/01-overview.png` });

  // 1. Play the bundled field note: live waveform and streaming captions.
  await page.getByTestId("sample-button").click();
  await expect(page.getByTestId("waveform")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("transcript")).toHaveValue(/Mike on the Riverside job/, { timeout: 15_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/02-recording-waveform.png`, clip: { x: 0, y: 0, width: 720, height: 720 } });
  await page.getByTestId("skip-sample").click();
  await expect(page.getByTestId("transcript")).toHaveValue(/Roofing's fine, no delay there\./);

  // 2. Process → outbox → parse → review panel opens automatically.
  await page.getByTestId("process-button").click();
  await expect(page.getByTestId("outbox-item").first()).toHaveAttribute("data-status", "synced");
  const review = page.locator("#review");
  await expect(review).toBeVisible();
  await expect(page.getByTestId("review-summary")).toContainText("2 delays");
  await expect(page.getByTestId("review-item")).toHaveCount(3);
  await expect(page.getByTestId("review-notes")).toContainText("Knock-on");
  await expect(page.getByTestId("review-notes")).toContainText("On track");
  await expect(page.getByTestId("impact-finish")).toContainText("+5 days");
  await expect(page.getByTestId("preview-banner")).toBeVisible();
  await expect(page.getByTestId("preview-finishes")).toBeVisible(); // ghost bar for the what-if
  await page.screenshot({ path: `${SHOTS}/03-review-diff.png`, fullPage: true });

  // Editable diff: change a figure and watch the projected impact update.
  await page.getByTestId("delay-days").first().fill("4");
  await expect(page.getByTestId("impact-finish")).toContainText("+7 days");
  await page.getByTestId("delay-days").first().fill("2");
  await expect(page.getByTestId("impact-finish")).toContainText("+5 days");

  // Validated JSON view.
  await page.getByTestId("tab-json").click();
  await expect(page.getByTestId("json-status")).toContainText("Valid");
  const editor = page.getByTestId("json-editor");
  const json = await editor.inputValue();
  await editor.fill(json.replace('"delayDays": 2', '"delayDays": -2'));
  await expect(page.getByTestId("json-status")).toContainText("items.0.delayDays");
  await page.screenshot({ path: `${SHOTS}/08-json-validation.png`, clip: { x: 300, y: 40, width: 1140, height: 700 } });
  await editor.fill(json);
  await expect(page.getByTestId("json-status")).toContainText("Valid · 3 item(s)");
  await page.getByTestId("tab-changes").click();

  // 3. Apply → nodes animate and turn red; knock-on tasks are marked as pushed.
  await page.getByTestId("apply-review").click();
  await expect(review).toBeHidden();
  await expect(page.getByTestId("bar-rebar")).toHaveAttribute("data-status", "delayed");
  await expect(page.getByTestId("bar-electrical")).toHaveAttribute("data-status", "delayed");
  await expect(page.getByTestId("bar-slab")).toHaveAttribute("data-status", "pushed");
  await expect(page.getByTestId("bar-finishes")).toHaveAttribute("data-status", "pushed");
  await expect(page.getByTestId("bar-roofing")).toHaveAttribute("data-status", "pushed");
  await expect(page.getByTestId("bar-excavation")).toHaveAttribute("data-status", "on-plan");
  await expect(page.getByTestId("bar-rebar")).toHaveCSS("background-color", "rgb(185, 28, 28)");
  await expect(page.getByTestId("kpi-finish")).toContainText("+5 days");
  await expect(page.getByTestId("activity-log")).toContainText("Slab rebar");
  await expect(page.getByTestId("recovery-options")).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/04-ripple-mid-animation.png` });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/05-schedule-after-delay.png`, fullPage: true });

  // 4. Undo restores the plan; redo brings the delay back.
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("bar-rebar")).toHaveAttribute("data-status", "on-plan");
  await expect(page.getByTestId("kpi-finish")).toContainText("On plan");
  await page.keyboard.press("Control+Shift+Z");
  await expect(page.getByTestId("bar-rebar")).toHaveAttribute("data-status", "delayed");

  // 5. The schedule survives a reload.
  await page.reload();
  await waitReady(page);
  await expect(page.getByTestId("bar-rebar")).toHaveAttribute("data-status", "delayed");
});

test("keyboard: navigate bars and inspect why a task moved", async ({ page }) => {
  await openFresh(page);
  await page.getByTestId("transcript").fill("Slab rebar is two days behind.");
  await page.getByTestId("process-button").click();
  await page.getByTestId("apply-review").click();
  await expect(page.getByTestId("bar-rebar")).toHaveAttribute("data-status", "delayed");

  await page.getByTestId("bar-excavation").focus();
  for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("bar-inspection")).toBeFocused();
  await page.keyboard.press("Enter");
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toContainText("MEP inspection");
  await expect(page.getByTestId("cause-chain")).toContainText("Slab rebar");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/06-inspector-trace.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await expect(inspector).toBeHidden();
});

test("recovery suggestion pulls the finish date back", async ({ page }) => {
  await openFresh(page);
  await page.getByTestId("transcript").fill("Rebar delivery is a week late.");
  await page.getByTestId("process-button").click();
  await page.getByTestId("apply-review").click();
  await expect(page.getByTestId("kpi-finish")).toContainText("+5 days");
  await page.getByTestId("recovery-options").getByRole("button", { name: "Try it" }).first().click();
  await expect(page.getByTestId("kpi-finish")).toContainText("+3 days");
});

test("mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFresh(page);
  await page.getByTestId("transcript").fill("Electrical rough-in is three days behind, the sparkies didn't show.");
  await page.getByTestId("process-button").click();
  await page.getByTestId("apply-review").click();
  await expect(page.getByTestId("bar-electrical")).toHaveAttribute("data-status", "delayed");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${SHOTS}/07a-mobile-capture.png` });
  await page.locator("#timeline").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/07b-mobile-timeline.png` });
  // No horizontal page overflow: only the timeline scrolls sideways.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
