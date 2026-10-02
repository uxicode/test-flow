const VARIANT = {
  primary: "bg-emerald-700 hover:bg-emerald-600",
  danger: "bg-rose-800 hover:bg-rose-700",
  sky: "bg-sky-700 hover:bg-sky-600",
  ghost: "border border-slate-500 bg-slate-900 hover:bg-slate-800",
  muted: "bg-slate-700 hover:bg-slate-600",
} as const;

export interface ActionButtonProps {
  label: string;
  variant?: keyof typeof VARIANT;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}

export function ActionButton({
  label,
  variant = "ghost",
  busy = false,
  busyLabel,
  className = "",
  disabled = false,
  onClick,
}: ActionButtonProps) {
  const isDisabled = disabled || busy;
  return (
    <button
      type="button"
      aria-busy={busy}
      disabled={isDisabled}
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm text-white transition duration-100 ${VARIANT[variant]} cursor-pointer hover:brightness-110 active:scale-[0.96] active:brightness-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100 disabled:active:scale-100 ${className}`}
    >
      {busy ? busyLabel ?? "처리 중…" : label}
    </button>
  );
}
