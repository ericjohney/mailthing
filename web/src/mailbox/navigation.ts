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

export const folders = [
  { id: 'inbox', name: 'Inbox', icon: Inbox },
  { id: 'starred', name: 'Starred', icon: Star },
  { id: 'snoozed', name: 'Snoozed', icon: Clock3 },
  { id: 'sent', name: 'Sent', icon: Send },
  { id: 'drafts', name: 'Drafts', icon: Pencil },
  { id: 'important', name: 'Important', icon: Tag },
  { id: 'all', name: 'All mail', icon: Mail },
  { id: 'spam', name: 'Spam', icon: ShieldAlert },
  { id: 'trash', name: 'Trash', icon: Trash2 },
];
export const categories = [
  { id: 'primary', name: 'Primary', icon: Inbox },
  { id: 'promotions', name: 'Promotions', icon: Tag },
  { id: 'social', name: 'Social', icon: Users },
  { id: 'updates', name: 'Updates', icon: Bell },
];
