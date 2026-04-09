// ============================================================
// src/routes/guru.js - Profil & Pencarian Guru
// ============================================================
const router  = require('express').Router();
const db      = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { uploadFoto, uploadDokumen }   = require('../config/cloudinary');

// ============================================================
// GET /api/guru - Cari & Filter Guru
// Query: ?provinsi=jawa+barat&spesialisasi=tajwid&min=50000&max=200000&rating=4&page=1
// ============================================================
router.get('/', async (req, res) => {
  const { provinsi, spesialisasi, min, max, rating, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  let where = ["pg.status_verif = 'verified'", 'u.is_active = true'];

  if (provinsi) { params.push(`%${provinsi}%`); where.push(`pg.provinsi ILIKE $${params.length}`); }
  if (spesialisasi) { params.push(spesialisasi); where.push(`$${params.length} = ANY(pg.spesialisasi)`); }
  if (min) { params.push(min); where.push(`pg.harga_per_sesi >= $${params.length}`); }
  if (max) { params.push(max); where.push(`pg.harga_per_sesi <= $${params.length}`); }
  if (rating) { params.push(rating); where.push(`pg.rating_avg >= $${params.length}`); }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const result = await db.query(
      `SELECT u.id, u.nama, u.foto_profil,
              pg.spesialisasi, pg.harga_per_sesi, pg.lokasi, pg.provinsi,
              pg.rating_avg, pg.total_murid, pg.total_sesi, pg.pengalaman_thn,
              pg.mode_ngajar, pg.tier
       FROM users u
       JOIN profil_guru pg ON u.id = pg.user_id
       ${whereClause}
       ORDER BY pg.rating_avg DESC, pg.total_murid DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const total = await db.query(
      `SELECT COUNT(*) FROM users u JOIN profil_guru pg ON u.id = pg.user_id ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      total: parseInt(total.rows[0].count),
      page: parseInt(page),
      totalPages: Math.ceil(total.rows[0].count / limit)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// GET /api/guru/:id - Detail profil guru + ulasan
// ============================================================
router.get('/:id', async (req, res) => {
  try {
    const guru = await db.query(
      `SELECT u.id, u.nama, u.foto_profil, u.created_at,
              pg.*
       FROM users u
       JOIN profil_guru pg ON u.id = pg.user_id
       WHERE u.id = $1`,
      [req.params.id]
    );

    if (!guru.rows[0]) return res.status(404).json({ success: false, message: 'Guru tidak ditemukan' });

    const ulasan = await db.query(
      `SELECT ul.rating, ul.komentar, ul.created_at,
              u.nama AS nama_murid, u.foto_profil AS foto_murid
       FROM ulasan ul
       JOIN users u ON ul.murid_id = u.id
       WHERE ul.guru_id = $1
       ORDER BY ul.created_at DESC
       LIMIT 10`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...guru.rows[0], ulasan: ulasan.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// PUT /api/guru/profil - Update profil guru (auth)
// ============================================================
router.put('/profil', authMiddleware, requireRole('guru'), async (req, res) => {
  const { bio, spesialisasi, pengalaman_thn, harga_per_sesi, lokasi, provinsi, mode_ngajar, lat, lng } = req.body;
  try {
    await db.query(
      `UPDATE profil_guru SET
         bio=$1, spesialisasi=$2, pengalaman_thn=$3,
         harga_per_sesi=$4, lokasi=$5, provinsi=$6,
         mode_ngajar=$7, lat=$8, lng=$9
       WHERE user_id=$10`,
      [bio, spesialisasi, pengalaman_thn, harga_per_sesi, lokasi, provinsi, mode_ngajar, lat, lng, req.user.id]
    );
    res.json({ success: true, message: 'Profil berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// POST /api/guru/upload-foto - Upload foto profil
// ============================================================
router.post('/upload-foto', authMiddleware, uploadFoto.single('foto'), async (req, res) => {
  try {
    const url = req.file.path;
    await db.query('UPDATE users SET foto_profil=$1, updated_at=NOW() WHERE id=$2', [url, req.user.id]);
    res.json({ success: true, url });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// POST /api/guru/upload-dokumen - Upload KTP / Ijazah
// ============================================================
router.post('/upload-dokumen', authMiddleware, requireRole('guru'), uploadDokumen.fields([
  { name: 'ktp', maxCount: 1 },
  { name: 'ijazah', maxCount: 1 }
]), async (req, res) => {
  try {
    const ktp    = req.files?.ktp?.[0]?.path;
    const ijazah = req.files?.ijazah?.[0]?.path;
    await db.query(
      'UPDATE profil_guru SET dokumen_ktp=COALESCE($1,dokumen_ktp), dokumen_ijazah=COALESCE($2,dokumen_ijazah) WHERE user_id=$3',
      [ktp, ijazah, req.user.id]
    );
    res.json({ success: true, message: 'Dokumen berhasil diupload' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================
// GET /api/guru/rekomendasi/ai - AI Rekomendasi (berdasar murid)
// ============================================================
router.get('/rekomendasi/ai', authMiddleware, async (req, res) => {
  try {
    // Ambil preferensi murid
    const murid = await db.query(
      'SELECT tingkat, tujuan, lokasi FROM profil_murid WHERE user_id=$1',
      [req.user.id]
    );

    // Guru yang belum pernah di-booking murid ini, diurutkan by rating
    const result = await db.query(
      `SELECT u.id, u.nama, u.foto_profil,
              pg.spesialisasi, pg.harga_per_sesi, pg.rating_avg,
              pg.lokasi, pg.total_murid, pg.tier
       FROM users u
       JOIN profil_guru pg ON u.id = pg.user_id
       WHERE pg.status_verif = 'verified'
         AND u.id NOT IN (
           SELECT DISTINCT guru_id FROM jadwal WHERE murid_id=$1
         )
       ORDER BY pg.rating_avg DESC, pg.total_murid DESC
       LIMIT 5`,
      [req.user.id]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
