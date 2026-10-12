import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "./index.mjs";

const env = { INBOUND_URL: "https://receiver.example", INBOUND_TOKEN: "test-token" };

test("streams mail for any recipient domain with the original MIME and SMTP envelope", async (t) => {
  const raw = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("raw MIME")); c.close(); } });
  let rejection;
  let delivered;
  let forwarded;
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
  await worker.email({ from: "sender@example.net", to: "bcc@example.org", rawSize: 8, raw, async forward(address) { forwarded = address; }, setReject(reason) { rejection = reason; } }, env);
  assert.equal(delivered, true);
  assert.equal(forwarded, "ericjohney1@gmail.com");
  assert.equal(rejection, undefined);
});

test("Mailthing errors do not prevent Gmail forwarding", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const failure of [new Response("Redirect", { status: 302 }), new Response("Unauthorized", { status: 401 }), new Response("Unavailable", { status: 503 }), new Error("Network error")]) {
    t.mock.method(globalThis, "fetch", async () => { if (failure instanceof Error) throw failure; return failure; });
    let rejection;
    let forwarded;
    await worker.email({ from: "", to: "eric@ericj5.com", rawSize: 1, raw: "x", async forward(address) { forwarded = address; }, setReject(reason) { rejection = reason; } }, env);
    assert.equal(rejection, undefined);
    assert.equal(forwarded, "ericjohney1@gmail.com");
  }
});

test("Gmail errors do not prevent Mailthing delivery", async (t) => {
  t.mock.method(console, "error", () => {});
  let delivered;
  t.mock.method(globalThis, "fetch", async () => { delivered = true; return new Response("accepted"); });
  let rejection;
  await worker.email({ from: "sender@example.net", to: "eric@ericj5.com", rawSize: 1, raw: "x", async forward() { throw new Error("Gmail unavailable"); }, setReject(reason) { rejection = reason; } }, env);
  assert.equal(delivered, true);
  assert.equal(rejection, undefined);
});

test("rejects only when both destinations fail and logs each failure", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Mailthing unavailable"); });
  let rejection;
  await worker.email({ from: "sender@example.net", to: "eric@ericj5.com", rawSize: 1, raw: "x", async forward() { throw new Error("Gmail unavailable"); }, setReject(reason) { rejection = reason; } }, env);
  assert.match(rejection, /Neither Mailthing nor Gmail/);
  assert.deepEqual(log.mock.calls.map((call) => JSON.parse(call.arguments[0]).destination), ["mailthing", "gmail"]);
});

test("oversized messages never reach the receiver", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected fetch"); });
  const forward = t.mock.fn(() => { throw new Error("Unexpected forward"); });
  let rejection;
  await worker.email({ to: "eric@example.org", rawSize: 25 * 1024 * 1024 + 1, forward, setReject(reason) { rejection = reason; } }, env);
  assert.ok(rejection);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(forward.mock.callCount(), 0);
});
