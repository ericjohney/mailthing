import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { addMessage } from "./db";

const SMTP_PORT = parseInt(process.env.SMTP_PORT || "2500", 10);

export function startSmtpServer(): SMTPServer {
  const server = new SMTPServer({
    logger: true,
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];

      stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on("end", async () => {
        const raw = Buffer.concat(chunks);
        try {
          const parsed = await simpleParser(raw);
          const id = addMessage(raw, parsed);
          console.log(`[SMTP] Received message #${id}: ${parsed.subject}`);
        } catch (err) {
          console.error("[SMTP] Failed to parse message:", err);
        }
        callback();
      });
    },
  });

  server.listen(SMTP_PORT, () => {
    console.log(`[SMTP] Server listening on port ${SMTP_PORT}`);
  });

  server.on("error", (err) => {
    console.error("[SMTP] Server error:", err);
  });

  return server;
}
