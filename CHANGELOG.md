# Changelog

All notable changes to Otiyot+ are documented here.
Versions follow [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

---

## [1.2.0] — 2026-05-04

### Added
- **Editable PDF settings panel** in `pdf-processor.html`: Color Niqqud toggle,
  Dyslex-Kriyah Font toggle, Letter Spacing slider (0–10 px), Highlight Opacity
  slider, per-vowel color toggles with expandable panel, and a "Save to Extension"
  button that writes settings back to `chrome.storage.sync`.
- **Dyslexia font in PDF output**: when the font toggle is on, the OTF font is
  embedded into the PDF via pdf-lib and each Hebrew letter is overlaid with the
  Dyslex-Kriyah typeface.
- **Letter spacing in PDF output**: shifts Hebrew character highlight positions by
  the configured spacing value so the visual spread carries into the printed PDF.
- **GitHub Actions CI**: `release.yml` creates a signed GitHub Release (with zip)
  whenever a `v*` tag is pushed; `nightly.yml` builds and publishes a pre-release
  zip every day at 02:00 UTC.

### Changed
- Repository reorganized: library files moved to `lib/`, font moved to `fonts/`.
- All internal path references updated (`manifest.json`, `content.js`,
  `pdf-processor.html`, `pdf-processor.js`).
- Result summary in PDF processor now lists which features were applied.
- Progress steps expanded from 5 to 6 to show the font/spacing step separately.
- Highlight opacity calculation updated (was `× 0.55`, now `× 0.90`) to better
  reflect the user-set percentage.

---

## [1.1.5] — 2026-04-28

### Added
- PDF Colorizer: `pdf-processor.html` / `pdf-processor.js` — client-side pipeline
  that extracts Hebrew character positions from a PDF, classifies niqqud, and
  overlays colored highlight rectangles using pdf-lib.
- Teacher Tools section in the popup: "Colorize a PDF" and "Apply to Google Doc"
  buttons.
- Site Disable button: per-hostname toggle stored in `chrome.storage.sync`.

### Changed
- Extension description updated to mention the PDF colorizer.
- Manifest updated with `web_accessible_resources` for PDF processor files.

---

## [1.1.0] — 2026-04-10

### Added
- Highlight mode selector: "Block" (full letter box) vs "Niqqud only" (mark only).
- Highlight opacity slider (10–100%).
- Per-vowel on/off toggle rows in the customize panel.
- "All On" / "All Off" bulk buttons for vowel toggles.
- Reading Focus mode: blurs background outside the selected text using an SVG
  clip-path + `backdrop-filter`.

### Changed
- Customize panel is now collapsible (click the color-dot strip to expand).
- Shva classification improved: checks for long vowel on the previous letter.

---

## [1.0.0] — 2026-03-20

### Added
- Initial release.
- Color Niqqud: wraps each Hebrew letter+diacritic in a colored `<span>` based on
  vowel type; 10 vowel categories with distinct colors.
- Dyslex-Kriyah Font toggle: applies the custom `dyslexia-hebrew-extended.otf`
  typeface to all Hebrew text via a CSS `@font-face` injection.
- Letter Spacing slider (0–10 px): injects extra space between Hebrew letters using
  CSS `letter-spacing` and zero-width space characters.
- MutationObserver for dynamic content (e.g., infinite-scroll pages).
- Per-domain disable stored in `chrome.storage.sync`.
