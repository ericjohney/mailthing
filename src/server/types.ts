import { Message } from "shared/Message";

export interface RuntimeConfig {
  serverRuntimeConfig: {
    sqliteDatabase: string;
    emailOverride: string;
  };
}

export interface MessageStore {
  connect: (options: Object) => Promise<any>;
  disconnect: (options: Object) => Promise<any>;
  addMessage: (
    message: Pick<Message, Exclude<keyof Message, "id">>
  ) => Promise<any>;
  getMessages: () => Promise<Message[]>;
  getMessage: (id: string) => Promise<Message | undefined>;
  deleteMessages: (ids: string[]) => Promise<any>;
}
