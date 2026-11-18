#!/usr/bin/env bash
# Runs each time the codespace starts: make sure the stack is up and print the URL.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
bash scripts/codespace-up.sh || true
