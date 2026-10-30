# Label management on iPhone

Three interactive directions, grounded in the current native app's monochrome
appearance, header navigation, sliding mailbox drawer, and tag picker.

Open [index.html](index.html) directly, or serve this directory:

```sh
python3 -m http.server 9011 --bind 127.0.0.1 --directory design/label-management-2026-10-26
```

## Directions

1. **Drawer first — recommended.** Put labels immediately after Inbox, Unread,
   and Starred. Expose Manage and New label without scrolling through ten system
   mailboxes. Move the remaining mailbox links into More mailboxes. A dedicated
   management page provides search, creation, and a separate edit affordance.
2. **Label library.** Put an explicit Labels button and pinned shortcuts under
   the inbox heading. A library of collections makes browsing more prominent,
   at the cost of an additional row above messages.
3. **In context.** Add creation and a management link to the message picker.
   Apply several labels together. The label editor combines name, color,
   pinning, sorting guidance, and deletion.

Start with **01 + the picker from 03**. Use the library direction if labels
become a primary way to browse mail. Use “Labels” consistently across navigation,
message actions, and editing; the native app currently mixes “Tags” and “Labels.”

## Try the prototype

- Switch directions, appearance, and (on narrow screens) entry/management views.
- Create a label from the drawer, manager, library, or message picker.
- Search existing labels; a picker search carries into the creation form.
- Rename, recolor, pin/unpin, and edit sorting guidance via the pencil control.
- Select several labels, create and select another, then apply them together.
- Delete a label with a confirmation and restore it with Undo.
- Choose First label for an empty mailbox, or Reset for the original sample.

All names, mail, and counts are fictional. Changes stay in memory and are shared
between the two mock screens for the current browser page. Other mail actions
show a prototype notice. This does not connect to the app or send mail.

## Files

- `index.html`: self-contained, editable gallery; no remote dependencies.
- `01-drawer-first.png`: drawer and management page.
- `02-label-library.png`: inbox shortcuts and library.
- `03-in-context.png`: message picker and label editor.
- `03-in-context-dark.png`: picker and editor in dark appearance.

## Implementation considerations

These are design artifacts, with no changes to production code. The native
picker already supports label creation and conversation assignment. The server
currently exposes label creation and deletion, but has no label-update endpoint
or pinning field; renaming, recoloring, and persisted pins would require those
additions. Sorting guidance already has a separate API and settings UI and can
be surfaced in the label editor.

A native implementation should retain native safe areas, Dynamic Type,
VoiceOver labels and state, navigation-stack back behavior, and sheet keyboard
avoidance. The prototype illustrates the information hierarchy and interactions.

## Verification

Checked all three directions at 728px and 360px gallery widths. Twelve mobile
combinations (three directions × two appearances × two screens) had no
horizontal page overflow. T3 HTML Preview confirmed light, dark, and narrow
layouts without script errors. The collaborative browser also completed 18
interaction checks covering navigation, searching, creation, duplicate-name
validation, editing, pinning, deletion/undo, multi-label application, creation
from the picker, first-label creation, and reset. No console errors or failed
network requests were reported. App test suites were not needed for this
standalone design study.

## Implemented selection

**01 Drawer first** is implemented in iOS and responsive web. Native and web
editors share persisted pins, label metadata, and sorting guidance. Screenshots
and verification notes are in `../implementation/label-management-2026-10-29/`.
