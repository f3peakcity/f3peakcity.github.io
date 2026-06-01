// AO Stats page logic
// Source: AO Stats tab, header at row index 2
// Key columns: Site, Total Attendees, Avg/Meeting, FNGs, Unique Qs,
//   Bench Strength, Active Core PAX, Most Frequent Q, Weeks in Range
// Core PAX: cross-referenced from PAX tab via Favorite AO column

(async function () {
  let allRows = [];
  let filteredRows = [];
  let coreByAO = {};   // { aoSiteName: ['PAX1', 'PAX2', ...] }
  let attendanceChart = null;
  let fngsByAoChart = null;
  let weeklyChart = null;

  let rawRows = [];

  try {
    const [aoCsv, paxCsv] = await Promise.all([
      f3FetchCSV('ao'),
      f3FetchCSV('pax'),
    ]);

    allRows = f3ParseCSV(aoCsv, 2);
    allRows = allRows.filter(r => r['Site'] && r['Site'].trim() !== '');

    // Build core PAX map: group PAX by their Favorite AO
    const paxRows = f3ParseCSV(paxCsv, 2).filter(r => {
      const s = (r['Site'] || '').trim();
      return s !== '' && isNaN(Number(s));
    });
    paxRows.forEach(r => {
      const ao = (r['Favorite AO'] || '').trim();
      if (!ao || ao === '#downrange') return;
      if (!coreByAO[ao]) coreByAO[ao] = [];
      coreByAO[ao].push(r['Site'].trim());
    });
  } catch (e) {
    f3ShowError('ao-table-container', e.message);
    f3ShowError('ao-cards-grid', e.message);
    return;
  }

  filteredRows = [...allRows];
  renderAll();

  // Fetch the heavy raw CSV after above-fold content is already rendered
  f3FetchCSV('raw').then(rawCsv => {
    rawRows = f3ParseCSV(rawCsv, 0).filter(r =>
      r['Date'] && r['Date'].match(/^\d{4}-\d{2}-\d{2}$/) &&
      r['Site'] && r['Site'].trim() !== '' && r['Site'].trim() !== '#downrange'
    );
    renderWeeklyAttendance(rawRows);
  }).catch(() => {});

  // Set up sortable — must call AFTER table is first rendered
  // Uses getter so it always sorts the current filteredRows
  function setupSortable() {
    f3MakeSortable('ao-full-table', () => filteredRows, renderTableBody);
  }

  function renderAll() {
    renderStatCards(filteredRows);
    renderWeeklyAttendance(rawRows);
    renderAttendanceChart(filteredRows);
    renderFngsByAoChart(filteredRows);
    renderAOCards(filteredRows);
    renderTable(filteredRows);
    setupSortable();
  }

  function weekMonday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d.toISOString().slice(0, 10);
  }

  function renderWeeklyAttendance(rows) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 26 * 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const weekCounts = {};
    rows.forEach(r => {
      if (r['Date'] < cutoffStr) return;
      const wk = weekMonday(r['Date']);
      weekCounts[wk] = (weekCounts[wk] || 0) + 1;
    });

    const weeks = Object.keys(weekCounts).sort();
    if (!weeks.length) return;

    const labels = weeks.map(w => {
      const d = new Date(w + 'T00:00:00');
      return d.toLocaleString('default', { month: 'short', day: 'numeric' });
    });
    const counts = weeks.map(w => weekCounts[w]);
    const avg = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length);

    const rangeEl = document.getElementById('weekly-attendance-range');
    if (rangeEl) rangeEl.textContent = `${labels[0]} – ${labels[labels.length - 1]} · ${weeks.length} weeks · avg ${avg}/wk`;

    const options = {
      chart: { type: 'bar', height: 280, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [{ name: 'PAX', data: counts }],
      xaxis: { categories: labels, labels: { rotate: -45, style: { fontSize: '10px' } }, tickAmount: 13 },
      colors: ['#4a5e3a'],
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { columnWidth: '75%' } },
      dataLabels: { enabled: false },
      yaxis: { title: { text: 'PAX' }, min: 0, forceNiceScale: true },
      annotations: { yaxis: [{ y: avg, borderColor: '#8a7a60', strokeDashArray: 4, label: { text: `avg ${avg}`, style: { fontFamily: "'Open Sans', sans-serif", fontSize: '11px', color: '#8a7a60', background: 'transparent' }, borderColor: 'transparent' } }] },
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
      const benchDisplay = isNaN(bench) ? (r['Bench Strength'] || '—') : bench.toFixed(1) + '%';
      const topQ = r['Most Frequent Q'] || '—';
      const corePax = coreByAO[r['Site'].trim()] || [];
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
                <div class="text-muted small">Bench Strength</div>
                <div class="fw-bold">${benchDisplay}</div>
              </div>
              <div class="col-6">
                <div class="text-muted small">Top Q</div>
                <div class="fw-bold">${f3Esc(topQ)}</div>
              </div>
            </div>
            <div class="text-muted small mb-1">Core PAX (${corePax.length})</div>
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
              <th data-sort="Site">Site</th>
              <th data-sort="Total Attendees">Total Posts</th>
              <th data-sort="Weeks in Range">Weeks</th>
              <th data-sort="Avg/Meeting">Avg/Meeting</th>
              <th data-sort="FNGs">FNGs</th>
              <th data-sort="Unique Qs">Unique Qs</th>
              <th data-sort="Bench Strength">Bench Strength</th>
              <th>Core Names</th>
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
      const benchDisplay = isNaN(bench) ? (r['Bench Strength'] || '—') : bench.toFixed(1) + '%';
      return `<tr>
        <td>${f3Esc(r['Site'])}</td>
        <td>${r['Total Attendees'] || '—'}</td>
        <td>${r['Weeks in Range'] || '—'}</td>
        <td>${parseFloat(r['Avg/Meeting']) ? parseFloat(r['Avg/Meeting']).toFixed(1) : '—'}</td>
        <td>${r['FNGs'] || '0'}</td>
        <td>${r['Unique Qs'] || '—'}</td>
        <td>${benchDisplay}</td>
        <td class="text-muted small">${f3Esc(r['Core Names'] && r['Core Names'] !== '-' ? r['Core Names'] : '—')}</td>
      </tr>`;
    }).join('');
  }
})();
