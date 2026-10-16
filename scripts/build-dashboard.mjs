// Turns results/results.json (Playwright JSON reporter) into a static dashboard in ./docs
// - docs/index.html   self-contained report page
// - docs/history.json last 30 runs, used for the trend chart
// - docs/screens/     failure screenshots + gallery images
import fs from 'node:fs';
import path from 'node:path';

const RESULTS = 'results/results.json';
const DOCS = 'docs';
const HISTORY = path.join(DOCS, 'history.json');
if (!fs.existsSync(RESULTS)) { console.error('No results/results.json - run the tests first.'); process.exit(1); }

const report = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
fs.mkdirSync(path.join(DOCS, 'screens'), { recursive: true });

// ---- flatten tests -------------------------------------------------------
const tests = [];
const walk = (suite, file) => {
  const f = suite.file || file;
  (suite.specs || []).forEach((spec) => {
    spec.tests.forEach((t) => {
      const last = t.results[t.results.length - 1] || {};
      const status = t.status === 'expected' ? 'passed' : t.status === 'skipped' ? 'skipped' : t.status === 'flaky' ? 'flaky' : 'failed';
      const shots = [];
      if (status === 'failed' || status === 'flaky') {
        (last.attachments || []).filter((a) => a.contentType === 'image/png' && a.path).forEach((a, i) => {
          const name = `fail-${tests.length}-${i}.png`;
          try { fs.copyFileSync(a.path, path.join(DOCS, 'screens', name)); shots.push(`screens/${name}`); } catch { /* artifact gone */ }
        });
      }
      tests.push({
        file: f, title: spec.title, project: t.projectName, status,
        duration: t.results.reduce((s, r) => s + (r.duration || 0), 0),
        retries: t.results.length - 1,
        error: status === 'failed' || status === 'flaky' ? stripAnsi((last.error && (last.error.message || '')) || '') : '',
        shots,
      });
    });
  });
  (suite.suites || []).forEach((s) => walk(s, f));
};
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '').slice(0, 1500);
(report.suites || []).forEach((s) => walk(s, s.file));

const count = (s) => tests.filter((t) => t.status === s).length;
const summary = {
  total: tests.length, passed: count('passed'), failed: count('failed'), flaky: count('flaky'), skipped: count('skipped'),
  durationMs: Math.round(report.stats ? report.stats.duration : tests.reduce((s, t) => s + t.duration, 0)),
  date: (report.stats && report.stats.startTime) || new Date().toISOString(),
};
summary.passRate = summary.total ? Math.round(((summary.passed + summary.flaky) / (summary.total - summary.skipped || 1)) * 1000) / 10 : 0;

const appCommit = fs.existsSync('app-commit.txt') ? fs.readFileSync('app-commit.txt', 'utf8').trim() : (process.env.APP_COMMIT || 'unknown');
const meta = { appCommit, appRef: process.env.APP_REF || 'unknown', playwright: report.config?.version || '', runId: process.env.GITHUB_RUN_ID || 'local' };

// ---- history ---------------------------------------------------------------
let history = [];
try { history = JSON.parse(fs.readFileSync(HISTORY, 'utf8')); } catch { /* first run */ }
history.push({ date: summary.date, total: summary.total, passed: summary.passed, failed: summary.failed, flaky: summary.flaky, durationMs: summary.durationMs, appCommit: appCommit.slice(0, 7) });
history = history.slice(-30);
fs.writeFileSync(HISTORY, JSON.stringify(history, null, 2));

// ---- gallery ---------------------------------------------------------------
const gallery = [];
if (fs.existsSync('results/gallery')) {
  fs.readdirSync('results/gallery').filter((f) => f.endsWith('.png')).sort().forEach((f) => {
    fs.copyFileSync(path.join('results/gallery', f), path.join(DOCS, 'screens', `gallery-${f}`));
    gallery.push({ file: `screens/gallery-${f}`, label: f.replace('.png', '').replace(/-/g, ' ') });
  });
}

// ---- breakdowns -------------------------------------------------------------
const group = (key) => {
  const m = new Map();
  tests.forEach((t) => {
    const k = key(t);
    const g = m.get(k) || { name: k, passed: 0, failed: 0, flaky: 0, skipped: 0, ms: 0 };
    g[t.status] += 1; g.ms += t.duration; m.set(k, g);
  });
  return [...m.values()];
};
const byFile = group((t) => t.file.replace(/^tests\//, ''));
const byProject = group((t) => t.project);
const slowest = [...tests].sort((a, b) => b.duration - a.duration).slice(0, 5);

const data = { summary, meta, tests, byFile, byProject, slowest, history, gallery };
fs.writeFileSync(path.join(DOCS, 'data.json'), JSON.stringify(data, null, 2));

// ---- html -------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const secs = (ms) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s` : `${(ms / 1000).toFixed(1)}s`);
const bar = (g) => {
  const tot = g.passed + g.failed + g.flaky + g.skipped || 1;
  const seg = (n, c) => (n ? `<span style="width:${(n / tot) * 100}%;background:${c}" title="${n}"></span>` : '');
  return `<div class="bar">${seg(g.passed, 'var(--pass)')}${seg(g.flaky, 'var(--flaky)')}${seg(g.failed, 'var(--fail)')}${seg(g.skipped, 'var(--skip)')}</div>`;
};
const trend = () => {
  if (history.length < 2) return '<p class="muted">The trend chart appears after the second run.</p>';
  const W = 640, H = 120, max = Math.max(...history.map((h) => h.total), 1);
  const bw = Math.min(28, W / history.length - 4);
  const bars = history.map((h, i) => {
    const x = i * (W / history.length) + 2;
    const ph = (h.passed / max) * (H - 20), fh = ((h.failed + h.flaky) / max) * (H - 20);
    return `<g><title>${esc(h.date.slice(0, 16))} - ${h.passed} passed, ${h.failed} failed, ${h.flaky} flaky (app ${esc(h.appCommit)})</title>
      <rect x="${x}" y="${H - ph}" width="${bw}" height="${ph}" fill="var(--pass)"/>
      <rect x="${x}" y="${H - ph - fh}" width="${bw}" height="${fh}" fill="var(--fail)"/></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pass/fail per run, last ${history.length} runs">${bars}</svg>`;
};

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ShelfSeeker E2E report</title>
<style>
:root{--pass:#2e9e5b;--fail:#d6342c;--flaky:#e0a21a;--skip:#9aa0a6;--bg:#faf7f2;--card:#fff;--text:#1c1b1a;--muted:#6b665e;--line:#ece5dc;--accent:#eb753e}
@media(prefers-color-scheme:dark){:root{--bg:#17140e;--card:#26221a;--text:#f3ede3;--muted:#b5ab9b;--line:#3d3629}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--text)}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px}h1{margin:0 0 4px;font-size:26px}h2{margin:32px 0 12px;font-size:18px}
.muted{color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.card b{display:block;font-size:28px}
.card.pass b{color:var(--pass)}.card.fail b{color:var(--fail)}.card.flaky b{color:var(--flaky)}
.bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--line);min-width:120px}.bar span{display:block}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}th{font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)}
.pill{display:inline-block;padding:1px 9px;border-radius:99px;color:#fff;font-size:12px;font-weight:600}
.pill.passed{background:var(--pass)}.pill.failed{background:var(--fail)}.pill.flaky{background:var(--flaky)}.pill.skipped{background:var(--skip)}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.toolbar input,.toolbar select{padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);font:inherit}
pre{white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px;font-size:12px;max-height:220px;overflow:auto}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}.gallery figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px}
.gallery img{width:100%;height:auto;border-radius:8px}.gallery figcaption{font-size:12px;color:var(--muted);text-transform:capitalize;margin-top:4px}
svg{width:100%;max-width:640px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px}
.note{background:var(--card);border-left:4px solid var(--accent);padding:10px 14px;border-radius:6px}
tr.hidden{display:none}
</style></head><body><main>
<h1>ShelfSeeker E2E report</h1>
<p class="muted">Run ${esc(summary.date.slice(0, 16).replace('T', ' '))} UTC &middot; app commit <code>${esc(appCommit.slice(0, 7))}</code> (${esc(meta.appRef)}) &middot; Playwright ${esc(meta.playwright)} &middot; ${secs(summary.durationMs)}</p>
<div class="note"><b>What this covers.</b> The tests drive a real production build of ShelfSeeker in Chromium (desktop and Pixel 7 emulation) against a <em>fake OpenLibrary</em> defined in the test repo. They verify the app's behaviour, request URLs and error handling. They do <b>not</b> verify that the live openlibrary.org API accepts the same queries, and they do not test a real camera, Firefox or Safari.</div>

<h2>Summary</h2>
<div class="cards">
  <div class="card"><span class="muted">Total</span><b>${summary.total}</b></div>
  <div class="card pass"><span class="muted">Passed</span><b>${summary.passed}</b></div>
  <div class="card fail"><span class="muted">Failed</span><b>${summary.failed}</b></div>
  <div class="card flaky"><span class="muted">Flaky (passed on retry)</span><b>${summary.flaky}</b></div>
  <div class="card"><span class="muted">Skipped</span><b>${summary.skipped}</b></div>
  <div class="card"><span class="muted">Pass rate</span><b>${summary.passRate}%</b></div>
</div>

<h2>Trend (last ${history.length} run${history.length === 1 ? '' : 's'})</h2>
${trend()}

<h2>By browser project</h2>
<table><thead><tr><th>Project</th><th>Result</th><th>Passed</th><th>Failed</th><th>Flaky</th><th>Time</th></tr></thead><tbody>
${byProject.map((g) => `<tr><td>${esc(g.name)}</td><td>${bar(g)}</td><td>${g.passed}</td><td>${g.failed}</td><td>${g.flaky}</td><td>${secs(g.ms)}</td></tr>`).join('')}
</tbody></table>

<h2>By spec file</h2>
<table><thead><tr><th>File</th><th>Result</th><th>Passed</th><th>Failed</th><th>Flaky</th><th>Time</th></tr></thead><tbody>
${byFile.map((g) => `<tr><td>${esc(g.name)}</td><td>${bar(g)}</td><td>${g.passed}</td><td>${g.failed}</td><td>${g.flaky}</td><td>${secs(g.ms)}</td></tr>`).join('')}
</tbody></table>

<h2>Slowest tests</h2>
<table><tbody>${slowest.map((t) => `<tr><td>${esc(t.title)} <span class="muted">(${esc(t.project)})</span></td><td>${secs(t.duration)}</td></tr>`).join('')}</tbody></table>

${summary.failed + summary.flaky ? `<h2>Failures and flaky tests</h2>${tests.filter((t) => t.status === 'failed' || t.status === 'flaky').map((t) => `
<div class="card" style="margin-bottom:12px"><span class="pill ${t.status}">${t.status}</span> <b style="font-size:15px;display:inline">${esc(t.title)}</b> <span class="muted">${esc(t.project)} &middot; ${esc(t.file)}</span>
<pre>${esc(t.error || '(no message)')}</pre>${t.shots.map((s) => `<a href="${s}"><img src="${s}" alt="failure screenshot" style="max-width:320px;border-radius:8px"></a>`).join(' ')}</div>`).join('')}` : '<h2>Failures</h2><p class="muted">None in this run.</p>'}

<h2>All tests</h2>
<div class="toolbar"><input id="q" placeholder="Filter by title or file" aria-label="Filter tests"><select id="st" aria-label="Status"><option value="">All statuses</option><option>passed</option><option>failed</option><option>flaky</option><option>skipped</option></select></div>
<table id="all"><thead><tr><th>Status</th><th>Test</th><th>Project</th><th>File</th><th>Time</th></tr></thead><tbody>
${tests.map((t) => `<tr data-s="${t.status}" data-t="${esc((t.title + ' ' + t.file).toLowerCase())}"><td><span class="pill ${t.status}">${t.status}</span></td><td>${esc(t.title)}</td><td>${esc(t.project)}</td><td>${esc(t.file.replace(/^tests\//, ''))}</td><td>${secs(t.duration)}</td></tr>`).join('')}
</tbody></table>

${gallery.length ? `<h2>Screens the tests looked at (fixture data)</h2><div class="gallery">${gallery.map((g) => `<figure><a href="${g.file}"><img src="${g.file}" alt="${esc(g.label)}" loading="lazy"></a><figcaption>${esc(g.label)}</figcaption></figure>`).join('')}</div>` : ''}

<script>
const q=document.getElementById('q'),st=document.getElementById('st');
function f(){const t=q.value.toLowerCase(),s=st.value;document.querySelectorAll('#all tbody tr').forEach(r=>{r.classList.toggle('hidden',!(r.dataset.t.includes(t)&&(!s||r.dataset.s===s)))})}
q.oninput=f;st.onchange=f;
</script>
</main></body></html>`;
fs.writeFileSync(path.join(DOCS, 'index.html'), html);
console.log(`Dashboard written to docs/index.html: ${summary.passed}/${summary.total} passed, ${summary.failed} failed, ${summary.flaky} flaky`);
