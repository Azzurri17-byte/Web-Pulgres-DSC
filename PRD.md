# Product Requirements Document — PulGres

**Produk:** Website UKM Developer Student  
**Dokumen:** Persyaratan produk dan alur website saat ini  
**Pembaruan:** 11 November 2026

**Status:** Fitur inti berjalan

## 1. Ringkasan produk

PulGres adalah website untuk mengelola aktivitas belajar dan karya anggota UKM Developer Student. Website menyediakan pendaftaran dengan persetujuan admin, tugas, pengumpulan dan peninjauan submission, modul pembelajaran, project anggota dengan moderasi admin, profil anggota, serta sistem poin dan leaderboard.

Dokumen ini mencatat cakupan produk dan perilaku aplikasi yang saat ini tersedia. Ini bukan rancangan arsitektur untuk implementasi hipotetis.

## 2. Pengguna dan hak akses

Website memiliki empat jenis pengguna dan status akses:

| Pengguna | Kemampuan |
|---|---|
| Pengunjung | Mendaftar atau masuk |
| Pendaftar menunggu persetujuan | Belum dapat masuk atau menggunakan API terautentikasi |
| Anggota aktif | Melihat tugas dan materi terbit, mengirim submission dan project, melihat poin, leaderboard, serta profil |
| Admin | Mengelola akun anggota, tugas, submission, materi, project anggota, dan poin; melihat dashboard admin |

Server memeriksa status akun dan role dari database pada setiap request yang memerlukan autentikasi. Menyembunyikan menu di frontend bukan satu-satunya pembatas akses.

## 3. Alur akun

### 3.1 Pendaftaran

1. Pengunjung mengisi nama tampilan, NIM, username, dan password.
2. Server membuat akun dengan role `member` dan `is_active = FALSE`, beserta profilnya.
3. NIM dan username harus unik. Password disimpan sebagai hash bcrypt.
4. Website memberi tahu pendaftar bahwa akun menunggu persetujuan admin.
5. Pendaftar belum dapat masuk sebelum akun disetujui.

### 3.2 Persetujuan admin

Di menu **Anggota**, admin melihat daftar akun nonaktif yang menunggu persetujuan. Admin dapat:

- **Setujui:** mengaktifkan akun. Anggota lalu dapat masuk.
- **Tolak & hapus:** menghapus permintaan akun dan profil terkait.

Daftar anggota aktif menyediakan tindakan untuk menonaktifkan akun, mengubah password, dan mengatur poin. Admin juga dapat membuat akun melalui endpoint admin; akun yang dibuat lewat jalur ini langsung aktif.

Perubahan default kolom `is_active` tidak menonaktifkan akun yang sudah ada. Database yang telah dibuat sebelumnya perlu menjalankan migrasi `backend/migrations/20261108_pending_member_approval.sql`.

### 3.3 Login

Login menggunakan NIM, username, dan password. Kredensial harus cocok dengan akun aktif. Login yang benar untuk akun nonaktif ditolak dengan pesan bahwa akun menunggu persetujuan atau telah dinonaktifkan. Sesi menggunakan JWT.

## 4. Fitur anggota

### 4.1 Dashboard

Dashboard anggota menampilkan ringkasan poin, peringkat, tugas yang tersedia, submission yang menunggu review, submission terbaru, dan tugas terbaru.

### 4.2 Tugas dan submission

Anggota melihat tugas berstatus `published`, termasuk deskripsi, deadline, maksimal poin, dan status submission dirinya. Anggota dapat mengirim deskripsi pengerjaan, lampiran PDF, atau keduanya. Lampiran bersifat opsional bila deskripsi pengerjaan tersedia.

Submission memiliki status:

- `pending`: menunggu pemeriksaan admin.
- `approved`: disetujui; poin dapat dicatat.
- `revision`: perlu diperbaiki dan dapat dikirim ulang.

Anggota melihat feedback dan status submission miliknya. Anggota tidak dapat melihat submission anggota lain.

### 4.3 Modul pembelajaran

Halaman **Modul belajar** hanya menampilkan materi berstatus `published`. Anggota dapat melihat judul, deskripsi, nama file, ukuran, dan tanggal, lalu mengunduh file. Unduhan diperiksa oleh server; draft dan materi arsip tidak tersedia untuk anggota.

Format file yang diterima:

- PDF (`.pdf`)
- PowerPoint (`.ppt`, `.pptx`)
- Excel (`.xls`, `.xlsx`)

Batas ukuran unggahan adalah 25 MB. File disimpan di `backend/storage/uploads`, bukan disajikan sebagai folder publik.

### 4.4 Poin, leaderboard, dan profil

Anggota dapat melihat total poin, leaderboard, dan profil anggota aktif. Profil sendiri memuat nama tampilan, bio, dan URL avatar; anggota dapat memperbarui profilnya sendiri. Admin juga dapat memperbarui nama tampilan, bio, avatar, serta password akunnya sendiri dari halaman profil.

Perubahan password admin memerlukan konfirmasi key `PWD_KEY` yang dikonfigurasi di `backend/.env`. Backend memverifikasi key sebelum membuka formulir dan memverifikasinya kembali saat password baru disimpan. Password baru minimal 8 dan maksimal 72 byte, lalu disimpan sebagai hash bcrypt.

Poin berasal dari transaksi saat submission disetujui, project anggota diterbitkan oleh admin, atau admin melakukan penyesuaian. Riwayat poin disimpan sebagai transaksi.

Leaderboard memuat jumlah project anggota yang sedang berstatus `published`. Project pending, archived, atau dihapus tidak masuk hitungan. Profil anggota menampilkan daftar project terbit beserta URL project dan repository.

### 4.5 Project anggota

Anggota dapat mengirim project dengan judul, deskripsi, URL project, dan URL repository. Minimal satu dari kedua URL wajib diisi dan harus berupa URL `http` atau `https`. Batas pengiriman adalah tiga project baru per anggota per hari. Project yang ditolak atau kemudian dihapus tetap dihitung pada tanggal pengirimannya; edit, persetujuan, arsip, dan publikasi ulang tidak memakai kuota baru.

Project baru berstatus `pending`. Selama menunggu persetujuan, project hanya terlihat pada daftar milik pengirim dan tidak muncul di profil publik. Anggota belum dapat mengedit, menghapus, mengarsipkan, atau menerbitkan project pending.

Setelah admin menyetujui project, status menjadi `published` dan anggota memperoleh 5 poin. Pemberian poin tercatat satu kali bersama perubahan status. Anggota dapat mengedit dan menghapus project yang telah disetujui serta mengarsipkan atau menerbitkannya kembali. Penghapusan menyembunyikan project dari daftar dan profil, tetapi data tetap dipertahankan untuk menghitung kuota harian.

## 5. Fitur admin

### 5.1 Dashboard

Dashboard admin menampilkan anggota online, tugas aktif, submission yang perlu diperiksa, jumlah anggota aktif, submission terbaru, dan tugas terbaru.

### 5.2 Pengelolaan tugas

Admin dapat membuat tugas berjudul dan berdeskripsi, menetapkan maksimal poin, mengatur deadline, memilih status awal draft atau published, menerbitkan atau mengarsipkan tugas, dan menghapus tugas yang belum memiliki submission.

Status tugas:

- `draft`: hanya terlihat oleh admin.
- `published`: tersedia bagi anggota aktif.
- `archived`: tidak tersedia bagi anggota; dapat diterbitkan kembali.

Deadline yang sudah lewat tidak dapat dipublikasikan sampai deadline diperbarui.

### 5.3 Peninjauan submission

Admin melihat submission anggota, isi dan lampiran, status, serta feedback. Admin dapat menyetujui submission dan menetapkan poin hingga batas maksimal tugas, meminta revisi dengan feedback wajib, atau menghapus submission. Penghapusan submission menyesuaikan transaksi poin terkait.

### 5.4 Pengelolaan anggota

Panel **Anggota** memisahkan permintaan akun nonaktif dari anggota aktif. Admin menyetujui atau menghapus permintaan, menonaktifkan anggota aktif, mengubah password, dan menyesuaikan poin. Akun nonaktif tidak dapat menggunakan endpoint terautentikasi dan tidak dihitung sebagai anggota aktif di dashboard.

### 5.5 Pengelolaan materi

Admin melihat seluruh materi, termasuk draft dan arsip. Admin dapat mengunggah file dengan judul dan deskripsi, memilih untuk menyimpan sebagai draft atau langsung menerbitkan, menerbitkan kembali materi arsip, mengarsipkan materi terbit, mengunduh materi, dan menghapus materi beserta file tersimpannya.

### 5.6 Profil admin

Di halaman profil, admin dapat mengubah password akunnya sendiri setelah memasukkan key konfirmasi `PWD_KEY`. Key hanya diverifikasi di backend dan harus dikirim kembali bersama permintaan simpan password. Jika variabel tersebut belum dikonfigurasi, perubahan password admin tidak tersedia.

### 5.7 Moderasi project anggota

Menu **Proyek anggota** menampilkan project berstatus `pending`, informasi pengirim, deskripsi, serta tautan project dan repository. Admin dapat:

- **Setujui:** mengubah status menjadi `published` dan memberikan 5 poin kepada pengirim. Proses ini hanya berhasil satu kali untuk tiap pengajuan.
- **Tolak & hapus:** menghapus project dari daftar dan profil. Pengajuan tetap dicatat untuk menjaga kuota harian pengirim.

## 6. Notifikasi realtime

Socket.IO mengautentikasi koneksi dengan token. Fitur realtime yang tersedia mencakup daftar anggota online dan notifikasi ketika tugas atau materi baru diterbitkan, submission masuk/dihapus/ditinjau, serta poin diperoleh atau dikurangi.

## 7. Model data

Database menggunakan MySQL dan InnoDB.

| Tabel | Fungsi |
|---|---|
| `users` | Identitas, role, hash password, dan status aktif akun |
| `user_profiles` | Nama tampilan, bio, dan avatar anggota |
| `tasks` | Judul, deskripsi, deadline, poin maksimal, status, dan pembuat |
| `submissions` | Pengumpulan anggota, lampiran, status, feedback, dan reviewer |
| `point_transactions` | Catatan pemberian atau penyesuaian poin |
| `learning_materials` | Materi, metadata file, pengunggah, dan status publikasi |
| `member_projects` | Project anggota, URL project/repository, status moderasi/publikasi, dan penanda penghapusan |

Status utama disimpan sebagai enum di database. Relasi foreign key menjaga hubungan akun, profil, tugas, submission, transaksi poin, materi, dan project anggota.

## 8. API produk

Semua route API memakai prefix `/api`. Route terproteksi memerlukan header `Authorization: Bearer <token>`.

| Kelompok | Operasi penting | Akses |
|---|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Daftar/login publik; sesi untuk pengguna aktif |
| Tasks | `GET /tasks`, `POST /tasks`, `PUT /tasks/:id`, `PATCH /tasks/:id/publish`, `PATCH /tasks/:id/archive`, `DELETE /tasks/:id` | Membaca untuk admin/anggota sesuai status; perubahan admin |
| Submissions | `GET /submissions`, `GET /submissions/my`, `POST /submissions`, `PUT /submissions/:id`, `PATCH /submissions/:id/review`, `DELETE /submissions/:id` | Admin meninjau; anggota mengirim dan mengubah miliknya |
| Anggota | `GET /members?status=pending`, `GET /members?status=active`, `PATCH /members/:id/approve`, `DELETE /members/:id` | Admin |
| Materi | `GET /learning-materials`, `POST /learning-materials`, `PATCH /learning-materials/:id/publish`, `PATCH /learning-materials/:id/archive`, `DELETE /learning-materials/:id`, `GET /learning-materials/:id/download` | Admin mengelola; anggota membaca dan mengunduh materi terbit |
| Poin | `GET /points/me`, `GET /points/history`, `POST /points/adjustment` | Pengguna terautentikasi; perubahan oleh admin |
| Leaderboard | `GET /leaderboard` | Pengguna terautentikasi |
| Project anggota | `GET /member-projects/mine`, `POST /member-projects`, `PATCH /member-projects/:id`, `PATCH /member-projects/:id/status`, `DELETE /member-projects/:id` | Anggota mengirim project dan mengelola project yang disetujui |
| Moderasi project | `GET /member-projects/admin/pending`, `PATCH /member-projects/:id/approve`, `DELETE /member-projects/:id/reject` | Admin; persetujuan memberi 5 poin |
| Profil | `GET /profile`, `PUT /profile`, `GET /members/:id`, `POST /profile/admin/password/verify`, `PATCH /profile/admin/password` | Pengguna mengelola profil sendiri dan melihat profil anggota dengan project terbit; endpoint ubah password khusus admin dan memerlukan `PWD_KEY` |

Daftar memakai pagination. Endpoint yang sensitif memeriksa role, status akun, kepemilikan data, dan status publikasi di backend.

## 9. Antarmuka dan navigasi

Halaman publik: login dan registrasi. Setelah masuk, navigasi bersama mencakup Ringkasan, Tugas, Modul belajar, Submission, Leaderboard, dan Profil. Menu **Project saya** tersedia untuk anggota; menu **Proyek anggota** dan **Anggota** hanya tersedia untuk admin. Anggota diarahkan kembali dari route khusus admin.

Antarmuka dibangun responsif untuk desktop dan mobile. Daftar dan tabel dapat digulir pada layar sempit.

## 10. Teknologi dan struktur aplikasi

- Frontend: React 19, Vite, React Router, Axios.
- Backend: Node.js 18+, Express 5, Socket.IO, Multer.
- Database: MySQL melalui `mysql2`.
- Autentikasi: JWT dan bcrypt.

Source frontend berada di `frontend/src`. Backend menyimpan route, autentikasi, middleware, koneksi database, dan utilitas di `backend/src`. `backend/schema.sql` digunakan untuk instalasi baru; migrasi perubahan skema ada di `backend/migrations`.

Dalam development, Vite berjalan di port 5173 dan meneruskan `/api` serta Socket.IO ke backend di port 3000. `VITE_API_URL` dapat diatur untuk alamat API yang berbeda. `FRONTEND_URL` mengatur origin frontend yang diizinkan backend.

## 11. Persyaratan kualitas dan keamanan

- Password tidak pernah disimpan dalam bentuk teks.
- Perubahan password admin memerlukan `PWD_KEY` yang diverifikasi di backend.
- Role dan status aktif diverifikasi di backend untuk setiap request terproteksi.
- Admin-only operation tidak boleh bergantung hanya pada tampilan frontend.
- Query database menggunakan parameter.
- File upload memvalidasi ekstensi dan isi file, membatasi ukuran, serta menyimpan nama file acak.
- File submission dan materi diunduh lewat endpoint yang menerapkan autentikasi dan otorisasi.
- Penghapusan dan perubahan poin harus menjaga integritas foreign key dan transaksi database.
- Origin frontend dibatasi melalui konfigurasi CORS.

## 12. Di luar cakupan saat ini

Website saat ini tidak menyediakan diskusi atau komentar pada tugas, notifikasi email, export laporan, ranking bulanan, kelompok belajar, atau sistem otomatis untuk memverifikasi status keanggotaan UKM. Persetujuan pendaftar dilakukan oleh admin berdasarkan pemeriksaan manual.
