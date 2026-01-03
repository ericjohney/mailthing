# Mailthing - Clean Room Specification

This document describes the functional requirements for a development SMTP mail catcher application. It is intended for clean room reimplementation and focuses on **what** the application does, not how.

---

## Overview

**Purpose**: A development tool that catches all outgoing emails from applications and displays them in a web UI for inspection and debugging.

**Primary Use Case**: Developers configure their applications to send email through this tool's SMTP server, then view, debug, and optionally forward those emails via a web interface.

---

## Functional Components

### 1. SMTP Server

**Purpose**: Accept incoming email from applications

**Requirements**:
- Listen on a configurable port (default: 2500)
- Accept any SMTP connection (no authentication required)
- Capture the complete raw email data (including headers, body, attachments)
- Parse the email to extract structured data
- Store both raw and parsed versions for later retrieval

**Parsed Email Data**:
- From address (name and email)
- To address(es) (name and email)
- Subject line
- Date/timestamp
- Plain text body
- HTML body
- Attachments (filename, content type, binary data)

---

### 2. Web Server

**Purpose**: Serve the web UI and provide API endpoints

**Requirements**:
- Listen on a configurable port (default: 9005)
- Serve the web application
- Provide REST API endpoints

---

### 3. Data Storage

**Purpose**: Persist captured emails

**Requirements**:
- Store messages with:
  - Unique identifier (auto-incrementing integer)
  - Raw email data (binary blob)
  - Parsed email data (structured JSON)
- Support in-memory storage for ephemeral use
- Support file-based storage for persistence across restarts
- Configurable storage location via environment variable

---

### 4. REST API

#### `GET /api/messages`
- Returns list of all captured emails
- Response: `{ messages: Message[] }`

#### `GET /api/message/:id`
- Returns a single message by ID
- Response: `{ message: Message }`

#### `GET /api/message/:id/html`
- Returns the HTML body of a message (raw HTML, not JSON)
- Used for iframe embedding
- Returns 404 if message not found

#### `POST /api/messages/send`
- Forward selected messages to real recipients
- Request body: `{ messageIds: number[] }`
- Uses system sendmail to actually deliver the email
- Optional: Override recipient via configuration

#### `POST /api/messages/delete`
- Delete selected messages from storage
- Request body: `{ messageIds: number[] }`

---

### 5. Web UI

#### Page: Message List (Index)

**Purpose**: Display all captured emails in a list

**Features**:
- Table view showing: Date, From, Subject
- Newest messages displayed first
- Checkbox selection for each message
- "Select all" checkbox with indeterminate state
- Refresh button to reload messages
- Clicking a row navigates to message detail

**Bulk Actions** (shown when messages selected):
- Send: Forward selected messages via sendmail
- Delete: Remove selected messages from storage

#### Page: Message Detail

**Purpose**: View complete details of a single email

**Features**:
- Header showing subject and back navigation
- Tab-based interface with four views:

**Tab 1: HTML View**
- Display email headers (To, From, Subject, Date)
- Render HTML body in isolated iframe
- Date formatted in short locale format

**Tab 2: Text View**
- Display plain text body of the email
- Preformatted text display

**Tab 3: Source View**
- Display raw email source (MIME format)
- Useful for debugging email formatting issues

**Tab 4: Attachments View**
- List all attachments with filenames
- Click to download attachment as file
- Preserve original filename and content type

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 9005 | Web server port |
| `SMTP_PORT` | 2500 | SMTP server port |
| `SQLITE_DB` | `:memory:` | Database path (`:memory:` for ephemeral) |
| `EMAIL_OVERRIDE` | (none) | Override recipient when forwarding emails |

---

## User Workflows

### Workflow 1: Capture and View Emails
1. Developer configures their app to use `localhost:2500` as SMTP server
2. App sends email(s)
3. Developer opens web UI at `http://localhost:9005`
4. Developer sees email(s) in list
5. Developer clicks to view full email details
6. Developer switches between HTML/Text/Source/Attachments tabs

### Workflow 2: Forward Email for Real Delivery
1. Developer selects email(s) in the list
2. Developer clicks Send button
3. System forwards email(s) using sendmail
4. Email delivered to original recipient (or override if configured)

### Workflow 3: Clean Up
1. Developer selects email(s) in the list
2. Developer clicks Delete button
3. Emails removed from storage

---

## UI/UX Guidelines

### Visual Design
- Material Design aesthetic
- Clean, minimal interface
- Primary color: Blue-purple (#556cd6)
- Secondary color: Teal (#19857b)

### Layout
- Paper/card-based containers
- App bar for actions
- Table for message list
- Tabs for message detail views

### Interactions
- Row click navigates to detail
- Checkbox click stops propagation (doesn't navigate)
- Actions appear only when messages are selected
- Refresh via button or page reload

---

## Technical Constraints

### SMTP Server
- Must accept connections without TLS (development use)
- Must accept any authentication credentials
- Must handle concurrent connections

### Email Parsing
- Must support MIME multipart messages
- Must extract inline images and attachments
- Must preserve original encoding

### Web UI
- Must work in modern browsers
- HTML email display must be sandboxed (iframe)
- Attachments download must work client-side

### Data Integrity
- Raw email must be preserved exactly as received
- Must not modify email content during storage/retrieval

---

## Out of Scope

The following are explicitly NOT requirements:
- User authentication for web UI
- TLS/SSL for SMTP
- Email search/filtering
- Email editing
- Multiple mailbox support
- Email retention policies
- Production email delivery
- Mobile-optimized UI (desktop-focused development tool)

---

## Message Data Structure

```
Message {
  id: integer (auto-generated)
  raw: binary (complete SMTP message)
  parsed: {
    from: { text: string, name?: string, address?: string }
    to: { text: string, name?: string, address?: string }
    subject: string
    date: datetime
    text: string (plain text body)
    html: string (HTML body)
    attachments: [
      {
        filename: string
        contentType: string
        content: binary
      }
    ]
  }
}
```

---

## API Response Examples

### GET /api/messages
```json
{
  "messages": [
    {
      "id": 1,
      "raw": "<binary>",
      "parsed": {
        "from": { "text": "sender@example.com" },
        "to": { "text": "recipient@example.com" },
        "subject": "Test Email",
        "date": "2024-01-15T10:30:00.000Z",
        "text": "Plain text content",
        "html": "<html>...</html>",
        "attachments": []
      }
    }
  ]
}
```

### GET /api/message/1/html
```html
<html>
<body>
  <h1>Email content here</h1>
</body>
</html>
```

---

## Summary

Mailthing is a simple, focused tool for development email testing:

1. **Catch**: SMTP server captures all email
2. **Store**: SQLite persists messages (optionally in-memory)
3. **View**: Web UI displays emails with multiple viewing options
4. **Forward**: Optionally send captured emails to real recipients
5. **Clean**: Delete emails when done testing

The tool prioritizes simplicity and developer experience over features.
