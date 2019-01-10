import { RuntimeConfig } from "next/config";
import { createConnection, Connection } from "typeorm";
import { MessageStore } from "./types";
import { Message } from "shared/Message";

export class SqliteStore implements MessageStore {
  connection?: Connection;
  config: RuntimeConfig;
  constructor(config: RuntimeConfig) {
    this.config = config;
  }
  async connect(options: Object = {}) {
    this.connection = await createConnection({
      type: "sqlite",
      database: this.config.serverRuntimeConfig.sqliteDatabase,
      entities: [Message],
      synchronize: true,
      logging: false,
      ...options
    });
  }
  private getManager() {
    if (!this.connection) {
      throw new Error("Connection not established");
    }
    return this.connection.manager;
  }
  async disconnect() {}
  async addMessage(message: Pick<Message, Exclude<keyof Message, "id">>) {
    const newMessage = this.getManager().create(Message, message);
    await this.getManager().save(newMessage);
  }
  async getMessages() {
    const messages = await this.getManager().find(Message);
    return messages;
  }
  async getMessage(id: string) {
    const message = await this.getManager().findOne(Message, id);
    return message;
  }
  async deleteMessages(ids: string[]) {
    await this.getManager().delete(Message, ids);
  }
}
