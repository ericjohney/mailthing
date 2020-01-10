import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import { MessageStore } from "server/types";

export class SmtpServer {
  server: SMTPServer;
  messageStore: MessageStore;

  constructor(store: MessageStore) {
    this.messageStore = store;
    this.server = new SMTPServer({
      logger: true,
      authOptional: true,
      hideSTARTTLS: true,
      onData: (stream, _, callback) => {
        let buffers: any = [];
        stream.on("data", data => buffers.push(data));
        stream.on("end", () => {
          const rawMessage = Buffer.concat(buffers);
          this.messageRecieved(rawMessage);
          callback();
        });
      }
    });
  }

  private async messageRecieved(raw: Buffer) {
    const parsed = await simpleParser(raw);
    const message = {
      raw,
      parsed
    };
    await this.messageStore.addMessage(message);
  }

  start() {
    this.server.listen(2500);
  }
}
