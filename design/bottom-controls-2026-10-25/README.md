# Lighter inbox controls

Open [index.html](index.html) for four interactive alternatives to the current
floating bottom bar. The gallery is self-contained and has a light/dark switch.
All concepts keep the quiet mailbox heading, sender avatars, custom tags and
unread row treatment. Sample mail is fictional.

| Option | Arrangement | Main tradeoff |
| --- | --- | --- |
| 01 One floating action | Mailboxes in the title, Search at the top, standalone Compose at the bottom right. | Frees most of the bottom edge; Search takes a longer reach. Recommended starting point. |
| 02 Split controls | Small mailbox/search pill at the bottom left, separate Compose button at the bottom right. | Preserves thumb reach for all controls, with two floating surfaces. |
| 03 Flat native toolbar | Edge toolbar with labeled Mailboxes, Search and Compose actions. | Familiar and explicit, while reserving a strip across the bottom. |
| 04 Header only | Mailboxes, Search and Compose in the header; no bottom controls. | Most open content area, with the longest reach for frequent actions. |

Mailbox selection, unread selection, local sample search, compose fields, draft
retention within each preview, closing panels, and appearance switching work in
the prototype. It does not send mail, persist drafts to the app, or connect to a
mailbox server. Conversation rows illustrate the existing layout rather than
opening a reader. A native implementation would retain native safe areas,
Dynamic Type, VoiceOver and keyboard behavior.

Checked with T3 HTML Preview at 728px and 360px widths, including light and dark
appearance. The gallery's bounded interaction checks passed for all four
concepts, with no horizontal page overflow. App tests were not rerun because
this pass adds only standalone design artifacts; none of these navigation
alternatives had been applied to the native app when the gallery was created.

## Implemented selection

Selected **04 Header only**, with the Mailthing logo to the left of the mailbox
title as the drawer button. The native inbox now places Search and Compose in the
header and has no bottom bar. Verified all three controls, light/dark appearance
and accessibility extra-large text in the simulator; all 21 iOS tests passed.
Screenshots are in `../implementation/header-navigation-2026-10-25/`.
