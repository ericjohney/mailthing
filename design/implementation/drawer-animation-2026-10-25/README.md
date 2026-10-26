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

The shipped TestFlight build `4026030198101` predates this fix.
