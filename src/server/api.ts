import * as express from "express";
import * as bodyParser from "body-parser";
import * as nodemailer from "nodemailer";
import { MessageStore, RuntimeConfig } from "server/types";

export function apiRoutes(
  { serverRuntimeConfig }: RuntimeConfig,
  messageStore: MessageStore
): express.Router {
  const api = express.Router();

  api.use(bodyParser.json());

  api.get("/messages", async (_, res) => {
    const messages = await messageStore.getMessages();
    res.send({ messages });
  });

  api.get("/message/:id", async (req, res) => {
    const message = await messageStore.getMessage(req.params.id);
    res.send({ message });
  });

  api.get("/message/:id/html", async (req, res) => {
    const message = await messageStore.getMessage(req.params.id);
    if (!message) {
      return res.status(404).send();
    }
    res.send(message.parsed.html);
  });

  api.post("/messages/send", async (req, res) => {
    const { messageIds } = req.body;
    const promises = messageIds.map(async (id: string) => {
      const message = await messageStore.getMessage(id);
      if (message) {
        let transporter = nodemailer.createTransport({
          sendmail: true,
          newline: "unix",
          path: "/usr/sbin/sendmail"
        });
        let info = await transporter.sendMail({
          raw: message.raw,
          envelope: {
            to: serverRuntimeConfig.emailOverride
          }
        });
        console.log("sent message info", info);
        transporter.close();
      }
    });
    await promises;

    res.send();
  });

  api.post("/messages/delete", async (req, res) => {
    const { messageIds } = req.body;
    await messageStore.deleteMessages(messageIds);

    res.send();
  });

  return api;
}
