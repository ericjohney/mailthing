import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Button,
  Field,
  initializeTheme,
  Tabs,
  ThemeProvider,
  useTheme,
} from '../src/design-system';

function Appearance() {
  const { theme, preference, setPreference } = useTheme();
  return (
    <>
      <output aria-label="Current appearance">
        {preference}:{theme}
      </output>
      <Button onClick={() => setPreference('dark')}>Dark</Button>
      <Button onClick={() => setPreference('system')}>System</Button>
    </>
  );
}

describe('theme lifecycle', () => {
  it('restores a saved appearance before rendering and preserves explicit choices', async () => {
    localStorage.setItem('mailthing-theme', 'dark');
    initializeTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
    const view = render(
      <ThemeProvider>
        <Appearance />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText('Current appearance')).toHaveTextContent('dark:dark');
    view.unmount();
    render(
      <ThemeProvider>
        <Appearance />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText('Current appearance')).toHaveTextContent('dark:dark');
  });

  it('persists changes and uses the same resolved theme everywhere', async () => {
    render(
      <ThemeProvider>
        <Appearance />
      </ThemeProvider>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dark' }));
    expect(localStorage.getItem('mailthing-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByLabelText('Current appearance')).toHaveTextContent('dark:dark');
  });

  it('follows device changes only when System is selected and removes listeners on unmount', async () => {
    const events = new EventTarget();
    let dark = true;
    const media = {
      get matches() {
        return dark;
      },
      addEventListener: vi.fn(events.addEventListener.bind(events)),
      removeEventListener: vi.fn(events.removeEventListener.bind(events)),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
    const view = render(
      <ThemeProvider>
        <Appearance />
      </ThemeProvider>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'System' }));
    expect(screen.getByLabelText('Current appearance')).toHaveTextContent('system:dark');
    act(() => {
      dark = false;
      events.dispatchEvent(new Event('change'));
    });
    expect(document.documentElement.dataset.theme).toBe('light');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dark' }));
    act(() => {
      events.dispatchEvent(new Event('change'));
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
    view.unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('synchronizes appearance changes from another tab', () => {
    render(
      <ThemeProvider>
        <Appearance />
      </ThemeProvider>,
    );
    act(() => {
      localStorage.setItem('mailthing-theme', 'dark');
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'mailthing-theme', newValue: 'dark' }),
      );
    });
    expect(screen.getByLabelText('Current appearance')).toHaveTextContent('dark:dark');
  });

  it('recovers from invalid preferences and still changes appearance when storage is blocked', async () => {
    localStorage.setItem('mailthing-theme', 'invalid');
    initializeTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    render(
      <ThemeProvider>
        <Appearance />
      </ThemeProvider>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('reusable controls', () => {
  it('provides labeled fields, explicit submission, and safe non-submit buttons in forms', async () => {
    const submit = vi.fn((event) => event.preventDefault());
    const action = vi.fn();
    render(
      <form onSubmit={submit}>
        <Field label="Name">
          <input />
        </Field>
        <Button onClick={action}>Preview</Button>
        <Button type="submit">Save</Button>
        <Button disabled onClick={action}>
          Unavailable
        </Button>
      </form>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Alex');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Unavailable' }));
    expect(action).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('moves tab focus and selection together with arrows, Home, and End', async () => {
    function Example() {
      const [value, setValue] = useState('primary');
      return (
        <Tabs
          label="Categories"
          value={value}
          onValueChange={setValue}
          items={[
            { id: 'primary', label: 'Primary' },
            { id: 'updates', label: 'Updates' },
            { id: 'social', label: 'Social' },
          ]}
        />
      );
    }
    render(<Example />);
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Social' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Social' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Updates' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Social' })).toHaveFocus();
  });
});
