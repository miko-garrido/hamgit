#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/Hamgit.app"
PROCESS_NAME="hamgit"
VERIFY=0

for arg in "$@"; do
  case "$arg" in
    --verify)
      VERIFY=1
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

pkill -x "$PROCESS_NAME" 2>/dev/null || true

cd "$ROOT_DIR"
bun run tauri build
/usr/bin/open -n "$APP_PATH"

if [[ "$VERIFY" -eq 1 ]]; then
  sleep 3
  pgrep -x "$PROCESS_NAME" >/dev/null
  echo "Hamgit is running."
fi
