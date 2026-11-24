import { cloneElement, forwardRef, isValidElement, useEffect, useId, useRef, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactEventHandler, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, CircleHelp, Info, LoaderCircle, X } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "quiet" | "danger";
export type ControlSize = "default" | "compact";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "default", loading = false, disabled, leadingIcon, trailingIcon, className = "", children, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={`ds-button ds-button--${variant} ds-button--${size}${className ? ` ${className}` : ""}`} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
    {loading ? <LoaderCircle className="ds-spinner" size={15} aria-hidden="true" /> : leadingIcon}
    <span>{children}</span>
    {!loading && trailingIcon}
  </button>;
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  "aria-label": string;
  variant?: "default" | "quiet" | "danger";
  size?: "default" | "compact";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "default", size = "default", className = "", type = "button", children, ...props }, ref,
) {
  return <button ref={ref} type={type} className={`ds-icon-button ds-icon-button--${variant} ds-icon-button--${size}${className ? ` ${className}` : ""}`} {...props}>{children}</button>;
});

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "compact" | "default" | "spacious";
  as?: "div" | "section" | "article";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = "default", as: Element = "div", className = "", ...props }, ref,
) {
  return <Element ref={ref} className={`ds-card ds-card--${padding}${className ? ` ${className}` : ""}`} {...props} />;
});
export const Surface = Card;

export interface MetricCardProps extends HTMLAttributes<HTMLElement> {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
}
export const MetricCard = forwardRef<HTMLElement, MetricCardProps>(function MetricCard({ label, value, icon, description, className = "", ...props }, ref) {
  return <article ref={ref} className={`ds-metric-card${className ? ` ${className}` : ""}`} {...props}><div className="ds-metric-label">{label}</div>{icon && <span className="ds-metric-icon" aria-hidden="true">{icon}</span>}<strong className="ds-metric-value">{value}</strong>{description && <span className="ds-metric-description">{description}</span>}</article>;
});

export interface MetricGridProps extends HTMLAttributes<HTMLDivElement> {
  columns?: 2 | 3 | 4;
}
export const MetricGrid = forwardRef<HTMLDivElement, MetricGridProps>(function MetricGrid({ columns = 4, className = "", style, ...props }, ref) {
  return <div ref={ref} className={`ds-metric-grid ds-metric-grid--${columns}${className ? ` ${className}` : ""}`} style={{ "--ds-metric-columns": columns, ...style } as CSSProperties} {...props} />;
});

export interface TableShellProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  minWidth?: number | string;
}
export const TableShell = forwardRef<HTMLDivElement, TableShellProps>(function TableShell({ label, minWidth, children, className = "", style, ...props }, ref) {
  return <div ref={ref} className={`ds-table-shell${className ? ` ${className}` : ""}`} style={{ "--ds-table-min-width": typeof minWidth === "number" ? `${minWidth}px` : minWidth, ...style } as CSSProperties} {...props}><div className="ds-table-scroll" role="region" aria-label={label} tabIndex={0}>{children}</div></div>;
});

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
}
export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar({ search, filters, actions, children, className = "", ...props }, ref) {
  return <div ref={ref} className={`ds-toolbar${className ? ` ${className}` : ""}`} {...props}>{search && <div className="ds-toolbar-search">{search}</div>}{filters && <div className="ds-toolbar-filters">{filters}</div>}{actions && <div className="ds-toolbar-actions">{actions}</div>}{children}</div>;
});
export interface FilterBarProps extends ToolbarProps {
  activeFilters?: ReactNode;
}
export const FilterBar = forwardRef<HTMLDivElement, FilterBarProps>(function FilterBar({ activeFilters, className = "", ...props }, ref) {
  return <div className={`ds-filter-bar${className ? ` ${className}` : ""}`}><Toolbar ref={ref} {...props} />{activeFilters && <div className="ds-filter-active">{activeFilters}</div>}</div>;
});

export interface DialogProps extends Omit<HTMLAttributes<HTMLDialogElement>, "title" | "open" | "onCancel"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dialogTitle: ReactNode;
  closeLabel: string;
  description?: ReactNode;
  footer?: ReactNode;
  size?: "small" | "default" | "large";
  onCancel?: ReactEventHandler<HTMLDialogElement>;
}
export const Dialog = forwardRef<HTMLDialogElement, DialogProps>(function Dialog({ open, onOpenChange, dialogTitle, closeLabel, description, footer, size = "default", children, className = "", onCancel, onMouseDown, ...props }, forwardedRef) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[autofocus],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex='0']")?.focus();
    } else if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); if (open) previous?.focus(); };
  }, [open]);
  const setRef = (element: HTMLDialogElement | null) => {
    dialogRef.current = element;
    if (typeof forwardedRef === "function") forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  };
  const handleCancel = (event: SyntheticEvent<HTMLDialogElement, Event>) => { onCancel?.(event as never); if (!event.defaultPrevented) { event.preventDefault(); onOpenChange(false); } };
  const handleMouseDown = (event: MouseEvent<HTMLDialogElement>) => { onMouseDown?.(event); if (event.target === event.currentTarget) onOpenChange(false); };
  return createPortal(<dialog ref={setRef} className={`ds-dialog ds-dialog--${size}${className ? ` ${className}` : ""}`} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onCancel={handleCancel} onMouseDown={handleMouseDown} {...props}>
    <header className="ds-dialog-header"><div><h2 id={titleId}>{dialogTitle}</h2>{description && <p id={descriptionId}>{description}</p>}</div><IconButton variant="quiet" aria-label={closeLabel} onClick={() => onOpenChange(false)}><X size={17} /></IconButton></header>
    <div className="ds-dialog-body">{children}</div>{footer && <footer className="ds-dialog-footer">{footer}</footer>}
  </dialog>, document.body);
});

export interface TabItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}
export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  items: TabItem[];
  activeId: string;
  idPrefix: string;
  onChange: (id: string) => void;
  label: string;
}
export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs({ items, activeId, idPrefix, onChange, label, className = "", onKeyDown, ...props }, ref) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = items.filter((item) => !item.disabled);
    const current = enabled.findIndex((item) => item.id === activeId);
    const next = event.key === "Home" ? enabled[0] : event.key === "End" ? enabled.at(-1) : enabled[(current + (event.key === "ArrowRight" ? 1 : -1) + enabled.length) % enabled.length];
    if (next) { onChange(next.id); requestAnimationFrame(() => document.getElementById(`ds-tab-${idPrefix}-${next.id}`)?.focus()); }
  };
  return <div ref={ref} className={`ds-tabs${className ? ` ${className}` : ""}`} role="tablist" aria-label={label} onKeyDown={handleKeyDown} {...props}>{items.map((item) => <button key={item.id} id={`ds-tab-${idPrefix}-${item.id}`} type="button" role="tab" aria-selected={activeId === item.id} aria-controls={`ds-panel-${idPrefix}-${item.id}`} tabIndex={activeId === item.id ? 0 : -1} disabled={item.disabled} onClick={() => onChange(item.id)}>{item.icon}{item.label}</button>)}</div>;
});

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  controlSize?: ControlSize;
  leadingIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { controlSize = "default", leadingIcon, className = "", ...props }, ref,
) {
  const input = <input ref={ref} className={`ds-input ds-input--${controlSize}${leadingIcon ? " ds-input--with-icon" : ""}${className ? ` ${className}` : ""}`} {...props} />;
  return leadingIcon ? <span className="ds-input-wrap"><span className="ds-input-icon" aria-hidden="true">{leadingIcon}</span>{input}</span> : input;
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  controlSize?: ControlSize;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { controlSize = "default", className = "", children, ...props }, ref,
) {
  return <span className="ds-select-wrap"><select ref={ref} className={`ds-select ds-select--${controlSize}${className ? ` ${className}` : ""}`} {...props}>{children}</select><ChevronDown size={15} aria-hidden="true" /></span>;
});

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  control: ReactNode;
}

export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field({ label, htmlFor, hint, error, required = false, control, className = "", ...props }, ref) {
  const messageId = useId();
  const message = error ?? hint;
  const controlElement = isValidElement(control)
    ? cloneElement(control as ReactElement<Record<string, unknown>>, {
      id: htmlFor,
      "aria-describedby": [
        (control.props as Record<string, unknown>)["aria-describedby"],
        message ? messageId : undefined,
      ].filter(Boolean).join(" ") || undefined,
      "aria-invalid": error ? true : (control.props as Record<string, unknown>)["aria-invalid"],
      "aria-required": required || (control.props as Record<string, unknown>)["aria-required"],
    })
    : control;
  return <div ref={ref} className={`ds-field${error ? " ds-field--error" : ""}${className ? ` ${className}` : ""}`} {...props}>
    <label className="ds-field-label" htmlFor={htmlFor}>{label}{required && <span className="ds-required" aria-hidden="true"> *</span>}</label>
    {controlElement}
    {message && <span id={messageId} className={`ds-field-message${error ? " ds-field-message--error" : ""}`}>
      {error ? <CircleHelp size={13} aria-hidden="true" /> : <Info size={13} aria-hidden="true" />}{message}
    </span>}
  </div>;
});

export type BadgeTone = "brand" | "success" | "warning" | "danger" | "info" | "neutral";
export const Badge = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }>(function Badge({ tone = "neutral", children, className = "", ...props }, ref) {
  return <span ref={ref} className={`ds-badge ds-badge--${tone}${className ? ` ${className}` : ""}`} {...props}>{children}</span>;
});

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ className = "", ...props }, ref) {
  return <input ref={ref} type="checkbox" className={`ds-checkbox${className ? ` ${className}` : ""}`} {...props} />;
});

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
}
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch({ label, description, id, className = "", ...props }, ref) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = description ? `${controlId}-description` : undefined;
  return <label className={`ds-switch${className ? ` ${className}` : ""}`} htmlFor={controlId}>
    <input ref={ref} id={controlId} type="checkbox" role="switch" className="ds-switch-input" aria-describedby={descriptionId} {...props} />
    <span className="ds-switch-copy"><span className="ds-switch-label">{label}</span>{description && <span id={descriptionId} className="ds-switch-description">{description}</span>}</span>
    <span className="ds-switch-track" aria-hidden="true"><span /></span>
  </label>;
});

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState({ title, description, icon, action, className = "", ...props }, ref) {
  const titleId = useId();
  return <div ref={ref} className={`ds-empty-state${className ? ` ${className}` : ""}`} role="status" aria-labelledby={titleId} {...props}>
    {icon && <span className="ds-empty-state-icon" aria-hidden="true">{icon}</span>}
    <h3 id={titleId}>{title}</h3>{description && <p>{description}</p>}{action}
  </div>;
});

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "text" | "rect" | "circle";
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
}
export const Skeleton = forwardRef<HTMLSpanElement, SkeletonProps>(function Skeleton({ variant = "text", width, height, className = "", style, ...props }, ref) {
  return <span ref={ref} aria-hidden="true" className={`ds-skeleton ds-skeleton--${variant}${className ? ` ${className}` : ""}`} style={{ ...style, width, height }} {...props} />;
});
