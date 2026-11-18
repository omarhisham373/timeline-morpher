import { expect, test } from "@playwright/test";
import recorded from "./recorded/llm-parse-riverside.json";
import { SHOTS, openFresh } from "./fixtures";

/**
 * Replays a real response recorded from a local Qwen2.5-3B (Ollama) run — see
 * scripts/record-llm-fixture.ts — so the trust layer is tested without a model.
 * The small model got the rebar delay right, invented a 3-day lag and missed
 * the electrical delay; the reviewer must see all three situations.
 */
test("LLM output is cross-checked: agreement, disagreement and missed items are surfaced", async ({ page }) => {
  await page.route("**/api/parse", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(recorded) }));
  await openFresh(page);
  await page.getByTestId("sample-button").click();
  await page.getByTestId("skip-sample").click();
  await page.getByTestId("process-button").click();

  const rows = page.getByTestId("review-item");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).getByTestId("check-badge")).toHaveText(/engines agree/);
  await expect(rows.nth(1).getByTestId("check-badge")).toHaveText(/engines differ/);
  await expect(rows.nth(2).getByTestId("check-badge")).toHaveText(/Rule engine only/);
  // The missed item is offered, not silently applied.
  await expect(rows.nth(2).getByRole("checkbox")).not.toBeChecked();
  await expect(page.getByTestId("impact-finish")).toContainText("+7 days");
  await page.screenshot({ path: `${SHOTS}/11-llm-cross-check.png`, fullPage: true });

  // One click takes the rule engine's reading of the disputed lag…
  await rows.nth(1).getByRole("button", { name: "Use 0" }).click();
  await expect(rows.nth(1).getByTestId("check-badge")).toHaveText(/engines agree/);
  // …and ticking the suggestion brings the plan back to what the foreman said.
  await rows.nth(2).getByRole("checkbox").check();
  await expect(page.getByTestId("impact-finish")).toContainText("+5 days");
  await page.getByTestId("apply-review").click();
  await expect(page.getByTestId("bar-electrical")).toHaveAttribute("data-status", "delayed");
  await expect(page.getByTestId("kpi-finish")).toContainText("+5 days");
});
