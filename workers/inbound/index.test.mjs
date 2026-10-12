import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./index.mjs";

const env = { INBOUND_URL: "https://receiver.example", INBOUND_TOKEN: "test-token" };

test("streams mail for any recipient domain with the original MIME and SMTP envelope", async (t) => {
  const raw = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("raw MIME")); c.close(); } });
  let rejection;
  let delivered;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(url, /^https:\/\/receiver.example\/inbound\/[\da-f-]{36}$/);
    assert.equal(options.body, raw);
    assert.equal(options.redirect, "manual");
    assert.equal(options.headers["authorization"], "Bearer test-token");
    assert.equal(options.headers["user-agent"], "Mailthing-Inbound/1.0");
    assert.equal(options.headers["x-envelope-from"], "sender@example.net");
    assert.equal(options.headers["x-envelope-to"], "bcc@example.org");
    delivered = true;
    return new Response('{"id":"accepted"}', { status: 200 });
  });
  await worker.email({ from: "sender@example.net", to: "bcc@example.org", rawSize: 8, raw, setReject(reason) { rejection = reason; } }, env);
  assert.equal(delivered, true);
  assert.equal(rejection, undefined);
});

test("receiver errors reject mail instead of acknowledging or dropping it", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const failure of [new Response("Redirect", { status: 302 }), new Response("Unauthorized", { status: 401 }), new Response("Unavailable", { status: 503 }), new Error("Network error")]) {
    t.mock.method(globalThis, "fetch", async () => { if (failure instanceof Error) throw failure; return failure; });
    let rejection;
    await worker.email({ from: "", to: "eric@ericj5.com", rawSize: 1, raw: "x", setReject(reason) { rejection = reason; } }, env);
    assert.match(rejection, /could not accept/);
  }
});

test("oversized messages never reach the receiver", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected fetch"); });
  let rejection;
  await worker.email({ to: "eric@example.org", rawSize: 25 * 1024 * 1024 + 1, setReject(reason) { rejection = reason; } }, env);
  assert.ok(rejection);
  assert.equal(fetch.mock.callCount(), 0);
});
