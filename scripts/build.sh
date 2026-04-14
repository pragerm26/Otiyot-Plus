#!/usr/bin/env bash
# Build Otiyot+ for Chrome Web Store
# Usage: ./scripts/build.sh [stable|beta]
set -e

CHANNEL="${1:-stable}"
if [[ "$CHANNEL" != "stable" && "$CHANNEL" != "beta" ]]; then
  echo "Usage: $0 [stable|beta]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$ROOT_DIR/src"
MANIFEST_FILE="$ROOT_DIR/manifests/manifest.$CHANNEL.json"
RELEASES_DIR="$ROOT_DIR/releases"

# Read version from manifest
VERSION=$(grep '"version"' "$MANIFEST_FILE" | sed 's/.*"\([0-9.]*\)".*/\1/')
OUTPUT="$RELEASES_DIR/otiyot-plus-v${VERSION}-${CHANNEL}.zip"

echo "Building Otiyot+ $CHANNEL v$VERSION..."

# Create a clean temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf '$TEMP_DIR'" EXIT

# Copy all source files
cp -r "$SRC_DIR/"* "$TEMP_DIR/"

# Inject channel-specific manifest
cp "$MANIFEST_FILE" "$TEMP_DIR/manifest.json"

# Patch popup badge text for stable builds
if [[ "$CHANNEL" == "stable" ]]; then
  sed -i 's/Open Beta/Stable/g' "$TEMP_DIR/popup.html"
fi

# Package
mkdir -p "$RELEASES_DIR"
(cd "$TEMP_DIR" && zip -r "$OUTPUT" .)

echo ""
echo "Done! Package ready for Chrome Web Store upload:"
echo "  $OUTPUT"
echo ""
echo "Next steps:"
echo "  1. Go to https://chrome.google.com/webstore/devconsole"
echo "  2. Upload $OUTPUT"
echo "  3. Tag this release: git tag v${VERSION}-${CHANNEL} && git push --tags"
