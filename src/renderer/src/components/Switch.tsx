/** Instrument-style toggle switch: clear state, real hit area. */
export function Switch({ on, onChange, title, disabled }: { on: boolean; onChange: (next: boolean) => void; title?: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      title={title}
      onClick={() => !disabled && onChange(!on)}
      className="relative h-5 w-9 shrink-0 border transition-colors"
      style={{
        borderColor: on ? 'var(--hal-amber)' : 'var(--hal-hairline)',
        background: on ? 'var(--hal-amber-dim)' : 'var(--hal-plate-2)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1
      }}
    >
      <span
        className="absolute top-[2px] h-[14px] w-[14px] transition-all"
        style={{
          left: on ? '20px' : '3px',
          background: on ? 'var(--hal-amber)' : 'var(--hal-dim)',
          boxShadow: on ? '0 0 6px 0 var(--hal-amber-dim)' : 'none'
        }}
      />
    </button>
  )
}
