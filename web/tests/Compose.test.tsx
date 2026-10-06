import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Compose } from '../src/Compose';
import { emptyDraft, type Settings } from '../src/types';

it('retains the compose window and draft when sending fails', async () => {
  const draft = { ...emptyDraft(), to: 'friend@example.net', subject: 'Hello', body: 'Keep me' };
  const settings: Settings = {
    account: { name: 'Alex', email: 'alex@example.com' },
    labels: [],
    counts: {},
    outbound_configured: true,
    smtp_port: 2500,
    max_message_bytes: 26214400,
    password_required: false,
  };
  const onClose = vi.fn();
  const report = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string) => ({
      ok: !path.endsWith('/send'),
      status: path.endsWith('/send') ? 502 : 200,
      json: async () => (path.endsWith('/send') ? { error: 'Relay unavailable' } : draft),
    })),
  );
  render(
    <Compose
      initial={draft}
      settings={settings}
      onClose={onClose}
      onSent={vi.fn()}
      report={report}
    />,
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(report).toHaveBeenCalledWith('Relay unavailable'));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Message body')).toHaveValue('Keep me');
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
});
