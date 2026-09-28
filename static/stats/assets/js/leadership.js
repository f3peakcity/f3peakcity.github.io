// Leadership page logic
// Who's leading, who's next, and where one or two men carry the load.
// Source: Raw/Master tab, all years (records start Jan 2025, so a "first Q"
// means the first Q on record, not necessarily a man's first ever).
// A Q is a record with Role = 'Q' at a Peak City site (#downrange and Shield
// Lock excluded, as everywhere attendance is counted).

const LD_DAY_MS = 86400000;
const LD_WINDOW_DAYS = 90;     // "recent" for unique Qs, concentration, pipeline
const LD_REPEAT_DAYS = 60;     // a first-time Q "came back" if he Q'd again within this
const LD_REGULAR_Q = 3;        // Q'd this many times in the window = regular Q
const LD_TOP_SHARE = 0.2;      // concentration = share of Q-led posts by the top 20% of Qs

const ldDaysBetween = (a, b) => Math.round((f3ParseLocalDate(b) - f3ParseLocalDate(a)) / LD_DAY_MS);
const ldInWindow = (iso, now, days) => {
  const d = f3ParseLocalDate(iso);
  return d && d <= now && now - d <= days * LD_DAY_MS;
};

// Name -> that man's Q records, oldest first.
function ldQHistory(rows) {
  const out = {};
  rows.forEach(r => {
    if (r['Role'] !== 'Q' || !f3CountsTowardAttendance(r['Site'])) return;
    (out[r['Name'].trim()] = out[r['Name'].trim()] || []).push({ date: r['Date'], site: r['Site'].trim() });
  });
  Object.values(out).forEach(list => list.sort((a, b) => a.date.localeCompare(b.date)));
  return out;
}

// Share of recent Q-led workouts led by the busiest 20% of Qs.
function ldConcentration(history, now, days = LD_WINDOW_DAYS) {
  const counts = Object.values(history)
    .map(list => list.filter(q => ldInWindow(q.date, now, days)).length)
    .filter(n => n > 0)
    .sort((a, b) => b - a);
  const qLed = counts.reduce((a, b) => a + b, 0);
  const topN = Math.ceil(counts.length * LD_TOP_SHARE);
  const topLed = counts.slice(0, topN).reduce((a, b) => a + b, 0);
  return { qLed, uniqueQs: counts.length, topN, topShare: qLed ? topLed / qLed : 0 };
}

// Men whose first Q on record is on or after `sinceIso`, newest first, with
// their second Q (if any) and whether it came within LD_REPEAT_DAYS.
function ldFirstTimeQs(history, sinceIso) {
  return Object.entries(history)
    .filter(([, list]) => list[0].date >= sinceIso)
    .map(([name, list]) => {
      const second = list.find(q => q.date > list[0].date) || null;
      return {
        name, first: list[0].date, site: list[0].site,
        second: second && second.date,
        daysToSecond: second ? ldDaysBetween(list[0].date, second.date) : null,
      };
    })
    .sort((a, b) => b.first.localeCompare(a.first) || a.name.localeCompare(b.name));
}

// Of first-time Qs at least LD_REPEAT_DAYS out, how many Q'd again in time.
function ldRepeatRate(firstTimers, now) {
  const eligible = firstTimers.filter(f => now - f3ParseLocalDate(f.first) >= LD_REPEAT_DAYS * LD_DAY_MS);
  const repeated = eligible.filter(f => f.daysToSecond !== null && f.daysToSecond <= LD_REPEAT_DAYS);
  return { n: repeated.length, of: eligible.length };
}

// From PC Regulars to regular Qs. Every stage is a subset of the one before.
function ldPipeline(rows, history, now) {
  const regulars = Object.entries(f3PcRegularMap(rows, now)).filter(([, v]) => v).map(([n]) => n);
  const recentQs = name => (history[name] || []).filter(q => ldInWindow(q.date, now, LD_WINDOW_DAYS)).length;
  const everQd = regulars.filter(n => history[n]);
  const recent = everQd.filter(n => recentQs(n) > 0);
  const regularQ = recent.filter(n => recentQs(n) >= LD_REGULAR_Q);
  return [
    { label: 'PC Regulars', n: regulars.length, tip: 'Posts 26+ times in 26 weeks, or 3+ in the last 3 weeks.' },
    { label: "Have Q'd", n: everQd.length, tip: "PC Regulars with at least one Q on record (records start Jan 2025)." },
    { label: "Q'd in the last 90 days", n: recent.length, tip: 'Led at least one workout in the last 90 days.' },
    { label: 'Regular Qs', n: regularQ.length, tip: `Led ${LD_REGULAR_Q}+ workouts in the last 90 days.` },
  ].map(st => ({ ...st, of: regulars.length }));
}

// PC Regulars with no Q on record: the bench. Home AO = where they post most
// in the window; sorted by recent posts, most first.
function ldBench(rows, history, now) {
  const regulars = f3PcRegularMap(rows, now);
  const recent = {};
  rows.forEach(r => {
    const name = r['Name'].trim();
    if (!regulars[name] || history[name] || !f3CountsTowardAttendance(r['Site'])) return;
    if (!ldInWindow(r['Date'], now, LD_WINDOW_DAYS)) return;
    const m = recent[name] = recent[name] || { posts: 0, sites: {} };
    m.posts++;
    m.sites[r['Site'].trim()] = (m.sites[r['Site'].trim()] || 0) + 1;
  });
  return Object.entries(recent)
    .map(([name, m]) => ({
      name, posts: m.posts,
      homeAo: Object.entries(m.sites).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    }))
    .sort((a, b) => b.posts - a.posts || a.name.localeCompare(b.name));
}

(async function () {
  if (typeof document === 'undefined') return;
  const now = new Date();
  const IDS = ['ld-pipeline', 'ld-first-qs', 'ld-bench', 'ld-load-table'];

  let rows;
  try {
    rows = await f3LoadRawRows();
  } catch (e) {
    IDS.forEach(id => f3ShowError(id));
    return;
  }
  if (!rows.length) {
    IDS.forEach(id => f3ShowEmpty(id, 'No posts logged yet'));
    return;
  }

  const year = String(now.getFullYear());
  const history = ldQHistory(rows);
  const conc = ldConcentration(history, now);
  const firstTimers = ldFirstTimeQs(history, `${year}-01-01`);
  const repeat = ldRepeatRate(firstTimers, now);
  const pct = (n, of) => (of ? Math.round(n / of * 100) : 0);
  const shortDate = iso => f3ParseLocalDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // KPIs
  document.getElementById('stat-unique-qs').textContent = conc.uniqueQs;
  document.getElementById('stat-first-qs').textContent = firstTimers.length;
  document.getElementById('stat-repeat').textContent = `${pct(repeat.n, repeat.of)}%`;
  document.getElementById('stat-repeat-n').textContent = `${repeat.n} of ${repeat.of}`;
  document.getElementById('stat-concentration').textContent = `${pct(conc.topShare, 1)}%`;
  document.getElementById('stat-concentration-n').textContent = `${conc.topN} men`;

  // Pipeline
  const stages = ldPipeline(rows, history, now);
  document.getElementById('ld-pipeline').innerHTML = stages.map((st, i) => `
    <div class="bar-row bar-row--wide${i === 0 ? ' is-top' : ''}">
      <span class="bar-name">${st.label} ${f3InfoDot(st.tip)}<span class="label">${i ? `${pct(st.n, st.of)}% of regulars` : 'The base'}</span></span>
      <span class="bar-track"><span class="bar-fill" style="width:${pct(st.n, st.of)}%"></span></span>
      <span class="bar-val">${st.n}</span>
    </div>`).join('');

  // First-time Qs: green value when he came back to Q within the window;
  // "—" when he hasn't Q'd again yet.
  document.getElementById('ld-first-qs').innerHTML = firstTimers.length ? firstTimers.map(f => {
    const again = f.daysToSecond !== null;
    const tip = again ? `Second Q ${shortDate(f.second)}, ${f.daysToSecond} days later` : "Hasn't Q'd again yet";
    return `<div class="row" title="${f3Esc(tip)}">
      <span class="row-name">${f3Esc(f.name)}</span>
      <span class="label">${shortDate(f.first)} · ${f3Esc(f.site)}</span>
      <span class="row-val${again && f.daysToSecond <= LD_REPEAT_DAYS ? ' is-good' : ''}" aria-label="${f3Esc(tip)}">${again ? `${f.daysToSecond}d` : '—'}</span>
    </div>`;
  }).join('') : `<div class="status label empty-state">No first-time Qs yet this year</div>`;

  // Bench
  const bench = ldBench(rows, history, now);
  document.getElementById('ld-bench-count').textContent = `${bench.length} men`;
  document.getElementById('ld-bench').innerHTML = bench.length ? bench.map(b => `
    <div class="row">
      <span class="row-name">${f3Esc(b.name)}</span>
      <span class="label">${f3Esc(b.homeAo)}</span>
      <span class="row-val" aria-label="${b.posts} posts in the last 90 days">${b.posts}</span>
    </div>`).join('') : `<div class="status label empty-state">Every PC Regular has Q'd. Deep bench.</div>`;

  // Q load by AO
  const load = f3QLoadByAo(rows, now, LD_WINDOW_DAYS);
  const loadRows = Object.entries(load)
    .filter(([site]) => f3IsRealAo(site))
    .map(([site, l]) => ({ site, ...l, tone: f3QLoadTone(l) }))
    .sort((a, b) => b.top2Share - a.top2Share || b.qLed - a.qLed);
  const th = (label, tip, num) => `<th${num ? ' class="num"' : ''}>${f3ThLabel(label, tip)}</th>`;
  document.getElementById('ld-load-table').innerHTML = `
    <table class="table table--stack">
      <thead><tr>
        ${th('AO', 'Workout location')}
        ${th('Q-led workouts', 'Q records at this AO in the last 90 days', true)}
        ${th('Unique Qs', 'Different men who led here in the last 90 days', true)}
        ${th('Top 2 share', 'Share of those workouts led by the two busiest Qs. Rust at 50%+, gold at 40%+, with at least 6 Q-led workouts to judge.', true)}
      </tr></thead>
      <tbody>${loadRows.map(l => `<tr>
        <td>${f3Esc(l.site)}</td>
        <td class="num">${l.qLed}</td>
        <td class="num">${l.uniqueQs}</td>
        <td class="num"><span class="tone-${l.tone}">${pct(l.top2Share, 1)}%</span></td>
      </tr>`).join('')}</tbody>
    </table>`;
  f3StackLabels(document.querySelector('#ld-load-table table'));
})();

if (typeof module !== 'undefined') {
  module.exports = {
    LD_REPEAT_DAYS, ldQHistory, ldConcentration, ldFirstTimeQs, ldRepeatRate, ldPipeline, ldBench,
  };
}
