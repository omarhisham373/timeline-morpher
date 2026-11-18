# Walkthrough video — script (≈80 s)

Record at 1440×900 or larger: `pnpm build && pnpm start`, open http://localhost:3000.
Use a fresh profile, or click **Reset** first. Speak naturally; the bracketed lines are what to do on screen.

---

**0:00–0:08 · Hook**
[App open on the baseline plan]
> "Superintendents don't type. They talk. This turns a messy voice note into an updated schedule, and shows you exactly why every date moved."

**0:08–0:22 · Capture**
[Click **Play sample field note**. Let the waveform and captions run for about 5 s, then click **Skip to end**.]
> "This is a 22-second field note from a foreman. The waveform is drawn live on a canvas from the Web Audio analyser, and the captions stream in. On a phone I'd just hit the mic, or press R."

**0:22–0:40 · Review, not autopilot**
[Click **Process note → schedule**. The review panel opens. Hover the highlighted quotes, change rebar from 2 to 4 days and back, then open the **Validated JSON** tab for a second.]
> "It pulled out two delays and a new dependency, each tied to the exact words that justify it, with a confidence score. Nothing touches the plan until I approve it. If I edit a number, the schedule diff updates live, and the JSON is Zod-validated against the real task list."

**0:40–0:55 · The ripple**
[Back to **Proposed changes** → **Apply**. Watch the bars turn red and the knock-on ripple. Point at the finish marker.]
> "Apply, and it re-runs a real critical-path calculation. Reported delays go red, everything they push turns rust in dependency order, and the finish moves from Dec 28 to Jan 4. Roofing has float, so part of its slip is absorbed."

**0:55–1:05 · Why did this move?**
[Click the **MEP inspection** bar. The inspector shows the cause chain and the quote.]
> "Click any task and it traces the delay back to its source: rebar, the slab, framing, plumbing, and the foreman's own words."

**1:05–1:20 · Offline**
[Toggle **Simulate offline**. Type "MEP inspection is a day behind" and save it, so it shows as Queued. Toggle back online and it syncs on its own and opens for review.]
> "Job sites have bad signal. Every note, audio included, is saved to IndexedDB first. Offline it just queues, and it survives a reload. When the connection comes back it syncs automatically, with backoff if the server is struggling."

**1:20–1:30 · Close**
[Optional: show `pnpm check` passing, or screenshot 11 with the LLM cross-check badges.]
> "No paid keys needed: there's a deterministic parser, and you can plug in any OpenAI-compatible LLM. When an LLM is on, its output is cross-checked against the rules engine, so a hallucinated lag gets flagged instead of applied. 130 unit tests and 10 browser tests. Thanks!"

---

### Likely interview questions, and short answers

- **Why both an LLM and a rule parser?** The rules are instant, free, deterministic and always available offline-adjacent. The LLM covers phrasing the rules miss. Disagreement between the two is the most useful signal you can give a reviewer. A 3B model invented a lag in testing, and the cross-check is what caught it.
- **What happens if two tabs sync at once, or the tab dies mid-request?** Web Locks give single-flight drains. Items stuck in "syncing" are re-queued on start. The Idempotency-Key makes a replayed request safe.
- **How does propagation work?** A CPM forward and backward pass over a working-day calendar. A task's delay extends its effective duration. Impact is the difference against the baseline, and each task records its driving predecessor, which is what the cause chain follows.
