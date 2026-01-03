import Database from "better-sqlite3";
import type { ParsedMail } from "mailparser";
import type { Message, MessageSummary } from "../shared/types";

const DB_PATH = process.env.SQLITE_DB || ":memory:";

const db = new Database(DB_PATH);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw TEXT NOT NULL,
    parsed TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

export function addMessage(raw: Buffer, parsed: ParsedMail): number {
  const stmt = db.prepare(
    "INSERT INTO messages (raw, parsed) VALUES (?, ?)"
  );
  const result = stmt.run(raw.toString("base64"), JSON.stringify(parsed));
  return result.lastInsertRowid as number;
}

export function getMessages(): MessageSummary[] {
  const stmt = db.prepare(
    "SELECT id, parsed, received_at FROM messages ORDER BY id DESC"
  );
  const rows = stmt.all() as { id: number; parsed: string; received_at: string }[];

  return rows.map((row) => {
    const parsed = JSON.parse(row.parsed) as ParsedMail;
    return {
      id: row.id,
      from: parsed.from?.text || "",
      to: Array.isArray(parsed.to)
        ? parsed.to.map((t) => t.text).join(", ")
        : parsed.to?.text || "",
      subject: parsed.subject || "(no subject)",
      date: parsed.date?.toISOString() || "",
      receivedAt: row.received_at,
    };
  });
}

export function getMessage(id: number): Message | null {
  const stmt = db.prepare(
    "SELECT id, raw, parsed, received_at FROM messages WHERE id = ?"
  );
  const row = stmt.get(id) as {
    id: number;
    raw: string;
    parsed: string;
    received_at: string;
  } | undefined;

  if (!row) return null;

  return {
    id: row.id,
    raw: Buffer.from(row.raw, "base64").toString("utf-8"),
    parsed: JSON.parse(row.parsed),
    receivedAt: row.received_at,
  };
}

export function deleteMessages(ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(", ");
  const stmt = db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`);
  stmt.run(...ids);
}

export function getMessageRaw(id: number): Buffer | null {
  const stmt = db.prepare("SELECT raw FROM messages WHERE id = ?");
  const row = stmt.get(id) as { raw: string } | undefined;
  if (!row) return null;
  return Buffer.from(row.raw, "base64");
}
