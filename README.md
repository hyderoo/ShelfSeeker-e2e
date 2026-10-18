# ShelfSeeker E2E

Playwright end-to-end tests and a results dashboard for [ShelfSeeker](https://github.com/hyderoo/ShelfSeeker), a React book finder built on the OpenLibrary API.

**Latest sample report:** `docs/index.html` (open it in a browser). When the CI workflow runs on `main` it publishes the same dashboard to the `gh-pages` branch (enable GitHub Pages for that branch to get a URL).

**Allure report:** every CI run also builds a full [Allure](https://allurereport.org/) report into `docs/allure` (published alongside the dashboard). Run data and flakiness tracking are analyzed in [docs/flaky-analysis.md](docs/flaky-analysis.md).

## What is tested

78 test runs = 39 tests x 2 projects (desktop Chrome, Pixel 7 emulation):

- search, empty results, filters (language, subject, year), sort, "Load more" paging, filter reset, year debounce
- book detail, similar books, reading list (add, move shelf, remove, persistence), export to JSON, import (valid, invalid, partial, merge)
- error states: server error, network failure, slow API notice, failed "load more", detail error with retry, unknown book, offline banner, ISBN not-found vs failure, author empty vs failure
- ISBN lookup, barcode fallback notice, author search, dark mode persistence, navigation smoke test

## Important limits

The tests run against a **fake OpenLibrary** (`tests/support/openlibrary.ts`) via Playwright request interception. They prove how ShelfSeeker behaves and which requests it sends. They do **not** prove the live openlibrary.org API accepts those queries, and they do not cover a real camera, Firefox or Safari. The service worker is blocked in tests so requests can be intercepted.

## Run it

```bash
npm ci
npx playwright install chromium        # or use installed Chrome: PW_CHANNEL=chrome
npm run build:app                      # clones and builds ShelfSeeker into .app/build (APP_REF=branch, default main)
npm test                               # runs both projects, writes results/
npm run dashboard                      # builds docs/index.html from results/results.json
```

Use `APP_REF=improve/search-errors-export npm run build:app` until that branch is merged into ShelfSeeker `main`. Set `APP_DIR` to test any other build folder. The HTML report from Playwright itself is in `results/html`.

## Dashboard

`scripts/build-dashboard.mjs` turns Playwright's JSON output into a static page: totals and pass rate, trend over the last 30 runs, breakdown by project and spec file, slowest tests, failure messages with screenshots, a filterable list of all tests, and a gallery of screens. No server needed.
