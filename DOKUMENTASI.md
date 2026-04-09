# ============================================================
# GURUNGA JI BACKEND - Dokumentasi Lengkap
# ============================================================

## 🚀 CARA INSTALL & JALANKAN

### 1. Install dependencies
```bash
cd guruNgaji-backend
npm install
```

### 2. Setup database
```bash
# Install PostgreSQL dulu jika belum ada
# Lalu jalankan schema:
psql -U postgres -f schema.sql
```

### 3. Setup environment
```bash
cp .env.example .env
# Edit .env sesuai konfigurasi kamu
```

### 4. Jalankan server
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

---

## 📡 API ENDPOINTS LENGKAP

Base URL: `https://api.guruNgaji.id/api`

---

### 🔐 AUTH
| Method | Endpoint              | Deskripsi                |
|--------|-----------------------|--------------------------|
| POST   | /auth/register        | Daftar akun baru         |
| POST   | /auth/login           | Login                    |
| GET    | /auth/me              | Data user aktif          |
| PUT    | /auth/ganti-password  | Ganti password           |

**Contoh Register:**
```json
POST /auth/register
{
  "nama": "Ahmad Fauzan",
  "email": "ahmad@email.com",
  "password": "password123",
  "no_telepon": "08123456789",
  "role": "murid"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5...",
  "user": { "id": "uuid", "nama": "Ahmad Fauzan", "role": "murid" }
}
```

---

### 👳 GURU
| Method | Endpoint                    | Deskripsi                      |
|--------|-----------------------------|--------------------------------|
| GET    | /guru                       | Cari guru (dengan filter)      |
| GET    | /guru/:id                   | Detail profil + ulasan         |
| PUT    | /guru/profil                | Update profil guru (auth)      |
| POST   | /guru/upload-foto           | Upload foto profil             |
| POST   | /guru/upload-dokumen        | Upload KTP & Ijazah            |
| GET    | /guru/rekomendasi/ai        | Rekomendasi AI untuk murid     |

**Query Params Cari Guru:**
```
GET /guru?provinsi=jawa+barat&spesialisasi=tajwid&min=50000&max=200000&rating=4&page=1
```

---

### 📅 JADWAL
| Method | Endpoint              | Deskripsi                    |
|--------|-----------------------|------------------------------|
| GET    | /jadwal               | Ambil jadwal user            |
| POST   | /jadwal               | Buat booking baru (murid)    |
| PUT    | /jadwal/:id/status    | Update status jadwal         |

---

### 💳 TRANSAKSI
| Method | Endpoint                | Deskripsi                      |
|--------|-------------------------|--------------------------------|
| POST   | /transaksi/create       | Buat transaksi + Snap Token    |
| POST   | /transaksi/webhook      | Webhook dari Midtrans          |
| GET    | /transaksi/riwayat      | Riwayat transaksi user         |

**Flow Pembayaran:**
```
1. POST /transaksi/create → dapat snap_token
2. Frontend buka Midtrans Snap dengan snap_token
3. User bayar (GoPay/OVO/BCA/QRIS)
4. Midtrans kirim webhook ke /transaksi/webhook
5. Status otomatis update
```

---

### 📚 MATERI
| Method | Endpoint              | Deskripsi                      |
|--------|-----------------------|--------------------------------|
| GET    | /materi               | List materi                    |
| POST   | /materi/upload        | Upload materi baru (guru)      |
| POST   | /materi/kirim-email   | Kirim materi ke email          |
| PUT    | /materi/progress      | Update progress murid          |

---

### 👑 ADMIN
| Method | Endpoint                  | Deskripsi                    |
|--------|---------------------------|------------------------------|
| GET    | /admin/dashboard          | Statistik utama              |
| GET    | /admin/guru-pending       | Guru menunggu verifikasi     |
| PUT    | /admin/verifikasi/:id     | Verifikasi/tolak guru        |
| PUT    | /admin/toggle-user/:id    | Aktif/nonaktifkan user       |
| GET    | /admin/transaksi          | Semua transaksi              |
| GET    | /admin/laporan/revenue    | Laporan revenue bulanan      |

---

## 🔐 CARA PAKAI TOKEN JWT

Setelah login, simpan token di app. Kirim di setiap request yang butuh auth:

```javascript
// React Native / Flutter
const response = await fetch('https://api.guruNgaji.id/api/jadwal', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

---

## ☁️ SKEMA KOMISI PLATFORM

| Tier     | Syarat          | Komisi |
|----------|-----------------|--------|
| Basic    | 0-49 murid      | 20%    |
| Silver   | 50-99 murid     | 15%    |
| Gold     | 100-199 murid   | 12%    |
| Platinum | 200+ murid      | 10%    |

---

## 🌐 DEPLOY KE PRODUCTION

### Rekomendasi: Railway.app (mudah, gratis untuk mulai)

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Inisialisasi project
railway init

# 4. Set environment variables di Railway dashboard

# 5. Deploy
railway up
```

### Alternatif: VPS (DigitalOcean / Niagahoster)
```bash
# Install PM2 untuk process manager
npm install -g pm2

# Jalankan dengan PM2
pm2 start src/app.js --name guruNgaji-api
pm2 save
pm2 startup
```

### Database: Supabase (PostgreSQL gratis)
- Buat akun di supabase.com
- Buat project baru
- Copy connection string ke .env

---

## 📱 INTEGRASI KE REACT NATIVE

```javascript
// services/api.js
const BASE_URL = 'https://api.guruNgaji.id/api';

export const api = {
  login: (data) => 
    fetch(`${BASE_URL}/auth/login`, { method:'POST', body:JSON.stringify(data), headers:{'Content-Type':'application/json'} }),
  
  cariGuru: (params) => 
    fetch(`${BASE_URL}/guru?${new URLSearchParams(params)}`),
  
  booking: (data, token) => 
    fetch(`${BASE_URL}/jadwal`, { 
      method:'POST', 
      body:JSON.stringify(data), 
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`} 
    }),
};
```

---

## 🛠️ TECH STACK LENGKAP GURUNGA JI

```
📱 Mobile App     → React Native (Android/iOS)
🖥️  Admin Panel   → React.js
⚙️  Backend API   → Node.js + Express
🗄️  Database      → PostgreSQL
☁️  File Storage  → Cloudinary
💳  Payment       → Midtrans (GoPay, OVO, BCA, QRIS)
🔐  Auth          → JWT
📧  Email         → Nodemailer + Gmail SMTP
🚀  Deploy        → Railway / VPS + PM2
🌐  DNS/SSL       → Cloudflare
```
