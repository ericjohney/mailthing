# Delete animation verification

The inbox now animates changes to its stable row IDs over 0.25 seconds, so a
deleted message disappears and following rows slide up. Trash retains its coral
color and icon. Its button lets the confirmed server update remove the row rather
than asking the native list to dismiss it before the async request completes.
Reduce Motion disables the added animation.

- `before.mp4`: original swipe-to-Trash behavior, normal speed.
- `after-light.mp4`: reveal the swipe actions, tap Trash, and watch the gap close.
- `after-dark-full-swipe.mp4`: complete a full swipe to Trash in dark mode.

Recorded on the isolated Mailthing Swipe Spacing iPhone 17 Pro simulator
(iOS 26.5), using fictional mailbox data. Inspected transition frames and the
final list. Confirmed the Bookshop conversation moved from Inbox to Trash. With
the fixture server offline, attempted to trash Parcel and verified it stayed
visible, an error appeared, and its server membership was preserved. Restored
the server and fictional mailbox after checking both paths.

All 21 native tests passed with Xcode 26.6. The test host used an unavailable
loopback server. This change is not in TestFlight build `4026577096101`.
