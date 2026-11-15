#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_PATH="${1:-build/ios/RS-Setups.xcarchive}"
OUTPUT_IPA="${2:-build/ios/RS-Setups-unsigned.ipa}"

APP_DIR=$(find "$ARCHIVE_PATH/Products/Applications" -maxdepth 1 -name "*.app" -type d | head -n 1)
if [ -z "$APP_DIR" ]; then
  echo "Error: No .app bundle found inside $ARCHIVE_PATH/Products/Applications" >&2
  exit 1
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

mkdir -p "$WORK_DIR/Payload"
cp -R "$APP_DIR" "$WORK_DIR/Payload/"

# Strip any leftover _CodeSignature so external iOS signing tools can clean-sign
rm -rf "$WORK_DIR/Payload/"*.app/_CodeSignature || true

ABS_OUT=$(python3 -c "import os,sys; print(os.path.abspath(sys.argv[1]))" "$OUTPUT_IPA")
mkdir -p "$(dirname "$ABS_OUT")"

(
  cd "$WORK_DIR"
  zip -qry "$ABS_OUT" Payload
)

echo "Packaged unsigned IPA at $ABS_OUT"
ls -lh "$ABS_OUT"
