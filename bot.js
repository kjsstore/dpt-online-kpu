// ==========================================
// 🔥 INDEX.JS - MAIN BOT FILE (FULL LENGKAP - NO MARKDOWN)
// ==========================================

const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const axios = require("axios");
const path = require("path");
const leakosint = require('./leakosint');

const CHANNEL_BANNER_URL = "https://files.catbox.moe/jyn94w.jpg";
const CHANNEL_ID = '-1003976783282';
const CHANNEL_LINK = 'https://t.me/+Zc5EyfujdgMyZDE1';

const config = require("./config");
const menu = require("./menu");
const menuFirst = require("./menu-first");
const sewaBot = require("./menu_sewa_bot");
const ownerMenu = require("./owner_menu");
const bridgeTelegram = require("./bridge-telegram");
const autogopay = require('./statistik_autogopay');
const gomerch = require('./payment_gomerch'); 
const { formatRupiah } = require('./payment_gomerch'); 
const { 
  handleTambahDaerah,
  handleSyncCommand,
  removeReplyKeyboard,
  deleteAllMessages,
  showWelcomeScreen,
  hasSeenWelcome,
  handleWelcomeContinue
} = require("./menu");
const waMenu = require("./menu_wa");
const adminMenu = require("./menu_admin");

// ==========================================
// 🔥 BROADCAST HELPERS
// ==========================================

const tagAllUsers = (users) => {
    const ids = Object.keys(users);
    if (ids.length === 0) return '';
    return ids.map(id => `[${id}](tg://user?id=${id})`).join(' ');
};

const pinMessage = async (bot, chatId, messageId) => {
    try {
        await bot.pinChatMessage(chatId, messageId, { disable_notification: false });
        console.log(`📌 [PIN] Pesan disematkan untuk ${chatId}`);
        return true;
    } catch (error) {
        console.log(`⚠️ [PIN] Gagal semat: ${error.message}`);
        return false;
    }
};

// ==========================================
// 🔥 GLOBAL VARIABLES
// ==========================================

global.telegramBot = null;
const WA_API_URL = config.URLS.WA_BOT;
const OWNER_ID = config.BOT.OWNER_ID;
const ADMIN_FILE = "./admins.json";
const backupZip = require('./backupZip');
backupZip.startAutoBackupZip();

// ==========================================
// 🔥 BOT INIT
// ==========================================

const bot = new TelegramBot(config.BOT.TOKEN, { polling: true });
global.telegramBot = bot;
global.cekdptMode = {};
global.cekdptModeV2 = {};
global.cekdptWaitingNik = {};   // ← TAMBAH INI
global.searchMode = {};

// ==========================================
// 🔥 FILE PATHS
// ==========================================

const USERS_FILE = "./users.json";
const SEWA_FILE = "./sewa_aktif.json";

// ==========================================
// 🔥 JSON HELPERS
// ==========================================

const loadJSON = (file) => {
  try {
    if (!fs.existsSync(file)) { fs.writeFileSync(file, "{}"); return {}; }
    const raw = fs.readFileSync(file, "utf8").trim();
    if (!raw || raw === "") { fs.writeFileSync(file, "{}"); return {}; }
    return JSON.parse(raw);
  } catch (err) {
    console.log(`❌ JSON ERROR ${file}:`, err.message);
    fs.writeFileSync(file, "{}");
    return {};
  }
};

const saveJSON = (file, data) => {
  try {
    if (!data || typeof data !== "object") data = {};
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.log(`❌ SAVE ERROR ${file}:`, err.message);
  }
};

// 🔥 ADMIN HELPER
const loadAdmins = () => {
    const data = loadJSON(ADMIN_FILE);
    return data.admins || [];
};

const saveAdmins = (admins) => {
    saveJSON(ADMIN_FILE, { admins });
};

const isAuthorized = (userId) => {
    // 🔥 Konversi ke string biar konsisten
    if (userId?.toString() === OWNER_ID?.toString()) return true;
    const admins = loadAdmins();
    return admins.includes(userId.toString());
};

// ==========================================
// 🔥 LOAD DATA
// ==========================================

let users = loadJSON(USERS_FILE);

// ==========================================
// 🔥 HELPER FUNCTIONS
// ==========================================

function formatUptime(seconds) {
  if (!seconds) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

// ==========================================
// 🔍 FUNGSI PENCARIAN DAERAH (UNTUK TOMBOL & COMMAND)
// ==========================================
async function handleSearch(chatId, userId, keyword) {
    // Cek akses: owner/admin atau user dengan sewa aktif
    const isOwnerAdmin = isAuthorized(userId);
    if (!isOwnerAdmin) {
        const sewaFile = path.join(__dirname, 'sewa_aktif.json');
        let sewaData = {};
        try {
            if (fs.existsSync(sewaFile)) {
                sewaData = JSON.parse(fs.readFileSync(sewaFile, 'utf8'));
            }
        } catch (e) {}
        const userSewa = sewaData[userId];
        const now = Date.now();
        const expired = userSewa?.expired === 'Forever' ? Infinity : userSewa?.expired;
        const isActive = userSewa?.active && (expired === Infinity || expired > now);
        if (!isActive) {
            return sendPlainMessage(chatId, '❌ Anda belum memiliki sewa aktif.');
        }
    }

    if (!keyword || keyword.trim().length < 2) {
        return sendPlainMessage(chatId, '❌ Masukkan kata kunci minimal 2 huruf!');
    }
    keyword = keyword.trim();

    const loading = await bot.sendMessage(chatId, `🔍 Mencari data untuk *${keyword}*...`, { parse_mode: 'Markdown' });

    try {
        // 🔥 PAKAI ENDPOINT DARI FILE (detected_data.json) - PASTI BERHASIL!
        const response = await axios.get(`${config.URLS.WA_BOT}/api/search-region?q=${encodeURIComponent(keyword)}`, {
            timeout: 10000
        });

        await bot.deleteMessage(chatId, loading.message_id).catch(() => {});

        if (!response.data.success) {
            return sendPlainMessage(chatId, `❌ Gagal: ${response.data.error || 'Unknown'}`);
        }

        const { total, data } = response.data;

        if (total === 0) {
            return sendPlainMessage(chatId, `😞 Tidak ditemukan data untuk *${keyword}*`, { parse_mode: 'Markdown' });
        }

        await sendPlainMessage(chatId, `📊 Ditemukan ${total} data untuk *${keyword}*. Kirim satu per satu...`, { parse_mode: 'Markdown' });

        for (const item of data) {
            // 🔥 AMBIL RAW PESAN ASLI
            const raw = item.raw || '';
            const nomor = item.nomor || '-';

            // 🔥 KIRIM LANGSUNG ISI PESAN + TOMBOL HUBUNGI (TANPA PARSE MODE)
            const buttons = {
                inline_keyboard: [
                    [{ text: "💬 Hubungi", url: `https://wa.me/${nomor.replace(/[^0-9]/g, '')}` }]
                ]
            };

            await bot.sendMessage(chatId, raw, {
                reply_markup: buttons
                // 🔥 TIDAK PAKAI parse_mode: 'Markdown'!
            });

            await new Promise(r => setTimeout(r, 300));
        }

        await sendPlainMessage(chatId, `✅ Selesai! ${total} data dikirim.`);

    } catch (error) {
        await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        console.error('❌ Search error:', error.message);
        if (error.code === 'ECONNREFUSED') {
            return sendPlainMessage(chatId, `❌ WA Bot tidak berjalan! Pastikan WA Bot aktif di port ${config.PORTS.WA_BOT}.`);
        }
        sendPlainMessage(chatId, `❌ Error: ${error.message}`);
    }
}
// ==========================================
// 🔥 ERROR HANDLING
// ==========================================

process.on("uncaughtException", (err) => {
  console.log("❌ ERROR CRASH:", err);
});
process.on("unhandledRejection", (err) => {
  console.log("❌ PROMISE ERROR:", err);
});

const log = (type, msg) => {
  const time = new Date().toLocaleString("id-ID");
  console.log(`[${time}] [${type}] ${msg}`);
};

log("INFO", "Bot Telegram aktif 🚀");

// ==========================================
// 🔥 SEND FUNCTIONS - FIXED NO MARKDOWN
// ==========================================

const lastMessages = {};

const deletePreviousMessage = async (chatId) => {
  if (lastMessages[chatId]) {
    try { await bot.deleteMessage(chatId, lastMessages[chatId]); } catch (err) {}
  }
};

const sendNewMessage = async (chatId, text, options = {}, bannerKey = null, photoUrl = null) => {
  try {
    // 🔥 TIDAK HAPUS REPLY KEYBOARD
    await deletePreviousMessage(chatId);
    
    // 🔥 HANYA HAPUS KARAKTER NULL/INVISIBLE SAJA
    let cleanText = text || '';
    cleanText = cleanText.replace(/\u0000/g, '').trim();
    
    // 🔥 VALIDASI KEYBOARD - HAPUS KALAU KOSONG
    if (options.reply_markup && options.reply_markup.inline_keyboard) {
      const keyboard = options.reply_markup.inline_keyboard;
      if (keyboard.length === 0 || keyboard.every(row => row.length === 0)) {
        delete options.reply_markup;
      }
    }
    
    let sentMessage;
    if (photoUrl) {
      try {
        sentMessage = await bot.sendPhoto(chatId, photoUrl, {
          caption: cleanText,
          reply_markup: options.reply_markup
        });
      } catch (err) {
        sentMessage = await bot.sendMessage(chatId, cleanText);
      }
    } else {
      sentMessage = await bot.sendMessage(chatId, cleanText, options);
    }
    
    if (sentMessage && sentMessage.message_id) {
      lastMessages[chatId] = sentMessage.message_id;
    }
    return sentMessage;
  } catch (err) {
    log("ERROR", `sendNewMessage failed: ${err.message}`);
    return null;
  }
};

const sendPlainMessage = async (chatId, text, options = {}) => {
  try {
    // 🔥 TIDAK HAPUS REPLY KEYBOARD
    await deletePreviousMessage(chatId);
    
    // 🔥 HANYA HAPUS KARAKTER NULL/INVISIBLE SAJA
    let cleanText = text || '';
    cleanText = cleanText.replace(/\u0000/g, '').trim();
    
    // 🔥 VALIDASI KEYBOARD
    if (options.reply_markup && options.reply_markup.inline_keyboard) {
      const keyboard = options.reply_markup.inline_keyboard;
      if (keyboard.length === 0 || keyboard.every(row => row.length === 0)) {
        delete options.reply_markup;
      }
    }
    
    const sentMessage = await bot.sendMessage(chatId, cleanText, options);
    
    if (sentMessage && sentMessage.message_id) {
      lastMessages[chatId] = sentMessage.message_id;
    }
    return sentMessage;
  } catch (err) {
    log("ERROR", `sendPlainMessage failed: ${err.message}`);
    return null;
  }
};

const sendNewMessageWithCleanup = async (bot, chatId, content, options = {}) => {
  try {

    let cleanText = content || '';
    cleanText = cleanText.replace(/\u0000/g, '').trim();
    
    // 🔥 VALIDASI KEYBOARD
    if (options.reply_markup && options.reply_markup.inline_keyboard) {
      const keyboard = options.reply_markup.inline_keyboard;
      if (keyboard.length === 0 || keyboard.every(row => row.length === 0)) {
        delete options.reply_markup;
      }
    }
    
    const sent = await bot.sendMessage(chatId, cleanText, options);
    return sent;
  } catch (err) {
    console.log(`❌ sendNewMessageWithCleanup error: ${err.message}`);
    return null;
  }
};

// ==========================================
// 🔥 BOT MESSAGE HANDLER
// ==========================================

bot.on("message", async (msg) => {
  const id = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text || '';
  
  if (!users[id]) {
    users[id] = { 
      id, 
      username: msg.from.username || msg.from.first_name || "-", 
      first_name: msg.from.first_name || "-",
      date: new Date().toISOString() 
    };
    saveJSON(USERS_FILE, users);
  }
  
   // ==========================================
  // 🔥 HANDLE FILE EXCEL UNTUK CEK DPT V1 & V2
  // ==========================================
  
  // 🔥 CEK DPT V1
  if (msg.document && global.cekdptMode && global.cekdptMode[userId]) {
    // 🔥 LOCK: cegah double process
    if (global.cekdptMode[userId] === 'processing') {
      return bot.sendMessage(id, '⏳ Masih memproses file sebelumnya. Tunggu ya...');
    }
    global.cekdptMode[userId] = 'processing';

    const doc = msg.document;
    const fileName = doc.file_name || '';

    // Validasi ekstensi
    if (!fileName.toLowerCase().endsWith('.xlsx') && !fileName.toLowerCase().endsWith('.xls')) {
      delete global.cekdptMode[userId];
      return bot.sendMessage(id, '❌ File harus berformat .xlsx atau .xls\n\nSilakan kirim ulang file Excel.');
    }

    const loadingMsg = await bot.sendMessage(id, '⏳ *File diterima!*\n\n📌 Mode: *CEK DPT V1*\nSedang memproses...', {
      parse_mode: 'Markdown'
    });

    try {
      const fileLink = await bot.getFileLink(doc.file_id);
      console.log(`📥 [CEKDPT V1] File dari ${userId}: ${fileName}`);
      console.log(`📥 [CEKDPT V1] URL: ${fileLink}`);

      // 🔥 KIRIM KE WA BOT UNTUK DIPROSES (V1)
      await axios.post(`${config.URLS.WA_BOT}/api/cekdpt-from-telegram`, {
        chatId: id.toString(),
        userId: userId.toString(),
        username: msg.from.username || msg.from.first_name || '-',
        fileUrl: fileLink,
        fileName: fileName,
        version: 'v1'
      }, { timeout: 30000 });

      try { await bot.deleteMessage(id, loadingMsg.message_id); } catch (e) {}

    } catch (error) {
      console.log(`❌ [CEKDPT V1] Error:`, error.message);
      try { await bot.deleteMessage(id, loadingMsg.message_id); } catch (e) {}

      if (error.code === 'ECONNREFUSED') {
        await bot.sendMessage(id,
          `❌ *WA Bot tidak berjalan!*\n\n` +
          `Pastikan WA Bot aktif di port ${config.PORTS?.WA_BOT || 3009}.\n` +
          `Restart: pm2 restart wabot`
        );
      } else {
        await bot.sendMessage(id,
          `❌ *Gagal memproses file*\n\n` +
          `Error: ${error.message}`
        );
      }
    } finally {
      delete global.cekdptMode[userId];
    }
    return;
  }
  
    // ==========================================
  // 🔥 HANDLE NIK TEKS UNTUK CEK DPT V2
  // ==========================================
    if (global.cekdptWaitingNik && global.cekdptWaitingNik[userId]) {
    const isCommand = !text || text.startsWith('/') || text.startsWith('.') || text.startsWith('!');
    const isBatal = text === '⋪ ❌ 𝗕𝗔𝗧𝗔𝗟 ⋫' || text === '❌ BATAL' || 
                    text === '⋪ 🔙 𝗞𝗘𝗠𝗕𝗔𝗟𝗜 𝗞𝗘 𝗠𝗘𝗡𝗨 ⋫' || text === '🔙 KEMBALI KE MENU';

    if (isCommand || isBatal) {
      // Lanjut ke handler command di bawah
    } else {
      console.log(`📩 [CEKDPT V2] Terima NIK dari ${userId}: "${text.substring(0, 100)}"`);
      
      // 🔥 PARSE NIK (16 digit per NIK)
      const tokens = text.split(/[\s,;\n\r\t]+/);
      const nikList = [];
      const seen = new Set();
      
      for (const token of tokens) {
        const clean = token.replace(/[^0-9]/g, '');
        if (clean.length === 16 && !seen.has(clean)) {
          seen.add(clean);
          nikList.push(clean);
        }
      }
      
      if (nikList.length === 0) {
        await bot.sendMessage(id, 
          `❌ *Tidak ada NIK valid ditemukan!*\n\n` +
          `📌 Format:\n` +
          '```\n' +
          `37042356757867886\n` +
          `37042356757867886\n` +
          '```\n\n' +
          `• NIK harus 16 digit\n` +
          `• Bisa 1 per baris / spasi / koma\n` +
          `• Max 50 NIK`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      if (nikList.length > 50) {
        await bot.sendMessage(id, 
          `❌ *Terlalu banyak NIK!*\n\n` +
          `📋 Terdeteksi: *${nikList.length}*\n` +
          `📌 Max: *50 NIK*\n\n` +
          `💡 Silakan kirim ulang dengan jumlah ≤ 50, atau bagi jadi beberapa request.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
      
      // 🔥 HAPUS FLAG waiting_nik
      delete global.cekdptWaitingNik[userId];
      
      // 🔥 KIRIM LOADING
      const loadingMsg = await bot.sendMessage(id, 
        `⏳ *Memproses ${nikList.length} NIK...*\n\n📌 Mode: *CEK DPT V2*\nMohon tunggu...`,
        { parse_mode: 'Markdown' }
      );
      
      try {
        // 🔥 KIRIM KE WA BOT
        await axios.post(`${config.URLS.WA_BOT}/api/cekdpt-v2-from-nik`, {
          chatId: id.toString(),
          userId: userId.toString(),
          username: msg.from.username || msg.from.first_name || '-',
          nikList: nikList
        }, { timeout: 30000 });
        
        try { await bot.deleteMessage(id, loadingMsg.message_id); } catch (e) {}
        
      } catch (error) {
        console.log(`❌ [CEKDPT V2] Error:`, error.message);
        try { await bot.deleteMessage(id, loadingMsg.message_id); } catch (e) {}
        
        if (error.code === 'ECONNREFUSED') {
          await bot.sendMessage(id, `❌ *WA Bot tidak berjalan!*\n\nRestart: pm2 restart wabot`);
        } else {
          await bot.sendMessage(id, `❌ *Gagal memproses NIK*\n\nError: ${error.message}`);
        }
      }
      return;
    }
  }
  
  if (global.searchMode && global.searchMode[userId]) {
    delete global.searchMode[userId];
    const keyword = text.trim();
    if (keyword.toLowerCase() === 'batal') {
        return bot.sendMessage(id, '❌ Pencarian dibatalkan.');
    }
    if (keyword.length < 2) {
        return bot.sendMessage(id, '❌ Masukkan minimal 2 huruf.');
    }
    await handleSearch(id, userId, keyword);
    return;
 }
 
   // 🔥 HANDLE TOPUP (reply keyboard)
  try {
    const topupMenu = require('./menu-topup');

    // Cek manual input dulu
    const manualHandled = await topupMenu.handleManualInput(bot, id, text);
    if (manualHandled) return;

    // Cek tombol topup
    const topupHandled = await topupMenu.handleTopupButton(bot, id, text);
    if (topupHandled === true) return;

    // 🔥 KALAU RETURN OBJECT DENGAN ACTION BACK_TO_MAIN
    if (topupHandled && topupHandled.action === 'BACK_TO_MAIN') {
      console.log(`[TOPUP] Kembali ke menu utama: ${id}`);
      const isAuth = isAuthorized(userId);
      await menuFirst.showMainMenu(bot, id, isAuth, users);
      return;
    }
  } catch (err) {
    console.log('❌ [TOPUP] Error:', err.message);
  }
  

  const tambahHandled = await menu.handleTambahDaerahStep(id, text, bot, sendPlainMessage);
  if (tambahHandled) return;

  if (text === '📱 STATUS WA') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    
    try {
        const waResponse = await axios.get(`${config.URLS.WA_BOT}/status`, {
            timeout: 3000
        });
        const waStatus = waResponse.data;
        
        let textMsg = `📊 STATUS WHATSAPP BOT\n\n`;
        textMsg += `📱 Status: ${waStatus?.connected ? '✅ Online' : '❌ Offline'}\n`;
        textMsg += `📞 Nomor: ${waStatus?.phone || '-'}\n`;
        textMsg += `👥 Kontak: ${waStatus?.contacts || 0}\n`;
        textMsg += `⏱️ Uptime: ${waStatus?.uptime ? formatUptime(waStatus.uptime) : '-'}\n`;
        
        if (!waStatus?.connected) {
            textMsg += `\n❌ WA Bot belum terhubung!\n📌 Pairing: /pair 628xxxxxxxxxx`;
        }
        
        return bot.sendMessage(id, textMsg);
        
    } catch (error) {
        console.log('❌ Status WA error:', error.message);
        return bot.sendMessage(id, 
            `❌ Gagal cek status WA Bot\n\n1️⃣ Cek WA Bot: pm2 status wabot\n2️⃣ Cek log: pm2 logs wabot\n3️⃣ Restart: pm2 restart wabot`
        );
    }
}

if (text === '🔑 PAIRING') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    await waMenu.showPairingMenu(id, sendNewMessage, bot);
    return;
}

// 🔥 TARUH KODE INI DI SINI 👇
if (text && text.match(/^628\d{8,13}$/)) {
    // 🔥 CEK APAKAH USER DALAM MODE PAIRING
    if (!waMenu.pairingMode || !waMenu.pairingMode[userId]) {
        return;
    }
    
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    
    const phoneNumber = text.trim();
    console.log(`📱 [PAIR] Nomor diterima: ${phoneNumber}`);
    
    // 🔥 KIRIM LOADING
    const loadingMsg = await bot.sendMessage(id, '⏳ *Memproses pairing...*\n\n📱 Nomor: ' + phoneNumber, {
        parse_mode: 'Markdown'
    });
    
    try {
        const response = await axios.post(`${config.URLS.WA_BOT}/pair`, { 
            phoneNumber: phoneNumber 
        });
        
        if (response.data.success) {
            console.log(`✅ [PAIR] Berhasil untuk ${phoneNumber}`);
            
            // 🔥 TUNGGU SAMPAI WA BOT CONNECT
            // Kita cek status setiap 3 detik, max 60 detik
            let connected = false;
            let attempts = 0;
            const maxAttempts = 20; // 20 x 3 detik = 60 detik
            
            while (!connected && attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 3000));
                attempts++;
                
                try {
                    const statusRes = await axios.get(`${config.URLS.WA_BOT}/status`, { timeout: 2000 });
                    if (statusRes.data && statusRes.data.connected) {
                        connected = true;
                        console.log(`✅ [PAIR] WA Bot connected! (${attempts} attempts)`);
                    }
                } catch (e) {
                    console.log(`⏳ [PAIR] Menunggu connect... (${attempts}/${maxAttempts})`);
                }
            }
            
            // 🔥 HAPUS LOADING
            try { await bot.deleteMessage(id, loadingMsg.message_id); } catch (e) {}
            
            // 🔥 HAPUS FLAG PAIRING MODE
            if (waMenu.pairingMode) delete waMenu.pairingMode[userId];
            
            if (connected) {
                // 🔥 KIRIM NOTIF SUKSES
                const notifMsg = await bot.sendMessage(id, 
                    `✅ *WhatsApp Bot Berhasil Terhubung!*\n\n📱 Nomor: ${phoneNumber}\n⏰ ${new Date().toLocaleString('id-ID')}\n\n📌 Bot siap digunakan!`,
                    { parse_mode: 'Markdown' }
                );
                
                // 🔥 HAPUS NOTIF SETELAH 5 DETIK
                setTimeout(async () => {
                    try { await bot.deleteMessage(id, notifMsg.message_id); } catch (e) {}
                }, 5000);
                
            } else {
                // 🔥 TIMEOUT - TIDAK CONNECT
                await bot.sendMessage(id, 
                    `⚠️ *Pairing timeout!*\n\n📱 Nomor: ${phoneNumber}\n\n📌 QR Code sudah dikirim ke Owner\n📌 Scan QR sebelum kadaluarsa (3 menit)\n📌 Cek status: /statuswa`,
                    { parse_mode: 'Markdown' }
                );
            }
            
        } else {
            // HAPUS LOADING
            try { await bot.deleteMessage(id, loadingMsg.message_id); } catch (e) {}
            if (waMenu.pairingMode) delete waMenu.pairingMode[userId];
            await bot.sendMessage(id, '❌ Gagal memulai pairing: ' + (response.data.message || 'Unknown error'));
        }
        
        } catch (error) {
    console.log(`❌ [PAIR] Error:`, error.message);
    
    // HAPUS LOADING
    try { await bot.deleteMessage(id, loadingMsg.message_id); } catch (e) {}
    if (waMenu.pairingMode) delete waMenu.pairingMode[userId];
    
    if (error.code === 'ECONNREFUSED') {
        await bot.sendMessage(id, `❌ WA Bot tidak berjalan!\n\n📌 Restart: pm2 restart wabot`);
    } else {
        await bot.sendMessage(id, `❌ Gagal pairing\n\nError: ${error.message}`);
    }
}
    return;
}

// 🔥 TAMBAHKAN INI SETELAH HANDLER PAIRING
if (text === '📸 PAIRING QR DI SINI') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    await waMenu.showQRPairingMenu(id, sendNewMessage, bot);
    return;
}

  if (text === '🔄 RESET SESSION') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    
    // 🔥 KIRIM LOADING
    const loadingMsg = await bot.sendMessage(id, '⏳ *Menghapus session WhatsApp...*', {
        parse_mode: 'Markdown'
    });
    
    try {
        const response = await axios.post(`${WA_API_URL}/reset-session`);
        if (response.data.status === 'success') {
            // HAPUS LOADING
            try { await bot.deleteMessage(id, loadingMsg.message_id); } catch (e) {}
            
            // KIRIM NOTIF LALU HAPUS
            const notifMsg = await bot.sendMessage(id, '✅ *Session WhatsApp berhasil dihapus!*\n\n📌 Pairing ulang: /pair 628xxxxxxxxxx', {
                parse_mode: 'Markdown'
            });
            
            setTimeout(async () => {
                try { await bot.deleteMessage(id, notifMsg.message_id); } catch (e) {}
            }, 5000);
            
        } else {
            try { await bot.deleteMessage(id, loadingMsg.message_id); } catch (e) {}
            return bot.sendMessage(id, '❌ Gagal menghapus session');
        }
    } catch (error) {
        try { await bot.deleteMessage(id, loadingMsg.message_id); } catch (e) {}
        return bot.sendMessage(id, `❌ Gagal menghapus session\n\nPastikan WA Bot berjalan di port ${config.PORTS.WA_BOT}`);
    }
}

  if (text === '🔧 REPAIR WA') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    
    // 🔥 KONFIRMASI REPAIR
    const confirmMsg = await bot.sendMessage(id, 
        `⚠️ *KONFIRMASI REPAIR*\n\n` +
        `📌 Tindakan ini akan:\n` +
        `├ ❌ Menghapus session WhatsApp lama\n` +
        `├ 🔄 Memutuskan koneksi nomor saat ini\n` +
        `└ 🔑 Membuka menu pairing untuk nomor baru\n\n` +
        `✅ Ketik *YA* untuk melanjutkan\n` +
        `❌ Ketik *TIDAK* untuk membatalkan`,
        { parse_mode: 'Markdown' }
    );
    
    // 🔥 TUNGGU RESPON USER
    const replyHandler = async (replyMsg) => {
        const replyText = replyMsg.text || '';
        const replyId = replyMsg.from.id;
        
        // Hanya respon dari user yang sama
        if (replyId !== userId) return;
        
        if (replyText.toUpperCase() === 'YA') {
            console.log(`🔧 [REPAIR] Dikonfirmasi oleh ${userId}`);
            
            // HAPUS PESAN KONFIRMASI
            try { await bot.deleteMessage(id, confirmMsg.message_id); } catch (e) {}
            try { await bot.deleteMessage(id, replyMsg.message_id); } catch (e) {}
            
            // 🔥 KIRIM LOADING
            const loadingMsg = await bot.sendMessage(id, 
                '⏳ *Memproses repair...*\n\n📱 Menghapus session lama...', 
                { parse_mode: 'Markdown' }
            );
            
            try {
                // 🔥 PANGGIL ENDPOINT REPAIR DI WA BOT
                const response = await axios.post(`${config.URLS.WA_BOT}/repair`, {}, {
                    timeout: 10000
                });
                
                console.log(`✅ [REPAIR] Response:`, response.data);
                
                // HAPUS LOADING
                try { await bot.deleteMessage(id, loadingMsg.message_id); } catch (e) {}
                
                if (response.data.success) {
                    // 🔥 KIRIM NOTIF SUKSES
                    const successMsg = await bot.sendMessage(id, 
                        `✅ *Session WhatsApp berhasil dihapus!*\n\n` +
                        `📱 Nomor lama telah diputus\n` +
                        `🔑 Silahkan pairing dengan nomor baru\n\n` +
                        `📌 Kirim nomor baru: 628xxxxxxxxxx`,
                        { parse_mode: 'Markdown' }
                    );
                    
                    // HAPUS NOTIF SETELAH 5 DETIK
                    setTimeout(async () => {
                        try { await bot.deleteMessage(id, successMsg.message_id); } catch (e) {}
                    }, 5000);
                    
                    // 🔥 OTOMATIS BUKA MENU PAIRING
                    setTimeout(async () => {
                        await waMenu.showPairingMenu(id, sendNewMessage, bot);
                    }, 2000);
                    
                } else {
                    await bot.sendMessage(id, '❌ Gagal repair: ' + (response.data.message || 'Unknown error'));
                }
                
            } catch (error) {
                console.log(`❌ [REPAIR] Error:`, error.message);
                try { await bot.deleteMessage(id, loadingMsg.message_id); } catch (e) {}
                
                if (error.code === 'ECONNREFUSED') {
                    await bot.sendMessage(id, 
                        '❌ WA Bot tidak berjalan!\n\n' +
                        '📌 Restart WA Bot: pm2 restart wabot\n' +
                        '📌 Atau repair manual: /repair 628xxxxxxxxxx'
                    );
                } else {
                    await bot.sendMessage(id, `❌ Gagal repair\n\nError: ${error.message}`);
                }
            }
            
            // HAPUS LISTENER
            bot.removeListener('message', replyHandler);
            
        } else if (replyText.toUpperCase() === 'TIDAK' || replyText === '❌') {
            // BATAL
            try { await bot.deleteMessage(id, confirmMsg.message_id); } catch (e) {}
            try { await bot.deleteMessage(id, replyMsg.message_id); } catch (e) {}
            
            await bot.sendMessage(id, '❌ Repair dibatalkan');
            
            // HAPUS LISTENER
            bot.removeListener('message', replyHandler);
        }
    };
    
    // REGISTER LISTENER
    bot.on('message', replyHandler);
    
    // TIMEOUT 30 DETIK
    setTimeout(() => {
        bot.removeListener('message', replyHandler);
    }, 30000);
    
    return;
}

  if (text === '♻️ RESTART WA') {
    console.log('🔄🔴 RESTART WA DIKLIK!');
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    
    const loadingMsg = await bot.sendMessage(id, '⏳ *Merestart WA Bot...*\n\n📱 Mohon tunggu sebentar...', {
        parse_mode: 'Markdown'
    });
    
    try {
        // 🔥 PAKAI ENDPOINT /restart (BUKAN PM2 LANGSUNG)
        const response = await axios.post(`${config.URLS.WA_BOT}/restart`, {}, {
            timeout: 5000
        });
        
        console.log(`✅ [RESTART] Response:`, response.data);
        
        setTimeout(async () => {
            try {
                await bot.deleteMessage(id, loadingMsg.message_id);
                console.log(`🗑️ [RESTART] Loading dihapus untuk ${id}`);
            } catch (e) {}
            
            // 🔥 TIDAK ADA PESAN SUKSES!
            console.log(`✅ [RESTART] WA Bot berhasil direstart untuk ${id}`);
            
        }, 3000);
        
    } catch (error) {
        console.log('❌ Restart error:', error.message);
        try { await bot.deleteMessage(id, loadingMsg.message_id); } catch (e) {}
        bot.sendMessage(id, '❌ Gagal restart WA Bot');
    }
    return;
}

  if (text === '📋 LOGS WA') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    
    try {
        const { exec } = require('child_process');
        exec('pm2 logs wabot --lines 15 --nostream', (error, stdout, stderr) => {
            if (error) {
                return bot.sendMessage(id, '❌ Gagal mengambil logs');
            }
            const logs = stdout || stderr;
            if (logs.length > 4000) {
                return bot.sendMessage(id, '📋 LOG WA BOT (Terpotong)\n\n' + logs.slice(-3500));
            } else {
                return bot.sendMessage(id, '📋 LOG WA BOT\n\n' + logs);
            }
        });
    } catch (error) {
        return bot.sendMessage(id, '❌ Gagal mengambil logs');
    }
}

  if (text === '📢 BROADCAST WA') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    
    // 🔥 TAMPILKAN MENU BROADCAST
    await waMenu.showBroadcastWAMenu(id, sendNewMessage, bot);
    return;
}

  if (text === '🔙 WHATSAPP') {
    console.log(`🔙 User ${userId} kembali ke menu WhatsApp`);
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    await waMenu.showWhatsAppMenu(id, sendNewMessage, bot);
    return;
}

  // 🔥 HANDLE TOMBOL MENU-FIRST (REPLY)
      // 🔥 HANDLE TOMBOL MENU-FIRST + MENU UTAMA (REPLY KEYBOARD)
  const isAuthUser = isAuthorized(userId);
  const firstMenuResult = await menuFirst.handleFirstMenuButton(bot, id, text, msg, isAuthUser, users);
  if (firstMenuResult.handled) {
    return;
  }
  

        if (text === '🔙 BACK MENU' || text === '🔙 MENU') {
    console.log(`🔙 User ${userId} kembali ke menu utama`);
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    const isAuth = isAuthorized(userId);
    await menuFirst.showMainMenu(bot, id, isAuth, users);
    return;
  }

  if (text === '2 Minggu - Rp50.000') {
    const fakeMsg = { chat: { id: id }, from: { id: userId }, text: '/sewa 2minggu' };
    await sewaBot.handleSewaCommand(fakeMsg, bot, sendPlainMessage, sendNewMessage);
    return;
  }

  if (text === '1 Bulan - Rp100.000') {
    const fakeMsg = { chat: { id: id }, from: { id: userId }, text: '/sewa 1bulan' };
    await sewaBot.handleSewaCommand(fakeMsg, bot, sendPlainMessage, sendNewMessage);
    return;
  }

  if (text === '1 Tahun - Rp500.000') {
    const fakeMsg = { chat: { id: id }, from: { id: userId }, text: '/sewa 1tahun' };
    await sewaBot.handleSewaCommand(fakeMsg, bot, sendPlainMessage, sendNewMessage);
    return;
  }

  if (text === '📊 CEK SEWA') {
    const fakeMsg = { chat: { id: id }, from: { id: userId }, text: '/ceksewa' };
    await sewaBot.handleSewaCommand(fakeMsg, bot, sendPlainMessage, sendNewMessage);
    return;
  }

  if (text === '📍 DAERAH SAYA') {
    const fakeMsg = { chat: { id: id }, from: { id: userId }, text: '/daerahsaya' };
    await sewaBot.handleSewaCommand(fakeMsg, bot, sendPlainMessage, sendNewMessage);
    return;
  }

  if (text === '👥 LIST USER') {
    console.log(`🔍 [LIST USER] Diklik oleh ${userId}`);
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    try {
        await adminMenu.listUser(id, bot);
    } catch (error) {
        console.log(`❌ Error list user:`, error.message);
        await bot.sendMessage(id, `❌ Error: ${error.message}`);
    }
    return;
  }

  if (text === '🔍 CEK STATUS') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    bot.sendMessage(id, 
        `🔍 CEK STATUS USER\n\n📌 Kirim perintah:\n/cekstatus [user_id]\n\n📌 Contoh:\n/cekstatus 123456789\n\n📌 Lihat daftar user: /listuser`
    );
    return;
  }

  if (text === '📢 BROADCAST') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    await adminMenu.showBroadcastMenu(id, sendPlainMessage, bot);
    return;
  }

  if (['📝 BROADCAST TEXT', '🏷️ BROADCAST TAG', '📌 BROADCAST PIN', 
       '📸 BROADCAST FOTO', '🏷️ FOTO + TAG', '📌 FOTO + PIN',
       '🎥 BROADCAST VIDEO', '🏷️ VIDEO + TAG', '📌 VIDEO + PIN',
       '🔙 ADMIN'].includes(text)) {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    await adminMenu.handleBroadcastButtons(id, text, sendPlainMessage, bot);
    return;
  }

  if (text === '💰 CEK TRANSAKSI') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    const fakeMsg = { chat: { id: id }, from: { id: userId } };
    await bot.emit('text', { ...fakeMsg, text: '/ceksewaall' });
    return;
  }

  if (text === '➕ ADD SEWA') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    bot.sendMessage(id, '📌 Format: /addsewa [user_id] [durasi]\nContoh: /addsewa 123456789 30d\n\n📌 Lihat bantuan: /addsewahelp');
    return;
  }
  
    if (text === '💰 ADD SALDO') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    bot.sendMessage(id, 
      `💰 *ADD SALDO MANUAL*\n\n` +
      `📌 Format:\n` +
      `/addsaldo [user_id] [jumlah]\n\n` +
      `📌 Contoh:\n` +
      `/addsaldo 123456789 10000\n` +
      `/addsaldo 123456789 10rb\n` +
      `/addsaldo 123456789 100rb\n` +
      `/addsaldo 123456789 1jt`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (text === '💸 DEL SALDO') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    bot.sendMessage(id, 
      `💸 *DEL SALDO MANUAL*\n\n` +
      `📌 Format:\n` +
      `/delsaldo [user_id] [jumlah]\n\n` +
      `📌 Contoh:\n` +
      `/delsaldo 123456789 10000\n` +
      `/delsaldo 123456789 50rb`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (text === '❌ DELETE SEWA') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    bot.sendMessage(id, '📌 Format: /delsewa [user_id]\nContoh: /delsewa 123456789\n\n📌 Lihat daftar user: /listuser');
    return;
  }

  if (text === '⚙️ SETTING') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    bot.sendMessage(id, '⚙️ SETTING BOT\n\n📌 Commands:\n/sewa - Sewa bot\n/ceksewa - Cek sewa\n/savedata - Simpan data\n/lihatdata - Lihat data\n/hapusdata - Hapus data\n/start - Menu utama');
    return;
  }
  
// 📦 TOMBOL BACKUP DARI MENU ADMIN
if (text === '📦 BACKUP') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    
    const backupZip = require('./backupZip');
    const zips = backupZip.listZips ? backupZip.listZips() : [];
    const fs = require('fs');
    const path = require('path');
    const backupDir = path.join(__dirname, 'backups');
    let backups = [];
    if (fs.existsSync(backupDir)) {
        backups = fs.readdirSync(backupDir).filter(f => f.startsWith('sewa_aktif_') && f.endsWith('.json'));
    }
    
    const msg = 
`📦 *BACKUP MENU*

📌 *Perintah yang tersedia:*

💾 /backup - Backup sewa_aktif.json
📦 /backupzip - Backup FULL (ZIP) + kirim channel
📋 /listbackup - Lihat backup sewa_aktif.json
📋 /listzip - Lihat backup ZIP
📤 /sendzip - Kirim ZIP terbaru ke channel

📊 *STATUS BACKUP*
📂 Backup JSON: ${backups.length} file
📦 Backup ZIP: ${zips.length} file
⏰ Auto backup setiap 24 jam

📌 Klik tombol di bawah untuk aksi cepat:`;

    const buttons = {
        reply_markup: {
            keyboard: [
                [{ text: "💾 BACKUP SEWA" }, { text: "📦 BACKUP FULL" }],
                [{ text: "📋 LIST BACKUP" }, { text: "📋 LIST ZIP" }],
                [{ text: "📤 SEND ZIP" }, { text: "🔙 ADMIN" }]
            ],
            resize_keyboard: true,
            one_time_keyboard: false
        }
    };
    
    await bot.sendMessage(id, msg, { parse_mode: 'Markdown', ...buttons });
    return;
}

// 💾 SUB-TOMBOL BACKUP
if (text === '💾 BACKUP SEWA') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    bot.emit('text', { chat: { id: id }, from: { id: userId }, text: '/backup' });
    return;
}

if (text === '📦 BACKUP FULL') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    bot.emit('text', { chat: { id: id }, from: { id: userId }, text: '/backupzip' });
    return;
}

if (text === '📋 LIST BACKUP') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    bot.emit('text', { chat: { id: id }, from: { id: userId }, text: '/listbackup' });
    return;
}

if (text === '📋 LIST ZIP') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    bot.emit('text', { chat: { id: id }, from: { id: userId }, text: '/listzip' });
    return;
}

if (text === '📤 SEND ZIP') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    bot.emit('text', { chat: { id: id }, from: { id: userId }, text: '/sendzip' });
    return;
}

if (text === '🔙 ADMIN') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    await adminMenu.showAdminMenu(id, sendPlainMessage, bot);
    return;
}

  if (text === '📊 STATISTIK') {
    if (!isAuthorized(userId)) return bot.sendMessage(id, '❌ Khusus owner/admin!');
    
    const sewaFile = path.join(__dirname, 'sewa_aktif.json');
    let sewaData = loadJSON(sewaFile);
    const aktif = Object.keys(sewaData).filter(id => sewaData[id].active).length;
    
    bot.sendMessage(id, 
        `📊 STATISTIK BOT\n\n👥 Total User: ${Object.keys(users).length}\n🤖 Sewa Aktif: ${aktif}\n📅 Total Sewa: ${Object.keys(sewaData).length}`
    );
    return;
  }
});

// ==========================================
// 🔥 SEMUA COMMAND PAKE bot.onText DI LUAR
// ==========================================

// ===== START COMMAND =====
bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const isAuth = isAuthorized(userId);
  const username = msg.from.username || msg.from.first_name || chatId;
  
  if (!users[chatId]) {
    users[chatId] = { 
      id: chatId, 
      username: msg.from.username || msg.from.first_name || "-", 
      first_name: msg.from.first_name || "-",
      date: new Date().toISOString() 
    };
    saveJSON(USERS_FILE, users);
  }
  
  await deletePreviousMessage(chatId);
  
  // ==========================================
  // 🔥 CEK WAJIB JOIN CHANNEL DENGAN GAMBAR
  // ==========================================
  try {
    const chatMember = await bot.getChatMember(CHANNEL_ID, userId);
    const status = chatMember.status;
    
    if (status !== 'member' && status !== 'administrator' && status !== 'creator') {
      const caption = `
⚠️ <b>ANDA WAJIB BERGABUNG KE CHANNEL!</b>

📌 Untuk menggunakan bot ini, Anda harus bergabung ke channel terlebih dahulu.

🔐 <b>SYARAT:</b>
├ Bergabung ke channel 
└ Klik tombol "✅ CEK LAGI" setelah join

━━━━━━━━━━━━━━━━━━
Klik tombol di bawah untuk bergabung!`;

      await bot.sendPhoto(chatId, CHANNEL_BANNER_URL, {
        caption: caption,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📢 GABUNG CHANNEL", url: CHANNEL_LINK }],
            [{ text: "✅ CEK LAGI", callback_data: "check_channel" }]
          ]
        }
      });
      return;
    }
  } catch (error) {
    console.log(`⚠️ [CHANNEL] Gagal cek keanggotaan: ${error.message}`);
  }
  
  // 🔥 TAMPILKAN MENU-FIRST (REPLY KEYBOARD)
  return menuFirst.showFirstMenu(bot, chatId, msg);
});

// ===== SEWA COMMANDS =====
bot.onText(/^\/(sewa|ceksewa|batalkan)/, async (msg) => {
  await sewaBot.handleSewaCommand(msg, bot, sendPlainMessage, sendNewMessage);
});


// ===== WHATSAPP COMMANDS (AUTHORIZED ONLY) =====
bot.onText(/^\/pairwa$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  try {
    const status = await bridgeTelegram.getWAStatus();
    if (status && status.connected) {
      return sendPlainMessage(chatId, `✅ WA Bot sudah terhubung!\n📞 ${status.phone}`);
    }
  } catch (e) {}
  
  sendPlainMessage(chatId, '📱 PAIRING WHATSAPP\n\nKirim nomor WhatsApp:\n/pair 628xxxxxxxxxx');
});

bot.onText(/^\/pair (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  const phoneNumber = match[1].replace(/[^0-9]/g, '');
  if (!phoneNumber.match(/^628\d{8,13}$/)) {
    return sendPlainMessage(chatId, '❌ Nomor tidak valid! Gunakan format 628xxxxxxxxxx');
  }
  
  sendPlainMessage(chatId, `⏳ Memproses pairing untuk ${phoneNumber}...`);
  
  try {
    const response = await axios.post(`${config.URLS.WA_BOT}/pair`, { phoneNumber: phoneNumber });
    if (response.data.status === 'success') {
      sendPlainMessage(chatId, `✅ Kode pairing dikirim ke WhatsApp\n\n📱 Nomor: ${phoneNumber}`);
    } else {
      sendPlainMessage(chatId, '❌ Gagal memulai pairing: ' + (response.data.message || 'Unknown error'));
    }
  } catch (error) {
    sendPlainMessage(chatId, `❌ Gagal memulai pairing\n\nPastikan WA Bot berjalan di port ${config.PORTS.WA_BOT}.`);
  }
});

// ==========================================
// 🔥 LEAKOSINT COMMANDS
// ==========================================

// 🔍 SEARCH LEAK
bot.onText(/^\/(leak|search|cek)(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const query = match ? match[2] : null;
    
    // Cek akses (authorized atau user dengan sewa aktif)
    const isAuth = isAuthorized(userId);
    if (!isAuth) {
        const sewaFile = path.join(__dirname, 'sewa_aktif.json');
        let sewaData = loadJSON(sewaFile);
        const userSewa = sewaData[userId];
        const now = Date.now();
        const expired = userSewa?.expired === 'Forever' ? Infinity : userSewa?.expired;
        const isActive = userSewa?.active && (expired === Infinity || expired > now);
        
        if (!isActive) {
            return sendPlainMessage(chatId, 
                '❌ *Akses ditolak!*\n\n' +
                'Fitur ini hanya untuk:\n' +
                '├ 👑 Owner/Admin\n' +
                '└ 🤖 User dengan sewa aktif\n\n' +
                '📌 Sewa bot: /sewa',
                { parse_mode: 'Markdown' }
            );
        }
    }
    
    if (!query || query.trim().length < 2) {
        return sendPlainMessage(chatId, 
            '❌ *Masukkan kata kunci!*\n\n' +
            '📌 Format:\n' +
            '/leak [kata kunci]\n\n' +
            '📌 Contoh:\n' +
            '/leak john@gmail.com\n' +
            '/leak @username\n' +
            '/leak 08123456789\n' +
            '/leak nama orang\n\n' +
            '💰 *Biaya:* 100 request pertama GRATIS\n' +
            '📊 Cek saldo: /leaksaldo',
            { parse_mode: 'Markdown' }
        );
    }
    
    const keyword = query.trim();
    
    // Kirim loading
    const loading = await bot.sendMessage(chatId, 
        `⏳ *Mencari data untuk:*\n\`${keyword}\`\n\nMohon tunggu sebentar...`,
        { parse_mode: 'Markdown' }
    );
    
    try {
        // Panggil API
        const result = await leakosint.searchLeak(keyword);
        
        // Hapus loading
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        
        if (!result.success) {
            return sendPlainMessage(chatId, 
                `❌ *Gagal mencari data*\n\nError: ${result.error}`,
                { parse_mode: 'Markdown' }
            );
        }
        
        if (result.total === 0) {
            return sendPlainMessage(chatId, 
                `🔍 *Tidak ditemukan data untuk:*\n\`${keyword}\``,
                { parse_mode: 'Markdown' }
            );
        }
        
        // Format hasil
        const text = leakosint.formatResultsForTelegram(result);
        
        // Kirim hasil dengan tombol
        // Kirim hasil dengan tombol (PAKAI HTML)
await bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',  // ✅ PAKAI HTML!
    reply_markup: {
        inline_keyboard: [
            [{ text: "📊 CEK SALDO", callback_data: "leak_saldo" }],
            [{ text: "🔍 CARI LAGI", callback_data: "leak_cari" }]
        ]
    }
});
        
        // Log
        console.log(`✅ [LEAK] ${userId} mencari: ${keyword} - Total: ${result.total}`);
        
    } catch (error) {
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        console.error('❌ [LEAK] Error:', error.message);
        sendPlainMessage(chatId, 
            `❌ *Error*\n\n${error.message}`,
            { parse_mode: 'Markdown' }
        );
    }
});

// 📊 CEK SALDO LEAKOSINT
bot.onText(/^\/leaksaldo$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Cek akses
    if (!isAuthorized(userId)) {
        const sewaFile = path.join(__dirname, 'sewa_aktif.json');
        let sewaData = loadJSON(sewaFile);
        const userSewa = sewaData[userId];
        const now = Date.now();
        const expired = userSewa?.expired === 'Forever' ? Infinity : userSewa?.expired;
        const isActive = userSewa?.active && (expired === Infinity || expired > now);
        
        if (!isActive) {
            return sendPlainMessage(chatId, '❌ Khusus owner/admin atau user sewa aktif!');
        }
    }
    
    const loading = await bot.sendMessage(chatId, '⏳ *Mengecek saldo...*', {
        parse_mode: 'Markdown'
    });
    
    try {
        const result = await leakosint.checkBalance();
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        
        if (!result.success) {
            return sendPlainMessage(chatId, `❌ Gagal: ${result.error}`);
        }
        
        const data = result.data;
        let text = `💳 *SALDO LEAKOSINT*\n\n`;
        text += `💰 Saldo: $${data.balance || 0}\n`;
        text += `🪙 Token: ${data.tokens || 0}\n`;
        text += `❤️ Regenerasi: ${data.regeneration || 0}/detik\n`;
        text += `🚧 Kedalaman: ${data.depth || 300}\n\n`;
        text += `📌 Cari data: /leak [kata kunci]`;
        
        await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
        
    } catch (error) {
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        sendPlainMessage(chatId, `❌ Error: ${error.message}`);
    }
});


// ==========================================
// 🔥 AUTOGOPAY COMMANDS - KHUSUS GOPAY
// ==========================================

bot.onText(/^\/gopay$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAuthorized(userId)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }

    const loading = await bot.sendMessage(chatId, '⏳ *Mengambil data GoPay...*\n\n📊 Mohon tunggu sebentar...', {
        parse_mode: 'Markdown'
    });

    try {
        const stats = await autogopay.getGoPayStatsWithCache(false);
        
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}

        if (!stats || !stats.success) {
            return sendPlainMessage(chatId, `❌ Gagal mengambil data GoPay: ${stats?.error || 'Unknown error'}`);
        }

        const message = autogopay.formatGoPayMessage(stats);

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔄 REFRESH", callback_data: "gopay_refresh" }],
                    [{ text: "📊 DETAIL 7 HARI", callback_data: "gopay_detail" }],
                    [{ text: "🔙 KEMBALI", callback_data: "back_to_main" }]
                ]
            }
        });

    } catch (error) {
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        console.error('❌ [GOPAY] Error:', error.message);
        sendPlainMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// ===== ALIAS COMMAND =====
bot.onText(/^\/gopaystats$/, async (msg) => {
    bot.emit('text', { 
        chat: { id: msg.chat.id }, 
        from: { id: msg.from.id }, 
        text: '/gopay' 
    });
});

bot.onText(/^\/pendapatan$/, async (msg) => {
    bot.emit('text', { 
        chat: { id: msg.chat.id }, 
        from: { id: msg.from.id }, 
        text: '/gopay' 
    });
});

bot.onText(/^\/gopayrefresh$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAuthorized(userId)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }
    
    // Force refresh cache
    await autogopay.getGoPayStatsWithCache(true);
    sendPlainMessage(chatId, '✅ Cache GoPay berhasil di-refresh!\n\n📌 Ketik /gopay untuk melihat data terbaru.');
});

// ==========================================
// 🔥 GOMERCH COMMANDS
// ==========================================

// 📊 CEK MUTASI GOMERCH
bot.onText(/^\/gomerchmutasi$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }
    
    const loading = await bot.sendMessage(chatId, '⏳ *Mengambil mutasi GoMerch...*', {
        parse_mode: 'Markdown'
    });
    
    try {
        const result = await gomerch.getMutasi();
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        
        if (!result.success) {
            return sendPlainMessage(chatId, `❌ Gagal: ${result.error || 'Unknown error'}`);
        }
        
        const transactions = result.data?.transactions || [];
        if (transactions.length === 0) {
            return sendPlainMessage(chatId, '📊 Tidak ada transaksi hari ini');
        }
        
        let text = `📊 *MUTASI GOMERCH (HARI INI)*\n\n`;
        let total = 0;
        
        transactions.slice(0, 10).forEach((t, i) => {
            const amount = t.gross_amount || 0;
            total += amount;
            text += `${i+1}. Rp${formatRupiah(amount)}\n`;
            text += `   Status: ${t.transaction_status || '-'}\n`;
            text += `   Waktu: ${t.transaction_time || '-'}\n\n`;
        });
        
        text += `━━━━━━━━━━━━━━━━━━━━\n`;
        text += `💰 Total: Rp${formatRupiah(total)}\n`;
        text += `📊 Jumlah: ${transactions.length} transaksi`;
        
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        
    } catch (error) {
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        sendPlainMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// 🔄 REFRESH TOKEN GOMERCH
bot.onText(/^\/gomerchrefresh$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }
    
    const loading = await bot.sendMessage(chatId, '⏳ *Merefresh token GoMerch...*', {
        parse_mode: 'Markdown'
    });
    
    try {
        const result = await gomerch.refreshToken();
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        
        if (result) {
            await bot.sendMessage(chatId, 
                `✅ *Token GoMerch berhasil di-refresh!*\n\n` +
                `📌 Token baru sudah disimpan.\n` +
                `📌 Coba generate QRIS lagi.`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await bot.sendMessage(chatId, 
                `❌ *Gagal refresh token GoMerch*\n\n` +
                `📌 Kemungkinan refresh token juga expired.\n` +
                `📌 Perlu update manual di config.js`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (error) {
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        sendPlainMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// 📊 STATUS GOMERCH
bot.onText(/^\/gomerchstatus$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }
    
    const status = gomerch.state;
    const text = 
`📊 *STATUS GOMERCH*

🆔 Merchant ID: ${status.merchantId || '-'}
🔑 Access Token: ${status.accessToken ? '✅ Ada' : '❌ Tidak ada'}
🔄 Refresh Token: ${status.refreshToken ? '✅ Ada' : '❌ Tidak ada'}
📡 Base URL: ${config.GOMERCH?.BASE_URL || '-'}
⚙️ Enabled: ${config.GOMERCH?.ENABLED ? '✅' : '❌'}

📌 Cek mutasi: /gomerchmutasi
📌 Refresh token: /gomerchrefresh`;
    
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// 🔄 TEST GOMERCH
bot.onText(/^\/gomerchtest$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }
    
    const loading = await bot.sendMessage(chatId, '⏳ *Testing GoMerch...*', {
        parse_mode: 'Markdown'
    });
    
    try {
        const result = await gomerch.generateQRIS(1000, 'Test GoMerch');
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        
        if (!result.success) {
            return sendPlainMessage(chatId, `❌ Gagal test GoMerch: ${result.error}`);
        }
        
        let text = `✅ *TEST GOMERCH BERHASIL!*\n\n`;
        text += `📊 Transaction ID: ${result.transaction_id}\n`;
        text += `💰 Amount: Rp${formatRupiah(result.amount)}\n`;
        text += `📅 Expiry: ${new Date(result.expiry_time).toLocaleString('id-ID')}\n`;
        text += `💳 Method: ${result.method}`;
        
        // Kirim QR code jika ada
        if (result.image_data) {
            const base64Data = result.image_data.replace(/^data:image\/\w+;base64,/, '');
            const photoBuffer = Buffer.from(base64Data, 'base64');
            await bot.sendPhoto(chatId, photoBuffer, {
                caption: text,
                parse_mode: 'Markdown'
            });
        } else {
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        }
        
    } catch (error) {
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        sendPlainMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// 📊 STATUS LEAKOSINT
bot.onText(/^\/leakstatus$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }
    
    const loading = await bot.sendMessage(chatId, '⏳ *Mengecek status...*', {
        parse_mode: 'Markdown'
    });
    
    try {
        const result = await leakosint.checkStatus();
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        
        if (!result.success) {
            return sendPlainMessage(chatId, `❌ Gagal: ${result.error}`);
        }
        
        const data = result.data;
        let text = `📊 *STATUS LEAKOSINT*\n\n`;
        text += `👤 Nama: ${data.name || '-'}\n`;
        text += `🆔 ID: ${data.id || '-'}\n`;
        text += `💵 Saldo: $${data.balance || 0}\n`;
        text += `🪙 Token: ${data.tokens || 0}\n`;
        text += `❤️ Regenerasi: ${data.regeneration || 0}/detik\n`;
        text += `🚧 Kedalaman: ${data.depth || 300}\n`;
        text += `📊 Request: ${data.requests || 0}\n`;
        text += `📅 Registrasi: ${data.registered || '-'}`;
        
        await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
        
    } catch (error) {
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        sendPlainMessage(chatId, `❌ Error: ${error.message}`);
    }
});

// ==========================================
// 🔥 PAIR QR - TANPA TOMBOL DI LOADING
// ==========================================

const pairingStatus = {};

bot.onText(/^\/pairqr(?:\s+(\d+))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const phoneNumber = match ? match[1] : null;

    if (!isAuthorized(userId)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }

    if (!phoneNumber) {
        return sendPlainMessage(chatId, 
            `📱 Kirim: /pairqr 628xxxxxxxxxx\n📌 Contoh: /pairqr 6285811121679`
        );
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanPhone.startsWith('628') || cleanPhone.length < 11) {
        return sendPlainMessage(chatId, '❌ Nomor tidak valid! Format: 628xxxxxxxxxx');
    }

    // CEK APAKAH SEDANG PROSES PAIRING
    if (pairingStatus[chatId] && pairingStatus[chatId].active) {
        return sendPlainMessage(chatId, 
            `⏳ *Masih dalam proses pairing!*\n📱 Nomor: ${pairingStatus[chatId].phone}\n⏰ Sisa waktu: ${Math.ceil((pairingStatus[chatId].expired - Date.now()) / 1000)} detik\n\n📌 Tunggu sampai selesai.`
        );
    }

    try {
        // Simpan status pairing
        pairingStatus[chatId] = {
            active: true,
            phone: cleanPhone,
            expired: Date.now() + 180000 // 3 menit
        };

        // 🔥 KIRIM PESAN LOADING TANPA TOMBOL
        const sentMsg = await bot.sendMessage(chatId, 
            `📱 *QR CODE SEDANG DIKIRIM...*\n\n📞 ${cleanPhone}\n⏳ Tunggu sebentar...`,
            {
                parse_mode: 'Markdown'
            }
        );

        global._loadingMsgId = sentMsg.message_id;

        // Panggil WA-Bot untuk pairing
        const response = await axios.post(`${config.URLS.WA_BOT}/pair`, {
    phoneNumber: cleanPhone
}, { timeout: 30000 });

        if (response.data.success) {
            console.log('✅ Pairing berhasil, menunggu QR...');
            
            setTimeout(() => {
                if (pairingStatus[chatId]) {
                    delete pairingStatus[chatId];
                }
            }, 5000);

        } else {
            throw new Error(response.data.error || 'Gagal pairing');
        }

    } catch (error) {
        console.error('❌ [PAIRQR] Error:', error.message);
        
        delete pairingStatus[chatId];
        
        try {
            await bot.deleteMessage(chatId, global._loadingMsgId);
            global._loadingMsgId = null;
        } catch (e) {}
        
        let errorMsg = `❌ Gagal! `;
        if (error.code === 'ECONNREFUSED') {
            errorMsg += `WA Bot tidak berjalan. Restart: pm2 restart wabot`;
        } else {
            errorMsg += error.message || 'Unknown error';
        }
        
        await sendPlainMessage(chatId, errorMsg);
    }
});

bot.onText(/^\/cekpair$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  try {
    const status = await bridgeTelegram.getWAStatus();
    if (status && status.connected) {
      sendPlainMessage(chatId, 
        `✅ WA Bot Terhubung!\n\n📞 Nomor: ${status.phone}\n👥 Kontak: ${status.contacts}\n⏱️ Uptime: ${formatUptime(status.uptime)}`
      );
    } else {
      sendPlainMessage(chatId, '❌ WA Bot belum terhubung.\n\nGunakan /pairwa untuk memulai pairing.');
    }
  } catch (error) {
    sendPlainMessage(chatId, '❌ Gagal cek status WA Bot');
  }
});

// ==========================================
// 🔍 CARI DATA DAERAH DARI WHATSAPP
// ==========================================

bot.onText(/^\/(cari|search)(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const keyword = match ? match[2] : null;

    if (!isAuthorized(userId)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }

    if (!keyword || keyword.trim().length < 2) {
        return sendPlainMessage(chatId, '❌ Masukkan minimal 2 huruf!');
    }

    const loading = await bot.sendMessage(chatId, `🔍 Mencari *${keyword}*...`, { parse_mode: 'Markdown' });

    try {
        const response = await axios.get(`${config.URLS.WA_BOT}/api/search-region?q=${encodeURIComponent(keyword)}`, {
            timeout: 10000
        });

        await bot.deleteMessage(chatId, loading.message_id).catch(() => {});

        if (!response.data.success) {
            return sendPlainMessage(chatId, `❌ Gagal: ${response.data.error || 'Unknown'}`);
        }

        const { total, data } = response.data;

        if (total === 0) {
            return sendPlainMessage(chatId, `😞 Tidak ditemukan data untuk *${keyword}*`, { parse_mode: 'Markdown' });
        }

        await sendPlainMessage(chatId, `📊 Ditemukan ${total} data...`);

        for (const item of data) {
            const raw = item.raw || '';
            const nomor = item.nomor || '-';

            // 🔥 KIRIM TANPA PARSE_MODE (HINDARI ERROR MARKDOWN)
            const buttons = {
                inline_keyboard: [
                    [{ text: "💬 Hubungi", url: `https://wa.me/${nomor.replace(/[^0-9]/g, '')}` }]
                ]
            };

            await bot.sendMessage(chatId, raw, {
                reply_markup: buttons
                // 🔥 TIDAK PAKAI parse_mode: 'Markdown'!
            });

            await new Promise(r => setTimeout(r, 300));
        }

        await sendPlainMessage(chatId, `✅ Selesai! ${total} data dikirim.`);

    } catch (error) {
        await bot.deleteMessage(chatId, loading.message_id).catch(() => {});
        console.error('❌ Search error:', error.message);
        sendPlainMessage(chatId, `❌ Error: ${error.message}`);
    }
});

bot.onText(/^\/stopcari$/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        await axios.post(`${config.URLS.WA_BOT}/api/deactivate-search`, { chatId });
        await sendPlainMessage(chatId, '⏹️ Mode pencarian dihentikan.');
    } catch (error) {
        await sendPlainMessage(chatId, '❌ Gagal menghentikan mode pencarian.');
    }
});

bot.onText(/^\/statuswa$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  const status = await bridgeTelegram.getWAStatus();
  if (!status) return sendPlainMessage(chatId, `❌ WA Bot offline\nPastikan WA bot berjalan di port ${config.PORTS.WA_BOT}`);
  
  let text = `📊 STATUS WHATSAPP BOT\n\n`;
  text += `📱 Status: ${status.connected ? '✅ Online' : '❌ Offline'}\n`;
  text += `📞 Nomor: ${status.phone || '-'}\n`;
  text += `👥 Kontak: ${status.contacts || 0}\n`;
  text += `⏱️ Uptime: ${formatUptime(status.uptime)}`;
  sendPlainMessage(chatId, text);
});

bot.onText(/^\/resetsession$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  sendPlainMessage(chatId, '⏳ Menghapus session WhatsApp...');
  
  try {
    const response = await axios.post(`${WA_API_URL}/reset-session`);
    if (response.data.status === 'success') {
      sendPlainMessage(chatId, '✅ Session WhatsApp berhasil dihapus!\n\nSilahkan pairing ulang dengan:\n/pair 628xxxxxxxxxx');
    } else {
      sendPlainMessage(chatId, '❌ Gagal menghapus session');
    }
  } catch (error) {
    sendPlainMessage(chatId, `❌ Gagal menghapus session\n\nPastikan WA Bot berjalan di port ${config.PORTS.WA_BOT}`);
  }
});

bot.onText(/^\/restartwa$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  // 🔥 KIRIM PESAN LOADING
  const loadingMsg = await bot.sendMessage(chatId, '⏳ *Merestart WA Bot...*\n\n📱 Mohon tunggu sebentar...', {
    parse_mode: 'Markdown'
  });
  
  try {
    const { exec } = require('child_process');
    exec('pm2 restart wabot', async (error) => {
      if (error) {
        try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
        return sendPlainMessage(chatId, '❌ Gagal restart WA Bot');
      }
      
      // 🔥 HAPUS LOADING SETELAH 3 DETIK
      setTimeout(async () => {
        try {
          await bot.deleteMessage(chatId, loadingMsg.message_id);
          console.log(`🗑️ [RESTART] Loading dihapus untuk ${chatId}`);
        } catch (e) {}
        
        // 🔥 TIDAK KIRIM PESAN SUKSES - LANGSUNG HAPUS!
        // HANYA LOG DI CONSOLE
        console.log(`✅ [RESTART] WA Bot berhasil direstart untuk ${chatId}`);
        
      }, 3000);
    });
  } catch (error) {
    try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
    sendPlainMessage(chatId, '❌ Gagal restart WA Bot');
  }
});

bot.onText(/^\/logswa$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  try {
    const { exec } = require('child_process');
    exec('pm2 logs wabot --lines 15 --nostream', (error, stdout, stderr) => {
      if (error) {
        sendPlainMessage(chatId, '❌ Gagal mengambil logs');
        return;
      }
      const logs = stdout || stderr;
      if (logs.length > 4000) {
        sendPlainMessage(chatId, '📋 LOG WA BOT (Terpotong)\n\n' + logs.slice(-3500));
      } else {
        sendPlainMessage(chatId, '📋 LOG WA BOT\n\n' + logs);
      }
    });
  } catch (error) {
    sendPlainMessage(chatId, '❌ Gagal mengambil logs');
  }
});

bot.onText(/^\/broadcastwa (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  const message = match[1];
  sendPlainMessage(chatId, `⏳ Mengirim broadcast ke semua kontak WA...`);
  
  try {
    const response = await axios.post(`${WA_API_URL}/broadcast-wa`, {
      message: message,
      from: 'Telegram Bot'
    });
    sendPlainMessage(chatId, 
      `✅ Broadcast selesai\n\n📤 Terkirim: ${response.data.sent}\n❌ Gagal: ${response.data.failed}\n👥 Total: ${response.data.total}`
    );
  } catch (error) {
    sendPlainMessage(chatId, '❌ Gagal broadcast\n\nPastikan WA bot berjalan');
  }
});

bot.onText(/^\/sendwa (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  const args = match[1].split(' ');
  const phoneNumber = args[0];
  const message = args.slice(1).join(' ');
  
  if (!phoneNumber || !message) return sendPlainMessage(chatId, '❌ Format: /sendwa 628xxx pesan');
  if (!phoneNumber.match(/^628\d{8,13}$/)) return sendPlainMessage(chatId, '❌ Nomor tidak valid!');
  
  const result = await bridgeTelegram.sendToWhatsApp(phoneNumber, message);
  if (result) {
    sendPlainMessage(chatId, `✅ Pesan terkirim ke ${phoneNumber}`);
  } else {
    sendPlainMessage(chatId, '❌ Gagal kirim pesan');
  }
});

bot.onText(/^\/testwa$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  try {
    const status = await bridgeTelegram.getWAStatus();
    if (status && status.connected) {
      sendPlainMessage(chatId, `✅ WA Bot terhubung!\n📞 ${status.phone}\n👥 ${status.contacts} kontak`);
    } else {
      sendPlainMessage(chatId, '❌ WA Bot tidak terhubung!\nGunakan /pairwa');
    }
  } catch (error) {
    sendPlainMessage(chatId, '❌ Gagal koneksi ke WA Bot');
  }
});

// ===== TEST BRIDGE =====
bot.onText(/^\/testbridge$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  try {
    const response = await axios.get('http://localhost:3004/test-bridge');
    if (response.data.status === 'ok') {
      sendPlainMessage(chatId, '✅ Bridge berjalan! Cek pesan notifikasi.');
    } else {
      sendPlainMessage(chatId, '❌ Bridge error!');
    }
  } catch (error) {
    sendPlainMessage(chatId, '❌ Bridge tidak merespon!');
  }
});

// ==========================================
// 🔥 PAIRING & REPAIR WA BOT - TELEGRAM (FULL FIXED)
// ==========================================

// 🔥 PAIRING - KONEKSI PERTAMA KALI
bot.onText(/^\/pair(?:\s+(\d+))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const phoneNumber = match ? match[1] : null;

    if (!isAuthorized(userId)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }
    

    try {
        const status = await axios.get(`${config.URLS.WA_BOT}/api/pairing-status`, { timeout: 2000 });
        if (status.data && status.data.connected) {
            return sendPlainMessage(chatId, 
                `❌ Bot sudah terhubung!\n\n📱 Nomor: ${status.data.phone}\n\n📌 Ganti nomor? Gunakan:\n/repair 628xxxxxxxxxx`
            );
        }
    } catch (e) {}

    if (!phoneNumber) {
        return sendPlainMessage(chatId, 
            `📱 PAIRING WA BOT\n\n📌 Untuk koneksi pertama kali:\n/pair 628xxxxxxxxxx\n\n📌 Contoh:\n/pair 6283830803474\n\n📌 Ganti nomor? Gunakan:\n/repair 628xxxxxxxxxx`
        );
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanPhone.startsWith('628') || cleanPhone.length < 11) {
        return sendPlainMessage(chatId, 
            `❌ Nomor tidak valid!\n\nFormat: 628xxxxxxxxxx\nContoh: /pair 6283830803474`
        );
    }

    await sendPlainMessage(chatId, 
        `⏳ Memulai pairing...\n\n📱 Nomor: ${cleanPhone}\n⏱️ Mohon tunggu...`
    );

try {
    const response = await axios.post(`${config.URLS.WA_BOT}/pair`, {
        phoneNumber: cleanPhone
    }, { timeout: 30000 });

        if (response.data.success) {
            const code = response.data.code;
            
            await sendPlainMessage(chatId,
                `✅ PAIRING BERHASIL DIMULAI!\n\n📱 Nomor: ${cleanPhone}\n🔑 Kode: ${code}\n\n📌 Langkah selanjutnya:\n1. Buka WhatsApp di HP ${cleanPhone}\n2. Buka Perangkat tertaut > Tautkan perangkat\n3. Masukkan kode: ${code}\n4. Tunggu 5-10 detik sampai terhubung ✅\n\n📌 Cek status: /pairstatus`
            );

            await bot.sendMessage(OWNER_ID,
                `🔔 PAIRING REQUEST\n\n📱 Nomor: ${cleanPhone}\n🔑 Kode: ${code}\n👤 Oleh: @${msg.from.username || msg.from.first_name}`
            );

        } else {
            throw new Error(response.data.error || 'Gagal pairing');
        }

    } catch (error) {
        console.error('❌ [PAIR] Error:', error.message);
        
        let errorMsg = `❌ Gagal pairing!\n\n`;
        
        if (error.code === 'ECONNREFUSED') {
            errorMsg += `⚠️ WA Bot tidak berjalan!\n\nRestart: pm2 restart wabot`;
        } else if (error.response?.data?.error) {
            errorMsg += error.response.data.error;
        } else {
            errorMsg += error.message || 'Unknown error';
        }
        
        await sendPlainMessage(chatId, errorMsg);
    }
});

// 🔥 REPAIR - GANTI NOMOR (HAPUS SESSION LAMA)
bot.onText(/^\/repair(?:\s+(\d+))?$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const phoneNumber = match ? match[1] : null;

    if (!isAuthorized(userId)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }

    if (!phoneNumber) {
        return sendPlainMessage(chatId, 
            `🔧 REPAIR WA BOT - GANTI NOMOR\n\n📌 Fungsi:\nMenghapus session lama dan pairing dengan nomor baru.\n\n📌 Format:\n/repair 628xxxxxxxxxx\n\n📌 Contoh:\n/repair 6283830803474\n\n⚠️ Perhatian:\nSession lama akan DIHAPUS!\nWA Bot akan putus koneksi dan pairing ulang.`
        );
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanPhone.startsWith('628') || cleanPhone.length < 11) {
        return sendPlainMessage(chatId, 
            `❌ Nomor tidak valid!\n\nFormat: 628xxxxxxxxxx\nContoh: /repair 6283830803474`
        );
    }

    await sendPlainMessage(chatId, 
        `⚠️ KONFIRMASI REPAIR\n\n📱 Nomor baru: ${cleanPhone}\n\n⚠️ Session lama akan DIHAPUS!\nWA Bot akan putus koneksi.\n\n📌 Ketik ulang perintah untuk konfirmasi:\n/repair ${cleanPhone}`
    );

    await new Promise(r => setTimeout(r, 3000));

    await sendPlainMessage(chatId, 
        `⏳ Memproses repair...\n\n📱 Menghapus session lama...\n📱 Pairing dengan nomor baru: ${cleanPhone}`
    );

try {
    const response = await axios.post(`${config.URLS.WA_BOT}/repair`, {
        phoneNumber: cleanPhone
    }, { timeout: 30000 });

        if (response.data.success) {
            const code = response.data.code;
            
            await sendPlainMessage(chatId,
                `✅ REPAIR BERHASIL!\n\n📱 Nomor baru: ${cleanPhone}\n🔑 Kode: ${code}\n\n📌 Langkah selanjutnya:\n1. Buka WhatsApp di HP ${cleanPhone}\n2. Buka Perangkat tertaut > Tautkan perangkat\n3. Masukkan kode: ${code}\n4. Tunggu 5-10 detik sampai terhubung ✅\n\n📌 Cek status: /pairstatus`
            );

            await bot.sendMessage(OWNER_ID,
                `🔧 REPAIR SELESAI\n\n📱 Nomor baru: ${cleanPhone}\n🔑 Kode: ${code}\n👤 Oleh: @${msg.from.username || msg.from.first_name}`
            );

        } else {
            throw new Error(response.data.error || 'Gagal repair');
        }

    } catch (error) {
        console.error('❌ [REPAIR] Error:', error.message);
        
        let errorMsg = `❌ Gagal repair!\n\n`;
        
        if (error.code === 'ECONNREFUSED') {
            errorMsg += `⚠️ WA Bot tidak berjalan!\n\nRestart: pm2 restart wabot`;
        } else if (error.response?.data?.error) {
            errorMsg += error.response.data.error;
        } else {
            errorMsg += error.message || 'Unknown error';
        }
        
        await sendPlainMessage(chatId, errorMsg);
    }
});

// 🔥 CEK STATUS
bot.onText(/^\/pairstatus$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAuthorized(userId)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }
    
    try {
        const response = await axios.get(`${config.URLS.WA_BOT}/api/pairing-status`, { 
    timeout: 3000 
});
        const data = response.data;
        
        let text = `📱 STATUS WA BOT\n\n`;
        text += `🔗 Status: ${data.connected ? '✅ Terhubung' : '❌ Belum terhubung'}\n`;
        text += `📞 Nomor: ${data.phone || '-'}\n\n`;
        
        if (!data.connected) {
            text += `📌 Pairing: /pair 628xxxxxxxxxx`;
        } else {
            text += `📌 Ganti nomor: /repair 628xxxxxxxxxx`;
        }
        
        await sendPlainMessage(chatId, text);
        
    } catch (error) {
        await sendPlainMessage(chatId, 
            `❌ Gagal cek status\n\nRestart WA Bot:\npm2 restart wabot`
        );
    }
});

// ==========================================
// 🔥 OWNER/ADMIN COMMANDS
// ==========================================

bot.onText(/^\/listuser$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  const userList = Object.keys(users);
  if (userList.length === 0) return sendPlainMessage(chatId, '❌ Belum ada user');
  
  let teks = `👥 LIST USER (${userList.length})\n\n`;
  userList.forEach((id, i) => {
    const user = users[id];
    teks += `${i + 1}. ID: ${id}\n   Username: ${user.username || '-'}\n   Bergabung: ${user.date || '-'}\n\n`;
  });
  
  sendPlainMessage(chatId, teks);
});

// ==========================================
// 🔥 UNPIN / LEPAS SEMAT
// ==========================================

bot.onText(/\/unpin(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    
    if (match[1]) {
        const targetId = match[1].trim();
        if (!targetId.match(/^\d+$/)) {
            return sendPlainMessage(chatId, '❌ Format: /unpin [user_id]');
        }
        try {
            await bot.unpinChatMessage(parseInt(targetId));
            return sendPlainMessage(chatId, `✅ Sematan di chat ${targetId} berhasil dilepas!`);
        } catch (e) {
            return sendPlainMessage(chatId, `❌ Gagal lepas semat: ${e.message}`);
        }
    }
    
    try {
        await bot.unpinChatMessage(chatId);
        return sendPlainMessage(chatId, '✅ Sematan berhasil dilepas!');
    } catch (e) {
        return sendPlainMessage(chatId, `❌ Gagal lepas semat: ${e.message}`);
    }
});

bot.onText(/\/unpinall/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    
    const allUsers = Object.keys(users);
    if (allUsers.length === 0) return sendPlainMessage(chatId, "❌ Tidak ada user");
    
    let sukses = 0, gagal = 0;
    await sendPlainMessage(chatId, `🚀 Melepas sematan di ${allUsers.length} user...`);
    
    for (const id of allUsers) {
        try {
            await bot.unpinChatMessage(parseInt(id));
            sukses++;
            await new Promise(r => setTimeout(r, 50));
        } catch (e) { gagal++; }
    }
    
    await sendPlainMessage(chatId, 
        `✅ Unpin All selesai\n\n✔️ Sukses: ${sukses}\n❌ Gagal: ${gagal}\n👥 Total: ${allUsers.length}`
    );
});

// ===== ADMIN MANAGEMENT (OWNER ONLY) =====
bot.onText(/^\/addadmin (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.from.id?.toString() !== OWNER_ID?.toString()) return sendPlainMessage(chatId, '❌ Khusus Owner!');
    
    const targetId = match[1].trim();
    if (!targetId.match(/^\d+$/)) {
        return sendPlainMessage(chatId, '❌ Format: /addadmin [user_id]');
    }
    
    let admins = loadAdmins();
    if (admins.includes(targetId)) {
        return sendPlainMessage(chatId, `⚠️ User ${targetId} sudah admin!`);
    }
    
    admins.push(targetId);
    saveAdmins(admins);
    
    try {
        await bot.sendMessage(targetId, '🎉 Selamat! Anda sekarang ADMIN bot!');
    } catch (e) {}
    
    sendPlainMessage(chatId, `✅ Admin ${targetId} berhasil ditambahkan!`);
});

bot.onText(/^\/addadmin$/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.from.id?.toString() !== OWNER_ID?.toString()) return sendPlainMessage(chatId, '❌ Khusus Owner!');
    
    sendPlainMessage(chatId, 
        `📖 TAMBAH ADMIN\n\n📌 Format:\n/addadmin [user_id]\n\n📌 Contoh:\n/addadmin 123456789\n\n📌 Lihat daftar admin: /listadmin`
    );
});

bot.onText(/^\/deladmin (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.from.id?.toString() !== OWNER_ID?.toString()) return sendPlainMessage(chatId, '❌ Khusus Owner!');
    
    const targetId = match[1].trim();
    let admins = loadAdmins();
    
    if (!admins.includes(targetId)) {
        return sendPlainMessage(chatId, `❌ User ${targetId} bukan admin!`);
    }
    
    admins = admins.filter(id => id !== targetId);
    saveAdmins(admins);
    
    sendPlainMessage(chatId, `✅ Admin ${targetId} berhasil dihapus!`);
});

bot.onText(/^\/deladmin$/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.from.id?.toString() !== OWNER_ID?.toString()) return sendPlainMessage(chatId, '❌ Khusus Owner!');
    
    sendPlainMessage(chatId, 
        `📖 HAPUS ADMIN\n\n📌 Format:\n/deladmin [user_id]\n\n📌 Contoh:\n/deladmin 123456789\n\n📌 Lihat daftar admin: /listadmin`
    );
});

bot.onText(/^\/listadmin$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) {
        return sendPlainMessage(chatId, '❌ Tidak punya akses!');
    }
    
    const admins = loadAdmins();
    if (admins.length === 0) {
        return sendPlainMessage(chatId, '📋 Belum ada admin.');
    }
    
    let teks = `👑 DAFTAR ADMIN (${admins.length})\n\n`;
    admins.forEach((id, i) => {
        const user = users[id];
        const username = user?.username || user?.first_name || '-';
        teks += `${i+1}. ID: ${id}\n   Username: ${username}\n\n`;
    });
    
    teks += `📌 Total Admin: ${admins.length}\n`;
    teks += `👑 Owner: ${OWNER_ID}`;
    
    sendPlainMessage(chatId, teks);
});

bot.onText(/^\/checkadmin (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) {
        return sendPlainMessage(chatId, '❌ Tidak punya akses!');
    }
    
    const targetId = match[1].trim();
    const admins = loadAdmins();
    const isAdmin = admins.includes(targetId);
    const isOwnerUser = targetId === OWNER_ID.toString();
    
    let statusText = '';
    if (isOwnerUser) {
        statusText = '👑 OWNER UTAMA';
    } else if (isAdmin) {
        statusText = '✅ ADMIN';
    } else {
        statusText = '❌ BUKAN ADMIN';
    }
    
    sendPlainMessage(chatId, 
        `🔍 STATUS ADMIN\n\n👤 User ID: ${targetId}\n📌 Status: ${statusText}`
    );
});

bot.onText(/^\/checkadmin$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) {
        return sendPlainMessage(chatId, '❌ Tidak punya akses!');
    }
    
    sendPlainMessage(chatId, 
        `📖 CEK STATUS ADMIN\n\n📌 Format:\n/checkadmin [user_id]\n\n📌 Contoh:\n/checkadmin 123456789\n\n📌 Lihat daftar admin: /listadmin`
    );
});

// ===== CEK STATUS USER SPESIFIK =====
bot.onText(/^\/cekstatus (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  const userId = match[1].trim();
  await adminMenu.cekStatusUser(chatId, userId, sendPlainMessage);
});

// ===== DELETE SEWA =====
bot.onText(/^\/delsewa (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  const userId = match[1].trim();
  await adminMenu.deleteSewa(chatId, userId, sendPlainMessage, bot);
});

bot.onText(/^\/delsewa$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  sendPlainMessage(chatId, 
    `❌ Format salah!\n\nGunakan:\n/delsewa [user_id]\n\n📌 Contoh:\n/delsewa 123456789\n\n📌 Lihat daftar user: /listuser`
  );
});

bot.onText(/^\/ceksewaall$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  const sewaFile = path.join(__dirname, 'sewa_aktif.json');
  let sewaData = loadJSON(sewaFile);
  
  const aktif = Object.keys(sewaData).filter(id => sewaData[id].active);
  if (aktif.length === 0) return sendPlainMessage(chatId, '📊 Tidak ada sewa aktif');
  
  let teks = `📊 SEWA AKTIF (${aktif.length})\n\n`;
  aktif.forEach((id) => {
    const s = sewaData[id];
    const sisa = Math.ceil((s.expired - Date.now()) / (1000 * 60 * 60 * 24));
    teks += `👤 ${id}\n📦 ${s.duration}\n⏳ Sisa ${sisa} hari\n\n`;
  });
  
  sendPlainMessage(chatId, teks);
});

bot.onText(/\/broadcast(?: (.+))?/s, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  await deletePreviousMessage(chatId);
  if (!match[1]) return sendPlainMessage(chatId, "📌 Format: /broadcast isi pesan");
  
  const text = match[1];
  const allUsers = Object.keys(users);
  if (allUsers.length === 0) return sendPlainMessage(chatId, "❌ Tidak ada user");
  
  let sukses = 0, gagal = 0;
  await sendPlainMessage(chatId, `🚀 Mengirim broadcast ke ${allUsers.length} user...`);
  
  for (const id of allUsers) {
    try {
      await bot.sendMessage(parseInt(id), text);
      sukses++;
      await new Promise(r => setTimeout(r, 50));
    } catch (e) { gagal++; }
  }
  
  await sendPlainMessage(chatId, `✅ Broadcast selesai\n\n✔️ Sukses: ${sukses}\n❌ Gagal: ${gagal}`);
});

// ==========================================
// 🔥 PHOTO BROADCAST HANDLERS
// ==========================================

bot.on("photo", async (msg) => {
    if (!isAuthorized(msg.from.id)) return;
    
    const caption = msg.caption || "";
    
    if (caption.startsWith("/broadcastfoto")) {
        await deletePreviousMessage(msg.chat.id);
        const allUsers = Object.keys(users);
        if (allUsers.length === 0) return sendPlainMessage(msg.chat.id, "❌ Tidak ada user");
        
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        const captionText = caption.replace("/broadcastfoto", "").trim();
        
        let sukses = 0, gagal = 0;
        await sendPlainMessage(msg.chat.id, `🚀 Mengirim broadcast foto ke ${allUsers.length} user...`);
        
        for (const id of allUsers) {
            try {
                await bot.sendPhoto(parseInt(id), photoId, { caption: captionText });
                sukses++;
                await new Promise(r => setTimeout(r, 100));
            } catch (e) { gagal++; }
        }
        
        await sendPlainMessage(msg.chat.id, 
            `✅ Broadcast Foto selesai\n\n✔️ Sukses: ${sukses}\n❌ Gagal: ${gagal}\n👥 Total: ${allUsers.length}`
        );
        return;
    }

    if (caption.startsWith("/broadcastfototag")) {
        await deletePreviousMessage(msg.chat.id);
        const allUsers = Object.keys(users);
        if (allUsers.length === 0) return sendPlainMessage(msg.chat.id, "❌ Tidak ada user");
        
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        const captionText = caption.replace("/broadcastfototag", "").trim() || "📸 Foto dari Admin";
        
        let sukses = 0, gagal = 0;
        await sendPlainMessage(msg.chat.id, `🚀 Mengirim broadcast foto tag ke ${allUsers.length} user...`);
        
        for (const id of allUsers) {
            try {
                const user = users[id];
                let mention = '';
                if (user && user.username) {
                    mention = `@${user.username}`;
                } else {
                    mention = `[${id}](tg://user?id=${id})`;
                }
                const fullCaption = `${captionText}\n\n📌 ${mention}`;
                await bot.sendPhoto(parseInt(id), photoId, { caption: fullCaption });
                sukses++;
                await new Promise(r => setTimeout(r, 100));
            } catch (e) { gagal++; }
        }
        
        await sendPlainMessage(msg.chat.id, 
            `✅ Broadcast Foto Tag selesai\n\n✔️ Sukses: ${sukses}\n❌ Gagal: ${gagal}\n👥 Total: ${allUsers.length}`
        );
        return;
    }
    
    if (caption.startsWith("/broadcastfotopin")) {
        await deletePreviousMessage(msg.chat.id);
        const allUsers = Object.keys(users);
        if (allUsers.length === 0) return sendPlainMessage(msg.chat.id, "❌ Tidak ada user");
        
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        const captionText = caption.replace("/broadcastfotopin", "").trim() || "📸 Foto dari Admin";
        const fullCaption = `${captionText}`;
        
        let sukses = 0, gagal = 0, pinned = 0;
        await sendPlainMessage(msg.chat.id, `🚀 Mengirim broadcast foto pin ke ${allUsers.length} user...`);
        
        for (const id of allUsers) {
            try {
                const sent = await bot.sendPhoto(parseInt(id), photoId, { caption: fullCaption });
                sukses++;
                try {
                    await bot.pinChatMessage(parseInt(id), sent.message_id, { disable_notification: false });
                    pinned++;
                } catch (pinError) {}
                await new Promise(r => setTimeout(r, 100));
            } catch (e) { gagal++; }
        }
        
        await sendPlainMessage(msg.chat.id, 
            `✅ Broadcast Foto Pin selesai\n\n✔️ Sukses: ${sukses}\n📌 Disematkan: ${pinned}\n❌ Gagal: ${gagal}\n👥 Total: ${allUsers.length}`
        );
        return;
    }
});

// ==========================================
// 🔥 VIDEO BROADCAST HANDLERS
// ==========================================

bot.on("video", async (msg) => {
    if (!isAuthorized(msg.from.id)) return;
    
    const caption = msg.caption || "";
    
    if (caption.startsWith("/broadcastvideo")) {
        await deletePreviousMessage(msg.chat.id);
        const allUsers = Object.keys(users);
        if (allUsers.length === 0) return sendPlainMessage(msg.chat.id, "❌ Tidak ada user");
        
        const videoId = msg.video.file_id;
        const captionText = caption.replace("/broadcastvideo", "").trim() || "🎥 Video dari Admin";
        
        let sukses = 0, gagal = 0;
        await sendPlainMessage(msg.chat.id, `🚀 Mengirim broadcast video ke ${allUsers.length} user...`);
        
        for (const id of allUsers) {
            try {
                await bot.sendVideo(parseInt(id), videoId, { caption: captionText });
                sukses++;
                await new Promise(r => setTimeout(r, 150));
            } catch (e) { gagal++; }
        }
        
        await sendPlainMessage(msg.chat.id, 
            `✅ Broadcast Video selesai\n\n✔️ Sukses: ${sukses}\n❌ Gagal: ${gagal}\n👥 Total: ${allUsers.length}`
        );
        return;
    }
    
    if (caption.startsWith("/broadcastvideotag")) {
        await deletePreviousMessage(msg.chat.id);
        const allUsers = Object.keys(users);
        if (allUsers.length === 0) return sendPlainMessage(msg.chat.id, "❌ Tidak ada user");
        
        const videoId = msg.video.file_id;
        const captionText = caption.replace("/broadcastvideotag", "").trim() || "🎥 Video dari Admin";
        
        let sukses = 0, gagal = 0;
        await sendPlainMessage(msg.chat.id, `🚀 Mengirim broadcast video tag ke ${allUsers.length} user...`);
        
        for (const id of allUsers) {
            try {
                const user = users[id];
                let mention = '';
                if (user && user.username) {
                    mention = `@${user.username}`;
                } else {
                    mention = `[${id}](tg://user?id=${id})`;
                }
                const fullCaption = `${captionText}\n\n📌 ${mention}`;
                await bot.sendVideo(parseInt(id), videoId, { caption: fullCaption });
                sukses++;
                await new Promise(r => setTimeout(r, 150));
            } catch (e) { gagal++; }
        }
        
        await sendPlainMessage(msg.chat.id, 
            `✅ Broadcast Video Tag selesai\n\n✔️ Sukses: ${sukses}\n❌ Gagal: ${gagal}\n👥 Total: ${allUsers.length}`
        );
        return;
    }
    
    if (caption.startsWith("/broadcastvideopin")) {
        await deletePreviousMessage(msg.chat.id);
        const allUsers = Object.keys(users);
        if (allUsers.length === 0) return sendPlainMessage(msg.chat.id, "❌ Tidak ada user");
        
        const videoId = msg.video.file_id;
        const captionText = caption.replace("/broadcastvideopin", "").trim() || "🎥 Video dari Admin";
        const fullCaption = `${captionText}`;
        
        let sukses = 0, gagal = 0, pinned = 0;
        await sendPlainMessage(msg.chat.id, `🚀 Mengirim broadcast video pin ke ${allUsers.length} user...`);
        
        for (const id of allUsers) {
            try {
                const sent = await bot.sendVideo(parseInt(id), videoId, { caption: fullCaption });
                sukses++;
                try {
                    await bot.pinChatMessage(parseInt(id), sent.message_id, { disable_notification: false });
                    pinned++;
                } catch (pinError) {}
                await new Promise(r => setTimeout(r, 150));
            } catch (e) { gagal++; }
        }
        
        await sendPlainMessage(msg.chat.id, 
            `✅ Broadcast Video Pin selesai\n\n✔️ Sukses: ${sukses}\n📌 Disematkan: ${pinned}\n❌ Gagal: ${gagal}\n👥 Total: ${allUsers.length}`
        );
        return;
    }
});

// ==========================================
// 🔥 BROADCAST WITH TAG @ALL (PER USER)
// ==========================================

bot.onText(/\/broadcasttag(?: (.+))?/s, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    
    await deletePreviousMessage(chatId);
    if (!match[1]) return sendPlainMessage(chatId, 
        `📌 BROADCAST WITH TAG\n\nFormat: /broadcasttag [pesan]\n\n📌 Contoh:\n/broadcasttag Pengumuman penting untuk semua member!`
    );
    
    const text = match[1];
    const allUsers = Object.keys(users);
    if (allUsers.length === 0) return sendPlainMessage(chatId, "❌ Tidak ada user");
    
    let sukses = 0, gagal = 0;
    await sendPlainMessage(chatId, `🚀 Mengirim broadcast tag ke ${allUsers.length} user...`);
    
    for (const id of allUsers) {
        try {
            const user = users[id];
            let mention = '';
            if (user && user.username) {
                mention = `@${user.username}`;
            } else {
                mention = `[${id}](tg://user?id=${id})`;
            }
            const fullMessage = `${text}\n\n📌 ${mention}`;
            await bot.sendMessage(parseInt(id), fullMessage);
            sukses++;
            await new Promise(r => setTimeout(r, 100));
        } catch (e) { gagal++; }
    }
    
    await sendPlainMessage(chatId, 
        `✅ Broadcast Tag selesai\n\n✔️ Sukses: ${sukses}\n❌ Gagal: ${gagal}\n👥 Total: ${allUsers.length}`
    );
});

// ==========================================
// 🔥 BROADCAST WITH PIN
// ==========================================

bot.onText(/\/broadcastpin(?: (.+))?/s, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    
    await deletePreviousMessage(chatId);
    if (!match[1]) return sendPlainMessage(chatId, 
        `📌 BROADCAST WITH PIN\n\nFormat: /broadcastpin [pesan]\n\n📌 Contoh:\n/broadcastpin Pengumuman penting!\n\n📌 Untuk pin/semat otomatis, chat pesan di semat manual.`
    );
    
    const text = match[1];
    const allUsers = Object.keys(users);
    if (allUsers.length === 0) return sendPlainMessage(chatId, "❌ Tidak ada user");
    
    const fullMessage = `${text}`;
    let sukses = 0, gagal = 0;
    await sendPlainMessage(chatId, `🚀 Mengirim broadcast pin ke ${allUsers.length} user...`);
    
    for (const id of allUsers) {
        try {
            await bot.sendMessage(parseInt(id), fullMessage);
            sukses++;
            await new Promise(r => setTimeout(r, 150));
        } catch (e) { gagal++; }
    }
    
    await sendPlainMessage(chatId, 
        `✅ Broadcast selesai\n\n✔️ Sukses: ${sukses}\n❌ Gagal: ${gagal}\n👥 Total: ${allUsers.length}\n\n📌 Untuk menyematkan (pin), silakan pin manual di chat masing-masing.`
    );
});

// ==========================================
// 📦 BACKUP COMMANDS
// ==========================================

// 💾 BACKUP SEWA_AKTIF.JSON
bot.onText(/^\/backup$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }
    
    const loading = await bot.sendMessage(chatId, '⏳ *Membuat backup sewa_aktif.json...*', {
        parse_mode: 'Markdown'
    });
    
    // 🔥 PAKAI FS LANGSUNG (TANPA backupManager)
    const fs = require('fs');
    const path = require('path');
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupName = `sewa_aktif_${timestamp}.json`;
    const backupPath = path.join(backupDir, backupName);
    
    try {
        fs.copyFileSync(path.join(__dirname, 'sewa_aktif.json'), backupPath);
        const stats = fs.statSync(backupPath);
        
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        
        await bot.sendMessage(chatId, 
            `✅ *Backup berhasil!*\n\n📁 ${backupName}\n📦 ${(stats.size / 1024).toFixed(1)} KB`, 
            { parse_mode: 'Markdown' }
        );
    } catch (error) {
        try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
        await bot.sendMessage(chatId, 
            `❌ *Gagal backup!*\n\nError: ${error.message}`, 
            { parse_mode: 'Markdown' }
        );
    }
});

// 📦 BACKUP ZIP FULL
bot.onText(/^\/backupzip$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }
    
    const loading = await bot.sendMessage(chatId, '⏳ *Membuat backup ZIP full...*', {
        parse_mode: 'Markdown'
    });
    
    const backupZip = require('./backupZip');
    const result = await backupZip.createZipBackup();
    
    try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
    
    if (result.success) {
        await bot.sendMessage(chatId, 
            `✅ *Backup ZIP berhasil!*\n\n📦 ${result.name}\n📦 ${(result.size / 1024 / 1024).toFixed(2)} MB\n\n📤 Dikirim ke channel notifikasi.`, 
            { parse_mode: 'Markdown' }
        );
    } else {
        await bot.sendMessage(chatId, 
            `❌ *Gagal backup ZIP!*\n\nError: ${result.error}`, 
            { parse_mode: 'Markdown' }
        );
    }
});

// 📋 LIST BACKUP SEWA
bot.onText(/^\/listbackup$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }
    
    const fs = require('fs');
    const path = require('path');
    const backupDir = path.join(__dirname, 'backups');
    
    if (!fs.existsSync(backupDir)) {
        return sendPlainMessage(chatId, '📂 Belum ada backup.');
    }
    
    const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('sewa_aktif_') && f.endsWith('.json'))
        .map(f => ({
            name: f,
            path: path.join(backupDir, f),
            size: fs.statSync(path.join(backupDir, f)).size,
            time: fs.statSync(path.join(backupDir, f)).mtime
        }))
        .sort((a, b) => b.time - a.time);
    
    if (files.length === 0) {
        return sendPlainMessage(chatId, '📂 Belum ada backup.');
    }
    
    let text = `📦 *BACKUP SEWA_AKTIF* (${files.length})\n\n`;
    files.slice(0, 10).forEach((b, i) => {
        const sizeKB = (b.size / 1024).toFixed(1);
        text += `${i+1}. ${b.name}\n`;
        text += `   📅 ${b.time.toLocaleString('id-ID')}\n`;
        text += `   📦 ${sizeKB} KB\n\n`;
    });
    
    await sendPlainMessage(chatId, text, { parse_mode: 'Markdown' });
});

// 📋 LIST BACKUP ZIP
bot.onText(/^\/listzip$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }
    
    const backupZip = require('./backupZip');
    const zips = backupZip.listZips();
    
    if (zips.length === 0) {
        return sendPlainMessage(chatId, '📂 Belum ada backup ZIP.');
    }
    
    let text = `📦 *BACKUP ZIP* (${zips.length})\n\n`;
    zips.slice(0, 10).forEach((z, i) => {
        const sizeMB = (z.size / 1024 / 1024).toFixed(2);
        text += `${i+1}. ${z.name}\n`;
        text += `   📅 ${z.time.toLocaleString('id-ID')}\n`;
        text += `   📦 ${sizeMB} MB\n\n`;
    });
    
    await sendPlainMessage(chatId, text, { parse_mode: 'Markdown' });
});

// 📤 KIRIM ZIP KE CHANNEL
bot.onText(/^\/sendzip$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(msg.from.id)) {
        return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
    }
    
    const backupZip = require('./backupZip');
    const zips = backupZip.listZips();
    if (zips.length === 0) {
        return sendPlainMessage(chatId, '❌ Belum ada backup ZIP! Buat dulu: /backupzip');
    }
    
    const latest = zips[0];
    
    const loading = await bot.sendMessage(chatId, `⏳ *Mengirim ${latest.name} ke channel...*`, {
        parse_mode: 'Markdown'
    });
    
    const result = await backupZip.sendZipToChannel(latest.path, latest.name, latest.size);
    
    try { await bot.deleteMessage(chatId, loading.message_id); } catch (e) {}
    
    if (result) {
        await bot.sendMessage(chatId, 
            `✅ *ZIP berhasil dikirim ke channel!*\n\n📦 ${latest.name}`, 
            { parse_mode: 'Markdown' }
        );
    } else {
        await bot.sendMessage(chatId, 
            `❌ *Gagal mengirim ZIP!*`, 
            { parse_mode: 'Markdown' }
        );
    }
});

// ==========================================
// 🔥 ADD SALDO MANUAL - SAMA KAYAK ADDSEWA
// ==========================================

bot.onText(/^\/addsaldo (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) {
    return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  }

  const args = match[1].trim().split(' ');
  if (args.length < 2) {
    return sendPlainMessage(chatId, 
      '❌ Format salah!\n\n📌 Format: /addsaldo [user_id] [jumlah]\n\n📝 Contoh:\n/addsaldo 123456789 10000\n/addsaldo 123456789 10rb\n/addsaldo 123456789 100rb\n/addsaldo 123456789 1jt'
    );
  }

  const userId = args[0];
  const amount = args[1];

  await adminMenu.addSaldoManual(chatId, userId, amount, sendPlainMessage);
});

bot.onText(/^\/addsaldo$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  sendPlainMessage(chatId, 
    `💰 *ADD SALDO MANUAL*\n\n📌 Format:\n/addsaldo [user_id] [jumlah]\n\n📌 Contoh:\n/addsaldo 123456789 10000\n/addsaldo 123456789 10rb\n/addsaldo 123456789 100rb\n/addsaldo 123456789 1jt`,
    { parse_mode: 'Markdown' }
  );
});

// ==========================================
// 🔥 DEL SALDO MANUAL - SAMA KAYAK DELSEWA
// ==========================================

bot.onText(/^\/delsaldo (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) {
    return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  }

  const args = match[1].trim().split(' ');
  if (args.length < 2) {
    return sendPlainMessage(chatId, 
      '❌ Format salah!\n\n📌 Format: /delsaldo [user_id] [jumlah]\n\n📝 Contoh:\n/delsaldo 123456789 10000\n/delsaldo 123456789 50rb'
    );
  }

  const userId = args[0];
  const amount = args[1];

  await adminMenu.deleteSaldoManual(chatId, userId, amount, sendPlainMessage);
});

bot.onText(/^\/delsaldo$/, async (msg) => {
  const chatId = msg.chat.id;
  if (!isAuthorized(msg.from.id)) return sendPlainMessage(chatId, '❌ Khusus owner/admin!');
  
  sendPlainMessage(chatId, 
    `💸 *DEL SALDO MANUAL*\n\n📌 Format:\n/delsaldo [user_id] [jumlah]\n\n📌 Contoh:\n/delsaldo 123456789 10000\n/delsaldo 123456789 50rb`,
    { parse_mode: 'Markdown' }
  );
});

// ==========================================
// 🔥 CALLBACK QUERY HANDLER (FULL FIX)
// ==========================================

bot.on("callback_query", async (q) => {
  console.log(`🔘 [CALLBACK MASUK] data="${q.data}" dari ${q.from.id}`); 
  const data = q.data;
  const isAuth = isAuthorized(q.from.id);
  const chatId = q.message.chat.id;
  await bot.answerCallbackQuery(q.id);

if (data === 'check_channel') {
  const chatId = q.message.chat.id;
  const userId = q.from.id;
  
  try {
    const chatMember = await bot.getChatMember(CHANNEL_ID, userId);
    const status = chatMember.status;
    
    if (status === 'member' || status === 'administrator' || status === 'creator') {
      // Sudah join, hapus pesan dan lanjut
      try { await bot.deleteMessage(chatId, q.message.message_id); } catch (e) {}
      
      const isAuth = isAuthorized(userId);
      const username = q.from.username || q.from.first_name || chatId;
      
      if (!hasSeenWelcome(chatId)) {
        return showWelcomeScreen(chatId, username, sendNewMessage, bot);
      }
      return menuFirst.showMainMenu(bot, chatId, isAuth, users);
    } else {
      // Belum join – kirim ulang pesan banner (edit atau kirim baru)
      const caption = `
⚠️ <b>ANDA WAJIB BERGABUNG KE CHANNEL!</b>

📌 Status: BELUM GABUNG

🔐 Klik tombol di bawah untuk bergabung ke channel.`;

      await bot.editMessageMedia(
        {
          type: "photo",
          media: CHANNEL_BANNER_URL,
          caption: caption,
          parse_mode: "HTML"
        },
        {
          chat_id: chatId,
          message_id: q.message.message_id,
          reply_markup: {
            inline_keyboard: [
              [{ text: "📢 GABUNG CHANNEL", url: CHANNEL_LINK }],
              [{ text: "✅ CEK LAGI", callback_data: "check_channel" }]
            ]
          }
        }
      );
      
      await bot.answerCallbackQuery(q.id, {
        text: "❌ Anda belum bergabung ke channel!",
        show_alert: true
      });
    }
  } catch (error) {
    console.log(`⚠️ [CHECK CHANNEL] Error: ${error.message}`);
    await bot.answerCallbackQuery(q.id, {
      text: "⚠️ Gagal cek status channel",
      show_alert: true
    });
  }
  return;
}
  
// ==========================================
// 🔥 CALLBACK BATAL PAIRING
// ==========================================

if (data && data.startsWith('batal_pair_')) {
    const phone = data.replace('batal_pair_', '');
    
    for (const [chatId, status] of Object.entries(pairingStatus)) {
        if (status.phone === phone) {
            delete pairingStatus[chatId];
            break;
        }
    }
    
    try { await bot.deleteMessage(chatId, q.message.message_id); } catch (e) {}
    
    await axios.post(`${config.URLS.WA_BOT}/stop-pairing`, {}, { timeout: 5000 }).catch(() => {});
await axios.post(`${config.URLS.WA_BOT}/reset-session`, {}, { timeout: 5000 }).catch(() => {});
    
    return;
}

// ==========================================
// 🔥 CALLBACK BATAL QR
// ==========================================

if (data && data.startsWith('batal_qr_')) {
    const targetChatId = data.replace('batal_qr_', '');
    
    await bot.answerCallbackQuery(q.id, {
        text: '❌ QR Code dibatalkan',
        show_alert: false
    });
    
    try {
        await bot.deleteMessage(chatId, q.message.message_id);
        console.log(`🗑️ [BATAL QR] QR dihapus untuk ${chatId}`);
    } catch (e) {
        console.log('❌ Gagal hapus QR:', e.message);
    }
    
    const waMenu = require('./menu_wa');
    await waMenu.showWhatsAppMenu(targetChatId, sendNewMessage, bot);
    
    return;
}

// ==========================================
// 🔥 CALLBACK COPY DATA (dari hasil cari)
// ==========================================

if (data && data.startsWith('copy_data_')) {
    // Ambil teks dari pesan asli (caption)
    const msg = q.message;
    const text = msg.text || msg.caption || '';
    // Kirim ulang teks agar mudah di-copy
    await bot.sendMessage(chatId, `📋 *DATA*\n\n${text}`, { parse_mode: 'Markdown' });
    await bot.answerCallbackQuery(q.id, { text: '✅ Data dikirim ulang untuk di-copy', show_alert: false });
    return;
}

// ==========================================
// 🔥 CALLBACK COPY KODE (KLIK LANGSUNG COPY)
// ==========================================

if (data && data.startsWith('copy_')) {
    const code = data.replace('copy_', '');
    
    // Kirim pesan dengan kode yang bisa di-copy
    await bot.sendMessage(chatId, 
        `📋 **KODE PAIRING:**\n\n\`${code}\`\n\n📌 Tap tahan kode di atas, lalu copy.`,
        { parse_mode: 'Markdown' }
    );
    
    await bot.answerCallbackQuery(q.id, { 
        text: `✅ Kode: ${code}`, 
        show_alert: true 
    });
    
    return;
}

// ==========================================
// 🔥 CALLBACK: DAERAH SAYA
// ==========================================

if (data === 'daerah_saya') {
    const sewa = sewaBot.getSewa(chatId);
    
    if (!sewa || !sewa.daerah || sewa.daerah.length === 0) {
        await bot.answerCallbackQuery(q.id, { 
            text: '❌ Belum ada daerah terdaftar!', 
            show_alert: true 
        });
        return;
    }
    
    // 🔥 SYMBOL ANGKA DALAM LINGKARAN (1-20)
    const circledNumbers = [
        '①', '②', '③', '④', '⑤', 
        '⑥', '⑦', '⑧', '⑨', '⑩',
        '⑪', '⑫', '⑬', '⑭', '⑮',
        '⑯', '⑰', '⑱', '⑲', '⑳'
    ];
    
    // 🔥 BUILD LIST DAERAH DENGAN FORMAT BARU
    let daerahList = '';
    sewa.daerah.forEach((d, i) => {
        // Parse daerah format: "KABUPATEN > KECAMATAN > KELURAHAN"
        const parts = d.split(' > ');
        const kabupaten = parts[0] || '-';
        const kecamatan = parts[1] || '-';
        const kelurahan = parts[2] || '-';
        
        // Gunakan circled number, jika lebih dari 20 pakai angka biasa
        const nomor = i < circledNumbers.length ? circledNumbers[i] : `${i+1}.`;
        
        daerahList += `${nomor} 📍 Daerah ${i+1}\n`;
        daerahList += `   Kabupaten/Kota: ${kabupaten}\n`;
        daerahList += `   Kecamatan: ${kecamatan}\n`;
        daerahList += `   Desa/Kelurahan: ${kelurahan}\n\n`;
    });
    
    const msg = 
`📍 *DAERAH SAYA*

📋 Total: ${sewa.daerah.length} daerah

${daerahList}
📌 Hapus daerah: Klik Profil > Hapus Daerah`;

    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "📍 TAMBAH DAERAH", callback_data: "tambah_daerah" }],
                [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
            ]
        }
    };
    
    // HAPUS PESAN SEBELUMNYA
    try {
        await bot.deleteMessage(chatId, q.message.message_id);
    } catch (e) {}
    
    await bot.sendMessage(chatId, msg, options);
    return;
}

// ==========================================
// 🔥 LEAKOSINT CALLBACKS
// ==========================================

if (data === 'leak_saldo') {
    // Simulasi klik /leaksaldo
    bot.emit('text', { 
        chat: { id: chatId }, 
        from: { id: q.from.id }, 
        text: '/leaksaldo' 
    });
    await bot.answerCallbackQuery(q.id);
    return;
}

// ==========================================
// 🔥 AUTOGOPAY CALLBACKS
// ==========================================

if (data === 'gopay_refresh') {
    await bot.answerCallbackQuery(q.id, { text: '🔄 Mengambil data terbaru...' });
    
    // Ambil data fresh (tanpa cache)
    const stats = await autogopay.getGoPayStatsWithCache(true);
    if (stats && stats.success) {
        const message = autogopay.formatGoPayMessage(stats);
        try {
            await bot.editMessageText(message, {
                chat_id: chatId,
                message_id: q.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔄 REFRESH", callback_data: "gopay_refresh" }],
                        [{ text: "📊 DETAIL 7 HARI", callback_data: "gopay_detail" }],
                        [{ text: "🔙 KEMBALI", callback_data: "back_to_main" }]
                    ]
                }
            });
        } catch (e) {
            // Jika edit gagal, kirim pesan baru
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔄 REFRESH", callback_data: "gopay_refresh" }],
                        [{ text: "📊 DETAIL 7 HARI", callback_data: "gopay_detail" }],
                        [{ text: "🔙 KEMBALI", callback_data: "back_to_main" }]
                    ]
                }
            });
        }
    }
    return;
}

if (data === 'gopay_detail') {
    await bot.answerCallbackQuery(q.id, { text: '📊 Mengambil detail 7 hari...' });
    
    const stats = await autogopay.getGoPayStatsWithCache(false);
    if (!stats || !stats.success) {
        return sendPlainMessage(chatId, '❌ Gagal mengambil detail transaksi');
    }
    
    const dailyData = stats.data.dailyData;
    const sortedDates = Object.keys(dailyData).sort().reverse().slice(0, 7);
    
    let detailMsg = `📊 *DETAIL TRANSAKSI GOPAY (7 Hari)*\n\n`;
    
    if (sortedDates.length === 0) {
        detailMsg += `Tidak ada transaksi GoPay dalam 7 hari terakhir.`;
    } else {
        let total7Days = 0;
        let totalTx7Days = 0;
        
        sortedDates.forEach(date => {
            const data = dailyData[date];
            total7Days += data.total;
            totalTx7Days += data.count;
            detailMsg += `📅 ${date}\n`;
            detailMsg += `├ ${autogopay.formatRupiah(data.total)}\n`;
            detailMsg += `└ ${data.count} transaksi\n\n`;
        });
        
        detailMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
        detailMsg += `📌 Total 7 hari: ${autogopay.formatRupiah(total7Days)}\n`;
        detailMsg += `📌 Rata-rata/hari: ${autogopay.formatRupiah(total7Days / sortedDates.length)}\n`;
        detailMsg += `📌 Total transaksi: ${totalTx7Days}`;
    }
    
    await bot.sendMessage(chatId, detailMsg, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 KEMBALI", callback_data: "gopay_back" }]
            ]
        }
    });
    return;
}

if (data === 'gopay_back') {
    try { await bot.deleteMessage(chatId, q.message.message_id); } catch (e) {}
    // Kembali ke menu /gopay
    bot.emit('text', { 
        chat: { id: chatId }, 
        from: { id: q.from.id }, 
        text: '/gopay' 
    });
    return;
}

if (data === 'leak_cari') {
    await bot.sendMessage(chatId, 
        '🔍 *CARI DATA LEAK*\n\n' +
        '📌 Kirim perintah:\n' +
        '/leak [kata kunci]\n\n' +
        '📌 Contoh:\n' +
        '/leak email@gmail.com\n' +
        '/leak @username\n' +
        '/leak 08123456789\n\n' +
        '💰 100 request pertama GRATIS!\n' +
        '📊 Cek saldo: /leaksaldo',
        { parse_mode: 'Markdown' }
    );
    await bot.answerCallbackQuery(q.id);
    return;
}
  // ==========================================
  // 🔥 CALLBACK LAINNYA
  // ==========================================
  
  if (data === "welcome_continue") {
    return handleWelcomeContinue(q, bot, sendNewMessage, users, isAuth);
  }
  
    // 🔥 HANDLE WEB NIK MENU
  if (data === "web_nik_menu") {
    const userId = q.from.id;
    const isOwnerUser = userId.toString() === config.BOT.OWNER_ID.toString();

    const webToken = require('./web_token.js');
    const cekSewa = require('./cek_sewa.js');

    // Cek akses
    let allowed = false;
    let statusText = '';

    if (isOwnerUser) {
      allowed = true;
      statusText = '👑 Owner Mode - UNLIMITED';
    } else {
      const sewaStatus = cekSewa.checkSewaStatus(userId);
      if (sewaStatus.allowed) {
        allowed = true;
        statusText = '✅ User Sewa Aktif';
      }
    }

    if (!allowed) {
      return bot.answerCallbackQuery(q.id, { text: '❌ Khusus Owner & User Sewa!', show_alert: true });
    }

    // Generate token
        // Generate token
    const token = webToken.generateToken(userId);

    // 🔥 AUTO-DETECT IP
    const ipHelper = require('./ip_helper.js');
    const ip = await ipHelper.detectPublicIP();

    if (!ip) {
      return bot.sendMessage(chatId, 
        '❌ *Gagal deteksi IP server*\n\n📌 Coba lagi sebentar.',
        { parse_mode: 'Markdown' }
      );
    }

    const webURL = `http://${ip}:${config.PORTS.WEB_NIK}/?token=${token}`;
    console.log(`🌐 [WEB NIK] IP: ${ip} → ${webURL}`);

    const caption = 
`🌐 *WEB NIK TO HP*

📌 Klik tombol di bawah untuk buka web cek NIK:

👤 *Status:* ${statusText}
🔑 *Token:* \`${token}\`
⏰ *Berlaku:* 30 menit

━━━━━━━━━━━━━━━━━━
💡 *Cara Pakai:*
├ 1. Klik tombol *BUKA WEB NIK*
├ 2. Masukkan NIK 16 digit
└ 3. Klik CEK NIK

⚠️ *Jangan share link ini ke orang lain!*`;

    await bot.sendMessage(chatId, caption, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "🌐 BUKA WEB NIK", url: webURL }],
          [{ text: "🔄 GENERATE TOKEN BARU", callback_data: "web_nik_menu" }],
          [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
        ]
      }
    });

    return bot.answerCallbackQuery(q.id);
  }
  
    // ==========================================
  // 🔥 CEK DPT - Minta user kirim file Excel
  // ==========================================
  if (data === 'cekdpt') {
  const userId = q.from.id;
  global.cekdptMode = global.cekdptMode || {};
  global.cekdptMode[userId] = 'ready';  // string, bukan boolean
    
    const content = 
`🔍 *CEK DPT ONLINE*

📄 *Silakan kirim file Excel (.xlsx) berisi NIK*

━━━━━━━━━━━━━━━━━━
📋 *Format File:*
• Kolom A: NIK (16 digit)
• Bisa banyak baris (multiple NIK)
• File harus .xlsx atau .xls

📌 *Langkah:*
1️⃣ Klik tombol "📎 KIRIM FILE" di bawah
2️⃣ Pilih file Excel dari HP
3️⃣ Kirim ke chat ini
4️⃣ Bot akan proses otomatis
5️⃣ Hasil dikirim ke chat ini

⏱️ _Proses ±1-3 menit tergantung jumlah NIK_`;

    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_main" }]
        ]
      }
    };
    
    try { await bot.deleteMessage(chatId, q.message.message_id); } catch (e) {}
    await bot.sendMessage(chatId, content, options);
    return;
  }
  
    // ==========================================
  // 🔥 CEK DPT V2 - Input NIK Langsung (via Callback)
  // ==========================================
  if (data === 'cekdpt_v2') {
    const userId = q.from.id;
    
    global.cekdptWaitingNik = global.cekdptWaitingNik || {};
    global.cekdptWaitingNik[userId] = true;
    
    // Reset flag V1
    if (global.cekdptMode) delete global.cekdptMode[userId];
    
    const content = 
`🆕 *CEK DPT ONLINE V2*

📝 *Kirim NIK langsung di chat (tanpa file)*

━━━━━━━━━━━━━━━━━━
📋 *Format:*
Kirim 1 NIK per baris, atau pisah dengan spasi/koma:

\`\`\`
37042356757867886
37042356757867886
37042356757867886
\`\`\`

📌 *Ketentuan:*
• NIK harus 16 digit
• Bisa 1 NIK atau banyak (max 50 NIK)
• Harga: Rp500/NIK valid
• NIK tidak terdaftar = GRATIS

📌 *Output:*
• ≤ 10 NIK → Hasil dikirim sebagai teks
• > 10 NIK → Hasil dikirim sebagai file Excel

⏱️ _Proses ±1-3 menit tergantung jumlah NIK_

💡 Kirim NIK sekarang...`;

    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ BATAL", callback_data: "back_to_main" }]
        ]
      }
    };
    
    try { await bot.deleteMessage(chatId, q.message.message_id); } catch (e) {}
    await bot.sendMessage(chatId, content, options);
    return;
  }
  

   if (data === "back_to_main" || data === "back_to_menu") {
    try { await bot.deleteMessage(chatId, q.message.message_id); } catch (e) {}
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    return menuFirst.showMainMenu(bot, chatId, isAuth, users);
  }

  if (data === "owner_menu") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    return ownerMenu(bot, q, sendNewMessage, OWNER_ID);
  }

  if (data === "sewa_menu") {
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    return sewaBot.showSewaBotMenu(chatId, sendNewMessage, bot);
  }


    if (data === "profil_menu") {
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    return menuFirst.showProfilMenu(bot, chatId);
  }

  if (data === "admin_menu") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    return adminMenu.showAdminMenu(chatId, sendNewMessage, bot);
  }

  if (data === "add_sewa_manual") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    sendPlainMessage(chatId, 
      `📖 ADD SEWA MANUAL\n\n📌 Format:\n/addsewa [user_id] [durasi]\n\n📝 Durasi: 7h, 7d, 30d, 90d, 365d\n\n📌 Contoh:\n/addsewa 67626282626 30d\n\n📌 Lihat bantuan:\n/addsewahelp`
    );
    return;
  }

  if (data === "del_sewa_manual") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    sendPlainMessage(chatId, 
      `📖 DELETE SEWA MANUAL\n\n📌 Format:\n/delsewa [user_id]\n\n📌 Contoh:\n/delsewa 67626282626\n\n📌 Lihat bantuan:\n/delsewahelp`
    );
    return;
  }

  if (data === "whatsapp_menu") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    return waMenu.showWhatsAppMenu(chatId, sendNewMessage, bot, sendNewMessageWithCleanup);
  }

  if (data === "pairwa_menu") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    return waMenu.showPairingMenu(chatId, sendNewMessage, bot, sendNewMessageWithCleanup);
  }

  if (data === "broadcastwa_menu") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    return waMenu.showBroadcastWAMenu(chatId, sendNewMessage, bot, sendNewMessageWithCleanup);
  }

  if (data === "statuswa") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    await deletePreviousMessage(chatId);
    
    const status = await bridgeTelegram.getWAStatus();
    if (!status) {
    return sendPlainMessage(chatId, `❌ WA Bot offline\nPastikan WA bot berjalan di port ${config.PORTS.WA_BOT}`);
}
    
    let text = `📊 STATUS WHATSAPP BOT\n\n`;
    text += `📱 Status: ${status.connected ? '✅ Online' : '❌ Offline'}\n`;
    text += `📞 Nomor: ${status.phone || '-'}\n`;
    text += `👥 Kontak: ${status.contacts || 0}\n`;
    text += `⏱️ Uptime: ${formatUptime(status.uptime)}`;
    return sendPlainMessage(chatId, text);
  }

  if (data === "resetsession") {
    if (!isAuth) {
      await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
      return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    await deletePreviousMessage(chatId);
    
    const loadingMsg = await bot.sendMessage(chatId, '⏳ *Menghapus Session WhatsApp...*', {
      parse_mode: 'Markdown'
    });
    
    try {
      const response = await axios.post(`${WA_API_URL}/reset-session`);
      if (response.data.status === 'success') {
        try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
        
        const notifMsg = await bot.sendMessage(chatId, '✅ *Session WhatsApp berhasil dihapus!*\n\n📌 Pairing ulang: /pair 628xxxxxxxxxx', {
          parse_mode: 'Markdown'
        });
        
        setTimeout(async () => {
          try { await bot.deleteMessage(chatId, notifMsg.message_id); } catch (e) {}
        }, 5000);
        
      } else {
        try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
        return sendPlainMessage(chatId, '❌ Gagal menghapus session');
      }
    } catch (error) {
      try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
      return sendPlainMessage(chatId, `❌ Gagal menghapus session\n\nPastikan WA Bot berjalan di port ${config.PORTS.WA_BOT}`);
    }
  }

  if (data === "restartwa") {
    console.log(`🔄 [CALLBACK] Restart WA diklik oleh ${q.from.id}`);
    
    if (!isAuth) {
      await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
      return;
    }
    
    await bot.answerCallbackQuery(q.id, { text: '⏳ Merestart WA Bot...' });
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    await deletePreviousMessage(chatId);
    
    let loadingMsg = null;
    try {
      loadingMsg = await bot.sendMessage(chatId, '⏳ *Merestart WA Bot...*\n\n📱 Mohon tunggu sebentar...', {
        parse_mode: 'Markdown'
      });
      console.log(`✅ [CALLBACK] Loading terkirim: ${loadingMsg.message_id}`);
    } catch (e) {
      console.log(`❌ [CALLBACK] Gagal kirim loading:`, e.message);
    }
    
    try {
      const { exec } = require('child_process');
      exec('pm2 restart wabot', async (error) => {
        if (error) {
          console.log(`❌ [CALLBACK] Error:`, error.message);
          try { if (loadingMsg) await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
          await bot.sendMessage(chatId, '❌ Gagal restart WA Bot');
          return;
        }
        
        setTimeout(async () => {
          try {
            if (loadingMsg) {
              await bot.deleteMessage(chatId, loadingMsg.message_id);
              console.log(`🗑️ [CALLBACK] Loading dihapus untuk ${chatId}`);
            }
          } catch (e) {
            console.log(`⚠️ [CALLBACK] Gagal hapus loading:`, e.message);
          }
          console.log(`✅ [CALLBACK] WA Bot berhasil direstart untuk ${chatId}`);
        }, 3000);
      });
    } catch (error) {
      console.log(`❌ [CALLBACK] Error:`, error.message);
      try { if (loadingMsg) await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
      await bot.sendMessage(chatId, '❌ Gagal restart WA Bot');
    }
  }

  if (data === "logswa") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    await deletePreviousMessage(chatId);
    try {
      const { exec } = require('child_process');
      exec('pm2 logs wabot --lines 15 --nostream', (error, stdout, stderr) => {
        if (error) {
          return sendPlainMessage(chatId, '❌ Gagal mengambil logs');
        }
        const logs = stdout || stderr;
        if (logs.length > 4000) {
          return sendPlainMessage(chatId, '📋 LOG WA BOT (Terpotong)\n\n' + logs.slice(-3500));
        } else {
          return sendPlainMessage(chatId, '📋 LOG WA BOT\n\n' + logs);
        }
      });
    } catch (error) {
      return sendPlainMessage(chatId, '❌ Gagal mengambil logs');
    }
  }

  if (data === "repairwa") {
    if (!isAuth) {
      await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
      return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    await deletePreviousMessage(chatId);
    
    const loadingMsg = await bot.sendMessage(chatId, '⏳ *Repair WA Bot...*\n\n📱 Menghapus session lama dan merestart...', {
      parse_mode: 'Markdown'
    });
    
    try {
      const response = await axios.post(`${WA_API_URL}/reset-session`);
      if (response.data.status === 'success') {
        const { exec } = require('child_process');
        exec('pm2 restart wabot', async (error) => {
          if (error) {
            try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
            return sendPlainMessage(chatId, '❌ Gagal merestart WA Bot\n\nSilahkan restart manual: pm2 restart wabot');
          }
          
          setTimeout(async () => {
            try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
            
            const notifMsg = await bot.sendMessage(chatId, '✅ *Repair WA Bot Selesai!*\n\n📱 Session dihapus, WA Bot direstart', {
              parse_mode: 'Markdown'
            });
            
            setTimeout(async () => {
              try { await bot.deleteMessage(chatId, notifMsg.message_id); } catch (e) {}
            }, 3000);
            
          }, 3000);
        });
      } else {
        try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
        return sendPlainMessage(chatId, '❌ Gagal menghapus session');
      }
} catch (error) {
    try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
    return sendPlainMessage(chatId, `❌ Gagal repair\n\nPastikan WA Bot berjalan di port ${config.PORTS.WA_BOT}`);
}
  }

  if (data === "list_user") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    bot.emit('text', { chat: { id: chatId }, from: { id: q.from.id }, text: '/listuser' });
    return;
  }

  if (data === "broadcast_menu") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    sendPlainMessage(chatId, "📢 Gunakan format: /broadcast isi pesan");
    return;
  }

  if (data === "statistik") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    const sewaFile = path.join(__dirname, 'sewa_aktif.json');
    let sewaData = loadJSON(sewaFile);
    const aktif = Object.keys(sewaData).filter(id => sewaData[id].active).length;
    sendPlainMessage(chatId, 
      `📊 STATISTIK BOT\n\n👥 Total User: ${Object.keys(users).length}\n🤖 Sewa Aktif: ${aktif}\n📅 Total Sewa: ${Object.keys(sewaData).length}`
    );
    return;
  }

  if (data === "setting_bot") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    sendPlainMessage(chatId, 
      `⚙️ SETTING BOT\n\n📌 Commands yang tersedia:\n/sewa - Sewa bot\n/ceksewa - Cek sewa\n/savedata - Simpan data\n/lihatdata - Lihat data\n/hapusdata - Hapus data\n/start - Menu utama`
    );
    return;
  }

  if (data === "cek_transaksi") {
    if (!isAuth) {
        await bot.answerCallbackQuery(q.id, { text: '❌ Khusus owner/admin!' });
        return;
    }
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    const sewaFile = path.join(__dirname, 'sewa_aktif.json');
    let sewaData = loadJSON(sewaFile);
    const total = Object.keys(sewaData).length;
    const aktif = Object.keys(sewaData).filter(id => sewaData[id].active).length;
    sendPlainMessage(chatId, 
      `💰 TRANSAKSI SEWA\n\n📊 Total Transaksi: ${total}\n✅ Aktif: ${aktif}\n⏰ Expired: ${total - aktif}\n\n📌 Detail: /ceksewaall`
    );
    return;
  }

  if (data === "list_stok_admin") {
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    sendPlainMessage(chatId, '❌ Fitur stok telah dihapus.\n\nGunakan fitur SEWA BOT untuk akses!');
    return;
  }

  if (data === "hapus_daerah") {
    const chatId = q.message.chat.id;
    const sewaFile = path.join(__dirname, 'sewa_aktif.json');
    let sewaData = loadJSON(sewaFile);
    
    if (!sewaData[chatId] || !sewaData[chatId].daerah || sewaData[chatId].daerah.length === 0) {
      return sendPlainMessage(chatId, '❌ Tidak ada daerah yang bisa dihapus');
    }
    
    let buttons = [];
    sewaData[chatId].daerah.forEach((d, i) => {
      buttons.push([{ text: `🗑️ ${d}`, callback_data: `hapus_daerah_${i}` }]);
    });
    buttons.push([{ text: "🔙 Batal", callback_data: "back_to_profil" }]);
    
    await bot.sendMessage(chatId, 
      `📍 Pilih daerah yang ingin dihapus:\n\n📌 Klik tombol daerah yang ingin dihapus.`,
      { reply_markup: { inline_keyboard: buttons } }
    );
    return;
  }

  if (data && data.startsWith("hapus_daerah_")) {
    const chatId = q.message.chat.id;
    const index = parseInt(data.replace("hapus_daerah_", ""));
    const sewaFile = path.join(__dirname, 'sewa_aktif.json');
    let sewaData = loadJSON(sewaFile);
    
    if (!sewaData[chatId] || !sewaData[chatId].daerah || sewaData[chatId].daerah.length === 0) {
      return sendPlainMessage(chatId, '❌ Tidak ada daerah yang bisa dihapus');
    }
    if (index < 0 || index >= sewaData[chatId].daerah.length) {
      return sendPlainMessage(chatId, '❌ Daerah tidak ditemukan');
    }
    
    const hapusDaerah = sewaData[chatId].daerah[index];
    sewaData[chatId].daerah.splice(index, 1);
    saveJSON(sewaFile, sewaData);
    
    try {
      await axios.post(`${config.URLS.WA_BOT}/api/sync-sewa-data`, {
    sewaData: sewaData,
    timestamp: Date.now()
}, { timeout: 5000 });
    } catch (e) {}
    
    try { await bot.deleteMessage(chatId, q.message.message_id); } catch (e) {}
    await sendPlainMessage(chatId, 
      `✅ Daerah berhasil dihapus!\n\n🗑️ ${hapusDaerah}\n\n📌 Data telah disinkronkan ke WA-Bot.`
    );
    setTimeout(async () => {
      await menuFirst.showProfilMenu(bot, chatId);
    }, 1500);
    return;
  }

        if (data === "back_to_profil") {
    const chatId = q.message.chat.id;
    try { await bot.deleteMessage(chatId, q.message.message_id); } catch (e) {}
    await menuFirst.showProfilMenu(bot, chatId);
    return;
  }

  // ==========================================
  // 🔥 CONTOH FORMAT DAERAH (HANDLER BARU)
  // ==========================================
  if (data === "contoh_format_daerah") {
    const content = 
`📋 <b>CONTOH FORMAT TAMBAH DAERAH</b>

<b>Format 1 (spasi):</b>
<code>/tambah SUMENEP PRAGAAN PAKAMBAN DAYA</code>

<b>Format 2 (>):</b>
<code>/tambah SUMENEP &gt; PRAGAAN &gt; PAKAMBAN DAYA</code>

<b>Format 3 (step by step):</b>
Klik tombol <b>SAVE DAERAH</b> di menu utama, lalu isi bertahap.

📌 Minimal 2 huruf per nama
📌 Bisa huruf besar/kecil`;

    const options = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🔙 KEMBALI", callback_data: "tambah_daerah" }]
            ]
        }
    };

    try { await bot.deleteMessage(chatId, q.message.message_id); } catch (e) {}
    return bot.sendMessage(chatId, content, options);
  }

  // ==========================================
  // 🔥 SEWA CALLBACK - PALING BAWAH (FALLBACK)
  // ==========================================
  const handled = await sewaBot.handleSewaCallback(q, bot, sendPlainMessage, sendNewMessage);
  if (handled) return;

  // 🔥 LOG kalau tidak ada handler
  console.log(`⚠️ [CALLBACK] Tidak ada handler untuk: ${data}`);
});

// ==========================================
// 🔥 AUTO CHECK SEWA EXPIRED (Setiap 1 Jam)
// ==========================================

setInterval(() => {
  const sewaFile = path.join(__dirname, 'sewa_aktif.json');
  if (!fs.existsSync(sewaFile)) return;
  
  try {
    let sewaData = loadJSON(sewaFile);
    let changed = false;
    const now = Date.now();
    
    for (const chatId in sewaData) {
      if (sewaData[chatId].active && sewaData[chatId].expired < now) {
        sewaData[chatId].active = false;
        changed = true;
        console.log(`⏰ Sewa expired untuk ${chatId}`);
        bot.sendMessage(chatId, 
          `⏰ Sewa Bot EXPIRED!\n\n📦 Paket: ${sewaData[chatId].duration}\n📅 Berakhir: ${sewaData[chatId].expired_date || new Date(sewaData[chatId].expired).toLocaleDateString('id-ID')}\n\n🔄 Perpanjang dengan /sewa`
        ).catch(() => {});
      }
    }
    
    if (changed) {
      saveJSON(sewaFile, sewaData);
    }
  } catch (e) {}
}, 60 * 60 * 1000);

// ==========================================
// 🔥 START BOT
// ==========================================

log("INFO", "Bot siap digunakan ✅");
console.log("🚀 Bot berjalan!");