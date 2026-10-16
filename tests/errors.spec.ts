import { test, expect } from '@playwright/test';
import { mockOpenLibrary, OUTLANDER_BOOKS } from './support/openlibrary';
import { openApp, bookCards } from './support/app';

const id0 = OUTLANDER_BOOKS[0].key.replace('/works/', '');

test.describe('error, slow and offline states', () => {
  test('search server error shows a message and Try again recovers', async ({ page }) => {
    let fail = true;
    await mockOpenLibrary(page, {
      search: async (_u, route) => {
        if (!fail) return false;
        await route.fulfill({ status: 503, body: 'down' });
        return true;
      },
    });
    await openApp(page);
    await expect(page.getByRole('alert')).toContainText('OpenLibrary is having problems');
    await expect(bookCards(page)).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(bookCards(page)).toHaveCount(30);
  });

  test('network failure shows a connection message', async ({ page }) => {
    await mockOpenLibrary(page, { search: async (_u, route) => { await route.abort('failed'); return true; } });
    await openApp(page);
    await expect(page.getByRole('alert')).toContainText('Could not reach OpenLibrary');
  });

  test('a slow search shows a "responding slowly" notice and then the results', async ({ page }) => {
    test.setTimeout(40_000);
    await mockOpenLibrary(page, {
      search: async (_u, route) => {
        await new Promise((r) => setTimeout(r, 7500));
        return false; // then fall through to the default fake
      },
    });
    await openApp(page);
    await expect(page.getByText('OpenLibrary is responding slowly')).toBeVisible({ timeout: 15_000 });
    await expect(bookCards(page)).toHaveCount(30, { timeout: 15_000 });
  });

  test('failure while loading more keeps the books already shown', async ({ page }) => {
    await mockOpenLibrary(page, {
      search: async (u, route) => {
        if (u.searchParams.get('page') === '2') { await route.fulfill({ status: 500, body: '' }); return true; }
        return false;
      },
    });
    await openApp(page);
    await page.getByRole('button', { name: 'Load more books' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(bookCards(page)).toHaveCount(30);
  });

  test('book detail error offers Try again instead of an endless spinner', async ({ page }) => {
    let fail = true;
    await mockOpenLibrary(page, {
      detail: async (_u, route) => {
        if (!fail) return false;
        await route.fulfill({ status: 500, body: '' });
        return true;
      },
    });
    await openApp(page, `/book/${id0}`);
    await expect(page.getByRole('alert')).toContainText('OpenLibrary is having problems');
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Reading list:')).toBeVisible();
  });

  test('unknown book id says it was not found', async ({ page }) => {
    await mockOpenLibrary(page);
    await openApp(page, '/book/OL0000000W');
    await expect(page.getByRole('alert')).toContainText('could not find that');
  });

  test('going offline shows the offline banner and an offline-specific search error', async ({ page, context }) => {
    await mockOpenLibrary(page, {
      // page.route() answers even when the context is offline, so simulate the failed fetch
      search: async (_u, route) => { await route.abort('internetdisconnected'); return true; },
    });
    await openApp(page);
    await context.setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Search books by title' }).fill('hobbit');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('You are offline');
    await context.setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toHaveCount(0);
  });

  test('ISBN: not in catalogue vs lookup failure are different messages', async ({ page }) => {
    let mode: 'ok' | 'down' = 'ok';
    await mockOpenLibrary(page, {
      isbn: async (_u, route) => {
        if (mode === 'down') { await route.fulfill({ status: 500, body: '' }); return true; }
        return false;
      },
    });
    await openApp(page, '/isbn-check');
    await page.getByLabel('Enter ISBN').fill('0000000000');
    await page.getByRole('button', { name: 'Check ISBN' }).click();
    await expect(page.getByText('not in the OpenLibrary catalogue')).toBeVisible();
    mode = 'down';
    await page.getByRole('button', { name: 'Check ISBN' }).click();
    await expect(page.getByRole('alert')).toContainText('OpenLibrary is having problems');
    await expect(page.getByText('not in the OpenLibrary catalogue')).toHaveCount(0);
  });

  test('author search: empty result and failure are both explained', async ({ page }) => {
    let down = false;
    await mockOpenLibrary(page, {
      authors: async (_u, route) => {
        if (down) { await route.fulfill({ status: 500, body: '' }); return true; }
        return false;
      },
    });
    await openApp(page, '/find-author');
    await page.getByLabel('Enter author name').fill('nobodyatall');
    await page.getByLabel('Enter author name').press('Enter');
    await expect(page.getByText('No authors found for that name')).toBeVisible();
    down = true;
    await page.getByLabel('Enter author name').press('Enter');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('No authors found for that name')).toHaveCount(0);
  });
});
