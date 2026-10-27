# Settings navigation verification

Settings now opens as a page sliding in from the right. It shares the inbox
navigation stack, with a native Back button and edge swipe to return. Its
subpages use the same stack; the Settings sheet and modal close header are gone.

- `open-and-back.mp4`: open Settings from the drawer and return to Unread.
- `settings-light.png` and `settings-dark.png`: full-page Settings in both themes.

Verified on the isolated Mailthing Swipe Spacing iPhone 17 Pro simulator
(iOS 26.5), using fictional mailbox data: drawer entry, connection-error entry,
Notifications and Mail server subpages, native back buttons, swipe-back from a
subpage and Settings itself, and preservation of the selected Unread mailbox.
Checked the appearance picker and restored System theme. All 21 native tests
passed with Xcode 26.6 using an unavailable loopback server for the test host.

This change is not in TestFlight build `4044209110601`.
