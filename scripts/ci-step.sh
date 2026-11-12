#!/usr/bin/env bash
# Runs a CI step; if it fails, posts the last lines of its output as a GitHub annotation
# so the failure can be read without opening the full log.
# Usage: scripts/ci-step.sh "<step name>" <command> [args…]
name="$1"; shift
log=$(mktemp)
"$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
if [ "$status" -ne 0 ]; then
  tail_text=$(tail -n 25 "$log" | sed 's/%/%25/g' | sed 's/\r//g' | awk 'BEGIN{ORS="%0A"} {print}')
  echo "::error title=${name} failed::${tail_text}"
fi
exit "$status"
