import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  Check,
  ChevronDown,
  Clock3,
  Download,
  Ellipsis,
  Mail,
  Paperclip,
  Reply,
  ReplyAll,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import { encodeFile, fileSize, messageDate } from './api';
import { EmailContent } from './mailbox/EmailContent';
import { placeLabels } from './mailbox/navigation';
import {
  emptyDraft,
  type Conversation as ConversationData,
  type Draft,
  type Label,
  type Message,
} from './types';
import { Avatar, Badge, Button, IconButton, Toolbar } from './design-system';

export function Conversation({
  data,
  onBack,
  action,
  compose,
  mailboxEmail,
  labels,
  report,
}: {
  data: ConversationData;
  onBack: () => void;
  action: (name: string, value?: string, until?: number) => void;
  compose: (draft: Draft) => void;
  mailboxEmail: string;
  labels: Label[];
  report: (message: string) => void;
}) {
  const [plainText, setPlainText] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState(false);
  const [labelMenu, setLabelMenu] = useState(false);
  const latest = data.messages[data.messages.length - 1];
  const trashed = latest.labels.includes('TRASH');
  const important = data.messages.some((message) => message.labels.includes('IMPORTANT'));
  const applied = data.labels.filter((label) => label.kind === 'user');
  const places = placeLabels.flatMap((id) => data.labels.find((label) => label.id === id) ?? []);
  function reply(all = false, message: Message = latest) {
    const draft = emptyDraft();
    draft.to = message.sender_email === mailboxEmail ? message.recipients : message.sender_email;
    draft.cc = all
      ? [message.recipients, message.cc]
          .filter(Boolean)
          .join(', ')
          .split(',')
          .filter(
            (address) => !address.includes(mailboxEmail) && !address.includes(message.sender_email),
          )
          .join(', ')
      : '';
    draft.subject = /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`;
    draft.in_reply_to = message.message_id;
    compose(draft);
  }
  async function forward() {
    const draft = emptyDraft();
    draft.subject = `Fwd: ${latest.subject}`;
    draft.body = `\n\n---------- Forwarded message ----------\nFrom: ${latest.sender} <${latest.sender_email}>\nDate: ${new Date(latest.received_at).toLocaleString()}\nSubject: ${latest.subject}\nTo: ${latest.recipients}\n\n${latest.text}`;
    try {
      draft.attachments = await Promise.all(
        data.attachments
          .filter((attachment) => attachment.message_id === latest.id)
          .map(async (attachment) => {
            const response = await fetch(`/api/attachments/${attachment.id}`);
            if (!response.ok) throw new Error('Could not load an attachment for forwarding');
            return {
              name: attachment.name,
              content_type: attachment.content_type,
              data: await encodeFile(new File([await response.blob()], attachment.name)),
            };
          }),
      );
      compose(draft);
    } catch (error) {
      report((error as Error).message);
    }
  }
  return (
    <>
      <Toolbar className="conversation-toolbar">
        <IconButton label="Back to mailbox" onClick={onBack}>
          <ArrowLeft size={19} />
        </IconButton>
        <span className="toolbar-divider" />
        <IconButton label="Archive conversation" onClick={() => action('archive')}>
          <Archive size={18} />
        </IconButton>
        <IconButton
          label={trashed ? 'Delete permanently' : 'Move to trash'}
          onClick={() => action(trashed ? 'delete' : 'trash')}
        >
          <Trash2 size={18} />
        </IconButton>
        <IconButton label="Report spam" onClick={() => action('spam')}>
          <ShieldAlert size={18} />
        </IconButton>
        <span className="toolbar-divider" />
        <IconButton label="Mark as unread" onClick={() => action('unread')}>
          <Mail size={18} />
        </IconButton>
        <IconButton
          label="Snooze until tomorrow"
          onClick={() => action('snooze', '', Date.now() + 86400000)}
        >
          <Clock3 size={18} />
        </IconButton>
        <div className="popover-anchor">
          <IconButton label="Edit conversation labels" onClick={() => setLabelMenu(!labelMenu)}>
            <Tag size={18} />
          </IconButton>
          {labelMenu && (
            <div className="dropdown">
              <span className="dropdown-heading">Conversation labels</span>
              {labels.length === 0 && (
                <span className="dropdown-heading">Create labels in Settings</span>
              )}
              {labels.map((label) => (
                <button
                  key={label.id}
                  onClick={() => {
                    action(
                      applied.some((item) => item.id === label.id) ? 'unlabel' : 'label',
                      label.id,
                    );
                    setLabelMenu(false);
                  }}
                >
                  <span className="label-dot" style={{ background: label.color }} />
                  {label.name}
                  {applied.some((item) => item.id === label.id) && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="popover-anchor">
          <IconButton label="More conversation actions" onClick={() => setMenu(!menu)}>
            <Ellipsis size={20} />
          </IconButton>
          {menu && (
            <div className="dropdown">
              <button
                onClick={() => {
                  action('inbox');
                  setMenu(false);
                }}
              >
                Move to inbox
              </button>
              <button
                onClick={() => {
                  action(important ? 'unimportant' : 'important');
                  setMenu(false);
                }}
              >
                {important ? 'Mark as not important' : 'Mark as important'}
              </button>
              <button
                onClick={() => {
                  setPlainText(!plainText);
                  setMenu(false);
                }}
              >
                {plainText ? 'Show formatted email' : 'Show plain text'}
              </button>
            </div>
          )}
        </div>
        <span className="toolbar-spacer" />
        <span className="muted">
          {data.messages.length} {data.messages.length === 1 ? 'message' : 'messages'}
        </span>
      </Toolbar>
      <div className="conversation-content">
        <div className="conversation-subject">
          <h1>{latest.subject || '(no subject)'}</h1>
          {places.length ? (
            places.map((label) => (
              <Badge key={label.id} className="folder-chip">
                {label.name}
              </Badge>
            ))
          ) : (
            <Badge className="folder-chip">All mail</Badge>
          )}
          {applied.map((label) => (
            <Badge key={label.id} className="label-chip">
              {label.name}
              <button
                aria-label={`Remove label ${label.name}`}
                onClick={() => action('unlabel', label.id)}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
        {data.messages.map((message, index) => {
          const open =
            index === data.messages.length - 1
              ? !expanded.has(message.id)
              : expanded.has(message.id);
          return (
            <article className={`email-message ${open ? '' : 'email-collapsed'}`} key={message.id}>
              <Avatar name={message.sender} />
              <div className="email-main">
                <header className="email-header">
                  <button
                    className="email-sender"
                    onClick={() =>
                      setExpanded((old) => {
                        const next = new Set(old);
                        if (next.has(message.id)) next.delete(message.id);
                        else next.add(message.id);
                        return next;
                      })
                    }
                  >
                    <strong>{message.sender}</strong>
                    {open && <span>&lt;{message.sender_email}&gt;</span>}
                  </button>
                  <span className="email-date">{messageDate(message.received_at)}</span>
                  <IconButton
                    label={starred(message) ? 'Unstar conversation' : 'Star conversation'}
                    onClick={() => action(starred(message) ? 'unstar' : 'star')}
                  >
                    <Star size={18} className={starred(message) ? 'star-active' : ''} />
                  </IconButton>
                  {open && (
                    <IconButton label="Reply to message" onClick={() => reply(false, message)}>
                      <Reply size={18} />
                    </IconButton>
                  )}
                </header>
                {open ? (
                  <>
                    <details className="email-details">
                      <summary>
                        to {message.recipients || 'me'} <ChevronDown size={12} />
                      </summary>
                      <dl>
                        <dt>From</dt>
                        <dd>{message.sender_email}</dd>
                        <dt>To</dt>
                        <dd>{message.recipients}</dd>
                        {message.cc && (
                          <>
                            <dt>Cc</dt>
                            <dd>{message.cc}</dd>
                          </>
                        )}
                        <dt>Received for</dt>
                        <dd>{JSON.parse(message.envelope_to).join(', ')}</dd>
                        <dt>Date</dt>
                        <dd>{new Date(message.received_at).toLocaleString()}</dd>
                      </dl>
                    </details>
                    {message.html && !plainText ? (
                      <EmailContent sender={message.sender} html={message.html} />
                    ) : (
                      <div className="email-text">
                        {message.text || '(This email has no text content.)'}
                      </div>
                    )}
                    {data.attachments.filter((a) => a.message_id === message.id).length > 0 && (
                      <div className="attachment-section">
                        <h3>
                          <Paperclip size={15} />
                          Attachments
                        </h3>
                        <div className="attachment-grid">
                          {data.attachments
                            .filter((a) => a.message_id === message.id)
                            .map((attachment) => (
                              <a
                                key={attachment.id}
                                href={`/api/attachments/${attachment.id}`}
                                className="attachment-card"
                                download={attachment.name}
                              >
                                <div className="attachment-icon">
                                  <Paperclip size={24} />
                                </div>
                                <div>
                                  <strong>{attachment.name}</strong>
                                  <span>{fileSize(attachment.size)}</span>
                                </div>
                                <Download size={17} />
                              </a>
                            ))}
                        </div>
                      </div>
                    )}
                    <a
                      className="source-link"
                      href={`/api/messages/${message.id}/raw`}
                      download="message.eml"
                    >
                      Download original <Download size={12} />
                    </a>
                  </>
                ) : (
                  <p className="collapsed-snippet">{message.text.slice(0, 130)}</p>
                )}
              </div>
            </article>
          );
        })}
        <div className="reply-actions">
          <Button variant="secondary" onClick={() => reply()}>
            <Reply size={17} />
            Reply
          </Button>
          <Button variant="secondary" onClick={() => reply(true)}>
            <ReplyAll size={17} />
            Reply all
          </Button>
          <Button variant="secondary" onClick={forward}>
            <ArrowRight size={17} />
            Forward
          </Button>
        </div>
      </div>
    </>
  );
}

const starred = (message: Message) => message.labels.includes('STARRED');
