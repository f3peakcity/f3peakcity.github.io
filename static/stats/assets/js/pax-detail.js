// PAX Detail page logic
// Per-AO breakdown for a single PAX, computed client-side from the Raw/Master
// attendance tab. The PAX handle comes from the ?pax= query parameter.
// Key columns from raw: Date, Name (PAX), Site (AO), Role (Q / P / FNG).

(async function () {
  // Mirror ao.js so only "real" AOs appear.
  const EXCLUDED_SITES = ['#downrange', 'Shield Lock'];
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
  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const grid = document.getElementById('pax-ao-grid');

  // Themed tooltips for the static stat-card info-dots (present regardless of
  // which render path runs below).
  f3InitTooltips();

  // Read and validate the ?pax= parameter.
  const paxName = (new URLSearchParams(location.search).get('pax') || '').trim();
  if (!paxName) {
    document.getElementById('detail-pax-name').textContent = 'PAX not found';
    document.getElementById('detail-pax-sub').textContent = 'No PAX specified.';
    grid.innerHTML = '<div class="card"><div class="card-body text-muted">Pick a PAX from the ' +
      '<a class="pax-link" href="pax.html">PAX Stats</a> table to see their AO breakdown.</div></div>';
    return;
  }

  document.title = `${paxName} — F3 Peak City Stats`;
  document.getElementById('detail-pax-name').textContent = paxName;

  let allRawRows = [];
  try {
    const rawCsv = await f3FetchCSV('raw');
    allRawRows = f3ParseCSV(rawCsv, 0)
      .filter(r => r['Name'] && r['Name'].trim() && r['Date'].startsWith('2026-'));
  } catch (e) {
    f3ShowError('pax-ao-grid', e.message);
    return;
  }

  const isRealAo = (site) =>
    site && !EXCLUDED_SITES.includes(site) && !AO_EXCLUSIONS_LC.has(site.toLowerCase());

  // Full set of real AOs across the region (so we can show a card for every AO).
  const allAos = new Set();
  allRawRows.forEach(r => {
    const site = (r['Site'] || '').trim();
    if (isRealAo(site)) allAos.add(site);
  });

  // This PAX's rows (exact, trimmed handle match).
  const paxRows = allRawRows.filter(r => r['Name'].trim() === paxName);

  if (!paxRows.length) {
    document.getElementById('detail-pax-sub').textContent = `No 2026 activity for ${paxName}.`;
    grid.innerHTML = `<div class="card"><div class="card-body text-muted">No 2026 posts found for ` +
      `<strong>${f3Esc(paxName)}</strong>. Check the name on the ` +
      `<a class="pax-link" href="pax.html">PAX Stats</a> page.</div></div>`;
    return;
  }

  // Per-AO aggregation for this PAX.
  const perAo = {};
  allAos.forEach(ao => { perAo[ao] = { posts: 0, qs: 0, lastPost: null, lastQ: null }; });
  paxRows.forEach(r => {
    const site = (r['Site'] || '').trim();
    if (!isRealAo(site)) return;
    const a = perAo[site];
    if (!a) return; // site not in allAos (shouldn't happen, but guard)
    a.posts++;
    if (!a.lastPost || r['Date'] > a.lastPost) a.lastPost = r['Date'];
    if (r['Role'] === 'Q') {
      a.qs++;
      if (!a.lastQ || r['Date'] > a.lastQ) a.lastQ = r['Date'];
    }
  });

  // Summary stats (real AOs only, matching the cards below).
  const totalPosts = Object.values(perAo).reduce((s, a) => s + a.posts, 0);
  const totalQs = Object.values(perAo).reduce((s, a) => s + a.qs, 0);
  const aosVisited = Object.values(perAo).filter(a => a.posts > 0).length;
  document.getElementById('stat-posts').textContent = totalPosts.toLocaleString();
  document.getElementById('stat-qs').textContent = totalQs.toLocaleString();
  document.getElementById('stat-aos').textContent = aosVisited;
  document.getElementById('stat-ratio').textContent =
    totalPosts > 0 ? `${(totalQs / totalPosts * 100).toFixed(1)}%` : '—';
  document.getElementById('detail-pax-sub').textContent =
    `${totalPosts.toLocaleString()} posts · ${totalQs.toLocaleString()} Qs · ${aosVisited} AOs in 2026`;

  // Timeline visuals (real-AO posts only, so counts match the summary above).
  const realRows = paxRows.filter(r => isRealAo((r['Site'] || '').trim()));
  renderRhythm(realRows);
  renderMonthlyChart(realRows);
  renderFingerprint(realRows);

  // Cards: every real AO, attended ones first (by posts desc), then alphabetical.
  const ordered = Array.from(allAos).sort((x, y) => {
    const d = perAo[y].posts - perAo[x].posts;
    return d !== 0 ? d : x.localeCompare(y);
  });

  grid.innerHTML = ordered.map(ao => {
    const a = perAo[ao];
    const dim = a.posts === 0 ? ' style="opacity:0.55;"' : '';
    return `
      <div class="card card-stat-accent"${dim}>
        <div class="card-header">
          <h4 class="card-title">${f3Esc(ao)}</h4>
        </div>
        <div class="card-body">
          <div class="row g-2">
            <div class="col-6">
              <div class="text-muted small">Posts</div>
              <div class="fw-bold">${a.posts}</div>
            </div>
            <div class="col-6">
              <div class="text-muted small">Qs</div>
              <div class="fw-bold">${a.qs}</div>
            </div>
            <div class="col-6">
              <div class="text-muted small">Last Post</div>
              <div class="fw-bold">${fmtDate(a.lastPost)}</div>
            </div>
            <div class="col-6">
              <div class="text-muted small">Last Q</div>
              <div class="fw-bold">${fmtDate(a.lastQ)}</div>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  // Format an ISO date string as e.g. "Jul 1, 2026"; "—" when null.
  function fmtDate(str) {
    const d = f3ParseLocalDate(str);
    if (!d) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Monday (ISO) of the week containing a given YYYY-MM-DD date.
  function weekMonday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d.toISOString().slice(0, 10);
  }

  // Posting Rhythm — one square per week of 2026, grouped by month.
  // Darker = more posts that week; gold ring = Q'd that week.
  function renderRhythm(rows) {
    const weekAgg = {}; // mondayISO -> { posts, qs }
    rows.forEach(r => {
      const wk = weekMonday(r['Date']);
      if (!weekAgg[wk]) weekAgg[wk] = { posts: 0, qs: 0 };
      weekAgg[wk].posts++;
      if (r['Role'] === 'Q') weekAgg[wk].qs++;
    });

    // All weeks from the first Monday on/before Jan 1 through the current week.
    const start = new Date(weekMonday('2026-01-01') + 'T00:00:00');
    const end = new Date();
    const byMonth = {}; // monthIdx -> [ {label, cls, q} ]
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
      const iso = d.toISOString().slice(0, 10);
      const agg = weekAgg[iso] || { posts: 0, qs: 0 };
      const cls = agg.posts >= 3 ? 'p3' : agg.posts === 2 ? 'p2' : agg.posts === 1 ? 'p1' : '';
      const label = `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ` +
        `${agg.posts} post${agg.posts !== 1 ? 's' : ''} · ${agg.qs} Q${agg.qs !== 1 ? 's' : ''}`;
      // Group by the week's Thursday (ISO convention) so the New Year week that
      // starts Mon Dec 29 lands in January rather than a stray December group.
      const thu = new Date(d); thu.setDate(thu.getDate() + 3);
      const m = thu.getMonth();
      (byMonth[m] = byMonth[m] || []).push({ cls, q: agg.qs > 0, label });
    }

    const months = Object.keys(byMonth).map(Number).sort((a, b) => a - b);
    const html = months.map(m => {
      const dots = byMonth[m].map(w =>
        `<span class="rhythm-dot ${w.cls}${w.q ? ' has-q' : ''}" title="${f3Esc(w.label)}"></span>`
      ).join('');
      return `<div class="rhythm-month"><div class="rhythm-dots">${dots}</div>` +
        `<div class="rhythm-month-label">${MONTH_ABBR[m]}</div></div>`;
    }).join('');

    const legend = `<div class="rhythm-legend">
      <span><span class="swatch"></span>quiet</span>
      <span><span class="swatch" style="background:#c8bfa8;border-color:#c8bfa8;"></span>1 post</span>
      <span><span class="swatch" style="background:#9aad88;border-color:#9aad88;"></span>2 posts</span>
      <span><span class="swatch" style="background:#4a5e3a;border-color:#4a5e3a;"></span>3+ posts</span>
      <span><span class="swatch" style="outline:2px solid #c8a840;outline-offset:1px;"></span>Q'd that week</span>
    </div>`;

    document.getElementById('pax-rhythm').innerHTML = `<div class="rhythm-wrap">${html}</div>${legend}`;
    document.getElementById('rhythm-card').hidden = false;
  }

  // Posts by Month — total posts per month, each month its own earthy color.
  // Q count per month is surfaced in the tooltip.
  function renderMonthlyChart(rows) {
    const MONTH_COLORS = ['#4a5e3a', '#7a9a68', '#c8a840', '#9a5a3a', '#5a7a8a', '#8a6a90', '#b08a50', '#3a4d2d', '#a86a5a', '#6a8a4a', '#8a7a60', '#5a8a7a'];
    const maxMonth = new Date().getMonth(); // 0-based, current month
    const total = new Array(maxMonth + 1).fill(0);
    const q = new Array(maxMonth + 1).fill(0);
    rows.forEach(r => {
      const mi = parseInt(r['Date'].slice(5, 7), 10) - 1;
      if (mi < 0 || mi > maxMonth) return;
      total[mi]++;
      if (r['Role'] === 'Q') q[mi]++;
    });
    const categories = MONTH_ABBR.slice(0, maxMonth + 1);

    document.getElementById('detail-charts-row').hidden = false;
    const options = {
      chart: { type: 'bar', height: 320, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [{ name: 'Posts', data: total }],
      xaxis: { categories },
      colors: MONTH_COLORS.slice(0, maxMonth + 1),
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { distributed: true, columnWidth: '60%' } },
      dataLabels: { enabled: true, style: { fontSize: '11px', fontFamily: "'Open Sans', sans-serif", colors: ['#f5f0e4'] } },
      yaxis: { title: { text: 'Posts' }, min: 0, forceNiceScale: true },
      legend: { show: false },
      tooltip: {
        theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" },
        custom: ({ dataPointIndex }) =>
          `<div style="padding:6px 10px;font-family:'Open Sans',sans-serif;font-size:0.75rem;">` +
          `<strong>${categories[dataPointIndex]}</strong><br>${total[dataPointIndex]} posts · ${q[dataPointIndex]} Q-led</div>`,
      },
    };
    new ApexCharts(document.getElementById('chart-detail-monthly'), options).render();
  }

  // Weekly Fingerprint — posts by day of week (Mon–Sun).
  function renderFingerprint(rows) {
    const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const counts = {}; order.forEach(d => counts[d] = 0);
    rows.forEach(r => {
      const dow = new Date(r['Date'] + 'T00:00:00').getDay(); // 0=Sun
      counts[order[(dow + 6) % 7]]++;
    });
    const options = {
      chart: { type: 'bar', height: 320, toolbar: { show: false }, fontFamily: "'Open Sans', sans-serif", background: 'transparent' },
      series: [{ name: 'Posts', data: order.map(d => counts[d]) }],
      xaxis: { categories: order },
      colors: ['#4a5e3a'],
      grid: { borderColor: '#c8bfa8' },
      plotOptions: { bar: { columnWidth: '55%' } },
      dataLabels: { enabled: false },
      yaxis: { title: { text: 'Posts' }, min: 0, forceNiceScale: true },
      tooltip: { theme: 'light', style: { fontFamily: "'Open Sans', sans-serif" } },
    };
    new ApexCharts(document.getElementById('chart-detail-dow'), options).render();
  }
})();
