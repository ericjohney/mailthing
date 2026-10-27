# Drawer edge-swipe verification

The original edge drag reached 283 points, snapped to the closed position on
finger-up, then animated open again. Its gesture-state translation reset before
the open/closed animation could take over.

The drag translation now stays in ordinary state. Finishing the drag updates the
destination and clears that translation in one animation transaction. A separate
gesture-active flag provides a fallback for interrupted gestures. The existing
spring, Reduce Motion handling and grouped header geometry are retained.

- `comparison.mp4`: synchronized before/after openings at half speed.
- `before.mp4` and `after.mp4`: the same slow opening gesture at normal speed.
- `after-light.mp4`: corrected opening in light mode.
- `close-and-short-drags.mp4`: slow closing, short opening and closing drags,
  logo/outside taps, and a vertical edge drag.
- `motion-check.json`: frame-based measurement of the inbox's leading edge.
  Before: a 283-point backward jump. After: no backward steps.

Recorded on the isolated Mailthing Swipe Spacing iPhone 17 Pro simulator
(iOS 26.5), using fictional mailbox data. The opening measurement samples at
60 fps on a 402-point-wide screen. Also checked the final open/closed state
through the accessibility tree after each gesture. All 21 native tests passed
with Xcode 26.6 and an unavailable loopback server for the test host.

Released with the Settings navigation change in TestFlight 1.0.5 build
`4044637751701` from app commit `5d2102dd82de498303674354149ff44f2dde0dc9`.
Apple processing and availability for the internal `Me` group were verified
after [release run 40446377517](https://github.com/ericjohney/mailthing/actions/runs/40446377517).
