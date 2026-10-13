# iOS design directions

Three visual concepts using the same fictional mail:

- **Quiet native:** monochrome, system type, fine dividers, native search styling.
- **Personal letters:** ivory, olive, serif headings, more space for reading.
- **Focused dark:** charcoal, compact rows, muted sender initials.

Serve the repository root and open `design/ios-mockups/index.html`. Switch between
Inbox and Reading, or tap any message to preview its reading layout across all
three directions. Other controls illustrate placement only.

These HTML/CSS studies explore layout and hierarchy; they do not emulate all iOS
behaviors or connect to a mailbox. A SwiftUI implementation should use native
controls, safe areas, Dynamic Type, and adaptive light/dark palettes. The dark
concept shows one palette, not a proposal to remove light mode.

## Research revision · October 12, 2026

Reviewed official mobile navigation guides and screenshots. These are references
for interaction patterns; screenshots may show different app and OS versions.

| Reference                                                                                                      | Observed pattern                                                                       | Mailthing adaptation                                                       |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [Superhuman mobile navigation](https://help.superhuman.com/hc/en-us/articles/46005719737357-Mobile-Navigation) | Search and Split Inbox switching at the bottom; search also available by pulling down. | Move categories out of the header into a bottom selector.                  |
| [Spark on iOS 26](https://sparkmailapp.com/help/tips-tricks/spark-on-ios-26)                                   | Search is an upper-right icon; inbox and reading actions use bottom controls.          | Reveal search on demand; retain a bottom action toolbar.                   |
| [Outlook Focused/Other](https://support.microsoft.com/en-us/outlook/how-do-i-toggle-between-focused-and-other) | Compact inbox toolbar; Focused/Other is a separate two-option strip.                   | Use a single 44px navigation row; omit our permanent four-option strip.    |
| [Apple Mail categories](https://support.apple.com/en-qa/guide/iphone/iphfe4a36baf/ios)                         | Categories provide a distinct sorting mode.                                            | Treat category choice as navigation rather than decorative header content. |

The earlier mockups stacked branding/title, search, categories, and date headings.
The revised inbox goes straight from a single navigation row into messages.
The reader combines sender metadata with back/more navigation and follows it
with a smaller subject. This is our design proposal, not a claim that every
reference app uses the same arrangement.

At the 1280px comparison-board viewport, the message list begins 104 CSS pixels
from the phone frame top (including its border and simulated status area), down
from 201–207px in the previous version. Reading body text begins approximately
147px in the native/dark concepts and 151px in the editorial concept. These are
prototype measurements, not fixed SwiftUI constraints or measurements of other
apps. Preserve device safe areas and larger text accessibility in implementation.

Search icons reveal functional sample-message search. Category selection and
other toolbar controls illustrate placement only. No mailbox data is accessed.

## Content-first alternative

`content-first.html` makes a larger structural change: no top inbox navigation
bar, a bottom toolbar for mailboxes/category/search/compose, and a reader that
starts with the subject and a single sender line. Its two phones show inbox and
reading side by side. Message taps and bottom back navigation work independently
in each phone. This is an exploration of bottom navigation, not an iOS UI change.

## Familiar Apple Mail direction

`familiar.html` returns to familiar iOS mail conventions: top back navigation,
a compact mailbox/category selector, standard message rows with blue unread
dots, and bottom filter/compose or archive/trash/reply actions. Search appears
when its icon is tapped. There is no permanent large title or category strip.
The reader uses a normal top back control and compact subject/sender metadata.

The two phones show inbox and reading. Message navigation, sample search, and
unread filtering work; other controls illustrate their intended placement.
This is a Mailthing design study inspired by Apple Mail, not a pixel copy or a
claim about the exact layout in every iOS version.

## Mailthing with compact top navigation

`mailthing.html` keeps Mailthing's charcoal palette and folded-m mark. The inbox
has one top row for mailbox selection, search, and compose. The reader's top row
contains back navigation, sender details, archive, reply, and more actions. Both
screens omit a bottom toolbar. Mailboxes/categories and search reveal on demand;
message selection, return navigation, and sample search work in the prototype.
The home indicator retains a clear simulated safe area.

## Compose, Mailboxes, and Settings

`other-screens.html` extends the selected charcoal/top-navigation direction to
three more screens. Compose puts close, attachments, and Send at the top and
keeps recipient fields compact. Mailboxes uses a scrollable list for folders,
categories, and labels. Settings uses simple grouped rows with account,
notifications, sorting, appearance, connection, and app information.

All account values, counts, and message content are fictional. Cc/Bcc expands,
the notification switch changes its preview state, and appearance choices update
the selected segment. These actions do not alter app preferences or send mail.
Other controls show their intended placement. Closing a composer with changes
should retain the app's existing save/discard flow in a native implementation.
