import {
  ButtonHTMLAttributes,
  ChangeEvent,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-line bg-panel shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "ok" | "soft";
}) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent-hover",
    secondary: "border border-line bg-white text-ink hover:bg-soft",
    ghost: "bg-transparent text-ink hover:bg-black/5",
    danger: "bg-accent text-white hover:bg-accent-hover",
    ok: "bg-ok text-white hover:opacity-90",
    soft: "bg-accent-soft text-accent hover:bg-[#f8d8d6]",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Input({
  className = "",
  clearable = false,
  compact = false,
  value,
  disabled,
  onChange,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  clearable?: boolean;
  /** 列表筛选条用：更矮 */
  compact?: boolean;
}) {
  const hasValue = value != null && String(value).length > 0;
  const showClear = Boolean(clearable && hasValue && !disabled && onChange);

  return (
    <div className="relative w-full">
      <input
        className={`w-full rounded-lg border border-line bg-white text-sm outline-none ring-accent/20 focus:border-accent focus:ring-2 ${
          compact ? "px-2.5 py-1.5" : "px-3 py-2"
        } ${showClear ? "pr-8" : ""} ${className}`}
        value={value}
        disabled={disabled}
        onChange={onChange}
        {...props}
      />
      {showClear ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label="清除"
          className="absolute right-1.5 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-lg leading-none text-ink/55 hover:bg-black/5 hover:text-ink"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const event = {
              target: { value: "" },
              currentTarget: { value: "" },
            } as unknown as ChangeEvent<HTMLInputElement>;
            onChange?.(event);
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function Select({
  className = "",
  compact = false,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }) {
  return (
    <select
      className={`w-full rounded-lg border border-line bg-white text-sm outline-none ring-accent/20 focus:border-accent focus:ring-2 ${
        compact ? "px-2.5 py-1.5" : "px-3 py-2"
      } ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-accent/20 focus:border-accent focus:ring-2 ${className}`}
      {...props}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium text-muted">{children}</label>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-stone-100 text-stone-700",
    pending_1: "bg-amber-50 text-amber-800",
    pending_2: "bg-orange-50 text-orange-800",
    pending_final: "bg-sky-50 text-sky-800",
    approved: "bg-emerald-50 text-emerald-800",
    rejected: "bg-rose-50 text-rose-800",
  };
  const label: Record<string, string> = {
    draft: "暂存",
    pending_1: "待一审",
    pending_2: "待二审",
    pending_final: "待终审",
    approved: "终审通过",
    rejected: "已驳回",
  };
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${map[status] || "bg-stone-100"}`}
    >
      {label[status] || status}
    </span>
  );
}

export function PageHeader({
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h1 className="font-display text-xl tracking-wide text-ink">{title}</h1>
        {desc ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted">{desc}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}

/**
 * 列表页紧凑筛选条：字段与按钮同一行，用 placeholder 代替上方 Label，压缩纵向空间。
 */
export function FilterBar({
  children,
  actions,
  className = "",
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`mb-3 px-3 py-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/** 筛选条内字段宽度槽 */
export function FilterField({
  children,
  className = "w-36",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`min-w-0 shrink-0 ${className}`}>{children}</div>;
}

/** 列表表格区域：在自身容器内滚动，表头吸顶 */
export function TableScroll({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`max-h-[min(72vh,calc(100vh-200px))] overflow-auto overscroll-contain [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-soft [&_thead_th]:shadow-[0_1px_0_var(--line)] ${className}`}
    >
      {children}
    </div>
  );
}

export const tableHeadClass = "bg-soft text-left text-muted";
