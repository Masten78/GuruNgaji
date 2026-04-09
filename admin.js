// ============================================================
// src/routes/admin.js - Admin Panel API
// ============================================================
const router = require('express').Router();
const db     = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

const adminOnly = [authMiddleware, requireRole('admin')];

// GET /api/admin/dashboard - Statistik utama
router.get('/dashboard', ...adminOnly, async (req, res) => {
  try {
    const [guru, murid, transaksi, revenue] = await Promise.all([
      db.query("SELECT COUNT(*) FROM users WHERE role='guru' AND is_active=true"),
      db.query("SELECT COUNT(*) FROM users WHERE role='murid' AND is_active=true"),
      db.query("SELECT COUNT(*) FROM transaksi WHERE status='sukses'"),
      db.query("SELECT COALESCE(SUM(jumlah),0) AS total, COALESCE(SUM(komisi_platform),0) AS komisi FROM transaksi WHERE status='sukses' AND DATE_TRUNC('month', paid_at)=DATE_TRUNC('month', NOW())"),
    ]);

    res.json({
      success: true,
      data: {
        total_guru:   parseInt(guru.rows[0].count),
        total_murid:  parseInt(murid.rows[0].count),
        total_transaksi: parseInt(transaksi.rows[0].count),
        revenue_bulan: parseInt(revenue.rows[0].total),
        komisi_bulan:  parseInt(revenue.rows[0].komisi),
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/guru-pending - Guru menunggu verifikasi
router.get('/guru-pending', ...adminOnly, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.nama, u.email, u.created_at,
              pg.spesialisasi, pg.lokasi, pg.dokumen_ktp, pg.dokumen_ijazah
       FROM users u
       JOIN profil_guru pg ON u.id = pg.user_id
       WHERE pg.status_verif = 'pending'
       ORDER BY u.created_at ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/verifikasi/:id - Verifikasi/Tolak guru
router.put('/verifikasi/:id', ...adminOnly, async (req, res) => {
  const { action } = req.body; // 'verified' atau 'rejected'
  try {
    await db.query(
      'UPDATE profil_guru SET status_verif=$1 WHERE user_id=$2',
      [action, req.params.id]
    );

    // Kirim notifikasi ke guru
    const msg = action === 'verified'
      ? 'Selamat! Akun Anda telah diverifikasi. Mulai terima murid sekarang.'
      : 'Maaf, verifikasi akun Anda ditolak. Hubungi admin untuk info lebih lanjut.';

    await db.query(
      `INSERT INTO notifikasi (user_id, judul, isi, tipe)
       VALUES ($1, 'Status Verifikasi', $2, 'sistem')`,
      [req.params.id, msg]
    );

    res.json({ success: true, message: `Guru berhasil ${action}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/toggle-user/:id - Aktif/nonaktifkan user
router.put('/toggle-user/:id', ...adminOnly, async (req, res) => {
  try {
    await db.query(
      'UPDATE users SET is_active = NOT is_active WHERE id=$1', [req.params.id]
    );
    res.json({ success: true, message: 'Status user diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/transaksi - Semua transaksi + filter
router.get('/transaksi', ...adminOnly, async (req, res) => {
  const { status, bulan, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  let where = '';

  if (status) { params.push(status); where += `WHERE t.status=$${params.length}`; }
  if (bulan)  {
    params.push(bulan);
    where += where ? ` AND ` : 'WHERE ';
    where += `TO_CHAR(t.created_at,'YYYY-MM')=$${params.length}`;
  }

  try {
    const result = await db.query(
      `SELECT t.*, g.nama AS nama_guru, m.nama AS nama_murid
       FROM transaksi t
       JOIN users g ON t.guru_id=g.id
       JOIN users m ON t.murid_id=m.id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/laporan/revenue - Laporan revenue per bulan
router.get('/laporan/revenue', ...adminOnly, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT TO_CHAR(paid_at,'YYYY-MM') AS bulan,
              SUM(jumlah) AS total,
              SUM(komisi_platform) AS komisi,
              COUNT(*) AS jumlah_transaksi
       FROM transaksi
       WHERE status='sukses'
       GROUP BY TO_CHAR(paid_at,'YYYY-MM')
       ORDER BY bulan DESC
       LIMIT 12`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;


// ============================================================
// src/routes/materi.js - Upload & Kelola Materi
// ============================================================
const routerMateri = require('express').Router();
const { uploadMateri } = require('../config/cloudinary');
const nodemailer = require('nodemailer');

// GET /api/materi - List materi (dengan filter)
routerMateri.get('/', async (req, res) => {
  const { tipe, kategori, guru_id } = req.query;
  const params = [];
  let where = ['m.id IS NOT NULL'];

  if (tipe)     { params.push(tipe);     where.push(`m.tipe=$${params.length}`); }
  if (kategori) { params.push(kategori); where.push(`m.kategori=$${params.length}`); }
  if (guru_id)  { params.push(guru_id);  where.push(`m.guru_id=$${params.length}`); }

  try {
    const result = await db.query(
      `SELECT m.*, u.nama AS nama_guru, u.foto_profil AS foto_guru
       FROM materi m JOIN users u ON m.guru_id=u.id
       WHERE ${where.join(' AND ')}
       ORDER BY m.created_at DESC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/materi/upload - Upload materi baru
routerMateri.post('/upload', authMiddleware, requireRole('guru'),
  uploadMateri.single('file'), async (req, res) => {
  const { judul, deskripsi, tipe, durasi_mnt, is_gratis, kategori } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO materi (guru_id, judul, deskripsi, tipe, url_file, durasi_mnt, is_gratis, kategori)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, judul, deskripsi, tipe, req.file.path, durasi_mnt, is_gratis, kategori]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/materi/kirim-email - Kirim materi ke email murid
routerMateri.post('/kirim-email', authMiddleware, async (req, res) => {
  const { email_tujuan, materi_id } = req.body;
  try {
    const materi = await db.query('SELECT * FROM materi WHERE id=$1', [materi_id]);
    const m = materi.rows[0];

    const transporter = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: `"GuruNgaji" <${process.env.EMAIL_USER}>`,
      to: email_tujuan,
      subject: `Materi: ${m.judul}`,
      html: `
        <h2>Materi Belajar GuruNgaji</h2>
        <h3>${m.judul}</h3>
        <p>${m.deskripsi}</p>
        <a href="${m.url_file}" style="background:#0d6e4e;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;">
          Download / Buka Materi
        </a>
        <p style="margin-top:20px;color:#666;">Semoga bermanfaat. Jazakallah khair 🙏</p>
      `
    });

    res.json({ success: true, message: 'Materi berhasil dikirim ke email' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/materi/progress - Update progress belajar murid
routerMateri.put('/progress', authMiddleware, requireRole('murid'), async (req, res) => {
  const { materi_id, persen } = req.body;
  try {
    await db.query(
      `INSERT INTO progress_materi (murid_id, materi_id, persen, selesai)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (murid_id, materi_id)
       DO UPDATE SET persen=$3, selesai=$4, updated_at=NOW()`,
      [req.user.id, materi_id, persen, persen >= 100]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = { adminRouter: router, materiRouter: routerMateri };
