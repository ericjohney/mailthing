# Mailthing mobile design pass · October 24, 2026

Open [the interactive gallery](index.html). It is one self-contained HTML file and works directly in a browser or through a static server. No install or build is required. **Explore** shows a selected direction's inbox and reader; **All 10** shows the ten inboxes together. Each numbered PNG below is an exported inbox/reader pair.

The deliverable contains **10 distinct concepts and 20 authored screens**, using fictional mail. This is a design exploration; no SwiftUI app code, server behavior, preferences, or mailbox data was changed.

## Latest study: neutral Reach and cleaner headers

The current preference is Tangerine's layout without the color, with a cleaner top and deliberate dark mode. Open [the neutral Reach study](reach-neutral.html). Light and dark are shown together; the Inbox / Reading control changes both previews. Three header options retain the rounded message rows, typography, spacing, and bottom controls.

| Header treatment | Change | Inbox, light + dark | Reader, light + dark |
| --- | --- | --- | --- |
| Quiet header — recommended | Inbox title and plain unread count share one baseline. The header and status area use one surface. The reader has a clear Inbox back control. | [Inbox pair](reach-neutral-quiet-inbox.png) | [Reader pair](reach-neutral-quiet-reader.png) |
| Centered header | Compact mailbox title with a subordinate unread count; balanced navigation slots. | [Inbox pair](reach-neutral-center-inbox.png) | [Reader pair](reach-neutral-center-reader.png) |
| Content only | Remove the top bar; move mailbox and category context to the bottom dock. Reading starts with subject and sender. | [Inbox pair](reach-neutral-dock-inbox.png) | [Reader pair](reach-neutral-dock-reader.png) |

The palette is achromatic throughout the app-owned UI. Light mode uses an off-white canvas, pale gray unread rows, and a white dock. Dark mode uses a deep charcoal canvas, raised rows and dock, soft white text, and reversed light primary actions. The old tinted band, badge-shaped count, and reader breadcrumb are removed. Category selection in Content only moves to a menu.

Verified all three headers, inbox/reader, and both modes at 390px and 840px gallery widths without horizontal overflow. Exercised header and screen switching, synchronized message selection, return navigation, dark-mode search, and category filtering. No native app changes are included in this study.

## Earlier color exploration

Reach is the selected layout direction. The next study replaces the original indigo accent and monochrome recommendation with four fuller palettes: [open the Reach color gallery](reach-colors.html). Each option has an inbox, reader, and matching day/night colors. The bottom dock, compact header, and core message structure are retained.

**Tangerine is the recommendation:** warm cream, tangerine actions, peach unread surfaces, and mint attachment accents. Lagoon is the fresher teal alternative, Raspberry is more playful, and Marigold uses golden yellow with dark olive lettering.

| Palette | Color roles | Day mockup | Night mockup |
| --- | --- | --- | --- |
| Tangerine | Cream canvas, `#B74924` actions, peach selected state, mint attachments. | [Day](reach-tangerine-day.png) | [Night](reach-tangerine-night.png) |
| Lagoon | Sea-glass canvas, `#08786F` actions, mint selected state, apricot attachments. | [Day](reach-lagoon-day.png) | [Night](reach-lagoon-night.png) |
| Raspberry | Petal canvas, `#AC365A` actions, rose selected state, butter attachments. | [Day](reach-raspberry-day.png) | [Night](reach-raspberry-night.png) |
| Marigold | Oat canvas, `#EFBE4C` actions with dark olive text, pale gold selected state, sage attachments. | [Day](reach-marigold-day.png) | [Night](reach-marigold-night.png) |

The color study uses the same fictional mail and local prototype interactions as the original exploration. Color is applied to actions, selection, unread state, and supporting surfaces. Unread indicators and typography retain their meaning without depending on hue. Day/night switches change all four previews and the selected pair. Calculated primary-action text contrast is at least 5.2:1 across the eight palettes; this is a token check, not an accessibility certification. Browser checks cover palette selection, night-mode persistence during message navigation, search, categories, and absence of horizontal overflow at 390px and 840px widths.

## Initial recommendation

Start by comparing **01 Essential**, **03 Reach**, and **05 Correspondence**. Essential is the most natural refinement of the current app, Reach is the strongest ergonomics experiment, and Correspondence provides the most distinctive visual identity. If choosing a direction to prototype in SwiftUI first, use Essential's hierarchy and test Reach's bottom controls on a real phone. Keep Correspondence as a separate visual alternative so the choice is easy to assess.

**02 Familiar** is the useful baseline for people who want conventional iPhone mail behavior. **08 One at a time** is the strongest candidate for an optional new workflow, alongside an ordinary list.

## The ten directions

| # | Mockup | Central change | Implementation implications |
| --- | --- | --- | --- |
| 01 | [Essential](01-essential.png) | Folded-m identity, compact header, clear unread/earlier sections, quieter previews. | Mostly styling and client-side grouping. Current top actions remain. |
| 02 | [Familiar](02-familiar.png) | System blue, visible search, conventional iOS hierarchy and bottom actions. | Reorganizes existing capabilities; large title should collapse on scroll. |
| 03 | [Reach](03-reach.png) | Bottom category, mailbox, search, and compose dock; bottom reader controls. | New navigation placement, safe-area and keyboard handling. |
| 04 | [Velocity](04-velocity.png) | Dense rows, precise metadata, restrained violet, bottom category tabs. | Density should be optional; action entry point is proposed UI. Needs a companion light palette. |
| 05 | [Correspondence](05-correspondence.png) | Paper, olive, serif subjects, letter-like reading, quiet text navigation. | Mostly visual; preserve sender HTML formatting and offer adaptive palettes. |
| 06 | [People](06-people.png) | Sender-oriented conversations, recent people, plain-text conversation bubbles. | Sender grouping and thread selection need new logic. Rich HTML should use the existing isolated reader. |
| 07 | [Spaces](07-spaces.png) | Four category destinations and a Primary preview, with color as wayfinding. | New home view and authoritative category counts. Keeps Mailthing's current category names. |
| 08 | [One at a time](08-triage.png) | Finite unread card stack, explicit archive/later/reply choices. | Optional triage mode; needs next-message progression and reliable undo. |
| 09 | [Collections](09-collections.png) | Custom labels as visible project/reference collections; prominent attachments. | New label home, existing label model. A conversation can belong to multiple collections. |
| 10 | [Daily brief](10-brief.png) | Date, mailbox counts, and important/updates timeline. | New aggregate home and rules for older mail. No generated summaries or urgency predictions. |

## Current-app review

Inspected the running Mailthing inbox and sliding mailbox panel on the Astra iOS simulator, `InboxView.swift`, `MailDesign.swift`, and `ConversationView.swift`, the committed reader and compose screenshots under `design/implementation`, and the existing `design/ios-mockups` studies.

The current app's strongest assets are its compact top navigation, folded-m mark, uncluttered monochrome palette, and direct message list. The reader already has a straightforward content-first layout.

The opportunities tested here are:

- Make unread mail easier to distinguish through grouping and typography, in addition to a dot.
- Expose the current category and make switching easier to discover; today it sits within the mailbox drawer.
- Test moving frequent actions within thumb reach on larger iPhones.
- Give sender, subject, preview, and attachment metadata more distinct roles.
- Consider whether a personal mailbox benefits from a people view, a finite processing mode, or a label/reference home.

No measurement of production user behavior is claimed. These are design hypotheses for the next prototype.

## References reviewed

Reviewed official product guides and published screens on October 24, 2026. UI examples can differ by app and OS version. These references inform interaction patterns; the concepts are not exact reproductions of competitors.

| App and primary source | Pattern observed | Adaptation |
| --- | --- | --- |
| [Apple Mail categories](https://support.apple.com/en-qa/guide/iphone/iphfe4a36baf/ios) | Category navigation and grouped sender digests. | Familiar iOS hierarchy in 02; visible category destinations in 07. Mailthing retains its own category names. |
| [Superhuman mobile navigation](https://help.superhuman.com/hc/en-us/articles/46005719737357-Mobile-Navigation) | Bottom Split Inbox selection, bottom search, and inbox density options. Viewed its published mobile examples. | Thumb reach in 03, compact scanning and bottom switching in 04. |
| [Spark on iOS 26](https://sparkmailapp.com/help/tips-tricks/spark-on-ios-26) | Grouped inbox cards, bottom inbox/viewer controls, search at the upper right. Viewed the published inbox screenshot. | Grouping in 07, bottom controls in 03, explicit processing choices in 08. |
| [HEY product walkthrough](https://www.hey.com/how-it-works/) and [The Feed](https://www.hey.com/features/the-feed/) | Separate homes for personal mail, newsletters, and receipts; Reply Later and focused processing. | Reading mood in 05, people emphasis in 06, processing in 08, background-mail separation in 10. These are adaptations, not claims that HEY uses these layouts. |
| [Gmail categories on iPhone](https://support.google.com/mail/answer/3094499?co=GENIE.Platform%3DiOS&hl=en) | Primary, Social, Promotions, and Updates closely match Mailthing's existing model. | Existing-category foundation in 01 and 07. |
| [Outlook Focused Inbox on mobile](https://support.microsoft.com/en-us/outlook/training/focused-inbox-email-filter-in-outlook-mobile) | A simple Focused/Other distinction. | Short category switcher in 04; separating important/background mail in 10. |

Collections (09) is an original synthesis around Mailthing's existing labels. Serif typography and palettes throughout are art-direction choices, not attributed product features.

## Prototype behavior and limits

Message selection, return navigation, sample search, category and label filtering, mailbox navigation, compose/reply fields, Cc/Bcc expansion, and concept selection work locally. Search covers the fictional sender, subject, preview, category, and label strings; it does not implement the server's full search syntax.

Archive, snooze, Trash, stars, labels, draft saving, and attachment controls illustrate placement and show local preview feedback. They do not persist mail state, advance a real triage queue, create actual saved drafts, open actual PDFs, or send messages. The attachment sheet illustrates the existing Quick Look handoff.

Both phones initially show the same Sam Rivera conversation for comparison. Reading previews include app-owned plain text; they are not a proposal to remove the isolated HTML reader or change remote-image privacy behavior. Some layouts deliberately require scrolling to reach the full message or attachment.

The 360 × 740 point canvases are design studies, scaled within the gallery. A native implementation must use real safe areas, adaptive light/dark colors, Dynamic Type, VoiceOver, adequate contrast, native sheet behavior, and at least 44-point action targets. No accessibility conformance or native interaction fidelity is claimed for these HTML mockups.

## Verification

- Rendered the self-contained gallery with T3 HTML Preview and inspected it in the collaborative browser.
- Checked all 10 directions and both screens for horizontal overflow at 840px and 390px gallery widths; none found.
- Verified ten concept selectors and ten overview cards, next-direction navigation, and overview-to-detail selection.
- Exercised search → matching conversation, companion-reader updates, Updates filtering, Travel collection filtering, compose, Cc/Bcc expansion, and local draft-preview confirmation.
- Checked JavaScript syntax with `node --check` and inspected light/dark gallery framing.
- Exported and visually reviewed the ten inbox/reader PNG pairs. These are browser-rendered design artifacts, not simulator screenshots of implemented changes.

App build/tests were not run because the change adds only standalone design artifacts.
