import { test, expect } from '@playwright/test';
import { mockOpenLibrary } from './support/openlibrary';
import { openApp, bookCards, countText } from './support/app';

test.describe('search, filters, sort and paging', () => {
  test('home shows the default search with a total count and first page of 30', async ({ page }) => {
    await mockOpenLibrary(page);
    await openApp(page);
    await expect(page.getByRole('heading', { name: 'Your Search Result' })).toBeVisible();
    await expect(bookCards(page)).toHaveCount(30);
    await expect(countText(page)).toHaveText('30 of 75 books');
  });

  test('searching by title shows matching books', async ({ page }) => {
    await mockOpenLibrary(page);
    await openApp(page);
    await page.getByRole('textbox', { name: 'Search books by title' }).fill('hobbit');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(bookCards(page)).toHaveCount(1);
    await expect(bookCards(page).first()).toContainText('The Hobbit');
  });

  test('a search with no matches shows an empty state, not a blank page', async ({ page }) => {
    await mockOpenLibrary(page);
    await openApp(page);
    await page.getByRole('textbox', { name: 'Search books by title' }).fill('zzzzqqqq');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No Search Result Found!' })).toBeVisible();
    await expect(page.getByText('No books found for that search')).toBeVisible();
  });

  test('"Load more" fetches the next pages until everything is loaded', async ({ page }) => {
    const rec = await mockOpenLibrary(page);
    await openApp(page);
    await page.getByRole('button', { name: 'Load more books' }).click();
    await expect(bookCards(page)).toHaveCount(60);
    await expect(countText(page)).toHaveText('60 of 75 books');
    await page.getByRole('button', { name: 'Load more books' }).click();
    await expect(bookCards(page)).toHaveCount(75);
    await expect(page.getByRole('button', { name: 'Load more books' })).toHaveCount(0);
    expect(rec.searches().map((u) => u.searchParams.get('page'))).toEqual(['1', '2', '3']);
  });

  test('language filter is sent to the API and applies to the whole result set', async ({ page }) => {
    const rec = await mockOpenLibrary(page);
    await openApp(page);
    await page.getByLabel('Filter by language').selectOption('fre');
    await expect(countText(page)).toHaveText('25 of 25 books');
    const q = decodeURIComponent(rec.searches().at(-1)!.searchParams.get('q') || '');
    expect(q).toContain('language:fre');
  });

  test('earliest-year filter narrows results across pages', async ({ page }) => {
    const rec = await mockOpenLibrary(page);
    await openApp(page);
    await page.getByLabel('Filter by earliest publish year').fill('2000');
    // books from 2000 to 2024 = 25, plus none from the Hobbit (1937)
    await expect(countText(page)).toHaveText('25 of 25 books');
    expect(decodeURIComponent(rec.searches().at(-1)!.searchParams.get('q') || '')).toContain('first_publish_year:[2000 TO *]');
  });

  test('an invalid year is ignored and explained', async ({ page }) => {
    const rec = await mockOpenLibrary(page);
    await openApp(page);
    await page.getByLabel('Filter by earliest publish year').fill('12345');
    await expect(page.getByText('Enter a year with up to 4 digits')).toBeVisible();
    await page.waitForTimeout(900); // longer than the 500ms typing pause
    expect(rec.searches()).toHaveLength(1); // no extra request was made
  });

  test('typing a year sends one request after typing stops, and keeps focus', async ({ page }) => {
    const rec = await mockOpenLibrary(page);
    await openApp(page);
    const year = page.getByLabel('Filter by earliest publish year');
    await year.click();
    await page.keyboard.type('1990', { delay: 60 });
    await expect(year).toBeFocused();
    await expect.poll(() => rec.searches().length).toBe(2);
    expect(decodeURIComponent(rec.searches().at(-1)!.searchParams.get('q') || '')).toContain('[1990 TO *]');
  });

  test('subject filter, combined filters and reset', async ({ page }) => {
    await mockOpenLibrary(page);
    await openApp(page);
    await page.getByLabel('Filter by subject').selectOption('Romance');
    await expect(countText(page)).not.toHaveText('30 of 75 books');
    await page.getByLabel('Filter by language').selectOption('fre');
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(countText(page)).toHaveText('30 of 75 books');
    await expect(page.getByLabel('Filter by language')).toHaveValue('all');
  });

  test('filters that match nothing show an empty state with a reset button', async ({ page }) => {
    await mockOpenLibrary(page);
    await openApp(page);
    await page.getByLabel('Filter by earliest publish year').fill('2999');
    await expect(page.getByText('No books match these filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(bookCards(page)).toHaveCount(30);
  });

  test('"Newest first" asks the API for newest and shows newest first', async ({ page }) => {
    const rec = await mockOpenLibrary(page);
    await openApp(page);
    await page.getByLabel('Sort results', { exact: true }).selectOption('newest');
    await expect(bookCards(page).first()).toContainText('Outlander Volume 74');
    expect(rec.searches().at(-1)!.searchParams.get('sort')).toBe('new');
  });

  test('"Title A-Z" sorts the loaded books without another API request', async ({ page }) => {
    const rec = await mockOpenLibrary(page);
    await openApp(page);
    const before = rec.searches().length;
    await page.getByLabel('Sort results', { exact: true }).selectOption('title');
    await expect(bookCards(page).first()).toContainText('Outlander');
    const titles = await bookCards(page).locator('.title').allInnerTexts();
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    expect(rec.searches().length).toBe(before);
  });

  test('a new search clears the filters', async ({ page }) => {
    await mockOpenLibrary(page);
    await openApp(page);
    await page.getByLabel('Filter by language').selectOption('fre');
    await page.getByRole('textbox', { name: 'Search books by title' }).fill('outlander');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByLabel('Filter by language')).toHaveValue('all');
  });
});
