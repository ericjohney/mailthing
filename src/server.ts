import "reflect-metadata";
import { startServer } from "server/next";
import { SmtpServer } from "server/smtp";
import { SqliteStore } from "server/sqliteStore";
import getConfig from "next/config";

async function main() {
  const config = getConfig();

  const store = new SqliteStore(config);
  await store.connect();

  const smtpServer = new SmtpServer(store);
  smtpServer.start();

  startServer(config, store);
}

main();
