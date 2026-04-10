// ============================================================
// GURUNGA JI BACKEND - app.js (Vercel Compatible)
// Semua route dalam satu file, export module untuk Vercel
// ============================================================
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { Pool } = require('pg');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');

const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT) || 6543,
  database: process.env.DB_NAME || 'postgres',
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'guruNgaji_secret';
const makeToken = (user) => jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token tidak valid' });
  }
};

// Health check
app.get('/', (req, res) => res.json({ status: 'OK', app: 'GuruNgaji API 🕌', version: '1.0.0' }));
app.get('/api/health', (req, res) => res.json({ status: 'OK', app: 'GuruNgaji API', version: '1.0.0' }));

// AUTH
app.post('/api/auth/register', async (req, res) => {
  const { nama, email, password, no_telepon, role } = req.body;
  try {
    if (!nama || !email || !password || !role)
      return res.status(400).json({ success: false, message: 'Semua field wajib diisi' });
    const cek = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (cek.rows.length > 0)
      return res.status(400).json({ success: false, message: 'Email sudah terdaftar' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (nama,email,password,no_telepon,role) VALUES ($1,$2,$3,$4,$5) RETURNING id,nama,email,role',
      [nama, email, hash, no_telepon, role]
    );
    const user = result.rows[0];
    if (role === 'guru') await pool.query('INSERT INTO profil_guru (user_id,harga_per_sesi) VALUES ($1,$2)', [user.id, 0]);
    else await pool.query('INSERT INTO profil_murid (user_id) VALUES ($1)', [user.id]);
    res.status(201).json({ success: true, token: makeToken(user), user });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1 AND is_active=true', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ success: false, message: 'Email atau password salah' });
    res.json({ success: true, token: makeToken(user), user: { id: user.id, nama: user.nama, email: user.email, role: user.role } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT id,nama,email,role,foto_profil,is_verified FROM users WHERE id=$1', [req.user.id]);
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GURU
app.get('/api/guru', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id,u.nama,u.foto_profil,pg.spesialisasi,pg.harga_per_sesi,pg.lokasi,pg.provinsi,pg.rating_avg,pg.total_murid,pg.tier,pg.mode_ngajar
       FROM users u JOIN profil_guru pg ON u.id=pg.user_id
       WHERE pg.status_verif='verified' AND u.is_active=true
       ORDER BY pg.rating_avg DESC LIMIT 20`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/guru/:id', async (req, res) => {
  try {
    const guru = await pool.query(
      'SELECT u.id,u.nama,u.foto_profil,pg.* FROM users u JOIN profil_guru pg ON u.id=pg.user_id WHERE u.id=$1',
      [req.params.id]
    );
    if (!guru.rows[0]) return res.status(404).json({ success: false, message: 'Guru tidak ditemukan' });
    res.json({ success: true, data: guru.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// JADWAL
app.get('/api/jadwal', auth, async (req, res) => {
  try {
    const isGuru = req.user.role === 'guru';
    const result = await pool.query(
      `SELECT j.*,g.nama AS nama_guru,m.nama AS nama_murid FROM jadwal j
       JOIN users g ON j.guru_id=g.id JOIN users m ON j.murid_id=m.id
       WHERE ${isGuru ? 'j.guru_id' : 'j.murid_id'}=$1 ORDER BY j.tanggal ASC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/jadwal', auth, async (req, res) => {
  const { guru_id, tanggal, jam_mulai, jam_selesai, mode, catatan } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO jadwal (guru_id,murid_id,tanggal,jam_mulai,jam_selesai,mode,catatan) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [guru_id, req.user.id, tanggal, jam_mulai, jam_selesai, mode, catatan]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ADMIN
app.get('/api/admin/dashboard', auth, async (req, res) => {
  try {
    const [guru, murid] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM users WHERE role='guru' AND is_active=true"),
      pool.query("SELECT COUNT(*) FROM users WHERE role='murid' AND is_active=true"),
    ]);
    res.json({ success: true, data: { total_guru: parseInt(guru.rows[0].count), total_murid: parseInt(murid.rows[0].count) } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/admin/guru-pending', auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT u.id,u.nama,u.email,pg.spesialisasi,pg.lokasi FROM users u JOIN profil_guru pg ON u.id=pg.user_id WHERE pg.status_verif='pending'"
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/admin/verifikasi/:id', auth, async (req, res) => {
  try {
    await pool.query('UPDATE profil_guru SET status_verif=$1 WHERE user_id=$2', [req.body.action, req.params.id]);
    res.json({ success: true, message: 'Status diperbarui' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// NOTIFIKASI
app.get('/api/notifikasi', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM notifikasi WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20', [req.user.id]);
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

// PENTING: Export untuk Vercel (jangan pakai app.listen)
module.exports = app;
