#!/bin/bash
# ==========================================
# 🚀 SUNG-JIN-WOO BOT - ROOT INSTALLER
# ==========================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

clear
echo -e "${BLUE}==========================================${NC}"
echo -e "${GREEN}   🚀 SUNG-JIN-WOO BOT (ROOT MODE)${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

echo -e "${YELLOW}📦 Update packages...${NC}"
apt update && apt upgrade -y

echo -e "${YELLOW}📦 Install dependencies...${NC}"
apt install -y git curl wget build-essential ffmpeg imagemagick

echo -e "${YELLOW}📦 Install Node.js 20 LTS...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs npm

echo -e "${YELLOW}📦 Install PM2...${NC}"
npm install -g pm2
pm2 update

cd ~
if [ -d "Sung-jin-woo_bot" ]; then
    echo -e "${YELLOW}📁 Folder sudah ada, update...${NC}"
    cd Sung-jin-woo_bot
    git pull
else
    echo -e "${YELLOW}📁 Clone repository...${NC}"
    git clone https://github.com/kjsstore/Sung-jin-woo_bot.git
    cd Sung-jin-woo_bot
fi

echo -e "${YELLOW}⚙️ Membuat config.js...${NC}"
cat > config.js << 'EOF'
module.exports = {
  BOT: {
    TOKEN: "YOUR_BOT_TOKEN_HERE",
    OWNER_ID: "YOUR_TELEGRAM_ID_HERE"
  }
};
EOF

echo -e "${YELLOW}📁 Setup folder function...${NC}"
mkdir -p wabot/function

cat > wabot/function/purchaseFlow.js << 'EOF'
exports.handleMessage = async (sock, m, context) => {
    return false;
};
EOF

cat > wabot/function/trialFlow.js << 'EOF'
exports.handleMessage = async (sock, m) => {
    return false;
};
EOF

cat > wabot/function/renewFlow.js << 'EOF'
exports.handleMessage = async (sock, m, context) => {
    return false;
};
EOF

echo -e "${YELLOW}🤖 Install Telegram Bot...${NC}"
npm install --force

echo -e "${YELLOW}📱 Install WhatsApp Bot...${NC}"
cd wabot
npm install --force
cd ..

mkdir -p wabot/sessions

echo -e "${YELLOW}⚙️ Setup PM2...${NC}"
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'telegram-bot',
      cwd: '/root/Sung-jin-woo_bot',
      script: 'index.js',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'wabot',
      cwd: '/root/Sung-jin-woo_bot/wabot',
      script: 'index.js',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' }
    }
  ]
};
EOF

echo -e "${YELLOW}🚀 Starting bot...${NC}"
pm2 delete all 2>/dev/null
pm2 start ecosystem.config.js
pm2 save
pm2 startup | tail -1 | bash

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}   ✅ INSTALLASI SELESAI!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo -e "${BLUE}📁 Lokasi: ~/Sung-jin-woo_bot${NC}"
echo ""
echo -e "${YELLOW}📌 LANGKAH SELANJUTNYA:${NC}"
echo ""
echo -e "1️⃣  Edit Token:"
echo -e "    ${BLUE}nano ~/Sung-jin-woo_bot/config.js${NC}"
echo -e "    Ganti: ${YELLOW}YOUR_BOT_TOKEN_HERE${NC} dan ${YELLOW}YOUR_TELEGRAM_ID_HERE${NC}"
echo ""
echo -e "2️⃣  Restart: ${BLUE}pm2 restart all${NC}"
echo ""
echo -e "3️⃣  Cek status: ${BLUE}pm2 status${NC}"
echo -e "    Logs: ${BLUE}pm2 logs --lines 30${NC}"
echo ""
echo -e "4️⃣  Pairing WA: ${BLUE}/pair 628xxxxxxxxxx${NC} di Telegram"
echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}   🎉 SELAMAT!${NC}"
echo -e "${GREEN}==========================================${NC}"