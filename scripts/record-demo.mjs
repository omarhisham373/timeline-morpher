// Scripted product demo → docs/demo.webm (then docs/demo.gif via ffmpeg).
// Usage: pnpm build && pnpm start --port 3200 &  node scripts/record-demo.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, renameSync } from "node:fs";

const BASE = process.env.DEMO_URL ?? "http://localhost:3200";
const size = { width: 1440, height: 900 };
mkdirSync("docs/.video", { recursive: true });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: "docs/.video", size } });
const page = await ctx.newPage();
const pause = (ms) => page.waitForTimeout(ms);

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.locator('main[data-ready="true"]').waitFor();
await pause(1500);

// 1. Field note: real audio, live waveform, captions.
await page.getByTestId("sample-button").click();
await pause(7000);
await page.getByTestId("skip-sample").click();
await pause(800);
await page.getByTestId("process-button").click();

// 2. Review the parsed changes and the what-if diff.
await page.locator("#review").waitFor();
await pause(2500);
await page.mouse.wheel(0, 450);
await pause(2500);
await page.mouse.wheel(0, -450);
await pause(600);

// 3. Apply → ripple through the Gantt.
await page.getByTestId("apply-review").click();
await page.locator("#timeline").scrollIntoViewIfNeeded().catch(() => {});
await page.getByTestId("bar-finishes").scrollIntoViewIfNeeded();
await pause(3500);

// 4. Why did drywall move? Trace it.
await page.getByTestId("bar-drywall").click();
await pause(3000);

// 5. Offline: queue in IndexedDB, reconnect → auto-sync.
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await pause(800);
await page.getByTestId("offline-toggle").click();
await pause(800);
await page.getByTestId("transcript").pressSequentially("Inspector pushed us, MEP inspection is a day behind.", { delay: 25 });
await page.getByTestId("process-button").click();
await pause(2200);
await page.getByTestId("offline-toggle").click();
await page.locator("#review").waitFor();
await pause(2500);
await page.getByTestId("apply-review").click();
await page.getByTestId("bar-inspection").scrollIntoViewIfNeeded();
await pause(3000);

const video = page.video();
await ctx.close();
await browser.close();
renameSync(await video.path(), "docs/demo.webm");
console.log("wrote docs/demo.webm");
