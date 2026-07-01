// #112 Leaderboard page logic
// Source: Raw tab — computed in JS from attendance records
//   Columns used: Date (YYYY-MM-DD), Name (PAX), Site, Role ("Q" or "P")

const MONTHS = ['JAN 2026','FEB 2026','MAR 2026','APR 2026','MAY 2026','JUNE 2026',
                 'JULY 2026','AUG 2026','SEP 2026','OCT 2026','NOV 2026','DEC 2026'];
const POST_GOAL = 12;

(async function () {
  const PC_REGULAR_WEEKS = 26;
  const PC_REGULAR_RECENT_WEEKS = 3;
  const PC_REGULAR_RECENT_MIN = 3;
  const PC_REGULAR_EXCLUDED_SITES = ['#downrange', 'Shield Lock'];

  let allRows = [];
  let filteredRows = [];
  let showRegularsOnly = true;
  let barChart = null;
  let activeMonths = [];
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
    currentMonth = MONTHS[todayMonthIdx] ?? MONTHS[0];
    activeMonths = MONTHS.filter((_, i) => i <= todayMonthIdx);

    function dateToMonthLabel(dateStr) {
      if (!dateStr || !dateStr.startsWith('2026-')) return null;
      return MONTHS[parseInt(dateStr.slice(5, 7)) - 1] ?? null;
    }

    // Aggregate 2026 records into per-PAX post+Q counts
    const rawRows2026 = allRawRows.filter(r => (r['Date'] || '').startsWith('2026-'));

    const paxAgg = {};
    rawRows2026.forEach(r => {
      const name = r['Name'].trim();
      const month = dateToMonthLabel(r['Date']);
      if (!month) return;
      if (!paxAgg[name]) paxAgg[name] = { posts: {}, qs: {} };
      paxAgg[name].posts[month] = (paxAgg[name].posts[month] || 0) + 1;
      if ((r['Role'] || '').trim() === 'Q')
        paxAgg[name].qs[month] = (paxAgg[name].qs[month] || 0) + 1;
    });

    allRows = Object.entries(paxAgg).map(([name, agg]) => {
      const row = { 'PAX': name, 'PC Reg.': pcRegMap[name] ? 'TRUE' : 'FALSE' };
      MONTHS.forEach(m => { row[m] = agg.posts[m] ? String(agg.posts[m]) : ''; });
      row['_qs'] = agg.qs;

      const completedMonths = activeMonths.map(m =>
        (parseInt(row[m]) || 0) >= POST_GOAL && (agg.qs[m] || 0) >= 1
      );
      let streak = 0;
      for (let i = completedMonths.length - 1; i >= 0; i--) {
        if (completedMonths[i]) streak++;
        else break;
      }
      row['Streakers'] = `${streak}/${completedMonths.filter(Boolean).length}`;
      return row;
    });
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
      rank(a) - rank(b) || (parseInt(b[currentMonth]) || 0) - (parseInt(a[currentMonth]) || 0)
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
