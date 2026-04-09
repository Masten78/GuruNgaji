// ============================================================
// src/config/db.js - Koneksi PostgreSQL
// ============================================================
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('connect', () => console.log('✅ PostgreSQL terhubung'));
pool.on('error',   (err) => console.error('❌ Database error:', err));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
