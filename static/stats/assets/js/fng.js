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

    rows.push({
      'FNG Name': name,
      'First Post': firstPost,
      '2nd Post': secondPost,
      'Days to 2nd post': daysTo2nd,
      'Total Posts to date': totalPosts,
      'Home AO': homeAO,
      'Status': status,
    });
  });
  return rows;
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
  const IDS = ['chart-fng-status', 'chart-days-to-return', 'chart-fng-monthly', 'fng-table-container'];
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

  renderStatCards(filteredRows);
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
      `<th data-sort="${key}"${num ? ' class="num"' : ''} title="${f3Esc(tip)}">${label}</th>`;
    container.innerHTML = `
        <table class="table" id="fng-full-table">
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
      <td>${f3Esc(r['First Post'] || '—')}</td>
      <td>${f3Esc(r['Home AO'] || '—')}</td>
      <td class="num">${r['Total Posts to date'] || '—'}</td>
      <td>${f3Esc(r['2nd Post'] || '—')}</td>
      <td class="num">${r['Days to 2nd post'] === '' ? '—' : r['Days to 2nd post']}</td>
      <td>${f3Esc(r['Status'] || '—')}</td>
    </tr>`).join('');
  }
})();

if (typeof module !== 'undefined') {
  module.exports = { fngStatus, fngBuildRows, fngDaysBuckets };
}

