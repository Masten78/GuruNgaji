// ============================================================
// src/routes/jadwal.js - Booking & Jadwal Les
// ============================================================
const router = require('express').Router();
const db     = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/jadwal - Ambil jadwal user (guru atau murid)
router.get('/', authMiddleware, async (req, res) => {
  const { status, bulan } = req.query;
  const isGuru = req.user.role === 'guru';
  const params = [req.user.id];
  let where = isGuru ? 'j.guru_id = $1' : 'j.murid_id = $1';

  if (status) { params.push(status); where += ` AND j.status = $${params.length}`; }
  if (bulan)  { params.push(bulan);  where += ` AND TO_CHAR(j.tanggal, 'YYYY-MM') = $${params.length}`; }

  try {
    const result = await db.query(
      `SELECT j.*,
              g.nama AS nama_guru, g.foto_profil AS foto_guru,
              m.nama AS nama_murid, m.foto_profil AS foto_murid
       FROM jadwal j
       JOIN users g ON j.guru_id = g.id
       JOIN users m ON j.murid_id = m.id
       WHERE ${where}
       ORDER BY j.tanggal ASC, j.jam_mulai ASC`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/jadwal - Buat booking baru
router.post('/', authMiddleware, requireRole('murid'), async (req, res) => {
  const { guru_id, tanggal, jam_mulai, jam_selesai, mode, catatan } = req.body;
  try {
    // Cek slot tidak bentrok
    const bentrok = await db.query(
      `SELECT id FROM jadwal
       WHERE guru_id=$1 AND tanggal=$2
         AND status IN ('menunggu','dikonfirmasi')
         AND (jam_mulai, jam_selesai) OVERLAPS ($3::TIME, $4::TIME)`,
      [guru_id, tanggal, jam_mulai, jam_selesai]
    );
    if (bentrok.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Jadwal guru sudah terisi' });
    }

    const result = await db.query(
      `INSERT INTO jadwal (guru_id, murid_id, tanggal, jam_mulai, jam_selesai, mode, catatan)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [guru_id, req.user.id, tanggal, jam_mulai, jam_selesai, mode, catatan]
    );

    // Kirim notifikasi ke guru
    await db.query(
      `INSERT INTO notifikasi (user_id, judul, isi, tipe)
       VALUES ($1, 'Booking Baru', 'Ada murid baru yang ingin les dengan Anda', 'jadwal')`,
      [guru_id]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/jadwal/:id/status - Konfirmasi/Batalkan jadwal
router.put('/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body;
  try {
    await db.query(
      'UPDATE jadwal SET status=$1 WHERE id=$2 AND (guru_id=$3 OR murid_id=$3)',
      [status, req.params.id, req.user.id]
    );
    res.json({ success: true, message: `Jadwal ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;


// ============================================================
// src/routes/transaksi.js - Pembayaran via Midtrans
// ============================================================
// Buat file terpisah: src/routes/transaksi.js
const routerTrx = require('express').Router();
const midtrans  = require('midtrans-client');

const snap = new midtrans.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey:    process.env.MIDTRANS_SERVER_KEY,
  clientKey:    process.env.MIDTRANS_CLIENT_KEY,
});

// POST /api/transaksi/create - Buat transaksi dan dapatkan Snap Token
routerTrx.post('/create', authMiddleware, async (req, res) => {
  const { jadwal_id, guru_id } = req.body;
  try {
    // Ambil harga guru
    const guru = await db.query(
      'SELECT harga_per_sesi FROM profil_guru WHERE user_id=$1', [guru_id]
    );
    const harga   = guru.rows[0].harga_per_sesi;
    const komisi  = Math.round(harga * 0.20);
    const netGuru = harga - komisi;

    // Buat order ID unik
    const orderId = `GNGJ-${Date.now()}-${req.user.id.slice(0,8)}`;

    // Ambil data murid
    const murid = await db.query('SELECT nama, email, no_telepon FROM users WHERE id=$1', [req.user.id]);
    const m = murid.rows[0];

    // Buat transaksi Midtrans
    const snapToken = await snap.createTransactionToken({
      transaction_details: { order_id: orderId, gross_amount: harga },
      customer_details: { first_name: m.nama, email: m.email, phone: m.no_telepon },
      item_details: [{ id: jadwal_id, price: harga, quantity: 1, name: 'Les Ngaji 1 Sesi' }],
    });

    // Simpan ke database
    await db.query(
      `INSERT INTO transaksi (murid_id, guru_id, jadwal_id, jumlah, komisi_platform, net_guru, midtrans_id, snap_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.user.id, guru_id, jadwal_id, harga, komisi, netGuru, orderId, snapToken]
    );

    res.json({ success: true, snap_token: snapToken, order_id: orderId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/transaksi/webhook - Notifikasi dari Midtrans
routerTrx.post('/webhook', async (req, res) => {
  try {
    const notif = await snap.transaction.notification(req.body);
    const orderId = notif.order_id;
    const status  = notif.transaction_status;
    const fraud   = notif.fraud_status;

    let dbStatus = 'pending';
    if (status === 'capture' && fraud === 'accept') dbStatus = 'sukses';
    else if (status === 'settlement') dbStatus = 'sukses';
    else if (['cancel','deny','expire'].includes(status)) dbStatus = 'gagal';

    await db.query(
      'UPDATE transaksi SET status=$1, paid_at=NOW() WHERE midtrans_id=$2',
      [dbStatus, orderId]
    );

    // Jika sukses, update jadwal ke dikonfirmasi
    if (dbStatus === 'sukses') {
      await db.query(
        `UPDATE jadwal SET status='dikonfirmasi'
         WHERE id=(SELECT jadwal_id FROM transaksi WHERE midtrans_id=$1)`,
        [orderId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/transaksi/riwayat - Riwayat transaksi user
routerTrx.get('/riwayat', authMiddleware, async (req, res) => {
  try {
    const isGuru = req.user.role === 'guru';
    const result = await db.query(
      `SELECT t.*, 
              g.nama AS nama_guru,
              m.nama AS nama_murid
       FROM transaksi t
       JOIN users g ON t.guru_id = g.id
       JOIN users m ON t.murid_id = m.id
       WHERE ${isGuru ? 't.guru_id' : 't.murid_id'} = $1
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = { jadwalRouter: router, transaksiRouter: routerTrx };
