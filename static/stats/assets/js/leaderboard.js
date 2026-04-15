// #112 Leaderboard page logic
// Source: 2026 Leaderboard tab
//   Row 0: monthly completion totals (count of PAX who met the #112 challenge)
//   Row 1: headers — PAX, JAN 2026, FEB 2026, ..., DEC 2026, Streakers
//   Rows 2+: PAX data — post counts per month; Streakers = "X/Y" format

const MONTHS = ['JAN 2026','FEB 2026','MAR 2026','APR 2026','MAY 2026','JUNE 2026',
                 'JULY 2026','AUG 2026','SEP 2026','OCT 2026','NOV 2026','DEC 2026'];

(async function () {
  let paxRows = [];
  let monthlyTotals = {};

  try {
    const csv = await f3FetchCSV('leaderboard');
    const lines = csv.trim().split('\n');

    // Parse row 0 totals against row 1 headers
    const totalsVals = f3ParseCSVLine(lines[0]);
    const headerVals = f3ParseCSVLine(lines[1]);

    headerVals.forEach((h, i) => {
      const clean = h.trim();
      if (MONTHS.includes(clean)) {
        monthlyTotals[clean] = parseInt(totalsVals[i]) || 0;
      }
    });

    // Parse PAX rows using f3ParseCSV with header at index 1
    paxRows = f3ParseCSV(csv, 1);
    paxRows = paxRows.filter(r => r['PAX'] && r['PAX'].trim() !== '');
  } catch (e) {
    f3ShowError('leaderboard-heatmap', e.message);
    f3ShowError('chart-monthly-completions', e.message);
    return;
  }

  renderStatCards();
  renderBarChart();
  renderHeatmap();

  function renderStatCards() {
    document.getElementById('stat-total-crew').textContent = paxRows.length;

    // Current month: most recent month with a non-zero total
    const activeMonths = MONTHS.filter(m => (monthlyTotals[m] || 0) > 0);
    const currentMonth = activeMonths.length ? activeMonths[activeMonths.length - 1] : MONTHS[0];
    const currentCount = monthlyTotals[currentMonth] || 0;
    document.getElementById('stat-current-month').textContent =
      `${currentCount} (${currentMonth.replace(' 2026', '')})`;

    // Active streakers: PAX whose Streakers value has a non-zero current streak
    // Format is "X/Y" where X is current streak months
    const streakers = paxRows.filter(r => {
      const s = (r['Streakers'] || '0/0').toString();
      const current = parseInt(s.split('/')[0]);
      return current > 0;
    }).length;
    document.getElementById('stat-streakers').textContent = streakers;
  }

  function renderBarChart() {
    const activeMonths = MONTHS.filter(m => monthlyTotals[m] !== undefined);
    const options = {
      chart: { type: 'bar', height: 280, toolbar: { show: false } },
      series: [{ name: 'Completions', data: activeMonths.map(m => monthlyTotals[m] || 0) }],
      xaxis: { categories: activeMonths.map(m => m.replace(' 2026', '')) },
      colors: ['#e53935'],
      plotOptions: { bar: { columnWidth: '60%' } },
      dataLabels: { enabled: true },
      yaxis: { min: 0, forceNiceScale: true },
    };
    const chart = new ApexCharts(document.getElementById('chart-monthly-completions'), options);
    chart.render();
  }

  function renderHeatmap() {
    const container = document.getElementById('leaderboard-heatmap');
    // Only show months that have at least some PAX data
    const activeMonths = MONTHS.filter(m => paxRows.some(r => r[m] && r[m].trim() !== ''));

    const thead = `<thead><tr>
      <th style="text-align:left;padding:0.5rem 0.75rem;">PAX</th>
      ${activeMonths.map(m => `<th>${f3Esc(m.replace(' 2026', ''))}</th>`).join('')}
      <th>Streak</th>
    </tr></thead>`;

    const tbody = paxRows.map(r => {
      const cells = activeMonths.map(m => {
        const val = (r[m] || '').trim();
        const active = val !== '' && val !== '0';
        return `<td><span class="${active ? 'lb-cell-active' : 'lb-cell-none'}">${f3Esc(val || '—')}</span></td>`;
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
