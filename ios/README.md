# Mailthing for iOS

A native SwiftUI mail app for iOS 17+, with a quiet unified inbox, sender avatars,
search, stars, swipe-to-archive/trash/read, custom tags, threaded conversations,
sanitized HTML, PDF/image attachment previews and downloads/sharing, compose/reply/reply-all/forward,
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

The quiet header shows the Mailthing logo, current mailbox and unread count, with
Search and Compose on the right. Tap the logo to open mailboxes and labels;
choose Unread to see only unread mail. The inbox has no bottom bar, leaving more
space for messages. The mailbox panel slides in;
selecting a mailbox or swiping left closes it. Built-in inbox categories have been
removed from both clients and automatic sorting. Existing mail and custom tags are
preserved by migration 0007.

The drawer puts Inbox, Unread, and Starred above Labels. Manage opens a searchable
list with conversation counts; New label creates a label without leaving iOS.
Edit a label to rename it, choose a color, pin it to the drawer, and add sorting
guidance. All labels includes unpinned labels. Remaining mailboxes are under
More mailboxes. Deleting a label requires confirmation and keeps its messages.
Label edits and pins are shared with the web app; existing labels stay pinned
when upgrading.

Message rows show local sender initials, unread indicators, and custom label chips.
Swipe right and choose Labels, or long-press a row and choose Labels, to select multiple
labels or create one. The reader offers
an Add labels control under the subject and a tag button in its bottom action dock.
Save applies the complete custom-label selection atomically; Cancel leaves it unchanged.
Swipe right for blue Read/Unread and amber Labels actions; swipe left for teal Archive
and coral Trash. Each action has an icon and a label. Read/unread and star actions
are also available by long-pressing a conversation.
Short swipe labels keep the native button widths consistent in both directions;
VoiceOver uses the full Mark read/Mark unread action labels.

The reader has a quiet back/more header and bottom archive, tag and reply actions.
Sender details stay with each message. Each message in a longer conversation retains
its own reply/forward controls. Compose keeps attachments and Send at the top;
closing a message with content offers save, discard, or continued editing.

Tap a PDF or image attachment to open the native Quick Look preview with zoom,
PDF page browsing, and sharing. Other files open the share sheet. Files load from
your mailbox server and temporary preview files are removed on dismissal.

Settings slides in from the right as a full page. Use Back or swipe from the
left edge to return to the previous page; returning to mail keeps the selected
mailbox. Settings groups notifications, sorting, appearance, connection, and app details.
Notification controls show actual iOS permission state rather than a simulated
app switch. System, light, and dark themes use adaptive monochrome controls;
text uses Dynamic Type and icon controls provide at least 44-point targets.

Simulator screenshots of the implemented screens are in `design/implementation/ios-*.png`.
They use an isolated sample mailbox, not production account data. The design was
checked on an iPhone 17 simulator in light/dark mode and with accessibility text
sizes, including search, mailbox switching, replying, Cc/Bcc, and saving drafts.

## Sorting guidance and memory

**Account → Settings → Mail sorting** shows whether the server's sorter is
configured, its model and automatic spam confidence cutoff. **Sorting memory**
lists custom tags and Spam. Tap one to edit and save its
guidance, inspect recent included/excluded examples, or clear remembered examples
while keeping the guidance. Pull to refresh the list. Guidance accepts up to
2,000 Unicode scalar characters, matching the server's limit.

Changes use the same server memory as the web app and affect subsequently
processed mail. Applying/removing labels teaches custom-label memory. **Report
spam / Not spam** in the conversation menu teaches Spam memory; moving existing
spam to Inbox also teaches a not-spam correction. Automatic predictions never
teach themselves. A new label becomes eligible for automatic sorting once it
has guidance or positive examples. Create and manage labels from the drawer, or create them from the message label picker; manage deterministic filters on
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
The workflow boots the selected simulator before testing and disables parallel
simulator clones. Test builds use an unavailable loopback server so the test host
does not contact the private production mailbox. The HTML test waits for WebKit's
first layout measurement, including on a cold simulator.

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

Alerts include the sender, subject, and a short preview. They share a single
`mailthing.inbox` notification group. iOS and the owner’s notification grouping
preference control presentation. Per-message APNs collapse IDs still prevent
duplicate deliveries without replacing unrelated mail. Tapping an alert opens its
conversation; reading, archiving, trashing or reporting that conversation as spam
clears only its delivered alerts. APNs alerts can arrive without Tailscale; loading mail still needs
the private server connection. Foreground inbox refreshes every 20 seconds and
supports pull-to-refresh. APNs is required for reliable alerts while closed;
foreground refresh is not a substitute for push. Returning to the app refreshes
the current mailbox immediately and retries push token registration if a token
is available, including when returning while viewing a conversation.

Simulator payload injection can verify notification UI and navigation, but does
not prove that Apple accepted a production push. Verify that separately on the
TestFlight build with a newly received message.

## Email verification-code AutoFill

Requires **iOS 18+**. Open **Settings → Verification-code AutoFill → Enable
Mailthing AutoFill** and accept the system prompt, or enable Mailthing in iOS
**Settings → General → AutoFill & Passwords**. The app shows the real provider state.
Other app features remain available on iOS 17.

The embedded `MailthingAutoFill` credential-provider extension implements Apple's
one-time-code APIs. The host refreshes domain-bound credential identities when mail
refreshes (and when iOS grants a background notification refresh). Selecting a
suggestion launches the extension, which fetches and revalidates live mail before
returning `ASOneTimeCodeCredential`. The provider list also fetches live mail.
Known service domains are retained for up to 30 days (at most 100) so the
extension can retrieve a subsequent code while the host is closed. QuickType
suggestions for new senders require a successful identity refresh;
iOS does not guarantee background execution or suggestion timing. Keep the private
mailbox reachable over Tailscale. This is not Apple's built-in Mail integration.

`GET /api/autofill/messages` returns at most 40 received messages from the last
10 minutes, with bounded plain text (HTML-only messages are converted to text).
It never marks mail read and excludes imports, sent mail, spam and trash. The
shared Swift extractor recognizes explicit code/passcode wording and 4–8 ASCII
digits, preserves leading zeros, rejects ambiguous multiple codes, replies,
forwards, old/future receipts, and honors shorter stated expiry intervals.
Sender-domain matching uses exact/ancestor domain boundaries, not substring matches.
Unsupported formats remain available to copy from the reader.

Only the server address, bounded service-domain metadata, and consumed message
IDs/expiry timestamps are stored in
the shared App Group; codes are fetched live and never saved to disk by the app.
Credential identities contain domain/record metadata, not the actual code. Used
codes are suppressed, and expired identities cannot return an expired code.
A provider error offers retry rather than returning cached codes.

Verified on the isolated iOS 26.5 simulator: enablement prompt, domain-specific
QuickType suggestion, live extension fetch, and filling a Safari field with
`autocomplete="one-time-code"`, including a second code delivered after the host
app was terminated. Also covered by extraction, expiry, ambiguity,
domain-boundary, consumed-code, bounded service-metadata and server-error tests. Verify the signed TestFlight
build on a physical device with Tailscale, provider enablement, Safari and another
app, offline behavior, and a second newly received code while Mailthing is closed.

Apple references:
- https://developer.apple.com/documentation/authenticationservices/providing-one-time-passcodes-to-autofill
- https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.authentication-services.autofill-credential-provider

## TestFlight distribution

Apple team: `27ZLS4MK3J`. Bundle: `com.ericjohney.mailthing`.
App Store Connect: **Mailthing**, app ID `6822085855`, SKU `mailthing-ios`.
The internal **Me** group contains `eric@ericjohney.com`.
Use the existing PhotoBrain distribution certificate, with a **Mailthing-specific**
App Store profile that authorizes the Push Notifications capability. PhotoBrain's
profile is for a different bundle and cannot sign Mailthing.

For AutoFill, register `com.ericjohney.mailthing.autofill` in the Apple Developer
portal. Enable **AutoFill Credential Provider** and **App Groups** on BOTH the host
app and extension identifiers. Create `group.com.ericjohney.mailthing` and assign
it to both. Regenerate the host App Store profile and create an extension App
Store profile. The host profile also needs production Push Notifications. Save
these as `Mailthing_AppStore.mobileprovision` and
`Mailthing_AutoFill_AppStore.mobileprovision` in the signing directory. The release
script validates both profiles and signed entitlements, signs each target with its
own profile, and verifies the embedded extension versions and code capability.
`ios/scripts/apple.mjs setup-autofill` registers both identifiers and enables their
required capabilities through the public API. Assign the shared App Group in the
Developer portal, then rerun with `CREATE_AUTOFILL_PROFILES=1` to save fresh
profiles without revoking existing profiles.

Create the Mailthing app record in App Store Connect → My Apps → New App after
registering the bundle; Apple does not allow app creation through the public API.

`ios/scripts/apple.mjs setup` idempotently registers the bundle, enables push,
creates the base App Store profile, and creates the internal
**Me** group using the existing App Store Connect API key. Add the owner through
TestFlight → Me → Invite Testers; Apple treats internal users separately from
other apps’ beta tester records. Its base setup does not configure the new shared App Group or extension profiles;
complete the AutoFill portal steps above before releasing. It requires
`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_PATH`, and `SIGNING_DIRECTORY`. Apple may
require account-holder login to create the separate APNs key.

Use the GitHub-hosted release workflow for distribution.
`ios/scripts/release.sh` also supports local macOS builds when the signing
identity is usable in the login session; Astra’s current Tailscale SSH session
can read/import the certificate but cannot use it as a signing identity. It requires
the variables above and `BUILD_NUMBER`, and reads `distribution.p12`,
`p12-password.txt`, and both `.mobileprovision` files above from the private signing
directory. It uses a temporary keychain, imports Apple’s WWDR G3 intermediate, validates the profile and signed
production push entitlement, archives/exports, verifies the production server
address, and uploads with `altool`. It preserves the user's existing keychain
search list. `apple.mjs allocate` selects a build number above Apple's history;
`apple.mjs status` reports processing status.

The release defaults to **1.0.5**. Marketing versions must never be lower than
a version already uploaded to App Store Connect, even when the build number
is higher. The release preflight checks this before signing and verifies both
version fields in the archived app before upload.

The **iOS TestFlight Release** workflow is manually dispatched:

```sh
gh workflow run ios-release.yml --ref master -f version=1.0.5
```

Required Mailthing repository Actions secrets:

| Secret | Value |
| --- | --- |
| `ASC_KEY_ID` | Existing upload key ID |
| `ASC_ISSUER_ID` | App Store Connect issuer UUID |
| `ASC_PRIVATE_KEY` | Upload `.p8` contents |
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | Distribution `.p12`, base64 |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | `.p12` password |
| `IOS_PROVISIONING_PROFILE_BASE64` | Mailthing App Store profile with push, AutoFill and App Group, base64 |
| `IOS_AUTOFILL_PROVISIONING_PROFILE_BASE64` | AutoFill extension App Store profile with AutoFill and App Group, base64 |

Keep assets in a mode-0700 directory on Astra and set secrets using file/stdin
input, never printed values or command arguments. Build artifacts and dSYMs are
retained by CI. Upload success precedes Apple's processing; check VALID status
and internal tester/group availability before calling a release available.
