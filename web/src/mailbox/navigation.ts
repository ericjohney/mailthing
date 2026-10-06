import {
  Bell,
  Clock3,
  Inbox,
  Mail,
  Pencil,
  Send,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';
import type { Label } from '../types';

/** Mailbox views. Each is a system label, except All mail and Drafts. */
export const mailboxViews = [
  { id: 'INBOX', name: 'Inbox', icon: Inbox },
  { id: 'STARRED', name: 'Starred', icon: Star },
  { id: 'SNOOZED', name: 'Snoozed', icon: Clock3 },
  { id: 'SENT', name: 'Sent', icon: Send },
  { id: 'DRAFTS', name: 'Drafts', icon: Pencil },
  { id: 'IMPORTANT', name: 'Important', icon: Tag },
  { id: 'ALL', name: 'All mail', icon: Mail },
  { id: 'SPAM', name: 'Spam', icon: ShieldAlert },
  { id: 'TRASH', name: 'Trash', icon: Trash2 },
];
export const categories = [
  { id: 'CATEGORY_PERSONAL', name: 'Primary', icon: Inbox },
  { id: 'CATEGORY_PROMOTIONS', name: 'Promotions', icon: Tag },
  { id: 'CATEGORY_SOCIAL', name: 'Social', icon: Users },
  { id: 'CATEGORY_UPDATES', name: 'Updates', icon: Bell },
];
/** Labels that say where a conversation is, shown as chips in the reader. */
export const placeLabels = ['INBOX', 'SNOOZED', 'SENT', 'SPAM', 'TRASH'];
export const userLabels = (labels: Label[]) => labels.filter((label) => label.kind === 'user');
