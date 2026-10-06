import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:19005',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'cargo run --bin mailthing',
    url: 'http://127.0.0.1:19005/health',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      PORT: '19005',
      SMTP_PORT: '12500',
      WEB_HOST: '127.0.0.1',
      SMTP_HOST: '127.0.0.1',
      APP_PASSWORD: 'browser-test-password',
      DATABASE_URL: `sqlite://${join(tmpdir(), `mailthing-e2e-${process.pid}.db`)}`,
      MAILBOX_NAME: 'Alex Morgan',
      MAILBOX_EMAIL: 'alex@example.com',
      SMTP_RELAY_HOST: '',
    },
  },
});
