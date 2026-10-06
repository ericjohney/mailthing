# Mailthing design studies

Five independent visual directions, each with an inbox and a reading view:

| Direction | Character |
| --- | --- |
| Crisp monochrome | Paper white, graphite, precise typography, fine rules |
| Native macOS | Soft layered navigation, blue controls, system typography |
| Superhuman-inspired | Dark navy, violet, compact rows, keyboard cues |
| Warm editorial | Ivory, olive, terracotta, serif typography |
| Modern Material | Cloud blue, rounded surfaces, colorful labels |

## Preview

Run from the project root:

```sh
python3 -m http.server 9010 --bind 127.0.0.1 --directory design/mockups
```

Open http://127.0.0.1:9010/ for the interactive gallery or http://127.0.0.1:9010/overview.html for a side-by-side comparison. The gallery also works by opening `index.html` directly in a browser.

Switch styles, inbox/reading views, and density. Try opening a conversation, search, category tabs, stars, selection, labels, and Compose. Other actions show a preview notice. All mail and account details are fictional; this preview does not connect to the application or send email.

## Deliverables

- `comparison-inbox.png` and `comparison-reader.png`: overview boards.
- `<style>-inbox.png` and `<style>-reader.png`: full-size 1440 × 900 mockups.
- `gallery.png`: the interactive gallery as a screenshot.
- `index.html`, `styles.css`, `mockups.js`: the editable, self-contained prototype.
- `overview.html`: a comparison page that links to the full-size exports.

The design studies are separate from `web/` and `server/`; no production style has been selected or applied.

## Validation

Checked all five styles in Chromium: opening conversations, search, categories, starring, compose, gallery switching, and density. Desktop exports fit all nine inbox rows and the full example conversation. Also checked page width on a 390 px mobile viewport and verified there were no browser script errors.
