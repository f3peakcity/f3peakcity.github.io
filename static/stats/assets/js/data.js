// F3 Peak City Stats — Shared Data Utilities
// ============================================================
// CONFIG: Google Sheets "Publish to Web" published ID and GIDs.
// The published ID differs from the sheet's edit URL ID — it is
// the long token in the /d/e/{PUBLISHED_ID}/pub URLs.
// ============================================================
const F3_PUBLISHED_ID = '2PACX-1vR804eEdHprDZVLy23u5xzcvgdFodpwtIsMXLG20hTxYrV29DxwtBoPvR5W9V7r4-U2J1yKSs7XkM7M';

const F3_TAB_GIDS = {
  ao:          '1516133009',
  pax:         '731565815',
  fng:         '146818903',
  leaderboard: '740264345',
  raw:         '1113362713',
};

// ============================================================

function f3CsvUrl(tabKey) {
  const id = F3_PUBLISHED_ID;
  const gid = F3_TAB_GIDS[tabKey];
  return `https://docs.google.com/spreadsheets/d/e/${id}/pub?gid=${gid}&single=true&output=csv`;
}

async function f3FetchCSV(tabKey) {
  const res = await fetch(f3CsvUrl(tabKey));
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${tabKey} tab`);
  return res.text();
}

function f3ParseCSVLine(line) {
  line = line.replace(/\r$/, '');
  const result = [];
  let inQuote = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// headerRowIndex: 0-based index of the row containing column headers.
// All rows before headerRowIndex are skipped (metadata rows).
// NOTE: Does not support quoted fields containing literal newlines (RFC 4180 §2.6).
// Google Sheets "Publish to Web" CSV output does not emit embedded newlines
// for the sheet tabs used by this dashboard.
function f3ParseCSV(text, headerRowIndex) {
  const lines = text.trim().split('\n');
  const headers = f3ParseCSVLine(lines[headerRowIndex]).map(h => h.trim());
  return lines
    .slice(headerRowIndex + 1)
    .filter(line => line.trim() !== '')
    .map(line => {
      const vals = f3ParseCSVLine(line);
      return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]));
    });
}

// Parse a date string as local midnight regardless of format.
// Handles ISO (YYYY-MM-DD) and Google Sheets M/D/YYYY formats.
function f3ParseLocalDate(str) {
  if (!str) return null;
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return new Date(+mdy[3], +mdy[1] - 1, +mdy[2]);
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// Filters rows where row[field] falls within [from, to] date strings.
// Rows with unparseable dates are kept (never silently dropped).
function f3FilterByDateRange(rows, field, from, to) {
  const fromDate = from ? f3ParseLocalDate(from) : null;
  const toDate   = to   ? f3ParseLocalDate(to)   : null;
  return rows.filter(row => {
    const val = row[field];
    if (!val) return true;
    const d = f3ParseLocalDate(val);
    if (!d) return true;
    if (fromDate && d < fromDate) return false;
    if (toDate   && d > toDate)   return false;
    return true;
  });
}

function f3ShowLoading(containerId) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = '<div class="status label" role="status">Loading…</div>';
}

function f3ShowError(containerId, msg = 'Data unavailable — try refreshing the page') {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `<div class="status status--error label" role="alert">${f3Esc(msg)}</div>`;
}

function f3ShowEmpty(containerId, msg = 'No data yet') {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = `<div class="status label empty-state">${f3Esc(msg)}</div>`;
}

// Marks `btn` as the pressed option within its .toggle group.
function f3SetPressed(btn) {
  btn.parentElement.querySelectorAll('button').forEach(b =>
    b.setAttribute('aria-pressed', String(b === btn)));
}

// ── ApexCharts theme ──
// One shared base so every chart reads as the handoff's flat ink bars:
// ink by default, green for exactly one bar, no grid, no toolbar.
const F3_INK = '#1a1a1a', F3_GREEN = '#4a5e3a', F3_MUTED = '#8a7a60';
const F3_UI_FONT = "'Open Sans', sans-serif", F3_DISPLAY_FONT = "'Barlow Condensed', sans-serif";

function f3Merge(base, over) {
  const out = { ...base };
  Object.entries(over || {}).forEach(([k, v]) => {
    const b = out[k];
    out[k] = (v && b && typeof v === 'object' && typeof b === 'object' && !Array.isArray(v) && !Array.isArray(b))
      ? f3Merge(b, v) : v;
  });
  return out;
}

function f3ApexOptions(over) {
  const axisLabels = { style: { colors: F3_MUTED, fontFamily: F3_UI_FONT, fontSize: '11px', fontWeight: 600 } };
  return f3Merge({
    chart: { toolbar: { show: false }, fontFamily: F3_UI_FONT, background: 'transparent', foreColor: F3_MUTED },
    colors: [F3_INK],
    grid: { show: false, padding: { left: 12, right: 0 } },
    fill: { opacity: 1 },
    dataLabels: { enabled: false },
    plotOptions: { bar: { borderRadius: 0 } },
    states: { hover: { filter: { type: 'darken', value: 0.85 } } },
    stroke: { show: false },
    legend: { fontFamily: F3_UI_FONT, fontSize: '11px', labels: { colors: F3_INK }, markers: { radius: 0 } },
    xaxis: { axisBorder: { color: F3_INK }, axisTicks: { show: false }, labels: axisLabels },
    yaxis: { labels: axisLabels },
    tooltip: { theme: 'light', style: { fontFamily: F3_UI_FONT } },
    noData: { text: 'No data yet', style: { fontFamily: F3_UI_FONT, color: F3_MUTED } },
  }, over);
}

// Colors function for a single-series bar chart: green at `index`, ink elsewhere.
function f3HighlightAt(index) {
  return [({ dataPointIndex }) => (dataPointIndex === index ? F3_GREEN : F3_INK)];
}

// Horizontal bars sorted high to low: the handoff's ranked list, with the
// leader in green and the value printed past the end of each bar.
// `fmt` formats the printed value (e.g. v => v + '%').
function f3RankedBarOptions(names, seriesName, data, fmt) {
  return f3ApexOptions({
    chart: { type: 'bar', height: Math.max(260, names.length * 30) },
    series: [{ name: seriesName, data }],
    xaxis: { categories: names, labels: { show: false }, axisBorder: { show: false } },
    colors: f3HighlightAt(0),
    plotOptions: { bar: { horizontal: true, barHeight: '45%', dataLabels: { position: 'top' } } },
    dataLabels: {
      enabled: true, offsetX: 24, textAnchor: 'start',
      formatter: fmt || (v => v),
      style: { fontSize: '15px', fontFamily: F3_DISPLAY_FONT, fontWeight: 800, colors: [F3_INK] },
    },
    tooltip: { y: { formatter: fmt || (v => v) } },
    yaxis: {
      // Headroom past the longest bar so its printed value is not clipped.
      max: Math.max(...data.map(Number)) * 1.3,
      labels: { maxWidth: 200, style: { colors: F3_INK, fontFamily: F3_DISPLAY_FONT, fontSize: '14px', fontWeight: 700 } },
    },
    grid: { padding: { right: 32 } },
  });
}

// Vertical columns (days, months, buckets) with the value printed on top.
// `highlight` is the one green column's index (default: the tallest).
function f3ColumnOptions(labels, seriesName, data, { highlight, fmt, height = 240 } = {}) {
  return f3ApexOptions({
    chart: { type: 'bar', height },
    series: [{ name: seriesName, data }],
    xaxis: { categories: labels, labels: { rotate: 0, hideOverlappingLabels: false } },
    yaxis: { show: false, min: 0, max: Math.max(1, ...data.map(Number)) * 1.2 },
    colors: f3HighlightAt(highlight === undefined ? f3MaxIndex(data) : highlight),
    plotOptions: { bar: { columnWidth: '70%', dataLabels: { position: 'top' } } },
    dataLabels: {
      enabled: true, offsetY: -28, formatter: fmt || (v => v),
      style: { fontSize: '16px', fontFamily: F3_DISPLAY_FONT, fontWeight: 800, colors: [F3_INK] },
    },
    tooltip: { y: { formatter: fmt || (v => v) } },
  });
}

// Index of the largest value (first one on ties); -1 for an empty list.
function f3MaxIndex(values) {
  let best = -1;
  values.forEach((v, i) => { if (best < 0 || v > values[best]) best = i; });
  return best;
}

// Attaches click-to-sort behavior to all <th data-sort="colName"> elements
// within the given table element.
// getRows: a function that returns the current rows to sort (enables live filtering)
function f3MakeSortable(tableId, getRows, renderFn) {
  const table = document.getElementById(tableId);
  if (!table) return;
  let sortCol = null;
  let sortDir = 1;
  table.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortCol === col) {
        sortDir *= -1;
      } else {
        sortCol = col;
        sortDir = 1;
      }
      table.querySelectorAll('th[data-sort]').forEach(h => h.classList.remove('asc', 'desc'));
      th.classList.add(sortDir === 1 ? 'asc' : 'desc');
      const sorted = [...getRows()].sort((a, b) => {
        const av = a[col] ?? '';
        const bv = b[col] ?? '';
        const an = parseFloat(av);
        const bn = parseFloat(bv);
        // Both must be valid numbers for numeric sort; empty string falls to string sort
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * sortDir;
        return av.localeCompare(bv) * sortDir;
      });
      renderFn(sorted);
    });
  });
}

// Escapes a value for safe insertion into innerHTML.
// Use on all string fields from CSV when rendering to the DOM.
function f3Esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Lazily initializes a chart when its container scrolls near the viewport.
// Stores the latest renderFn so re-renders before scroll always use fresh data.
const _f3LazyPending = {};
function f3LazyChart(containerId, renderFn) {
  _f3LazyPending[containerId] = renderFn;
  const el = document.getElementById(containerId);
  if (!el || el.dataset.f3Lazy) return;
  el.dataset.f3Lazy = '1';
  const obs = new IntersectionObserver((entries, o) => {
    if (!entries[0].isIntersecting) return;
    o.disconnect();
    el.removeAttribute('data-f3-lazy');
    const fn = _f3LazyPending[containerId];
    if (fn) { delete _f3LazyPending[containerId]; fn(); }
  }, { rootMargin: '300px 0px' });
  obs.observe(el);
}

// ── Info-dot (ⓘ) tooltips ──
// A focusable button carrying an explanation. One shared popover (appended to
// <body>, so scrolling tables can't clip it) shows on hover, keyboard focus or
// tap, and closes on Esc or an outside tap. Event delegation means
// re-rendered markup needs no re-init.
function f3InfoDot(tip) {
  return `<button type="button" class="info-dot" data-tip="${f3Esc(tip)}" aria-label="${f3Esc(tip)}">&#9432;</button>`;
}

function f3InitInfoDots() {
  const pop = document.createElement('div');
  pop.className = 'tip-pop';
  pop.setAttribute('role', 'tooltip');
  pop.hidden = true;
  document.body.appendChild(pop);
  let current = null;

  const dotOf = el => (el instanceof Element ? el.closest('.info-dot') : null);
  const hide = () => { current = null; pop.hidden = true; };
  const show = dot => {
    current = dot;
    pop.textContent = dot.dataset.tip;
    pop.hidden = false;
    const r = dot.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left + r.width / 2 - p.width / 2), innerWidth - p.width - 8);
    const top = r.top - p.height - 8 >= 8 ? r.top - p.height - 8 : r.bottom + 8;
    pop.style.left = `${left + scrollX}px`;
    pop.style.top = `${top + scrollY}px`;
  };

  document.addEventListener('mouseover', e => { const d = dotOf(e.target); if (d && d !== current) show(d); });
  document.addEventListener('mouseout', e => {
    const d = dotOf(e.target);
    if (d && dotOf(e.relatedTarget) !== d && document.activeElement !== d) hide();
  });
  document.addEventListener('focusin', e => { const d = dotOf(e.target); if (d) show(d); });
  document.addEventListener('focusout', e => { if (dotOf(e.target)) hide(); });
  // Capture phase: a dot inside a sortable <th> must not trigger the sort.
  document.addEventListener('click', e => {
    const d = dotOf(e.target);
    if (!d) { hide(); return; }
    e.stopPropagation();
    e.preventDefault();
    // Always open, never toggle: a tap fires hover + focus first, which have
    // already opened it, and a toggle would close it again.
    show(d);
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  // Page coordinates survive a page scroll; a scrolled table moves the dot, so
  // re-anchor rather than close (focus() scrolling a dot into view fires this).
  addEventListener('scroll', () => { if (current) show(current); }, { passive: true, capture: true });
}

if (typeof document !== 'undefined') f3InitInfoDots();

// Two distinct questions get asked about a Site value across the stats pages —
// keep them as two functions rather than one, since collapsing them changes
// real PAX's numbers (see f3IsRealAo below).

// "Should this post count toward attendance-based aggregates at all" — PC
// Regular windows and a PAX's Favorite AO. Only #downrange and Shield Lock
// are excluded; junk/administrative AO names still count here.
const F3_ATTENDANCE_EXCLUDED_SITES = ['#downrange', 'Shield Lock'];
function f3CountsTowardAttendance(site) {
  return !F3_ATTENDANCE_EXCLUDED_SITES.includes(String(site || '').trim());
}

// "Is this a distinct, currently-tracked AO worth its own chart bar or card."
// Excludes #downrange/Shieldlock (spelled two ways across tabs; toggle with
// includeDownrange/includeShieldlock) plus known junk/administrative names.
const F3_AO_DISPLAY_EXCLUSIONS_LC = new Set([
  'convergence',
  'raiders of the locked park',
  'who let the dogs out (possible new ao?) hunter street',
  'ruck the hall',
  'q-source q',
  'floppy ruck',
  'disturbing the peace (dtp)',
  '#ao-mon-ateam',
]);
function f3IsRealAo(site, opts = {}) {
  const { includeDownrange = false, includeShieldlock = false } = opts;
  const s = String(site || '').trim().toLowerCase();
  if (!s) return false;
  if (!includeDownrange && s === '#downrange') return false;
  if (!includeShieldlock && (s === 'shield lock' || s === 'shieldlock')) return false;
  return !F3_AO_DISPLAY_EXCLUSIONS_LC.has(s);
}

// PC Regular: 26+ posts in the trailing 26 weeks, or 3+ in the trailing 3 weeks.
// The single implementation of this rule — pax.js and leaderboard.js both call
// it instead of each keeping their own copy of the thresholds and windows.
const F3_PC_REGULAR_WEEKS = 26;
const F3_PC_REGULAR_RECENT_WEEKS = 3;
const F3_PC_REGULAR_RECENT_MIN = 3;
const F3_MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function f3PcRegularMap(rows, now) {
  const cutoff26w = new Date(now - F3_PC_REGULAR_WEEKS * F3_MS_PER_WEEK);
  const cutoff3w  = new Date(now - F3_PC_REGULAR_RECENT_WEEKS * F3_MS_PER_WEEK);

  const counts = {};
  rows.forEach(r => {
    const site = (r['Site'] || '').trim();
    if (!f3CountsTowardAttendance(site)) return;
    const d = f3ParseLocalDate(r['Date']);
    if (!d || d < cutoff26w) return;
    const name = r['Name'].trim();
    if (!counts[name]) counts[name] = { w26: 0, w3: 0 };
    counts[name].w26++;
    if (d >= cutoff3w) counts[name].w3++;
  });

  const map = {};
  Object.entries(counts).forEach(([name, c]) => {
    map[name] = c.w26 >= F3_PC_REGULAR_WEEKS || c.w3 >= F3_PC_REGULAR_RECENT_MIN;
  });
  return map;
}

// Site names that changed identity in the real world — historical raw rows
// still carry the old name, so every page needs to read them as the new one.
// Western Wake Crisis Ministry (WWCM) merged into NeighborUp in Aug 2026;
// rows before that date still say "WWCM" in the sheet.
const F3_SITE_ALIASES_LC = { 'wwcm': 'NeighborUp' };
function f3CanonicalSite(site) {
  const s = String(site || '').trim();
  return F3_SITE_ALIASES_LC[s.toLowerCase()] || s;
}

// ── Raw attendance tab: the one loader every stats page uses ──
// Columns the pages read. A published tab missing any of them is the wrong
// shape (a renamed column, an HTML error page served as 200), and should read
// as an error, not as "no posts yet".
const F3_RAW_COLUMNS = ['Date', 'Name', 'Site', 'Role'];

// Parses the Raw tab: checks its header, rewrites migrated site names, drops
// rows with no PAX name. `year` (e.g. '2026') keeps only that year's rows.
function f3RawRowsFromCsv(text, { year } = {}) {
  const header = f3ParseCSVLine((text || '').split('\n')[0] || '').map(h => h.trim());
  const missing = F3_RAW_COLUMNS.filter(c => !header.includes(c));
  if (missing.length) throw new Error(`Sheet is missing column(s): ${missing.join(', ')}`);
  return f3ParseCSV(text, 0)
    .map(r => ({ ...r, Site: f3CanonicalSite(r['Site']) }))
    .filter(r => r['Name'] && r['Name'].trim() && (!year || r['Date'].startsWith(year + '-')));
}

async function f3LoadRawRows(opts) {
  return f3RawRowsFromCsv(await f3FetchCSV('raw'), opts);
}

// Export for Node.js tests
if (typeof module !== 'undefined') {
  module.exports = {
    f3ParseCSVLine, f3ParseCSV, f3ParseLocalDate, f3FilterByDateRange, f3Esc,
    f3CountsTowardAttendance, f3IsRealAo, f3PcRegularMap, f3CanonicalSite,
    f3Merge, f3ApexOptions, f3MaxIndex, f3RawRowsFromCsv,
  };
}
