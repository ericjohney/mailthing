// Stream directly to Mailthing. No queues, storage bindings, or background delivery.
export default {
  async email(message, env) {
    if (message.rawSize > 25 * 1024 * 1024) {
      message.setReject("Message exceeds 25 MiB");
      return;
    }
    const id = crypto.randomUUID();
    const results = await Promise.allSettled([
      deliverToMailthing(message, env, id),
      Promise.resolve().then(() => message.forward("ericjohney1@gmail.com")),
    ]);
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        console.error(JSON.stringify({ event: "delivery_failed", id, destination: index === 0 ? "mailthing" : "gmail" }));
      }
    }
    // A successful copy must not be rejected because the other destination failed.
    if (results.every((result) => result.status === "rejected")) {
      message.setReject("Neither Mailthing nor Gmail could accept this message; please try again later");
    }
  },
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};

async function deliverToMailthing(message, env, id) {
  const response = await fetch(`${env.INBOUND_URL}/inbound/${id}`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.INBOUND_TOKEN}`,
      "content-type": "message/rfc822",
      "user-agent": "Mailthing-Inbound/1.0",
      "x-envelope-from": message.from,
      "x-envelope-to": message.to,
    },
    body: message.raw,
    redirect: "manual",
    signal: AbortSignal.timeout(25000),
  });
  const accepted = response.ok;
  await response.body?.cancel();
  if (!accepted) throw new Error(`Receiver returned ${response.status}`);
}
