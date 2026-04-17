#!/usr/bin/env bash
# Convert a model with WebUsdFramework and verify that conversion preserved
# the source content (no missing meshes, no dropped animations, etc.).
#
# The framework itself is the thing under test. The correctness oracle is
# `scripts/inspect.cjs`, which diffs the source content against the intermediate
# USDA the framework emits in debug mode. Pixar USD CLI tools are invoked for
# informational diagnostics only (stage tree, load check) — they do not gate
# pass/fail.
#
# Usage:
#   scripts/validate-usdz.sh [input-model] [out-dir]
#
# Env:
#   USD_BIN          path to USD binaries for diagnostics (default: /Users/chrismperez/usd-install/bin)
#   NODE_VERSION     nvm node version to use (default: 23.3.0)
#   SKIP_BUILD=1     skip the rollup build step

set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Activate the desired node version (arm64 on Apple Silicon).
NODE_VERSION="${NODE_VERSION:-23.3.0}"
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use "$NODE_VERSION" >/dev/null 2>&1 || true
fi

INPUT="${1:-models/glb/12_animated_butterflies.glb}"
OUT_DIR="${2:-debug-output}"
USD_BIN="${USD_BIN:-/Users/chrismperez/usd-install/bin}"
export PATH="$USD_BIN:$PATH"

# ANSI colors
BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'
YELLOW=$'\033[33m'; BLUE=$'\033[34m'; CYAN=$'\033[36m'; NC=$'\033[0m'

section() { printf "\n%s=== %s ===%s\n" "$BOLD$CYAN" "$1" "$NC"; }
pass()    { printf "%s[PASS]%s %s\n" "$GREEN" "$NC" "$1"; }
fail()    { printf "%s[FAIL]%s %s\n" "$RED" "$NC" "$1"; }
warn()    { printf "%s[WARN]%s %s\n" "$YELLOW" "$NC" "$1"; }
info()    { printf "%s[INFO]%s %s\n" "$BLUE" "$NC" "$1"; }

[ -f "$INPUT" ] || { fail "input not found: $INPUT"; exit 1; }

section "WebUsdFramework Conversion Harness"
info "Input  : $INPUT ($(du -h "$INPUT" | awk '{print $1}'))"
info "Output : $OUT_DIR/"

# --- Build --
if [ "${SKIP_BUILD:-0}" != "1" ] && [ ! -f "build/index.js" ]; then
  section "Build"
  if ! pnpm run build; then fail "build failed"; exit 1; fi
  pass "build complete"
fi

# --- Convert 
section "Convert (source -> USDZ)"
CONVERT_LOG="$(mktemp)"
if ! node scripts/convert.cjs "$INPUT" "$OUT_DIR" | tee "$CONVERT_LOG"; then
  fail "conversion failed"; rm -f "$CONVERT_LOG"; exit 1
fi
OUTPUT_USDZ="$(tail -n 1 "$CONVERT_LOG")"
rm -f "$CONVERT_LOG"
[ -f "$OUTPUT_USDZ" ] || { fail "expected output not found: $OUTPUT_USDZ"; exit 1; }
pass "converted -> $OUTPUT_USDZ ($(du -h "$OUTPUT_USDZ" | awk '{print $1}'))"

INTERMEDIATE_USDA="$OUT_DIR/model.usda"
[ -f "$INTERMEDIATE_USDA" ] || {
  fail "debug intermediate $INTERMEDIATE_USDA missing — cannot run content diff"
  exit 2
}

# --- Content-preservation diff (the oracle) 
section "Content preservation (source vs output USDA)"
INSPECT_RC=0
node scripts/inspect.cjs "$INPUT" "$INTERMEDIATE_USDA" || INSPECT_RC=$?
if [ "$INSPECT_RC" = "0" ]; then
  pass "content preserved"
  CONTENT_OK=1
else
  if [ "$INSPECT_RC" = "2" ]; then fail "content-preservation findings reported FAILs"
  else fail "inspect script errored ($INSPECT_RC)"
  fi
  CONTENT_OK=0
fi

# --- Diagnostics (non-gating) 
if [ -x "$USD_BIN/usdcat" ]; then
  section "Diagnostic: usdcat --loadOnly (does stage load?)"
  if "$USD_BIN/usdcat" --loadOnly "$OUTPUT_USDZ" 2>&1; then
    pass "stage loads"
  else
    warn "stage failed to load in Pixar USD — likely emitter bug"
  fi
fi

if [ -x "$USD_BIN/usdtree" ]; then
  section "Diagnostic: usdtree --flatten (first 80 lines)"
  "$USD_BIN/usdtree" --flatten "$OUTPUT_USDZ" 2>&1 | head -80 || warn "usdtree failed"
fi

if [ -x "$USD_BIN/usdzip" ]; then
  section "Diagnostic: usdzip --list (package contents)"
  "$USD_BIN/usdzip" --list "$OUTPUT_USDZ" 2>&1 | head -40 || warn "usdzip failed"
fi

# --- Summary 
section "Summary"
info "Output : $OUTPUT_USDZ"
info "USDA   : $INTERMEDIATE_USDA"
if [ "$CONTENT_OK" = "1" ]; then
  pass "conversion preserved source content"
  printf "\n%sConversion OK.%s\n" "$GREEN$BOLD" "$NC"
  exit 0
fi
fail "conversion did NOT preserve source content — see findings above"
printf "\n%sConversion has bugs.%s\n" "$RED$BOLD" "$NC"
exit 2
