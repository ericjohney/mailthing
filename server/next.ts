import * as express from "express";
import * as next from "next";
import { MessageStore } from "./types";
import { apiRoutes } from "server/api";
import { RuntimeConfig } from "next/config";

const dev = process.env.NODE_ENV !== "production";
const PORT = process.env.PORT || 9005;
const app = next({ dev });
const handle = app.getRequestHandler();

export async function startServer(
  config: RuntimeConfig,
  messageStore: MessageStore
) {
  await app.prepare();
  const server = express();

  server.use("/api", apiRoutes(config, messageStore));

  server.get("/message/:id", (req, res) => {
    const actualPage = "/message";
    const queryParams = { id: req.params.id };
    app.render(req, res, actualPage, queryParams);
  });

  server.get("*", (req, res) => {
    return handle(req, res);
  });

  server.listen(PORT, (err: Error) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });

  return server;
}
