// PAX Detail page logic
// Per-AO breakdown for a single PAX, computed client-side from the Raw/Master
// attendance tab. The PAX handle comes from the ?pax= query parameter.
// Key columns from raw: Date, Name (PAX), Site (AO), Role (Q / P / FNG).

// Unlike ao.js / leaderboard (which exclude them from region-wide AO stats),
// this per-PAX drill-down INCLUDES #downrange and Shieldlock — on a single
// guy's page those posts are part of his story (travel / other-region posts).
function paxDetailIsRealAo(site) {
  return f3IsRealAo(site, { includeDownrange: true, includeShieldlock: true });
}

// Pure aggregation: allRawRows + a PAX name -> one row per real AO in the region
// (attended or not), sorted attended-first (by posts desc) then alphabetically.
function paxDetailBuildPerAo(allRawRows, paxName) {
  const allAos = new Set();
  allRawRows.forEach(r => {
    const site = (r['Site'] || '').trim();
    if (paxDetailIsRealAo(site)) allAos.add(site);
  });

  const paxRows = allRawRows.filter(r => r['Name'].trim() === paxName);

  const perAo = {};
  allAos.forEach(ao => { perAo[ao] = { posts: 0, qs: 0, lastPost: null, lastQ: null }; });
  paxRows.forEach(r => {
    const site = (r['Site'] || '').trim();
    if (!paxDetailIsRealAo(site)) return;
    const a = perAo[site];
    if (!a) return; // site not in allAos (shouldn't happen, but guard)
    a.posts++;
    if (!a.lastPost || r['Date'] > a.lastPost) a.lastPost = r['Date'];
    if (r['Role'] === 'Q') {
      a.qs++;
      if (!a.lastQ || r['Date'] > a.lastQ) a.lastQ = r['Date'];
    }
  });

  return Array.from(allAos)
    .sort((x, y) => {
      const d = perAo[y].posts - perAo[x].posts;
      return d !== 0 ? d : x.localeCompare(y);
    })
    .map(ao => ({
      'AO': ao,
      'Posts': perAo[ao].posts,
      'Qs': perAo[ao].qs,
      'Last Post': perAo[ao].lastPost,
      'Last Q': perAo[ao].lastQ,
    }));
}

// Give/take benchmark: a man should Q once per this many posts, judged over the
// trailing window. Tune here; documented in static/stats/README.md.
const PAX_DETAIL_POSTS_PER_Q = 12;
const PAX_DETAIL_BALANCE_WEEKS = 26;

// Pure: rows + name + now -> { lastQ, weeksSinceQ, posts, qs, onTrack }.
// Posts and Qs skip #downrange/Shield Lock; takeover Qs (f3IsVisitingQ) don't count.
function paxDetailQBalance(rows, paxName, now) {
  const cutoff = new Date(now - PAX_DETAIL_BALANCE_WEEKS * F3_MS_PER_WEEK);
  let lastQ = null, posts = 0, qs = 0;
  rows.forEach(r => {
    if (r['Name'].trim() !== paxName || !f3CountsTowardAttendance(r['Site'])) return;
    const isQ = r['Role'] === 'Q' && !f3IsVisitingQ(r);
    if (isQ && (!lastQ || r['Date'] > lastQ)) lastQ = r['Date'];
    const d = f3ParseLocalDate(r['Date']);
    if (!d || d < cutoff) return;
    posts++;
    if (isQ) qs++;
  });
  const last = lastQ && f3ParseLocalDate(lastQ);
  return {
    lastQ, posts, qs,
    weeksSinceQ: last ? Math.max(0, Math.floor((now - last) / F3_MS_PER_WEEK)) : null,
    onTrack: qs * PAX_DETAIL_POSTS_PER_Q >= posts,
  };
}

// #112 calendar (Slack_Data_Collector#97): one cell per day of a month, built
// on leaderboard.js's own credit rules so it explains the leaderboard's number
// and can never disagree with it. Needs leaderboard.js loaded first.
const PAX_DETAIL_YEAR = '2026';

// Short source label for a raw SourceFile value.
function paxDetailSource(sourceFile) {
  const s = String(sourceFile || '').trim();
  if (s.startsWith('BigQuery')) return 'BigQuery';
  if (s.startsWith('Attendance')) return 'Slack';
  return s || 'Manual';
}

// Pure: rows + PAX + year + month (0-based) -> { label, days, posts, qs, complete }.
// Each day: { date, rows, credit, q } where every row carries `counted` and,
// when it earns nothing, a `why`. A day's credit is lbDayPostCredit's (from
// LB_DAY_CREDIT_FROM; one per record before), so posts == the leaderboard's.
function paxDetailCalendarMonth(rows, paxName, year, monthIdx) {
  const ym = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
  const dayCredit = ym >= LB_DAY_CREDIT_FROM;
  const byDate = {};
  rows.forEach(r => {
    if ((r['Name'] || '').trim() !== paxName) return;
    const date = (r['Date'] || '').trim();
    if (date.startsWith(ym + '-')) (byDate[date] = byDate[date] || []).push(r);
  });

  const daysInMonth = new Date(Number(year), monthIdx + 1, 0).getDate();
  const days = [];
  let posts = 0, qs = 0;
  for (let n = 1; n <= daysInMonth; n++) {
    const date = `${ym}-${String(n).padStart(2, '0')}`;
    // Q rows first, so the row shown as earning the day's post is the Q.
    const dayRows = (byDate[date] || []).slice()
      .sort((a, b) => (b['Role'] === 'Q') - (a['Role'] === 'Q'));
    const saturday = f3ParseLocalDate(date).getDay() === LB_SATURDAY;
    let primarySeen = false;
    const secondarySeen = new Set();
    const annotated = dayRows.map(r => {
      const site = String(r['Site'] ?? '').trim();
      const out = { site, role: (r['Role'] || '').trim(), source: paxDetailSource(r['SourceFile']), counted: true };
      if (!dayCredit) return out;
      const key = site.toLowerCase();
      if (saturday && LB_SECOND_POST_SITES_LC.has(key)) {
        if (secondarySeen.has(key)) Object.assign(out, { counted: false, why: `Second ${site} row today` });
        secondarySeen.add(key);
      } else if (primarySeen) {
        Object.assign(out, { counted: false, why: saturday
          ? `One post per Saturday morning, plus ${LB_SECOND_POST_SITES.join(' or ')}`
          : 'One post per day' });
      } else {
        primarySeen = true;
      }
      return out;
    });
    const credit = dayCredit ? lbDayPostCredit(date, dayRows.map(r => r['Site'])) : dayRows.length;
    const q = annotated.some(r => r.role === 'Q');
    posts += credit;
    qs += annotated.filter(r => r.role === 'Q').length;
    days.push({ date, rows: annotated, credit, q });
  }
  return { label: MONTHS[monthIdx], days, posts, qs, complete: posts >= POST_GOAL && qs >= 1 };
}

(async function () {
  const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const grid = document.getElementById('pax-ao-grid');


  // Read and validate the ?pax= parameter.
  const paxName = (new URLSearchParams(location.search).get('pax') || '').trim();
  if (!paxName) {
    document.getElementById('detail-pax-name').textContent = 'PAX not found';
    document.getElementById('detail-pax-sub').textContent = 'No PAX specified.';
    grid.innerHTML = '<div class="status label">Pick a PAX from the ' +
      '<a href="pax.html">PAX Stats</a> table to see their AO breakdown</div>';
    return;
  }

  document.title = `${paxName} — F3 Peak City Stats`;
  document.getElementById('detail-pax-name').textContent = paxName;

  let allRawRows = [];
  try {
    allRawRows = await f3LoadRawRows({ year: PAX_DETAIL_YEAR });
  } catch (e) {
    f3ShowError('pax-ao-grid');
    return;
  }

  // This PAX's rows (exact, trimmed handle match) — only used to short-circuit
  // the "no activity" state; the aggregation itself re-derives this internally.
  const paxRows = allRawRows.filter(r => r['Name'].trim() === paxName);

  if (!paxRows.length) {
    document.getElementById('detail-pax-sub').textContent = `No 2026 activity for ${paxName}.`;
    grid.innerHTML = `<div class="status label empty-state">No 2026 posts found for ` +
      `${f3Esc(paxName)}. Check the name on the <a href="pax.html">PAX Stats</a> page</div>`;
    return;
  }

  const perAoRows = paxDetailBuildPerAo(allRawRows, paxName);

  // Summary stats (real AOs only, matching the cards below).
  const totalPosts = perAoRows.reduce((s, a) => s + a['Posts'], 0);
  const totalQs = perAoRows.reduce((s, a) => s + a['Qs'], 0);
  const aosVisited = perAoRows.filter(a => a['Posts'] > 0).length;
  document.getElementById('stat-posts').textContent = totalPosts.toLocaleString();
  document.getElementById('stat-qs').textContent = totalQs.toLocaleString();
  document.getElementById('stat-aos').textContent = aosVisited;
  document.getElementById('stat-ratio').textContent =
    totalPosts > 0 ? `${(totalQs / totalPosts * 100).toFixed(1)}%` : '—';
  document.getElementById('detail-pax-sub').textContent =
    `${totalPosts.toLocaleString()} posts · ${totalQs.toLocaleString()} Qs · ${aosVisited} AOs in 2026`;

  renderQBalance(paxDetailQBalance(allRawRows, paxName, new Date()));
  renderCalendar();

  // Timeline visuals (real-AO posts only, so counts match the summary above).
  const realRows = paxRows.filter(r => paxDetailIsRealAo((r['Site'] || '').trim()));
  renderRhythm(realRows);
  renderMonthlyChart(realRows);
  renderFingerprint(realRows);

  // Cards: every real AO, attended ones first (by posts desc), then alphabetical
  // — perAoRows is already sorted that way.
  grid.innerHTML = `<table class="table table--stack">
      <thead><tr><th>AO</th><th class="num">Posts</th><th class="num">Qs</th><th>Last post</th><th>Last Q</th></tr></thead>
      <tbody>${perAoRows.map(a => `<tr${a['Posts'] === 0 ? ' class="is-muted"' : ''}>
        <td>${f3Esc(a['AO'])}</td>
        <td class="num">${a['Posts']}</td>
        <td class="num">${a['Qs']}</td>
        <td class="nowrap">${fmtDate(a['Last Post'])}</td>
        <td class="nowrap">${fmtDate(a['Last Q'])}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  f3StackLabels(grid.querySelector('table'));

  // Give/take: weeks since last Q, and Qs vs posts against the benchmark.
  function renderQBalance(b) {
    const noQ = b.weeksSinceQ === null;
    document.getElementById('stat-lastq').textContent = noQ ? 'Never' : `${b.weeksSinceQ} wk`;
    document.getElementById('stat-lastq-date').textContent = noQ ? 'No Q on record in 2026' : fmtDate(b.lastQ);
    const el = document.getElementById('stat-balance');
    const verdict = document.getElementById('stat-balance-read');
    const win = `${PAX_DETAIL_BALANCE_WEEKS} wks`;
    if (!b.posts) {
      el.textContent = '—';
      verdict.textContent = `No posts in the last ${win}`;
    } else {
      el.textContent = b.qs ? `1 per ${Math.round(b.posts / b.qs)}` : '0 Qs';
      verdict.textContent = `${b.qs} Q${b.qs !== 1 ? 's' : ''} in ${b.posts} posts, last ${win} · ` +
        (b.onTrack ? 'On track' : 'Due to Q') + ` (goal 1 per ${PAX_DETAIL_POSTS_PER_Q})`;
      verdict.className = 'label ' + (b.onTrack ? 'tone-none' : 'tone-alert');
    }
    document.getElementById('balance-card').hidden = false;
  }

  // #112 calendar: the current month (or December once the year is over),
  // with arrows back to January. All rows count here, #downrange included,
  // exactly as on the leaderboard.
  function renderCalendar() {
    const now = new Date();
    const lastMonth = String(now.getFullYear()) === PAX_DETAIL_YEAR ? now.getMonth() : 11;
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let monthIdx = lastMonth;
    const card = document.getElementById('calendar-card');
    const prev = document.getElementById('cal-prev');
    const next = document.getElementById('cal-next');
    prev.onclick = () => { if (monthIdx > 0) { monthIdx--; draw(); } };
    next.onclick = () => { if (monthIdx < lastMonth) { monthIdx++; draw(); } };
    draw();
    card.hidden = false;

    function draw() {
      const cal = paxDetailCalendarMonth(allRawRows, paxName, PAX_DETAIL_YEAR, monthIdx);
      prev.disabled = monthIdx === 0;
      next.disabled = monthIdx === lastMonth;
      document.getElementById('cal-title').textContent =
        new Date(Number(PAX_DETAIL_YEAR), monthIdx, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const toGo = Math.max(0, POST_GOAL - cal.posts);
      const tally = document.getElementById('cal-tally');
      tally.innerHTML = `<span class="kpi-num">${cal.posts}</span><span class="label">of ${POST_GOAL} posts</span>` +
        `<span class="kpi-num">${cal.qs}</span><span class="label">Q${cal.qs !== 1 ? 's' : ''}</span>` +
        `<span class="label ${cal.complete ? 'tone-good' : 'tone-none'}">${cal.complete ? 'Month complete'
          : [toGo ? `${toGo} post${toGo !== 1 ? 's' : ''} to go` : '', cal.qs ? '' : 'needs a Q'].filter(Boolean).join(' · ')}</span>`;

      const offset = (f3ParseLocalDate(cal.days[0].date).getDay() + 6) % 7; // Monday first
      const heads = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        .map(d => `<span class="cal-head label" aria-hidden="true">${d}</span>`).join('');
      const blanks = '<span class="cal-blank"></span>'.repeat(offset);
      const cells = cal.days.map(d => {
        const future = d.date > todayIso;
        const extra = d.rows.some(r => !r.counted);
        const cls = ['cal-day', d.credit >= 2 ? 'p2' : d.credit === 1 ? 'p1' : '',
          d.q ? 'is-q' : '', future ? 'is-future' : ''].filter(Boolean).join(' ');
        const say = future ? 'upcoming' : !d.rows.length ? 'no post'
          : `${d.credit} post${d.credit !== 1 ? 's' : ''}${d.q ? ', Q' : ''}${extra ? ', has uncounted rows' : ''}`;
        return `<button type="button" class="${cls}" data-date="${d.date}"${future ? ' disabled' : ''}
          aria-label="${fmtDate(d.date)}: ${say}"><span class="cal-num">${Number(d.date.slice(8))}</span>` +
          `${d.credit >= 2 ? `<span class="cal-count">×${d.credit}</span>` : ''}` +
          `${extra ? '<span class="cal-extra" aria-hidden="true"></span>' : ''}</button>`;
      }).join('');
      const grid = document.getElementById('cal-grid');
      grid.innerHTML = heads + blanks + cells;

      const show = date => {
        const d = cal.days.find(x => x.date === date);
        grid.querySelectorAll('.cal-day').forEach(b => b.classList.toggle('is-selected', b.dataset.date === date));
        const detail = document.getElementById('cal-detail');
        if (!d) { detail.innerHTML = ''; return; }
        const head = `<div class="cal-detail-head"><strong>${fmtDate(d.date)}</strong>` +
          `<span class="label">${d.rows.length ? `${d.credit} post${d.credit !== 1 ? 's' : ''} credited` : 'No posts'}</span></div>`;
        const list = d.rows.map(r => `<li class="${r.counted ? '' : 'is-muted'}">
            <span class="cal-site">${f3Esc(r.site === '#downrange' ? 'Downrange' : r.site || '—')}</span>
            <span class="label">${f3Esc(r.role || '—')} · ${f3Esc(r.source)}</span>
            <span class="label ${r.counted ? 'tone-good' : 'tone-none'}">${r.counted ? 'Counts' : `Not counted: ${f3Esc(r.why)}`}</span>
          </li>`).join('');
        detail.innerHTML = head + (list ? `<ul class="cal-rows">${list}</ul>` : '');
      };
      grid.querySelectorAll('.cal-day:not([disabled])').forEach(b => {
        b.addEventListener('click', () => show(b.dataset.date));
        b.addEventListener('focus', () => show(b.dataset.date));
        b.addEventListener('mouseenter', () => show(b.dataset.date));
      });
      const posted = cal.days.filter(d => d.rows.length && d.date <= todayIso);
      show(cal.days.some(d => d.date === todayIso && d.rows.length) ? todayIso
        : (posted.length ? posted[posted.length - 1].date : null));
    }
  }

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

    const legend = `<div class="rhythm-legend label">
      <span><span class="rhythm-dot"></span>quiet</span>
      <span><span class="rhythm-dot p1"></span>1 post</span>
      <span><span class="rhythm-dot p2"></span>2 posts</span>
      <span><span class="rhythm-dot p3"></span>3+ posts</span>
      <span><span class="rhythm-dot has-q"></span>Q'd that week</span>
    </div>`;

    document.getElementById('pax-rhythm').innerHTML = `<div class="rhythm-wrap">${html}</div>${legend}`;
    document.getElementById('rhythm-card').hidden = false;
  }

  // Posts by Month — this month is the green column; Q count per month is in the tooltip.
  function renderMonthlyChart(rows) {
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
    const options = f3Merge(f3ColumnOptions(categories, 'Posts', total, { highlight: maxMonth }), {
      tooltip: { y: { formatter: (v, { dataPointIndex }) => `${v} posts · ${q[dataPointIndex]} Q-led` } },
    });
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
    new ApexCharts(document.getElementById('chart-detail-dow'),
      f3ColumnOptions(order, 'Posts', order.map(d => counts[d]))).render();
  }
})();

if (typeof module !== 'undefined') {
  module.exports = { paxDetailBuildPerAo, paxDetailQBalance, PAX_DETAIL_POSTS_PER_Q,
    paxDetailCalendarMonth, paxDetailSource };
}

