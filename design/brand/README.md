# Mailthing logo

The folded **m** echoes an envelope flap, with rounded ends and a charcoal tile.
The lowercase wordmark follows the app's system typeface and monochrome palette.

The editable master is `web/public/brand/mailthing-mark.svg`. The web header and
favicon use it directly. Run `python3 ios/scripts/generate-icon.py` from the repo
to regenerate the opaque 1024px iOS icon and 180px web touch icon. The renderer
supports the master's absolute M/L segments with round caps and joins. iOS masks
the full-bleed square; don't bake rounded corners into its PNG.

Open `design/brand/index.html` through a static server rooted at the repository
to review the wordmark, app icon, dark header, and 16/24/32px samples.
