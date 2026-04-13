#!/usr/bin/env bash
# Download latest IP2Location LITE DB9 BIN (IPv4) and install into ip2location/.
# Requires: curl, unzip
# Token: create .env.ip2location from .env.ip2location.example (gitignored).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.ip2location"
OUT_DIR="${REPO_ROOT}/ip2location"
TMP_ZIP="${REPO_ROOT}/.ip2location-download-$$.zip"

cleanup() {
  rm -f "$TMP_ZIP"
}
trap cleanup EXIT

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ${ENV_FILE}" >&2
  echo "Copy .env.ip2location.example to .env.ip2location and set IP2LOCATION_TOKEN." >&2
  exit 1
fi

# shellcheck source=/dev/null
set -a
source "$ENV_FILE"
set +a

if [[ -z "${IP2LOCATION_TOKEN:-}" ]]; then
  echo "IP2LOCATION_TOKEN is empty in ${ENV_FILE}" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "Downloading DB9LITEBIN (redirects to R2; follow with -L)..."
curl -fsSL \
  -o "$TMP_ZIP" \
  "https://www.ip2location.com/download?token=${IP2LOCATION_TOKEN}&file=DB9LITEBIN"

echo "Extracting ZIP to ${OUT_DIR}..."
unzip -o -q "$TMP_ZIP" -d "$OUT_DIR"

BIN_PATH="$(find "$OUT_DIR" -maxdepth 3 -name 'IP2LOCATION-LITE-DB9.BIN' -type f | head -n 1)"
if [[ -z "$BIN_PATH" ]]; then
  echo "Could not find IP2LOCATION-LITE-DB9.BIN after unzip. Contents:" >&2
  find "$OUT_DIR" -type f | head -20 >&2
  exit 1
fi

# If unzip put the BIN in a nested folder, move it next to LICENSE if we want flat layout
# Prefer canonical path: ip2location/IP2LOCATION-LITE-DB9.BIN
CANON="${OUT_DIR}/IP2LOCATION-LITE-DB9.BIN"
if [[ "$BIN_PATH" != "$CANON" ]]; then
  mv -f "$BIN_PATH" "$CANON"
  echo "Moved BIN to ${CANON}"
fi

SIZE="$(wc -c < "$CANON" | tr -d ' ')"
echo "OK: ${CANON} (${SIZE} bytes)"
