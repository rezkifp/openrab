# OpenRAB — Aplikasi Penyusun RAB & BoQ Arsitektur

**OpenRAB** adalah aplikasi penyusun **Rencana Anggaran Biaya (RAB)**, **Bill of Materials (BOM)**, **Kurva S**, dan **Berita Acara Pekerjaan Tambah Kurang (BAPTK)** yang dirancang khusus untuk **Arsitek, Quantity Surveyor (QS), dan Kontraktor** agar dapat bekerja cepat, akurat, dan rapi di komputer lokal Anda sendiri.

---

## Fitur Utama

- **Kalkulator Feasibility & Auto-RAB**: Hitung estimasi pagu anggaran proyek per m² (1–3+ lantai) saat meeting awal dengan klien, lalu buat struktur WBS proyek secara otomatis.
- **Takeoff & Sub-Takeoff Presisi**: Hitung volume pekerjaan (Persegi/Dinding, Trapesium, Atap Limas/Pelana, hingga Pembesian/Rebar) lengkap dengan pengurang bukaan pintu/jendela.
- **Analisa Harga Satuan (AHSP) & BOM Otomatis**: Setiap baris pekerjaan otomatis memecah kebutuhan material (bata, semen, pasir, dll.) dan tenaga kerja (pekerja, tukang, mandor).
- **Rekapitulasi Divisi & Kurva S**: Atur jadwal pelaksanaan mingguan tiap divisi WBS dan lihat grafik Kurva S serta arus kas mingguan secara langsung.
- **Multi-Mode Export (Excel & PDF)**:
  - **Mode Internal QS**: Laporan lengkap dengan rincian analisa dan OHP.
  - **Mode Versi Klien (OE)**: Laporan bersih untuk pemilik proyek tanpa membocorkan resep koefisien internal.
  - **Mode Blank BoQ Tender**: Spreadsheet Excel berumus dengan kolom harga kosong untuk diisi kontraktor peserta lelang.
  - **Mode BAPTK**: Berita Acara Pekerjaan Tambah Kurang lengkap dengan kolom tanda tangan 3 pihak.
- **Value Engineering & Addendum (VO)**: Gandakan proyek yang sudah dikunci (*Finalized*) untuk membandingkan selisih biaya tambah/kurang di lapangan.
- **Pintasan Keyboard Cepat**: Navigasi antar tab dan export dokumen lebih cepat menggunakan keyboard.

---

## Cara Pakai (Pilih Salah Satu)

### Cara 1: Aplikasi Desktop Windows (`.exe`) — Paling Mudah
Tidak perlu install Node.js, PostgreSQL, atau buka terminal sama sekali:
1. Buka menu **Releases** di sebelah kanan halaman GitHub ini.
2. Unduh file **`OpenRAB-Setup-1.2.0.exe`**.
3. Klik 2x file tersebut untuk install, lalu buka **OpenRAB** dari Desktop atau Start Menu. Semua data proyek tersimpan otomatis secara lokal di komputer Anda.

---

### Cara 2: Menjalankan dari Source Code (Untuk Developer / Mode Web)

#### 1. Siapkan 2 Aplikasi Pendukung (Gratis)
Pastikan komputer Anda sudah terpasang:
1. **Node.js** (versi 18 ke atas) — Unduh di [nodejs.org](https://nodejs.org) (pilih tombol **LTS**, lalu install seperti biasa).
2. **PostgreSQL** (database lokal) — Unduh di [postgresql.org](https://www.postgresql.org/download/) (ingat *password* yang Anda buat saat proses instalasi).

### 2. Unduh Aplikasi OpenRAB
- Klik tombol hijau **`<> Code`** di halaman GitHub ini, lalu pilih **`Download ZIP`**.
- Ekstrak file ZIP tersebut ke folder pilihan Anda (misalnya `D:\OpenRAB`).

### 3. Atur Koneksi Database
1. Buka folder `OpenRAB` yang sudah diekstrak.
2. Cari file bernama `.env.example`, lalu **salin (copy)** dan ubah namanya menjadi **`.env`**.
3. Buka file `.env` menggunakan Notepad, lalu sesuaikan isinya dengan password PostgreSQL Anda:
   ```env
   DATABASE_URL=postgresql://postgres:PASSWORD_ANDA@localhost:5432/openrab
   ```
   *(Pastikan Anda sudah membuat database kosong bernama `openrab` di pgAdmin / PostgreSQL).*

### 4. Jalankan Perintah Persiapan (Sekali Saja)
Buka **Terminal / Command Prompt / PowerShell** di dalam folder `OpenRAB`, lalu ketik perintah berikut secara berurutan:

```bash
npm install
npm run db:migrate
npm run db:seed
```
> - `npm install`: Mengunduh komponen aplikasi.
> - `npm run db:migrate`: Membuat tabel database secara otomatis.
> - `npm run db:seed`: Mengisi data master harga material, upah, dan resep AHSP SNI awal.

### 5. Mulai Gunakan OpenRAB
**Cara Paling Mudah (Tanpa Terminal):**
- Cukup **klik 2x (double-click)** file **`Buka-OpenRAB.bat`** di dalam folder `OpenRAB`.
- Aplikasi akan menyala dan browser otomatis terbuka di **http://localhost:3000**.

*(Atau jika lewat Terminal, ketik `npm run dev` lalu buka http://localhost:3000).*

---

## Pintasan Keyboard (Shortcuts)

Tekan tombol **`?`** di dalam workspace proyek untuk membuka/mengatur pintasan keyboard:

| Pintasan | Fungsi |
| :--- | :--- |
| `Alt + 1` | Buka Tab **Takeoff & RAB** |
| `Alt + 2` | Buka Tab **Bill of Materials (BOM)** |
| `Alt + 3` | Buka Tab **Rekapitulasi & Kurva S** |
| `Alt + 4` | Buka Tab **Value Engineering & Addendum** |
| `Ctrl + E` | **Export Excel (.xlsx)** sesuai mode aktif |
| `Ctrl + P` | **Export PDF (.pdf)** sesuai mode aktif |
| `?` | Buka / Tutup **Pengaturan Pintasan Keyboard** |
| `Esc` | Tutup dialog |
