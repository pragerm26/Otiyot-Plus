# Changelog

All notable changes to Otiyot+ are documented here.
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.2.0] — Beta
> Active development. Published to Chrome Web Store as **Otiyot+ Beta**.

_No changes yet — beta branch opened for upcoming features._

---

## [1.1.0] — Stable
> Current stable release. Published to Chrome Web Store as **Otiyot+**.

### Added
- Per-vowel toggles: individually enable/disable each of the 10 niqqud types
- All On / All Off quick-action buttons in the customize panel
- Highlight opacity slider (10–100%)
- Block mode vs. Niqqud-only mode toggle
- Letter spacing slider (0–10 px) with zero-width space insertion
- Reading focus mode: blur overlay outside the selected text region
- Dyslexia-Kriyah font toggle (custom OpenType Hebrew font)
- MutationObserver support for dynamically loaded content (SPAs, infinite scroll)
- 80 ms debounce on setting changes to prevent DOM thrashing

### Changed
- Popup UI redesigned: card-based layout, Rubik font, sky/gold/navy colour system
- Shva classification now implements full grammatical rules (Na vs. Nach)
- Vav-with-dagesh (shuruk) distinguished from regular dagesh

### Fixed
- Extension context invalidation guard added to content script
- Typo: "Customise" → "Customize"

---

## [1.0.0] — Initial Release
- Basic niqqud colour-coding (10 vowel types)
- Dyslexia-friendly Hebrew font
- Chrome Storage sync for settings persistence
- Popup settings panel
