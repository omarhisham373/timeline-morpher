import { expect, test } from "@playwright/test";
import { openFresh } from "./fixtures";

test("records from the microphone with a live waveform", async ({ page }) => {
  await openFresh(page);
  await page.getByTestId("record-button").click();
  await expect(page.getByTestId("record-button")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("waveform")).toHaveAttribute("data-active", "true");
  await page.waitForTimeout(1500);
  // The fake device produces a tone: the canvas must have drawn something.
  const painted = await page.getByTestId("waveform").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  expect(painted).toBeGreaterThan(500);
  await page.keyboard.press("r"); // keyboard shortcut stops recording
  await expect(page.getByTestId("record-button")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("process-button")).toBeEnabled();
});

test("audio without a transcript is parked until someone types it", async ({ page }) => {
  await openFresh(page);
  await page.getByTestId("record-button").click();
  await page.waitForTimeout(800);
  await page.getByTestId("record-button").click();
  await page.getByTestId("transcript").fill("");
  await page.getByTestId("process-button").click();
  const item = page.getByTestId("outbox-item").first();
  await expect(item).toHaveAttribute("data-status", "needs_transcript");
  await item.getByLabel("Transcript for this recording").fill("HVAC ductwork is a day behind");
  await item.getByRole("button", { name: "Sync" }).click();
  await expect(item).toHaveAttribute("data-status", "synced");
  await expect(page.getByTestId("review-summary")).toContainText("HVAC ductwork +1d");
});
