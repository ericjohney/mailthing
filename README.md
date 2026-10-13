# Mailthing

A personal catch-all mail server and a Gmail-style web inbox, rebuilt in Rust and React. Mail is durably queued, processed, and displayed from SQLite. The application starts with an empty mailbox; it never substitutes sample messages for database results.

## iOS app

The native [Mailthing iOS app](ios/README.md) provides a Gmail-style SwiftUI inbox,
conversations, attachments, drafts, and new-message push notifications. It connects
to the same Rust API and private mailbox. See the iOS guide for simulator testing,
APNs configuration, and TestFlight releases.

## Run locally

Install current stable Rust (with `rustfmt` and `clippy`) and Node.js 24. Rust compilation also needs a C compiler; on Debian/Ubuntu, install `build-essential`.

```sh
cp .env.example .env
npm ci
npm run build
cargo run --bin mailthing
```

Open **http://127.0.0.1:9005**. Incoming SMTP listens on **port 2500**. Configure your mailbox name and sending address in **Settings → General**. `MAILBOX_NAME` and `MAILBOX_EMAIL` set the initial defaults only; later changes persist in the database.

For frontend development, keep the Rust server running and run `npm run dev` in another terminal. Open **http://127.0.0.1:5173**; Vite proxies `/api` to the Rust server. Restart the Rust server after backend changes.

Send a test email using Python's standard library:

```sh
python3 scripts/send-example.py
```

To add an optional collection of fictional example messages to a local instance, run `python3 scripts/send-example.py --demo`. This is explicit, uses SMTP, and goes through the same queue and processing pipeline as other incoming mail.

## Mailbox features

- Threaded conversations; HTML, plain-text, original source, and downloadable attachments.
- Inbox categories: Primary, Promotions, Social, and Updates.
- Gmail-style labels instead of folders: a conversation can carry any number of labels, and archiving simply removes Inbox.
- Stars, importance, read/unread, archive, snooze, Spam, Trash, and permanent deletion from Trash.
- Custom labels and ordered filters configured in Settings.
- Compose, reply, reply-all, forward, Cc/Bcc, attachments, and durable drafts.
- Full-text search, bulk actions, pagination, live updates, keyboard shortcuts, and mobile layouts.
- Crisp monochrome appearance with light, dark, and device-following themes.
- `.eml` import and a live processing dashboard with failed-receipt retry.

Search examples:

```text
from:sam@example.net subject:"weekend plans"
is:unread has:attachment
label:receipts category:updates
after:2026-01-01 before:2026-02-01
coffee in:anywhere
```

Dates are evaluated at midnight UTC. Search excludes Spam and Trash unless `in:anywhere`, `in:spam`, or `in:trash` is included. `label:` matches label names case-insensitively, with hyphens standing in for spaces. Category assignment uses lightweight heuristics by default, or an optional LiteLLM classifier when configured. Your filters override either classifier. Existing spam flags are honored; the server does not claim to perform antivirus scanning or statistical spam detection.

The React interface uses a shared [design system](web/src/design-system/README.md). Semantic palette, typography, spacing, and control tokens live in `web/src/design-system/tokens.css`; reusable controls share hover, focus, and disabled behavior. Screen styles consume those tokens, so new palettes or density changes can share the same components. Appearance is configurable in Settings → General.

## Sending mail

Add your relay credentials to `.env` and restart:

```dotenv
SMTP_RELAY_HOST=smtp.example.com
SMTP_RELAY_PORT=587
SMTP_RELAY_USER=your-user
SMTP_RELAY_PASSWORD=your-password
SMTP_RELAY_SECURITY=starttls
```

Use `tls` for implicit TLS (usually port 465). `plain` is intended for a trusted local relay. Outbound mail is disabled until a relay host is configured. Sent messages are saved only after the relay accepts them, and failures retain the draft. Cc and Bcc recipients are included in the SMTP envelope; Bcc is removed from delivered headers. The receiving server never forwards messages automatically, so it cannot act as an open relay.

If the process stops after a relay has accepted a message but before its database commit, the raw outgoing receipt remains in the jobs table with an explicit ambiguous-delivery error. Check relay delivery before manually resending; Mailthing never automatically retries ambiguous outbound sends.

## Receiving internet mail

Cloudflare Email Routing can deliver directly over HTTPS using the Worker in
`workers/inbound`. Set a random `INBOUND_TOKEN` (at least 32 characters) in both
Mailthing's environment and the Worker's secret bindings. Mailthing then opens
a separate HTTP listener on `INBOUND_PORT` (default 9006). Expose only that
listener through Cloudflare Tunnel; it serves token-authenticated
`POST /inbound/<UUID>` requests containing raw MIME and `X-Envelope-From` /
`X-Envelope-To` headers, and never serves the mailbox UI or administrative API.
Receipts are acknowledged after the existing SQLite job queue saves the mail;
reusing a delivery UUID acknowledges the original receipt without duplicating it.

The Worker streams mail directly to this listener and also forwards a copy to
the verified Cloudflare destination `ericjohney1@gmail.com`. Both deliveries are
attempted independently; a failed destination is logged, and the message is
rejected only if both destinations fail. There is no Cloudflare outage buffer
or automatic retry of a failed copy. It uses no Cloudflare storage or queues
and runs on the Workers Free plan, subject to that plan's limits.
Configure the domain's catch-all rule to the
`mailthing-inbound` Worker only after verifying the authenticated receiver.
The web inbox can remain private on Tailscale. Run the Worker checks with
`node --test workers/inbound/index.test.mjs`.

The owner's deployment routes all incoming `@ericj5.com` and `@ericjohney.com`
mail through `mailthing-inbound` to `https://mail-ingest.ericj5.com`, retaining
the Gmail copy described above. Both domains use Cloudflare Email Routing's
MX records and SPF (`v=spf1 include:_spf.mx.cloudflare.net ~all`). Catch-all
rules are managed through the Cloudflare API; pushing this repository does
not update those rules or redeploy the Worker.

For your domain, point its MX record to the hostname of this server, give that hostname an A/AAAA record, and make TCP **port 25** reachable. Set `SMTP_PORT=25` or map external port 25 to the application's unprivileged SMTP port. Ports 2500 and 587 are not used by external MX senders. This is a single-owner catch-all: mail addressed to any valid recipient at this server enters this mailbox.

Set `SMTP_TLS_CERT` and `SMTP_TLS_KEY` to PEM files to advertise STARTTLS on incoming SMTP. Use your outbound relay's verified domain and SPF/DKIM setup for outbound deliverability. Mailthing provides SMTP receipt and its own web mailbox; it does not implement IMAP/POP3, direct-to-MX outbound delivery, or a complete Gmail service.

The web interface defaults to localhost and has no sign-in, so anyone who can reach it can read and send mail. Do not expose `WEB_HOST` publicly without putting it behind your own access control (VPN, SSH tunnel, or an authenticating reverse proxy). Cross-site mutations are rejected. Email HTML retains author styles, tables, and image URLs while removing scripts, event handlers, forms, embedded frames, and unsafe link URLs. It must render only inside the isolated, script-disabled email document, never in the application's DOM. Its CSP blocks external stylesheets, fonts, and other active resources. Remote images (including tracking pixels and CSS backgrounds) are blocked until you choose **Show images** for that message; requests then go directly to the image host without a referrer. Both clients fit fixed-width email layouts and expand to the complete message height. Existing messages render from their saved MIME originals without reimporting or modifying the database.

## Labels

All mailbox state is stored as labels on individual messages, following Gmail's model. There are no folders. Built-in system labels use Gmail's ids: `INBOX`, `SENT`, `SPAM`, `TRASH`, `UNREAD`, `STARRED`, `IMPORTANT`, `SNOOZED`, and `CATEGORY_PERSONAL`/`PROMOTIONS`/`SOCIAL`/`UPDATES`. Your own labels sit alongside them. A conversation appears in every view whose label any of its messages carries.

- **Archive** removes `INBOX`. **All mail** shows everything outside Spam and Trash.
- **Trash** and **Spam** add their label and remove `INBOX`. Your own labels are kept but hidden until the conversation is moved back to the inbox.
- **Snooze** swaps `INBOX` for `SNOOZED`, and the server adds `INBOX` back when the snooze ends.
- Sent mail carries only `SENT`, so replying never moves a conversation.

System labels can't be renamed, deleted, or shadowed by a user label with the same name.

## Importing mail

`POST /api/import` queues one message through the same pipeline as SMTP mail. The body is JSON with `raw`, the base64-encoded RFC 822 message. Optional fields carry the state the message had in another mailbox, such as Gmail:

```json
{
  "raw": "<base64>",
  "received_at": 1700000000000,
  "system_labels": ["INBOX", "UNREAD", "STARRED"],
  "labels": ["Receipts", "Travel"]
}
```

`received_at` is the original receipt time in Unix milliseconds; it orders and threads the message instead of the import time. `system_labels` replaces the state labels new mail would get, and may contain `INBOX`, `SENT`, `SPAM`, `TRASH`, `UNREAD`, `STARRED`, and `IMPORTANT`; an empty list imports the message archived and read. `labels` are your own label names, matched case-insensitively and created when missing. Filter labels and the inbox category still apply; omitted fields behave like newly received mail. Import does not detect duplicates, so an importer must track what it has already sent.

`scripts/import-gmail.py` copies mail matching a Gmail search over IMAP, using an app password from `GMAIL_APP_PASSWORD` (prompted if unset). It keeps Gmail's receipt time, labels, and Inbox/read/starred/important/sent state, never modifies Gmail, skips drafts and oversized messages, and records imported Gmail ids under `~/.local/state/mailthing-import/` so re-runs resume without duplicates. Run it with `--dry-run` first to see the count and size:

```sh
python3 scripts/import-gmail.py --user you@gmail.com --query 'newer_than:2m' --url http://127.0.0.1:9005 --dry-run
```

Gmail's inbox tabs are not exposed over IMAP, so Mailthing assigns its own categories.

## LLM sorting and tag memory

Set these server environment variables together to enable sorting through LiteLLM (or another OpenAI-compatible proxy):

```dotenv
LLM_BASE_URL=http://litellm.apps.svc.cluster.local:4000/v1
LLM_API_KEY=<private proxy key>
LLM_MODEL=gpt-6-luna
LLM_TIMEOUT_SECONDS=30
LLM_SPAM_THRESHOLD=0.95
```

`LLM_MODEL` is the exact alias advertised by your proxy; it is never hardcoded in the sorter. Keep the key in your deployment's secret store. Leaving all three connection variables unset disables LLM sorting; incomplete configuration fails startup. The timeout is configurable from 1–120 seconds.

The classifier chooses one inbox category and may add your custom labels. **Settings → Sorting memory** stores editable guidance for each category and label. New custom labels become eligible for automatic sorting after you add guidance or explicitly apply them to a conversation. Applying/removing labels and moving conversations to a category remembers positive/negative examples. Each label retains at most 12 message examples; the four most recent are supplied to the model. You can inspect recent examples or clear all examples for a label in Settings. Deleting a message or label also deletes its associated examples. Model predictions, imports, and automatic filters never teach the memory; only your explicit corrections do. Guidance is not automatically rewritten by the model.

The same request returns an independent spam verdict with model-reported confidence. Mail moves to **Spam** only when the model says it is spam and confidence meets `LLM_SPAM_THRESHOLD` (default 0.95; configurable from 0.5–1.0). These scores are model estimates, not calibrated probabilities. Uncertain mail stays in the inbox, and ordinary promotions/newsletters are legitimate unless your guidance or corrections say otherwise. Nothing is automatically deleted. Provider failures or invalid verdicts retain existing heuristic state.

**Mark as spam** and **Not spam** update the separate Spam memory in Settings. Moving existing spam back to the inbox also records a not-spam correction, including from iOS. Moving ordinary archived mail to the inbox does not teach spam detection. Spam memory retains up to 12 spam and 12 not-spam examples, and supplies the two most recent of each to the model so both kinds of corrections remain represented. Automatic decisions, spam headers, imports and filters never teach this memory. A **Never mark as spam** filter removes Spam and restores Inbox after classification; filters run in order, so later matching rules still win. Existing historical Spam decisions are not automatically retrained or revisited.

Requests include sender, subject, selected mailing-list headers, and at most 6,000 characters of plain-text body, plus label guidance and bounded example excerpts. Attachments and raw HTML are not sent. Treat the chosen provider as a recipient of these excerpts. Mail content is explicitly treated as untrusted data; the classifier has no tools and its output can only assign known categories, eligible custom labels, and a validated spam verdict. Mail already flagged as Spam and sent mail skip classification. Requests stream for subscription-backed proxy compatibility, with bounded responses and strict result validation. Timeouts, invalid output, and provider failures keep the heuristic result and log a warning without exposing provider response bodies or keys. Mailbox rules and imported state still run afterward and take precedence.

Sorting applies to subsequently processed incoming mail and imports; existing stored mail is not reclassified. Successful model decisions are recorded in `sorting_results` alongside the final message transaction for troubleshooting.

## Storage and processing architecture

```text
SMTP DATA / .eml import
        ↓
durable SQLite job → SMTP 250 acknowledgment
        ↓
bounded worker pool (blocking MIME work off the async runtime)
        ↓
Parse MIME → Sanitize content → Categorize → Apply mailbox rules
        ↓
atomic message + attachments + labels + job-completion transaction
        ↓
SQLite / FTS5 → Rust API → live React inbox
```

SQLite uses WAL, full synchronization, indexed mailbox queries, and FTS5. Writes that resolve conversation threads use `BEGIN IMMEDIATE` so concurrent processing cannot fail when upgrading a read transaction to a write. Workers claim jobs atomically, retry failed incoming receipts up to three times, and preserve failed raw mail. On restart, unfinished incoming jobs return to the queue. SMTP acknowledges only after the original receipt has been saved; processing cannot silently lose an acknowledged email. Permanent message deletion also deletes its attachments and search entries.

The `Stage` trait in **`server/src/pipeline.rs`** is the extension point. Add a stage implementation and include it in `Pipeline::default()` to change the pipeline. Stages transform a `PipelineContext`; database persistence stays outside the transformation chain. Unit tests can run stages without SMTP or a database. UI-configured filters use the last stage, so common mailbox changes require no code. Database changes belong in a new numbered migration in `server/migrations`; applied migrations are recorded and checksum-checked by SQLx.

`PIPELINE_CONCURRENCY` defaults to 4 and is bounded to 1–32. `MAX_MESSAGE_BYTES` defaults to 25 MiB. Incoming SMTP limits concurrent sessions and recipient counts, has bounded line lengths, and times out idle sessions. Message threading prefers `References`/`In-Reply-To`, then uses normalized subjects and participants for recent conversations.

One process owns a database. Run one Mailthing instance per database because startup recovery requeues interrupted claims. Completed job payloads are cleared once the original is stored with the message. Back up SQLite using its backup API or stop the server before copying the database; do not copy only the main database file while WAL writes are active. The default database is **`data/mailthing.db`** and survives restarts.

## Production and Docker

```sh
npm run build
cargo build --locked --release
./target/release/mailthing
```

Or with Docker:

```sh
docker compose up --build -d
```

The container runs as an unprivileged user and stores mail in a named volume. The supplied Compose file exposes the web app only on localhost and SMTP on port 2500. Adjust the port mapping for an actual MX deployment and mount certificate files if using incoming STARTTLS. A `/health` endpoint supports container liveness checks.

## Tests

```sh
npm run check
npx playwright install --with-deps chromium
npm run test:e2e
```

`npm run check` builds/types-checks the web app, runs React interaction tests, checks Rust formatting and Clippy, and runs Rust integration tests. Server tests use isolated temporary databases and local SMTP sockets. They cover MIME decoding, HTML safety, attachments, filters, threading, recovery, idempotent persistence, burst concurrency, SMTP catch-all receipt and size limits, cross-site mutation rejection, search, snooze, bulk actions, draft retention, and outbound delivery with attachments and Bcc.

The browser test starts its own Rust server and temporary database. It covers sign-in, pipeline import/live arrival, starring, reading/replying, saved drafts, archive/search, configuration, and a mobile compose view. GitHub Actions runs all checks.

## Configuration reference

See **`.env.example`** for every supported setting. Mailbox identity, labels, and filters are stored in SQLite and editable in the app. Server binding, storage location, TLS, relay credentials, worker count, and message limits are environment configuration.
