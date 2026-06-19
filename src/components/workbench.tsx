import type { ReactNode } from "react";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function CommandBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("command-bar", className)}>{children}</div>;
}

export function WorkbenchPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("panel workbench-panel", className)}>{children}</div>;
}

export function SettingsSection({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("settings-section", className)}>{children}</section>;
}
