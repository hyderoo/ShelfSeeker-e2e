#!/usr/bin/env bash
# Builds the ShelfSeeker app that the tests run against into ./.app/build
# APP_REPO / APP_REF can be overridden. Uses a normal production build (no mock flag).
set -euo pipefail
APP_REPO="${APP_REPO:-https://github.com/hyderoo/ShelfSeeker.git}"
APP_REF="${APP_REF:-main}"
rm -rf .app
git clone --depth 1 --branch "$APP_REF" "$APP_REPO" .app
cd .app
npm ci --no-audit --no-fund
CI=true npm run build
git rev-parse HEAD > ../app-commit.txt
echo "built ShelfSeeker @ $(cat ../app-commit.txt)"
