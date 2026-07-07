import type { ReactNode } from "react";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function CommandBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("command-bar", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  children,
  variant = "default",
  className
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  variant?: "default" | "hero";
  className?: string;
}) {
  return (
    <header className={cx("page-header", variant === "hero" && "page-header-hero", className)}>
      <div className="page-header-copy">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="page-header-aside">{children}</div> : null}
    </header>
  );
}

export function StatTile({
  label,
  value,
  detail,
  className
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("stat-tile", className)}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function ActionCluster({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("action-cluster actions", className)}>{children}</div>;
}

export function StatusPill({
  children,
  tone = "neutral",
  className
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger" | "info";
  className?: string;
}) {
  return <span className={cx("status-pill", `status-pill-${tone}`, className)}>{children}</span>;
}

export function WorkbenchPanel({
  children,
  level = "default",
  className
}: {
  children: ReactNode;
  level?: "default" | "quiet" | "strong";
  className?: string;
}) {
  return <div className={cx("panel workbench-panel", `workbench-panel-${level}`, className)}>{children}</div>;
}

export function SurfaceSection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("surface-section", className)}>{children}</section>;
}

export function SummaryStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("summary-strip", className)}>{children}</div>;
}

export function SettingsSection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("settings-section", className)}>{children}</section>;
}
