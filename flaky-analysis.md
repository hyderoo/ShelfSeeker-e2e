# Flaky-test analysis

Based on real run data only. Sources: CI run history published to `gh-pages`
(`history.json`), and a full local run of the suite on 2026-10-18 against
ShelfSeeker branch `improve/search-errors-export` (commit 3f909d9).

## Run record

| Run | Date | Result | Flaky |
| --- | --- | --- | --- |
| CI | 2026-10-16 | 78/78 passed | 0 |
| CI | 2026-10-16 | 78/78 passed | 0 |
| CI | 2026-10-17 | 78/78 passed | 0 |
| CI | 2026-10-18 | 78/78 passed | 0 |
| Local (Chromium 156, desktop + Pixel 7) | 2026-10-18 | 78/78 passed, 0 retries used | 0 |

## What the data says

- **No flaky tests on record.** Across 4 recorded CI runs plus one full local
  run, every test passed without needing the CI retry (`retries: 1` is
  configured, so a pass-after-retry would be counted as flaky - none seen).
- **Slowest tests** (local run, both projects): the error/slow-API scenarios
  top the list at ~8-9 s (`slow search shows a "responding slowly" notice`,
  import/merge flow, screenshot gallery). These wait on deliberate fake-API
  delays, so they are slow by design, not unstable.

## Real risks to watch

- **Branch sensitivity (observed 2026-10-18):** the suite currently runs
  against ShelfSeeker branch `improve/search-errors-export`. Running the same
  suite against `main` (commit 9561182) fails 5 error-state tests in
  `errors.spec.ts` - the fixes under test live on that branch. Until it is
  merged, a CI run pointed at `main` is a real failure signal about the
  branch, not flakiness.
- **Fake API boundary:** tests intercept network with a fake OpenLibrary, so
  real openlibrary.org drift cannot make these tests fail (documented in the
  README). Flakiness from the outside world is structurally excluded.
- **Timing waits:** the year-debounce and slow-API tests use real timeouts;
  on a loaded CI runner these are the first candidates to watch if flakes
  ever appear.

## Policy going forward

- The daily CI run publishes pass/flaky counts to the dashboard history; any
  test showing `flaky > 0` twice in a week gets investigated before new tests
  are added.
