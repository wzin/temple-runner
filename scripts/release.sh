#!/usr/bin/env bash
# Cut a release: write VERSION, commit, tag vX.Y.Z, push branch and tag.
# Usage: scripts/release.sh 0.4.0
set -euo pipefail
v="${1:?usage: scripts/release.sh X.Y.Z}"
[[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must be X.Y.Z" >&2; exit 1; }
cd "$(dirname "$0")/.."
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean" >&2; exit 1; }
echo "$v" > VERSION
git add VERSION
git diff --cached --quiet || git commit -m "release: v$v"
git tag -a "v$v" -m "Temple Runner v$v"
git push origin main "v$v"
echo "released v$v — Komodo redeploys from main; the UI shows v$v"
