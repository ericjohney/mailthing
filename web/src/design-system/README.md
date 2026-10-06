# Mailthing design system

Crisp monochrome is the default appearance: white paper, graphite text, fine rules, compact corners, clear unread states, and minimal decoration. The system uses local system fonts and Lucide line icons. Feature components share the same geometry in every palette.

## Layers

| Layer                               | Responsibility                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `tokens.css`                        | Semantic palettes, typography, spacing, radii, control sizes, elevation, motion, stacking |
| `base.css`                          | Resets, keyboard focus, reduced motion, default text and controls                         |
| `components.tsx` / `components.css` | Reusable React controls and their shared states                                           |
| `ThemeProvider.tsx`                 | Stored preference, resolved palette, device changes, cross-tab synchronization            |
| `../styles/`                        | Screen layout and responsive behavior; all colors consume tokens                          |
| `../mailbox/`                       | Mail-specific navigation, conversation rows, and sandboxed HTML display                   |

`../styles.css` imports these layers in order. Import React components through `../design-system`, rather than copying markup or writing another button stylesheet.

## Tokens

Use roles such as `--color-surface`, `--color-text-muted`, `--color-border`, `--color-surface-selected`, `--color-action`, and `--color-on-action`. A name describes what the color does, so a component has no knowledge of which palette is active. Both palettes define the same roles, including status, focus, avatars, email document defaults, and shadows.

Use the 4 px spacing scale (`--space-1` through `--space-12`), named type sizes and weights, and `--radius-sm` / `--radius-md` / `--radius-lg`. Circles use `--radius-round`. Exact sizes are allowed for layout breakpoints, optical details, and special geometry. User-chosen label colors are mailbox data and are the deliberate exception to semantic UI colors.

Use status colors for information requiring attention. Normal selection, stars, labels in message rows, and primary actions remain monochrome. Keep readable contrast and a visible keyboard focus state when editing tokens.

## Components

| Component                        | Contract                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Button`                         | `primary`, `secondary`, `ghost`, `danger`; `sm` / `md`; defaults to `type="button"`; explicitly use `type="submit"` for forms |
| `IconButton`                     | Requires a meaningful `label`; shares hover, focus and disabled states                                                        |
| `Field`                          | A visible label wrapping a single native input/select/textarea; pass native validation and input attributes to the control    |
| `Avatar`                         | Name initials; neutral/account tones; small/medium sizes; decorative next to a labeled account or sender                      |
| `Badge`                          | Shared label/folder geometry, including removable conversation labels                                                         |
| `NavItem`                        | Icon, name, count and active state; exposes `aria-current`                                                                    |
| `Tabs`                           | Labeled tab list with roving focus, arrows, Home/End and optional panel linkage                                               |
| `PageHeading` / `SectionHeading` | Consistent titles, descriptions and optional page actions                                                                     |
| `Toolbar`                        | Common action-bar layout for lists and conversations                                                                          |
| `Modal`                          | Native dialog, accessible title, Escape/backdrop close and browser-managed focus                                              |

```tsx
import { Button, Field, SectionHeading } from './design-system';

<form onSubmit={save}>
  <SectionHeading title="Mailbox identity" description="Used when sending email." />
  <Field label="Display name">
    <input value={name} onChange={updateName} required />
  </Field>
  <Button type="submit" disabled={saving}>
    Save changes
  </Button>
</form>;
```

Keep mail actions outside the primitive layer. `MailboxSidebar` and `ThreadRow` receive data and callbacks; they do not fetch or mutate mail themselves.

`useMediaQuery` subscribes to viewport changes. Desktop compact navigation and the mobile drawer have separate state, so composing or changing viewport size does not mix the two behaviors.

## Appearance

Wrap the application in `ThemeProvider` and call `initializeTheme()` before the first render. `useTheme()` returns the `light` / `dark` / `system` preference, the resolved `light` / `dark` palette, and `setPreference`. Light is the default. Preferences survive reloads and synchronize across tabs; System reacts to live device changes. Blocked browser storage still permits changes for the current session.

To change the look, edit the semantic values in `tokens.css`. To introduce another palette, define the full token set and extend the preference type/normalization and Settings appearance options. Screen styles and primitive markup should not need theme selectors. To add a density option later, override geometry tokens such as `--row-height` and `--control-height` independently of color themes.

HTML email stays sandboxed. `EmailContent` copies the resolved semantic email tokens into the separate document. Author-supplied email styling is preserved; it can specify its own background or text color. The theme controls document defaults and the surrounding UI.

## Checks

`npm test` covers theme initialization, persistence, live device changes, cross-tab changes, storage failures, safe form buttons, and tab keyboard navigation. `npm run test:e2e` exercises real mail, light/dark appearance across inbox/reader/compose, readable text contrast, sandboxed HTML, reload persistence, System appearance, and mobile layout.
