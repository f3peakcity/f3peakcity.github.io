// Browser regression tests for the AO daily chart's day filter + legend isolation.
//
// These cover the ApexCharts integration, which unit tests cannot reach: the
// chart carries per-series visibility state across updates, and a series left
// collapsed by a previous view will shadow the new view's data.
//
// Usage:
//   python3 -m http.server 8899 --directory static &
//   chrome --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/p about:blank &
//   node static/stats/test/browser/ao-daily-chart.test.js

const PAGE = process.env.AO_URL || 'http://localhost:8899/stats/ao.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.error(`  ✗ ${name}\n    ${detail}`); failed++; }
}

(async () => {
  let targets;
  for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch('http://localhost:9222/json')).json(); break; }
    catch { await sleep(500); }
  }
  if (!targets) throw new Error('no Chrome on :9222');
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 0; const pending = new Map(); const pageErrors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      pageErrors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '?').split('\n')[0]);
    }
  };
  const send = (method, params = {}) => new Promise(res => {
    const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || '').split('\n')[0]);
    return r.result?.result?.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  const reload = async () => {
    await send('Page.navigate', { url: PAGE });
    for (let i = 0; i < 120; i++) {
      if (await ev(`document.querySelectorAll('#chart-daily-attendance .apexcharts-bar-area').length > 0`)) break;
      await sleep(500);
    }
    await sleep(1200);
  };
  const state = () => ev(`(function(){
    var root = document.getElementById('chart-daily-attendance');
    var groups = [].slice.call(root.querySelectorAll('.apexcharts-series'));
    var xl = [].map.call(root.querySelectorAll('.apexcharts-xaxis-label title'), function(e){return e.textContent;});
    return {
      hidden: groups.filter(function(g){return g.classList.contains('apexcharts-series-collapsed');}).length,
      seriesCount: groups.length,
      firstX: xl[0] || '',
      legend: [].map.call(root.querySelectorAll('.apexcharts-legend-text'), function(e){return e.textContent;}),
      readout: document.getElementById('daily-attendance-range').textContent,
      activePill: document.querySelector('#daily-day-filter .active').dataset.day || ''
    };})()`);
  const legend = name => ev(`(function(){
      var els = [].slice.call(document.querySelectorAll('#chart-daily-attendance .apexcharts-legend-series'));
      var el = els.filter(function(e){return e.textContent.trim() === ${JSON.stringify(name)};})[0];
      if (!el) return 'NO-ENTRY';
      (el.querySelector('.apexcharts-legend-text') || el).dispatchEvent(
        new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
      return 'ok';})()`);
  const day = d => ev(`document.querySelector('#daily-day-filter [data-day="${d}"]').click()`);

  // The chart's own x-axis must agree with the header readout's date range.
  const axisMatchesReadout = s => s.readout.includes(s.firstX);

  console.log('\nday filter after legend isolation');

  // --- isolate on a weekday, then switch weekday ---
  await reload();
  await day('Thu'); await sleep(1500);
  await legend('Half Dome'); await sleep(1000);
  let s = await state();
  check('legend click isolates one AO', s.hidden === s.seriesCount - 1, `hidden=${s.hidden} of ${s.seriesCount}`);
  check('isolated AO is named in the readout', s.readout.startsWith('Half Dome ·'), s.readout);

  await day('Wed'); await sleep(2200);
  s = await state();
  check('switching day clears the isolation', s.hidden === 0, `${s.hidden} series still hidden`);
  check('switching day reloads the chart data', axisMatchesReadout(s), `x-axis starts ${s.firstX}, readout ${s.readout}`);
  check('legend lists the new day\'s AOs', s.legend.includes('Tortoises'), s.legend.join(','));

  // --- isolate on the All view, then pick a weekday (23 series -> 6) ---
  await reload();
  await legend('Das Boot'); await sleep(1200);
  await day('Tue'); await sleep(2500);
  s = await state();
  check('All-view isolation does not survive into a weekday', s.hidden === 0, `${s.hidden} series still hidden`);
  check('weekday view loads its own dates after All-view isolation', axisMatchesReadout(s), `x-axis starts ${s.firstX}, readout ${s.readout}`);
  check('legend swaps to the weekday\'s AOs', !s.legend.includes('Das Boot'), s.legend.join(','));

  // --- isolate / switch / isolate / switch ---
  await reload();
  await day('Sat'); await sleep(1500);
  await legend('Das Boot'); await sleep(1000);
  await day('Tue'); await sleep(2200);
  await legend('Pump Fiction'); await sleep(1000);
  await day('Thu'); await sleep(2200);
  s = await state();
  check('repeated isolate/switch cycles stay in sync', s.hidden === 0 && axisMatchesReadout(s),
    `hidden=${s.hidden}, x-axis ${s.firstX}, readout ${s.readout}`);
  check('final view shows the day that was clicked last', s.activePill === 'Thu', s.activePill);

  // --- rapid clicking must not strand the chart mid-update ---
  await reload();
  await day('Thu'); await sleep(1500);
  await legend('Half Dome'); await sleep(1000);
  await day('Wed'); await sleep(120); await day('Mon'); await sleep(120); await day('Fri');
  await sleep(3000);
  s = await state();
  check('rapid day clicks settle on the last one', s.activePill === 'Fri' && axisMatchesReadout(s),
    `pill=${s.activePill}, x-axis ${s.firstX}, readout ${s.readout}`);
  check('rapid day clicks leave nothing hidden', s.hidden === 0, `${s.hidden} hidden`);

  check('no uncaught page errors', pageErrors.length === 0, JSON.stringify(pageErrors));

  console.log(`\n${passed} passed, ${failed} failed`);
  ws.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILED:', e.message); process.exit(1); });
