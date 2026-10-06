export interface Account {
  name: string;
  email: string;
}
export interface Label {
  id: string;
  name: string;
  color: string;
}
export interface Settings {
  account: Account;
  labels: Label[];
  counts: Record<string, { total: number; unread: number }>;
  outbound_configured: boolean;
  smtp_port: number;
  max_message_bytes: number;
}
export interface Thread {
  id: string;
  subject: string;
  sender: string;
  sender_email: string;
  snippet: string;
  received_at: number;
  count: number;
  unread: number;
  starred: boolean;
  important: boolean;
  has_attachment: boolean;
  category: string;
  labels: string;
}
export interface Message {
  id: string;
  thread_id: string;
  message_id: string;
  subject: string;
  sender: string;
  sender_email: string;
  recipients: string;
  cc: string;
  envelope_to: string;
  text: string;
  html: string;
  received_at: number;
  is_read: boolean;
  starred: boolean;
  important: boolean;
  folder: string;
  category: string;
  snoozed_until: number | null;
}
export interface Attachment {
  id: string;
  message_id: string;
  name: string;
  content_type: string;
  size: number;
}
export interface Conversation {
  messages: Message[];
  attachments: Attachment[];
  labels: Label[];
}
export interface DraftAttachment {
  name: string;
  content_type: string;
  data: string;
}
export interface Draft {
  id: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  in_reply_to: string;
  attachments: DraftAttachment[];
  updated_at: number;
}
export interface Rule {
  id: string;
  name: string;
  field: string;
  contains: string;
  action: string;
  value: string;
  enabled: boolean;
}
export interface PipelineStatus {
  counts: Record<string, number>;
  average_ms: number;
  stages: string[];
  concurrency: number;
  failures: { id: string; error: string; received_at: number; kind: string }[];
}
export interface Route {
  folder: string;
  label?: string;
  thread?: string;
}
export const emptyDraft = (): Draft => ({
  id: crypto.randomUUID(),
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  body: '',
  in_reply_to: '',
  attachments: [],
  updated_at: Date.now(),
});
