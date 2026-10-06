import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Paperclip,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { api, encodeFile, fileSize, mutate } from './api';
import type { Draft, Settings } from './types';
import { Button, IconButton } from './design-system';

export function Compose({
  initial,
  settings,
  onClose,
  onSent,
  report,
}: {
  initial: Draft;
  settings: Settings;
  onClose: () => void;
  onSent: () => void;
  report: (message: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [saveState, setSaveState] = useState('Draft');
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [extras, setExtras] = useState(Boolean(initial.cc || initial.bcc));
  const latest = useRef(draft);
  const pendingSave = useRef<Promise<unknown>>(Promise.resolve());
  const closed = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  latest.current = draft;
  function save(value: Draft) {
    setSaveState('Saving…');
    // Serialize saves so an older response cannot overwrite a newer draft.
    const task = pendingSave.current.catch(() => {}).then(() => mutate<Draft>('/drafts', value));
    pendingSave.current = task;
    return task.then(() => {
      if (!closed.current) setSaveState('Saved');
    });
  }
  useEffect(() => {
    if (sending || closed.current) return;
    const timer = setTimeout(() => {
      if (!closed.current)
        save(draft).catch((error) => {
          setSaveState('Not saved');
          report(error.message);
        });
    }, 650);
    return () => clearTimeout(timer);
  }, [draft, sending]); // Saves only when the message changes.
  function update(key: keyof Draft, value: string) {
    setDraft((old) => ({ ...old, [key]: value }));
  }
  async function close() {
    try {
      await save(latest.current);
      closed.current = true;
      onClose();
    } catch (error) {
      report((error as Error).message);
    }
  }
  async function discard() {
    closed.current = true;
    try {
      await pendingSave.current.catch(() => {});
      await api(`/drafts/${draft.id}`, { method: 'DELETE' });
      onClose();
      report('Draft discarded');
    } catch (error) {
      closed.current = false;
      report((error as Error).message);
    }
  }
  async function send() {
    if (sending) return;
    setSending(true);
    try {
      await save(latest.current);
      await mutate(`/drafts/${draft.id}/send`, {});
      closed.current = true;
      onClose();
      onSent();
      report('Message sent');
    } catch (error) {
      report((error as Error).message);
      setSending(false);
    }
  }
  async function attach(files: FileList | null) {
    if (!files) return;
    try {
      const existing = draft.attachments.reduce((size, item) => size + item.data.length * 0.75, 0);
      if (
        Array.from(files).reduce((size, file) => size + file.size, existing) >
        settings.max_message_bytes * 0.7
      )
        throw new Error('Attachments exceed the message size limit');
      const attachments = await Promise.all(
        Array.from(files).map(async (file) => ({
          name: file.name,
          content_type: file.type || 'application/octet-stream',
          data: await encodeFile(file),
        })),
      );
      setDraft((old) => ({ ...old, attachments: [...old.attachments, ...attachments] }));
    } catch (error) {
      report((error as Error).message);
    }
    if (fileInput.current) fileInput.current.value = '';
  }
  return (
    <section
      className={`compose ${expanded ? 'compose-expanded' : ''}`}
      role="dialog"
      aria-label="New message"
      aria-modal="false"
    >
      <header className="compose-heading">
        <span>New message</span>
        <div>
          <IconButton
            label={expanded ? 'Minimize compose' : 'Expand compose'}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </IconButton>
          <IconButton label="Close compose and save draft" onClick={close} disabled={sending}>
            <X size={18} />
          </IconButton>
        </div>
      </header>
      <div className="compose-from">
        From{' '}
        <span>
          {settings.account.name} &lt;{settings.account.email}&gt;
        </span>
        <ChevronDown size={14} />
      </div>
      <div className="compose-field">
        <label htmlFor="compose-to">To</label>
        <input
          id="compose-to"
          value={draft.to}
          onChange={(event) => update('to', event.target.value)}
          placeholder="Recipients"
          autoFocus
          disabled={sending}
        />
        <button type="button" onClick={() => setExtras(!extras)}>
          Cc Bcc
        </button>
      </div>
      {extras && (
        <>
          <div className="compose-field">
            <label htmlFor="compose-cc">Cc</label>
            <input
              id="compose-cc"
              value={draft.cc}
              onChange={(event) => update('cc', event.target.value)}
              disabled={sending}
            />
          </div>
          <div className="compose-field">
            <label htmlFor="compose-bcc">Bcc</label>
            <input
              id="compose-bcc"
              value={draft.bcc}
              onChange={(event) => update('bcc', event.target.value)}
              disabled={sending}
            />
          </div>
        </>
      )}
      <div className="compose-field">
        <label className="sr-only" htmlFor="compose-subject">
          Subject
        </label>
        <input
          id="compose-subject"
          value={draft.subject}
          onChange={(event) => update('subject', event.target.value)}
          placeholder="Subject"
          disabled={sending}
        />
      </div>
      <textarea
        className="compose-body"
        aria-label="Message body"
        value={draft.body}
        onChange={(event) => update('body', event.target.value)}
        placeholder="Write something thoughtful…"
        disabled={sending}
      />
      {draft.attachments.length > 0 && (
        <div className="compose-attachments">
          {draft.attachments.map((attachment, index) => (
            <span key={index}>
              <Paperclip size={14} />
              {attachment.name} <small>{fileSize(attachment.data.length * 0.75)}</small>
              <button
                aria-label={`Remove ${attachment.name}`}
                disabled={sending}
                onClick={() =>
                  setDraft((old) => ({
                    ...old,
                    attachments: old.attachments.filter((_, i) => i !== index),
                  }))
                }
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      )}
      {!settings.outbound_configured && (
        <p className="compose-notice">
          <ArrowUpRight size={15} /> Add your outbound SMTP relay to send. Drafts are saved
          automatically.
        </p>
      )}
      <footer className="compose-footer">
        <Button
          variant="primary"
          onClick={send}
          disabled={
            sending || !settings.outbound_configured || !(draft.to || draft.cc || draft.bcc)
          }
        >
          {sending ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}{' '}
          {sending ? 'Sending…' : 'Send'}
        </Button>
        <IconButton
          label="Attach files"
          onClick={() => fileInput.current?.click()}
          disabled={sending}
        >
          <Paperclip size={19} />
        </IconButton>
        <input
          type="file"
          multiple
          hidden
          ref={fileInput}
          onChange={(event) => attach(event.target.files)}
        />
        <span className="draft-status">
          {saveState === 'Saved' && <Check size={14} />}
          {saveState}
        </span>
        <IconButton label="Discard draft" onClick={discard} disabled={sending}>
          <Trash2 size={18} />
        </IconButton>
      </footer>
    </section>
  );
}
