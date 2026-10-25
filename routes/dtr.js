// routes/dtr.js
const router = require('express').Router();
const pool   = require('../db');

// ── Date helpers ───────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const round2 = (n) => Math.round(n * 100) / 100;

// Pair IN/OUT punches of one day → { in, out, hours }
// in_out_remarks: 1 = IN, 0 = OUT (your correction)
function pairDay(punches) {
  // Sort by time ascending (date_time_dtr string sorts fine)
  const sorted = [...punches].sort((a, b) =>
    a.time_dtr.localeCompare(b.time_dtr)
  );

  const firstIn = sorted.find(p => p.in_out_remarks === 1)?.time_dtr ?? null;
  const outs    = sorted.filter(p => p.in_out_remarks === 0);
  const lastOut = outs.length ? outs[outs.length - 1].time_dtr : null;

  let hours = 0;
  if (firstIn && lastOut) {
    const inSec  = toSec(firstIn);
    const outSec = toSec(lastOut);
    if (outSec > inSec) hours = round2((outSec - inSec) / 3600);
  }

  return { in: firstIn, out: lastOut, hours };
}

const toSec = (hhmmss) => {
  const [h, m, s] = hhmmss.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
};

// Build the days array for a [start, end] range
async function buildDays(employee_number, startYmd, endYmd) {
  const [rows] = await pool.query(
    `SELECT date_dtr, time_dtr, in_out_remarks
     FROM tbl_in_dtr
     WHERE employee_number = ?
       AND date_dtr BETWEEN ? AND ?
     ORDER BY date_dtr ASC, time_dtr ASC`,
    [employee_number, startYmd, endYmd]
  );

  // Group punches by date
  const byDate = new Map();
  for (const p of rows) {
    const d = String(p.date_dtr).slice(0, 10); // "YYYY-MM-DD"
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(p);
  }

  // Walk every date in the range so absent days appear too
  const days = [];
  let total = 0;
  const cursor = parseYmd(startYmd);
  const end    = parseYmd(endYmd);
  while (cursor <= end) {
    const d = ymd(cursor);
    const dayPunches = byDate.get(d) ?? [];
    if (dayPunches.length === 0) {
      days.push({ date: d, in: null, out: null, hours: 0 });
    } else {
      const paired = pairDay(dayPunches);
      days.push({ date: d, ...paired });
      total += paired.hours;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { days, total_hours: round2(total) };
}

// ── GET /api/dtr?mode=week&employee_number=X&date=YYYY-MM-DD ──
// ── GET /api/dtr?mode=month&employee_number=X&year=YYYY&month=M ──
router.get('/', async (req, res) => {
  try {
    const { mode, employee_number } = req.query;
    if (!employee_number) {
      return res.status(400).json({ error: 'employee_number is required' });
    }

    let startYmd, endYmd;

    if (mode === 'week') {
      const date = req.query.date || ymd(new Date());
      const ts   = parseYmd(date);
      const dow  = ts.getDay();                 // 0 = Sun
      const s    = new Date(ts);
      s.setDate(ts.getDate() - dow);            // back to Sunday
      const e    = new Date(s);
      e.setDate(s.getDate() + 6);               // forward to Saturday
      startYmd = ymd(s);
      endYmd   = ymd(e);
    } else if (mode === 'month') {
      const year  = Number(req.query.year);
      const month = Number(req.query.month);
      if (!year || !month) {
        return res.status(400).json({ error: 'year and month required for mode=month' });
      }
      startYmd = `${year}-${pad(month)}-01`;
      endYmd   = ymd(new Date(year, month, 0)); // last day of month
    } else {
      return res.status(400).json({ error: 'mode must be week or month' });
    }

    const { days, total_hours } = await buildDays(employee_number, startYmd, endYmd);

    res.json({
      employee_number,
      range: { start: startYmd, end: endYmd },
      days,
      total_hours,
    });
  } catch (err) {
    console.error('[GET /dtr]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;