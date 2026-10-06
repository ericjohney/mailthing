import { useState } from 'react';
import { ChevronDown, Plus, ShieldCheck } from 'lucide-react';
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
}: {
  settings: Settings;
  route: Route;
  searching: boolean;
  open: boolean;
  onNavigate: (route: Route) => void;
  onCompose: () => void;
  onSettings: (tab: string) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const labels = userLabels(settings.labels);
  return (
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <Button className="compose-button" aria-label="Compose" title="Compose" onClick={onCompose}>
        <Plus size={17} />
        <span>Compose</span>
      </Button>
      <span className="sidebar-section-name">Mailbox</span>
      <nav aria-label="Mailbox folders">
        {mailboxViews.slice(0, showMore ? mailboxViews.length : 5).map((view) => (
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
        <NavItem
          label={showMore ? 'Less' : 'More'}
          icon={<ChevronDown size={18} className={showMore ? 'rotate' : ''} />}
          className="more-nav"
          onClick={() => setShowMore(!showMore)}
        />
      </nav>
      <div className="sidebar-label-heading">
        <span>Labels</span>
        <IconButton label="Create a label" onClick={() => onSettings('labels')}>
          <Plus size={16} />
        </IconButton>
      </div>
      <nav aria-label="Labels">
        {labels.map((label) => (
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
          <button className="add-label-hint" onClick={() => onSettings('labels')}>
            Create your first label <Plus size={12} />
          </button>
        )}
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
