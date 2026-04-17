// F3 Peak City Stats — Shared Data Utilities
// ============================================================
// CONFIG: Google Sheets "Publish to Web" published ID and GIDs.
// The published ID differs from the sheet's edit URL ID — it is
// the long token in the /d/e/{PUBLISHED_ID}/pub URLs.
// ============================================================
const F3_PUBLISHED_ID = '2PACX-1vR804eEdHprDZVLy23u5xzcvgdFodpwtIsMXLG20hTxYrV29DxwtBoPvR5W9V7r4-U2J1yKSs7XkM7M';

const F3_TAB_GIDS = {
  ao:          '1516133009',
  pax:         '731565815',
  fng:         '146818903',
  leaderboard: '740264345',
};

// ============================================================

function f3CsvUrl(tabKey) {
  const id = F3_PUBLISHED_ID;
  const gid = F3_TAB_GIDS[tabKey];
  return `https://docs.google.com/spreadsheets/d/e/${id}/pub?gid=${gid}&single=true&output=csv`;
}

async function f3FetchCSV(tabKey) {
  const res = await fetch(f3CsvUrl(tabKey));
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${tabKey} tab`);
  return res.text();
}

function f3ParseCSVLine(line) {
  line = line.replace(/\r$/, '');
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
// NOTE: Does not support quoted fields containing literal newlines (RFC 4180 §2.6).
// Google Sheets "Publish to Web" CSV output does not emit embedded newlines
// for the sheet tabs used by this dashboard.
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

// Parse a date string as local midnight regardless of format.
// Handles ISO (YYYY-MM-DD) and Google Sheets M/D/YYYY formats.
function f3ParseLocalDate(str) {
  if (!str) return null;
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return new Date(+mdy[3], +mdy[1] - 1, +mdy[2]);
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// Filters rows where row[field] falls within [from, to] date strings.
// Rows with unparseable dates are kept (never silently dropped).
function f3FilterByDateRange(rows, field, from, to) {
  const fromDate = from ? f3ParseLocalDate(from) : null;
  const toDate   = to   ? f3ParseLocalDate(to)   : null;
  return rows.filter(row => {
    const val = row[field];
    if (!val) return true;
    const d = f3ParseLocalDate(val);
    if (!d) return true;
    if (fromDate && d < fromDate) return false;
    if (toDate   && d > toDate)   return false;
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
// getRows: a function that returns the current rows to sort (enables live filtering)
function f3MakeSortable(tableId, getRows, renderFn) {
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
      const sorted = [...getRows()].sort((a, b) => {
        const av = a[col] ?? '';
        const bv = b[col] ?? '';
        const an = parseFloat(av);
        const bn = parseFloat(bv);
        // Both must be valid numbers for numeric sort; empty string falls to string sort
        if (!isNaN(an) && !isNaN(bn)) return (an - bn) * sortDir;
        return av.localeCompare(bv) * sortDir;
      });
      renderFn(sorted);
    });
  });
}

// Escapes a value for safe insertion into innerHTML.
// Use on all string fields from CSV when rendering to the DOM.
function f3Esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Export for Node.js tests
if (typeof module !== 'undefined') {
  module.exports = { f3ParseCSVLine, f3ParseCSV, f3ParseLocalDate, f3FilterByDateRange, f3Esc };
}
