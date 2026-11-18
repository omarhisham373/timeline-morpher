"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ title, eyebrow, actions, children, className, id }: { title?: ReactNode; eyebrow?: string; actions?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} aria-labelledby={id && title ? `${id}-title` : undefined} className={cx("rounded-2xl border border-ink-600 bg-ink-850/90 shadow-[0_1px_0_rgb(255_255_255/0.04)_inset] backdrop-blur", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-3">
          <div>
            {eyebrow && <p className="text-[10px] font-semibold tracking-[0.18em] text-amber uppercase">{eyebrow}</p>}
            {title && (
              <h2 id={id ? `${id}-title` : undefined} className="text-sm font-semibold text-white">
                {title}
              </h2>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

type Variant = "primary" | "ghost" | "danger" | "outline";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-amber text-ink-950 hover:bg-[#ffd75e] disabled:bg-ink-600 disabled:text-faint",
  ghost: "text-mute hover:text-white hover:bg-ink-700 disabled:text-ink-500",
  danger: "bg-delay text-white hover:bg-red-400",
  outline: "border border-ink-500 text-white hover:border-amber hover:text-amber disabled:border-ink-600 disabled:text-faint",
};

export function Button({ variant = "outline", size = "md", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "focus-ring inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-4 text-sm",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

export function Switch({ checked, onChange, label, description, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-mute select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className={cx("focus-ring relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-amber" : "bg-ink-500")}
      >
        <span className={cx("absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", checked && "translate-x-4 bg-ink-950")} />
      </button>
      <span>
        <span className="text-white">{label}</span>
        {description && <span className="block text-[10px] text-faint">{description}</span>}
      </span>
    </label>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "amber" | "red" | "orange" | "green" | "blue"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-ink-700 text-mute border-ink-600",
    amber: "bg-amber/10 text-amber border-amber/30",
    red: "bg-delay/10 text-red-300 border-delay/40",
    orange: "bg-ripple/10 text-orange-300 border-ripple/40",
    green: "bg-absorb/10 text-emerald-300 border-absorb/30",
    blue: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  } as const;
  return <span className={cx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.75 ? "bg-absorb" : value >= 0.5 ? "bg-amber" : "bg-delay";
  const label = value >= 0.75 ? "High" : value >= 0.5 ? "Medium" : "Low";
  return (
    <div className="flex items-center gap-1.5" title={`${label} confidence (${pct}%)`}>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-600" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${label} confidence`}>
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-[11px] text-mute tabular-nums">{pct}%</span>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-ink-500 bg-ink-700 px-1 py-px font-mono text-[10px] text-mute">{children}</kbd>;
}
