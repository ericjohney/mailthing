# Mailthing for iOS

A native SwiftUI mail app for iOS 17+, with a compact personal inbox, inbox categories,
search, stars, swipe-to-archive/trash/read, labels, threaded conversations,
sanitized HTML, attachment downloads/sharing, compose/reply/reply-all/forward,
Cc/Bcc, file attachments, saved drafts, and light/dark appearance.

HTML email preserves the sender's styles and tables, fits fixed-width layouts
to the available width, and grows to show the full message, including images
that finish loading later. Remote images are hidden until **Show images** is
selected for that message. Email scripts, forms, frames, external stylesheets,
and fonts remain blocked; app-owned sizing code runs in a separate WebKit world.

The default server is `https://mailthing.ericj5.com`, accessible over Tailscale.
The server address is editable in account settings. HTTP is permitted only for
loopback development servers. There is no separate mobile login: access follows
the existing private mailbox's network access control.

Sending requires an outbound SMTP relay configured on the server. If it is not
configured, the app disables Send and explains that drafts can still be saved.
The app never presents invented messages as mailbox data.

## Interface

The app shares Mailthing's folded-m logo and charcoal palette with the web app.
Inbox navigation, category selection, search, and compose live in one compact
header. Search appears on demand; folders, categories, and labels are available
through the logo or mailbox title. Tapping either slides the message list right
to reveal the mailbox panel. Select a mailbox or category to slide it back; tap
the exposed message-list strip or swipe left to close. Swiping right from the
left edge also opens the panel. Message rows use unread dots and fine separators.
Swipe or long-press a conversation to mark it read/unread or star it.

The reader keeps back navigation, sender details, archive, reply, and more actions
at the top. Tap the sender for full recipient details and the date. Each message
in a longer conversation retains its own reply/forward controls. Compose keeps
attachments and Send at the top; closing a message with content offers save,
discard, or continued editing. There is no bottom navigation toolbar.

Settings groups notifications, sorting, appearance, connection, and app details.
Notification controls show actual iOS permission state rather than a simulated
app switch. System, light, and dark themes use adaptive monochrome controls;
text uses Dynamic Type and icon controls provide at least 44-point targets.

Simulator screenshots of the implemented screens are in `design/implementation/ios-*.png`.
They use an isolated sample mailbox, not production account data. The design was
checked on an iPhone 17 simulator in light/dark mode and with accessibility text
sizes, including search, category switching, replying, Cc/Bcc, and saving drafts.

## Sorting guidance and memory

**Account → Settings → Mail sorting** shows whether the server's sorter is
configured, its model and automatic spam confidence cutoff. **Sorting memory**
lists inbox categories, custom labels and Spam. Tap one to edit and save its
guidance, inspect recent included/excluded examples, or clear remembered examples
while keeping the guidance. Pull to refresh the list. Guidance accepts up to
2,000 Unicode scalar characters, matching the server's limit.

Changes use the same server memory as the web app and affect subsequently
processed mail. Applying/removing labels teaches custom-label memory. **Report
spam / Not spam** in the conversation menu teaches Spam memory; moving existing
spam to Inbox also teaches a not-spam correction. Automatic predictions never
teach themselves. A new label becomes eligible for automatic sorting once it
has guidance or positive examples. Create labels and deterministic filters in
the web app. Model, connection credentials and spam cutoff remain configured
on the server; the mobile app never receives provider credentials.

## Build and test

Install Xcode 26.6 and XcodeGen on a Mac:

```sh
brew install xcodegen
cd ios
xcodegen generate
xcodebuild -project Mailthing.xcodeproj -scheme Mailthing \
  -destination 'platform=iOS Simulator,name=iPhone 17e' \
  CODE_SIGNING_ALLOWED=NO test
```

`project.yml` is the source of project settings; regenerate after changing it.
The committed Xcode project can also be opened directly. The iOS Checks workflow
runs these tests on GitHub-hosted macOS runners. This is a public repository;
never run its CI on homelab self-hosted runners.

## New-message notifications

Enable notifications in **Account → Settings → New messages**. iOS asks for
permission to show alerts, play sounds, and update the unread badge. Tokens are
registered with `POST /api/push/devices`; switching servers unregisters the token
from the old mailbox before registering with the new one. Native notification
settings remain available through the app's iOS Settings link.

The server queues each registered device's alert in the same SQLite transaction
that saves a newly received inbox message. Imports, sent mail, spam, archived
mail, and read mail don't queue alerts. Receipts reprocessed after recovery don't
queue duplicate alerts. The outbox survives restarts, retries transient failures
with backoff (12 attempts), removes invalid tokens, and skips messages read or
moved out of the inbox before delivery. APNs collapse identifiers reduce duplicate
alerts if the server crashes after Apple accepts a request. Apple delivery and
user notification settings ultimately determine whether an alert is displayed.

Server environment (stored in a secret manager, never in Git):

- `APNS_KEY_ID`: the Apple Developer APNs authentication key identifier.
- `APNS_TEAM_ID`: `27ZLS4MK3J`.
- `APNS_TOPIC`: `com.ericjohney.mailthing`.
- `APNS_PRIVATE_KEY`: PKCS#8 `.p8` contents, actual newlines or literal `\n`.

The deployed server uses the dedicated **Mailthing Push Notifications** key
`RXSAL6J49G`, supporting Sandbox & Production. Its private key is stored in Vault
and in `~/.mailthing-signing/` on Astra. Use Apple Developer → Certificates,
Identifiers & Profiles → Keys to manage it. An App Store Connect upload key is a separate key. Server egress must permit
HTTPS/HTTP2 to `api.push.apple.com:443` (and `api.sandbox.push.apple.com:443` for
Debug builds). Release/TestFlight uses the production APNs environment.

Alerts include the sender, subject, and a short preview. Tapping opens the
conversation. APNs alerts can arrive without Tailscale; loading mail still needs
the private server connection. Foreground inbox refreshes every 20 seconds and
supports pull-to-refresh. APNs is required for reliable alerts while closed;
foreground refresh is not a substitute for push. Returning to the app refreshes
the current mailbox immediately and retries push token registration if a token
is available, including when returning while viewing a conversation.

Simulator payload injection can verify notification UI and navigation, but does
not prove that Apple accepted a production push. Verify that separately on the
TestFlight build with a newly received message.

## TestFlight distribution

Apple team: `27ZLS4MK3J`. Bundle: `com.ericjohney.mailthing`.
App Store Connect: **Mailthing**, app ID `6822085855`, SKU `mailthing-ios`.
The internal **Me** group contains `eric@ericjohney.com`.
Use the existing PhotoBrain distribution certificate, with a **Mailthing-specific**
App Store profile that authorizes the Push Notifications capability. PhotoBrain's
profile is for a different bundle and cannot sign Mailthing.

Create the Mailthing app record in App Store Connect → My Apps → New App after
registering the bundle; Apple does not allow app creation through the public API.

`ios/scripts/apple.mjs setup` idempotently registers the bundle, enables push,
creates the App Store profile, and creates the internal
**Me** group using the existing App Store Connect API key. Add the owner through
TestFlight → Me → Invite Testers; Apple treats internal users separately from
other apps’ beta tester records. It requires
`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH`, and `SIGNING_DIRECTORY`. Apple may
require account-holder login to create the separate APNs key.

Use the GitHub-hosted release workflow for distribution.
`ios/scripts/release.sh` also supports local macOS builds when the signing
identity is usable in the login session; Astra’s current Tailscale SSH session
can read/import the certificate but cannot use it as a signing identity. It requires
the variables above and `BUILD_NUMBER`, and reads `distribution.p12`,
`p12-password.txt`, and `Mailthing_AppStore.mobileprovision` from the private signing
directory. It uses a temporary keychain, imports Apple’s WWDR G3 intermediate, validates the profile and signed
production push entitlement, archives/exports, verifies the production server
address, and uploads with `altool`. It preserves the user's existing keychain
search list. `apple.mjs allocate` selects a build number above Apple's history;
`apple.mjs status` reports processing status.

The release defaults to **1.0.3**. Marketing versions must never be lower than
a version already uploaded to App Store Connect, even when the build number
is higher. The release preflight checks this before signing and verifies both
version fields in the archived app before upload.

The **iOS TestFlight Release** workflow is manually dispatched:

```sh
gh workflow run ios-release.yml --ref master -f version=1.0.3
```

Required Mailthing repository Actions secrets:

| Secret | Value |
| --- | --- |
| `ASC_KEY_ID` | Existing upload key ID |
| `ASC_ISSUER_ID` | App Store Connect issuer UUID |
| `ASC_PRIVATE_KEY` | Upload `.p8` contents |
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | Distribution `.p12`, base64 |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | `.p12` password |
| `IOS_PROVISIONING_PROFILE_BASE64` | Mailthing App Store profile, base64 |

Keep assets in a mode-0700 directory on Astra and set secrets using file/stdin
input, never printed values or command arguments. Build artifacts and dSYMs are
retained by CI. Upload success precedes Apple's processing; check VALID status
and internal tester/group availability before calling a release available.
