// AO Stats page logic
// Computed from Raw/Master attendance tab (header at row 0)
// Key columns from raw: Date, Name, Site, Role
// All aggregation is performed client-side from the raw CSV.

// Earthy, newsprint-friendly palette cycled across AO segments. Shared by every
// AO-colored chart on this page so a given AO reads as the same color in all of
// them — including charts that show only a filtered subset of AOs.
const AO_PALETTE = [
  '#4a5e3a', '#8a7a60', '#c8a840', '#7a9a68', '#9a5a3a', '#5a7a8a',
  '#b08a50', '#3a4d2d', '#a86a5a', '#6a8a4a', '#8a6a90', '#a0a080',
  '#5a6a3a', '#9aad88', '#7a5a4a', '#4a6a6a', '#caa060', '#6a4a5a',
  '#8aaa70', '#a89060', '#5a8a7a', '#9a8a4a', '#7a6a5a', '#aa8a6a',
];

// Maps each AO to a palette color by its position in `aos` (which callers sort
// by total attendance, largest first). Build this once from the full AO list,
// then look up by name — never rebuild from a subset, or colors will shift.
function aoBuildColorMap(aos) {
  const map = {};
  aos.forEach((ao, i) => { map[ao] = AO_PALETTE[i % AO_PALETTE.length]; });
  return map;
}

const EXCLUDED_SITES = ['#downrange', 'Shield Lock'];
const AO_DISPLAY_EXCLUSIONS = [
  'Convergence',
  'Raiders of the Locked Park',
  'Who let the dogs out (possible new AO?) Hunter street',
  'Shieldlock',
  'Ruck the Hall',
  'Q-Source Q',
  'Floppy Ruck',
  'Disturbing the Peace (DTP)',
  '#ao-mon-ateam',
  '#AO-MON-ATEAM'
];
const AO_EXCLUSIONS_LC = new Set(
  EXCLUDED_SITES.concat(AO_DISPLAY_EXCLUSIONS).map(s => s.toLowerCase())
);

// A Date's local calendar date as ISO. Not toISOString(), which converts to UTC
// and rolls past midnight into the next day for most of the US evening.
function aoIsoDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const AO_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// How far the daily chart looks back, per view. A single weekday is ~26 bars
// over a handful of AOs — cheap, and long enough to read a trend. Showing every
// day at that range means ~167 dates x 23 AOs: ~8,600 SVG nodes and ~2.4s of
// main-thread work on every toggle, for bars too thin to tell apart. The
// all-days view is the recent rhythm; the weekday views carry the trend.
const AO_ONE_DAY_WEEKS = 26;
const AO_ALL_DAYS_WEEKS = 8;

// Earliest date the daily chart should show, given the active day filter.
function aoDailyCutoff(dayFilter, now) {
  const weeks = dayFilter ? AO_ONE_DAY_WEEKS : AO_ALL_DAYS_WEEKS;
  const d = new Date(now);
  d.setDate(d.getDate() - weeks * 7);
  return aoIsoDate(d);
}

// True when `site` is a real, currently-tracked AO. Trims and lowercases so
// sheet-entry drift ("  Ruck the Hall  ", "#AO-MON-ATEAM") still matches.
function aoIsRealSite(site) {
  return !AO_EXCLUSIONS_LC.has(String(site || '').trim().toLowerCase());
}

// 'Mon'..'Sun' for an ISO date. Parses at local midnight — a bare
// new Date('2026-03-02') is UTC and lands on the previous day west of GMT.
function aoDayOfWeek(dateStr) {
  return AO_DAY_NAMES[new Date(dateStr + 'T00:00:00').getDay()];
}

// Buckets raw attendance rows into per-date, per-AO counts for the stacked
// daily chart.
//
//   cutoffStr  earliest date to include (ISO)
//   todayStr   today (ISO); excluded, since sessions report in over the day and
//              a partial today renders as a false collapse in attendance
//   dayOfWeek  optional 'Mon'..'Sun' filter
//
// `aoTotals` deliberately ignores dayOfWeek: it ranks AOs for color assignment,
// which must stay identical no matter which day is being viewed.
function aoBucketByDate(rows, { cutoffStr, todayStr, dayOfWeek } = {}) {
  const byDate = {};
  const aoTotals = {};
  rows.forEach(r => {
    const date = r['Date'];
    if (!date) return;
    if (cutoffStr && date < cutoffStr) return;
    if (todayStr && date >= todayStr) return;
    const site = (r['Site'] || '').trim();
    if (!aoIsRealSite(site)) return;
    aoTotals[site] = (aoTotals[site] || 0) + 1;
    if (dayOfWeek && aoDayOfWeek(date) !== dayOfWeek) return;
    if (!byDate[date]) byDate[date] = {};
    byDate[date][site] = (byDate[date][site] || 0) + 1;
  });
  return { dates: Object.keys(byDate).sort(), byDate, aoTotals };
}

// ISO date of the Monday that starts `dateStr`'s week. Sunday belongs to the
// week that just ended, not the one about to start.
function aoWeekMonday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return aoIsoDate(d);
}

// Per-AO weekly attendance on one shared week axis, for the card sparklines.
// Every site gets a value for every week in range — a week an AO did not run is
// a real 0, and drawing it as one is the whole point of the sparkline.
function aoWeeklySeriesBySite(rows, { cutoffStr, todayStr } = {}) {
  const weekSet = new Set();
  const counts = {};
  rows.forEach(r => {
    const date = r['Date'];
    if (!date) return;
    if (cutoffStr && date < cutoffStr) return;
    if (todayStr && date >= todayStr) return;
    const site = (r['Site'] || '').trim();
    if (!aoIsRealSite(site)) return;
    const wk = aoWeekMonday(date);
    weekSet.add(wk);
    if (!counts[site]) counts[site] = {};
    counts[site][wk] = (counts[site][wk] || 0) + 1;
  });
  const weeks = [...weekSet].sort();
  const bySite = {};
  Object.keys(counts).forEach(site => {
    bySite[site] = weeks.map(w => counts[site][w] || 0);
  });
  return { weeks, bySite };
}

// Percent change between the mean of the first half of `values` and the mean of
// the second half. Returns null when there is too little history to compare or
// when the baseline is 0 (any growth from nothing is an infinite percentage).
// An odd-length series drops its middle point so the halves stay equal size.
function aoTrendPct(values) {
  if (!values || values.length < 4) return null;
  const half = Math.floor(values.length / 2);
  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
  const first = mean(values.slice(0, half));
  const second = mean(values.slice(values.length - half));
  if (first === 0) return null;
  return Math.round((second - first) / first * 100);
}

// Geometry for a bar sparkline of `values` in a w x h box. Bars are measured
// from a zero baseline, not the series minimum: with min..max scaling a quiet
// AO holding at 9-10 PAX would render as a dramatic collapse.
const AO_SPARK_W = 240;
const AO_SPARK_H = 34;
const AO_SPARK_GAP = 0.28;  // share of each slot left empty between bars

function aoSparkBars(values, w, h) {
  if (!values || !values.length) return [];
  const max = Math.max(...values);
  const slot = w / values.length;
  const barW = slot * (1 - AO_SPARK_GAP);
  const round = n => Math.round(n * 100) / 100;
  return values.map((v, i) => {
    const barH = max > 0 ? (v / max) * h : 0;
    return { x: round(i * slot), y: round(h - barH), w: round(barW), h: round(barH) };
  });
}

// The sparkline itself. Hand-rolled SVG rather than a chart library: there is
// one per AO card, and ~23 more chart instances would cost far more than the
// markup is worth. The viewBox plus preserveAspectRatio="none" lets CSS stretch
// it to whatever width the card gives it.
function aoSparkSvg(values) {
  if (!values || values.length < 2) return '';
  const bars = aoSparkBars(values, AO_SPARK_W, AO_SPARK_H)
    .filter(b => b.h > 0)
    .map(b => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`)
    .join('');
  return `<svg class="ao-spark" viewBox="0 0 ${AO_SPARK_W} ${AO_SPARK_H}"` +
    ` preserveAspectRatio="none" aria-hidden="true" focusable="false">${bars}</svg>`;
}

const AO_TREND_BAND = 6;    // percent; smaller swings are week-to-week noise
const AO_TREND_CAP = 200;   // an AO that launched mid-range computes to a huge,
                            // technically-true percent; report it as "200%+"

// The direction chip shown beside a sparkline. Empty when there is no baseline
// to compare against.
function aoTrendChip(values) {
  const pct = aoTrendPct(values);
  if (pct === null) return '';
  const tone = aoTrendTone(pct);
  const mark = tone === 'good' ? '&#9650;' : tone === 'alert' ? '&#9660;' : '&#9644;';
  const mag = Math.abs(pct);
  const label = tone === 'watch' ? 'steady'
    : mag > AO_TREND_CAP ? `${AO_TREND_CAP}%+`
    : `${mag}%`;
  return `<span class="ao-trend tone-${tone}">${mark} ${label}</span>`;
}

// A PAX is "core" to an AO when they post at least every other week over the
// range. The bar was 70%, which demanded near-perfect attendance for six months
// — it dropped PAX who miss roughly one session a month and left 6 of 23 AOs
// reporting no regulars at all.
const AO_CORE_THRESHOLD = 0.50;

// `byName` maps PAX name -> posts at this AO within the range.
function aoCorePax(byName, sessionCount) {
  if (!sessionCount) return [];
  return Object.entries(byName || {})
    .filter(([, count]) => count / sessionCount >= AO_CORE_THRESHOLD)
    .map(([name]) => name)
    .sort();
}

// ── Tone vocabulary ───────────────────────────────────────────────────────
// One rule for every colored value on this page: color encodes HEALTH, never
// direction or magnitude alone.
//
//   good   green  healthy / growing
//   watch  gold   holding steady, or borderline
//   alert  rust   needs a Site Q's attention
//   none   muted  not enough data to judge — never a warning color
//
// Anything that gains a color must map through these functions so the same
// green means the same thing in the table, the cards, and the sparklines.
const AO_BENCH_GOOD = 40;      // % of an AO's PAX who have Q'd
const AO_BENCH_WATCH = 20;
const AO_BENCH_MIN_PAX = 10;   // below this, bench % is sample-size noise

function aoTrendTone(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return 'none';
  if (pct >= AO_TREND_BAND) return 'good';
  if (pct <= -AO_TREND_BAND) return 'alert';
  return 'watch';
}

function aoBenchTone(pct, uniquePax, uniqueQs) {
  if (pct === null || pct === undefined || isNaN(pct)) return 'none';
  if (uniquePax < AO_BENCH_MIN_PAX) return 'none';
  // No Q logged anywhere at this AO means the Q field was never filled in —
  // someone led those workouts. That is a recording gap, not a thin bench.
  if (!uniqueQs) return 'none';
  if (pct >= AO_BENCH_GOOD) return 'good';
  if (pct >= AO_BENCH_WATCH) return 'watch';
  return 'alert';
}

// Absence of data, styled so it reads as "nothing here yet" rather than as a
// failed render. Never an em dash — that looks like the page broke.
function aoEmpty(label) {
  return `<span class="empty-state">${f3Esc(label)}</span>`;
}

// Headline numbers for the daily chart's current slice. `aoName` narrows the
// summary to one isolated AO; its session count then covers only the dates that
// AO actually met, so an AO that skips a week is not averaged against zeros.
function aoDailySummary(dates, byDate, aoName) {
  const values = [];
  const aos = new Set();
  dates.forEach(d => {
    const day = byDate[d] || {};
    Object.keys(day).forEach(a => aos.add(a));
    if (aoName) {
      if (day[aoName] > 0) values.push(day[aoName]);
    } else {
      values.push(Object.values(day).reduce((a, b) => a + b, 0));
    }
  });
  const total = values.reduce((a, b) => a + b, 0);
  return {
    sessions: values.length,
    aos: aoName ? (aos.has(aoName) ? 1 : 0) : aos.size,
    avg: values.length ? Math.round(total / values.length) : 0,
    trendPct: aoTrendPct(values),
  };
}

async function aoInit() {

  // Tooltip copy for the two colored metrics. Kept together so the tone rule is
  // explained in exactly the same words wherever it appears.
  const BENCH_TIP = "Share of this AO's PAX who have Q'd at least once — higher means " +
    'more Q depth. Green \u2265 40%, gold 20\u201339%, rust under 20%. AOs with fewer than ' +
    AO_BENCH_MIN_PAX + ' PAX, or with no Q ever logged, are left uncolored — ' +
    'the number is not meaningful there.';
  const TREND_TIP = 'PAX per week over the last 26 weeks. The arrow compares the most ' +
    'recent 13 weeks against the 13 before them: green is growing, gold is holding ' +
    'steady within 6%, rust is falling.';

  const CORE_TIP = 'PAX who post at least every other week — at least 50% of ' +
    "this AO's sessions over the last 26 weeks";

  const DAY_PLURALS = {
    Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays',
    Fri: 'Fridays', Sat: 'Saturdays', Sun: 'Sundays',
  };
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const now = new Date();
  const cutoff26w = new Date(now - 26 * MS_PER_WEEK);
  const todayStr = aoIsoDate(now);
  const rangeCutoffStr = aoIsoDate(cutoff26w);

  let allRows = [];
  let filteredRows = [];
  let allRawRows = [];
  let attendanceChart = null;
  let fngsByAoChart = null;
  let weeklyChart = null;
  let dailyChart = null;
  let dailyDay = '';        // '' = every day; otherwise 'Mon'..'Sun'
  let dailyIsolatedAo = null;  // legend click narrows the chart to one AO
  let dailyAos = [];        // AOs in the current slice, in stack order
  let rankedAos = [];       // all in-range AOs, busiest first
  let aoColorMap = {};      // AO -> color, built once from rankedAos
  let weeklyBySite = {};    // AO -> weekly PAX counts, for card sparklines

  try {
    const rawCsv = await f3FetchCSV('raw');
    allRawRows = f3ParseCSV(rawCsv, 0)
      .filter(r => r['Name'] && r['Name'].trim() && r['Date'].startsWith('2026-'));

    const aoMap = {};
    allRawRows.forEach(r => {
      const site = r['Site'].trim();
      if (!aoIsRealSite(site)) return;
      if (!aoMap[site]) aoMap[site] = {
        dates: new Set(),
        weeks: new Set(),
        names: new Set(),
        qNames: new Set(),
        qCounts: {},
        fngCount: 0,
        totalPosts: 0,
        w26dates: new Set(),
        w26byName: {},
      };
      const ao = aoMap[site];
      ao.dates.add(r['Date']);
      ao.weeks.add(aoWeekMonday(r['Date']));
      ao.names.add(r['Name'].trim());
      ao.totalPosts++;
      if (r['Role'] === 'Q') {
        const n = r['Name'].trim();
        ao.qNames.add(n);
        ao.qCounts[n] = (ao.qCounts[n] || 0) + 1;
      }
      if (r['Role'] === 'FNG') ao.fngCount++;

      const d = new Date(r['Date'] + 'T00:00:00');
      if (d >= cutoff26w) {
        ao.w26dates.add(r['Date']);
        const n = r['Name'].trim();
        ao.w26byName[n] = (ao.w26byName[n] || 0) + 1;
      }
    });

    allRows = Object.entries(aoMap).map(([site, ao]) => {
      const distinctSessions = ao.dates.size;
      const avgPerMeeting = distinctSessions > 0 ? ao.totalPosts / distinctSessions : 0;
      const benchStrength = ao.names.size > 0 ? ao.qNames.size / ao.names.size * 100 : 0;

      const entries = Object.entries(ao.qCounts);
      const mostFreqQ = entries.length
        ? entries.reduce((a, b) => b[1] > a[1] ? b : a)[0]
        : '—';

      const corePax = aoCorePax(ao.w26byName, ao.w26dates.size);

      return {
        'Site': site,
        'Total Attendees': ao.totalPosts,
        'Weeks in Range': ao.weeks.size,
        'Avg/Meeting': avgPerMeeting,
        'FNGs': ao.fngCount,
        'Unique Qs': ao.qNames.size,
        'Bench Strength': benchStrength,
        'Most Frequent Q': mostFreqQ,
        '_uniquePax': ao.names.size,
        '_corePax': corePax,
      };
    });

  } catch (e) {
    f3ShowError('ao-table-container', e.message);
    f3ShowError('ao-cards-grid', e.message);
    return;
  }

  // One AO ranking drives stack order AND color in every chart on this page, so
  // an AO reads the same whether or not the view it appears in is filtered.
  const rangeTotals = aoBucketByDate(allRawRows, { cutoffStr: rangeCutoffStr, todayStr }).aoTotals;
  rankedAos = Object.keys(rangeTotals)
    .sort((a, b) => rangeTotals[b] - rangeTotals[a] || a.localeCompare(b));
  aoColorMap = aoBuildColorMap(rankedAos);
  weeklyBySite = aoWeeklySeriesBySite(allRawRows, { cutoffStr: rangeCutoffStr, todayStr }).bySite;

  filteredRows = [...allRows];
  renderAll();
  setupDayFilter();

  // Set up sortable — must call AFTER table is first rendered
  // Uses getter so it always sorts the current filteredRows
  function setupSortable() {
    f3MakeSortable('ao-full-table', () => filteredRows, renderTableBody);
  }

  function renderAll() {
    renderStatCards(filteredRows);
    renderWeeklyAttendance(allRawRows);
    renderDailyAttendance();
    renderAttendanceChart(filteredRows);
    renderFngsByAoChart(filteredRows);
    renderAOCards(filteredRows);
    renderTable(filteredRows);
    setupSortable();
    // Init themed tooltips for static labels + freshly rendered cards/headers.
    f3InitTooltips();
  }

  // Weekly totals only. The per-AO breakdown lives in the daily chart above;
  // stacking 23 AOs here too made both charts busy and neither readable.
  function renderWeeklyAttendance(rows) {
    // The current week is still filling in, so its bar is always short. Cut it,
    // or the chart ends on a phantom collapse every single time it is viewed.
    const currentWeek = aoWeekMonday(todayStr);

    const weekTotals = {};
    rows.forEach(r => {
      if (r['Date'] < rangeCutoffStr) return;
      if (!aoIsRealSite((r['Site'] || '').trim())) return;
      const wk = aoWeekMonday(r['Date']);
      if (wk >= currentWeek) return;
      weekTotals[wk] = (weekTotals[wk] || 0) + 1;
    });

    const weeks = Object.keys(weekTotals).sort();
    if (!weeks.length) return;

    const labels = weeks.map(shortDate);
    const data = weeks.map(w => weekTotals[w]);
    const avg = Math.round(data.reduce((a, b) => a + b, 0) / data.length);

    const rangeEl = document.getElementById('weekly-attendance-range');
    if (rangeEl) {
      rangeEl.textContent =
        `${labels[0]} – ${labels[labels.length - 1]} · ${weeks.length} weeks · avg ${avg}/wk`;
    }

    const options = {
      chart: { type: 'bar', height: 340, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent', animations: { enabled: false } },
      series: [{ name: 'PAX', data }],
      xaxis: { categories: labels, labels: { rotate: -45, style: { fontSize: '10px' } }, tickAmount: 13 },
      colors: ['#4a5e3a'],
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { columnWidth: '70%', dataLabels: { position: 'top' } } },
      // The count above each bar is the point of this chart now.
      dataLabels: {
        enabled: true,
        offsetY: -18,
        style: { fontSize: '10px', fontWeight: 700, colors: ['#1a1a1a'] },
      },
      yaxis: { title: { text: 'PAX' }, min: 0, forceNiceScale: true },
      legend: { show: false },
      tooltip: { theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" } },
    };

    if (weeklyChart) {
      weeklyChart.updateOptions(options);
    } else {
      f3LazyChart('chart-weekly-attendance', () => {
        weeklyChart = new ApexCharts(document.getElementById('chart-weekly-attendance'), options);
        weeklyChart.render();
      });
    }
  }

  function shortDate(iso) {
    return new Date(iso + 'T00:00:00')
      .toLocaleString('default', { month: 'short', day: 'numeric' });
  }

  function longDate(iso) {
    return new Date(iso + 'T00:00:00')
      .toLocaleString('default', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // One bar per session date, stacked by AO. Unfiltered this is ~170 bars and
  // reads as the region's weekly pulse; filtered to a weekday it drops to ~26
  // and becomes a like-for-like trend for the AOs that meet that day.
  function renderDailyAttendance() {
    const container = document.getElementById('chart-daily-attendance');
    if (!container) return;
    const rangeEl = document.getElementById('daily-attendance-range');

    const { dates, byDate } = aoBucketByDate(allRawRows, {
      cutoffStr: aoDailyCutoff(dailyDay, now),
      todayStr,
      dayOfWeek: dailyDay || undefined,
    });

    if (!dates.length) {
      if (dailyChart) { dailyChart.destroy(); dailyChart = null; }
      container.innerHTML =
        '<p class="text-muted p-3 mb-0">No sessions on this day in the last 6 months.</p>';
      if (rangeEl) rangeEl.textContent = '';
      return;
    }
    if (!container.querySelector('.apexcharts-canvas')) container.innerHTML = '';

    // Filter the shared ranking rather than re-ranking this slice, so each AO
    // keeps the color and stack position it has in the weekly chart.
    const present = new Set();
    dates.forEach(d => Object.keys(byDate[d]).forEach(a => present.add(a)));
    const aos = rankedAos.filter(a => present.has(a));

    dailyAos = aos;
    if (dailyIsolatedAo && !aos.includes(dailyIsolatedAo)) dailyIsolatedAo = null;

    const labels = dates.map(shortDate);
    const fullLabels = dates.map(longDate);
    const series = aos.map(ao => ({ name: ao, data: dates.map(d => byDate[d][ao] || 0) }));

    updateDailyReadout(dates, byDate);

    const options = {
      chart: {
        type: 'bar', stacked: true, height: 460, toolbar: { show: false },
        fontFamily: "'Open Sans', sans-serif", background: 'transparent',
        animations: { enabled: false },
        events: { legendClick: onDailyLegendClick },
      },
      series,
      xaxis: {
        categories: labels,
        labels: { rotate: -45, style: { fontSize: '10px' }, hideOverlappingLabels: true },
        tickAmount: Math.min(13, dates.length),
        tickPlacement: 'on',
      },
      colors: aos.map(ao => aoColorMap[ao]),
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { columnWidth: dailyDay ? '80%' : '95%' } },
      dataLabels: { enabled: false },
      yaxis: { title: { text: 'PAX' }, min: 0, forceNiceScale: true },
      legend: {
        position: 'bottom', fontSize: '11px', fontFamily: "'Open Sans', sans-serif",
        itemMargin: { horizontal: 6, vertical: 2 },
        // We isolate on click instead of Apex's default toggle-one-off.
        onItemClick: { toggleDataSeries: false },
      },
      tooltip: {
        shared: false,
        intersect: true,
        theme: 'light',
        style: { fontFamily: "'Open Sans', sans-serif" },
        // Axis labels are abbreviated and repeat across months; the tooltip
        // carries the unambiguous date.
        x: { formatter: (val, opts) => (opts && fullLabels[opts.dataPointIndex]) || val },
      },
    };

    const draw = () => {
      dailyChart = new ApexCharts(container, options);
      dailyChart.render();
    };

    if (dailyChart) {
      // Rebuild rather than updateOptions. Apex keeps collapsed series across an
      // update, and a series hidden by the previous day's isolation shadows the
      // new day's data — the chart keeps drawing the old slice while the header
      // reports the new one. Rebuilding drops that state with it, and costs
      // ~20-60ms for a weekday view.
      dailyChart.destroy();
      dailyChart = null;
      container.innerHTML = '';
      draw();
    } else {
      f3LazyChart('chart-daily-attendance', draw);
    }
  }

  // Reflects both the day filter and any AO isolated from the legend.
  function updateDailyReadout(dates, byDate) {
    const rangeEl = document.getElementById('daily-attendance-range');
    if (!rangeEl) return;
    if (!dates.length) { rangeEl.textContent = ''; return; }

    const s = aoDailySummary(dates, byDate, dailyIsolatedAo);
    const span = `${shortDate(dates[0])} – ${shortDate(dates[dates.length - 1])}`;
    const day = dailyDay ? DAY_PLURALS[dailyDay] : 'All days';
    const who = dailyIsolatedAo ? `${dailyIsolatedAo} · ` : '';
    const scope = `${who}${day} · ${span}`;
    const count = dailyIsolatedAo ? '' : ` · ${s.aos} AOs`;
    const pct = s.trendPct;
    const trend = pct === null ? ''
      : pct >= AO_TREND_BAND ? ` · \u25B2${pct}% vs first half`
      : pct <= -AO_TREND_BAND ? ` · \u25BC${Math.abs(pct)}% vs first half`
      : ' · holding steady';
    rangeEl.textContent =
      `${scope} · ${s.sessions} sessions${count} · avg ${s.avg}/day${trend}`;
  }

  // Clicking a legend name narrows the chart to that AO alone — the fastest way
  // to read one site on one day. Clicking it again restores the full stack.
  function onDailyLegendClick(ctx, seriesIndex) {
    const name = dailyAos[seriesIndex];
    if (!name) return;
    dailyIsolatedAo = dailyIsolatedAo === name ? null : name;
    dailyAos.forEach(a => {
      if (!dailyIsolatedAo || a === dailyIsolatedAo) ctx.showSeries(a);
      else ctx.hideSeries(a);
    });
    const { dates, byDate } = aoBucketByDate(allRawRows, {
      cutoffStr: aoDailyCutoff(dailyDay, now),
      todayStr,
      dayOfWeek: dailyDay || undefined,
    });
    updateDailyReadout(dates, byDate);
  }

  function setupDayFilter() {
    const group = document.getElementById('daily-day-filter');
    if (!group) return;
    group.addEventListener('click', e => {
      const btn = e.target.closest('.filter-toggle-btn');
      if (!btn || !group.contains(btn)) return;
      const day = btn.dataset.day || '';
      if (day === dailyDay) return;
      dailyDay = day;
      dailyIsolatedAo = null;
      group.querySelectorAll('.filter-toggle-btn').forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      renderDailyAttendance();
    });
  }

  function renderStatCards(rows) {
    document.getElementById('stat-total-aos').textContent = rows.length;

    const avgValues = rows.map(r => parseFloat(r['Avg/Meeting'])).filter(v => !isNaN(v));
    const overallAvg = avgValues.length
      ? (avgValues.reduce((a, b) => a + b, 0) / avgValues.length).toFixed(1)
      : '—';
    document.getElementById('stat-avg-attendance').textContent = overallAvg;

    const totalQs = rows.reduce((sum, r) => sum + (parseInt(r['Unique Qs']) || 0), 0);
    document.getElementById('stat-total-qs').textContent = totalQs;

    const totalFngs = rows.reduce((sum, r) => sum + (parseInt(r['FNGs']) || 0), 0);
    document.getElementById('stat-total-fngs').textContent = totalFngs;
  }

  function renderAttendanceChart(rows) {
    const sorted = [...rows]
      .filter(r => parseFloat(r['Avg/Meeting']) > 0)
      .sort((a, b) => parseFloat(b['Avg/Meeting']) - parseFloat(a['Avg/Meeting']));
    const options = {
      chart: { type: 'bar', height: Math.max(260, sorted.length * 28), toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [{ name: 'Avg Attendance', data: sorted.map(r => parseFloat(r['Avg/Meeting']).toFixed(1)) }],
      xaxis: { categories: sorted.map(r => r['Site']) },
      colors: ['#4a5e3a'],
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { horizontal: true, barHeight: '65%' } },
      dataLabels: { enabled: true, style: { fontSize: '11px' } },
      yaxis: { labels: { style: { fontSize: '11px' } } },
    };
    if (attendanceChart) { attendanceChart.updateOptions(options); }
    else { f3LazyChart('chart-ao-attendance', () => { attendanceChart = new ApexCharts(document.getElementById('chart-ao-attendance'), options); attendanceChart.render(); }); }
  }

  function renderFngsByAoChart(rows) {
    const sorted = [...rows]
      .filter(r => parseInt(r['FNGs']) > 0)
      .sort((a, b) => (parseInt(b['FNGs']) || 0) - (parseInt(a['FNGs']) || 0));
    if (!sorted.length) return;
    const options = {
      chart: { type: 'bar', height: Math.max(260, sorted.length * 28), toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [{ name: 'FNGs', data: sorted.map(r => parseInt(r['FNGs']) || 0) }],
      xaxis: { categories: sorted.map(r => r['Site']) },
      colors: ['#4a5e3a'],
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { horizontal: true, barHeight: '65%' } },
      dataLabels: { enabled: true, style: { fontSize: '11px' } },
      yaxis: { labels: { style: { fontSize: '11px' } } },
    };
    if (fngsByAoChart) { fngsByAoChart.updateOptions(options); }
    else { f3LazyChart('chart-ao-fngs', () => { fngsByAoChart = new ApexCharts(document.getElementById('chart-ao-fngs'), options); fngsByAoChart.render(); }); }
  }

  function renderAOCards(rows) {
    const grid = document.getElementById('ao-cards-grid');
    if (!rows.length) {
      grid.innerHTML = '<p class="text-muted">No AO data available.</p>';
      return;
    }
    grid.innerHTML = rows.map(r => {
      const avg = parseFloat(r['Avg/Meeting']) || 0;
      const bench = parseFloat(r['Bench Strength']);
      const qs = parseInt(r['Unique Qs']) || 0;
      const benchHtml = isNaN(bench)
        ? aoEmpty('Not enough data')
        : !qs
          ? aoEmpty('No Qs recorded')
          : `<span class="tone-${aoBenchTone(bench, r['_uniquePax'] || 0, qs)}">${bench.toFixed(1)}%</span>`;
      const topQ = r['Most Frequent Q'] && r['Most Frequent Q'] !== '—'
        ? f3Esc(r['Most Frequent Q'])
        : aoEmpty('No Q recorded');
      const corePax = r['_corePax'] || [];
      const coreHtml = corePax.length
        ? corePax.map(name => f3Esc(name)).join(', ')
        : aoEmpty('No regulars yet');
      const weekly = weeklyBySite[r['Site']] || [];
      const spark = aoSparkSvg(weekly);
      // Label and chip share a row; the bars get the card's full width below.
      const sparkHtml = spark
        ? `<div class="ao-spark-row mb-2 tone-${aoTrendTone(aoTrendPct(weekly))}">
            <div class="ao-spark-head">
              <span class="text-muted small">Weekly Trend ${f3InfoDot(TREND_TIP)}</span>
              ${aoTrendChip(weekly)}
            </div>
            ${spark}
          </div>`
        : '';
      return `
        <div class="card card-stat-accent">
          <div class="card-header">
            <h4 class="card-title">${f3Esc(r['Site'])}</h4>
          </div>
          <div class="card-body">
            <div class="row g-2 mb-2">
              <div class="col-6">
                <div class="text-muted small">Avg Attendance</div>
                <div class="fw-bold">${avg.toFixed(1)}</div>
              </div>
              <div class="col-6">
                <div class="text-muted small">Total Posts</div>
                <div class="fw-bold">${r['Total Attendees'] || 0}</div>
              </div>
              <div class="col-6">
                <div class="text-muted small">Bench Strength ${f3InfoDot(BENCH_TIP)}</div>
                <div class="fw-bold">${benchHtml}</div>
              </div>
              <div class="col-6">
                <div class="text-muted small">Top Q ${f3InfoDot('PAX who most frequently led workouts at this AO in 2026')}</div>
                <div class="fw-bold">${topQ}</div>
              </div>
            </div>
            ${sparkHtml}
            <div class="text-muted small mb-1">Core PAX (${corePax.length}) ${f3InfoDot(CORE_TIP)}</div>
            <div class="ao-core-list">${coreHtml}</div>
          </div>
        </div>`;
    }).join('');
  }

  function renderTable(rows) {
    const container = document.getElementById('ao-table-container');
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-vcenter table-hover card-table" id="ao-full-table">
          <thead>
            <tr>
              <th data-sort="Site">Site ${f3InfoDot('AO name')}</th>
              <th data-sort="Total Attendees" class="num">Total Posts ${f3InfoDot('Total individual posts at this AO in 2026')}</th>
              <th data-sort="Weeks in Range" class="num">Weeks ${f3InfoDot('Number of distinct weeks this AO has run in 2026')}</th>
              <th data-sort="Avg/Meeting" class="num">Avg/Meeting ${f3InfoDot('Average PAX count per session (Total Posts ÷ Distinct Sessions)')}</th>
              <th data-sort="FNGs" class="num">FNGs ${f3InfoDot('Number of first-time attendees at this AO in 2026')}</th>
              <th data-sort="Unique Qs" class="num">Unique Qs ${f3InfoDot('Number of distinct PAX who have led a workout (Q) at this AO in 2026')}</th>
              <th data-sort="Bench Strength" class="num">Bench Strength ${f3InfoDot(BENCH_TIP)}</th>
              <th>Core Names ${f3InfoDot(CORE_TIP)}</th>
            </tr>
          </thead>
          <tbody id="ao-table-body"></tbody>
        </table>
      </div>`;
    renderTableBody(rows);
  }

  function renderTableBody(rows) {
    const body = document.getElementById('ao-table-body');
    if (!body) return;
    body.innerHTML = rows.map(r => {
      const bench = parseFloat(r['Bench Strength']);
      const qs = parseInt(r['Unique Qs']) || 0;
      const benchDisplay = isNaN(bench)
        ? aoEmpty('n/a')
        : !qs
          ? aoEmpty('no Qs logged')
          : `<span class="tone-${aoBenchTone(bench, r['_uniquePax'] || 0, qs)}">${bench.toFixed(1)}%</span>`;
      const core = r['_corePax'] || [];
      const avg = parseFloat(r['Avg/Meeting']);
      return `<tr>
        <td>${f3Esc(r['Site'])}</td>
        <td class="num">${r['Total Attendees'] || 0}</td>
        <td class="num">${r['Weeks in Range'] || 0}</td>
        <td class="num">${avg ? avg.toFixed(1) : aoEmpty('n/a')}</td>
        <td class="num">${parseInt(r['FNGs']) ? r['FNGs'] : aoEmpty('none')}</td>
        <td class="num">${qs || aoEmpty('none')}</td>
        <td class="num">${benchDisplay}</td>
        <td class="text-muted small">${core.length ? f3Esc(core.join(', ')) : aoEmpty('No regulars yet')}</td>
      </tr>`;
    }).join('');
  }
}

if (typeof document !== 'undefined') {
  aoInit();
}

// Export for Node.js tests
if (typeof module !== 'undefined') {
  module.exports = {
    AO_PALETTE, aoBuildColorMap, aoIsRealSite, aoDayOfWeek, aoBucketByDate,
    aoWeekMonday, aoWeeklySeriesBySite, aoTrendPct, aoIsoDate,
    aoDailyCutoff, AO_ALL_DAYS_WEEKS, AO_ONE_DAY_WEEKS,
    aoSparkBars, aoSparkSvg, aoTrendChip, aoDailySummary,
    aoTrendTone, aoBenchTone, aoEmpty, AO_BENCH_MIN_PAX,
    aoCorePax, AO_CORE_THRESHOLD,
  };
}
