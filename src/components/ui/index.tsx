import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes
} from "react";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}>(function Button({ className, variant = "secondary", size = "md", type = "button", ...props }, ref) {
  return <button ref={ref} type={type} className={cx("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)} {...props} />;
});

export function IconButton({ label, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <Button className={cx("ui-icon-button", className)} variant="ghost" aria-label={label} title={label} {...props} />;
}

export function AppMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={cx("app-mark", compact && "app-mark--compact")}>
      <img src="/icon.svg" alt="" aria-hidden="true" />
      {compact ? null : <span><strong>Outfit</strong><small>私人衣橱</small></span>}
    </span>
  );
}

export function PageIntro({
  title,
  description,
  actions,
  meta,
  className
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("page-intro", className)}>
      <div className="page-intro__copy">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {meta ? <div className="page-intro__meta">{meta}</div> : null}
      </div>
      {actions ? <div className="page-intro__actions">{actions}</div> : null}
    </header>
  );
}

export function Surface({ as: Component = "section", className, ...props }: HTMLAttributes<HTMLElement> & { as?: "section" | "article" | "div" }) {
  return <Component className={cx("ui-surface", className)} {...props} />;
}

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
}) {
  return <span className={cx("ui-badge", `ui-badge--${tone}`, className)} {...props} />;
}

export function Stat({ label, value, detail, className }: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("ui-stat", className)}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return (
    <label className={cx("ui-field", className)} htmlFor={fieldId}>
      <span className="ui-field__label">{label}</span>
      <input id={fieldId} className="ui-input" aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined} aria-invalid={Boolean(error) || undefined} {...props} />
      {hint ? <small id={hintId} className="ui-field__hint">{hint}</small> : null}
      {error ? <small id={errorId} className="ui-field__error">{error}</small> : null}
    </label>
  );
}

export function SelectField({
  label,
  options,
  id,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; options: Array<{ value: string; label: string }> }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <label className={cx("ui-field", className)} htmlFor={fieldId}>
      <span className="ui-field__label">{label}</span>
      <select id={fieldId} className="ui-select" {...props}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function EmptyState({ icon, title, description, action, compact = false }: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx("ui-empty", compact && "ui-empty--compact")}>
      {icon ? <span className="ui-empty__icon">{icon}</span> : null}
      <div><strong>{title}</strong>{description ? <p>{description}</p> : null}</div>
      {action ? <div className="ui-empty__action">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", title, children, className, role }: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  return (
    <div className={cx("ui-notice", `ui-notice--${tone}`, className)} role={role}>
      {title ? <strong>{title}</strong> : null}
      <div className="ui-notice__content">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cx("ui-skeleton", className)} aria-hidden="true" />;
}

export function Dialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  className,
  children
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cx("ui-dialog", className)}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
