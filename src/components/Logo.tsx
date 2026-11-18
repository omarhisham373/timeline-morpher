export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect width="28" height="28" rx="7" fill="#faca38" />
        <path d="M6 19V9l4.5 6L15 9v10M18 13h4M18 17h4M18 9h4" stroke="#121212" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight text-white">Timeline Morpher</p>
        <p className="text-[11px] text-mute">Voice → schedule · for Masaro</p>
      </div>
    </div>
  );
}
