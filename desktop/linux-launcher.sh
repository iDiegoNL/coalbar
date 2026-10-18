#!/bin/sh
# Select Ozone before Electron initializes. Preserve an explicit user choice.
if [ -n "$DISPLAY" ]; then
  explicit_ozone=false
  for arg in "$@"; do
    case "$arg" in
      --ozone-platform|--ozone-platform=*) explicit_ozone=true ;;
    esac
  done
  if [ "$explicit_ozone" = false ]; then
    set -- --ozone-platform=x11 "$@"
  fi
fi
exec "$(dirname "$0")/coalbar-bin" "$@"
