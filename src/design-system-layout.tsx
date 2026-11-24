import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

export interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
  sidebar: ReactNode;
  children: ReactNode;
}
export const AppShell = forwardRef<HTMLDivElement, AppShellProps>(function AppShell({ sidebar, children, className = "", ...props }, ref) {
  return <div ref={ref} className={`shell${className ? ` ${className}` : ""}`} {...props}>{sidebar}{children}</div>;
});

export interface SidebarItem {
  id: string;
  label: ReactNode;
  icon: ReactNode;
  active?: boolean;
  onSelect: () => void;
}
export interface SidebarProps extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
  logoSrc: string;
  logoAlt: string;
  items: SidebarItem[];
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
  labels: { navigation: string; open: string; close: string };
  footer?: ReactNode;
}
export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar({ logoSrc, logoAlt, items, mobileOpen, onMobileOpenChange, labels, footer, className = "", ...props }, ref) {
  return <aside ref={ref} className={`sidebar${mobileOpen ? " mobile-open" : ""}${className ? ` ${className}` : ""}`} {...props}>
    <div className="brand"><img className="brand-logo" src={logoSrc} alt={logoAlt} /></div>
    <button className="mobile-nav-toggle" type="button" aria-label={mobileOpen ? labels.close : labels.open} aria-expanded={mobileOpen} aria-controls="primary-navigation" onClick={() => onMobileOpenChange(!mobileOpen)}>
      {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
    </button>
    <nav id="primary-navigation" aria-label={labels.navigation}>{items.map((item) => <button key={item.id} type="button" className={`nav-item${item.active ? " active" : ""}`} aria-current={item.active ? "page" : undefined} title={typeof item.label === "string" ? item.label : undefined} onClick={item.onSelect}>{item.icon}{item.label}</button>)}</nav>
    {footer && <div className="sidebar-bottom">{footer}</div>}
  </aside>;
});

export interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  as?: "div" | "section";
}
export const PageContainer = forwardRef<HTMLDivElement, PageContainerProps>(function PageContainer({ as: Element = "div", className = "", ...props }, ref) {
  return <Element ref={ref} className={`ds-page-container${className ? ` ${className}` : ""}`} {...props} />;
});

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}
export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader({ title, description, actions, className = "", ...props }, ref) {
  return <header ref={ref} className={`ds-page-header${className ? ` ${className}` : ""}`} {...props}><div className="ds-page-heading"><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="ds-page-actions">{actions}</div>}</header>;
});

export interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}
export const SectionHeader = forwardRef<HTMLElement, SectionHeaderProps>(function SectionHeader({ title, description, actions, className = "", ...props }, ref) {
  return <header ref={ref} className={`ds-section-header${className ? ` ${className}` : ""}`} {...props}><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{actions && <div className="ds-section-actions">{actions}</div>}</header>;
});

