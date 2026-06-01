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
      tooltip: { theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" } },
    };

    if (barChart) {
      barChart.updateOptions(options);
    } else {
      f3LazyChart('chart-top-pax', () => {
        barChart = new ApexCharts(document.getElementById('chart-top-pax'), options);
        barChart.render();
      });
    }
  }

  function renderDonutChart(rows) {
    const buckets = { '1x/wk': 0, '2x/wk': 0, '3x/wk': 0, '4x/wk': 0, '5x/wk': 0, '6+x/wk': 0 };
    rows.forEach(r => {
      const avg = parseFloat(r['Avg/Week']);
      if (isNaN(avg) || avg < 0.5) return;
      const n = Math.round(avg);
      if (n >= 6)      buckets['6+x/wk']++;
      else if (n >= 1) buckets[`${n}x/wk`]++;
    });

    const activeKeys = Object.keys(buckets).filter(k => buckets[k] > 0);
    const allColors  = ['#c8bfa8', '#9aad88', '#7a9a68', '#4a5e3a', '#3a4d2d', '#2a3d1d'];
    const colorMap   = Object.fromEntries(Object.keys(buckets).map((k, i) => [k, allColors[i]]));

    const options = {
      chart: { type: 'donut', height: 320, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: activeKeys.map(k => buckets[k]),
      labels: activeKeys,
      colors: activeKeys.map(k => colorMap[k]),
      grid: { borderColor: '#c8bfa8' },
      legend: { position: 'bottom' },
      dataLabels: { enabled: true },
      tooltip: { theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" } },
    };

    if (donutChart) {
      donutChart.updateOptions(options);
    } else {
      f3LazyChart('chart-activity-donut', () => {
        donutChart = new ApexCharts(document.getElementById('chart-activity-donut'), options);
        donutChart.render();
      });
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
      tooltip: { theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" } },
    };
    if (favDayChart) { favDayChart.updateOptions(options); }
    else { f3LazyChart('chart-fav-day', () => { favDayChart = new ApexCharts(document.getElementById('chart-fav-day'), options); favDayChart.render(); }); }
  }

  function renderTrajectoryChart(rows) {
    // Actual sheet values: '🔥 Heating Up', '❄️ Cooling Off', '-' (no change)
    const TRAJ_MAP = {
      '🔥 Heating Up':  { label: '🔥 Heating Up',     color: '#c8a840' },
      '❄️ Cooling Off': { label: '❄️ Cooling Off',    color: '#8a9aaf' },
      '-':              { label: '➡️ Holding Steady',  color: '#c8bfa8' },
    };
    const counts = {};
    rows.forEach(r => {
      const t = (r['Trajectory'] || '-').trim();
      const key = TRAJ_MAP[t] ? t : '-';
      counts[key] = (counts[key] || 0) + 1;
    });
    const keys = Object.keys(TRAJ_MAP).filter(k => counts[k] > 0);
    const options = {
      chart: { type: 'donut', height: 260, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: keys.map(k => counts[k]),
      labels: keys.map(k => TRAJ_MAP[k].label),
      colors: keys.map(k => TRAJ_MAP[k].color),
      grid: { borderColor: '#c8bfa8' },
      legend: { position: 'bottom' },
      dataLabels: { enabled: true },
      tooltip: { theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" } },
    };
    if (trajectoryChart) { trajectoryChart.updateOptions(options); }
    else { f3LazyChart('chart-trajectory', () => { trajectoryChart = new ApexCharts(document.getElementById('chart-trajectory'), options); trajectoryChart.render(); }); }
  }

  function renderQpRatioChart(rows) {
    const top10 = [...rows]
      .filter(r => {
        const v = parseFloat(r['Q/P Ratio']);
        const posts = parseInt(r['Total Post']) || 0;
        return !isNaN(v) && v > 0 && posts >= 5;
      })
      .sort((a, b) => parseFloat(b['Q/P Ratio']) - parseFloat(a['Q/P Ratio']))
      .slice(0, 5);

    const container = document.getElementById('chart-qp-ratio');
    if (!top10.length) { container.innerHTML = '<p class="text-muted p-3">No data</p>'; return; }

    const maxRatio = parseFloat(top10[0]['Q/P Ratio']);
    container.innerHTML = `<div class="qp-leader-list">${
      top10.map((r, i) => {
        const ratio = parseFloat(r['Q/P Ratio']);
        const pct = (ratio * 100).toFixed(1);
        const barW = Math.round((ratio / maxRatio) * 100);
        return `<div class="qp-leader-row">
          <div class="qp-leader-meta">
            <span class="qp-rank">#${i + 1}</span>
            <span class="qp-name">${f3Esc(r['Site'])}</span>
            <span class="qp-pct">${pct}%</span>
          </div>
          <div class="qp-bar-track"><div class="qp-bar-fill" style="width:${barW}%"></div></div>
        </div>`;
      }).join('')
    }</div>`;
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
      const trajLabel = { '🔥 Heating Up': 'Heating Up', '❄️ Cooling Off': 'Cooling Off', '-': '—' }[traj] || traj || '—';
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
