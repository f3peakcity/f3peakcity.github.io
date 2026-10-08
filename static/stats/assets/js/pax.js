// PAX Stats page logic
// Source: Raw/Master attendance tab (single fetch, aggregated client-side)
// Note: the "Site" field in allRows holds the PAX name (matches old PAX tab convention)

const PAX_MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// Pure aggregation: allRawRows -> one row per PAX (PC Regular status, totals, trajectory).
function paxBuildRows(allRawRows, now) {
  const cutoff3w  = new Date(now - 3  * PAX_MS_PER_WEEK);

  const pcRegMap = f3PcRegularMap(allRawRows, now);

  // Trajectory needs each PAX's raw 26-week post count, which f3PcRegularMap
  // doesn't expose (it only returns the boolean). Recomputed here rather than
  // widening that function's return shape for a single caller.
  const cutoff26w = new Date(now - 26 * PAX_MS_PER_WEEK);
  const last26wPostsByName = {};
  allRawRows.forEach(r => {
    const site = (r['Site'] || '').trim();
    if (!f3CountsTowardAttendance(site)) return;
    const d = f3ParseLocalDate(r['Date']);
    if (!d || d < cutoff26w) return;
    const name = r['Name'].trim();
    last26wPostsByName[name] = (last26wPostsByName[name] || 0) + 1;
  });

  const paxMap = {};
  allRawRows.forEach(r => {
    const name = r['Name'].trim();
    if (!paxMap[name]) paxMap[name] = { records: [] };
    paxMap[name].records.push(r);
  });

  return Object.entries(paxMap).map(([name, agg]) => {
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
      if (s && f3CountsTowardAttendance(s)) siteCounts[s] = (siteCounts[s] || 0) + 1;
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

    // Trajectory (O(1) lookup — last26wPostsByName already excludes non-attendance sites)
    const last26wPosts = last26wPostsByName[name] || 0;
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
      // Per-AO post counts for this PAX (excludes non-attendance sites; junk-AO
      // names filtered at chart time via f3IsRealAo). Non-display field used by
      // renderPopularAoChart.
      '_siteCounts': siteCounts,
    };
  }).sort((a, b) => a['Site'].localeCompare(b['Site']));
}

// ── Potential Cotters ──
// A Cotter is a man who comes back after time away. This list is the men we'd
// like to see do that: regulars who've gone quiet. Any post anywhere counts as
// being seen (#downrange and Shield Lock included: a man traveling isn't gone).
const PAX_COTTER_REGULAR_POSTS = 8;    // posts in the window before his last one...
const PAX_COTTER_REGULAR_DAYS = 90;    // ...this many days back = he was a regular
const PAX_COTTER_QUIET_DAYS = 21;      // no post in this many days = gone quiet
const PAX_COTTER_MAX_DAYS = 182;       // gone longer than ~6 months drops off

// All raw rows (every year: the window reaches back past January) -> the list,
// most recently gone first. Each: name, last date, last AO, home AO, days away.
function paxCotters(rows, now, excluded = {}) {
  const byName = {};
  rows.forEach(r => {
    const name = (r['Name'] || '').trim();
    if (!name || !r['Date']) return;
    (byName[name] = byName[name] || []).push(r);
  });
  const dayMs = 86400000;
  const out = [];
  Object.entries(byName).forEach(([name, recs]) => {
    if (excluded[name.toLowerCase()]) return;
    recs.sort((a, b) => a['Date'].localeCompare(b['Date']));
    const last = recs[recs.length - 1];
    const lastDate = f3ParseLocalDate(last['Date']);
    if (!lastDate) return;
    const daysAway = Math.floor((now - lastDate) / dayMs);
    if (daysAway < PAX_COTTER_QUIET_DAYS || daysAway > PAX_COTTER_MAX_DAYS) return;
    // "Was a regular" counts Peak City AOs only: a man whose posts are mostly
    // #downrange / Shield Lock is usually another region's PAX, not ours.
    // "Seen" (lastDate above) still counts any post anywhere.
    const windowStart = lastDate - PAX_COTTER_REGULAR_DAYS * dayMs;
    const recent = recs.filter(r => f3ParseLocalDate(r['Date']) > windowStart &&
      f3CountsTowardAttendance((r['Site'] || '').trim()));
    if (recent.length < PAX_COTTER_REGULAR_POSTS) return;
    // Home AO: where he posted most in that window.
    const sites = {};
    recent.forEach(r => {
      const s = (r['Site'] || '').trim();
      if (s) sites[s] = (sites[s] || 0) + 1;
    });
    const home = Object.entries(sites).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    out.push({
      name,
      lastDate: last['Date'],
      lastAo: (last['Site'] || '').trim(),
      homeAo: home ? home[0] : '',
      daysAway,
      posts: recent.length,
    });
  });
  return out.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name));
}

const PAX_TRAJECTORIES = ['🔥 Heating Up', '➡️ Holding Steady', '❄️ Cooling Off'];

(async function () {
  const now = new Date();
  const CHART_IDS = ['chart-top-pax', 'chart-activity-donut', 'chart-fav-day', 'chart-qp-ratio',
    'chart-popular-ao', 'chart-trajectory', 'pax-table-container'];

  let allRows = [];
  let filteredRows = [];
  let everyRow = [];

  try {
    // Every year for Potential Cotters (its window reaches back ~9 months);
    // this year only for everything else on the page, as before.
    everyRow = await f3LoadRawRows();
    const allRawRows = everyRow.filter(r => r['Date'].startsWith('2026-'));

    allRows = paxBuildRows(allRawRows, now);

  } catch (e) {
    CHART_IDS.forEach(id => f3ShowError(id));
    f3ShowError('cotters-list');
    return;
  }

  renderCotters(paxCotters(everyRow, now, F3_COTTER_EXCLUDED_LC));

  if (!allRows.length) {
    CHART_IDS.forEach(id => f3ShowEmpty(id, 'No 2026 posts logged yet'));
    return;
  }

  const isRegular = r => (r['PC Regular?'] || '').trim().toUpperCase() === 'TRUE';

  // Default: show PC Regulars only
  let showRegularsOnly = true;
  filteredRows = allRows.filter(isRegular);
  const charts = {};

  renderAll();

  // One toggle re-scopes everything on the page: KPIs, every chart, the table.
  ['btn-regulars', 'btn-all-pax'].forEach(id => {
    const btn = document.getElementById(id);
    btn.addEventListener('click', () => {
      const regulars = id === 'btn-regulars';
      if (regulars === showRegularsOnly) return;
      showRegularsOnly = regulars;
      filteredRows = regulars ? allRows.filter(isRegular) : [...allRows];
      f3SetPressed(btn);
      document.getElementById('pax-table-title').textContent = regulars ? 'PC Regulars' : 'All PAX';
      renderAll();
    });
  });

  function renderAll() {
    renderStatCards(filteredRows);
    renderBarChart(filteredRows);
    renderDonutChart(filteredRows);
    renderFavDayChart(filteredRows);
    renderTrajectory(filteredRows);
    renderQpRatioChart(filteredRows);
    renderPopularAoChart(filteredRows);
    renderTable(filteredRows);
  }

  // Draws a chart the first time it scrolls into view, then updates it in place.
  function drawChart(id, options) {
    if (charts[id]) { charts[id].updateOptions(options); return; }
    f3LazyChart(id, () => {
      charts[id] = new ApexCharts(document.getElementById(id), options);
      charts[id].render();
    });
  }

  // Potential Cotters: count in the collapsed heading, rows inside. Not tied to
  // the PC Regulars toggle (a man who's gone quiet has usually dropped off it).
  function renderCotters(list) {
    document.getElementById('cotters-count').textContent = `${list.length} ${list.length === 1 ? 'man' : 'men'}`;
    const day = iso => f3ParseLocalDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    document.getElementById('cotters-list').innerHTML = list.length ? list.map(c => {
      const home = c.homeAo && c.homeAo !== c.lastAo ? ` · home AO ${f3Esc(c.homeAo)}` : '';
      return `<div class="row row--stacked">
        <span class="row-name">${f3PaxLink(c.name)}</span>
        <span class="label">Last seen ${day(c.lastDate)} at ${f3Esc(c.lastAo)}${home}</span>
        <span class="row-val" aria-label="${c.daysAway} days since his last post">${c.daysAway}d</span>
      </div>`;
    }).join('') : '<div class="status label empty-state">No regulars have gone quiet. Everybody\'s posting.</div>';
  }

  function renderStatCards(rows) {
    document.getElementById('stat-total-pax').textContent = rows.length;
    document.getElementById('stat-total-pax-label').textContent = showRegularsOnly ? 'PC Regulars' : 'Total PAX';
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
    drawChart('chart-top-pax', f3RankedBarOptions(top15.map(r => r['Site']), 'Total posts',
      top15.map(r => parseInt(r['Total Post']) || 0)));
  }

  // How many PAX post at each weekly rate (avg posts/week since their first
  // 2026 post, rounded).
  function renderDonutChart(rows) {
    const buckets = { '1x': 0, '2x': 0, '3x': 0, '4x': 0, '5x': 0, '6x+': 0 };
    rows.forEach(r => {
      const avg = parseFloat(r['Avg/Week']);
      if (isNaN(avg) || avg < 0.5) return;
      const n = Math.round(avg);
      if (n >= 6)      buckets['6x+']++;
      else if (n >= 1) buckets[`${n}x`]++;
    });
    drawChart('chart-activity-donut', f3ColumnOptions(Object.keys(buckets), 'PAX', Object.values(buckets)));
  }

  function renderFavDayChart(rows) {
    const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    const counts = {};
    DAY_ORDER.forEach(d => { counts[d] = 0; });
    rows.forEach(r => {
      const d = (r['Favorite Day of the week'] || '').trim();
      if (counts[d] !== undefined) counts[d]++;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    const shares = DAY_ORDER.map(d => Math.round(counts[d] / total * 100));
    drawChart('chart-fav-day', f3ColumnOptions(DAY_ORDER.map(d => d.slice(0, 3)), 'Share of PAX', shares,
      { fmt: v => `${v}%` }));
  }

  // Three text rows, not a chart: the counts are the whole story.
  function renderTrajectory(rows) {
    const counts = Object.fromEntries(PAX_TRAJECTORIES.map(t => [t, 0]));
    rows.forEach(r => {
      const t = (r['Trajectory'] || '').trim();
      counts[PAX_TRAJECTORIES.includes(t) ? t : '➡️ Holding Steady']++;
    });
    const total = rows.length || 1;
    document.getElementById('chart-trajectory').innerHTML = PAX_TRAJECTORIES.map(t => `
      <div class="row">
        <span class="row-name">${t.replace(/^\S+\s/, '')}</span>
        <span class="label">${Math.round(counts[t] / total * 100)}% of PAX</span>
        <span class="row-val${t === PAX_TRAJECTORIES[0] ? ' is-good' : ''}">${counts[t]}</span>
      </div>`).join('');
  }

  function renderQpRatioChart(rows) {
    // Regular attendees only: require a minimum post count so a 1-post/1-Q PAX
    // doesn't surface at 100%.
    const top = [...rows]
      .filter(r => (parseInt(r['Total Post']) || 0) >= 4)
      .sort((a, b) => parseFloat(b['Q/P Ratio']) - parseFloat(a['Q/P Ratio']))
      .slice(0, 8);
    if (!top.length) { f3ShowEmpty('chart-qp-ratio', 'No PAX with 4+ posts yet'); return; }
    drawChart('chart-qp-ratio', f3RankedBarOptions(top.map(r => r['Site']), 'Q/P',
      top.map(r => Math.round(parseFloat(r['Q/P Ratio']) * 100)), v => `${v}%`));
  }

  function renderPopularAoChart(rows) {
    // Distinct PAX per AO: count each PAX once per AO where they have >=1 post,
    // over the current filter (PC Regulars vs All). Reuses ao.js exclusion rules.
    const aoCounts = {};
    rows.forEach(r => {
      const sc = r['_siteCounts'] || {};
      Object.keys(sc).forEach(site => {
        if (!f3IsRealAo(site)) return;
        if ((sc[site] || 0) < 1) return;
        aoCounts[site] = (aoCounts[site] || 0) + 1;
      });
    });
    const top = Object.entries(aoCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (!top.length) { f3ShowEmpty('chart-popular-ao', 'No AO data'); return; }
    drawChart('chart-popular-ao', f3RankedBarOptions(top.map(e => e[0]), 'PAX', top.map(e => e[1])));
  }

  function renderTable(rows) {
    const container = document.getElementById('pax-table-container');
    document.getElementById('pax-table-count').textContent = `${rows.length} PAX`;
    const th = (key, label, tip, num) =>
      `<th data-sort="${key}"${num ? ' class="num"' : ''}>${f3ThLabel(label, tip)}</th>`;
    container.innerHTML = `
        <table class="table table--stack" id="pax-full-table">
          <thead>
            <tr>
              ${th('Site', 'PAX', 'PAX F3 handle')}
              ${th('Total Post', 'Posts', 'Total posts in 2026', true)}
              ${th('Total Q', 'Qs', 'Total workouts led (Q) in 2026', true)}
              ${th('Q/P Ratio', 'Q/P', 'Fraction of posts where this PAX led the workout (Q ÷ Total Posts)', true)}
              ${th('Avg/Week', 'Avg/wk', 'Average posts per week since first 2026 post', true)}
              ${th('Avg/Last 3 Weeks', 'Avg/3wk', 'Average posts per week over the last 3 weeks', true)}
              ${th('Last 3 wk', 'Last 3 wks', 'Number of posts in the last 3 weeks', true)}
              ${th('Trajectory', 'Trajectory', 'Compares avg posts per week in the last 3 weeks vs the last 26 weeks')}
              ${th('Favorite AO', 'Home AO', 'Most frequently attended AO in 2026 (excludes #downrange and Shield Lock)')}
              ${th('Last Seen', 'Last seen', 'Days since last post; lower means more recently active', true)}
            </tr>
          </thead>
          <tbody id="pax-table-body"></tbody>
        </table>`;
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
        <td>${f3PaxLink(r['Site'])}</td>
        <td class="num">${r['Total Post'] || '0'}</td>
        <td class="num">${r['Total Q'] || '0'}</td>
        <td class="num">${isNaN(qpRatio) ? '—' : (qpRatio * 100).toFixed(1) + '%'}</td>
        <td class="num">${isNaN(avgWk) ? '—' : avgWk.toFixed(1)}</td>
        <td class="num">${isNaN(avg3Wk) ? '—' : avg3Wk.toFixed(1)}</td>
        <td class="num">${r['Last 3 wk'] || '0'}</td>
        <td class="nowrap">${f3Esc(traj)}</td>
        <td>${f3Esc(r['Favorite AO'] || '—')}</td>
        <td class="num">${lastSeen != null ? `${lastSeen}d ago` : '—'}</td>
      </tr>`;
    }).join('');
    f3StackLabels(body.closest('table'));
  }
})();

if (typeof module !== 'undefined') {
  module.exports = { paxBuildRows, paxCotters, PAX_COTTER_QUIET_DAYS, PAX_COTTER_MAX_DAYS };
}
