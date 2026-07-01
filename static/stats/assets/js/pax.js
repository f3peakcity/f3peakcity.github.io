// PAX Stats page logic
// Source: Raw/Master attendance tab (single fetch, aggregated client-side)
// Note: the "Site" field in allRows holds the PAX name (matches old PAX tab convention)

(async function () {
  const EXCLUDED_SITES = ['#downrange', 'Shield Lock'];
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const now = new Date();
  const cutoff26w = new Date(now - 26 * MS_PER_WEEK);
  const cutoff3w  = new Date(now - 3  * MS_PER_WEEK);

  let allRows = [];
  let filteredRows = [];

  try {
    const rawCsv = await f3FetchCSV('raw');
    const allRawRows = f3ParseCSV(rawCsv, 0)
      .filter(r => r['Name'] && r['Name'].trim() && r['Date'].startsWith('2026-'));

    const pcWindowCounts = {};
    allRawRows.forEach(r => {
      const site = (r['Site'] || '').trim();
      if (EXCLUDED_SITES.includes(site)) return;
      const d = f3ParseLocalDate(r['Date']);
      if (!d || d < cutoff26w) return;
      const name = r['Name'].trim();
      if (!pcWindowCounts[name]) pcWindowCounts[name] = { w26: 0, w3: 0 };
      pcWindowCounts[name].w26++;
      if (d >= cutoff3w) pcWindowCounts[name].w3++;
    });
    const pcRegMap = {};
    Object.entries(pcWindowCounts).forEach(([name, c]) => {
      pcRegMap[name] = c.w26 >= 26 || c.w3 >= 3;
    });

    const paxMap = {};
    allRawRows.forEach(r => {
      const name = r['Name'].trim();
      if (!paxMap[name]) paxMap[name] = { records: [] };
      paxMap[name].records.push(r);
    });

    allRows = Object.entries(paxMap).map(([name, agg]) => {
      const paxRecords = agg.records;
      const totalPost = paxRecords.length;
      const totalQ = paxRecords.filter(r => r['Role'] === 'Q').length;

      const dates = paxRecords.map(r => r['Date']).sort();
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];

      const lastSeenDate = f3ParseLocalDate(maxDate);
      const lastSeenDays = lastSeenDate
        ? Math.floor((now - lastSeenDate) / 86400000)
        : null;

      const last3wkCount = paxRecords.filter(r => {
        const d = f3ParseLocalDate(r['Date']);
        return d && d >= cutoff3w;
      }).length;

      const firstDate = f3ParseLocalDate(minDate);
      const daysSinceFirstPost = firstDate ? (now - firstDate) / 86400000 : 0;
      const avgWeek = totalPost / (Math.max(1, daysSinceFirstPost) / 7);

      const siteCounts = {};
      paxRecords.forEach(r => {
        const s = (r['Site'] || '').trim();
        if (s && !EXCLUDED_SITES.includes(s)) siteCounts[s] = (siteCounts[s] || 0) + 1;
      });
      const favAO = Object.entries(siteCounts).length
        ? Object.entries(siteCounts).reduce((a, b) => b[1] > a[1] ? b : a)[0]
        : '—';

      const dayCounts = {};
      paxRecords.forEach(r => {
        const day = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(r['Date'] + 'T00:00:00').getDay()];
        dayCounts[day] = (dayCounts[day] || 0) + 1;
      });
      const favDay = Object.entries(dayCounts).length
        ? Object.entries(dayCounts).reduce((a, b) => b[1] > a[1] ? b : a)[0]
        : '—';

      // Trajectory (second pass over allRawRows for 26w window)
      const last26wPosts = allRawRows.filter(r2 =>
        r2['Name'].trim() === name &&
        f3ParseLocalDate(r2['Date']) >= cutoff26w
      ).length;
      const avg3w  = last3wkCount / 3;
      const avg26w = last26wPosts / 26;
      const trajectory =
        last3wkCount >= 2 && avg3w > avg26w ? '🔥 Heating Up' :
        avg3w < avg26w                       ? '❄️ Cooling Off' :
        '-';

      return {
        'Site': name,
        'PC Regular?': pcRegMap[name] ? 'TRUE' : 'FALSE',
        'Total Post': totalPost,
        'Total Q': totalQ,
        'Q/P Ratio': totalPost > 0 ? totalQ / totalPost : 0,
        'Last Seen': lastSeenDays,
        'Last 3 wk': last3wkCount,
        'Avg/Week': avgWeek,
        'Avg/Last 3 Weeks': last3wkCount / 3,
        'Favorite AO': favAO,
        'Favorite Day of the week': favDay,
        'Trajectory': trajectory,
      };
    }).sort((a, b) => a['Site'].localeCompare(b['Site']));

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
        const avgWk = parseFloat(r['Avg/Week']);
        const totalQ = parseInt(r['Total Q']) || 0;
        return !isNaN(avgWk) && avgWk < 1.0 && avgWk > 0 && totalQ >= 1;
      })
      .sort((a, b) => parseFloat(b['Q/P Ratio']) - parseFloat(a['Q/P Ratio']))
      .slice(0, 10);

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
              <th data-sort="Site" title="PAX F3 handle">PAX</th>
              <th data-sort="Last Seen" title="Days since last post — lower means more recently active">Last Seen</th>
              <th data-sort="Total Post" title="Total posts in 2026">Posts</th>
              <th data-sort="Total Q" title="Total workouts led (Q) in 2026">Qs</th>
              <th data-sort="Q/P Ratio" title="Fraction of posts where this PAX led the workout (Q ÷ Total Posts)">Q/P Ratio</th>
              <th data-sort="Avg/Week" title="Average posts per week since first 2026 post">Avg/Wk</th>
              <th data-sort="Avg/Last 3 Weeks" title="Average posts per week over the last 3 weeks">Avg/3Wk</th>
              <th data-sort="Last 3 wk" title="Number of posts in the last 3 weeks">Last 3 Wks</th>
              <th data-sort="Trajectory" title="Trend: compares avg posts per week in last 3 weeks vs last 26 weeks (requires ≥2 posts in last 3 weeks for Heating Up)">Trajectory</th>
              <th data-sort="Favorite AO" title="Most frequently attended AO in 2026 (excludes #downrange and Shield Lock)">Fav AO</th>
            </tr>
          </thead>
          <tbody id="pax-table-body"></tbody>
        </table>
      </div>`;
    renderTableBody(rows);
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
      const lastSeen = r['Last Seen'];
      return `<tr>
        <td><strong>${f3Esc(r['Site'])}</strong></td>
        <td>${lastSeen != null ? `${lastSeen} days ago` : '—'}</td>
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
