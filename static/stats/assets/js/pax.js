// PAX Stats page logic
// Source: Raw/Master attendance tab (single fetch, aggregated client-side)
// Note: the "Site" field in allRows holds the PAX name (matches old PAX tab convention)

(async function () {
  const EXCLUDED_SITES = ['#downrange', 'Shield Lock'];
  // Non-AO sites that should not appear as "real" AOs (mirrors ao.js).
  const AO_DISPLAY_EXCLUSIONS = [
    'Convergence',
    'Raiders of the Locked Park',
    'Who let the dogs out (possible new AO?) Hunter street',
    'Shieldlock',
    'Ruck the Hall',
    'Q-Source Q',
    'Floppy Ruck',
  ];
  const AO_EXCLUSIONS_LC = new Set(AO_DISPLAY_EXCLUSIONS.map(s => s.toLowerCase()));
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

      // Trajectory (O(1) lookup — pcWindowCounts already computed 26w posts excluding EXCLUDED_SITES)
      const last26wPosts = (pcWindowCounts[name] || { w26: 0 }).w26;
      const avg3w  = last3wkCount / 3;
      const avg26w = last26wPosts / 26;
      const trajectory =
        last3wkCount >= 2 && avg3w > avg26w ? '🔥 Heating Up' :
        avg3w < avg26w                       ? '❄️ Cooling Off' :
        '➡️ Holding Steady';

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
        // Per-AO post counts for this PAX (excludes EXCLUDED_SITES; AO_DISPLAY_EXCLUSIONS
        // filtered at chart time). Non-display field used by renderPopularAoChart.
        '_siteCounts': siteCounts,
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
  let qpChart = null;
  let popularAoChart = null;

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
    renderPopularAoChart(filteredRows);
    renderTable(filteredRows);
    // Init themed tooltips for static labels + freshly rendered table headers.
    // Idempotent: already-initialized elements are skipped.
    f3InitTooltips();
  }

  function renderStatCards(rows) {
    document.getElementById('stat-total-pax').textContent = rows.length;
    const active3wk = rows.filter(r => parseInt(r['Last 3 wk']) > 0).length;
    document.getElementById('stat-active-3wk').textContent = active3wk;
    // Update subheader label to reflect current filter (target the label span so
    // the info-dot affordance beside it is preserved).
    document.getElementById('stat-total-pax').closest('.card-body').querySelector('.subheader-label').textContent =
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
    // Greens palette keyed to the fixed day order so a day keeps its color
    // regardless of which days are present in the current filter.
    const allColors = ['#c8bfa8', '#9aad88', '#7a9a68', '#5a7a48', '#4a5e3a', '#3a4d2d', '#2a3d1d'];
    const colorMap  = Object.fromEntries(DAY_ORDER.map((d, i) => [d, allColors[i]]));
    const activeDays = DAY_ORDER.filter(d => counts[d] > 0);

    const options = {
      chart: { type: 'donut', height: 320, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: activeDays.map(d => counts[d]),
      labels: activeDays.map(d => d.slice(0, 3)),
      colors: activeDays.map(d => colorMap[d]),
      grid: { borderColor: '#c8bfa8' },
      legend: { position: 'bottom' },
      dataLabels: { enabled: true },
      tooltip: { theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" } },
      noData: { text: 'No data', align: 'center', verticalAlign: 'middle', style: { fontFamily: "'Open Sans', sans-serif", color: '#8a7a60' } },
    };
    if (favDayChart) { favDayChart.updateOptions(options); }
    else { f3LazyChart('chart-fav-day', () => { favDayChart = new ApexCharts(document.getElementById('chart-fav-day'), options); favDayChart.render(); }); }
  }

  function renderTrajectoryChart(rows) {
    const TRAJ_MAP = {
      '🔥 Heating Up':      { label: '🔥 Heating Up',      color: '#c8a840' },
      '❄️ Cooling Off':     { label: '❄️ Cooling Off',     color: '#8a9aaf' },
      '➡️ Holding Steady': { label: '➡️ Holding Steady', color: '#c8bfa8' },
    };
    const counts = {};
    rows.forEach(r => {
      const t = (r['Trajectory'] || '➡️ Holding Steady').trim();
      const key = TRAJ_MAP[t] ? t : '➡️ Holding Steady';
      counts[key] = (counts[key] || 0) + 1;
    });
    const keys = Object.keys(TRAJ_MAP).filter(k => counts[k] > 0);
    const options = {
      chart: { type: 'donut', height: 340, width: '100%', toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
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
    // Regular attendees only: require a minimum post count so a 1-post/1-Q PAX
    // doesn't surface at 100%. Top 15 by Q-to-Post ratio.
    const top15 = [...rows]
      .filter(r => (parseInt(r['Total Post']) || 0) >= 4)
      .sort((a, b) => parseFloat(b['Q/P Ratio']) - parseFloat(a['Q/P Ratio']))
      .slice(0, 15);

    const options = {
      chart: { type: 'bar', height: 320, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [{ name: 'Q/P %', data: top15.map(r => parseFloat((parseFloat(r['Q/P Ratio']) * 100).toFixed(1))) }],
      xaxis: { categories: top15.map(r => r['Site']), labels: { rotate: -45, style: { fontSize: '11px' } } },
      colors: ['#4a5e3a'],
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { horizontal: false, columnWidth: '60%' } },
      dataLabels: { enabled: false },
      yaxis: { title: { text: 'Q/P %' }, labels: { formatter: v => `${Math.round(v)}%` } },
      tooltip: { theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" }, y: { formatter: v => `${v}%` } },
      noData: { text: 'No qualifying PAX', align: 'center', verticalAlign: 'middle', style: { fontFamily: "'Open Sans', sans-serif", color: '#8a7a60' } },
    };

    if (qpChart) {
      qpChart.updateOptions(options);
    } else {
      f3LazyChart('chart-qp-ratio', () => {
        qpChart = new ApexCharts(document.getElementById('chart-qp-ratio'), options);
        qpChart.render();
      });
    }
  }

  function renderPopularAoChart(rows) {
    // Distinct PAX per AO: count each PAX once per AO where they have >=1 post,
    // over the current filter (PC Regulars vs All). Reuses ao.js exclusion rules.
    const aoCounts = {};
    rows.forEach(r => {
      const sc = r['_siteCounts'] || {};
      Object.keys(sc).forEach(site => {
        if (EXCLUDED_SITES.includes(site)) return;
        if (AO_EXCLUSIONS_LC.has(site.toLowerCase())) return;
        if ((sc[site] || 0) < 1) return;
        aoCounts[site] = (aoCounts[site] || 0) + 1;
      });
    });

    const top = Object.entries(aoCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    const options = {
      chart: { type: 'bar', height: Math.max(260, top.length * 28), toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [{ name: 'PAX', data: top.map(e => e[1]) }],
      xaxis: { categories: top.map(e => e[0]) },
      colors: ['#4a5e3a'],
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { horizontal: true, barHeight: '65%' } },
      dataLabels: { enabled: true, style: { fontSize: '11px' } },
      yaxis: { labels: { style: { fontSize: '11px' } } },
      tooltip: { theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" } },
      noData: { text: 'No AO data', align: 'center', verticalAlign: 'middle', style: { fontFamily: "'Open Sans', sans-serif", color: '#8a7a60' } },
    };

    if (popularAoChart) {
      popularAoChart.updateOptions(options);
    } else {
      f3LazyChart('chart-popular-ao', () => {
        popularAoChart = new ApexCharts(document.getElementById('chart-popular-ao'), options);
        popularAoChart.render();
      });
    }
  }

  function renderTable(rows) {
    const container = document.getElementById('pax-table-container');
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-vcenter table-hover card-table" id="pax-full-table">
          <thead>
            <tr>
              <th data-sort="Site">PAX ${f3InfoDot('PAX F3 handle')}</th>
              <th data-sort="Last Seen">Last Seen ${f3InfoDot('Days since last post — lower means more recently active')}</th>
              <th data-sort="Total Post">Posts ${f3InfoDot('Total posts in 2026')}</th>
              <th data-sort="Total Q">Qs ${f3InfoDot('Total workouts led (Q) in 2026')}</th>
              <th data-sort="Q/P Ratio">Q/P Ratio ${f3InfoDot('Fraction of posts where this PAX led the workout (Q ÷ Total Posts)')}</th>
              <th data-sort="Avg/Week">Avg/Wk ${f3InfoDot('Average posts per week since first 2026 post')}</th>
              <th data-sort="Avg/Last 3 Weeks">Avg/3Wk ${f3InfoDot('Average posts per week over the last 3 weeks')}</th>
              <th data-sort="Last 3 wk">Last 3 Wks ${f3InfoDot('Number of posts in the last 3 weeks')}</th>
              <th data-sort="Trajectory">Trajectory ${f3InfoDot('Trend: compares avg posts per week in last 3 weeks vs last 26 weeks (requires ≥2 posts in last 3 weeks for Heating Up)')}</th>
              <th data-sort="Favorite AO">Fav AO ${f3InfoDot('Most frequently attended AO in 2026 (excludes #downrange and Shield Lock)')}</th>
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
      const traj = (r['Trajectory'] || '➡️ Holding Steady').trim();
      const lastSeen = r['Last Seen'];
      return `<tr>
        <td><a class="pax-link" href="pax-detail.html?pax=${encodeURIComponent(r['Site'])}">${f3Esc(r['Site'])}</a></td>
        <td>${lastSeen != null ? `${lastSeen} days ago` : '—'}</td>
        <td>${r['Total Post'] || '0'}</td>
        <td>${r['Total Q'] || '0'}</td>
        <td>${isNaN(qpRatio) ? '—' : (qpRatio * 100).toFixed(1) + '%'}</td>
        <td>${isNaN(avgWk) ? '—' : avgWk.toFixed(1)}</td>
        <td>${isNaN(avg3Wk) ? '—' : avg3Wk.toFixed(1)}</td>
        <td>${r['Last 3 wk'] || '0'}</td>
        <td>${f3Esc(traj)}</td>
        <td class="text-muted">${f3Esc(r['Favorite AO'] || '—')}</td>
      </tr>`;
    }).join('');
  }
})();
