import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { LabelsView } from '../src/LabelManagement';
import { MailboxSidebar } from '../src/mailbox/MailboxSidebar';
import { ThemeProvider } from '../src/design-system';
import type { Label, LabelDetail, Settings } from '../src/types';

const work: LabelDetail = {
  id: 'work',
  name: 'Work',
  color: '#777d88',
  kind: 'user',
  pinned: true,
  guidance: 'Project discussions',
  example_count: 3,
};
const initial: Settings = {
  account: { name: 'Alex', email: 'alex@example.com' },
  labels: [work, { id: 'reading', name: 'Reading', color: '#879988', kind: 'user', pinned: false }],
  counts: { work: { total: 4, unread: 2 } },
  outbound_configured: false,
  smtp_port: 2500,
  max_message_bytes: 10000,
};
let writes: { path: string; method: string; body: Record<string, unknown> }[];
let failLoad: boolean;
let failSave: boolean;
beforeEach(() => {
  writes = [];
  failLoad = false;
  failSave = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (method !== 'GET') writes.push({ path, method, body });
      if (method === 'GET')
        return {
          ok: !failLoad,
          status: failLoad ? 503 : 200,
          json: async () => (failLoad ? { error: 'Server unavailable' } : work),
        };
      return {
        ok: !failSave,
        status: failSave ? 400 : 200,
        json: async () =>
          failSave
            ? { error: 'A label with this name already exists' }
            : method === 'DELETE'
              ? { ok: true }
              : { id: method === 'POST' ? 'new' : 'work', kind: 'user', ...body },
      };
    }),
  );
});

function Harness({ create = false }: { create?: boolean }) {
  const [settings, setSettings] = useState(initial);
  return (
    <ThemeProvider>
      <LabelsView
        settings={settings}
        initialCreate={create}
        onClose={() => {}}
        onOpen={() => {}}
        onChanged={(label, deleted) =>
          setSettings((old) => ({
            ...old,
            labels: [
              ...old.labels.filter((item) => item.id !== label.id),
              ...(deleted ? [] : [label]),
            ],
          }))
        }
      />
    </ThemeProvider>
  );
}

it('keeps management visible with no pins and puts labels before secondary mailboxes', async () => {
  const user = userEvent.setup(),
    manage = vi.fn(),
    create = vi.fn();
  render(
    <ThemeProvider>
      <MailboxSidebar
        settings={{
          ...initial,
          labels: initial.labels.map((label) => ({ ...label, pinned: false })),
        }}
        route={{ label: 'INBOX' }}
        searching={false}
        open
        onNavigate={() => {}}
        onCompose={() => {}}
        onSettings={() => {}}
        onClose={() => {}}
        onManageLabels={manage}
        onCreateLabel={create}
      />
    </ThemeProvider>,
  );
  expect(
    within(screen.getByRole('navigation', { name: 'Mailbox folders' }))
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Inbox', 'Unread', 'Starred']);
  expect(screen.queryByRole('button', { name: 'Reading' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Drafts' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Manage labels' }));
  expect(manage).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'New label' }));
  expect(create).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'More mailboxes' }));
  expect(screen.getByRole('button', { name: 'Drafts' })).toBeVisible();
});

it('creates a label and preserves edits after a rejected save before retrying', async () => {
  const user = userEvent.setup();
  render(<Harness create />);
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Travel');
  await user.click(screen.getByRole('checkbox', { name: 'Pin to mailboxes' }));
  await user.click(screen.getByRole('button', { name: 'Create label' }));
  expect(await screen.findByRole('button', { name: /Travel.*0 conversations/ })).toBeVisible();
  expect(writes[0]).toMatchObject({
    path: '/api/labels',
    method: 'POST',
    body: { name: 'Travel', pinned: false },
  });
  await user.click(screen.getByRole('button', { name: 'Edit Work' }));
  const guidance = await screen.findByRole('textbox', { name: 'Sorting guidance' });
  await waitFor(() => expect(guidance).toHaveValue('Project discussions'));
  await user.clear(screen.getByRole('textbox', { name: 'Name' }));
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Projects');
  await user.clear(guidance);
  await user.type(guidance, 'Team plans and discussions');
  failSave = true;
  await user.click(screen.getByRole('button', { name: 'Save label' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  expect(guidance).toHaveValue('Team plans and discussions');
  failSave = false;
  await user.click(screen.getByRole('button', { name: 'Save label' }));
  expect(await screen.findByRole('button', { name: /Projects.*4 conversations/ })).toBeVisible();
  expect(writes.at(-1)).toMatchObject({
    method: 'PUT',
    body: { name: 'Projects', guidance: 'Team plans and discussions', pinned: true },
  });
});

it('blocks saving when details cannot load so existing guidance is not overwritten', async () => {
  const user = userEvent.setup();
  failLoad = true;
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Edit Work' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
  expect(screen.getByRole('button', { name: 'Save label' })).toBeDisabled();
  failLoad = false;
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Sorting guidance' })).toHaveValue(
      'Project discussions',
    ),
  );
  expect(screen.getByRole('button', { name: 'Save label' })).toBeEnabled();
});

it('requires confirmation to delete and removes the label from the list only after success', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Edit Work' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete label' })).toBeEnabled());
  await user.click(screen.getByRole('button', { name: 'Delete label' }));
  const confirm = screen.getByRole('group', { name: 'Delete label confirmation' });
  expect(confirm).toHaveTextContent('Your messages will be kept');
  expect(writes).toHaveLength(0);
  await user.click(within(confirm).getByRole('button', { name: 'Delete label' }));
  expect(await screen.findByRole('status')).toHaveTextContent('messages were kept');
  expect(screen.queryByRole('button', { name: 'Edit Work' })).not.toBeInTheDocument();
  expect(writes[0]).toMatchObject({ path: '/api/labels/work', method: 'DELETE' });
});
