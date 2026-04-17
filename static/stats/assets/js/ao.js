// AO Stats page logic
// Source: AO Stats tab, header at row index 2
// Key columns: Site, Total Attendees, Avg/Meeting, FNGs, Unique Qs,
//   Bench Strength, Active Core PAX, Most Frequent Q, Core Names, Weeks in Range

(async function () {
  let allRows = [];
  let filteredRows = [];

  try {
    const csv = await f3FetchCSV('ao');
    allRows = f3ParseCSV(csv, 2);
    // Remove rows where Site is blank (trailing sheet rows)
    allRows = allRows.filter(r => r['Site'] && r['Site'].trim() !== '');
  } catch (e) {
    f3ShowError('ao-table-container', e.message);
    f3ShowError('ao-cards-grid', e.message);
    return;
  }

  filteredRows = [...allRows];
  renderAll();

  // Wire up date filter — AO Stats has no per-row date column so filter is visual only
  document.getElementById('filter-apply').addEventListener('click', () => {
    // Re-render with current allRows (date filter not applicable to pre-aggregated AO data)
    filteredRows = [...allRows];
    renderAll();
  });

  // Set up sortable — must call AFTER table is first rendered
  // Uses getter so it always sorts the current filteredRows
  function setupSortable() {
    f3MakeSortable('ao-full-table', () => filteredRows, renderTableBody);
  }

  function renderAll() {
    renderStatCards(filteredRows);
    renderAOCards(filteredRows);
    renderTable(filteredRows);
    setupSortable();
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
      const cores = r['Core Names'] && r['Core Names'] !== '-' ? r['Core Names'] : 'None listed';
      const topQ = r['Most Frequent Q'] || '—';
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
            <div class="text-muted small mb-1">Core PAX (Regulars)</div>
            <div class="small">${f3Esc(cores)}</div>
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
