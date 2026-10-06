import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  Archive,
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Ellipsis,
  Filter,
  FolderInput,
  Inbox,
  LoaderCircle,
  Mail,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { api, messageDate, mutate } from './api';
import { Compose } from './Compose';
import { Conversation } from './Conversation';
import { Settings } from './Settings';
import {
  emptyDraft,
  type Conversation as ConversationData,
  type Draft,
  type Route,
  type Settings as SettingsData,
  type Thread,
} from './types';
import {
  Avatar,
  Button,
  Field,
  IconButton,
  Modal,
  PageHeading,
  Tabs,
  Toolbar,
  useMediaQuery,
} from './design-system';
import { MailboxSidebar } from './mailbox/MailboxSidebar';
import { ThreadRow } from './mailbox/ThreadRow';
import { categories, mailboxViews, userLabels } from './mailbox/navigation';

function getRoute(): Route {
  const params = new URLSearchParams(location.hash.slice(1));
  return {
    label: params.get('label') || 'INBOX',
    thread: params.get('thread') || undefined,
  };
}

export function App() {
  const [settings, setSettings] = useState<SettingsData>();
  const [route, setRoute] = useState(getRoute);
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('CATEGORY_PERSONAL');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [conversation, setConversation] = useState<ConversationData>();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [compose, setCompose] = useState<Draft>();
  const [settingsTab, setSettingsTab] = useState<string>();
  const [help, setHelp] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(false);
  const mobile = useMediaQuery('(max-width: 650px)');
  const [dropdown, setDropdown] = useState<string>();
  const [advanced, setAdvanced] = useState(false);
  const [searchFields, setSearchFields] = useState({
    from: '',
    to: '',
    subject: '',
    attachment: false,
    unread: false,
  });
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string[]>();
  const [connected, setConnected] = useState(true);
  const searchInput = useRef<HTMLInputElement>(null);
  const refresh = useCallback(() => setTick((old) => old + 1), []);
  useEffect(() => setSidebar(false), [mobile]);
  const report = useCallback((message: string) => setToast(message), []);
  const navigate = useCallback((next: Route) => {
    const params = new URLSearchParams({ label: next.label });
    if (next.thread) params.set('thread', next.thread);
    location.hash = params.toString();
    setRoute(next);
    setSelected(new Set());
    setSidebar(false);
    setDropdown(undefined);
    setPage(1);
  }, []);

  useEffect(() => {
    const hash = () => {
      setRoute(getRoute());
      setSelected(new Set());
      setPage(1);
    };
    window.addEventListener('hashchange', hash);
    return () => {
      window.removeEventListener('hashchange', hash);
    };
  }, []);
  useEffect(() => {
    if (query.trim() === searchQuery) return;
    const timer = setTimeout(() => {
      setSearchQuery(query.trim());
      setPage(1);
      setSelected(new Set());
    }, 250);
    return () => clearTimeout(timer);
  }, [query, searchQuery]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    api<SettingsData>('/settings')
      .then(setSettings)
      .catch((error) => report(error.message));
  }, [tick, report]);
  useEffect(() => {
    const events = new EventSource('/api/events');
    events.addEventListener('mailbox', refresh);
    events.onopen = () => {
      setConnected(true);
      refresh();
    };
    events.onerror = () => setConnected(false);
    const timer = setInterval(refresh, 60000); // Wake snoozed conversations even without new mail.
    return () => {
      events.close();
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (route.thread) return;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    if (route.label === 'DRAFTS' && !searchQuery) {
      api<Draft[]>('/drafts')
        .then((data) => {
          if (!cancelled) {
            setDrafts(data);
            setTotal(data.length);
          }
        })
        .catch((error) => {
          if (!cancelled) setLoadError(error.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      const params = new URLSearchParams({
        label: route.label === 'DRAFTS' ? 'ALL' : route.label,
        page: String(page),
      });
      if (route.label === 'INBOX' && !searchQuery) params.set('category', category);
      if (searchQuery) params.set('q', searchQuery);
      api<{ threads: Thread[]; total: number }>(`/threads?${params}`)
        .then((data) => {
          if (!cancelled) {
            setThreads(data.threads);
            setTotal(data.total);
            if (page > 1 && data.threads.length === 0)
              setPage(Math.max(1, Math.ceil(data.total / 50)));
          }
        })
        .catch((error) => {
          if (!cancelled) setLoadError(error.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [route.label, route.thread, category, searchQuery, page, tick]);
  useEffect(() => {
    if (!route.thread) {
      setConversation(undefined);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    api<ConversationData>(`/threads/${route.thread}`)
      .then((data) => {
        if (cancelled) return;
        setConversation(data);
        if (data.messages.some((message) => message.labels.includes('UNREAD')))
          mutate('/actions', { thread_ids: [route.thread], action: 'read' })
            .then(refresh)
            .catch((error) => report(error.message));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [route.thread, tick, refresh, report]);
  async function doAction(
    name: string,
    ids = route.thread ? [route.thread] : [...selected],
    value = '',
    until?: number,
  ) {
    if (ids.length === 0 || busy) return;
    if (name === 'delete' && !confirmDelete) {
      setConfirmDelete(ids);
      return;
    }
    setBusy(true);
    try {
      await mutate('/actions', { thread_ids: ids, action: name, value, until });
      setSelected(new Set());
      setDropdown(undefined);
      setConfirmDelete(undefined);
      refresh();
      if (
        route.thread &&
        ['archive', 'trash', 'spam', 'snooze', 'unread', 'inbox', 'delete'].includes(name)
      )
        navigate({ label: route.label });
      const descriptions: Record<string, string> = {
        archive: 'Conversation archived',
        trash: 'Moved to Trash',
        spam: 'Moved to Spam',
        read: 'Marked as read',
        unread: 'Marked as unread',
        label: 'Label applied',
        unlabel: 'Label removed',
        snooze: 'Snoozed until tomorrow',
        inbox: 'Moved to Inbox',
        delete: 'Permanently deleted',
        important: 'Marked as important',
        unimportant: 'Importance removed',
      };
      if (descriptions[name]) report(descriptions[name]);
    } catch (error) {
      report((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable],dialog') ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (event.key === '/') {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (compose || settingsTab) return;
      if (event.key === 'c') setCompose(emptyDraft());
      if (event.key === 'e') doAction('archive');
      if (event.key === '#') doAction('trash');
      if (event.key === 'Escape') {
        setDropdown(undefined);
        if (route.thread) navigate({ label: route.label });
      }
      if (event.key === '?') setHelp(true);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  function toggle(id: string) {
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const title = searchQuery
    ? 'Search results'
    : mailboxViews.find((view) => view.id === route.label)?.name ||
      settings?.labels.find((label) => label.id === route.label)?.name ||
      'Label';
  const selectionCount = selected.size;
  const isDrafts = route.label === 'DRAFTS' && !searchQuery;
  const showCategories = route.label === 'INBOX' && !route.thread && !searchQuery;

  if (!settings)
    return (
      <div className="boot-screen">
        <LoaderCircle size={24} className="spin" />
        <span>Loading your mailbox…</span>
        {toast && <p role="alert">{toast}</p>}
        <Button variant="secondary" onClick={refresh}>
          Retry
        </Button>
      </div>
    );

  return (
    <div className={`app-shell ${compactNavigation ? 'navigation-compact' : ''}`}>
      <header className="app-header">
        <div className="header-brand">
          <IconButton
            label="Toggle navigation"
            onClick={() =>
              mobile ? setSidebar(!sidebar) : setCompactNavigation(!compactNavigation)
            }
          >
            <Menu size={21} />
          </IconButton>
          <a
            className="brand"
            aria-label="Mailthing inbox"
            href="#label=INBOX"
            onClick={() => setQuery('')}
          >
            <span>
              mailthing<span className="brand-dot">.</span>
            </span>
            <small>PERSONAL MAIL</small>
          </a>
        </div>
        <div className="search-wrap">
          <form
            className="search-box"
            onSubmit={(event) => {
              event.preventDefault();
              setSearchQuery(query.trim());
              if (route.thread) navigate({ label: route.label });
            }}
          >
            <Search size={21} />
            <input
              ref={searchInput}
              aria-label="Search mail"
              placeholder="Search mail"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (route.thread) navigate({ label: route.label });
              }}
            />
            {query && (
              <IconButton label="Clear search" onClick={() => setQuery('')}>
                <X size={18} />
              </IconButton>
            )}
            <IconButton label="Advanced search" onClick={() => setAdvanced(!advanced)}>
              <SlidersHorizontal size={20} />
            </IconButton>
          </form>
          {advanced && (
            <form
              className="advanced-search"
              onSubmit={(event) => {
                event.preventDefault();
                setQuery(
                  [
                    searchFields.from && `from:"${searchFields.from.replaceAll('"', '')}"`,
                    searchFields.to && `to:"${searchFields.to.replaceAll('"', '')}"`,
                    searchFields.subject && `subject:"${searchFields.subject.replaceAll('"', '')}"`,
                    searchFields.attachment && 'has:attachment',
                    searchFields.unread && 'is:unread',
                  ]
                    .filter(Boolean)
                    .join(' '),
                );
                setAdvanced(false);
              }}
            >
              <h3>Find exactly what you need</h3>
              {(['from', 'to', 'subject'] as const).map((field) => (
                <Field label={field} key={field}>
                  <input
                    value={searchFields[field]}
                    onChange={(event) =>
                      setSearchFields({ ...searchFields, [field]: event.target.value })
                    }
                  />
                </Field>
              ))}
              <div className="search-checks">
                <label>
                  <input
                    type="checkbox"
                    checked={searchFields.attachment}
                    onChange={(event) =>
                      setSearchFields({ ...searchFields, attachment: event.target.checked })
                    }
                  />
                  Has attachment
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={searchFields.unread}
                    onChange={(event) =>
                      setSearchFields({ ...searchFields, unread: event.target.checked })
                    }
                  />
                  Unread only
                </label>
              </div>
              <Button variant="primary" type="submit">
                <Search size={16} />
                Search
              </Button>
            </form>
          )}
        </div>
        <div className="header-actions">
          <button
            className={`header-status ${connected ? '' : 'disconnected'}`}
            onClick={() => setSettingsTab('pipeline')}
            title="Mail processing status"
          >
            <span />
            {connected ? 'Your private inbox' : 'Reconnecting…'}
          </button>
          <IconButton label="Help and keyboard shortcuts" onClick={() => setHelp(true)}>
            <CircleHelp size={21} />
          </IconButton>
          <IconButton label="Open settings" onClick={() => setSettingsTab('general')}>
            <Settings2 size={21} />
          </IconButton>
          <button
            className="account-avatar"
            aria-label="Account settings"
            title={settings.account.email}
            onClick={() => setSettingsTab('general')}
          >
            <Avatar name={settings.account.name} tone="account" />
          </button>
        </div>
      </header>
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <MailboxSidebar
        settings={settings}
        route={route}
        searching={!!searchQuery}
        open={sidebar}
        onNavigate={(next) => {
          setQuery('');
          navigate(next);
        }}
        onCompose={() => {
          setCompose(emptyDraft());
          setSidebar(false);
        }}
        onSettings={setSettingsTab}
      />
      <main className="mail-panel" aria-label="Mailbox">
        {route.thread ? (
          <>
            {loadError ? (
              <div className="empty-state">
                <ShieldAlert size={36} />
                <h2>We couldn’t open this conversation</h2>
                <p>{loadError}</p>
                <Button variant="secondary" onClick={() => navigate({ label: route.label })}>
                  <ArrowLeft size={16} />
                  Back to mailbox
                </Button>
              </div>
            ) : conversation ? (
              <Conversation
                key={route.thread}
                data={conversation}
                labels={userLabels(settings.labels)}
                report={report}
                onBack={() => navigate({ label: route.label })}
                action={(name, value, until) => doAction(name, undefined, value, until)}
                compose={setCompose}
                mailboxEmail={settings.account.email}
              />
            ) : (
              <div className="loading">
                <LoaderCircle size={23} className="spin" />
                Opening conversation…
              </div>
            )}
          </>
        ) : (
          <>
            <PageHeading
              title={title}
              className="inbox-heading"
              description={
                searchQuery
                  ? `Results for “${searchQuery}”`
                  : route.label === 'INBOX'
                    ? new Date().toLocaleDateString([], {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                      })
                    : `${total} ${isDrafts ? 'draft' : 'conversation'}${total === 1 ? '' : 's'}`
              }
              aside={
                !searchQuery && !isDrafts ? (
                  <Button variant="secondary" size="sm" onClick={() => setQuery('is:unread')}>
                    Unread mail <Filter size={13} />
                  </Button>
                ) : undefined
              }
            />
            <Toolbar className={selectionCount > 0 ? 'selection-active' : ''}>
              {!isDrafts && (
                <>
                  <input
                    className="select-all"
                    type="checkbox"
                    aria-label="Select all conversations"
                    checked={
                      threads.length > 0 && threads.every((thread) => selected.has(thread.id))
                    }
                    ref={(element) => {
                      if (element)
                        element.indeterminate =
                          selectionCount > 0 && !threads.every((thread) => selected.has(thread.id));
                    }}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? new Set(threads.map((thread) => thread.id))
                          : new Set(),
                      )
                    }
                  />
                  <div className="popover-anchor">
                    <IconButton
                      label="Selection options"
                      onClick={() =>
                        setDropdown(dropdown === 'selection' ? undefined : 'selection')
                      }
                    >
                      <ChevronDown size={14} />
                    </IconButton>
                    {dropdown === 'selection' && (
                      <div className="dropdown">
                        {['All', 'None', 'Read', 'Unread', 'Starred'].map((value) => (
                          <button
                            key={value}
                            onClick={() => {
                              setSelected(
                                new Set(
                                  threads
                                    .filter(
                                      (thread) =>
                                        value === 'All' ||
                                        (value === 'Read' && !thread.unread) ||
                                        (value === 'Unread' && thread.unread) ||
                                        (value === 'Starred' &&
                                          thread.label_ids.includes('STARRED')),
                                    )
                                    .map((thread) => thread.id),
                                ),
                              );
                              setDropdown(undefined);
                            }}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="toolbar-divider" />
                </>
              )}
              {selectionCount > 0 ? (
                <>
                  <IconButton
                    label="Archive selected"
                    onClick={() => doAction('archive')}
                    disabled={busy}
                  >
                    <Archive size={18} />
                  </IconButton>
                  <IconButton
                    label="Report selected as spam"
                    onClick={() => doAction('spam')}
                    disabled={busy}
                  >
                    <ShieldAlert size={18} />
                  </IconButton>
                  <IconButton
                    label={
                      route.label === 'TRASH' ? 'Delete selected permanently' : 'Trash selected'
                    }
                    onClick={() => doAction(route.label === 'TRASH' ? 'delete' : 'trash')}
                    disabled={busy}
                  >
                    <Trash2 size={18} />
                  </IconButton>
                  <span className="toolbar-divider" />
                  <IconButton
                    label="Mark selected as read"
                    onClick={() => doAction('read')}
                    disabled={busy}
                  >
                    <CheckCheck size={18} />
                  </IconButton>
                  <IconButton
                    label="Snooze selected until tomorrow"
                    onClick={() => doAction('snooze', undefined, '', Date.now() + 86400000)}
                    disabled={busy}
                  >
                    <Clock3 size={18} />
                  </IconButton>
                  <IconButton
                    label="Move selected to inbox"
                    onClick={() => doAction('inbox')}
                    disabled={busy}
                  >
                    <FolderInput size={18} />
                  </IconButton>
                  <div className="popover-anchor">
                    <IconButton
                      label="Label selected"
                      onClick={() => setDropdown(dropdown === 'labels' ? undefined : 'labels')}
                    >
                      <Tag size={18} />
                    </IconButton>
                    {dropdown === 'labels' && (
                      <div className="dropdown">
                        <span className="dropdown-heading">Apply a label</span>
                        {userLabels(settings.labels).map((label) => (
                          <button
                            key={label.id}
                            onClick={() => doAction('label', undefined, label.id)}
                          >
                            <span className="label-dot" style={{ background: label.color }} />
                            {label.name}
                          </button>
                        ))}
                        <button
                          onClick={() => {
                            setSettingsTab('labels');
                            setDropdown(undefined);
                          }}
                        >
                          <Plus size={15} />
                          Create new label
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="popover-anchor">
                    <IconButton
                      label="More selected actions"
                      onClick={() => setDropdown(dropdown === 'more' ? undefined : 'more')}
                    >
                      <Ellipsis size={20} />
                    </IconButton>
                    {dropdown === 'more' && (
                      <div className="dropdown">
                        <button onClick={() => doAction('unread')}>Mark as unread</button>
                        <button onClick={() => doAction('star')}>Add star</button>
                        <button onClick={() => doAction('unstar')}>Remove star</button>
                        <button onClick={() => doAction('important')}>Mark important</button>
                      </div>
                    )}
                  </div>
                  <span className="selection-description">{selectionCount} selected</span>
                </>
              ) : (
                <>
                  <IconButton label="Refresh mailbox" onClick={refresh}>
                    <RefreshCw size={17} className={loading ? 'spin' : ''} />
                  </IconButton>
                  {!isDrafts && (
                    <IconButton label="Show unread mail" onClick={() => setQuery('is:unread')}>
                      <Filter size={17} />
                    </IconButton>
                  )}
                </>
              )}
              <span className="toolbar-spacer" />
              {total > 0 && (
                <span className="pagination-count">
                  {isDrafts
                    ? `${total} drafts`
                    : `${(page - 1) * 50 + 1}–${Math.min(page * 50, total)} of ${total}`}
                </span>
              )}
              {!isDrafts && (
                <>
                  <IconButton
                    label="Previous page"
                    className="pagination-control"
                    disabled={page === 1 || loading}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft size={18} />
                  </IconButton>
                  <IconButton
                    label="Next page"
                    className="pagination-control"
                    disabled={page * 50 >= total || loading}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight size={18} />
                  </IconButton>
                </>
              )}
            </Toolbar>
            {showCategories && (
              <Tabs
                className="category-tabs"
                label="Inbox categories"
                items={categories.map((item) => ({
                  id: item.id,
                  label: item.name,
                  icon: <item.icon size={17} />,
                }))}
                value={category}
                onValueChange={(value) => {
                  setCategory(value);
                  setSelected(new Set());
                  setPage(1);
                }}
                panelId="message-list"
              />
            )}
            <div
              id="message-list"
              className="message-list"
              role={showCategories ? 'tabpanel' : undefined}
              aria-label={
                showCategories ? categories.find((item) => item.id === category)?.name : undefined
              }
              aria-busy={loading || busy}
            >
              {loadError ? (
                <div className="empty-state">
                  <ShieldAlert size={38} />
                  <h2>We couldn’t load your mail</h2>
                  <p>{loadError}</p>
                  <Button variant="secondary" onClick={refresh}>
                    Try again
                  </Button>
                </div>
              ) : loading && (isDrafts ? drafts.length === 0 : threads.length === 0) ? (
                <div className="loading">
                  <LoaderCircle className="spin" size={22} />
                  Loading mail…
                </div>
              ) : (isDrafts ? drafts.length === 0 : threads.length === 0) ? (
                <div className="empty-state">
                  <div className="empty-illustration">
                    <div className="empty-circle" />
                    <Inbox size={55} strokeWidth={1.1} />
                    <span>
                      <Check size={18} />
                    </span>
                  </div>
                  <h2>
                    {searchQuery
                      ? 'No matching conversations'
                      : route.label === 'DRAFTS'
                        ? 'A fresh page awaits'
                        : route.label === 'INBOX'
                          ? 'Room for what matters'
                          : 'Nothing here for now'}
                  </h2>
                  <p>
                    {searchQuery
                      ? 'Try a different search or include in:anywhere to search Spam and Trash.'
                      : route.label === 'INBOX'
                        ? `Mail received by your server appears here. ${category !== 'CATEGORY_PERSONAL' ? 'This category is clear for now.' : 'Your inbox is ready when you are.'}`
                        : route.label === 'DRAFTS'
                          ? 'Start a message. We’ll save your thoughts as you go.'
                          : 'Conversations you move here will appear in this space.'}
                  </p>
                  {route.label === 'DRAFTS' ? (
                    <Button variant="secondary" onClick={() => setCompose(emptyDraft())}>
                      <Pencil size={16} />
                      Write a message
                    </Button>
                  ) : (
                    route.label === 'INBOX' && (
                      <button className="subtle-link" onClick={() => setSettingsTab('server')}>
                        View mail connections <ChevronRight size={14} />
                      </button>
                    )
                  )}
                </div>
              ) : isDrafts ? (
                drafts.map((draft) => (
                  <div className="message-row draft-row" key={draft.id}>
                    <span className="draft-indicator">Draft</span>
                    <button className="row-main" onClick={() => setCompose(draft)}>
                      <span className="row-sender">{draft.to || 'No recipient'}</span>
                      <span className="row-content">
                        <strong>{draft.subject || '(no subject)'}</strong>
                        <span className="snippet"> — {draft.body}</span>
                      </span>
                      <time>{messageDate(draft.updated_at)}</time>
                    </button>
                    <IconButton
                      label={`Delete draft ${draft.subject || '(no subject)'}`}
                      onClick={async () => {
                        try {
                          await api(`/drafts/${draft.id}`, { method: 'DELETE' });
                          refresh();
                          report('Draft discarded');
                        } catch (error) {
                          report((error as Error).message);
                        }
                      }}
                    >
                      <Trash2 size={17} />
                    </IconButton>
                  </div>
                ))
              ) : (
                threads.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    labels={userLabels(settings.labels)}
                    selected={selected.has(thread.id)}
                    onSelect={() => toggle(thread.id)}
                    onOpen={() => navigate({ ...route, thread: thread.id })}
                    onAction={(name, id) => doAction(name, [id])}
                  />
                ))
              )}
            </div>
            <footer className="mail-footer">
              <span>
                <span className={`connection-dot ${connected ? '' : 'disconnected'}`} />
                {connected ? 'Connected to your mail server' : 'Reconnecting to your mail server…'}
              </span>
              <button onClick={() => setSettingsTab('pipeline')}>
                <Activity size={13} />
                Processing status
              </button>
              <span>Yours, by design.</span>
            </footer>
          </>
        )}
      </main>
      {compose && (
        <Compose
          key={compose.id}
          initial={compose}
          settings={settings}
          onClose={() => {
            setCompose(undefined);
            refresh();
          }}
          onSent={refresh}
          report={report}
        />
      )}
      {settingsTab && (
        <Settings
          settings={settings}
          initialTab={settingsTab}
          onClose={() => setSettingsTab(undefined)}
          refresh={refresh}
          report={report}
        />
      )}
      {help && (
        <Modal title="A few useful shortcuts" onClose={() => setHelp(false)}>
          <div className="help-content">
            <p>
              Your mail lives on your server. Incoming messages pass through the processing pipeline
              before appearing here.
            </p>
            <div className="shortcut-list">
              {[
                ['/', 'Search mail'],
                ['c', 'Compose a message'],
                ['e', 'Archive selected conversations'],
                ['#', 'Move selection to Trash'],
                ['Esc', 'Back to mailbox'],
                ['?', 'Show shortcuts'],
              ].map(([key, description]) => (
                <div key={key}>
                  <span>{description}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
            <p className="muted small">
              Search supports from:, to:, subject:, label:, category:, is:unread, is:starred,
              has:attachment, before: and after: dates, and in:anywhere.
            </p>
          </div>
        </Modal>
      )}
      {confirmDelete && (
        <Modal title="Delete permanently?" onClose={() => setConfirmDelete(undefined)}>
          <div className="help-content">
            <p>
              This removes {confirmDelete.length} conversation
              {confirmDelete.length === 1 ? '' : 's'} from Trash, including their attachments. This
              cannot be undone.
            </p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setConfirmDelete(undefined)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => doAction('delete', confirmDelete)}
              >
                Delete permanently
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <IconButton label="Dismiss notification" onClick={() => setToast('')}>
            <X size={16} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
