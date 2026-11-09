#!/bin/sh
# Nasazení na školní server: stáhne repo, postaví statický web a zkopíruje dist/ do ~/WWW.
#
#   bash ~/mff-tools/scripts/deploy.sh
#
# Repo leží MIMO ~/WWW (např. ~/mff-tools); do ~/WWW jde jen obsah dist/.
# Cesty jdou změnit proměnnými: REPO_DIR=~/jinde WWW_DIR=~/WWW bash deploy.sh
# Když cokoli selže (pull, instalace, build), skript skončí a web zůstane ve staré verzi.

set -eu

REPO_DIR="${REPO_DIR:-$HOME/mff-tools}"
WWW_DIR="${WWW_DIR:-$HOME/WWW}"

cd "$REPO_DIR"

echo "==> git pull"
git pull --ff-only

echo "==> npm ci"
npm ci --no-audit --no-fund

echo "==> npm run build"
npm run build

# pojistka: nekopírovat neúplný build
for f in index.html "kalkulačka/index.html" specializace/index.html algo/index.html data/years.json; do
  if [ ! -f "dist/$f" ]; then
    echo "CHYBA: v dist/ chybí $f – nic se nekopíruje." >&2
    exit 1
  fi
done

echo "==> kopíruji dist/ do $WWW_DIR"
mkdir -p "$WWW_DIR"
cp -R dist/. "$WWW_DIR/"

echo "Nasazeno: $(git log -1 --format='%h %s (%cd)' --date=short)"
