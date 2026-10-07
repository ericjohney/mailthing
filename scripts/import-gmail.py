#!/usr/bin/env python3
"""Copy Gmail messages matching a Gmail search into Mailthing, keeping their state.

Reads over IMAP with an app password from GMAIL_APP_PASSWORD (prompted if unset) and
posts each message to Mailthing's /api/import with its original receipt time, Gmail
labels, and Inbox/read/starred/important/sent state. Gmail is never modified: bodies
are fetched with BODY.PEEK. Imported Gmail message ids are recorded in a state file,
so an interrupted run resumes without creating duplicates.

Gmail's inbox categories are not exposed over IMAP; Mailthing assigns its own.
"""
import argparse
import base64
import getpass
import imaplib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

GMAIL_STATE = {
    '\\Inbox': 'INBOX',
    '\\Sent': 'SENT',
    '\\Starred': 'STARRED',
    '\\Important': 'IMPORTANT',
    '\\Spam': 'SPAM',
    '\\Trash': 'TRASH',
}
# Mailthing's system label names; a Gmail label with one of these names is renamed.
RESERVED = {'inbox', 'sent', 'spam', 'trash', 'unread', 'starred', 'important',
            'snoozed', 'primary', 'promotions', 'social', 'updates'}
MAX_LABEL_BYTES = 50

parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
parser.add_argument('--user', required=True, help='Gmail address')
parser.add_argument('--query', required=True, help='Gmail search, e.g. "label:receipts after:2025/01/01"')
parser.add_argument('--url', default='https://mailthing.ericj5.com', help='Mailthing base URL')
parser.add_argument('--limit', type=int, help='Import at most this many new messages')
parser.add_argument('--dry-run', action='store_true', help='List what would be imported')
parser.add_argument('--state', type=Path, help='Resume file (default: ~/.local/state/mailthing-import/<user>.json)')
args = parser.parse_args()


def decode_mutf7(name: str) -> str:
    """IMAP mailbox names use modified UTF-7 (RFC 3501 5.1.3)."""
    def repl(match):
        chunk = match.group(1)
        if not chunk:
            return '&'
        data = chunk.replace(',', '/')
        data += '=' * (-len(data) % 4)
        return base64.b64decode(data).decode('utf-16-be')
    return re.sub(r'&([^-]*)-', repl, name)


def tokens(text: str):
    """Splits an IMAP parenthesized list of atoms and quoted strings."""
    i = 0
    while i < len(text):
        c = text[i]
        if c.isspace():
            i += 1
        elif c == '"':
            i += 1
            value = []
            while text[i] != '"':
                if text[i] == '\\':
                    i += 1
                value.append(text[i])
                i += 1
            i += 1
            yield ''.join(value)
        else:
            end = i
            while end < len(text) and not text[end].isspace():
                end += 1
            yield text[i:end]
            i = end


def parenthesized(meta: str, key: str) -> str:
    start = meta.index(key + ' (') + len(key) + 2
    depth, i = 1, start
    while depth:
        if meta[i] == '"':
            i += 1
            while meta[i] != '"':
                i += 2 if meta[i] == '\\' else 1
        elif meta[i] == '(':
            depth += 1
        elif meta[i] == ')':
            depth -= 1
        i += 1
    return meta[start:i - 1]


def user_label(name: str) -> str:
    name = decode_mutf7(name).strip()
    if name.lower() in RESERVED:
        name += ' (Gmail)'
    while len(name.encode()) > MAX_LABEL_BYTES:
        name = name[:-1]
    return name.strip()


def api(path: str, body=None):
    request = urllib.request.Request(
        args.url.rstrip('/') + path,
        data=None if body is None else json.dumps(body).encode(),
        headers={'content-type': 'application/json'},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


state_path = args.state or Path.home() / '.local/state/mailthing-import' / f'{args.user}.json'
state_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
done = set(json.loads(state_path.read_text())['imported']) if state_path.exists() else set()


def save():
    tmp = state_path.with_suffix('.tmp')
    tmp.write_text(json.dumps({'imported': sorted(done)}))
    tmp.chmod(0o600)
    tmp.replace(state_path)


max_bytes = api('/api/settings')['max_message_bytes']
password = os.environ.get('GMAIL_APP_PASSWORD') or getpass.getpass('Gmail app password: ')
imap = imaplib.IMAP4_SSL('imap.gmail.com')
imap.login(args.user, password.replace(' ', ''))
del password

# "All Mail" is localized; find it by its special-use flag.
_, boxes = imap.list()
all_mail = next(re.search(rb'"([^"]+)"$', box).group(1).decode() for box in boxes if b'\\All' in box)
imap.select(f'"{all_mail}"', readonly=True)
_, found = imap.uid('SEARCH', 'X-GM-RAW', '"' + args.query.replace('\\', '\\\\').replace('"', '\\"') + '"')
uids = found[0].split()
print(f'{len(uids)} messages match "{args.query}"; {len(done)} already imported earlier', flush=True)

imported = skipped = failed = 0
total_bytes = 0
for offset in range(0, len(uids), 200):
    chunk = b','.join(uids[offset:offset + 200])
    _, rows = imap.uid('FETCH', chunk, '(X-GM-MSGID X-GM-LABELS FLAGS INTERNALDATE RFC822.SIZE)')
    for row in rows:
        if not isinstance(row, bytes) or b'X-GM-MSGID' not in row:
            continue
        meta = row.decode('utf-8', 'replace')
        if args.limit is not None and imported >= args.limit:
            break
        gmid = re.search(r'X-GM-MSGID (\d+)', meta).group(1)
        uid = re.search(r'UID (\d+)', meta).group(1)
        size = int(re.search(r'RFC822\.SIZE (\d+)', meta).group(1))
        if gmid in done:
            continue
        flags = set(tokens(parenthesized(meta, 'FLAGS')))
        gmail_labels = list(tokens(parenthesized(meta, 'X-GM-LABELS')))
        if '\\Draft' in flags or '\\Draft' in gmail_labels:
            skipped += 1
            continue
        if size > max_bytes:
            print(f'skip {gmid}: {size} bytes exceeds Mailthing limit of {max_bytes}', flush=True)
            skipped += 1
            continue
        system = sorted({GMAIL_STATE[l] for l in gmail_labels if l in GMAIL_STATE}
                        | ({'STARRED'} if '\\Flagged' in flags else set())
                        | (set() if '\\Seen' in flags else {'UNREAD'}))
        labels = sorted({user_label(l) for l in gmail_labels if not l.startswith('\\')} - {''})
        received = int(time.mktime(imaplib.Internaldate2tuple(row)) * 1000)
        if args.dry_run:
            print(f'{gmid} {time.strftime("%Y-%m-%d", time.localtime(received / 1000))} {size}B {system} {labels}')
            imported += 1
            total_bytes += size
            continue
        _, body = imap.uid('FETCH', uid, '(BODY.PEEK[])')
        raw = next(part[1] for part in body if isinstance(part, tuple))
        try:
            api('/api/import', {
                'raw': base64.b64encode(raw).decode(),
                'received_at': received,
                'system_labels': system,
                'labels': labels,
            })
        except urllib.error.HTTPError as error:
            print(f'failed {gmid}: {error.code} {error.read().decode()[:200]}', flush=True)
            failed += 1
            continue
        done.add(gmid)
        save()
        imported += 1
        total_bytes += size
        if imported % 25 == 0:
            print(f'{imported} imported', flush=True)
    if args.limit is not None and imported >= args.limit:
        break

imap.logout()
verb = 'would import' if args.dry_run else 'imported'
print(f'{verb} {imported} ({total_bytes / 1e6:.1f} MB), skipped {skipped}, failed {failed}')
sys.exit(1 if failed else 0)
