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

  filteredRows = [...allRows];
  let barChart = null;
  let donutChart = null;

  renderAll();
  f3MakeSortable('pax-full-table', () => filteredRows, renderTableBody);

  document.getElementById('filter-apply').addEventListener('click', () => {
    const from = document.getElementById('filter-from').value;
    const to = document.getElementById('filter-to').value;
    filteredRows = f3FilterByDateRange(allRows, 'Last Seen', from, to);
    renderAll();
  });

  function renderAll() {
    renderStatCards(filteredRows);
    renderBarChart(filteredRows);
    renderDonutChart(filteredRows);
    renderTable(filteredRows);
  }

  function renderStatCards(rows) {
    document.getElementById('stat-total-pax').textContent = rows.length;
    const active3wk = rows.filter(r => parseInt(r['Last 3 wk']) > 0).length;
    document.getElementById('stat-active-3wk').textContent = active3wk;
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

  function renderTable(rows) {
    const container = document.getElementById('pax-table-container');
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-vcenter table-hover card-table" id="pax-full-table">
          <thead>
            <tr>
              <th data-sort="Site">PAX</th>
              <th data-sort="Last Seen">Last Seen</th>
              <th data-sort="Last PC Q">Last PC Q</th>
              <th data-sort="Total Post">Posts</th>
              <th data-sort="Total Q">Qs</th>
              <th data-sort="Q/P Ratio">Q/P Ratio</th>
              <th data-sort="Last 3 wk">Last 3 Wks</th>
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
      return `<tr>
        <td><strong>${f3Esc(r['Site'])}</strong></td>
        <td>${f3Esc(r['Last Seen'] || '—')}</td>
        <td class="text-muted">${f3Esc(r['Last PC Q'] || '—')}</td>
        <td>${r['Total Post'] || '0'}</td>
        <td>${r['Total Q'] || '0'}</td>
        <td>${isNaN(qpRatio) ? '—' : (qpRatio * 100).toFixed(1) + '%'}</td>
        <td>${r['Last 3 wk'] || '0'}</td>
        <td class="text-muted">${f3Esc(r['Favorite AO'] || '—')}</td>
      </tr>`;
    }).join('');
  }
})();
