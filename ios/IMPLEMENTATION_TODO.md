# iOS refresh implementation

Work through each item in order and verify it before moving to the next.

- [x] **Quiet header and neutral Reach layout:** compact Inbox heading, plain unread count, rounded unread rows, bottom mailbox/search/compose and reader actions, adaptive light/dark surfaces. Build and inspect both appearances.
- [x] **Sender badges:** consistent initials for people and senders, safe fallback for missing names, accessible unread indicators. Test initials and inspect long names and larger text.
- [x] **Easy tagging:** visible custom tags, a dedicated tag picker from rows and the reader, multi-select add/remove, and tag creation. Verify persistence and error handling against an isolated mailbox.
- [x] **Remove built-in categories:** remove Primary/Updates/Social/Promotions navigation and automatic category assignment, while retaining custom labels and spam handling. Verify existing mail and tags remain available.
- [x] **Grouped notifications:** a stable mailbox notification group, with independent per-conversation navigation and delivery deduplication. Test payloads and grouped simulator notifications.
- [x] **Verification-code AutoFill:** use supported iOS APIs for codes received by email, with bounded extraction, expiry, and clear setup instructions if iOS requires opting in. Build and test the supported integration; record any device or platform limitations.
- [x] **Integration and handoff:** run the relevant iOS/server/web checks, inspect the final simulator build, and document what passed and what still requires a physical-device check.

## Verification log

1. **Quiet header:** Xcode 26.6 build and 12 iOS tests passed on an isolated iPhone 17 Pro simulator. Inspected the inbox in dark mode and the reader in light mode; corrected the shared safe-area background. Unread filtering combines with search and resets on mailbox changes.

2. **Sender badges:** Xcode build and all 13 iOS tests passed. Initials cover Unicode names, single-word senders, email local-parts, and missing sender details. Badges scale with Dynamic Type and retain a separate accessible unread value.

3. **Easy tagging:** all 14 native tests and the atomic server tag-selection regression passed. Saved Travel and Receipts from the native picker and confirmed both memberships through the isolated API. Invalid or deleted tags reject the entire save without losing existing tags.

4. **Categories removed:** 30 targeted server tests, 15 web tests, web production build, and all 14 iOS tests passed. The migration preserves existing messages, custom labels and mailbox states while retiring category labels and category rules. Inspected the unified inbox and persisted custom tags in the simulator.

5. **Grouped notifications:** five server push tests and all 15 iOS tests passed. Injected three notifications for distinct conversations and inspected their single iOS group (badge count 3). Conversation destinations and per-message APNs collapse identifiers remain independent. Read/archive/trash/spam actions remove only matching delivered alerts. Production APNs delivery still requires a signed-device check.

6. **Verification-code AutoFill:** native iOS 18+ credential-provider extension, shared configuration, bounded recent-mail endpoint, live revalidation and consumed-code suppression implemented. Enabled it through the actual iOS prompt and filled a Safari verification-code field from its QuickType suggestion. Extraction, expiry, ambiguity, domain matching, and provider errors are covered by native tests. The new server endpoint regression passed. Release scripts/CI now accept separate app and extension profiles and validate both AutoFill and App Group entitlements. Developer Portal setup and a signed-device check remain release prerequisites.

7. **Final verification:** `npm run check` passed (production web build, 15 web unit tests, Rust formatting, Clippy with warnings denied, and all 55 server tests). All five Playwright end-to-end tests passed against a separate test server/database. All 21 iOS tests passed on iOS 26.5 with Xcode 26.6; an unsigned device Release build also succeeded. Inspected final light/dark inbox, reader and tag sheet, and accessibility extra-large text. Fixed cramped large-text rows and icon sizing. Created a new tag in the native picker, saved it with another tag, and verified both persisted. Confirmed a newly delivered code fills Safari after terminating the host app, using retained domain metadata and a live extension fetch.

Screenshots: `design/implementation/quiet-header-2026-10-24/` (isolated fictional mailbox).

## Before a TestFlight release

- [ ] Configure AutoFill Credential Provider and the shared App Group on both Apple Developer identifiers; regenerate the host profile and create the extension profile. Add the new extension profile CI secret. Exact identifiers and filenames are in `ios/README.md`.
- [ ] Verify production APNs delivery/grouping and badge behavior on the signed build with actual incoming mail.
- [ ] Enable the provider on a physical iOS 18+ device and verify Safari, another app, Tailscale offline/reconnect behavior, and a subsequent code arriving while Mailthing is closed. New service domains need a host/background identity refresh before QuickType can suggest them; iOS controls background scheduling.

No production deployment, release upload, Apple account configuration, or changes to the production mailbox were performed.
