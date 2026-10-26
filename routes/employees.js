// routes/employees.js
const router = require('express').Router();
const pool   = require('../db');

// GET /api/employees
// Returns: [{ employee_number, last, first, mi }]
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT employee_number, last, first, mi
      FROM tbl_employee
      ORDER BY last ASC, first ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[GET /employees]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;