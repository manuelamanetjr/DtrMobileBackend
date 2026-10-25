// db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST || '127.0.0.1',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'plant02_rs',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+08:00',       // Asia/Manila — matches your dump
  dateStrings: true,        // return DATE/DATETIME as strings, not JS Date
});

// Quick sanity check on startup
pool.getConnection()
  .then((conn) => {
    console.log('[db] connected to', process.env.DB_NAME);
    conn.release();
  })
  .catch((err) => {
    console.error('[db] connection failed:', err.message);
    process.exit(1);
  });

module.exports = pool;