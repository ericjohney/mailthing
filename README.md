# Mailthing

A development SMTP mail server that catches all emails and displays them in a web UI. Perfect for testing email functionality in your applications without sending real emails.

## Features

- **SMTP Server** - Catches all emails sent to it (no authentication required)
- **Web UI** - Modern React interface with shadcn/ui components
- **Email Viewer** - View HTML, plain text, source, and attachments
- **Bulk Actions** - Select multiple emails for deletion
- **Persistent Storage** - SQLite database (in-memory or file-based)
- **Type-Safe API** - Full-stack TypeScript with tRPC

## Quick Start

```bash
# Install dependencies
bun install

# Build the frontend
bun run build

# Start the server
bun run dev
```

Then:
- **Web UI**: http://localhost:9005
- **SMTP**: Configure your app to send mail to `localhost:2500`

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `9005` | Web server port |
| `SMTP_PORT` | `2500` | SMTP server port |
| `SQLITE_DB` | `:memory:` | Database path (`:memory:` for ephemeral, or file path) |

## Usage

### Send Test Email (Python)

```python
import smtplib
from email.mime.text import MIMEText

msg = MIMEText("<h1>Hello!</h1>", "html")
msg["Subject"] = "Test Email"
msg["From"] = "sender@example.com"
msg["To"] = "recipient@example.com"

with smtplib.SMTP("localhost", 2500) as server:
    server.send_message(msg)
```

### Send Test Email (Node.js)

```javascript
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "localhost",
  port: 2500,
  secure: false,
});

await transporter.sendMail({
  from: "sender@example.com",
  to: "recipient@example.com",
  subject: "Test Email",
  html: "<h1>Hello!</h1>",
});
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Backend**: tRPC + Bun's built-in SQLite
- **Frontend**: React 18 + TanStack Query
- **UI Components**: [shadcn/ui](https://ui.shadcn.com) (Radix + Tailwind)
- **SMTP**: smtp-server + mailparser

## Docker

```bash
# Build
docker build -t mailthing .

# Run
docker run -p 9005:9005 -p 2500:2500 -v mailthing-data:/data mailthing
```

## Kubernetes / ArgoCD

Kubernetes manifests are in the `k8s/` directory:

```bash
# Apply directly
kubectl apply -k k8s/

# Or use ArgoCD
kubectl apply -f k8s/argocd-application.yaml
```

## Development

```bash
# Run with hot reload
bun run dev

# Build frontend only
bun run build

# Run UI tests
bun run test-ui.ts
```

## Project Structure

```
src/
├── index.ts              # Entry point (HTTP + SMTP servers)
├── server/
│   ├── db.ts            # SQLite database layer
│   ├── smtp.ts          # SMTP server
│   └── trpc.ts          # tRPC router
├── client/
│   ├── App.tsx          # React app
│   ├── trpc.ts          # tRPC client
│   └── components/      # UI components
└── shared/
    └── types.ts         # Shared TypeScript types
```

## License

MIT
