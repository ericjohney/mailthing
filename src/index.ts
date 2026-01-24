import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./server/trpc";
import { startSmtpServer } from "./server/smtp";
import { getMessage } from "./server/db";

const PORT = parseInt(process.env.PORT || "9005", 10);

// Start SMTP server
startSmtpServer();

// Start HTTP server
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // tRPC API
    if (url.pathname.startsWith("/api/trpc")) {
      return fetchRequestHandler({
        endpoint: "/api/trpc",
        req,
        router: appRouter,
        createContext: () => ({}),
      });
    }

    // HTML content endpoint for iframe
    if (url.pathname.startsWith("/api/message/") && url.pathname.endsWith("/html")) {
      const id = parseInt(url.pathname.split("/")[3], 10);
      const msg = getMessage(id);
      if (!msg) {
        return new Response("Not found", { status: 404 });
      }
      const html = msg.parsed.html || msg.parsed.textAsHtml || "<pre>" + (msg.parsed.text || "") + "</pre>";
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Static files
    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(`dist/public${filePath}`);

    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback
    const indexFile = Bun.file("dist/public/index.html");
    if (await indexFile.exists()) {
      return new Response(indexFile);
    }

    // Dev mode: serve from src
    const devFile = Bun.file(`src/client${filePath}`);
    if (await devFile.exists()) {
      return new Response(devFile);
    }

    const devIndex = Bun.file("src/client/index.html");
    if (await devIndex.exists()) {
      return new Response(devIndex);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`[HTTP] Server listening on http://localhost:${PORT}`);
