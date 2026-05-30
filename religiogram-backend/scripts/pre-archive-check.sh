#!/usr/bin/env bash
# scripts/pre-archive-check.sh
# Run before creating a release archive to catch accidental inclusions.
# Usage: bash scripts/pre-archive-check.sh [directory]
# Exits non-zero if any check fails.

set -euo pipefail

DIR="${1:-.}"
FAIL=0

echo "=== ReligioGram pre-archive check ==="

# 1. No .env (only .env.example or .env.development.local allowed)
if find "$DIR" -maxdepth 2 -name ".env" -not -name ".env.*" | grep -q .; then
  echo "❌  .env file found — remove before archiving"
  find "$DIR" -maxdepth 2 -name ".env" -not -name ".env.*"
  FAIL=1
else
  echo "✅  No raw .env files"
fi

# 2. No node_modules in archive
if find "$DIR" -maxdepth 3 -type d -name "node_modules" | grep -q .; then
  echo "❌  node_modules found — run 'npm prune --production' or exclude from archive"
  FAIL=1
else
  echo "✅  No node_modules"
fi

# 3. No dist/ build artefacts
if find "$DIR" -maxdepth 2 -type d -name "dist" | grep -q .; then
  echo "⚠️   dist/ directory found — consider excluding from source archive"
fi

# 4. No private keys
if find "$DIR" -name "*.pem" -o -name "*.key" -o -name "id_rsa" 2>/dev/null | grep -v node_modules | grep -q .; then
  echo "❌  Private key file(s) found"
  find "$DIR" -name "*.pem" -o -name "*.key" -o -name "id_rsa" 2>/dev/null | grep -v node_modules
  FAIL=1
else
  echo "✅  No private key files"
fi

# 5. No test OTP bypass enabled
if grep -r "DEV_OTP_BYPASS=1" "$DIR/.env" 2>/dev/null; then
  echo "❌  DEV_OTP_BYPASS=1 set in .env — remove before production archive"
  FAIL=1
else
  echo "✅  DEV_OTP_BYPASS not set"
fi

# 6. Check SECURITY.md present
if [ ! -f "$DIR/SECURITY.md" ]; then
  echo "⚠️   SECURITY.md missing"
else
  echo "✅  SECURITY.md present"
fi

# 7. Check CODEOWNERS present
if [ ! -f "$DIR/.github/CODEOWNERS" ]; then
  echo "⚠️   .github/CODEOWNERS missing"
else
  echo "✅  CODEOWNERS present"
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅  All critical checks passed."
else
  echo "❌  One or more critical checks failed. Fix before archiving."
  exit 1
fi
