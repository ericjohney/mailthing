import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Filter,
  LoaderCircle,
  Plus,
  Server,
  Tag,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api, encodeFile, mutate } from './api';
import type { PipelineStatus, Rule, Settings as SettingsData } from './types';
import {
  Button,
  Field,
  IconButton,
  Modal,
  SectionHeading,
  Tabs,
  useTheme,
  type ThemePreference,
} from './design-system';

export function Settings({
  settings,
  initialTab = 'general',
  onClose,
  refresh,
  report,
}: {
  settings: SettingsData;
  initialTab?: string;
  onClose: () => void;
  refresh: () => void;
  report: (message: string) => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [account, setAccount] = useState(settings.account);
  const [labelName, setLabelName] = useState('');
  const [color, setColor] = useState('#65705f');
  const [rules, setRules] = useState<Rule[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStatus>();
  const [saving, setSaving] = useState(false);
  const { preference, setPreference } = useTheme();
  const [rule, setRule] = useState<Rule>({
    id: '',
    name: '',
    field: 'from',
    contains: '',
    action: 'label',
    value: '',
    enabled: true,
  });
  async function run(task: () => Promise<unknown>, message: string) {
    setSaving(true);
    try {
      await task();
      refresh();
      report(message);
    } catch (error) {
      report((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    if (tab === 'rules')
      api<Rule[]>('/rules')
        .then(setRules)
        .catch((error) => report(error.message));
    if (tab !== 'pipeline') return;
    const load = () =>
      api<PipelineStatus>('/pipeline')
        .then(setPipeline)
        .catch((error) => report(error.message));
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [tab]);
  const tabs = [
    { id: 'general', label: 'General', icon: UserRound },
    { id: 'labels', label: 'Labels', icon: Tag },
    { id: 'rules', label: 'Filters & rules', icon: Filter },
    { id: 'pipeline', label: 'Processing', icon: Activity },
    { id: 'server', label: 'Connections', icon: Server },
  ];
  return (
    <Modal title="Settings" onClose={onClose} className="settings-modal">
      <Tabs
        className="settings-tabs"
        label="Settings sections"
        items={tabs.map((item) => ({
          id: item.id,
          label: item.label,
          icon: <item.icon size={16} />,
        }))}
        value={tab}
        onValueChange={setTab}
        panelId="settings-panel"
      />
      <div
        id="settings-panel"
        className="settings-content"
        role="tabpanel"
        aria-label={tabs.find((item) => item.id === tab)?.label}
      >
        {tab === 'general' && (
          <>
            <SectionHeading
              title="Your mailbox"
              description="Your name and address are used when sending email."
            />
            <form
              onSubmit={(event) => {
                event.preventDefault();
                run(() => mutate('/settings', account, 'PUT'), 'Mailbox settings saved');
              }}
            >
              <Field label="Display name">
                <input
                  value={account.name}
                  onChange={(event) => setAccount({ ...account, name: event.target.value })}
                  required
                  maxLength={100}
                />
              </Field>
              <Field label="Email address">
                <input
                  type="email"
                  value={account.email}
                  onChange={(event) => setAccount({ ...account, email: event.target.value })}
                  required
                />
              </Field>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Save
                changes
              </Button>
            </form>
            <div className="settings-divider" />
            <SectionHeading
              title="Appearance"
              description="Choose a palette or follow your device’s appearance."
            />
            <div className="theme-options" role="group" aria-label="Color theme">
              {(['light', 'dark', 'system'] as ThemePreference[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={preference === value}
                  onClick={() => setPreference(value)}
                >
                  <span
                    className="theme-preview"
                    data-theme={value === 'system' ? undefined : value}
                  >
                    <i />
                    <i />
                    <i />
                  </span>
                  {value === 'light' ? 'Light' : value === 'dark' ? 'Dark' : 'System'}
                  {preference === value && <Check size={15} />}
                </button>
              ))}
            </div>
          </>
        )}
        {tab === 'labels' && (
          <>
            <SectionHeading
              title="Keep everything in its place"
              description="Create labels, then apply them to conversations or use them in a filter."
            />
            <form
              className="inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  await mutate('/labels', { name: labelName, color });
                  setLabelName('');
                }, 'Label created');
              }}
            >
              <input
                aria-label="New label name"
                placeholder="Label name"
                required
                value={labelName}
                onChange={(event) => setLabelName(event.target.value)}
                maxLength={50}
              />
              <input
                type="color"
                aria-label="Label color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
              <Button variant="primary" type="submit" disabled={saving}>
                <Plus size={17} />
                Create
              </Button>
            </form>
            <div className="settings-list">
              {settings.labels.map((label) => (
                <div key={label.id}>
                  <span className="label-dot" style={{ background: label.color }} />
                  <strong>{label.name}</strong>
                  <IconButton
                    label={`Delete label ${label.name}`}
                    onClick={() =>
                      run(() => api(`/labels/${label.id}`, { method: 'DELETE' }), 'Label deleted')
                    }
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              ))}
              {settings.labels.length === 0 && (
                <p className="muted">No labels yet. Create your first one above.</p>
              )}
            </div>
          </>
        )}
        {tab === 'rules' && (
          <>
            <SectionHeading
              title="A quieter inbox, automatically"
              description="Filters run in order as new mail arrives. Matching is case-insensitive."
            />
            <form
              className="rule-form"
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  await mutate('/rules', rule);
                  setRules(await api('/rules'));
                  setRule({ ...rule, id: '', name: '', contains: '' });
                }, 'Filter saved');
              }}
            >
              <Field label="Filter name">
                <input
                  required
                  placeholder="e.g. Receipts to Finance"
                  value={rule.name}
                  onChange={(event) => setRule({ ...rule, name: event.target.value })}
                />
              </Field>
              <div className="form-row">
                <Field label="When">
                  <select
                    value={rule.field}
                    onChange={(event) => setRule({ ...rule, field: event.target.value })}
                  >
                    {['from', 'to', 'subject', 'body'].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Contains">
                  <input
                    required
                    placeholder="Text to match"
                    value={rule.contains}
                    onChange={(event) => setRule({ ...rule, contains: event.target.value })}
                  />
                </Field>
              </div>
              <div className="form-row">
                <Field label="Then">
                  <select
                    value={rule.action}
                    onChange={(event) =>
                      setRule({ ...rule, action: event.target.value, value: '' })
                    }
                  >
                    {[
                      ['label', 'Apply label'],
                      ['category', 'Set category'],
                      ['archive', 'Archive'],
                      ['star', 'Star'],
                      ['important', 'Mark important'],
                      ['read', 'Mark as read'],
                      ['spam', 'Move to spam'],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                {rule.action === 'label' && (
                  <Field label="Label">
                    <select
                      required
                      value={rule.value}
                      onChange={(event) => setRule({ ...rule, value: event.target.value })}
                    >
                      <option value="">Choose label</option>
                      {settings.labels.map((label) => (
                        <option key={label.id} value={label.id}>
                          {label.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {rule.action === 'category' && (
                  <Field label="Category">
                    <select
                      required
                      value={rule.value}
                      onChange={(event) => setRule({ ...rule, value: event.target.value })}
                    >
                      <option value="">Choose category</option>
                      {['primary', 'updates', 'promotions', 'social'].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
              <Button variant="primary" type="submit" disabled={saving}>
                <Plus size={16} />
                Add filter
              </Button>
            </form>
            <div className="settings-list">
              {rules.map((item) => (
                <div key={item.id}>
                  <input
                    type="checkbox"
                    aria-label={`Enable ${item.name}`}
                    checked={item.enabled}
                    onChange={() =>
                      run(async () => {
                        await mutate('/rules', { ...item, enabled: !item.enabled });
                        setRules(await api('/rules'));
                      }, 'Filter updated')
                    }
                  />
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.field} contains “{item.contains}” → {item.action}
                    </small>
                  </div>
                  <IconButton
                    label={`Delete filter ${item.name}`}
                    onClick={() =>
                      run(async () => {
                        await api(`/rules/${item.id}`, { method: 'DELETE' });
                        setRules(await api('/rules'));
                      }, 'Filter deleted')
                    }
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === 'pipeline' && (
          <>
            <div className="settings-section-heading">
              <h3>Mail processing</h3>
              <span className="status-pill">
                <span />
                Live
              </span>
            </div>
            <p className="muted">
              Every email is saved before it enters the pipeline. Failed receipts stay available for
              retry.
            </p>
            {pipeline ? (
              <>
                <div className="pipeline-metrics">
                  <div>
                    <strong>{pipeline.counts.completed || 0}</strong>
                    <span>Processed</span>
                  </div>
                  <div>
                    <strong>
                      {(pipeline.counts.pending || 0) + (pipeline.counts.processing || 0)}
                    </strong>
                    <span>In queue</span>
                  </div>
                  <div>
                    <strong>
                      {Math.round(pipeline.average_ms)}
                      <small> ms</small>
                    </strong>
                    <span>Avg. processing</span>
                  </div>
                </div>
                <div className="pipeline-stages">
                  {pipeline.stages.map((stage, index) => (
                    <div key={stage}>
                      <span>{index + 1}</span>
                      <strong>{stage}</strong>
                      <CheckCircle2 size={17} />
                    </div>
                  ))}
                </div>
                <p className="muted small">
                  {pipeline.concurrency} concurrent workers · durable SQLite queue
                </p>
                {pipeline.failures.map((failure) => (
                  <div className="pipeline-failure" key={failure.id}>
                    <strong>
                      {failure.kind === 'outgoing'
                        ? 'Check outbound delivery'
                        : 'Processing failed'}
                    </strong>
                    <p>{failure.error}</p>
                    {failure.kind === 'incoming' && (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          run(
                            () => mutate(`/pipeline/${failure.id}/retry`, {}),
                            'Receipt queued for retry',
                          )
                        }
                      >
                        Retry processing
                      </Button>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <div className="loading">
                <LoaderCircle className="spin" size={22} />
              </div>
            )}
          </>
        )}
        {tab === 'server' && (
          <>
            <h3>Mail connections</h3>
            <div className="connection-card">
              <div className="connection-icon">
                <Server size={23} />
              </div>
              <div>
                <strong>Incoming mail</strong>
                <p>Catch-all SMTP · port {settings.smtp_port}</p>
                <small>Accepts mail for any valid recipient address.</small>
              </div>
              <CheckCircle2 className="positive" size={20} />
            </div>
            <div className="connection-card">
              <div className="connection-icon">
                <ArrowRight size={23} />
              </div>
              <div>
                <strong>Outbound relay</strong>
                <p>
                  {settings.outbound_configured
                    ? 'Configured and ready to send'
                    : 'Waiting for your SMTP credentials'}
                </p>
                <small>
                  Set SMTP_RELAY_HOST, SMTP_RELAY_PORT, SMTP_RELAY_USER and SMTP_RELAY_PASSWORD in
                  your server configuration.
                </small>
              </div>
              {settings.outbound_configured ? (
                <CheckCircle2 className="positive" size={20} />
              ) : (
                <Circle className="muted" size={20} />
              )}
            </div>
            <p className="muted small">
              Relay security defaults to STARTTLS. Restart the server after changing connection
              settings.
            </p>
            <div className="settings-divider" />
            <SectionHeading
              title="Import existing email"
              description="Import .eml files through the same processing pipeline."
            />
            <label className="button button-secondary file-import">
              <Plus size={17} />
              Import email
              <input
                hidden
                type="file"
                multiple
                accept=".eml,message/rfc822"
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  run(
                    async () => {
                      for (const file of files) {
                        if (file.size > settings.max_message_bytes)
                          throw new Error(`${file.name} exceeds the size limit`);
                        await mutate('/import', { raw: await encodeFile(file) });
                      }
                    },
                    `${files.length} email${files.length === 1 ? '' : 's'} queued for processing`,
                  );
                  event.target.value = '';
                }}
              />
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}
