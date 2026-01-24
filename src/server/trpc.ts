import { initTRPC } from "@trpc/server";
import { z } from "zod";
import {
  getMessages,
  getMessage,
  deleteMessages,
  getMessageRaw,
} from "./db";

const t = initTRPC.create();

export const appRouter = t.router({
  messages: t.router({
    list: t.procedure.query(() => {
      return getMessages();
    }),

    get: t.procedure.input(z.object({ id: z.number() })).query(({ input }) => {
      return getMessage(input.id);
    }),

    getHtml: t.procedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => {
        const msg = getMessage(input.id);
        return msg?.parsed.html || msg?.parsed.textAsHtml || null;
      }),

    delete: t.procedure
      .input(z.object({ ids: z.array(z.number()) }))
      .mutation(({ input }) => {
        deleteMessages(input.ids);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
