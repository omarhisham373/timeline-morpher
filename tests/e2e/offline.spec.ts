import { expect, test } from "@playwright/test";
import { SHOTS, openFresh, outboxCount, typeNote, waitReady } from "./fixtures";

test("offline: note is cached in IndexedDB, survives reload, auto-syncs on reconnect", async ({ page }) => {
  await openFresh(page);
  let parseCalls = 0;
  page.on("request", (r) => r.url().endsWith("/api/parse") && parseCalls++);

  await page.getByTestId("offline-toggle").click();
  await expect(page.getByTestId("network-status")).toHaveAttribute("data-online", "false");
  await expect(page.getByTestId("process-button")).toHaveText(/Save offline/);

  // Capture while offline: sample audio + transcript go to the outbox.
  await page.getByTestId("sample-button").click();
  await page.getByTestId("skip-sample").click();
  await page.getByTestId("process-button").click();
  await expect(page.getByTestId("capture-info")).toContainText("Saved offline in IndexedDB");
  await typeNote(page, "Drywall is two days behind, tapers are short-handed.");

  const items = page.getByTestId("outbox-item");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toHaveAttribute("data-status", "queued");
  await expect(page.getByTestId("network-status")).toContainText("2 queued");
  expect(await outboxCount(page)).toBe(2);
  expect(parseCalls).toBe(0);
  await page.screenshot({ path: `${SHOTS}/09-offline-queue.png` });

  // Reload while still offline: the queue (incl. audio blob) is still there.
  await page.reload();
  await waitReady(page);
  await expect(page.getByTestId("network-status")).toHaveAttribute("data-online", "false");
  await expect(page.getByTestId("outbox-item")).toHaveCount(2);
  await expect(page.getByTestId("outbox-item").last()).toContainText("KB audio");
  expect(parseCalls).toBe(0);

  // Reconnect → automatic sync, oldest first, and the first result opens for review.
  await page.getByTestId("offline-toggle").click();
  await expect(page.getByTestId("network-status")).toHaveAttribute("data-online", "true");
  await expect(page.locator('[data-testid="outbox-item"][data-status="synced"]')).toHaveCount(2);
  expect(parseCalls).toBe(2);
  await expect(page.getByTestId("review-summary")).toContainText("2 delays");
  await page.getByTestId("apply-review").click();
  // The second synced note opens next.
  await expect(page.getByTestId("review-summary")).toContainText("Drywall +2d");
  await page.getByTestId("apply-review").click();
  await expect(page.getByTestId("bar-drywall")).toHaveAttribute("data-status", "delayed");
  await expect(page.getByTestId("bar-rebar")).toHaveAttribute("data-status", "delayed");
});

test("transient server errors are retried with backoff", async ({ page }) => {
  await openFresh(page);
  let calls = 0;
  await page.route("**/api/parse", async (route) => {
    calls++;
    if (calls === 1) return route.fulfill({ status: 503, body: JSON.stringify({ error: "upstream busy" }) });
    return route.continue();
  });
  await typeNote(page, "Paint is one day behind.");
  const item = page.getByTestId("outbox-item").first();
  await expect(item).toContainText(/Retry #2 in \ds/);
  await expect(item).toContainText("upstream busy");
  await page.screenshot({ path: `${SHOTS}/10-retry-backoff.png`, clip: { x: 0, y: 300, width: 720, height: 700 } });
  await expect(item).toHaveAttribute("data-status", "synced", { timeout: 15_000 });
  expect(calls).toBe(2);
});

test("permanent errors fail fast and can be retried manually", async ({ page }) => {
  await openFresh(page);
  let fail = true;
  await page.route("**/api/parse", (route) => (fail ? route.fulfill({ status: 422, body: JSON.stringify({ error: "bad payload" }) }) : route.continue()));
  await typeNote(page, "Paint is one day behind.");
  const item = page.getByTestId("outbox-item").first();
  await expect(item).toHaveAttribute("data-status", "failed");
  fail = false;
  await item.getByRole("button", { name: "Retry now" }).click();
  await expect(item).toHaveAttribute("data-status", "synced");
});
