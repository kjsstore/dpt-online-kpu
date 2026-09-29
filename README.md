# 🎯 DPT ONLINE KPU BOT

Bot otomatis untuk **Cek DPT (Daftar Pemilih Tetap) Online KPU** via WhatsApp + Telegram.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-green)
![License](https://img.shields.io/badge/license-MIT-yellow)

---

## 📌 Tentang Bot

Bot ini dibuat untuk **mempermudah cek DPT KPU secara massal** — upload file Excel berisi NIK, bot akan cek otomatis satu per satu, dan hasilnya dikirim kembali dalam bentuk Excel.

**OTP dari KPU otomatis terdeteksi** dan terisi ke browser, jadi kamu gak perlu manual input.

---

## ✨ Fitur Utama

### 🤖 Bot WhatsApp
- ✅ Cek DPT otomatis dari file Excel
- ✅ Auto-detect OTP dari KPU
- ✅ Auto-isi OTP ke browser
- ✅ Support multi-NIK (batch)
- ✅ Hasil dikirim dalam bentuk Excel
- ✅ Deteksi wilayah otomatis (Provinsi, Kabupaten, Kecamatan, Kelurahan)

### 📱 Bot Telegram
- ✅ Admin panel lengkap
- ✅ Pairing WhatsApp via Telegram
- ✅ Add/Delete sewa user
- ✅ Add/Delete saldo user
- ✅ Broadcast pesan
- ✅ Backup otomatis
- ✅ Statistik real-time

### 💰 Sistem Saldo
- ✅ Topup saldo user
- ✅ Auto-deduct saat cek DPT
- ✅ Riwayat transaksi
- ✅ Owner gratis unlimited

### 🔐 Keamanan
- ✅ Filter OTP hanya dari KPU
- ✅ Auto-backup data
- ✅ Multi-admin support
- ✅ Session WhatsApp terenkripsi

---

## 📋 Persyaratan

| Item | Minimum |
|---|---|
| OS | Ubuntu 20.04 / 22.04 |
| RAM | 2 GB |
| Storage | 10 GB |
| Node.js | 20.x |
| Koneksi | Stabil |

---

## 🚀 Cara Install (VPS Fresh)

### ⚡ Cara Cepat — 1 Command

Buka VPS baru, login sebagai root, terus paste command ini:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kjsstore/dpt-online-kpu/main/install.sh)
```

**Installer bakal otomatis:**
1. ✅ Update sistem
2. ✅ Install Node.js 20
3. ✅ Install PM2
4. ✅ Clone project dari GitHub
5. ✅ Tanya Telegram Token & Owner ID
6. ✅ Generate `config.js` otomatis
7. ✅ Install semua dependencies
8. ✅ Install Chromium (Playwright)
9. ✅ Start bot (`wabot` + `sellapp`)

**Selesai!** Bot langsung online. 🎉

---

## 🔧 Cara Install (Manual)

Kalau mau install manual, ikutin step berikut:

### 1. Update Sistem

```bash
apt update && apt upgrade -y
```

### 2. Install Dependencies

```bash
apt install -y curl wget git nano unzip zip jq \
    build-essential libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
    libasound2 libatspi2.0-0 libx11-xcb1 libxcursor1 libgtk-3-0
```

### 3. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

**Cek:**
```bash
node -v
npm -v
```

### 4. Install PM2

```bash
npm install -g pm2
```

### 5. Clone Project

```bash
cd /root
git clone https://github.com/kjsstore/dpt-online-kpu.git DPT-ONLINE
cd DPT-ONLINE
```

### 6. Buat `config.js`

```bash
nano config.js
```

**Paste ini:**

```js
module.exports = {
    BOT: {
        TOKEN: 'ISI_TOKEN_TELEGRAM_BOT_KAMU',
        OWNER_ID: 'ISI_OWNER_ID_TELEGRAM',
        BOT_NAME: 'KJS-BOT'
    },
    URLS: {
        WA_BOT: 'http://127.0.0.1:3006',
        BRIDGE: 'http://127.0.0.1:3004'
    },
    PORTS: {
        WA_BOT: 3006,
        BRIDGE: 3004
    }
};
```

**Save:** `Ctrl+O` → Enter → `Ctrl+X`

### 7. Install Dependencies Bot

```bash
# Bot Telegram
npm install

# WA Bot
cd wa-bot
npm install

# Install Chromium
npx playwright install chromium
npx playwright install-deps chromium
```

### 8. Setup Folder & File

```bash
cd /root/DPT-ONLINE

# Buat folder
mkdir -p wa-bot/sessions wa-bot/uploads wa-bot/screenshots backups

# Init file JSON
echo '{}' > users.json
echo '{}' > sewa_aktif.json
echo '{}' > saldo.json
echo '{"admins":[]}' > admins.json
echo '[]' > detected_data.json
echo '{}' > wa-bot/sewa_aktif.json
echo '{}' > wa-bot/saldo.json
echo '{}' > wa-bot/nomor_bot.json
```

### 9. Start Bot

```bash
# Start WA Bot
cd /root/DPT-ONLINE/wa-bot
pm2 start index.js --name wabot

# Start Telegram Bot
cd /root/DPT-ONLINE
pm2 start bot.js --name sellapp

# Save PM2
pm2 save
pm2 startup
```

---

## 📱 Cara Pakai

### 1. Pair WhatsApp

Buka bot Telegram kamu, kirim:

```
/pair 628xxxxxxxxxx
```

**Ganti `628xxxxxxxxxx`** dengan nomor WhatsApp kamu.

Bot bakal kasih **kode pairing**. Masukkan kode tersebut di:
- WhatsApp → **Perangkat Tertaut** → **Tautkan Perangkat**

### 2. Cek DPT

Setelah WA connect:

1. Dari **WhatsApp**, kirim file Excel (`.xlsx`) berisi NIK
2. Atau dari **Telegram**, gunakan tombol **CEK DPT**
3. Bot akan proses otomatis
4. Hasil dikirim dalam bentuk Excel

### 3. Format File Excel

| Kolom A |
|---|
| 3671075206800009 |
| 1402105010840001 |
| 3201234567890001 |

**NIK harus 16 digit.** Bisa banyak baris.

---

## 🎮 Command Lengkap

### 🤖 Command Telegram

#### User
| Command | Fungsi |
|---|---|
| `/start` | Mulai bot |
| `/sewa` | Sewa bot |
| `/ceksewa` | Cek masa sewa |
| `/leak [kata kunci]` | Cari data |
| `/leaksaldo` | Cek saldo leak |

#### Admin/Owner
| Command | Fungsi |
|---|---|
| `/pair 628xxx` | Pair WhatsApp |
| `/repair 628xxx` | Ganti nomor WA |
| `/pairstatus` | Cek status WA |
| `/statuswa` | Status WA Bot |
| `/listuser` | List semua user |
| `/addsewa [id] [durasi]` | Tambah sewa |
| `/delsewa [id]` | Hapus sewa |
| `/cekstatus [id]` | Cek status user |
| `/addsaldo [id] [jumlah]` | Tambah saldo |
| `/delsaldo [id] [jumlah]` | Kurangi saldo |
| `/broadcast [pesan]` | Broadcast pesan |
| `/broadcasttag [pesan]` | Broadcast + tag |
| `/unpin` | Lepas semat |
| `/unpinall` | Lepas semua semat |
| `/backup` | Backup data |
| `/backupzip` | Backup ZIP full |
| `/listbackup` | List backup |
| `/listzip` | List backup ZIP |
| `/sendzip` | Kirim ZIP ke channel |
| `/logswa` | Lihat log WA |
| `/restartwa` | Restart WA Bot |
| `/resetsession` | Reset session WA |

#### Owner Only
| Command | Fungsi |
|---|---|
| `/addadmin [id]` | Tambah admin |
| `/deladmin [id]` | Hapus admin |
| `/listadmin` | List admin |
| `/checkadmin [id]` | Cek status admin |

### 💬 Command WhatsApp

| Command | Fungsi |
|---|---|
| `/cekdpt` | Mulai cek DPT (kirim file Excel) |
| `/ceknik` | Alias dari cekdpt |
| `/otp 123456` | Input OTP manual |
| `/statusdpt` | Status proses cek DPT |
| `/bataldpt` | Batalkan proses |

### 🌐 Command Console (Terminal)

| Command | Fungsi |
|---|---|
| `qr` | Tampilkan QR Code |
| `status` | Cek status koneksi |
| `restart` | Restart bot |
| `help` | Bantuan |

---

## 📁 Struktur Project

```
DPT-ONLINE/
├── bot.js                  # Bot Telegram utama
├── bridge-telegram.js      # Bridge Telegram ↔ WA
├── menu.js                 # Menu helper
├── menu-first.js           # Menu first
├── menu_admin.js           # Menu admin
├── menu_wa.js              # Menu WhatsApp
├── menu_sewa_bot.js        # Menu sewa
├── menu-topup.js           # Menu topup
├── owner_menu.js           # Menu owner
├── saldo.js                # Sistem saldo
├── config.js               # Config (GITIGNORE!)
├── install.sh              # Auto installer
├── package.json            # Dependencies
├── .gitignore              # Git ignore
│
├── wa-bot/                 # Bot WhatsApp
│   ├── index.js            # Main WA Bot
│   ├── kpu-integration.js  # Integrasi KPU
│   ├── kpu_checker.js      # Checker KPU (Playwright)
│   ├── wabot_payment.js    # Payment handler
│   ├── excel-builder.js    # Build Excel hasil
│   ├── wilayah-lookup.js   # Lookup wilayah
│   ├── sessions/           # Session WA (GITIGNORE!)
│   ├── uploads/            # File upload (GITIGNORE!)
│   └── screenshots/        # Screenshot error (GITIGNORE!)
│
└── web/                    # Web dashboard (opsional)
    ├── server.js
    └── public/
```

---

## 🎯 Cara Dapat Token & ID

### 🤖 Telegram Bot Token

1. Buka Telegram, chat **@BotFather**
2. Kirim `/newbot`
3. Ikutin instruksi:
   - **Nama bot:** (contoh: DPT Online Bot)
   - **Username bot:** (harus diakhiri `bot`, contoh: `dpt_online_bot`)
4. BotFather kasih token seperti:
   ```
   1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ
   ```
5. **Simpan token ini**

### 👤 Owner Telegram ID

1. Chat **@userinfobot** di Telegram
2. Bot bakal bales:
   ```
   Id: 123456789
   ```
3. **Simpan ID ini**

---

## 🔐 Keamanan

### ⚠️ File Sensitif (GITIGNORE)

File berikut **TIDAK** di-upload ke GitHub:

```
config.js          # Token bot
users.json         # Data user
saldo.json         # Data saldo
sewa_aktif.json    # Data sewa
nomor_bot.json     # Nomor bot
sessions/          # Session WhatsApp
wa-sessions/       # Session WA multi-user
node_modules/      # Dependencies
uploads/           # File upload
backups/           # Backup
```

### 🔒 Best Practice

1. **Jangan share `config.js`** ke siapapun
2. **Jangan commit `sessions/`** ke GitHub
3. **Ganti token** kalau ke-bocor
4. **Backup rutin** dengan `/backup`
5. **Pakai VPS private**, bukan shared hosting

---

## 🛠️ Troubleshooting

### ❌ Bot Telegram gak jalan

**Cek log:**
```bash
pm2 logs sellapp
```

**Restart:**
```bash
pm2 restart sellapp
```

### ❌ WA Bot gak connect

**Cek status:**
```bash
pm2 logs wabot
```

**Restart:**
```bash
pm2 restart wabot
```

**Pair ulang dari Telegram:**
```
/pair 628xxxxxxxxxx
```

### ❌ OTP gak terdeteksi

**Cek log:**
```bash
pm2 logs wabot --lines 50 | grep OTP
```

**Restart WA Bot:**
```bash
pm2 restart wabot
```

### ❌ Chromium gak jalan

**Reinstall Playwright:**
```bash
cd /root/DPT-ONLINE/wa-bot
npx playwright install chromium --force
npx playwright install-deps chromium
```

### ❌ PM2 gak auto-start

**Setup ulang:**
```bash
pm2 startup
pm2 save
```

---

## 📊 Monitoring

### Cek Status Bot

```bash
pm2 list
```

### Cek Log Real-time

```bash
# Semua bot
pm2 logs

# Bot tertentu
pm2 logs wabot
pm2 logs sellapp
```

### Cek Resource

```bash
htop
```

### Restart Semua

```bash
pm2 restart all
```

### Stop Semua

```bash
pm2 stop all
```

---

## 🔄 Update Bot

### Update dari GitHub

```bash
cd /root/DPT-ONLINE

# Backup dulu
cp -r . ../DPT-ONLINE.backup

# Pull update
git pull

# Install dependencies baru (kalau ada)
npm install
cd wa-bot && npm install && cd ..

# Restart
pm2 restart all
```

---

## 💰 Harga & Sewa

### Paket Sewa

| Paket | Durasi | Harga |
|---|---|---|
| Mingguan | 7 hari | Rp25.000 |
| 2 Minggu | 14 hari | Rp50.000 |
| Bulanan | 30 hari | Rp100.000 |
| 3 Bulan | 90 hari | Rp250.000 |
| Tahunan | 365 hari | Rp500.000 |

### Biaya Cek DPT

- **Rp500 per NIK valid**
- **NIK tidak terdaftar:** GRATIS

### Owner Mode

- **GRATIS UNLIMITED** ✅

---

## 📞 Kontak

- **GitHub:** [@kjsstore](https://github.com/kjsstore)
- **Telegram:** @kjsstore
- **WhatsApp:** +62 859-4311-1681

---

## 📄 Lisensi

MIT License - Bebas pakai, modifikasi, dan distribusi.

**Syarat:**
- Cantumkan sumber asli
- Jangan jual tanpa izin
- Jangan hapus credit

---

## 🙏 Kredit

- **Baileys** - WhatsApp Web API
- **Playwright** - Browser automation
- **node-telegram-bot-api** - Telegram Bot API
- **PM2** - Process manager

---

## ⭐ Dukung Project

Kalau bot ini membantu, kasih ⭐ di GitHub!

---

**© 2026 KJS Store - All Rights Reserved**
