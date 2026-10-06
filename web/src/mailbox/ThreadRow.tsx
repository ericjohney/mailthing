import { Archive, Mail, Paperclip, Star, Trash2 } from 'lucide-react';
import { messageDate } from '../api';
import { Badge, IconButton } from '../design-system';
import type { Label, Thread } from '../types';

export function ThreadRow({
  thread,
  labels,
  selected,
  onSelect,
  onOpen,
  onAction,
}: {
  thread: Thread;
  /** User labels, used to name the ids on the conversation. */
  labels: Label[];
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onAction: (name: string, id: string) => void;
}) {
  const subject = thread.subject || '(no subject)';
  const starred = thread.label_ids.includes('STARRED');
  const important = thread.label_ids.includes('IMPORTANT');
  const threadLabels = labels.filter((label) => thread.label_ids.includes(label.id));
  return (
    <div className={`message-row ${thread.unread ? 'unread' : ''} ${selected ? 'selected' : ''}`}>
      <input
        type="checkbox"
        aria-label={`Select ${subject}`}
        checked={selected}
        onChange={onSelect}
      />
      <button
        className="row-star"
        title={starred ? 'Remove star' : 'Add star'}
        aria-label={`${starred ? 'Unstar' : 'Star'} ${subject}`}
        aria-pressed={starred}
        onClick={() => onAction(starred ? 'unstar' : 'star', thread.id)}
      >
        <Star size={16} className={starred ? 'star-active' : ''} />
      </button>
      <button className="row-main" onClick={onOpen}>
        <span className="row-sender">
          {thread.sender}
          {thread.count > 1 && <small>{thread.count}</small>}
        </span>
        <span className="row-content">
          {important && (
            <span className="important-marker" title="Important">
              ›
            </span>
          )}
          {threadLabels.map((label) => (
            <Badge key={label.id} className="row-label">
              {label.name}
            </Badge>
          ))}
          <strong>{subject}</strong>
          <span className="snippet"> — {thread.snippet}</span>
        </span>
        {thread.has_attachment && <Paperclip className="row-attachment" size={14} />}
        <time>{messageDate(thread.received_at)}</time>
      </button>
      <div className="row-hover-actions">
        <IconButton
          label={`Archive ${thread.subject}`}
          onClick={() => onAction('archive', thread.id)}
        >
          <Archive size={17} />
        </IconButton>
        <IconButton label={`Trash ${thread.subject}`} onClick={() => onAction('trash', thread.id)}>
          <Trash2 size={17} />
        </IconButton>
        <IconButton
          label={`Mark ${thread.subject} as ${thread.unread ? 'read' : 'unread'}`}
          onClick={() => onAction(thread.unread ? 'read' : 'unread', thread.id)}
        >
          <Mail size={17} />
        </IconButton>
      </div>
    </div>
  );
}
