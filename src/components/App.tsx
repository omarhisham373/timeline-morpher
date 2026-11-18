"use client";

import { AppProvider, useApp } from "@/state/AppProvider";
import { ActivityLog } from "./ActivityLog";
import { CapturePanel } from "./CapturePanel";
import { Header } from "./Header";
import { ImpactPanel } from "./ImpactPanel";
import { OutboxPanel } from "./OutboxPanel";
import { ReviewPanel } from "./ReviewPanel";
import { TimelinePanel } from "./timeline/TimelinePanel";

export function App() {
  return (
    <AppProvider>
      <a href="#capture" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-amber focus:px-3 focus:py-1 focus:text-ink-950">
        Skip to field note
      </a>
      <Header />
      <Main />
    </AppProvider>
  );
}

function Main() {
  const { review } = useApp();
  return (
    <main className="mx-auto grid max-w-[1500px] gap-4 px-4 py-5 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
      <div className="space-y-4 lg:sticky lg:top-[76px] lg:self-start">
        <Intro />
        <CapturePanel />
        <OutboxPanel />
      </div>
      <div className="min-w-0 space-y-4">
        {review && <ReviewPanel />}
        <TimelinePanel />
        <div className="grid gap-4 xl:grid-cols-2">
          <ImpactPanel />
          <ActivityLog />
        </div>
      </div>
    </main>
  );
}

function Intro() {
  return (
    <div className="px-1">
      <h1 className="text-xl font-semibold tracking-tight text-white">
        From field conversation <span className="text-amber">to schedule update.</span>
      </h1>
      <p className="mt-1 text-xs leading-relaxed text-mute">Say what happened on site. The note is transcribed, parsed into delays and dependencies, checked by you, and rippled through the critical path — online or off.</p>
    </div>
  );
}
