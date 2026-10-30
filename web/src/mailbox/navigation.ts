import {
  Clock3,
  Inbox,
  Mail,
  MailOpen,
  Pencil,
  Send,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import type { Label } from '../types';

/** Mailbox views. Each is a system label, except All mail and Drafts. */
export const mailboxViews = [
  { id: 'INBOX', name: 'Inbox', icon: Inbox },
  { id: 'UNREAD', name: 'Unread', icon: MailOpen },
  { id: 'STARRED', name: 'Starred', icon: Star },
  { id: 'SNOOZED', name: 'Snoozed', icon: Clock3 },
  { id: 'SENT', name: 'Sent', icon: Send },
  { id: 'DRAFTS', name: 'Drafts', icon: Pencil },
  { id: 'IMPORTANT', name: 'Important', icon: Tag },
  { id: 'ALL', name: 'All mail', icon: Mail },
  { id: 'SPAM', name: 'Spam', icon: ShieldAlert },
  { id: 'TRASH', name: 'Trash', icon: Trash2 },
];
/** Labels that say where a conversation is, shown as chips in the reader. */
export const placeLabels = ['INBOX', 'SNOOZED', 'SENT', 'SPAM', 'TRASH'];
export const userLabels = (labels: Label[]) => labels.filter((label) => label.kind === 'user');
