import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Settings } from '../src/Settings';
import { ThemeProvider } from '../src/design-system';

let writes: { path: string; body: unknown }[];
beforeEach(() => {
  writes = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.body) writes.push({ path, body: JSON.parse(String(init.body)) });
      return {
        ok: true,
        json: async () =>
          init?.method === 'PUT'
            ? { ok: true }
            : [
                {
                  label_id: 'work',
                  name: 'Work',
                  kind: 'user',
                  guidance: 'Project discussions',
                  example_count: 1,
                  examples: [
                    {
                      included: false,
                      sender: 'sales@example.com',
                      subject: 'Discount offer',
                      snippet: 'Sale',
                    },
                  ],
                },
              ],
      };
    }),
  );
});
it('lets the owner edit guidance, inspect exclusions, and clear learned examples', async () => {
  const user = userEvent.setup();
  render(
    <ThemeProvider>
      <Settings
        settings={{
          account: { name: 'Alex', email: 'alex@example.com' },
          labels: [],
          counts: {},
          outbound_configured: false,
          smtp_port: 2500,
          max_message_bytes: 10000,
          sorting_configured: true,
          sorting_model: 'luna-alias',
        }}
        initialTab="sorting"
        onClose={() => {}}
        refresh={() => {}}
        report={() => {}}
      />
    </ThemeProvider>,
  );
  const guidance = await screen.findByRole('textbox', { name: 'Work' });
  expect(screen.getByText(/luna-alias/)).toBeVisible();
  await user.clear(guidance);
  await user.type(guidance, 'Mail about my job');
  await user.click(screen.getByRole('button', { name: 'Save guidance' }));
  await waitFor(() =>
    expect(writes[0]).toEqual({
      path: '/api/sorting/memories/work',
      body: { guidance: 'Mail about my job' },
    }),
  );
  await user.click(screen.getByText('Recent examples'));
  expect(screen.getByText(/Doesn’t belong here.*Discount offer/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Clear examples' }));
  await waitFor(() => expect(writes[1].body).toMatchObject({ clear_examples: true }));
});
