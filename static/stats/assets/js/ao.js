// AO Stats page logic
// Computed from Raw/Master attendance tab (header at row 0)
// Key columns from raw: Date, Name, Site, Role
// All aggregation is performed client-side from the raw CSV.

(async function () {
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
  const AO_EXCLUSIONS_LC = new Set(AO_DISPLAY_EXCLUSIONS.map(s => s.toLowerCase()));
  const CORE_PAX_THRESHOLD = 0.70;
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const now = new Date();
  const cutoff26w = new Date(now - 26 * MS_PER_WEEK);

  let allRows = [];
  let filteredRows = [];
  let allRawRows = [];
  let attendanceChart = null;
  let fngsByAoChart = null;
  let weeklyChart = null;

  try {
    const rawCsv = await f3FetchCSV('raw');
    allRawRows = f3ParseCSV(rawCsv, 0)
      .filter(r => r['Name'] && r['Name'].trim() && r['Date'].startsWith('2026-'));

    const aoMap = {};
    allRawRows.forEach(r => {
      const site = r['Site'].trim();
      if (EXCLUDED_SITES.includes(site)) return;
      if (AO_EXCLUSIONS_LC.has(site.toLowerCase())) return;
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
      ao.weeks.add(weekMonday(r['Date']));
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

      const ao26sessions = ao.w26dates.size;
      const corePax = ao26sessions > 0
        ? Object.entries(ao.w26byName)
            .filter(([, cnt]) => cnt / ao26sessions >= CORE_PAX_THRESHOLD)
            .map(([name]) => name)
            .sort()
        : [];

      return {
        'Site': site,
        'Total Attendees': ao.totalPosts,
        'Weeks in Range': ao.weeks.size,
        'Avg/Meeting': avgPerMeeting,
        'FNGs': ao.fngCount,
        'Unique Qs': ao.qNames.size,
        'Bench Strength': benchStrength,
        'Most Frequent Q': mostFreqQ,
        '_corePax': corePax,
      };
    });

  } catch (e) {
    f3ShowError('ao-table-container', e.message);
    f3ShowError('ao-cards-grid', e.message);
    return;
  }

  filteredRows = [...allRows];
  renderAll();

  // Set up sortable — must call AFTER table is first rendered
  // Uses getter so it always sorts the current filteredRows
  function setupSortable() {
    f3MakeSortable('ao-full-table', () => filteredRows, renderTableBody);
  }

  function renderAll() {
    renderStatCards(filteredRows);
    renderWeeklyAttendance(allRawRows);
    renderAttendanceChart(filteredRows);
    renderFngsByAoChart(filteredRows);
    renderAOCards(filteredRows);
    renderTable(filteredRows);
    setupSortable();
    // Init themed tooltips for static labels + freshly rendered cards/headers.
    f3InitTooltips();
  }

  function weekMonday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d.toISOString().slice(0, 10);
  }

  function renderWeeklyAttendance(rows) {
    // Earthy, newsprint-friendly palette cycled across AO segments.
    const WEEKLY_AO_PALETTE = [
      '#4a5e3a', '#8a7a60', '#c8a840', '#7a9a68', '#9a5a3a', '#5a7a8a',
      '#b08a50', '#3a4d2d', '#a86a5a', '#6a8a4a', '#8a6a90', '#a0a080',
      '#5a6a3a', '#9aad88', '#7a5a4a', '#4a6a6a', '#caa060', '#6a4a5a',
      '#8aaa70', '#a89060', '#5a8a7a', '#9a8a4a', '#7a6a5a', '#aa8a6a',
    ];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 26 * 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // Per-week, per-AO counts (real AOs only — mirrors the rest of the page).
    const weekAo = {};       // week -> { ao -> count }
    const aoTotals = {};     // ao -> total over range
    rows.forEach(r => {
      if (r['Date'] < cutoffStr) return;
      const site = (r['Site'] || '').trim();
      if (EXCLUDED_SITES.includes(site) || AO_EXCLUSIONS_LC.has(site.toLowerCase())) return;
      const wk = weekMonday(r['Date']);
      if (!weekAo[wk]) weekAo[wk] = {};
      weekAo[wk][site] = (weekAo[wk][site] || 0) + 1;
      aoTotals[site] = (aoTotals[site] || 0) + 1;
    });

    const weeks = Object.keys(weekAo).sort();
    if (!weeks.length) return;

    const labels = weeks.map(w => {
      const d = new Date(w + 'T00:00:00');
      return d.toLocaleString('default', { month: 'short', day: 'numeric' });
    });

    // Largest AOs first so the biggest blocks anchor the bottom of each stack.
    const aos = Object.keys(aoTotals).sort((a, b) => aoTotals[b] - aoTotals[a]);
    const series = aos.map(ao => ({ name: ao, data: weeks.map(w => weekAo[w][ao] || 0) }));
    const colors = aos.map((_, i) => WEEKLY_AO_PALETTE[i % WEEKLY_AO_PALETTE.length]);

    const weekTotals = weeks.map(w => Object.values(weekAo[w]).reduce((a, b) => a + b, 0));
    const avg = Math.round(weekTotals.reduce((a, b) => a + b, 0) / weekTotals.length);

    const rangeEl = document.getElementById('weekly-attendance-range');
    if (rangeEl) rangeEl.textContent = `${labels[0]} – ${labels[labels.length - 1]} · ${weeks.length} weeks · ${aos.length} AOs · avg ${avg}/wk`;

    const options = {
      chart: { type: 'bar', stacked: true, height: 460, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series,
      xaxis: { categories: labels, labels: { rotate: -45, style: { fontSize: '10px' } }, tickAmount: 13 },
      colors,
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { columnWidth: '80%' } },
      dataLabels: { enabled: false },
      yaxis: { title: { text: 'PAX' }, min: 0, forceNiceScale: true },
      legend: { position: 'bottom', fontSize: '11px', fontFamily: "'Open Sans', sans-serif", itemMargin: { horizontal: 6, vertical: 2 } },
      tooltip: { shared: false, intersect: true, theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" } },
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
      const benchCls = bench >= 40 ? 'bench-high' : bench >= 20 ? 'bench-mid' : 'bench-low';
      const benchHtml = isNaN(bench) ? '—' : `<span class="${benchCls}">${bench.toFixed(1)}%</span>`;
      const topQ = r['Most Frequent Q'] || '—';
      const corePax = r['_corePax'] || [];
      const coreHtml = corePax.length
        ? corePax.map(name => f3Esc(name)).join(', ')
        : '<em style="color:var(--muted);">None listed</em>';
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
                <div class="fw-bold">${r['Total Attendees'] || '—'}</div>
              </div>
              <div class="col-6">
                <div class="text-muted small">Bench Strength ${f3InfoDot("% of attendees who have Q'd at least once — higher means more Q depth (green ≥40%, amber 20–39%, red <20%)")}</div>
                <div class="fw-bold">${benchHtml}</div>
              </div>
              <div class="col-6">
                <div class="text-muted small">Top Q ${f3InfoDot('PAX who most frequently led workouts at this AO in 2026')}</div>
                <div class="fw-bold">${f3Esc(topQ)}</div>
              </div>
            </div>
            <div class="text-muted small mb-1">Core PAX (${corePax.length}) ${f3InfoDot('PAX who attend ≥70% of sessions in the last 26 weeks')}</div>
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
              <th data-sort="Total Attendees">Total Posts ${f3InfoDot('Total individual posts at this AO in 2026')}</th>
              <th data-sort="Weeks in Range">Weeks ${f3InfoDot('Number of distinct weeks this AO has run in 2026')}</th>
              <th data-sort="Avg/Meeting">Avg/Meeting ${f3InfoDot('Average PAX count per session (Total Posts ÷ Distinct Sessions)')}</th>
              <th data-sort="FNGs">FNGs ${f3InfoDot('Number of first-time attendees at this AO in 2026')}</th>
              <th data-sort="Unique Qs">Unique Qs ${f3InfoDot('Number of distinct PAX who have led a workout (Q) at this AO in 2026')}</th>
              <th data-sort="Bench Strength">Bench Strength ${f3InfoDot("% of attendees who have Q'd at least once — higher means more Q depth (green ≥40%, amber 20–39%, red <20%)")}</th>
              <th>Core Names ${f3InfoDot('PAX who attend ≥70% of sessions in the last 26 weeks')}</th>
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
      const benchCls = !isNaN(bench) ? (bench >= 40 ? 'bench-high' : bench >= 20 ? 'bench-mid' : 'bench-low') : '';
      const benchDisplay = isNaN(bench) ? '—' : `<span class="${benchCls}">${bench.toFixed(1)}%</span>`;
      const coreNames = (r['_corePax'] || []).join(', ') || '—';
      return `<tr>
        <td>${f3Esc(r['Site'])}</td>
        <td>${r['Total Attendees'] || '—'}</td>
        <td>${r['Weeks in Range'] || '—'}</td>
        <td>${parseFloat(r['Avg/Meeting']) ? parseFloat(r['Avg/Meeting']).toFixed(1) : '—'}</td>
        <td>${r['FNGs'] || '0'}</td>
        <td>${r['Unique Qs'] || '—'}</td>
        <td>${benchDisplay}</td>
        <td class="text-muted small">${f3Esc(coreNames)}</td>
      </tr>`;
    }).join('');
  }
})();
