import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Pencil, Plus, ShieldCheck, Tag, X } from 'lucide-react';
import { Avatar, Button, IconButton, NavItem } from '../design-system';
import type { Route, Settings } from '../types';
import { mailboxViews, userLabels } from './navigation';

export function MailboxSidebar({
  settings,
  route,
  searching,
  open,
  onNavigate,
  onCompose,
  onSettings,
  onManageLabels,
  onCreateLabel,
  onClose,
  mobile = false,
}: {
  settings: Settings;
  route: Route;
  searching: boolean;
  open: boolean;
  onNavigate: (route: Route) => void;
  onCompose: () => void;
  onSettings: (tab: string) => void;
  onManageLabels: () => void;
  onCreateLabel: () => void;
  onClose: () => void;
  mobile?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [showMore, setShowMore] = useState(false);
  const labels = userLabels(settings.labels);
  useEffect(() => {
    if (mailboxViews.slice(3).some((view) => view.id === route.label)) setShowMore(true);
  }, [route.label]);
  useEffect(() => {
    if (!open || !mobile) return;
    const previous = document.activeElement;
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
      ).filter((button) => button.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [open, mobile, onClose]);
  return (
    <aside ref={ref} className={`sidebar ${open ? 'sidebar-open' : ''}`} aria-label="Mailboxes">
      <div className="sidebar-mobile-heading">
        <strong>Mailboxes</strong>
        <IconButton label="Close mailboxes" onClick={onClose}>
          <X size={20} />
        </IconButton>
      </div>
      <Button className="compose-button" aria-label="Compose" title="Compose" onClick={onCompose}>
        <Plus size={17} />
        <span>Compose</span>
      </Button>
      <span className="sidebar-section-name">Mailbox</span>
      <nav aria-label="Mailbox folders">
        {mailboxViews.slice(0, 3).map((view) => (
          <NavItem
            key={view.id}
            label={view.name}
            icon={<view.icon size={18} />}
            active={route.label === view.id && !searching}
            count={
              view.id === 'INBOX' || view.id === 'SPAM'
                ? settings.counts[view.id]?.unread
                : view.id === 'DRAFTS'
                  ? settings.counts.DRAFTS?.total
                  : undefined
            }
            onClick={() => onNavigate({ label: view.id })}
          />
        ))}
      </nav>
      <div className="sidebar-label-heading">
        <span>Labels</span>
        <Button
          variant="ghost"
          size="sm"
          className="manage-labels"
          onClick={onManageLabels}
          title="Manage labels"
          aria-label="Manage labels"
        >
          <Pencil size={14} />
          <span>Manage</span>
        </Button>
      </div>
      <nav aria-label="Labels">
        {labels
          .filter((label) => label.pinned !== false)
          .map((label) => (
            <NavItem
              key={label.id}
              label={label.name}
              title={label.name}
              icon={<span className="label-dot" style={{ background: label.color }} />}
              active={route.label === label.id && !searching}
              count={settings.counts[label.id]?.unread}
              onClick={() => onNavigate({ label: label.id })}
            />
          ))}
        {!labels.length && (
          <p className="add-label-hint">
            Create labels for projects, receipts, and anything you want to find later.
          </p>
        )}
        {labels.length > 0 && !labels.some((label) => label.pinned !== false) && (
          <p className="add-label-hint">Pin labels to keep them here.</p>
        )}
        <NavItem label="New label" icon={<Plus size={18} />} onClick={onCreateLabel} />
        {labels.length > 0 && (
          <NavItem
            label="All labels"
            count={labels.length}
            icon={<Tag size={18} />}
            onClick={onManageLabels}
          />
        )}
      </nav>
      <nav aria-label="More mailbox folders" className="more-mailboxes">
        <NavItem
          label="More mailboxes"
          icon={<ChevronDown size={18} className={showMore ? 'rotate' : ''} />}
          className="more-nav"
          aria-expanded={showMore}
          onClick={() => setShowMore(!showMore)}
        />
        {showMore &&
          mailboxViews
            .slice(3)
            .map((view) => (
              <NavItem
                key={view.id}
                label={view.name}
                icon={<view.icon size={18} />}
                active={route.label === view.id && !searching}
                count={
                  view.id === 'DRAFTS'
                    ? settings.counts.DRAFTS?.total
                    : settings.counts[view.id]?.unread
                }
                onClick={() => onNavigate({ label: view.id })}
              />
            ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="private-note">
          <ShieldCheck size={17} />
          <div>
            <strong>Yours, by design.</strong>
            <p>Your server. Your inbox.</p>
          </div>
        </div>
        <button
          className="sidebar-account"
          aria-label={`${settings.account.name} account settings`}
          title={settings.account.email}
          onClick={() => onSettings('general')}
        >
          <Avatar name={settings.account.name} size="sm" />
          <div>
            <strong>{settings.account.name}</strong>
            <span>{settings.account.email}</span>
          </div>
          <ChevronDown size={14} />
        </button>
      </div>
    </aside>
  );
}
