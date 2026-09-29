#!/bin/bash

# ==========================================
# 🔥 AUTO INSTALLER - DPT ONLINE BOT
# ==========================================
# Sekali paste:
# - Clone dari GitHub
# - Install semua
# - Generate config.js otomatis
# - Start bot
# ==========================================

set -e

GITHUB_REPO="https://github.com/kjsstore/dpt-online-kpu.git"
INSTALL_DIR="/root/DPT-ONLINE"
WA_BOT_DIR="$INSTALL_DIR/wa-bot"

# Warna
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

clear
echo ""
echo -e "${CYAN}=========================================="
echo -e "${CYAN}   🔥 DPT ONLINE - AUTO INSTALLER 🔥"
echo -e "${CYAN}==========================================${NC}"
echo ""

# ==========================================
# 🔥 CEK ROOT
# ==========================================

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}❌ Harus dijalankan sebagai root!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Running as root${NC}"
sleep 1

# ==========================================
# 🔥 STEP 1: UPDATE SISTEM
# ==========================================

echo ""
echo -e "${BLUE}📦 [1/8] Update sistem...${NC}"
apt update -y > /dev/null 2>&1
echo -e "${GREEN}✅ Sistem up-to-date${NC}"

# ==========================================
# 🔥 STEP 2: INSTALL DEPENDENCIES
# ==========================================

echo ""
echo -e "${BLUE}📦 [2/8] Install dependencies...${NC}"
apt install -y curl wget git nano unzip zip jq \
    build-essential libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
    libasound2 libatspi2.0-0 libx11-xcb1 libxcursor1 libgtk-3-0 \
    > /dev/null 2>&1
echo -e "${GREEN}✅ Dependencies terinstall${NC}"

# ==========================================
# 🔥 STEP 3: INSTALL NODE.JS 20
# ==========================================

echo ""
echo -e "${BLUE}📦 [3/8] Install Node.js 20...${NC}"
if command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js sudah ada: $(node -v)${NC}"
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt install -y nodejs > /dev/null 2>&1
    echo -e "${GREEN}✅ Node.js $(node -v) terinstall${NC}"
fi

# ==========================================
# 🔥 STEP 4: INSTALL PM2
# ==========================================

echo ""
echo -e "${BLUE}📦 [4/8] Install PM2...${NC}"
if command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠️  PM2 sudah ada${NC}"
else
    npm install -g pm2 > /dev/null 2>&1
    echo -e "${GREEN}✅ PM2 terinstall${NC}"
fi

# ==========================================
# 🔥 STEP 5: CLONE DARI GITHUB
# ==========================================

echo ""
echo -e "${BLUE}📦 [5/8] Clone project dari GitHub...${NC}"

if [ -d "$INSTALL_DIR" ]; then
    echo -e "${YELLOW}⚠️  Folder udah ada, backup dulu...${NC}"
    mv "$INSTALL_DIR" "${INSTALL_DIR}.bak_$(date +%Y%m%d_%H%M%S)"
fi

cd /root
git clone "$GITHUB_REPO" "$INSTALL_DIR" > /dev/null 2>&1

if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}❌ Gagal clone!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Project di-clone${NC}"

cd "$INSTALL_DIR"

# ==========================================
# 🔥 STEP 6: GENERATE CONFIG.JS (INTERAKTIF)
# ==========================================

echo ""
echo -e "${CYAN}=========================================="
echo -e "${CYAN}  🔑 SETUP CONFIG BOT"
echo -e "${CYAN}==========================================${NC}"
echo ""

# Cek dulu config.js udah ada
if [ -f "$INSTALL_DIR/config.js" ]; then
    echo -e "${YELLOW}⚠️  config.js udah ada${NC}"
    read -p "Mau timpa? (y/n): " OVERWRITE
    if [ "$OVERWRITE" != "y" ]; then
        echo -e "${GREEN}✅ Pakai config.js yang lama${NC}"
    else
        rm "$INSTALL_DIR/config.js"
    fi
fi

# Kalau belum ada, tanya input
if [ ! -f "$INSTALL_DIR/config.js" ]; then
    echo -e "${YELLOW}📌 Isi data berikut:${NC}"
    echo ""

    # Telegram Bot Token
    while true; do
        read -p "🤖 Telegram Bot Token (dari @BotFather): " TG_TOKEN
        if [ -z "$TG_TOKEN" ]; then
            echo -e "${RED}❌ Token gak boleh kosong!${NC}"
        else
            break
        fi
    done

    # Owner ID
    while true; do
        read -p "👤 Owner Telegram ID (dari @userinfobot): " OWNER_ID
        if [ -z "$OWNER_ID" ]; then
            echo -e "${RED}❌ Owner ID gak boleh kosong!${NC}"
        else
            break
        fi
    done

    # URL WA Bot (default)
    read -p "🌐 WA Bot URL [default: http://127.0.0.1:3006]: " WA_URL
    WA_URL=${WA_URL:-http://127.0.0.1:3006}

    # URL Bridge (default)
    read -p "🌉 Bridge URL [default: http://127.0.0.1:3004]: " BRIDGE_URL
    BRIDGE_URL=${BRIDGE_URL:-http://127.0.0.1:3004}

    # ==========================================
    # 🔥 GENERATE CONFIG.JS
    # ==========================================

    cat > "$INSTALL_DIR/config.js" << EOF
// ==========================================
// 🔥 CONFIG - AUTO GENERATED
// ==========================================
// Dibuat: $(date)
// ==========================================

module.exports = {
    BOT: {
        TOKEN: '${TG_TOKEN}',
        OWNER_ID: '${OWNER_ID}',
        BOT_NAME: 'KJS-BOT'
    },
    URLS: {
        WA_BOT: '${WA_URL}',
        BRIDGE: '${BRIDGE_URL}'
    },
    PORTS: {
        WA_BOT: 3006,
        BRIDGE: 3004,
        HTTP: 3005
    },
    TELEGRAM_BRIDGE: {
        enabled: true,
        url: '${BRIDGE_URL}',
        endpoints: {
            waToTelegram: '/wa-to-telegram',
            sendToUser: '/send-to-telegram-user'
        }
    }
};
EOF

    echo ""
    echo -e "${GREEN}✅ config.js berhasil dibuat${NC}"
fi

# ==========================================
# 🔥 STEP 7: INSTALL BOT DEPENDENCIES
# ==========================================

echo ""
echo -e "${BLUE}📦 [7/8] Install bot dependencies & Playwright...${NC}"

if [ -f "$INSTALL_DIR/package.json" ]; then
    cd "$INSTALL_DIR"
    npm install > /dev/null 2>&1
    echo -e "${GREEN}✅ Telegram Bot dependencies${NC}"
fi

if [ -f "$WA_BOT_DIR/package.json" ]; then
    cd "$WA_BOT_DIR"
    npm install > /dev/null 2>&1
    echo -e "${GREEN}✅ WA Bot dependencies${NC}"

    echo -e "${BLUE}   Download Chromium (1-2 menit)...${NC}"
    npx playwright install chromium > /dev/null 2>&1
    npx playwright install-deps chromium > /dev/null 2>&1
    echo -e "${GREEN}✅ Playwright Chromium terinstall${NC}"
fi

# ==========================================
# 🔥 STEP 8: SETUP FOLDER & START BOT
# ==========================================

echo ""
echo -e "${BLUE}📦 [8/8] Setup folder & start bot...${NC}"

# Buat folder
mkdir -p "$WA_BOT_DIR/sessions"
mkdir -p "$WA_BOT_DIR/uploads"
mkdir -p "$WA_BOT_DIR/screenshots"
mkdir -p "$INSTALL_DIR/backups"

# Init file JSON
[ ! -f "$INSTALL_DIR/users.json" ] && echo '{}' > "$INSTALL_DIR/users.json"
[ ! -f "$INSTALL_DIR/sewa_aktif.json" ] && echo '{}' > "$INSTALL_DIR/sewa_aktif.json"
[ ! -f "$INSTALL_DIR/saldo.json" ] && echo '{}' > "$INSTALL_DIR/saldo.json"
[ ! -f "$INSTALL_DIR/admins.json" ] && echo '{"admins":[]}' > "$INSTALL_DIR/admins.json"
[ ! -f "$INSTALL_DIR/detected_data.json" ] && echo '[]' > "$INSTALL_DIR/detected_data.json"
[ ! -f "$WA_BOT_DIR/sewa_aktif.json" ] && echo '{}' > "$WA_BOT_DIR/sewa_aktif.json"
[ ! -f "$WA_BOT_DIR/saldo.json" ] && echo '{}' > "$WA_BOT_DIR/saldo.json"
[ ! -f "$WA_BOT_DIR/nomor_bot.json" ] && echo '{}' > "$WA_BOT_DIR/nomor_bot.json"

echo -e "${GREEN}✅ Folder & file ter-setup${NC}"

# Stop bot lama
pm2 delete all > /dev/null 2>&1 || true

# Start WA Bot
if [ -f "$WA_BOT_DIR/index.js" ]; then
    cd "$WA_BOT_DIR"
    pm2 start index.js --name wabot > /dev/null 2>&1
    echo -e "${GREEN}✅ WA Bot started (wabot)${NC}"
fi

# Start Telegram Bot
if [ -f "$INSTALL_DIR/bot.js" ]; then
    cd "$INSTALL_DIR"
    pm2 start bot.js --name sellapp > /dev/null 2>&1
    echo -e "${GREEN}✅ Telegram Bot started (sellapp)${NC}"
fi

# Save PM2
pm2 save > /dev/null 2>&1
pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true
pm2 save > /dev/null 2>&1

# ==========================================
# 🔥 SELESAI
# ==========================================

echo ""
echo -e "${CYAN}=========================================="
echo -e "${GREEN}   ✅ INSTALASI SELESAI! ✅"
echo -e "${CYAN}==========================================${NC}"
echo ""
echo -e "${YELLOW}📊 Status bot:${NC}"
pm2 list
echo ""
echo -e "${YELLOW}📌 Langkah selanjutnya:${NC}"
echo ""
echo "  1. Buka Telegram bot kamu"
echo "  2. Kirim /pair 628xxxxxxxxxx"
echo "  3. Masukkan kode di WhatsApp"
echo ""
echo "  4. Cek log:"
echo "     pm2 logs"
echo ""
echo -e "${CYAN}=========================================="
echo -e "${GREEN}🎉 Bot DPT Online siap digunakan!${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""