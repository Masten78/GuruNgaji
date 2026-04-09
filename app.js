// ============================================================
// GURUNGA JI BACKEND - app.js (Flat Structure)
// Semua file di root folder, tidak perlu subfolder src/
// ============================================================
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const app     = express();

// ---- MIDDLEWARE ----
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- ROUTES ----
app.use('/api/auth',       require('./auth'));
app.use('/api/guru',       require('./guru'));
app.use('/api/jadwal',     require('./jadwal'));
app.use('/api/admin',      require('./admin'));

// ---- HEALTH CHECK ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', app: 'GuruNgaji API', version: '1.0.0' });
});

app.get('/', (req, res) => {
  res.json({ message: 'GuruNgaji Backend berjalan! 🕌', status: 'online' });
});

// ---- ERROR HANDLER ----
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(✅ GuruNgaji API berjalan di port ${PORT});
});

module.exports = app;
