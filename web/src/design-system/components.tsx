import { X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};
export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`button button-${variant} button-${size} ${className}`}
      {...props}
    />
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}

export function Avatar({
  name,
  size = 'md',
  tone = 'neutral',
  className = '',
}: {
  name: string;
  size?: 'sm' | 'md';
  tone?: 'neutral' | 'account';
  className?: string;
}) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || '?';
  return (
    <span aria-hidden="true" className={`avatar avatar-${size} avatar-${tone} ${className}`}>
      {initials}
    </span>
  );
}

export function Badge({ children, className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`badge ${className}`} {...props}>
      {children}
    </span>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="form-label">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function NavItem({
  label,
  icon,
  count,
  active,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: ReactNode;
  count?: number;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`nav-item ${active ? 'active' : ''} ${className}`}
      {...props}
    >
      {icon}
      <span className="nav-label">{label}</span>
      {!!count && <strong>{count}</strong>}
    </button>
  );
}

export function PageHeading({
  title,
  description,
  aside,
  className = '',
}: {
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`page-heading ${className}`}>
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {aside}
    </div>
  );
}
export function SectionHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="section-heading">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </div>
  );
}
export function Toolbar({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`mail-toolbar ${className}`} {...props}>
      {children}
    </div>
  );
}

export type TabItem<T extends string = string> = {
  id: T;
  label: string;
  icon?: ReactNode;
  description?: string;
};
export function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  label,
  className = '',
  panelId,
}: {
  items: TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  label: string;
  className?: string;
  panelId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className={`tabs ${className}`} ref={ref} role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          className="tab"
          role="tab"
          aria-selected={value === item.id}
          aria-controls={panelId}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onValueChange(item.id)}
          onKeyDown={(event) => {
            let next: number;
            if (event.key === 'ArrowRight') next = (index + 1) % items.length;
            else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = items.length - 1;
            else return;
            event.preventDefault();
            onValueChange(items[next].id);
            ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next].focus();
          }}
        >
          {item.icon}
          <span>
            <strong>{item.label}</strong>
            {item.description && <small>{item.description}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <IconButton label="Close dialog" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
