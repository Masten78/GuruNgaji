// ============================================================
// db.js - Koneksi PostgreSQL (Supabase)
// ============================================================
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 6543,
  database: process.env.DB_NAME     || 'postgres',
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false }  // wajib untuk Supabase
});

pool.on('connect', () => console.log('✅ Database Supabase terhubung!'));
pool.on('error',   (err) => console.error('❌ DB error:', err.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
