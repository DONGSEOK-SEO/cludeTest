#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/../src/greet.sh"

expect() {
  local actual="$1"
  local expected="$2"
  if [[ "$actual" != "$expected" ]]; then
    echo "FAIL: expected '$expected', got '$actual'"
    exit 1
  fi
}

expect "$(greet world)" "Hello, world!"
expect "$(greet Claude)" "Hello, Claude!"

echo "All tests passed."
