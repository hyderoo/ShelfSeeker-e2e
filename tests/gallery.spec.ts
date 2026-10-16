import { test } from '@playwright/test';
import { mockOpenLibrary, OUTLANDER_BOOKS } from './support/openlibrary';
import { openApp } from './support/app';

// Not assertions: these save screenshots that the dashboard shows next to the results,
// so a reviewer can see what the tests were looking at (fixture data, not live OpenLibrary).
const shot = (name: string) => `results/gallery/${name}.png`;

test.describe('gallery', () => {
  test('screens', async ({ page }, testInfo) => {
    const p = testInfo.project.name;
    const rec = await mockOpenLibrary(page);
    void rec;
    await openApp(page);
    await page.locator('.book-item').first().waitFor();
    await page.getByLabel('Filter by language').selectOption('fre');
    await page.locator('.filter-count').filter({ hasText: '25 of 25' }).waitFor();
    await page.screenshot({ path: shot(`${p}-filtered-search`) });

    const id = OUTLANDER_BOOKS[3].key.replace('/works/', '');
    await openApp(page, `/book/${id}`);
    await page.getByRole('button', { name: 'Want to read', exact: true }).click();
    await openApp(page, '/reading-list');
    await page.locator('.saved-book').first().waitFor();
    await page.screenshot({ path: shot(`${p}-reading-list-export-import`) });

    await page.getByRole('button', { name: /Switch to dark mode/ }).click();
    await page.screenshot({ path: shot(`${p}-dark-reading-list`) });
  });

  test('error state', async ({ page }, testInfo) => {
    await mockOpenLibrary(page, { search: async (_u, route) => { await route.fulfill({ status: 503, body: '' }); return true; } });
    await openApp(page);
    await page.getByRole('alert').waitFor();
    await page.screenshot({ path: shot(`${testInfo.project.name}-search-error`) });
  });
});
