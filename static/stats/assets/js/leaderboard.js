// #112 Leaderboard page logic
// Source: 2026 Leaderboard tab
//   Row 0: sheet-computed monthly completion totals (COUNTIF over full dataset)
//   Row 1: headers — PAX, PC Reg., JAN 2026, ..., DEC 2026, Streakers
//   Rows 2+: PAX data — post counts per month; Streakers = "X/Y" format
//
// NOTE: The published CSV only exports a subset of PAX rows. Row 0 totals come
// from sheet COUNTIF formulas covering the full dataset and are always accurate.
// Per-filter KPI counts are derived from the published rows only.

const MONTHS = ['JAN 2026','FEB 2026','MAR 2026','APR 2026','MAY 2026','JUNE 2026',
                 'JULY 2026','AUG 2026','SEP 2026','OCT 2026','NOV 2026','DEC 2026'];
const POST_GOAL = 12;

(async function () {
  let allRows = [];
  let filteredRows = [];
  let showRegularsOnly = true;
  let barChart = null;
  let activeMonths = [];
  let currentMonth = '';
  let sheetTotals = {};  // row 0 — accurate COUNTIF totals for the full dataset

  try {
    const csv = await f3FetchCSV('leaderboard');
    const lines = csv.trim().split('\n');

    // Parse row 0 totals against row 1 headers
    const totalsVals = f3ParseCSVLine(lines[0]);
    const headerVals = f3ParseCSVLine(lines[1]);
    headerVals.forEach((h, i) => {
      const clean = h.trim();
      if (MONTHS.includes(clean)) sheetTotals[clean] = parseInt(totalsVals[i]) || 0;
    });

    allRows = f3ParseCSV(csv, 1);
    allRows = allRows.filter(r => r['PAX'] && r['PAX'].trim() !== '');
  } catch (e) {
    f3ShowError('leaderboard-heatmap', e.message);
    f3ShowError('chart-monthly-completions', e.message);
    return;
  }

  // Months with any data in the sheet totals; currentMonth = most recent non-zero
  activeMonths = MONTHS.filter(m => sheetTotals[m] > 0);
  currentMonth = activeMonths.length ? activeMonths[activeMonths.length - 1] : MONTHS[0];

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
      totals[m] = rows.filter(r => (parseInt(r[m]) || 0) >= POST_GOAL).length;
    });
    return totals;
  }

  function renderAll() {
    // Bar chart always uses sheet row 0 (full dataset COUNTIF — accurate)
    // KPI stat card uses filtered rows for the current-month progress bar
    const filteredTotals = computeFilteredTotals(filteredRows);
    renderStatCards(filteredTotals);
    renderBarChart(sheetTotals);
    renderHabitCards();
    renderYearGrid();
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
      barChart = new ApexCharts(document.getElementById('chart-monthly-completions'), options);
      barChart.render();
    }
  }

  function renderHabitCards() {
    const container = document.getElementById('leaderboard-heatmap');

    const sorted = [...filteredRows].sort((a, b) => {
      const aPosts = parseInt(a[currentMonth]) || 0;
      const bPosts = parseInt(b[currentMonth]) || 0;
      const aDone = aPosts >= POST_GOAL ? 1 : 0;
      const bDone = bPosts >= POST_GOAL ? 1 : 0;
      if (bDone !== aDone) return bDone - aDone;
      return bPosts - aPosts;
    });

    const cards = sorted.map(r => {
      const currentPosts = parseInt(r[currentMonth]) || 0;
      const pct = Math.min(100, Math.round((currentPosts / POST_GOAL) * 100));

      const dots = MONTHS.map(m => {
        const raw = (r[m] || '').trim();
        const val = parseInt(raw) || 0;
        const hasData = raw !== '';
        const isCurrent = m === currentMonth;
        let cls = 'lb-dot';
        if (hasData && val >= POST_GOAL) cls += ' filled';
        else if (hasData && val > 0)     cls += ' partial';
        const ringStyle = isCurrent ? 'outline:2px solid var(--green);outline-offset:2px;' : '';
        const label = hasData ? `${m.replace(' 2026','')}: ${val} posts` : `${m.replace(' 2026','')}: —`;
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

      let statusCls, statusText;
      if (currentPosts >= POST_GOAL) { statusCls = 'lb-status-done';   statusText = 'Complete'; }
      else if (currentPosts >= 7)    { statusCls = 'lb-status-track';  statusText = 'On Track'; }
      else if (currentPosts > 0)     { statusCls = 'lb-status-behind'; statusText = `Need ${POST_GOAL - currentPosts}`; }
      else                           { statusCls = 'lb-status-ghost';  statusText = 'Not Started'; }

      const countCls = currentPosts >= POST_GOAL ? ' lb-complete' : currentPosts < 4 ? ' lb-behind' : '';

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

    function cellClass(raw) {
      const n = parseInt(raw) || 0;
      if (n === 0)          return 'lb-cell-0';
      if (n < 6)            return 'lb-cell-low';
      if (n < POST_GOAL)    return 'lb-cell-mid';
      return 'lb-cell-done';
    }

    const thead = `<thead><tr>
      <th style="text-align:left;padding:0.5rem 0.75rem;">PAX</th>
      ${activeMonths.map(m => `<th>${f3Esc(m.replace(' 2026', ''))}</th>`).join('')}
      <th>Streak</th>
    </tr></thead>`;

    const tbody = filteredRows.map(r => {
      const cells = activeMonths.map(m => {
        const val = (r[m] || '').trim();
        const cls = cellClass(val);
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
})();
