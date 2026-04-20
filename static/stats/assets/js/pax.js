// PAX Stats page logic
// Source: PAX Stats tab, header at row index 2
// Note: the "Site" column contains PAX F3 names/handles (confusingly named)
// Filter: skip rows where Site is blank or pure numeric (summary rows)

(async function () {
  let allRows = [];
  let filteredRows = [];

  try {
    const csv = await f3FetchCSV('pax');
    allRows = f3ParseCSV(csv, 2);
    allRows = allRows.filter(r => {
      const site = (r['Site'] || '').trim();
      return site !== '' && isNaN(Number(site));
    });
  } catch (e) {
    f3ShowError('pax-table-container', e.message);
    f3ShowError('chart-top-pax', e.message);
    return;
  }

  // Default: show PC Regulars only
  let showRegularsOnly = true;
  filteredRows = allRows.filter(r => (r['PC Regular?'] || '').trim().toUpperCase() === 'TRUE');
  let barChart = null;
  let donutChart = null;
  let favDayChart = null;
  let trajectoryChart = null;
  let qpRatioChart = null;

  renderAll();
  f3MakeSortable('pax-full-table', () => filteredRows, renderTableBody);

  document.getElementById('btn-regulars').addEventListener('click', () => {
    if (showRegularsOnly) return;
    showRegularsOnly = true;
    filteredRows = allRows.filter(r => (r['PC Regular?'] || '').trim().toUpperCase() === 'TRUE');
    document.getElementById('btn-regulars').classList.add('active');
    document.getElementById('btn-all-pax').classList.remove('active');
    document.getElementById('pax-table-title').textContent = 'PC Regulars';
    renderAll();
  });

  document.getElementById('btn-all-pax').addEventListener('click', () => {
    if (!showRegularsOnly) return;
    showRegularsOnly = false;
    filteredRows = [...allRows];
    document.getElementById('btn-all-pax').classList.add('active');
    document.getElementById('btn-regulars').classList.remove('active');
    document.getElementById('pax-table-title').textContent = 'All PAX';
    renderAll();
  });

  function renderAll() {
    renderStatCards(filteredRows);
    renderBarChart(filteredRows);
    renderDonutChart(filteredRows);
    renderFavDayChart(filteredRows);
    renderTrajectoryChart(filteredRows);
    renderQpRatioChart(filteredRows);
    renderTable(filteredRows);
  }

  function renderStatCards(rows) {
    document.getElementById('stat-total-pax').textContent = rows.length;
    const active3wk = rows.filter(r => parseInt(r['Last 3 wk']) > 0).length;
    document.getElementById('stat-active-3wk').textContent = active3wk;
    // Update subheader label to reflect current filter
    document.getElementById('stat-total-pax').closest('.card-body').querySelector('.subheader').textContent =
      showRegularsOnly ? 'PC Regulars' : 'Total PAX';
    const totalPosts = rows.reduce((s, r) => s + (parseInt(r['Total Post']) || 0), 0);
    document.getElementById('stat-total-posts').textContent = totalPosts.toLocaleString();
    const totalQs = rows.reduce((s, r) => s + (parseInt(r['Total Q']) || 0), 0);
    document.getElementById('stat-total-qs').textContent = totalQs.toLocaleString();
  }

  function renderBarChart(rows) {
    const top15 = [...rows]
      .sort((a, b) => (parseInt(b['Total Post']) || 0) - (parseInt(a['Total Post']) || 0))
      .slice(0, 15);

    const options = {
      chart: { type: 'bar', height: 320, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [{ name: 'Total Posts', data: top15.map(r => parseInt(r['Total Post']) || 0) }],
      xaxis: { categories: top15.map(r => r['Site']) },
      colors: ['#4a5e3a'],
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { horizontal: false, columnWidth: '60%' } },
      dataLabels: { enabled: false },
      yaxis: { title: { text: 'Posts' } },
    };

    if (barChart) {
      barChart.updateOptions(options);
    } else {
      barChart = new ApexCharts(document.getElementById('chart-top-pax'), options);
      barChart.render();
    }
  }

  function renderDonutChart(rows) {
    const active = rows.filter(r => parseInt(r['Last 3 wk']) > 0).length;
    const lapsed = rows.length - active;

    const options = {
      chart: { type: 'donut', height: 320, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [active, lapsed],
      labels: ['Active (last 3 wks)', 'Lapsed'],
      colors: ['#4a5e3a', '#c8bfa8'],
      grid: { borderColor: '#c8bfa8' },
      legend: { position: 'bottom' },
      dataLabels: { enabled: true },
    };

    if (donutChart) {
      donutChart.updateOptions(options);
    } else {
      donutChart = new ApexCharts(document.getElementById('chart-activity-donut'), options);
      donutChart.render();
    }
  }

  function renderFavDayChart(rows) {
    const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    const counts = {};
    DAY_ORDER.forEach(d => { counts[d] = 0; });
    rows.forEach(r => {
      const d = (r['Favorite Day of the week'] || '').trim();
      if (counts[d] !== undefined) counts[d]++;
    });
    const options = {
      chart: { type: 'bar', height: 260, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [{ name: 'PAX', data: DAY_ORDER.map(d => counts[d]) }],
      xaxis: { categories: DAY_ORDER.map(d => d.slice(0,3)) },
      colors: ['#4a5e3a'],
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { columnWidth: '60%' } },
      dataLabels: { enabled: false },
      yaxis: { title: { text: 'PAX' }, min: 0, forceNiceScale: true },
    };
    if (favDayChart) { favDayChart.updateOptions(options); }
    else { favDayChart = new ApexCharts(document.getElementById('chart-fav-day'), options); favDayChart.render(); }
  }

  function renderTrajectoryChart(rows) {
    const labels = { '↑': 'Improving', '↓': 'Declining', '→': 'Stable', 'NEW': 'New', '-': 'Inactive' };
    const counts = { '↑': 0, '↓': 0, '→': 0, 'NEW': 0, '-': 0 };
    rows.forEach(r => {
      const t = (r['Trajectory'] || '-').trim();
      if (counts[t] !== undefined) counts[t]++;
      else counts['-']++;
    });
    const keys = Object.keys(counts).filter(k => counts[k] > 0);
    const options = {
      chart: { type: 'donut', height: 260, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: keys.map(k => counts[k]),
      labels: keys.map(k => labels[k] || k),
      colors: ['#4a5e3a', '#8a7a60', '#c8bfa8', '#c8a840', '#1a1a1a'],
      grid: { borderColor: '#c8bfa8' },
      legend: { position: 'bottom' },
      dataLabels: { enabled: true },
    };
    if (trajectoryChart) { trajectoryChart.updateOptions(options); }
    else { trajectoryChart = new ApexCharts(document.getElementById('chart-trajectory'), options); trajectoryChart.render(); }
  }

  function renderQpRatioChart(rows) {
    const buckets = { '0%': 0, '1–10%': 0, '11–20%': 0, '21%+': 0 };
    rows.forEach(r => {
      const v = parseFloat(r['Q/P Ratio']);
      if (isNaN(v)) return;
      const pct = v * 100;
      if (pct === 0) buckets['0%']++;
      else if (pct <= 10) buckets['1–10%']++;
      else if (pct <= 20) buckets['11–20%']++;
      else buckets['21%+']++;
    });
    const options = {
      chart: { type: 'bar', height: 260, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [{ name: 'PAX', data: Object.values(buckets) }],
      xaxis: { categories: Object.keys(buckets) },
      colors: ['#4a5e3a'],
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { columnWidth: '55%' } },
      dataLabels: { enabled: false },
      yaxis: { title: { text: 'PAX' }, min: 0, forceNiceScale: true },
    };
    if (qpRatioChart) { qpRatioChart.updateOptions(options); }
    else { qpRatioChart = new ApexCharts(document.getElementById('chart-qp-ratio'), options); qpRatioChart.render(); }
  }

  function renderTable(rows) {
    const container = document.getElementById('pax-table-container');
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-vcenter table-hover card-table" id="pax-full-table">
          <thead>
            <tr>
              <th data-sort="Site">PAX</th>
              <th data-sort="Last Seen">Last Seen</th>
              <th data-sort="Total Post">Posts</th>
              <th data-sort="Total Q">Qs</th>
              <th data-sort="Q/P Ratio">Q/P Ratio</th>
              <th data-sort="Avg/Week">Avg/Wk</th>
              <th data-sort="Avg/Last 3 Weeks">Avg/3Wk</th>
              <th data-sort="Last 3 wk">Last 3 Wks</th>
              <th data-sort="Trajectory">Trajectory</th>
              <th data-sort="Favorite AO">Fav AO</th>
            </tr>
          </thead>
          <tbody id="pax-table-body"></tbody>
        </table>
      </div>`;
    renderTableBody(rows);
    // Re-attach sortable after table rebuild
    f3MakeSortable('pax-full-table', () => filteredRows, renderTableBody);
  }

  function renderTableBody(rows) {
    const body = document.getElementById('pax-table-body');
    if (!body) return;
    body.innerHTML = rows.map(r => {
      const qpRatio = parseFloat(r['Q/P Ratio']);
      const avgWk = parseFloat(r['Avg/Week']);
      const avg3Wk = parseFloat(r['Avg/Last 3 Weeks']);
      const traj = (r['Trajectory'] || '').trim();
      const trajLabel = { '↑': '↑ Up', '↓': '↓ Down', '→': '→ Stable', 'NEW': 'NEW', '-': '—' }[traj] || traj || '—';
      return `<tr>
        <td><strong>${f3Esc(r['Site'])}</strong></td>
        <td>${f3Esc(r['Last Seen'] || '—')}</td>
        <td>${r['Total Post'] || '0'}</td>
        <td>${r['Total Q'] || '0'}</td>
        <td>${isNaN(qpRatio) ? '—' : (qpRatio * 100).toFixed(1) + '%'}</td>
        <td>${isNaN(avgWk) ? '—' : avgWk.toFixed(1)}</td>
        <td>${isNaN(avg3Wk) ? '—' : avg3Wk.toFixed(1)}</td>
        <td>${r['Last 3 wk'] || '0'}</td>
        <td>${f3Esc(trajLabel)}</td>
        <td class="text-muted">${f3Esc(r['Favorite AO'] || '—')}</td>
      </tr>`;
    }).join('');
  }
})();
