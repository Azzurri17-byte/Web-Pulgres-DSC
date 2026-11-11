# PulGres

PulGres adalah website untuk mendukung kegiatan UKM Developer Student. Anggota dapat mengakses tugas dan materi belajar, mengirim hasil pengerjaan, mempublikasikan project setelah persetujuan admin, serta memantau poin dan leaderboard. Admin mengelola akses anggota, tugas, submission, project anggota, dan materi pembelajaran.

Dokumen kebutuhan produk dan roadmap tersedia di [PRD.md](PRD.md).

## Fitur

### Akun dan akses

- Pendaftaran publik membuat akun anggota berstatus menunggu persetujuan.
- Akun baru belum dapat masuk sampai admin menyetujuinya.
- Admin dapat menyetujui atau menolak dan menghapus permintaan akun melalui menu **Anggota**.
- Akun yang sudah aktif dapat dinonaktifkan oleh admin.
- Admin dan anggota menggunakan halaman login yang sama.

### Tugas dan submission

- Admin membuat, menerbitkan, mengarsipkan, dan menghapus tugas.
- Anggota melihat tugas terbit dan mengirim deskripsi atau lampiran PDF.
- Admin memeriksa submission, menyetujui atau meminta revisi, memberi feedback, dan mencatat poin.

### Materi pembelajaran

- Admin mengunggah materi PDF, PowerPoint (`.ppt`/`.pptx`), dan Excel (`.xls`/`.xlsx`), lalu menerbitkan, mengarsipkan, atau menghapusnya.
- Admin dapat melihat semua status materi.
- Anggota hanya melihat dan mengunduh materi yang sudah diterbitkan.
- File divalidasi di backend dan dibatasi maksimal 25 MB.

### Project anggota

- Anggota mengirim project dengan judul, deskripsi, dan minimal satu URL project atau repository yang valid.
- Setiap anggota dapat mengirim maksimal tiga project baru per hari. Project baru berstatus `pending` dan tidak tampil di profil sebelum disetujui admin.
- Admin meninjau pengajuan di menu **Proyek anggota**, lalu menyetujui atau menolak dan menghapusnya.
- Persetujuan menerbitkan project dan memberi anggota 5 poin satu kali.
- Setelah disetujui, anggota dapat mengedit, menghapus, mengarsipkan, dan menerbitkan kembali project miliknya. Perubahan tersebut tidak menggunakan kuota kiriman harian.
- Profil anggota menampilkan project yang sedang berstatus `published`. Leaderboard juga menampilkan jumlah project terbit.
- Project yang dihapus disembunyikan dari daftar tetapi tetap dicatat agar penghapusan tidak mengembalikan slot kuota harian.

### Poin dan aktivitas

- Anggota melihat profil, total poin, dan leaderboard.
- Admin dapat mengubah passwordnya sendiri dari halaman profil setelah mengonfirmasi key `PWD_KEY`.
- Admin dapat menyesuaikan poin anggota.
- Dashboard menampilkan ringkasan aktivitas dan anggota online.
- Socket.IO mengirim pembaruan aktivitas secara realtime.

## Hak akses

| Fitur | Admin | Anggota aktif |
|---|---|---|
| Melihat dashboard dan leaderboard | Ya | Ya |
| Mengelola tugas | Ya | Tidak |
| Mengirim submission | Tidak | Ya |
| Meninjau submission dan poin | Ya | Tidak |
| Mengelola akun dan persetujuan pendaftar | Ya | Tidak |
| Mengelola materi pembelajaran | Ya | Tidak |
| Melihat dan mengunduh materi terbit | Ya | Ya |
| Mengirim project untuk persetujuan | Tidak | Ya, maksimal 3 per hari |
| Meninjau project anggota dan memberi 5 poin saat menyetujui | Ya | Tidak |
| Mengelola project milik sendiri yang sudah disetujui | Tidak | Ya |
| Melihat project terbit di profil dan jumlahnya di leaderboard | Ya | Ya |

Permintaan akun yang belum disetujui tidak dapat menggunakan endpoint terautentikasi.

## Teknologi

- Frontend: React 19, Vite, React Router, Axios.
- Backend: Node.js, Express 5, Socket.IO, Multer.
- Database: MySQL dengan `mysql2`.
- Autentikasi: JWT dan bcrypt.

## Menjalankan secara lokal

Persyaratan: Node.js 18 atau lebih baru, npm, dan MySQL.

### 1. Siapkan database

Buat database yang namanya sesuai `DB_NAME` di `backend/.env`, lalu jalankan skema:

```sh
mysql -u root -p web_pulgres < backend/schema.sql
```

Sesuaikan `web_pulgres` dengan nama database yang digunakan. Untuk database yang sudah ada, jalankan migrasi yang belum pernah diterapkan:

```sh
mysql -u root -p web_pulgres < backend/migrations/20261108_pending_member_approval.sql
mysql -u root -p web_pulgres < backend/migrations/20261108_learning_material_optional_files.sql
mysql -u root -p web_pulgres < backend/migrations/20261109_learning_material_url_optional.sql
mysql -u root -p web_pulgres < backend/migrations/20261111_member_project_soft_delete.sql
mysql -u root -p web_pulgres < backend/migrations/20261111_member_project_approval.sql
```

Migrasi persetujuan akun mengubah nilai default `is_active` menjadi `FALSE`; status akun yang sudah tersimpan tidak diubah. Migrasi materi membuat file dan URL modul opsional. Migrasi project menambahkan penanda penghapusan dan mengubah project baru ke status menunggu persetujuan. Jalankan setiap migrasi hanya satu kali dan lewati migrasi yang sudah diterapkan. Pendaftaran publik menetapkan akun baru sebagai nonaktif secara eksplisit.

### 2. Konfigurasi dan jalankan backend

```sh
cd backend
cp .env.example .env
```

Isi `backend/.env` dengan konfigurasi MySQL dan `SECRET_KEY` yang kuat. Variabel yang tersedia meliputi `PORT`, `FRONTEND_URL`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, data admin awal (`ADMIN_USERNAME`, `ADMIN_NIM`, `ADMIN_DISPLAY_NAME`, `ADMIN_PASSWORD`), dan `PWD_KEY`. Tetapkan `PWD_KEY` sebagai key rahasia untuk konfirmasi perubahan password admin; jangan gunakan nilai contoh dari `.env.example` di production.

Buat akun admin pertama, lalu jalankan server:

```sh
npm install
npm run seed:admin
npm run dev
```

Backend berjalan pada port `3000` secara default. Akun admin yang dibuat melalui seed langsung aktif.

### 3. Jalankan frontend

Di terminal lain:

```sh
cd frontend
npm install
npm run dev
```

Buka alamat Vite yang ditampilkan, biasanya `http://localhost:5173`. Pada mode development, Vite meneruskan `/api` dan Socket.IO ke backend lokal di port `3000`, sehingga `VITE_API_URL` tidak wajib diisi.

Untuk frontend yang menggunakan server API berbeda, atur `VITE_API_URL`, misalnya `http://localhost:3000/api`, lalu bangun ulang frontend. Atur `FRONTEND_URL` pada backend ke origin frontend yang diizinkan; untuk beberapa origin, pisahkan dengan koma.

## Struktur proyek

```text
backend/
├── migrations/       # Migrasi SQL untuk database yang sudah ada
├── scripts/          # Utilitas, termasuk pembuatan admin awal
├── src/auth/         # Login dan registrasi
├── src/lib/          # Koneksi database dan konfigurasi upload
├── src/middleware/   # Verifikasi token dan role
├── src/routes/       # Endpoint API
├── src/utils/        # Socket.IO dan helper response
├── schema.sql        # Skema database untuk instalasi baru
└── server.js         # HTTP server dan Socket.IO

frontend/
└── src/
    ├── App.jsx       # Halaman, navigasi, dan alur UI
    ├── api.js        # Klien API
    └── *.css         # Gaya halaman dan komponen
```

File unggahan disimpan di `backend/storage/uploads` dan diunduh melalui endpoint terautentikasi. Jangan mengekspos direktori tersebut sebagai folder publik.

## Endpoint utama

Semua endpoint API memakai prefix `/api`.

| Kelompok | Endpoint | Akses utama |
|---|---|---|
| Autentikasi | `/auth/register`, `/auth/login`, `/auth/me` | Registrasi/login publik; sesi perlu autentikasi |
| Tugas | `/tasks` | Daftar untuk admin/anggota; perubahan oleh admin |
| Submission | `/submissions` | Anggota mengirim submission; admin meninjau |
| Anggota | `/members` | Admin melihat, menyetujui, mengaktifkan, dan mengelola akun |
| Materi | `/learning-materials` | Admin mengelola; anggota membaca daftar materi terbit |
| Project anggota | `/member-projects` | Anggota mengirim dan mengelola project miliknya setelah disetujui; admin meninjau pengajuan |
| Poin | `/points` | Anggota melihat poin sendiri; admin melakukan penyesuaian |
| Leaderboard | `/leaderboard` | Admin dan anggota aktif |
| Profil | `/profile` | Pengguna terautentikasi mengelola profilnya sendiri; admin mengonfirmasi `PWD_KEY` untuk mengganti password |

Perubahan password admin memakai `POST /api/profile/admin/password/verify` untuk mengonfirmasi key dan `PATCH /api/profile/admin/password` untuk menyimpan password baru. Kedua endpoint memerlukan sesi admin, dan backend memeriksa `PWD_KEY` pada keduanya.

Endpoint unduhan materi adalah `GET /api/learning-materials/:id/download`. Endpoint tersebut memeriksa status publikasi dan sesi pengguna.

Project anggota dikelola melalui `GET /api/member-projects/mine`, `POST /api/member-projects`, `PATCH/DELETE /api/member-projects/:id`, dan `PATCH /api/member-projects/:id/status`. Admin menggunakan `GET /api/member-projects/admin/pending`, `PATCH /api/member-projects/:id/approve`, dan `DELETE /api/member-projects/:id/reject`. API memeriksa role, kepemilikan, status persetujuan, URL, dan kuota harian di backend.

## Keamanan

- Endpoint terlindungi memverifikasi token dan status aktif akun di database.
- Perubahan akun, tugas, submission, materi, dan poin dibatasi berdasarkan role.
- Password disimpan sebagai hash bcrypt.
- Penggantian password admin dilindungi oleh key `PWD_KEY` yang hanya diperiksa di backend.
- Query menggunakan parameter dan file unduhan disajikan melalui endpoint terautentikasi.
- Di production, isi `FRONTEND_URL` dengan origin website yang diizinkan dan set `VITE_API_URL` sesuai alamat API.
