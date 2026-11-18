"use client";

import { useEffect } from "react";
import { useApp } from "@/state/AppProvider";
import { Logo } from "./Logo";
import { Button, Kbd, Switch, cx } from "./ui/primitives";

export function Header() {
  const { online, simulatedOffline, setSimulatedOffline, flaky, setFlaky, schedule, dispatch, resetDemo, outbox } = useApp();
  const queued = outbox.filter((i) => i.status === "queued" || i.status === "syncing").length;

  // Global undo / redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      e.preventDefault();
      dispatch({ type: e.shiftKey ? "redo" : "undo" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  return (
    <header className="z-30 border-b md:sticky md:top-0 border-ink-700 bg-ink-900/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Logo />
        <div className="hidden min-w-0 flex-1 md:block">
          <p className="truncate text-xs text-mute">
            Project · <span className="text-white">{schedule.project.name}</span>
          </p>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-4 md:flex-none">
          <div
            role="status"
            data-testid="network-status"
            data-online={online ? "true" : "false"}
            className={cx("flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium", online ? "border-absorb/30 bg-absorb/10 text-emerald-300" : "border-delay/40 bg-delay/10 text-red-300")}
          >
            <span className={cx("h-2 w-2 rounded-full", online ? "bg-absorb" : "bg-delay")} />
            {online ? "Online" : simulatedOffline ? "Offline (simulated)" : "Offline"}
            {queued > 0 && <span className="text-mute">· {queued} queued</span>}
          </div>
          <Switch checked={simulatedOffline} onChange={setSimulatedOffline} label="Simulate offline" description="cache to IndexedDB" testId="offline-toggle" />
          <Switch checked={flaky} onChange={setFlaky} label="Flaky network" description="drop 50% of requests" testId="flaky-toggle" />
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "undo" })} disabled={!schedule.past.length} aria-label="Undo" title="Undo (Ctrl/⌘+Z)" data-testid="undo">
              ↶ Undo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "redo" })} disabled={!schedule.future.length} aria-label="Redo" title="Redo (Ctrl/⌘+Shift+Z)">
              ↷
            </Button>
            <Button size="sm" variant="ghost" onClick={resetDemo} title="Reset the demo schedule">
              Reset
            </Button>
          </div>
          <span className="hidden text-[10px] text-faint xl:inline">
            <Kbd>⌘Z</Kbd> undo
          </span>
        </div>
      </div>
    </header>
  );
}
