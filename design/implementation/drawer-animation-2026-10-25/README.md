# Drawer animation verification

The logo button lagged behind the Inbox heading while the drawer opened. SwiftUI
pushed the parent offset into the button label, where its press animation could
retime that movement. A geometry group on the moving inbox container keeps the
drawer slide together while preserving the existing spring and button feedback.

- `comparison.mp4`: synchronized before/after opening at half speed.
- `before.mp4`: original opening at normal speed.
- `after-light.mp4`: corrected opening and closing at normal speed, light mode.
- `after-dark.mp4`: corrected opening and closing at normal speed, dark mode.

Recorded from the isolated Mailthing Swipe Spacing iPhone 17 Pro simulator
(iOS 26.5) with fictional mailbox data. Inspected transition frames in both
appearances. Verified opening by the logo and edge swipe, closing by tapping the
exposed inbox and swiping left, and selecting Unread then Inbox. All 21 native
tests passed using Xcode 26.6; the test host used an unavailable loopback server.

Released in TestFlight 1.0.5 build `4026577096101` from app commit
`7b61414696f10f5ee796f4422e5614c376286092`. Apple processing and availability
for the internal `Me` group were verified after
[release run 40265770961](https://github.com/ericjohney/mailthing/actions/runs/40265770961).
