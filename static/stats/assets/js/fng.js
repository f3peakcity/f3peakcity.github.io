// FNG Stats page logic
// Source: Raw/Master tab — computes FNG data from attendance records
// Status values: '👻 Ghosted', '⏳ Pending (Grace Period)', '🌱 Developing (Returned)', '🛡️ Regular'

const FNG_EXCLUDED_SITES = ['#downrange', 'Shield Lock'];

function fngIsoToMdy(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${parseInt(m)}/${parseInt(d)}/${y}`;
}

function fngStatus(totalPosts, firstPostDate, now) {
  const daysSince = Math.floor((now - firstPostDate) / 86400000);
  if (totalPosts >= 10)                        return '🛡️ Regular';
  if (totalPosts > 1)                          return '🌱 Developing (Returned)';
  if (totalPosts === 1 && daysSince > 14)      return '👻 Ghosted';
  if (totalPosts === 1 && daysSince <= 14)     return '⏳ Pending (Grace Period)';
  return 'Checking Data...';
}

// Days from first to second post, bucketed. "None" is an FNG with no second
// post yet — the bucket that matters most for follow-up.
const FNG_DAY_BUCKETS = [
  ['0–3 d', 3], ['4–7 d', 7], ['8–14 d', 14], ['15–30 d', 30], ['31+ d', Infinity],
];
function fngDaysBuckets(rows) {
  const counts = Object.fromEntries([...FNG_DAY_BUCKETS.map(b => b[0]), 'None'].map(k => [k, 0]));
  rows.forEach(r => {
    const d = parseInt(r['Days to 2nd post']);
    if (isNaN(d)) { counts['None']++; return; }
    counts[FNG_DAY_BUCKETS.find(([, max]) => d <= max)[0]]++;
  });
  return counts;
}

// Pure aggregation: allRawRows -> one row per PAX who has ever been tagged FNG.
function fngBuildRows(allRawRows, now) {
  const byName = {};
  allRawRows.forEach(r => {
    const name = r['Name'].trim();
    if (!byName[name]) byName[name] = [];
    byName[name].push(r);
  });

  const rows = [];
  Object.entries(byName).forEach(([name, records]) => {
    const fngRecord = records.find(r => r['Role'] === 'FNG' && !FNG_EXCLUDED_SITES.includes((r['Site'] || '').trim()));
    if (!fngRecord) return;

    const sorted = records.slice().sort((a, b) => a['Date'].localeCompare(b['Date']));
    const firstPostIso = fngRecord['Date'];
    const firstPostDate = f3ParseLocalDate(firstPostIso);
    const firstPost = fngIsoToMdy(firstPostIso);

    const secondRecord = sorted.length >= 2 ? sorted[1] : null;
    const secondPost = secondRecord ? fngIsoToMdy(secondRecord['Date']) : '';
    let daysTo2nd = '';
    if (secondRecord) {
      const secondDate = f3ParseLocalDate(secondRecord['Date']);
      daysTo2nd = Math.floor((secondDate - firstPostDate) / 86400000);
    }

    const totalPosts = byName[name].filter(r => !FNG_EXCLUDED_SITES.includes((r['Site'] || '').trim())).length;
    const homeAO = fngRecord['Site'];
    const status = fngStatus(totalPosts, firstPostDate, now);

    // Journey fields count only posts AFTER the FNG post (a few PAX have
    // earlier records than their FNG tag; those don't count as coming back).
    const after = sorted.filter(r => r['Date'] > firstPostIso &&
      !FNG_EXCLUDED_SITES.includes((r['Site'] || '').trim()));
    const daysAfter = r => Math.round((f3ParseLocalDate(r['Date']) - firstPostDate) / 86400000);

    rows.push({
      'FNG Name': name,
      'First Post': firstPost,
      '2nd Post': secondPost,
      'Days to 2nd post': daysTo2nd,
      'Total Posts to date': totalPosts,
      'Home AO': homeAO,
      'Status': status,
      '_firstIso': firstPostIso,
      '_returnDays': after.length ? daysAfter(after[0]) : null,
      '_posts30': after.filter(r => daysAfter(r) <= 30).length,
      '_postedAfter60': after.some(r => daysAfter(r) >= 60),
      '_lastIso': (after[after.length - 1] || fngRecord)['Date'],
      // Any Q on record, even before a late FNG tag: 'Ready to Q' must never list a man who has led.
      '_hasQd': records.some(r => r['Role'] === 'Q'),
    });
  });
  return rows;
}

// ── New Guy Journey ──
// Every rate below only counts FNGs old enough to have had the chance: an FNG
// from last week is not a "no" on the 30-day return.
const FNG_DAY_MS = 86400000;
const fngAgeDays = (r, now) => Math.floor((now - f3ParseLocalDate(r['_firstIso'])) / FNG_DAY_MS);
const FNG_ESTABLISHED_POSTS = 3;   // 3 more after the first = 4+ posts in 30 days

function fngJourneyStages(rows, now) {
  const stage = (label, minAge, hit, tip) => {
    const pool = rows.filter(r => fngAgeDays(r, now) >= minAge);
    return { label, n: pool.filter(hit).length, of: pool.length, tip };
  };
  return [
    stage('Came back within 7 days', 7, r => r['_returnDays'] !== null && r['_returnDays'] <= 7,
      'Posted again within 7 days of their first post. FNGs from the last 7 days are not counted yet.'),
    stage('Came back within 30 days', 30, r => r['_returnDays'] !== null && r['_returnDays'] <= 30,
      'Posted again within 30 days of their first post.'),
    stage('Established: 4+ posts in 30 days', 30, r => r['_posts30'] >= FNG_ESTABLISHED_POSTS,
      'At least 4 posts, counting the first, within 30 days of their first post.'),
    stage('Still posting after 60 days', 60, r => r['_postedAfter60'],
      'Posted at least once 60 or more days after their first post.'),
    stage("Has Q'd", 0, r => r['_hasQd'],
      'Has led a workout since their first post: the first contribution step the data can see.'),
  ];
}

// 30-day return grouped by a key (home AO or first-post month).
function fngReturnBy(rows, now, keyFn, days = 30) {
  const groups = {};
  rows.filter(r => fngAgeDays(r, now) >= days).forEach(r => {
    const g = groups[keyFn(r)] = groups[keyFn(r)] || { n: 0, of: 0 };
    g.of++;
    if (r['_returnDays'] !== null && r['_returnDays'] <= days) g.n++;
  });
  return groups;
}

// Three follow-up lists a Site Q or FNG shepherd can act on.
function fngFollowUps(rows, now) {
  const since = iso => Math.floor((now - f3ParseLocalDate(iso)) / FNG_DAY_MS);
  const byNewest = (a, b) => b['_firstIso'].localeCompare(a['_firstIso']);
  return {
    // First post 7–60 days ago, never came back. Past 60 days the trail is cold.
    noReturn: rows.filter(r => r['_returnDays'] === null && fngAgeDays(r, now) >= 7 && fngAgeDays(r, now) <= 60)
      .sort(byNewest),
    // Came back once or twice, then nothing for 3+ weeks (first post in the last 120 days).
    faded: rows.filter(r => r['Total Posts to date'] >= 2 && r['Total Posts to date'] <= 3 &&
      since(r['_lastIso']) >= 21 && fngAgeDays(r, now) <= 120).sort(byNewest),
    // Stuck around (10+ posts) but hasn't Q'd: ready for the ask.
    readyToQ: rows.filter(r => r['Total Posts to date'] >= 10 && !r['_hasQd'])
      .sort((a, b) => b['Total Posts to date'] - a['Total Posts to date']),
  };
}

const FNG_STATUSES = [
  // key matched against Status, legend label, CSS modifier
  ['Regular', 'Graduated', 'done'],
  ['Developing', 'Developing', 'dev'],
  ['Pending', 'Pending', 'pending'],
  ['Ghosted', 'Ghosted', 'ghost'],
];

(async function () {
  const now = new Date();
  const IDS = ['fng-journey', 'chart-fng-status', 'chart-days-to-return', 'chart-fng-monthly',
    'chart-fng-return-month', 'fng-return-ao', 'fng-noreturn', 'fng-faded', 'fng-readytoq', 'fng-table-container'];
  let allRows = [];

  try {
    const allRawRows = await f3LoadRawRows({ year: '2026' });

    allRows = fngBuildRows(allRawRows, now);
  } catch (e) {
    IDS.forEach(id => f3ShowError(id));
    return;
  }

  if (!allRows.length) {
    IDS.forEach(id => f3ShowEmpty(id, 'No FNGs yet this year'));
    return;
  }

  // Newest first.
  const firstPostTime = r => (f3ParseLocalDate(r['First Post']) || 0).valueOf();
  const filteredRows = [...allRows].sort((a, b) => firstPostTime(b) - firstPostTime(a));
  const countStatus = (rows, key) => rows.filter(r => (r['Status'] || '').includes(key)).length;

  // Declared before the render calls below (they're consts, so a later
  // declaration would throw in the temporal dead zone and blank the page).
  const pct = (n, of) => (of ? Math.round(n / of * 100) : 0);
  const shortDate = iso => f3ParseLocalDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  renderStatCards(filteredRows);
  renderJourney(filteredRows);
  renderReturnByMonth(filteredRows);
  renderReturnByAo(filteredRows);
  renderFollowUps(filteredRows);
  renderStatusStack(filteredRows);
  renderDaysBar(filteredRows);
  renderMonthlyTrend(filteredRows);
  renderTable(filteredRows);

  function renderStatCards(rows) {
    const regular = countStatus(rows, 'Regular');
    document.getElementById('stat-total-fngs').textContent = rows.length;
    document.getElementById('stat-retained').textContent = countStatus(rows, 'Developing');
    document.getElementById('stat-pending').textContent = countStatus(rows, 'Pending');
    document.getElementById('stat-regular').textContent = regular;
    document.getElementById('stat-regular-pct').textContent = `${Math.round(regular / rows.length * 100)}%`;
  }

  function renderJourney(rows) {
    const stages = fngJourneyStages(rows, now);
    document.getElementById('fng-journey').innerHTML = stages.map((st, i) => `
      <div class="bar-row bar-row--wide${i === 0 ? ' is-top' : ''}">
        <span class="bar-name">${st.label} ${f3InfoDot(st.tip)}<span class="label">${st.n} of ${st.of} FNGs</span></span>
        <span class="bar-track"><span class="bar-fill" style="width:${pct(st.n, st.of)}%"></span></span>
        <span class="bar-val">${pct(st.n, st.of)}%</span>
      </div>`).join('');
  }

  function renderReturnByMonth(rows) {
    const groups = fngReturnBy(rows, now, r => r['_firstIso'].slice(0, 7));
    const months = Object.keys(groups).sort();
    if (!months.length) { f3ShowEmpty('chart-fng-return-month', 'No FNGs 30+ days out yet'); return; }
    const labels = months.map(m => new Date(+m.slice(0, 4), +m.slice(5) - 1).toLocaleString('default', { month: 'short' }));
    const options = f3Merge(f3ColumnOptions(labels, 'Back within 30 days', months.map(m => pct(groups[m].n, groups[m].of)),
      { fmt: v => `${v}%` }), {
      tooltip: { y: { formatter: (v, { dataPointIndex }) => {
        const g = groups[months[dataPointIndex]];
        return `${v}% · ${g.n} of ${g.of} FNGs`;
      } } },
    });
    f3LazyChart('chart-fng-return-month', () =>
      new ApexCharts(document.getElementById('chart-fng-return-month'), options).render());
  }

  function renderReturnByAo(rows) {
    const groups = fngReturnBy(rows, now, r => r['Home AO']);
    const aos = Object.keys(groups).sort((a, b) => groups[b].of - groups[a].of || a.localeCompare(b));
    if (!aos.length) { f3ShowEmpty('fng-return-ao', 'No FNGs 30+ days out yet'); return; }
    document.getElementById('fng-return-ao').innerHTML = aos.map(ao => `
      <div class="row">
        <span class="row-name">${f3Esc(ao)}</span>
        <span class="label">${groups[ao].n} of ${groups[ao].of} back</span>
        <span class="row-val">${pct(groups[ao].n, groups[ao].of)}%</span>
      </div>`).join('');
  }

  function renderFollowUps(rows) {
    const f = fngFollowUps(rows, now);
    const daysSince = iso => Math.floor((now - f3ParseLocalDate(iso)) / 86400000);
    const list = (id, items, empty, render) => {
      document.getElementById(id).innerHTML = items.length
        ? items.map(render).join('')
        : `<div class="status label empty-state">${empty}</div>`;
    };
    list('fng-noreturn', f.noReturn, 'Every recent FNG has been back.', r => `
      <div class="row" title="First post ${f3Esc(r['First Post'])} at ${f3Esc(r['Home AO'])}">
        <span class="row-name">${f3Esc(r['FNG Name'])}</span>
        <span class="label">${f3Esc(r['Home AO'])} · ${shortDate(r['_firstIso'])}</span>
        <span class="row-val" aria-label="${daysSince(r['_firstIso'])} days since first post">${daysSince(r['_firstIso'])}d</span>
      </div>`);
    list('fng-faded', f.faded, 'No one has faded after coming back.', r => `
      <div class="row" title="${r['Total Posts to date']} posts; last seen ${shortDate(r['_lastIso'])}">
        <span class="row-name">${f3Esc(r['FNG Name'])}</span>
        <span class="label">Last ${shortDate(r['_lastIso'])}</span>
        <span class="row-val" aria-label="${daysSince(r['_lastIso'])} days since last post">${daysSince(r['_lastIso'])}d</span>
      </div>`);
    list('fng-readytoq', f.readyToQ, 'Every former FNG with 10+ posts has Q’d.', r => `
      <div class="row">
        <span class="row-name">${f3Esc(r['FNG Name'])}</span>
        <span class="label">${f3Esc(r['Home AO'])}</span>
        <span class="row-val" aria-label="${r['Total Posts to date']} posts">${r['Total Posts to date']}</span>
      </div>`);
  }

  // One stacked bar plus a legend: the four statuses always add to 100%.
  function renderStatusStack(rows) {
    const total = rows.length;
    const parts = FNG_STATUSES.map(([key, label, mod]) => {
      const n = countStatus(rows, key);
      return { label, mod, n, pct: Math.round(n / total * 100) };
    });
    document.getElementById('fng-status-total').textContent = `${total} FNGs`;
    document.getElementById('chart-fng-status').innerHTML = `
      <div class="stack" role="img" aria-label="${parts.map(p => `${p.label} ${p.n}`).join(', ')}">
        ${parts.filter(p => p.n).map(p => `<span class="stack--${p.mod}" style="width:${p.n / total * 100}%" title="${p.label}: ${p.n}"></span>`).join('')}
      </div>
      <div class="legend">
        ${parts.map(p => `<div>
          <div><span class="swatch stack--${p.mod}"></span> <span class="label">${p.label}</span></div>
          <div class="legend-num">${p.n} <small>${p.pct}%</small></div>
        </div>`).join('')}
      </div>`;
  }

  function renderDaysBar(rows) {
    const buckets = fngDaysBuckets(rows);
    f3LazyChart('chart-days-to-return', () => new ApexCharts(document.getElementById('chart-days-to-return'),
      f3ColumnOptions(Object.keys(buckets), 'FNGs', Object.values(buckets))).render());
  }

  function renderMonthlyTrend(rows) {
    const counts = {};
    rows.forEach(r => {
      const d = f3ParseLocalDate(r['First Post']);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    const months = Object.keys(counts).sort();
    const labels = months.map(m => {
      const [y, mo] = m.split('-');
      return new Date(+y, +mo - 1).toLocaleString('default', { month: 'short' });
    });
    f3LazyChart('chart-fng-monthly', () => new ApexCharts(document.getElementById('chart-fng-monthly'),
      f3ColumnOptions(labels, 'FNGs', months.map(m => counts[m]))).render());
  }

  function renderTable(rows) {
    const container = document.getElementById('fng-table-container');
    const th = (key, label, tip, num) =>
      `<th data-sort="${key}"${num ? ' class="num"' : ''}>${f3ThLabel(label, tip)}</th>`;
    container.innerHTML = `
        <table class="table table--stack" id="fng-full-table">
          <thead>
            <tr>
              ${th('FNG Name', 'FNG', 'PAX F3 handle')}
              ${th('First Post', 'First post', 'Date of first attendance at Peak City')}
              ${th('Home AO', 'AO', 'The AO where this PAX first attended')}
              ${th('Total Posts to date', 'Posts', 'Total posts in 2026', true)}
              ${th('2nd Post', '2nd post', 'Date of second attendance')}
              ${th('Days to 2nd post', 'Days to 2nd', 'Days between first and second post; lower is a better retention signal', true)}
              ${th('Status', 'Status', 'Retention status based on post count and days since first post')}
            </tr>
          </thead>
          <tbody id="fng-table-body"></tbody>
        </table>`;
    renderTableBody(rows);
    f3MakeSortable('fng-full-table', () => filteredRows, renderTableBody);
  }

  function renderTableBody(rows) {
    const body = document.getElementById('fng-table-body');
    if (!body) return;
    body.innerHTML = rows.map(r => `<tr>
      <td>${f3Esc(r['FNG Name'])}</td>
      <td class="nowrap">${f3Esc(r['First Post'] || '—')}</td>
      <td>${f3Esc(r['Home AO'] || '—')}</td>
      <td class="num">${r['Total Posts to date'] || '—'}</td>
      <td class="nowrap">${f3Esc(r['2nd Post'] || '—')}</td>
      <td class="num">${r['Days to 2nd post'] === '' ? '—' : r['Days to 2nd post']}</td>
      <td class="nowrap">${f3Esc(r['Status'] || '—')}</td>
    </tr>`).join('');
    f3StackLabels(body.closest('table'));
  }
})();

if (typeof module !== 'undefined') {
  module.exports = { fngStatus, fngBuildRows, fngDaysBuckets, fngJourneyStages, fngReturnBy, fngFollowUps };
}

