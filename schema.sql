-- ============================================================
-- GURUNGA JI DATABASE SCHEMA - PostgreSQL
-- Jalankan: psql -U postgres -f schema.sql
-- ============================================================

CREATE DATABASE guruNgaji_db;
\c guruNgaji_db;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABEL USERS (Guru + Murid + Admin)
-- ============================================================
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nama          VARCHAR(100) NOT NULL,
  email         VARCHAR(100) UNIQUE NOT NULL,
  password      VARCHAR(255) NOT NULL,
  no_telepon    VARCHAR(20),
  role          VARCHAR(20) NOT NULL CHECK (role IN ('guru', 'murid', 'admin')),
  foto_profil   VARCHAR(500),
  is_verified   BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABEL PROFIL GURU
-- ============================================================
CREATE TABLE profil_guru (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bio             TEXT,
  spesialisasi    VARCHAR(100)[],         -- Array: ['Tahfizh', 'Tajwid', 'Fiqih']
  pengalaman_thn  INTEGER DEFAULT 0,
  harga_per_sesi  INTEGER NOT NULL,       -- dalam Rupiah
  lokasi          VARCHAR(100),
  provinsi        VARCHAR(50),
  lat             DECIMAL(10, 8),
  lng             DECIMAL(11, 8),
  mode_ngajar     VARCHAR(20) CHECK (mode_ngajar IN ('online', 'offline', 'keduanya')),
  status_verif    VARCHAR(20) DEFAULT 'pending' CHECK (status_verif IN ('pending', 'verified', 'rejected')),
  dokumen_ktp     VARCHAR(500),
  dokumen_ijazah  VARCHAR(500),
  tier            VARCHAR(20) DEFAULT 'basic' CHECK (tier IN ('basic', 'silver', 'gold', 'platinum')),
  total_murid     INTEGER DEFAULT 0,
  total_sesi      INTEGER DEFAULT 0,
  rating_avg      DECIMAL(3,2) DEFAULT 0,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABEL PROFIL MURID
-- ============================================================
CREATE TABLE profil_murid (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  usia        INTEGER,
  tingkat     VARCHAR(30) CHECK (tingkat IN ('pemula', 'menengah', 'lanjutan')),
  tujuan      VARCHAR(255),
  lokasi      VARCHAR(100),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABEL JADWAL / BOOKING
-- ============================================================
CREATE TABLE jadwal (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guru_id       UUID REFERENCES users(id),
  murid_id      UUID REFERENCES users(id),
  tanggal       DATE NOT NULL,
  jam_mulai     TIME NOT NULL,
  jam_selesai   TIME NOT NULL,
  mode          VARCHAR(20) CHECK (mode IN ('online', 'offline')),
  link_zoom     VARCHAR(500),
  lokasi_offline VARCHAR(255),
  status        VARCHAR(20) DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'dikonfirmasi', 'selesai', 'dibatalkan')),
  catatan       TEXT,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABEL TRANSAKSI / PEMBAYARAN
-- ============================================================
CREATE TABLE transaksi (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  murid_id        UUID REFERENCES users(id),
  guru_id         UUID REFERENCES users(id),
  jadwal_id       UUID REFERENCES jadwal(id),
  jumlah          INTEGER NOT NULL,           -- total dalam Rupiah
  komisi_platform INTEGER NOT NULL,           -- 20% dari jumlah
  net_guru        INTEGER NOT NULL,           -- jumlah - komisi
  metode_bayar    VARCHAR(30),
  status          VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sukses', 'gagal', 'refund')),
  midtrans_id     VARCHAR(100),               -- ID dari Midtrans
  snap_token      VARCHAR(500),               -- Token Midtrans Snap
  paid_at         TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABEL MATERI PEMBELAJARAN
-- ============================================================
CREATE TABLE materi (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guru_id     UUID REFERENCES users(id),
  judul       VARCHAR(200) NOT NULL,
  deskripsi   TEXT,
  tipe        VARCHAR(20) CHECK (tipe IN ('video', 'audio', 'pdf', 'teks')),
  url_file    VARCHAR(500),
  thumbnail   VARCHAR(500),
  durasi_mnt  INTEGER,
  is_gratis   BOOLEAN DEFAULT FALSE,
  kategori    VARCHAR(50),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABEL PROGRESS MATERI MURID
-- ============================================================
CREATE TABLE progress_materi (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  murid_id    UUID REFERENCES users(id),
  materi_id   UUID REFERENCES materi(id),
  persen      INTEGER DEFAULT 0 CHECK (persen BETWEEN 0 AND 100),
  selesai     BOOLEAN DEFAULT FALSE,
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(murid_id, materi_id)
);

-- ============================================================
-- TABEL ULASAN / REVIEW
-- ============================================================
CREATE TABLE ulasan (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  murid_id    UUID REFERENCES users(id),
  guru_id     UUID REFERENCES users(id),
  jadwal_id   UUID REFERENCES jadwal(id),
  rating      INTEGER CHECK (rating BETWEEN 1 AND 5),
  komentar    TEXT,
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(murid_id, jadwal_id)
);

-- Update rating_avg otomatis saat ada ulasan baru
CREATE OR REPLACE FUNCTION update_rating_guru()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profil_guru
  SET rating_avg = (SELECT AVG(rating) FROM ulasan WHERE guru_id = NEW.guru_id)
  WHERE user_id = NEW.guru_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_rating
AFTER INSERT OR UPDATE ON ulasan
FOR EACH ROW EXECUTE FUNCTION update_rating_guru();

-- ============================================================
-- TABEL FORUM
-- ============================================================
CREATE TABLE forum_post (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id),
  judul       VARCHAR(300) NOT NULL,
  isi         TEXT NOT NULL,
  kategori    VARCHAR(50),
  likes       INTEGER DEFAULT 0,
  views       INTEGER DEFAULT 0,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE forum_reply (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id   UUID REFERENCES forum_post(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES users(id),
  isi       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- TABEL UJIAN
-- ============================================================
CREATE TABLE ujian (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guru_id     UUID REFERENCES users(id),
  judul       VARCHAR(200),
  deskripsi   TEXT,
  durasi_mnt  INTEGER,
  passing_score INTEGER DEFAULT 70,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE soal_ujian (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ujian_id    UUID REFERENCES ujian(id) ON DELETE CASCADE,
  pertanyaan  TEXT NOT NULL,
  pilihan     JSONB,   -- {"a":"...","b":"...","c":"...","d":"..."}
  jawaban     VARCHAR(1),
  poin        INTEGER DEFAULT 1
);

CREATE TABLE hasil_ujian (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  murid_id    UUID REFERENCES users(id),
  ujian_id    UUID REFERENCES ujian(id),
  skor        INTEGER,
  lulus       BOOLEAN,
  selesai_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(murid_id, ujian_id)
);

-- ============================================================
-- TABEL NOTIFIKASI
-- ============================================================
CREATE TABLE notifikasi (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   UUID REFERENCES users(id),
  judul     VARCHAR(200),
  isi       TEXT,
  tipe      VARCHAR(30),  -- 'jadwal', 'materi', 'transaksi', 'sistem'
  is_read   BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES untuk performa query
-- ============================================================
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_profil_guru_user_id ON profil_guru(user_id);
CREATE INDEX idx_profil_guru_provinsi ON profil_guru(provinsi);
CREATE INDEX idx_profil_guru_spesialisasi ON profil_guru USING GIN(spesialisasi);
CREATE INDEX idx_jadwal_guru_id ON jadwal(guru_id);
CREATE INDEX idx_jadwal_murid_id ON jadwal(murid_id);
CREATE INDEX idx_jadwal_tanggal ON jadwal(tanggal);
CREATE INDEX idx_transaksi_status ON transaksi(status);
CREATE INDEX idx_notifikasi_user_id ON notifikasi(user_id, is_read);

-- ============================================================
-- SEED DATA - Admin default
-- ============================================================
-- Password: admin123 (hash bcrypt)
INSERT INTO users (nama, email, password, role, is_verified)
VALUES ('Super Admin', 'admin@guruNgaji.id',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHi',
  'admin', true);
