// ============================================================
// GURUNGA JI BACKEND - app.js
// ============================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// ---- MIDDLEWARE ----
app.use(cors({
  origin: [process.env.FRONTEND_URL, process.env.ADMIN_URL],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- ROUTES ----
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/guru',        require('./routes/guru'));
app.use('/api/murid',       require('./routes/murid'));
app.use('/api/jadwal',      require('./routes/jadwal'));
app.use('/api/materi',      require('./routes/materi'));
app.use('/api/transaksi',   require('./routes/transaksi'));
app.use('/api/forum',       require('./routes/forum'));
app.use('/api/ujian',       require('./routes/ujian'));
app.use('/api/notifikasi',  require('./routes/notifikasi'));
app.use('/api/admin',       require('./routes/admin'));

// ---- HEALTH CHECK ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', app: 'GuruNgaji API', version: '1.0.0' });
});

// ---- ERROR HANDLER ----
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Server error', error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ GuruNgaji API berjalan di port ${PORT}`);
});

module.exports = app;
