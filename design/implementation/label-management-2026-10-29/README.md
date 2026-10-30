# Drawer-first label management

Implemented the drawer-first direction from `../../label-management-2026-10-26/`
in native iOS and the responsive web app.

- Inbox, Unread, and Starred precede pinned labels.
- Manage, New label, and All labels expose label management directly.
- More mailboxes contains the remaining system views.
- The searchable manager shows conversation/unread counts and separate edit controls.
- Editors save name, color, pin, and sorting guidance together. Deletion asks for
  confirmation and preserves messages.
- Pins live in the shared database. Migration 0008 keeps existing labels pinned;
  unpinned labels remain available in the manager and message pickers.
- Native labels use the existing navigation stack, adaptive appearance, and
  Dynamic Type. Mobile web has a full-height manager with a scrolling list and
  a persistent creation button, plus drawer keyboard focus containment.

## Verification

- `npm run build`: passed.
- `npm test`: all 19 web interaction tests passed.
- `npm run test:e2e`: all six browser tests passed. The label test also passed
  after the final layout and copy adjustments, at 320px and 390px widths.
- Rust formatting, Clippy with warnings denied, and all 56 integration tests passed.
  The new API test covers editing/pins, guidance retention, reserved system
  labels, failed-write atomicity, and deleting labels without deleting mail.
- Native simulator build and all 23 iOS tests passed. The final typography
  adjustment also compiled successfully.
- On the isolated Mailthing Mailbox Drawer iPhone simulator, verified drawer
  navigation, editing Work to Projects, preserving its guidance, creating Weekend
  plans, and saving an unpin. Confirmed the changes through the same API used by
  the web app. Inspected normal and accessibility-extra-large text in light/dark
  appearance; restored standard text and light appearance afterward.

Screenshots use a temporary server/database and fictional mail. Native verification
used a temporary bundle identifier, leaving the production app and account alone.
Released as **TestFlight 1.0.5 build `4100280052601`** from app commit
`60e46dcfbe52b2a2bb2af533cbb74cdaf98b2576`, using
[release run 41002800526](https://github.com/ericjohney/mailthing/actions/runs/41002800526).
Apple processing is `VALID`, the internal build state is `IN_BETA_TESTING`, and
the internal **Me** group is linked to the build and includes the owner.

The matching server image was deployed through `ericjohney/argocd` commit
`1ad4affaca2e1901ff76074b58f2d4a9bf8946cf`, pinned to
`sha256:fdc66a0764e8ce31e8248f757808b4c6294fd1fb50f1b3eaa47743b63b7cbc4c`.
ArgoCD reports Synced/Healthy with one ready replica. The production health and
label detail APIs were verified successfully after rollout, including persisted
pins, sorting guidance, and example counts.

## Screenshots

- `ios-drawer-light.png`: prominent label section in the native drawer.
- `ios-labels-light.png`, `ios-labels-dark.png`: native label management.
- `ios-labels-large-text.png`: native management at an accessibility text size.
- `web-drawer-light.png`, `web-labels-light.png`: mobile-web navigation and manager.
- `web-editor-light.png`, `web-editor-dark.png`: responsive label editor.

The server update, including migration 0008 and the new label detail/update routes,
must be deployed before shipping clients that use the new editors.
