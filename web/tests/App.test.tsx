import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { ThemeProvider } from '../src/design-system';
import type { Settings, Thread } from '../src/types';

const settings: Settings = {
  account: { name: 'Alex Morgan', email: 'alex@example.com' },
  labels: [{ id: 'work', name: 'Work', color: '#2a6b53' }],
  counts: { inbox: { total: 1, unread: 1 }, drafts: { total: 0, unread: 0 } },
  outbound_configured: false,
  smtp_port: 2500,
  max_message_bytes: 26214400,
};
const thread: Thread = {
  id: 'thread-1',
  subject: 'Weekend plans',
  sender: 'Sam Rivera',
  sender_email: 'sam@example.net',
  snippet: 'Coffee on Saturday?',
  received_at: Date.now(),
  count: 1,
  unread: 1,
  starred: false,
  important: false,
  has_attachment: false,
  category: 'primary',
  labels: '',
};
let calls: { path: string; method: string; body: any }[];
let mailbox: Thread[];
beforeEach(() => {
  calls = [];
  mailbox = [{ ...thread }];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, method, body });
      let data: any = {};
      if (path === '/api/settings') data = method === 'PUT' ? body : settings;
      else if (path.startsWith('/api/threads?')) data = { threads: mailbox, total: mailbox.length };
      else if (path === '/api/actions') {
        if (body.action === 'archive') mailbox = [];
        data = { ok: true };
      } else if (path === '/api/drafts') data = method === 'POST' ? body : [];
      else if (path === '/api/threads/thread-1')
        data = {
          messages: [
            {
              id: 'message-1',
              thread_id: 'thread-1',
              message_id: '<1@example.net>',
              subject: thread.subject,
              sender: thread.sender,
              sender_email: thread.sender_email,
              recipients: 'alex@example.com',
              cc: '',
              envelope_to: '["alex@example.com"]',
              text: 'Coffee on Saturday?',
              html: '',
              received_at: thread.received_at,
              is_read: false,
              starred: false,
              important: false,
              folder: 'inbox',
              category: 'primary',
              snoozed_until: null,
            },
          ],
          attachments: [],
          labels: [],
        };
      return { ok: true, status: 200, json: async () => data };
    }),
  );
});

describe('personal mailbox', () => {
  it('shows database messages and archives the selected conversation', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    expect(await screen.findByText('Weekend plans')).toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: 'Select Weekend plans' }));
    await user.click(screen.getByRole('button', { name: 'Archive selected' }));
    await waitFor(() => expect(screen.queryByText('Weekend plans')).not.toBeInTheDocument());
    expect(
      calls.some(
        (call) =>
          call.path === '/api/actions' &&
          call.body?.action === 'archive' &&
          call.body.thread_ids[0] === 'thread-1',
      ),
    ).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Conversation archived');
  });

  it('searches with a debounced Gmail-style query', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    await screen.findByText('Weekend plans');
    await user.type(
      screen.getByRole('textbox', { name: 'Search mail' }),
      'from:sam@example.net is:unread',
    );
    await waitFor(() =>
      expect(
        calls.some((call) => call.path.includes('q=from%3Asam%40example.net+is%3Aunread')),
      ).toBe(true),
    );
    expect(await screen.findByRole('heading', { name: 'Search results' })).toBeVisible();
  });

  it('opens a conversation, marks it read, and creates a reply', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    await user.click(await screen.findByText('Weekend plans'));
    expect(await screen.findByRole('heading', { name: 'Weekend plans' })).toBeVisible();
    await waitFor(() => expect(calls.some((call) => call.body?.action === 'read')).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Reply' }));
    const compose = screen.getByRole('dialog', { name: 'New message' });
    expect(within(compose).getByLabelText('To')).toHaveValue('sam@example.net');
    expect(within(compose).getByLabelText('Subject')).toHaveValue('Re: Weekend plans');
    expect(within(compose).getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('saves drafts before closing the compose window', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    await screen.findByText('Weekend plans');
    await user.click(screen.getByRole('button', { name: 'Compose' }));
    const compose = screen.getByRole('dialog', { name: 'New message' });
    await user.type(within(compose).getByLabelText('To'), 'friend@example.net');
    await user.type(within(compose).getByLabelText('Subject'), 'A thoughtful note');
    await user.type(within(compose).getByLabelText('Message body'), 'See you soon.');
    await user.click(within(compose).getByRole('button', { name: 'Close compose and save draft' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New message' })).not.toBeInTheDocument(),
    );
    expect(
      calls.some(
        (call) =>
          call.path === '/api/drafts' &&
          call.method === 'POST' &&
          call.body.body === 'See you soon.' &&
          call.body.subject === 'A thoughtful note',
      ),
    ).toBe(true);
  });

  it('edits mailbox identity through configuration and switches appearance', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );
    await screen.findByText('Weekend plans');
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const name = within(dialog).getByLabelText('Display name');
    await user.clear(name);
    await user.type(name, 'Jamie');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.path === '/api/settings' && call.method === 'PUT' && call.body.name === 'Jamie',
        ),
      ).toBe(true),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
