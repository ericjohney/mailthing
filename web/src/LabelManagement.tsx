import { useEffect, useId, useState } from 'react';
import { ArrowLeft, LoaderCircle, Pencil, Plus, Search, Tag, Trash2 } from 'lucide-react';
import { api, mutate } from './api';
import { Button, Field, IconButton, Modal, SectionHeading } from './design-system';
import { userLabels } from './mailbox/navigation';
import type { Label, LabelDetail, Settings } from './types';

export type LabelChange = (label: Label, deleted?: boolean) => void;
type Props = {
  settings: Settings;
  initialCreate?: boolean;
  onChanged: LabelChange;
  onOpen: (label: Label) => void;
};

export function LabelsView({ onClose, ...props }: Props & { onClose: () => void }) {
  return (
    <Modal title="Labels" onClose={onClose} className="labels-modal">
      <LabelManagement {...props} />
    </Modal>
  );
}

export function LabelManagement({ settings, initialCreate, onChanged, onOpen }: Props) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Label | 'new' | null>(initialCreate ? 'new' : null);
  const [notice, setNotice] = useState('');
  const labels = userLabels(settings.labels);
  const matches = labels
    .filter((label) => label.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort(
      (a, b) =>
        Number(b.pinned !== false) - Number(a.pinned !== false) || a.name.localeCompare(b.name),
    );
  return (
    <div className="label-management">
      {editing ? (
        <LabelEditor
          key={editing === 'new' ? 'new' : editing.id}
          label={editing === 'new' ? undefined : editing}
          onBack={() => setEditing(null)}
          onSaved={(label, deleted) => {
            onChanged(label, deleted);
            setQuery('');
            setEditing(null);
            setNotice(
              deleted
                ? 'Label deleted. Your messages were kept.'
                : editing === 'new'
                  ? 'Label created'
                  : 'Label updated',
            );
          }}
        />
      ) : (
        <>
          <SectionHeading title="Your labels" description="Keep mail organized, your way." />
          {notice && (
            <p className="label-notice" role="status">
              {notice}
            </p>
          )}
          {labels.length ? (
            <>
              <label className="label-search">
                <Search size={18} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search labels"
                  placeholder="Search labels"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="label-list" aria-label="Your labels">
                {matches.map((label) => {
                  const counts = settings.counts[label.id];
                  return (
                    <div className="label-list-row" key={label.id}>
                      <button
                        className="label-open"
                        onClick={() => onOpen(label)}
                        title={`Open ${label.name}`}
                      >
                        <span className="label-dot" style={{ background: label.color }} />
                        <span>
                          <strong>{label.name}</strong>
                          <small>
                            {counts?.total ?? 0}{' '}
                            {counts?.total === 1 ? 'conversation' : 'conversations'}
                            {counts?.unread ? ` · ${counts.unread} unread` : ''}
                            {label.pinned !== false ? ' · Pinned' : ''}
                          </small>
                        </span>
                      </button>
                      <IconButton label={`Edit ${label.name}`} onClick={() => setEditing(label)}>
                        <Pencil size={17} />
                      </IconButton>
                    </div>
                  );
                })}
                {!matches.length && <p className="muted">No labels match “{query}”.</p>}
              </div>
            </>
          ) : (
            <div className="labels-empty">
              <Tag size={32} />
              <h3>A little order, your way.</h3>
              <p>Create labels for projects, receipts, or anything you want to find later.</p>
            </div>
          )}
          <div className="label-management-footer">
            <Button onClick={() => setEditing('new')}>
              <Plus size={17} />
              {labels.length ? 'New label' : 'Create your first label'}
            </Button>
            <p className="muted small">Edit a label to pin it or add sorting guidance.</p>
          </div>
        </>
      )}
    </div>
  );
}

function LabelEditor({
  label,
  onBack,
  onSaved,
}: {
  label?: Label;
  onBack: () => void;
  onSaved: LabelChange;
}) {
  const id = useId();
  const [name, setName] = useState(label?.name ?? '');
  const [color, setColor] = useState(label?.color ?? '#777d88');
  const [pinned, setPinned] = useState(label?.pinned !== false);
  const [guidance, setGuidance] = useState('');
  const [examples, setExamples] = useState(0);
  const [loading, setLoading] = useState(!!label);
  const [loaded, setLoaded] = useState(!label);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!label) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    api<LabelDetail>(`/labels/${encodeURIComponent(label.id)}`)
      .then((detail) => {
        if (!cancelled) {
          setName(detail.name);
          setColor(detail.color);
          setPinned(detail.pinned !== false);
          setGuidance(detail.guidance);
          setExamples(detail.example_count);
          setLoaded(true);
        }
      })
      .catch((failure: Error) => {
        if (!cancelled) setError(failure.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [label?.id, attempt]);
  const nameBytes = new TextEncoder().encode(name.trim()).length;
  const valid = nameBytes > 0 && nameBytes <= 50 && Array.from(guidance).length <= 2000;
  async function save() {
    setSaving(true);
    setError('');
    try {
      const saved = await mutate<Label>(
        label ? `/labels/${encodeURIComponent(label.id)}` : '/labels',
        { name: name.trim(), color, pinned, guidance },
        label ? 'PUT' : 'POST',
      );
      onSaved(saved);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!label) return;
    setSaving(true);
    setError('');
    try {
      await api(`/labels/${encodeURIComponent(label.id)}`, { method: 'DELETE' });
      onSaved(label, true);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="label-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      aria-busy={loading || saving}
    >
      <div className="label-editor-heading">
        <Button variant="ghost" onClick={onBack} disabled={saving}>
          <ArrowLeft size={17} />
          Labels
        </Button>
        <h3>{label ? 'Edit label' : 'New label'}</h3>
      </div>
      {loading && (
        <p className="muted">
          <LoaderCircle className="spin" size={16} /> Loading label…
        </p>
      )}
      {error && (
        <p className="label-error" role="alert">
          {error}
        </p>
      )}
      {!loaded && !loading && (
        <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
          Retry
        </Button>
      )}
      <fieldset disabled={loading || saving || !loaded}>
        <Field label="Name">
          <input
            id={id}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="off"
            autoFocus={!label}
          />
        </Field>
        {nameBytes > 50 && (
          <p className="label-error">Choose a shorter label name (50 bytes maximum).</p>
        )}
        <Field label="Color">
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </Field>
        <label className="label-pin">
          <span>Pin to mailboxes</span>
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => setPinned(event.target.checked)}
          />
        </label>
        <Field label="Sorting guidance">
          <textarea
            value={guidance}
            onChange={(event) => setGuidance(event.target.value)}
            rows={4}
            placeholder="What kind of mail belongs here?"
          />
        </Field>
        <p className="muted small">
          Help Mailthing recognize mail for this label. Applying or removing labels teaches it too.
          Your filters take precedence.
        </p>
        {Array.from(guidance).length > 2000 && (
          <p className="label-error">Keep guidance within 2,000 characters.</p>
        )}
        {label && <p className="muted small">{examples} remembered examples</p>}
        <Button type="submit" disabled={!valid || saving}>
          {saving ? 'Saving…' : label ? 'Save label' : 'Create label'}
        </Button>
      </fieldset>
      {label &&
        (confirmDelete ? (
          <div className="label-delete-confirm" role="group" aria-label="Delete label confirmation">
            <strong>Delete “{label.name}”?</strong>
            <p>
              This removes the label, its sorting memory, and any filters that apply it. Your
              messages will be kept.
            </p>
            <div>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={saving}>
                Keep label
              </Button>
              <Button variant="danger" onClick={() => void remove()} disabled={saving}>
                Delete label
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="label-delete"
            onClick={() => setConfirmDelete(true)}
            disabled={saving || !loaded}
          >
            <Trash2 size={16} />
            Delete label
          </Button>
        ))}
    </form>
  );
}
