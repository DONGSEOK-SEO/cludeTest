#!/usr/bin/env bash

greet() {
  echo "Hello, $1!"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  greet "${1:-world}"
fi
