// ============================================================
// src/middleware/auth.js - JWT Authentication
// ============================================================
const jwt = require('jsonwebtoken');
const db  = require('../config/db');

// Verifikasi token JWT
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Cek user masih aktif di database
    const result = await db.query(
      'SELECT id, nama, email, role, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!result.rows[0] || !result.rows[0].is_active) {
      return res.status(401).json({ success: false, message: 'Akun tidak aktif' });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token tidak valid' });
  }
};

// Middleware khusus role
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Akses ditolak' });
  }
  next();
};

module.exports = { authMiddleware, requireRole };
