# Otiyot+ — Hebrew Reading Aid

A Chrome extension that colour-codes niqqud vowel marks, applies a dyslexia-friendly font, adds adjustable letter spacing, and provides a reading focus mode for Hebrew text on any webpage.

---

## Repository Structure

```
src/               Extension source files (loaded directly by Chrome in dev mode)
manifests/         Channel-specific manifests
  manifest.stable.json   v1.1.0 — published as "Otiyot+"
  manifest.beta.json     v1.2.0 — published as "Otiyot+ Beta"
scripts/           Build scripts for packaging
  build.ps1        Windows (PowerShell)
  build.sh         macOS / Linux / WSL (Bash)
releases/          Generated .zip files (gitignored — not committed)
CHANGELOG.md       Version history
```

---

## Development: Load Unpacked

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `src/` folder
4. Pin the extension via the puzzle-piece icon

---

## Building a Release Package

Packages are `.zip` files uploaded directly to the Chrome Web Store Developer Console.

**Windows (PowerShell):**
```powershell
.\scripts\build.ps1 stable   # → releases/otiyot-plus-v1.1.0-stable.zip
.\scripts\build.ps1 beta     # → releases/otiyot-plus-v1.2.0-beta.zip
```

**macOS / Linux / WSL (Bash):**
```bash
bash scripts/build.sh stable   # → releases/otiyot-plus-v1.1.0-stable.zip
bash scripts/build.sh beta     # → releases/otiyot-plus-v1.2.0-beta.zip
```

The build script:
- Copies `src/` to a temp directory
- Injects the correct `manifest.json` for the chosen channel
- Patches the popup header badge (`Open Beta` → `Stable` for stable builds)
- Zips everything into `releases/`

---

## Publishing to Chrome Web Store

Two separate listings are maintained:

| Listing | Manifest | Version | Audience |
|---------|----------|---------|----------|
| **Otiyot+** (stable) | `manifest.stable.json` | 1.1.0 | General users |
| **Otiyot+ Beta** (beta) | `manifest.beta.json` | 1.2.0 | Early adopters |

### Steps
1. Build the package: `.\scripts\build.ps1 stable` (or `beta`)
2. Go to the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole)
3. Select the correct listing → **Package** tab → **Upload new package**
4. Upload the generated `.zip` from `releases/`
5. Fill in store listing details, screenshots, and submit for review
6. After publishing, tag the release in git:
   ```bash
   git tag v1.1.0-stable   # or v1.2.0-beta
   git push --tags
   ```

---

## Versioning

- **Stable** (`main` branch, `manifest.stable.json`): production releases, increments `MAJOR.MINOR.PATCH`
- **Beta** (`beta` branch, `manifest.beta.json`): next minor version under development

When beta is ready to promote to stable:
1. Bump `manifest.stable.json` version to match beta's version
2. Merge beta branch into main
3. Update `CHANGELOG.md`
4. Build and publish stable package
5. Increment beta version for the next cycle

---

## Testing

Visit [Sefaria — Judges 16:30](https://www.sefaria.org/Judges.16.30) for a page with full Hebrew niqqud to test all features.

---

## Features

- **Colour Niqqud** — 10 vowel types each with a distinct colour; individually toggleable
- **Dyslex-Kriyah Font** — custom OpenType Hebrew font designed for readability
- **Letter Spacing** — 0–10 px slider; inserts zero-width spaces between letters
- **Reading Focus Mode** — blurs everything outside the selected text region
- **Block / Niqqud-only modes** — highlight entire letter block or only the vowel mark
- **Opacity control** — 10–100% highlight transparency
- **Sync storage** — settings follow the user across devices via Chrome sync

---

*Developed by Mayer Prager · KoHack 2026*
