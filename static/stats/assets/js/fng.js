// FNG Stats page logic
// Source: FNG Stats tab, header at row index 0
// Status values: '👻 Ghosted', '⏳ Pending (Grace Period)', '🌱 Developing (Returned)'

(async function () {
  let allRows = [];
  let filteredRows = [];

  try {
    const csv = await f3FetchCSV('fng');
    allRows = f3ParseCSV(csv, 0);
    // Remove rows where FNG Name is blank (trailing sheet rows or date-header col)
    allRows = allRows.filter(r => r['FNG Name'] && r['FNG Name'].trim() !== '');
  } catch (e) {
    f3ShowError('fng-table-container', e.message);
    f3ShowError('chart-fng-status', e.message);
    return;
  }

  filteredRows = [...allRows];
  let donutChart = null;
  let barChart = null;
  let monthlyChart = null;

  renderAll();
  f3MakeSortable('fng-full-table', () => filteredRows, renderTableBody);

  document.getElementById('filter-apply').addEventListener('click', () => {
    const from = document.getElementById('filter-from').value;
    const to = document.getElementById('filter-to').value;
    filteredRows = f3FilterByDateRange(allRows, 'First Post', from, to);
    updateFilterLabel(from, to);
    renderAll();
  });

  document.getElementById('filter-clear').addEventListener('click', () => {
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
    filteredRows = [...allRows];
    updateFilterLabel('', '');
    renderAll();
  });

  function updateFilterLabel(from, to) {
    const lbl = document.getElementById('filter-result-label');
    if (!lbl) return;
    if (!from && !to) {
      lbl.style.display = 'none';
      lbl.textContent = '';
    } else {
      lbl.style.display = 'block';
      lbl.textContent = `Showing ${filteredRows.length} of ${allRows.length} FNGs`;
    }
  }

  function renderAll() {
    renderStatCards(filteredRows);
    renderStatusDonut(filteredRows);
    renderDaysBar(filteredRows);
    renderMonthlyTrend(filteredRows);
    renderTable(filteredRows);
  }

  function renderStatCards(rows) {
    document.getElementById('stat-total-fngs').textContent = rows.length;
    const retained = rows.filter(r => r['Status'] && r['Status'].includes('Developing')).length;
    document.getElementById('stat-retained').textContent = retained;
    const ghosted = rows.filter(r => r['Status'] && r['Status'].includes('Ghosted')).length;
    document.getElementById('stat-ghosted').textContent = ghosted;
    const pending = rows.filter(r => r['Status'] && r['Status'].includes('Pending')).length;
    document.getElementById('stat-pending').textContent = pending;
  }

  function renderStatusDonut(rows) {
    const developing = rows.filter(r => r['Status'] && r['Status'].includes('Developing')).length;
    const ghosted    = rows.filter(r => r['Status'] && r['Status'].includes('Ghosted')).length;
    const pending    = rows.filter(r => r['Status'] && r['Status'].includes('Pending')).length;

    const options = {
      chart: { type: 'donut', height: 320, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [developing, ghosted, pending],
      labels: ['Developing', 'Ghosted', 'Pending'],
      colors: ['#4a5e3a', '#8a7a60', '#c8a840'],
      grid: { borderColor: '#c8bfa8' },
      legend: { position: 'bottom' },
      tooltip: { theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" } },
    };

    if (donutChart) {
      donutChart.updateOptions(options);
    } else {
      f3LazyChart('chart-fng-status', () => {
        donutChart = new ApexCharts(document.getElementById('chart-fng-status'), options);
        donutChart.render();
      });
    }
  }

  function renderDaysBar(rows) {
    const buckets = { '1-7 days': 0, '8-14 days': 0, '15-30 days': 0, '31+ days': 0 };
    rows.forEach(r => {
      const d = parseInt(r['Days to 2nd post']);
      if (isNaN(d)) return;
      if (d <= 7) buckets['1-7 days']++;
      else if (d <= 14) buckets['8-14 days']++;
      else if (d <= 30) buckets['15-30 days']++;
      else buckets['31+ days']++;
    });

    const options = {
      chart: { type: 'bar', height: 320, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [{ name: 'FNGs', data: Object.values(buckets) }],
      xaxis: { categories: Object.keys(buckets) },
      colors: ['#4a5e3a'],
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { columnWidth: '50%' } },
      dataLabels: { enabled: false },
      yaxis: { title: { text: 'Count' }, min: 0, forceNiceScale: true },
      tooltip: { theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" } },
    };

    if (barChart) {
      barChart.updateOptions(options);
    } else {
      f3LazyChart('chart-days-to-return', () => {
        barChart = new ApexCharts(document.getElementById('chart-days-to-return'), options);
        barChart.render();
      });
    }
  }

  function renderMonthlyTrend(rows) {
    const counts = {};
    rows.forEach(r => {
      const val = (r['First Post'] || '').trim();
      if (!val) return;
      const mdy = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!mdy) return;
      const key = `${mdy[3]}-${String(mdy[1]).padStart(2,'0')}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    const months = Object.keys(counts).sort();
    if (!months.length) return;
    const options = {
      chart: { type: 'bar', height: 280, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [{ name: 'FNGs', data: months.map(m => counts[m]) }],
      xaxis: {
        categories: months.map(m => {
          const [y, mo] = m.split('-');
          return new Date(+y, +mo - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
        }),
      },
      colors: ['#4a5e3a'],
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { columnWidth: '60%' } },
      dataLabels: { enabled: false },
      yaxis: { title: { text: 'FNGs' }, min: 0, forceNiceScale: true },
      tooltip: { theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" } },
    };
    if (monthlyChart) { monthlyChart.updateOptions(options); }
    else { f3LazyChart('chart-fng-monthly', () => { monthlyChart = new ApexCharts(document.getElementById('chart-fng-monthly'), options); monthlyChart.render(); }); }
  }

  function renderTable(rows) {
    const container = document.getElementById('fng-table-container');
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-vcenter table-hover card-table" id="fng-full-table">
          <thead>
            <tr>
              <th data-sort="FNG Name">FNG Name</th>
              <th data-sort="First Post">First Post</th>
              <th data-sort="2nd Post">2nd Post</th>
              <th data-sort="Days to 2nd post">Days to Return</th>
              <th data-sort="Total Posts to date">Total Posts</th>
              <th data-sort="Status">Status</th>
              <th data-sort="Home AO">Home AO</th>
            </tr>
          </thead>
          <tbody id="fng-table-body"></tbody>
        </table>
      </div>`;
    renderTableBody(rows);
    f3MakeSortable('fng-full-table', () => filteredRows, renderTableBody);
  }

  function renderTableBody(rows) {
    const body = document.getElementById('fng-table-body');
    if (!body) return;
    body.innerHTML = rows.map(r => `<tr>
      <td><strong>${f3Esc(r['FNG Name'])}</strong></td>
      <td>${f3Esc(r['First Post'] || '—')}</td>
      <td>${f3Esc(r['2nd Post'] || '—')}</td>
      <td>${r['Days to 2nd post'] || '—'}</td>
      <td>${r['Total Posts to date'] || '—'}</td>
      <td>${f3Esc(r['Status'] || '—')}</td>
      <td class="text-muted">${f3Esc(r['Home AO'] || '—')}</td>
    </tr>`).join('');
  }
})();
