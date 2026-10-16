import { expect, type Page } from '@playwright/test';

/** Open a path and wait for the 2s splash screen to finish. */
export async function openApp(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible({ timeout: 15_000 });
}

export const bookCards = (page: Page) => page.locator('.book-item');
export const countText = (page: Page) => page.locator('.filter-count');
