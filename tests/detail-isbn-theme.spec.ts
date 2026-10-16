import { test, expect } from '@playwright/test';
import { mockOpenLibrary } from './support/openlibrary';
import { openApp, bookCards } from './support/app';

test.describe('core flows', () => {
  test('search result -> detail page with description, subjects and similar books', async ({ page }) => {
    await mockOpenLibrary(page);
    await openApp(page);
    await bookCards(page).first().getByRole('link').click();
    await expect(page.getByText('Outlander - test description.')).toBeVisible();
    await expect(page.getByText('Author:', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Similar Books' })).toBeVisible();
    await expect(page.locator('.similar-card')).not.toHaveCount(0);
    // never recommends the book itself
    await expect(page.locator('.similar-card', { hasText: /^Outlander$/ })).toHaveCount(0);
  });

  test('ISBN lookup shows the edition details', async ({ page }) => {
    await mockOpenLibrary(page);
    await openApp(page, '/isbn-check');
    await page.getByLabel('Enter ISBN').fill('9780747532699');
    await page.getByLabel('Enter ISBN').press('Enter');
    await expect(page.getByRole('heading', { name: /Harry Potter/ })).toBeVisible();
    await expect(page.getByText('Bloomsbury')).toBeVisible();
  });

  test('barcode scan without BarcodeDetector support shows an honest notice', async ({ page }) => {
    await page.addInitScript(() => { delete (window as any).BarcodeDetector; });
    await mockOpenLibrary(page);
    await openApp(page, '/isbn-check');
    await page.getByRole('button', { name: /Scan barcode with camera/ }).click();
    await expect(page.getByText('does not support barcode scanning')).toBeVisible();
  });

  test('author search shows birth date and top book when expanded', async ({ page }) => {
    await mockOpenLibrary(page);
    await openApp(page, '/find-author');
    await page.getByLabel('Enter author name').fill('tolkien');
    await page.getByLabel('Enter author name').press('Enter');
    await page.getByRole('button', { name: /Tolkien/ }).click();
    await expect(page.getByText('Birth Date: 3 January 1892')).toBeVisible();
    await expect(page.getByText('Top Book: The Lord of the Rings')).toBeVisible();
  });

  test('typing an author name does not show "not found" before searching', async ({ page }) => {
    await mockOpenLibrary(page);
    await openApp(page, '/find-author');
    await page.getByLabel('Enter author name').fill('tolk');
    await expect(page.getByText('not found', { exact: false })).toHaveCount(0);
  });

  test('dark mode toggle switches the theme and is remembered after reload', async ({ page }) => {
    await mockOpenLibrary(page);
    await openApp(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click();
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    await openApp(page);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);
  });

  test('every bottom-nav page loads without a crash', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockOpenLibrary(page);
    await openApp(page);
    for (const name of ['ISBN', 'Authors', 'My Books', 'Profile', 'Home']) {
      await page.getByRole('link', { name, exact: true }).click();
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});
