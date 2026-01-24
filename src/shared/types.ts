import type { ParsedMail } from "mailparser";

export interface Message {
  id: number;
  raw: string;
  parsed: ParsedMail;
  receivedAt: string;
}

export interface MessageSummary {
  id: number;
  from: string;
  to: string;
  subject: string;
  date: string;
  receivedAt: string;
}
