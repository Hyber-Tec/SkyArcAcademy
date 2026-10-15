#!/usr/bin/env bash
# Runs the Firestore rules tests in the emulator. The emulator needs Java 21+.
set -euo pipefail
for home in /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home /usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home; do
  if [ -x "$home/bin/java" ]; then export JAVA_HOME="$home"; export PATH="$home/bin:$PATH"; break; fi
done
# The pinned CLI unless one is installed (CI has none).
if command -v firebase >/dev/null; then FIREBASE=(firebase); else FIREBASE=(npx --yes firebase-tools@15.32.1); fi
exec "${FIREBASE[@]}" emulators:exec --only firestore --project demo-skyarc "npx vitest run --root tests/rules"
