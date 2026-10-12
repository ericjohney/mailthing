// Stream directly to Mailthing. No queues, storage bindings, or background delivery.
export default {
  async email(message, env) {
    if (message.to.split("@").at(-1).toLowerCase() !== env.MAIL_DOMAIN) {
      message.setReject("Recipient domain is not configured");
      return;
    }
    if (message.rawSize > 25 * 1024 * 1024) {
      message.setReject("Message exceeds 25 MiB");
      return;
    }
    const id = crypto.randomUUID();
    try {
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
        redirect: "error",
        signal: AbortSignal.timeout(25000),
      });
      const accepted = response.ok;
      await response.body?.cancel();
      if (!accepted) throw new Error(`Receiver returned ${response.status}`);
    } catch {
      console.error(JSON.stringify({ event: "delivery_failed", id }));
      message.setReject("Mailthing could not accept this message; please try again later");
    }
  },
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};
