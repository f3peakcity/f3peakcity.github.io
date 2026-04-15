// F3 Peak City Stats — Shared Data Utilities
// ============================================================
// CONFIG: Replace these values with your actual Google Sheet ID
// and GID for each published tab. Find GIDs in the sheet URL:
// https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit#gid={GID}
// ============================================================
const F3_SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE';

const F3_TAB_GIDS = {
  ao:          'YOUR_AO_STATS_GID_HERE',
  pax:         'YOUR_PAX_STATS_GID_HERE',
  fng:         'YOUR_FNG_STATS_GID_HERE',
  leaderboard: 'YOUR_LEADERBOARD_GID_HERE',
};

// ============================================================

function f3CsvUrl(tabKey) {
  const id = F3_SHEET_ID;
  const gid = F3_TAB_GIDS[tabKey];
  return `https://docs.google.com/spreadsheets/d/${id}/pub?gid=${gid}&single=true&output=csv`;
}

async function f3FetchCSV(tabKey) {
  const res = await fetch(f3CsvUrl(tabKey));
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${tabKey} tab`);
  return res.text();
}

function f3ParseCSVLine(line) {
  const result = [];
  let inQuote = false;
  let current = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === ',' && !inQuote) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// headerRowIndex: 0-based index of the row containing column headers.
// All rows before headerRowIndex are skipped (metadata rows).
function f3ParseCSV(text, headerRowIndex) {
  const lines = text.trim().split('\n');
  const headers = f3ParseCSVLine(lines[headerRowIndex]).map(h => h.trim());
  return lines
    .slice(headerRowIndex + 1)
    .filter(line => line.trim() !== '')
    .map(line => {
      const vals = f3ParseCSVLine(line);
      return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]));
    });
}

// Filters rows where row[field] falls within [from, to] date strings (ISO format).
// Rows with unparseable dates are kept (never silently dropped).
function f3FilterByDateRange(rows, field, from, to) {
  return rows.filter(row => {
    const val = row[field];
    if (!val) return true;
    const d = new Date(val);
    if (isNaN(d.getTime())) return true;
    if (from && from !== '' && d < new Date(from)) return false;
    if (to && to !== '' && d > new Date(to)) return false;
    return true;
  });
}

function f3ShowLoading(containerId) {
  const el = document.getElementById(containerId);
  if (el) {
    el.innerHTML = '<div class="d-flex justify-content-center align-items-center p-5">' +
      '<div class="spinner-border text-danger" role="status"><span class="visually-hidden">Loading...</span></div>' +
      '</div>';
  }
}

function f3ShowError(containerId, msg = 'Data unavailable — try refreshing the page') {
  const el = document.getElementById(containerId);
  if (el) {
    el.innerHTML = `<div class="alert alert-warning m-3"><strong>Oops.</strong> ${msg}</div>`;
  }
}

// Attaches click-to-sort behavior to all <th data-sort="colName"> elements
// within the given table element.
function f3MakeSortable(tableId, rows, renderFn) {
  const table = document.getElementById(tableId);
  if (!table) return;
  let sortCol = null;
  let sortDir = 1;
  table.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortCol === col) {
        sortDir *= -1;
      } else {
        sortCol = col;
        sortDir = 1;
      }
      table.querySelectorAll('th[data-sort]').forEach(h => h.classList.remove('asc', 'desc'));
      th.classList.add(sortDir === 1 ? 'asc' : 'desc');
      const sorted = [...rows].sort((a, b) => {
        const av = a[col] ?? '';
        const bv = b[col] ?? '';
        const an = parseFloat(av);
        const bn = parseFloat(bv);
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * sortDir;
        return av.localeCompare(bv) * sortDir;
      });
      renderFn(sorted);
    });
  });
}

// Export for Node.js tests
if (typeof module !== 'undefined') {
  module.exports = { f3ParseCSVLine, f3ParseCSV, f3FilterByDateRange };
}
