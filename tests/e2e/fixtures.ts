import { expect, type Page } from "@playwright/test";

export const SHOTS = "docs/screenshots";

/** Fresh app: clear IndexedDB + localStorage so every test starts from the baseline plan. */
export async function openFresh(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("masaro-field-notes");
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
  await waitReady(page);
}

export async function waitReady(page: Page) {
  await expect(page.locator('main[data-ready="true"]')).toBeVisible();
}

export async function outboxCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open("masaro-field-notes");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("outbox")) return resolve(0);
          const req = db.transaction("outbox").objectStore("outbox").count();
          req.onsuccess = () => {
            resolve(req.result);
            db.close();
          };
        };
      }),
  );
}

export async function typeNote(page: Page, text: string) {
  await page.getByTestId("transcript").fill(text);
  await page.getByTestId("process-button").click();
}
