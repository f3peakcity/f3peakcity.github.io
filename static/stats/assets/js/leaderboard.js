// #112 Leaderboard page logic
// Source: Raw tab — computed in JS from attendance records
//   Columns used: Date (YYYY-MM-DD), Name (PAX), Site, Role ("Q" or "P")

const MONTHS = ['JAN 2026','FEB 2026','MAR 2026','APR 2026','MAY 2026','JUNE 2026',
                 'JULY 2026','AUG 2026','SEP 2026','OCT 2026','NOV 2026','DEC 2026'];
const POST_GOAL = 12;

// AOs that may be counted as an extra post on top of a Saturday workout.
// Peak City allows double-downs on Saturdays only, and only when the second
// post is one of these. Two regular AOs on one morning remain a single post.
// F3 Dads has no Site rows in the sheet yet; it is listed so the rule already
// holds the day that AO starts reporting.
const LB_SECOND_POST_SITES = ['NeighborUp', 'WWCM', 'F3 Dads'];
const LB_SECOND_POST_SITES_LC = new Set(LB_SECOND_POST_SITES.map(s => s.toLowerCase()));
const LB_SATURDAY = 6;

// The rule above is forward-looking: it applies from this month (YYYY-MM) on.
// Earlier months keep the original one-post-per-record count so that nobody
// loses a #112 month they had already finished under the old counting.
const LB_DAY_CREDIT_FROM = '2026-08';

// The MONTHS label a raw Date belongs to, or null when it falls outside 2026.
function lbMonthLabel(dateStr) {
  if (!dateStr || !dateStr.startsWith('2026-')) return null;
  return MONTHS[parseInt(dateStr.slice(5, 7)) - 1] ?? null;
}

// Posts earned by one PAX on one calendar day, given that day's Site values.
// A calendar day is worth one post however many records it carries, which
// collapses both double-imported rows and two posts at the same AO. Saturdays
// additionally earn one post per distinct qualifying AO (LB_SECOND_POST_SITES).
function lbDayPostCredit(dateStr, sites) {
  if (!sites || sites.length === 0) return 0;
  const secondary = new Set();
  let primary = 0;
  sites.forEach(s => {
    const key = String(s ?? '').trim().toLowerCase();
    if (LB_SECOND_POST_SITES_LC.has(key)) secondary.add(key);
    else primary++;
  });
  // f3ParseLocalDate reads YYYY-MM-DD as local midnight. new Date(str) would
  // read it as UTC and land on Friday west of GMT, silently disabling every
  // Saturday double-down.
  const d = f3ParseLocalDate(dateStr);
  if (!d || d.getDay() !== LB_SATURDAY) return 1;
  return (primary > 0 ? 1 : 0) + secondary.size;
}

// Aggregates raw attendance rows into per-PAX, per-month post and Q counts.
// Rows are grouped by PAX and calendar day before anything is summed, so the
// day-level rules above decide what a day is worth. Qs stay a per-record tally:
// #112 only asks whether a PAX led at least one workout during the month.
function lbMonthlyPostCredit(rows) {
  const agg = {};
  const byPaxDay = {};
  rows.forEach(r => {
    const name = (r['Name'] || '').trim();
    if (!name) return;
    const date = (r['Date'] || '').trim();
    const month = lbMonthLabel(date);
    if (!month) return;
    if (!agg[name]) agg[name] = { posts: {}, qs: {} };
    if (!byPaxDay[name]) byPaxDay[name] = {};
    if (!byPaxDay[name][date]) byPaxDay[name][date] = { month, sites: [] };
    byPaxDay[name][date].sites.push(r['Site']);
    if ((r['Role'] || '').trim() === 'Q')
      agg[name].qs[month] = (agg[name].qs[month] || 0) + 1;
  });
  Object.entries(byPaxDay).forEach(([name, days]) => {
    Object.entries(days).forEach(([date, day]) => {
      const credit = date.slice(0, 7) >= LB_DAY_CREDIT_FROM
        ? lbDayPostCredit(date, day.sites)
        : day.sites.length;
      agg[name].posts[day.month] = (agg[name].posts[day.month] || 0) + credit;
    });
  });
  return agg;
}

async function lbInit() {
  const PC_REGULAR_WEEKS = 26;
  const PC_REGULAR_RECENT_WEEKS = 3;
  const PC_REGULAR_RECENT_MIN = 3;
  const PC_REGULAR_EXCLUDED_SITES = ['#downrange', 'Shield Lock'];

  let allRows = [];
  let filteredRows = [];
  let showRegularsOnly = true;
  let barChart = null;
  let activeMonths = [];
  let streakMonths = [];
  let currentMonth = '';

  try {
    const rawCsv = await f3FetchCSV('raw');

    const allRawRows = f3ParseCSV(rawCsv, 0)
      .filter(r => r['Name'] && r['Name'].trim());

    // Compute PC Regular status from rolling windows
    const now = new Date();
    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
    const cutoff26w = new Date(now - PC_REGULAR_WEEKS * MS_PER_WEEK);
    const cutoff3w  = new Date(now - PC_REGULAR_RECENT_WEEKS * MS_PER_WEEK);

    const pcWindowCounts = {};
    allRawRows.forEach(r => {
      const site = (r['Site'] || '').trim();
      if (PC_REGULAR_EXCLUDED_SITES.includes(site)) return;
      const d = f3ParseLocalDate(r['Date']);
      if (!d || d < cutoff26w) return;
      const name = r['Name'].trim();
      if (!pcWindowCounts[name]) pcWindowCounts[name] = { w26: 0, w3: 0 };
      pcWindowCounts[name].w26++;
      if (d >= cutoff3w) pcWindowCounts[name].w3++;
    });

    const pcRegMap = {};
    Object.entries(pcWindowCounts).forEach(([name, c]) => {
      pcRegMap[name] = c.w26 >= PC_REGULAR_WEEKS || c.w3 >= PC_REGULAR_RECENT_MIN;
    });

    // Determine active months
    const todayMonthIdx = new Date().getMonth(); // 0=Jan … 11=Dec
    const todayDate = now.getDate();
    currentMonth = MONTHS[todayMonthIdx] ?? MONTHS[0];
    activeMonths = MONTHS.filter((_, i) => i <= todayMonthIdx);
    // For streak counting: use previous month until the 14th to avoid showing
    // everyone as "0 streak" during the first two weeks of a new month.
    streakMonths = (todayDate < 14 && activeMonths.length > 1)
      ? activeMonths.slice(0, -1)
      : activeMonths;

    // Aggregate 2026 records into per-PAX post+Q counts
    const paxAgg = lbMonthlyPostCredit(allRawRows);

    allRows = Object.entries(paxAgg).map(([name, agg]) => {
      const row = { 'PAX': name, 'PC Reg.': pcRegMap[name] ? 'TRUE' : 'FALSE' };
      MONTHS.forEach(m => { row[m] = agg.posts[m] ? String(agg.posts[m]) : ''; });
      row['_qs'] = agg.qs;

      const completedMonths = streakMonths.map(m =>
        (parseInt(row[m]) || 0) >= POST_GOAL && (agg.qs[m] || 0) >= 1
      );
      let streak = 0;
      for (let i = completedMonths.length - 1; i >= 0; i--) {
        if (completedMonths[i]) streak++;
        else break;
      }
      row['Streakers'] = `${streak}/${completedMonths.filter(Boolean).length}`;
      return row;
    }).sort((a, b) => a['PAX'].localeCompare(b['PAX']));
  } catch (e) {
    f3ShowError('leaderboard-heatmap', e.message);
    f3ShowError('chart-monthly-completions', e.message);
    return;
  }

  // Default: PC Regulars only
  filteredRows = allRows.filter(r => (r['PC Reg.'] || '').trim().toUpperCase() === 'TRUE');

  renderAll();

  document.getElementById('btn-pc-reg').addEventListener('click', () => {
    if (showRegularsOnly) return;
    showRegularsOnly = true;
    filteredRows = allRows.filter(r => (r['PC Reg.'] || '').trim().toUpperCase() === 'TRUE');
    document.getElementById('btn-pc-reg').classList.add('active');
    document.getElementById('btn-all-crew').classList.remove('active');
    renderAll();
  });

  document.getElementById('btn-all-crew').addEventListener('click', () => {
    if (!showRegularsOnly) return;
    showRegularsOnly = false;
    filteredRows = [...allRows];
    document.getElementById('btn-all-crew').classList.add('active');
    document.getElementById('btn-pc-reg').classList.remove('active');
    renderAll();
  });

  function computeFilteredTotals(rows) {
    const totals = {};
    MONTHS.forEach(m => {
      totals[m] = rows.filter(r =>
        (parseInt(r[m]) || 0) >= POST_GOAL && (r['_qs']?.[m] || 0) >= 1
      ).length;
    });
    return totals;
  }

  function renderAll() {
    const filteredTotals = computeFilteredTotals(filteredRows);
    const allTotals      = computeFilteredTotals(allRows);
    renderStatCards(filteredTotals);
    renderBarChart(allTotals);
    renderHabitCards();
    renderYearGrid();
    // Init themed tooltips for the static stat-card / chart-title info-dots.
    // (Heatmap dot hovers keep their native title — dense data cells, not labels.)
    f3InitTooltips();
  }

  function renderStatCards(monthlyTotals) {
    document.getElementById('stat-total-crew').textContent = filteredRows.length;

    const currentCount = monthlyTotals[currentMonth] || 0;
    document.getElementById('stat-current-month').textContent =
      `${currentCount} (${currentMonth.replace(' 2026', '')})`;

    const pct = filteredRows.length > 0 ? Math.round((currentCount / filteredRows.length) * 100) : 0;
    const barEl = document.getElementById('stat-month-bar');
    const lblEl = document.getElementById('stat-month-label');
    if (barEl) barEl.style.width = pct + '%';
    if (lblEl) lblEl.textContent = `${currentCount} of ${filteredRows.length} in crew`;

    const streakers = filteredRows.filter(r => {
      const s = (r['Streakers'] || '0/0').toString();
      return parseInt(s.split('/')[0]) > 0;
    }).length;
    document.getElementById('stat-streakers').textContent = streakers;

    const streakersLabel = document.getElementById('stat-streakers-label');
    if (streakersLabel) {
      if (streakMonths.length < activeMonths.length && streakMonths.length > 0) {
        const prevMonthShort = streakMonths[streakMonths.length - 1].replace(' 2026', '');
        streakersLabel.textContent = `Active Streakers (thru ${prevMonthShort})`;
      } else {
        streakersLabel.textContent = 'Active Streakers';
      }
    }
  }

  function renderBarChart(monthlyTotals) {
    const chartMonths = activeMonths;
    const options = {
      chart: { type: 'bar', height: 280, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [{ name: 'Completions', data: chartMonths.map(m => monthlyTotals[m] || 0) }],
      xaxis: { categories: chartMonths.map(m => m.replace(' 2026', '')) },
      colors: ['#4a5e3a'],
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { columnWidth: '60%' } },
      dataLabels: { enabled: true },
      yaxis: { min: 0, forceNiceScale: true },
      tooltip: { theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" } },
    };
    if (barChart) {
      barChart.updateOptions(options);
    } else {
      f3LazyChart('chart-monthly-completions', () => {
        barChart = new ApexCharts(document.getElementById('chart-monthly-completions'), options);
        barChart.render();
      });
    }
  }

  function renderHabitCards() {
    const container = document.getElementById('leaderboard-heatmap');

    const rank = r => {
      if ((parseInt(r[currentMonth]) || 0) >= POST_GOAL && (r['_qs']?.[currentMonth] || 0) >= 1) return 0;
      if ((parseInt(r[currentMonth]) || 0) >= POST_GOAL) return 1;
      return 2;
    };
    const sorted = [...filteredRows].sort((a, b) =>
      rank(a) - rank(b) ||
      (parseInt(b[currentMonth]) || 0) - (parseInt(a[currentMonth]) || 0) ||
      a['PAX'].localeCompare(b['PAX'])
    );

    const cards = sorted.map(r => {
      const currentPosts = parseInt(r[currentMonth]) || 0;
      const pct = Math.min(100, Math.round((currentPosts / POST_GOAL) * 100));

      const dots = MONTHS.map(m => {
        const raw = (r[m] || '').trim();
        const val = parseInt(raw) || 0;
        const hasData = raw !== '';
        const isCurrent = m === currentMonth;
        const qDone = (r['_qs']?.[m] || 0) >= 1;
        let cls = 'lb-dot';
        if (hasData && val >= POST_GOAL && qDone) cls += ' filled';
        else if (hasData && val >= POST_GOAL)     cls += ' filled-nq';
        else if (hasData && val > 0)              cls += ' partial';
        const ringStyle = isCurrent ? 'outline:2px solid var(--green);outline-offset:2px;' : '';
        const qCount = r['_qs']?.[m] || 0;
        const label = hasData
          ? `${m.replace(' 2026','')}: ${val} post${val !== 1 ? 's' : ''} · ${qCount} Q${qCount !== 1 ? 's' : ''}`
          : `${m.replace(' 2026','')}: —`;
        return `<span class="${cls}" title="${label}" style="${ringStyle}"></span>`;
      }).join('');

      const streakStr = (r['Streakers'] || '0/0').toString();
      const streakCurrent = parseInt(streakStr.split('/')[0]) || 0;
      const streakBadge = streakCurrent >= 2
        ? `<div class="lb-streak-badge">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2L3 14h8l-1 8 10-12h-8z"/></svg>
            ${streakCurrent}-mo streak
          </div>`
        : '';

      const qDoneCurrent = (r['_qs']?.[currentMonth] || 0) >= 1;
      let statusCls, statusText;
      if (currentPosts >= POST_GOAL && qDoneCurrent)
        { statusCls = 'lb-status-done';   statusText = 'Complete'; }
      else if (currentPosts >= POST_GOAL)
        { statusCls = 'lb-status-needsq'; statusText = 'Needs Q'; }
      else if (currentPosts >= 7)
        { statusCls = 'lb-status-track';  statusText = 'On Track'; }
      else if (currentPosts > 0)
        { statusCls = 'lb-status-behind'; statusText = `Need ${POST_GOAL - currentPosts}`; }
      else
        { statusCls = 'lb-status-ghost';  statusText = 'Not Started'; }

      const countCls = (currentPosts >= POST_GOAL && qDoneCurrent) ? ' lb-complete' : currentPosts < 4 ? ' lb-behind' : '';

      return `<div class="lb-pax-card">
        <div class="lb-pax-name">${f3Esc(r['PAX'])}</div>
        <div class="lb-dot-row">${dots}</div>
        <div class="lb-mini-bar-track">
          <div class="lb-mini-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="lb-progress-line">
          <span>${f3Esc(currentMonth.replace(' 2026',''))} &mdash; <span class="lb-progress-count${countCls}">${currentPosts}/${POST_GOAL}</span></span>
          <span class="lb-status-tag ${statusCls}">${statusText}</span>
        </div>
        ${streakBadge}
      </div>`;
    }).join('');

    container.innerHTML = `<div class="lb-pax-grid">${cards}</div>`;
  }

  function renderYearGrid() {
    const container = document.getElementById('leaderboard-table');
    if (!container) return;

    function cellClass(raw, qCount) {
      const n = parseInt(raw) || 0;
      const hasQ = (qCount || 0) >= 1;
      if (n === 0)          return 'lb-cell-0';
      if (n < 6)            return hasQ ? 'lb-cell-low-q'  : 'lb-cell-low';
      if (n < POST_GOAL)    return hasQ ? 'lb-cell-mid-q'  : 'lb-cell-mid';
      return hasQ ? 'lb-cell-done' : 'lb-cell-done-nq';
    }

    const thead = `<thead><tr>
      <th style="text-align:left;padding:0.5rem 0.75rem;">PAX</th>
      ${activeMonths.map(m => `<th>${f3Esc(m.replace(' 2026', ''))}</th>`).join('')}
      <th>Streak</th>
    </tr></thead>`;

    const tbody = filteredRows.map(r => {
      const cells = activeMonths.map(m => {
        const val = (r[m] || '').trim();
        const qCount = r['_qs']?.[m] || 0;
        const cls = cellClass(val, qCount);
        return `<td><span class="${cls}">${f3Esc(val || '—')}</span></td>`;
      }).join('');
      return `<tr>
        <td style="font-weight:600;padding:0.35rem 0.75rem;">${f3Esc(r['PAX'])}</td>
        ${cells}
        <td style="text-align:center;font-size:0.8rem;">${f3Esc(r['Streakers'] || '—')}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `<div class="table-responsive">
      <table class="table table-sm lb-heatmap">${thead}<tbody>${tbody}</tbody></table>
    </div>`;
  }
}

// Browser only — requiring this file from a Node test must not start a fetch.
if (typeof document !== 'undefined') {
  lbInit();
}

// Export for Node.js tests
if (typeof module !== 'undefined') {
  module.exports = {
    LB_SECOND_POST_SITES, LB_DAY_CREDIT_FROM,
    lbMonthLabel, lbDayPostCredit, lbMonthlyPostCredit,
  };
}
