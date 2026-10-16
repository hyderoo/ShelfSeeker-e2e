import type { Page, Route } from '@playwright/test';

// A small fake of the OpenLibrary endpoints ShelfSeeker calls.
// It lives in the test repo on purpose: these tests check the ShelfSeeker UI
// against the API *shape* we expect, not the real openlibrary.org service.

export interface Doc {
  key: string;
  title: string;
  author_name: string[];
  first_publish_year: number;
  edition_count: number;
  language: string[];
  subject: string[];
}

const SUBJECTS = ['Time travel', 'Scotland', 'Historical fiction', 'Romance', 'Fantasy fiction'];

// 75 "Outlander ..." books so paging (30 per page) has 3 pages.
export const OUTLANDER_BOOKS: Doc[] = Array.from({ length: 75 }, (_, i) => ({
  key: `/works/OL${1000 + i}W`,
  title: i === 0 ? 'Outlander' : `Outlander Volume ${String(i).padStart(2, '0')}`,
  author_name: ['Diana Gabaldon'],
  first_publish_year: 1950 + i,
  edition_count: 5 + i,
  language: i % 3 === 0 ? ['eng', 'ind'] : i % 3 === 1 ? ['eng'] : ['fre'],
  subject: [SUBJECTS[i % 5], SUBJECTS[(i + 1) % 5]],
}));

export const HOBBIT: Doc = {
  key: '/works/OL9999W',
  title: 'The Hobbit',
  author_name: ['J. R. R. Tolkien'],
  first_publish_year: 1937,
  edition_count: 310,
  language: ['eng'],
  subject: ['Fantasy fiction', 'Dragons'],
};

const ALL = [...OUTLANDER_BOOKS, HOBBIT];

export interface Options {
  /** override a route. Return true after fulfilling/aborting the request; anything else falls back to the default fake. */
  search?: (url: URL, route: Route) => Promise<boolean | void> | boolean | void;
  detail?: (url: URL, route: Route) => Promise<boolean | void> | boolean | void;
  isbn?: (url: URL, route: Route) => Promise<boolean | void> | boolean | void;
  authors?: (url: URL, route: Route) => Promise<boolean | void> | boolean | void;
}

export interface Recorder {
  /** every request URL that reached the fake OpenLibrary, in order */
  requests: URL[];
  searches(): URL[];
}

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

function runSearch(url: URL) {
  const q = url.searchParams.get('q');
  let docs = ALL;
  if (q) {
    const pick = (re: RegExp) => (q.match(re) || [])[1];
    const title = (pick(/title:"([^"]*)"/) || '').toLowerCase();
    const language = pick(/language:(\w+)/);
    const subject = (pick(/subject:"([^"]*)"/) || '').toLowerCase();
    const year = pick(/first_publish_year:\[(\d+) TO/);
    docs = docs.filter((b) => b.title.toLowerCase().includes(title));
    if (language) docs = docs.filter((b) => b.language.includes(language));
    if (subject) docs = docs.filter((b) => b.subject.some((s) => s.toLowerCase() === subject));
    if (year) docs = docs.filter((b) => b.first_publish_year >= Number(year));
  } else {
    const title = (url.searchParams.get('title') || '').toLowerCase();
    docs = docs.filter((b) => b.title.toLowerCase().includes(title));
  }
  const sort = url.searchParams.get('sort');
  if (sort === 'new') docs = [...docs].sort((a, b) => b.first_publish_year - a.first_publish_year);
  if (sort === 'old') docs = [...docs].sort((a, b) => a.first_publish_year - b.first_publish_year);
  const limit = Number(url.searchParams.get('limit')) || 100;
  const page = Number(url.searchParams.get('page')) || 1;
  return { numFound: docs.length, start: (page - 1) * limit, docs: docs.slice((page - 1) * limit, page * limit) };
}

export async function mockOpenLibrary(page: Page, options: Options = {}): Promise<Recorder> {
  const requests: URL[] = [];

  await page.route('https://covers.openlibrary.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL })
  );

  await page.route('https://openlibrary.org/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const path = url.pathname;

    const handlers: [RegExp, Options[keyof Options]][] = [
      [/^\/search\.json$/, options.search],
      [/^\/works\//, options.detail],
      [/^\/isbn\//, options.isbn],
      [/^\/search\/authors\.json$/, options.authors],
    ];
    for (const [re, handler] of handlers) {
      if (re.test(path) && handler) {
        // an override returns true once it has fulfilled or aborted the request
        if ((await handler(url, route)) === true) return;
      }
    }

    if (path === '/search.json') return json(route, runSearch(url));

    if (path.startsWith('/works/')) {
      const key = path.replace('.json', '');
      const book = ALL.find((b) => b.key === key);
      if (!book) return json(route, { error: 'notfound' }, 404);
      return json(route, {
        title: book.title,
        description: { type: '/type/text', value: `${book.title} - test description.` },
        subjects: book.subject,
        authors: [{ author: { key: '/authors/OL1A' } }],
      });
    }
    if (path.startsWith('/authors/')) return json(route, { name: 'Diana Gabaldon' });
    if (path.startsWith('/subjects/')) {
      return json(route, {
        works: ALL.slice(1, 5).map((b) => ({ key: b.key, title: b.title, authors: [{ name: b.author_name[0] }] })),
      });
    }
    if (path.startsWith('/isbn/')) {
      if (path.includes('9780747532699')) {
        return json(route, {
          title: "Harry Potter and the Philosopher's Stone",
          isbn_13: ['9780747532699'],
          isbn_10: ['0747532699'],
          publishers: ['Bloomsbury'],
          publish_date: '1997',
          authors: [{ key: '/authors/OL1A' }],
        });
      }
      return json(route, { error: 'notfound' }, 404);
    }
    if (path === '/search/authors.json') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const docs = q.includes('tolkien')
        ? [{ key: 'OL26320A', name: 'J. R. R. Tolkien', birth_date: '3 January 1892', top_work: 'The Lord of the Rings' }]
        : [];
      return json(route, { numFound: docs.length, docs });
    }
    return json(route, { error: 'no fake for ' + path }, 404);
  });

  return {
    requests,
    searches: () => requests.filter((u) => u.pathname === '/search.json'),
  };
}
