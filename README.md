# SIMOPAS v2.0

Sistem Monitoring Pajak & Service Kendaraan Dinas — terhubung Supabase database & autentikasi.

## Struktur File

```
.
├── index.html      # Halaman login
├── app.html        # Dashboard utama (perlu login)
├── config.js       # Kredensial Supabase (WAJIB DIISI)
└── schema.sql      # Database schema untuk Supabase
```

## Setup Singkat

1. **Daftar Supabase** di [supabase.com](https://supabase.com)
2. **Buat project** baru, simpan database password
3. **Jalankan `schema.sql`** di SQL Editor Supabase
4. **Edit `config.js`** isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY`
5. **Buat akun admin** di Authentication > Users > Add User
6. **Push ke GitHub**, Vercel akan auto-deploy

Tutorial lengkap ada di file `Tutorial-Setup-Supabase-SIMOPAS.docx`.

## Fitur

- Dashboard responsive (desktop + mobile)
- Database PostgreSQL cloud (Supabase)
- Autentikasi email/password
- Row Level Security (data aman, hanya admin login yang bisa akses)
- 5 jenis asal hibah: Ditjenim, Kanim Sampit, Kanim Palangkaraya, Kanim Kobar, Kanwil Kemenkum
- Tracking pajak tahunan, STNK 5-tahunan, service kilometer
- Filter status: Aktif, Akan Mati, Pajak Mati, Service Due
- Search live: plat, nama PJ, no STNK

## Roadmap

- [x] Dashboard UI lengkap
- [x] Database Supabase
- [x] Login admin
- [ ] Telegram Bot notifikasi (Bagian 3)
- [ ] WhatsApp gateway (Bagian 4)
- [ ] Cron job harian via GitHub Actions (Bagian 3)

## Tech Stack

- Frontend: HTML + CSS + Vanilla JavaScript
- Database: PostgreSQL via Supabase
- Hosting: Vercel
- Notifikasi: Telegram Bot API (gratis)
