"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChartIcon, ChevronLeft, ChevronRight, DumbbellIcon, HistoryIcon, ListIcon, MinusIcon, PlusIcon } from "./icons";

// ------------------------------------------------------------------ navigation bar

type NavBarProps = {
  title: string;
  /** Show the big title under the bar; the bar title appears once it scrolls away. */
  large?: boolean;
  subtitle?: React.ReactNode;
  back?: { label: string; href: string };
  left?: React.ReactNode;
  right?: React.ReactNode;
};

export function NavBar({ title, large = true, subtitle, back, left, right }: NavBarProps) {
  const router = useRouter();
  const titleRef = useRef<HTMLDivElement>(null);
  const [solid, setSolid] = useState(!large);

  useEffect(() => {
    if (!large) {
      const onScroll = () => setSolid(window.scrollY > 2);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }
    const el = titleRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setSolid(!entry.isIntersecting), { rootMargin: "-44px 0px 0px 0px", threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [large]);

  return (
    <>
      <header className="navbar" data-solid={solid} data-large={large}>
        <div className="navbar-inner">
          <div className="navbar-side">
            {back ? (
              <button type="button" className="bar-btn !pl-1" onClick={() => router.push(back.href)}>
                <ChevronLeft />
                <span className="truncate max-w-[28vw]">{back.label}</span>
              </button>
            ) : (
              left
            )}
          </div>
          <div className="navbar-title" aria-hidden={large}>
            {title}
          </div>
          <div className="navbar-side navbar-side--end">{right}</div>
        </div>
      </header>
      {large && (
        <div ref={titleRef} className="large-title">
          <h1 className="t-large m-0">{title}</h1>
          {subtitle && <div className="large-title-sub t-subhead c-2">{subtitle}</div>}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ tab bar

const TABS = [
  { href: "/", label: "Workout", icon: DumbbellIcon },
  { href: "/history", label: "History", icon: HistoryIcon },
  { href: "/progress", label: "Progress", icon: ChartIcon },
  { href: "/program", label: "Program", icon: ListIcon },
];

const strip = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

export function TabBar() {
  const pathname = strip(usePathname() || "/");
  if (pathname.startsWith("/workout")) return null;
  return (
    <nav className="tabbar" aria-label="Tabs">
      <ul>
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} className="tab" aria-current={active ? "page" : undefined}>
                <Icon size={26} strokeWidth={active ? 2 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ------------------------------------------------------------------ grouped lists

export function Section({
  title,
  label,
  action,
  footer,
  children,
  className = "",
}: {
  /** Big section title above the card (Health-app style). */
  title?: string;
  /** Small grey label above the card (Settings style). */
  label?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`section ${className}`}>
      {title && (
        <div className="section-head">
          <h2 className="t-title3">{title}</h2>
          {action}
        </div>
      )}
      {label && <div className="section-label">{label}</div>}
      <div className="group">{children}</div>
      {footer && <div className="section-foot">{footer}</div>}
    </section>
  );
}

type RowProps = {
  title: React.ReactNode;
  sub?: React.ReactNode;
  detail?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  chevron?: boolean;
  tone?: "action" | "danger";
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
};

export function Row({ title, sub, detail, leading, trailing, chevron, tone, href, onClick, disabled, className = "" }: RowProps) {
  const body = (
    <>
      {leading}
      <span className="row-main">
        <span className={`row-title ${tone === "action" ? "row-action" : tone === "danger" ? "row-danger" : ""}`}>{title}</span>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
      {detail !== undefined && <span className="row-detail">{detail}</span>}
      {trailing}
      {chevron && <ChevronRight className="chev" />}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`row ${className}`}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={`row ${className}`} onClick={onClick} disabled={disabled}>
        {body}
      </button>
    );
  }
  return <div className={`row ${className}`}>{body}</div>;
}

// ------------------------------------------------------------------ controls

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <MinusIcon size={18} />
      </button>
      <span aria-hidden />
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <PlusIcon size={18} />
      </button>
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

// ------------------------------------------------------------------ sheets

function useBodyLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

function useEscape(open: boolean, onClose: () => void) {
  const ref = useRef(onClose);
  useEffect(() => {
    ref.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && ref.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

/** iOS page sheet: Cancel on the left, title, and a confirm button on the right. */
export function Sheet({
  open,
  title,
  onClose,
  cancelLabel = "Cancel",
  done,
  tall,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  cancelLabel?: string | null;
  done?: { label: string; onClick: () => void; disabled?: boolean };
  tall?: boolean;
  children: React.ReactNode;
}) {
  useBodyLock(open);
  useEscape(open, onClose);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet ${tall ? "sheet--tall" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <div className="navbar-side">
            {cancelLabel && (
              <button type="button" className="bar-btn" onClick={onClose}>
                {cancelLabel}
              </button>
            )}
          </div>
          <div className="navbar-title">{title}</div>
          <div className="navbar-side navbar-side--end">
            {done && (
              <button type="button" className="bar-btn bar-btn--bold" onClick={done.onClick} disabled={done.disabled}>
                {done.label}
              </button>
            )}
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>,
    document.body,
  );
}

export type Action = { label: string; onClick: () => void; danger?: boolean };

/** iOS action sheet: a list of choices with Cancel underneath. */
export function ActionSheet({ open, message, actions, onClose }: { open: boolean; message?: string; actions: Action[]; onClose: () => void }) {
  useBodyLock(open);
  useEscape(open, onClose);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="action-sheet" role="dialog" aria-modal="true" aria-label={message ?? "Options"}>
        <div className="action-group">
          {message && <div className="action-msg">{message}</div>}
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`action-btn ${a.danger ? "action-btn--danger" : ""}`}
              onClick={() => {
                onClose();
                a.onClick();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="action-group">
          <button type="button" className="action-btn action-btn--cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// ------------------------------------------------------------------ helpers

/** Parse a typed number ("82,5" works too). undefined = empty, NaN = not a number. */
export function parseNum(text: string): number | undefined {
  const t = text.trim().replace(",", ".");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
