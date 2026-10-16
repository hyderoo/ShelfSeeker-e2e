import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { mockOpenLibrary, OUTLANDER_BOOKS } from './support/openlibrary';
import { openApp } from './support/app';

const id = (i: number) => OUTLANDER_BOOKS[i].key.replace('/works/', '');

async function addToShelf(page: import('@playwright/test').Page, i: number, shelf: string) {
  await openApp(page, `/book/${id(i)}`);
  await expect(page.getByRole('button', { name: shelf, exact: true })).toBeVisible();
  await page.getByRole('button', { name: shelf, exact: true }).click();
  await expect(page.getByRole('button', { name: shelf, exact: true })).toHaveAttribute('aria-pressed', 'true');
}

test.describe('reading list', () => {
  test('add books from the detail page and see them on My Books with counts', async ({ page }) => {
    await mockOpenLibrary(page);
    await addToShelf(page, 0, 'Want to read');
    await addToShelf(page, 1, 'Done');
    await page.getByRole('link', { name: 'My Books' }).click();
    await expect(page.locator('.saved-book')).toHaveCount(2);
    await expect(page.getByRole('tab', { name: /^All/ })).toContainText('2');
    await page.getByRole('tab', { name: /^Done/ }).click();
    await expect(page.locator('.saved-book')).toHaveCount(1);
  });

  test('move a book to another shelf and remove it', async ({ page }) => {
    await mockOpenLibrary(page);
    await addToShelf(page, 0, 'Want to read');
    await page.getByRole('link', { name: 'My Books' }).click();
    await page.getByLabel(/^Shelf for/).selectOption('reading');
    await page.getByRole('tab', { name: /^Reading/ }).click();
    await expect(page.locator('.saved-book')).toHaveCount(1);
    await page.getByRole('button', { name: /^Remove .* from reading list/ }).click();
    await expect(page.getByText('No books on this shelf yet.')).toBeVisible();
  });

  test('the list survives a reload (localStorage)', async ({ page }) => {
    await mockOpenLibrary(page);
    await addToShelf(page, 0, 'Reading');
    await openApp(page, '/reading-list');
    await expect(page.locator('.saved-book')).toHaveCount(1);
  });

  test('export is disabled when the list is empty', async ({ page }) => {
    await mockOpenLibrary(page);
    await openApp(page, '/reading-list');
    await expect(page.getByRole('button', { name: 'Export list' })).toBeDisabled();
  });

  test('export downloads a JSON file with the saved books', async ({ page }) => {
    await mockOpenLibrary(page);
    await addToShelf(page, 0, 'Want to read');
    await addToShelf(page, 1, 'Done');
    await openApp(page, '/reading-list');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export list' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^shelfseeker-reading-list-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    expect(data.format).toBe('shelfseeker-reading-list');
    expect(data.items.map((i: { id: string; status: string }) => [i.id, i.status]).sort()).toEqual(
      [[id(0), 'want'], [id(1), 'done']].sort()
    );
    await expect(page.getByText('Exported 2 books.')).toBeVisible();
  });

  test('import restores a list in a fresh browser, merge reports what changed', async ({ page, browser }, testInfo) => {
    await mockOpenLibrary(page);
    await addToShelf(page, 0, 'Want to read');
    await openApp(page, '/reading-list');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export list' }).click(),
    ]);
    const file = testInfo.outputPath('export.json');
    await download.saveAs(file);

    const fresh = await browser.newContext({ serviceWorkers: 'block', baseURL: testInfo.project.use.baseURL });
    const page2 = await fresh.newPage();
    await mockOpenLibrary(page2);
    await openApp(page2, '/reading-list');
    await expect(page2.locator('.saved-book')).toHaveCount(0);
    await page2.locator('input[type=file]').setInputFiles(file);
    await expect(page2.getByText('Import done: 1 added, 0 moved to a different shelf.')).toBeVisible();
    await expect(page2.locator('.saved-book')).toHaveCount(1);
    // importing the same file again changes nothing
    await page2.locator('input[type=file]').setInputFiles(file);
    await expect(page2.getByText('Import done: 0 added, 0 moved to a different shelf.')).toBeVisible();
    await expect(page2.locator('.saved-book')).toHaveCount(1);
    await fresh.close();
  });

  test('importing a bad file shows an error and keeps the existing list', async ({ page }, testInfo) => {
    await mockOpenLibrary(page);
    await addToShelf(page, 0, 'Done');
    await openApp(page, '/reading-list');
    const bad = testInfo.outputPath('bad.json');
    fs.writeFileSync(bad, '{"hello":"world"}');
    await page.locator('input[type=file]').setInputFiles(bad);
    await expect(page.getByRole('alert')).toContainText('not a ShelfSeeker reading list export');
    const notJson = testInfo.outputPath('notjson.json');
    fs.writeFileSync(notJson, 'this is not json');
    await page.locator('input[type=file]').setInputFiles(notJson);
    await expect(page.getByRole('alert')).toContainText('not valid JSON');
    await expect(page.locator('.saved-book')).toHaveCount(1);
  });

  test('invalid entries inside a valid export are skipped and counted', async ({ page }, testInfo) => {
    await mockOpenLibrary(page);
    await openApp(page, '/reading-list');
    const file = testInfo.outputPath('partial.json');
    fs.writeFileSync(file, JSON.stringify({
      format: 'shelfseeker-reading-list', version: 1,
      items: [
        { id: 'OL1W', title: 'Good', status: 'want' },
        { id: 'OL2W', title: 'Bad status', status: 'nope' },
        { title: 'No id', status: 'done' },
      ],
    }));
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.getByText('Import done: 1 added, 0 moved to a different shelf, 2 skipped (invalid).')).toBeVisible();
  });
});
