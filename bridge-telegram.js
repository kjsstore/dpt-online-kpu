// ==========================================
// 🔥 BRIDGE TELEGRAM - WHATSAPP (FULL INTEGRASI + FORCE SYNC)
// ==========================================

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require("./config");

const bot = global.telegramBot;
if (!bot) {
    console.log('⚠️ [BRIDGE] global.telegramBot belum di-set!');
    console.log('⚠️ [BRIDGE] Mencoba mengambil dari index.js...');
    
    // 🔥 COBA AMBIL DARI FILE INDEX.JS
    try {
        const indexBot = require('./index.js');
        // Cek apakah ada bot yang tersedia
        console.log('✅ [BRIDGE] Bot dari index.js loaded');
    } catch (e) {
        console.log('⚠️ [BRIDGE] Gagal load index.js:', e.message);
    }
} else {
    console.log('✅ [BRIDGE] Telegram Bot terhubung!');
}

const app = express();
app.use(express.json());

const WA_API_URL = config.URLS.WA_BOT;
const TELEGRAM_CHAT_ID = config.BOT.OWNER_ID.toString();

// ==========================================
// 🔥 PATH FILE UNTUK SEWA & DAERAH
// ==========================================

const SEWA_FILE = path.join(__dirname, 'sewa_aktif.json');
const DAERAH_FILE = path.join(__dirname, 'daerah_user.json');

// Path untuk WA-Bot
const WA_BOT_PATH = process.env.WA_BOT_PATH || path.join(__dirname, 'wa-bot');
const WA_DATA_FOLDER = WA_BOT_PATH; 
const SEWA_FILE_WA = path.join(WA_DATA_FOLDER, 'sewa_aktif.json');
const DAERAH_FILE_WA = path.join(WA_DATA_FOLDER, 'daerah_user.json');

// ==========================================
// 🔥 FUNGSI LOAD/SAVE SEWA DATA
// ==========================================

function loadSewaData() {
    try {
        if (fs.existsSync(SEWA_FILE)) {
            const raw = fs.readFileSync(SEWA_FILE, 'utf8');
            if (!raw || raw.trim() === '') {
                return {};
            }
            return JSON.parse(raw);
        }
        return {};
    } catch (e) {
        console.log('⚠️ [SEWA] Corrupt, membuat baru:', e.message);
        return {};
    }
}

function saveSewaData(data) {
    try {
        // 1. Save lokal
        fs.writeFileSync(SEWA_FILE, JSON.stringify(data, null, 2));
        console.log(`✅ [SEWA] Saved lokal: ${SEWA_FILE}`);
        
        // 2. Save ke WA-Bot (PASTIKAN FOLDER ADA)
        if (!fs.existsSync(WA_DATA_FOLDER)) {
            console.log(`📁 [SEWA] Membuat folder: ${WA_DATA_FOLDER}`);
            fs.mkdirSync(WA_DATA_FOLDER, { recursive: true });
        }
        fs.writeFileSync(SEWA_FILE_WA, JSON.stringify(data, null, 2));
        console.log(`✅ [SEWA] Saved WA-Bot: ${SEWA_FILE_WA}`);
        console.log(`📊 [SEWA] Total users di WA-Bot: ${Object.keys(data).length}`);
        
        // 3. Kirim ke API WA-Bot
        try {
            axios.post(`${WA_API_URL}/api/sync-sewa-data`, {
                sewaData: data,
                timestamp: Date.now()
            }, { timeout: 3000 }).catch(() => {});
            console.log('✅ [SEWA] Terkirim ke API WA-Bot');
        } catch (e) {
            console.log('⚠️ [SEWA] API WA-Bot tidak merespon');
        }
        
        return { success: true };
    } catch (error) {
        console.error('❌ [SEWA] Save error:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 🔥 FUNGSI LOAD/SAVE DAERAH DATA
// ==========================================

function loadDaerahData() {
    try {
        if (fs.existsSync(DAERAH_FILE)) {
            const raw = fs.readFileSync(DAERAH_FILE, 'utf8');
            if (!raw || raw.trim() === '') {
                return {};
            }
            return JSON.parse(raw);
        }
        return {};
    } catch (e) {
        console.log('⚠️ [DAERAH] Corrupt, membuat baru:', e.message);
        return {};
    }
}

function saveDaerahData(data) {
    try {
        // 1. Save lokal
        fs.writeFileSync(DAERAH_FILE, JSON.stringify(data, null, 2));
        console.log(`✅ [DAERAH] Saved lokal: ${DAERAH_FILE}`);
        
        // 2. Save ke WA-Bot
        if (!fs.existsSync(WA_DATA_FOLDER)) {
            fs.mkdirSync(WA_DATA_FOLDER, { recursive: true });
        }
        fs.writeFileSync(DAERAH_FILE_WA, JSON.stringify(data, null, 2));
        console.log(`✅ [DAERAH] Saved WA-Bot: ${DAERAH_FILE_WA}`);
        
        // 3. Kirim ke API WA-Bot
        try {
            axios.post(`${WA_API_URL}/api/sync-daerah-data`, {
                daerahData: data,
                timestamp: Date.now()
            }, { timeout: 3000 }).catch(() => {});
        } catch (e) {
            console.log('⚠️ [DAERAH] API WA-Bot tidak merespon');
        }
        
        return { success: true };
    } catch (error) {
        console.error('❌ [DAERAH] Save error:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 🔥 FUNGSI FORCE SYNC KE WA-BOT
// ==========================================

async function forceSyncToWABot() {
    try {
        console.log('🔄 [FORCE SYNC] Mengirim semua data ke WA-Bot...');
        
        const sewaData = loadSewaData();
        const daerahData = loadDaerahData();
        
        // 1. Save ke WA-Bot
        if (!fs.existsSync(WA_DATA_FOLDER)) {
            console.log(`📁 [FORCE SYNC] Membuat folder: ${WA_DATA_FOLDER}`);
            fs.mkdirSync(WA_DATA_FOLDER, { recursive: true });
        }
        
        fs.writeFileSync(SEWA_FILE_WA, JSON.stringify(sewaData, null, 2));
        fs.writeFileSync(DAERAH_FILE_WA, JSON.stringify(daerahData, null, 2));
        
        console.log(`✅ [FORCE SYNC] SEWA: ${Object.keys(sewaData).length} users`);
        console.log(`✅ [FORCE SYNC] DAERAH: ${Object.keys(daerahData).length} users`);
        
        // 2. Kirim ke API WA-Bot
        try {
            await axios.post(`${WA_API_URL}/api/sync-sewa-data`, {
                sewaData: sewaData,
                daerahData: daerahData,
                timestamp: Date.now()
            }, { timeout: 5000 });
            console.log('✅ [FORCE SYNC] Terkirim ke API WA-Bot');
        } catch (e) {
            console.log('⚠️ [FORCE SYNC] API WA-Bot tidak merespon:', e.message);
        }
        
        // 3. Kirim force reload ke WA-Bot
        try {
            await axios.post(`${WA_API_URL}/api/force-reload`, {
                timestamp: Date.now()
            }, { timeout: 3000 });
            console.log('✅ [FORCE SYNC] Force reload WA-Bot berhasil');
        } catch (e) {
            console.log('⚠️ [FORCE SYNC] Force reload WA-Bot gagal:', e.message);
        }
        
        return { success: true };
    } catch (error) {
        console.error('❌ [FORCE SYNC] Error:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 🔥🔥🔥 FUNGSI UTAMA: TAMBAH/UPDATE USER SEWA
// ==========================================

function addOrUpdateSewa(chatId, duration, expired, startDate, expiredDate) {
    try {
        let sewaData = loadSewaData();
        
        // 🔥 PASTIKAN CHAT ID STRING
        const chatIdStr = chatId.toString();
        
        sewaData[chatIdStr] = {
            active: true,
            expired: expired || 'Forever',
            daerah: sewaData[chatIdStr]?.daerah || [],
            duration: duration,
            start_date: startDate || new Date().toISOString().split('T')[0],
            expired_date: expiredDate || 'Forever'
        };
        
        saveSewaData(sewaData);
        
        console.log(`✅ [SEWA] User ${chatIdStr} diupdate: ${duration}`);
        
        // 🔥 FORCE SYNC KE WA-BOT
        setTimeout(async () => {
            await forceSyncToWABot();
        }, 1000);
        
        return { success: true, data: sewaData[chatIdStr] };
    } catch (error) {
        console.error('❌ [SEWA] Update error:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 🔥🔥🔥 FUNGSI UTAMA: TAMBAH DAERAH KE USER
// ==========================================

function addDaerahToUser(chatId, daerahBaru) {
    try {
        const chatIdStr = chatId.toString();
        let sewaData = loadSewaData();
        let daerahData = loadDaerahData();
        
        if (!sewaData[chatIdStr]) {
            return { 
                success: false, 
                error: 'User tidak ditemukan. Silahkan sewa dulu!' 
            };
        }
        
        if (!sewaData[chatIdStr].daerah) {
            sewaData[chatIdStr].daerah = [];
        }
        
        if (sewaData[chatIdStr].daerah.includes(daerahBaru)) {
            return { 
                success: false, 
                error: `Daerah "${daerahBaru}" sudah terdaftar!` 
            };
        }
        
        // 🔥 TAMBAH DAERAH
        sewaData[chatIdStr].daerah.push(daerahBaru);
        saveSewaData(sewaData);
        
        if (!daerahData[chatIdStr]) {
            daerahData[chatIdStr] = [];
        }
        daerahData[chatIdStr].push({
            daerah: daerahBaru,
            addedAt: Date.now()
        });
        saveDaerahData(daerahData);
        
        console.log(`✅ [DAERAH] Ditambahkan untuk ${chatIdStr}: ${daerahBaru}`);
        console.log(`📊 [DAERAH] Total: ${sewaData[chatIdStr].daerah.length}`);
        
        // 🔥🔥🔥 FORCE SYNC KE WA-BOT
        setTimeout(async () => {
            console.log(`🔄 [DAERAH] Force sync ke WA-Bot untuk daerah: ${daerahBaru}`);
            await forceSyncToWABot();
        }, 1500);
        
        return { 
            success: true, 
            data: sewaData[chatIdStr],
            totalDaerah: sewaData[chatIdStr].daerah.length
        };
    } catch (error) {
        console.error('❌ [DAERAH] Add error:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 🔥 FUNGSI KIRIM KE TELEGRAM
// ==========================================

async function sendToTelegram(message, parseMode = 'Markdown') {
    try {
        const bot = global.telegramBot;
        if (!bot) {
            console.log('⚠️ [BRIDGE] Bot not initialized');
            return false;
        }
        
        // 🔥 CLEANUP MESSAGE UNTUK HINDARI ERROR
        let cleanMessage = message || '';
        if (parseMode === 'Markdown') {
            cleanMessage = cleanMessage.replace(/\*([^*]*)$/, '$1');
            cleanMessage = cleanMessage.replace(/_([^_]*)$/, '$1');
            cleanMessage = cleanMessage.replace(/`([^`]*)$/, '$1');
            cleanMessage = cleanMessage.replace(/\[([^\]]*)$/, '$1');
        }
        
        await bot.sendMessage(TELEGRAM_CHAT_ID, cleanMessage, { parse_mode: parseMode });
        console.log(`✅ [BRIDGE] Pesan terkirim ke Telegram`);
        return true;
    } catch (error) {
        console.log('❌ [BRIDGE ERROR]', error.message);
        return false;
    }
}

// ==========================================
// 🔥 FUNGSI SEND DATA KE USER DENGAN USERNAME
// ==========================================

async function sendToTelegramUser(chatId, message, reply_markup = null, username = null) {
    try {
        const bot = global.telegramBot;
        if (!bot) {
            console.log('⚠️ [BRIDGE] Bot not initialized');
            
            // 🔥 COBA INISIALISASI ULANG
            try {
                const TelegramBot = require('node-telegram-bot-api');
                const config = require("./config");
                const directBot = new TelegramBot(config.BOT.TOKEN, { polling: false });
                
                await directBot.sendMessage(chatId, message, { 
                    parse_mode: 'HTML' 
                });
                console.log(`[BRIDGE] ✅ Direct bot terkirim ke ${chatId}`);
                return true;
            } catch (e) {
                console.log('[BRIDGE] ❌ Direct bot gagal:', e.message);
                return false;
            }
        }
        
        // 🔥 CLEANUP MESSAGE
        let cleanMessage = message || '';
        cleanMessage = cleanMessage.replace(/\*([^*]*)$/, '$1');
        cleanMessage = cleanMessage.replace(/_([^_]*)$/, '$1');
        cleanMessage = cleanMessage.replace(/`([^`]*)$/, '$1');
        cleanMessage = cleanMessage.replace(/\[([^\]]*)$/, '$1');
        
        const options = { parse_mode: 'Markdown' };
        if (reply_markup) {
            options.reply_markup = reply_markup;
        }
        
        // 🔥 LOG DENGAN USERNAME JIKA ADA
        const displayName = username || chatId;
        console.log(`[BRIDGE] 📤 Kirim ke ${displayName} (${chatId}): ${message.substring(0, 50)}...`);
        
        await bot.sendMessage(chatId, cleanMessage, options);
        console.log(`[BRIDGE] ✅ Terkirim ke ${displayName}`);
        return true;
    } catch (error) {
        console.log(`[BRIDGE] ❌ Gagal kirim ke ${chatId}:`, error.message);
        return false;
    }
}

// ==========================================
// 🔥 FUNGSI SEND KE USER DENGAN BUTTON + USERNAME
// ==========================================

app.post('/send-to-telegram-user-button', async (req, res) => {
  try {
    const { chatId, message, reply_markup, parse_mode, username } = req.body;
    
    if (!chatId || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'chatId and message required'
      });
    }
    
    const displayName = username || chatId;
    console.log(`[BRIDGE] 📤 Kirim ke ${displayName} (${chatId}) dengan button...`);
    console.log(`[BRIDGE] 📝 Parse mode: ${parse_mode || 'HTML'}`);
    
    // 🔥 PERTAHANKAN <pre> TAG UNTUK CODE BLOCK
    let cleanMessage = message || '';
    
    // 🔥 CLEANUP URL DI REPLY_MARKUP
    let cleanReplyMarkup = reply_markup;
    if (cleanReplyMarkup && cleanReplyMarkup.inline_keyboard) {
      for (const row of cleanReplyMarkup.inline_keyboard) {
        for (const btn of row) {
          if (btn.url) {
            btn.url = btn.url.replace(/\*/g, '');
            btn.url = btn.url.replace(/_/g, '');
            btn.url = btn.url.replace(/`/g, '');
            btn.url = btn.url.replace(/\|/g, '');
            try {
              btn.url = encodeURI(btn.url);
            } catch (e) {}
          }
        }
      }
    }
    
    const bot = global.telegramBot;
    if (!bot) {
      console.log('[BRIDGE] ⚠️ Bot not initialized');
      
      try {
        const TelegramBot = require('node-telegram-bot-api');
        const config = require("./config");
        const directBot = new TelegramBot(config.BOT.TOKEN, { polling: false });
        
        await directBot.sendMessage(chatId, cleanMessage, {
          parse_mode: parse_mode || 'HTML',
          reply_markup: cleanReplyMarkup
        });
        console.log(`[BRIDGE] ✅ Direct bot terkirim ke ${displayName}`);
        return res.json({ status: 'success', via: 'direct' });
      } catch (e) {
        console.log('[BRIDGE] ❌ Direct bot gagal:', e.message);
        return res.status(503).json({
          status: 'error',
          message: 'Bot not initialized'
        });
      }
    }
    
    // 🔥 COBA KIRIM DENGAN HTML
    try {
      await bot.sendMessage(chatId, cleanMessage, {
        parse_mode: parse_mode || 'HTML',
        reply_markup: cleanReplyMarkup
      });
      console.log(`[BRIDGE] ✅ Terkirim ke ${displayName} dengan button (HTML)`);
      res.json({ status: 'success' });
    } catch (sendError) {
      console.log(`[BRIDGE] ❌ Gagal kirim ke ${displayName}:`, sendError.message);
      
      // 🔥 FALLBACK 1: TANPA PARSE_MODE TAPI BUTTON TETAP ADA
      try {
        await bot.sendMessage(chatId, cleanMessage, {
          reply_markup: cleanReplyMarkup
        });
        console.log(`[BRIDGE] ✅ Fallback terkirim ke ${displayName} dengan button`);
        res.json({ status: 'success', fallback: true });
      } catch (fallbackError) {
        console.log(`[BRIDGE] ❌ Fallback gagal ke ${displayName}:`, fallbackError.message);
        
        // 🔥 FALLBACK 2: KIRIM PLAIN TANPA BUTTON
        try {
          await bot.sendMessage(chatId, cleanMessage, {
            parse_mode: 'HTML'
          });
          console.log(`[BRIDGE] ✅ Plain HTML terkirim ke ${displayName}`);
          res.json({ status: 'success', fallback: true, no_button: true });
        } catch (lastError) {
          await bot.sendMessage(chatId, cleanMessage);
          console.log(`[BRIDGE] ✅ Plain terkirim ke ${displayName}`);
          res.json({ status: 'success', fallback: true, no_button: true });
        }
      }
    }
    
  } catch (error) {
    console.log('[BRIDGE] ❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 🔥 MODIFIKASI ENDPOINT WA -> TELEGRAM
// ==========================================

app.post('/wa-to-telegram', async (req, res) => {
    try {
        const { message, from, isOwner, code, phoneNumber, data, username } = req.body;
        
        console.log(`[BRIDGE] Received:`, { message: message?.substring(0, 50), code, phoneNumber, username });
        
        if (code) {
            const formattedCode = code.toString().padStart(8, '0');
            await sendToTelegram(
                `📱 *PAIRING WHATSAPP*\n\n📞 Nomor: ${phoneNumber}\n🔑 Kode: *${formattedCode}*`,
                'Markdown'
            );
            return res.json({ status: 'ok', type: 'pairing_code', code: formattedCode });
        }
        
        if (data && data.type === 'region_detection') {
            const regionData = data.region;
            const daerahFormatted = `${regionData.kabupaten} > ${regionData.kecamatan} > ${regionData.kelurahan}`;
            
            console.log(`📊 [BRIDGE] Data daerah terdeteksi:`, daerahFormatted);
            
            const sewaData = loadSewaData();
            let targetUsers = [];
            
            // 🔥 AMBIL USERNAME DARI DATA ATAU FROM
            const senderUsername = username || from || 'WhatsApp';
            
            for (const [chatId, user] of Object.entries(sewaData)) {
                if (user.active && user.daerah) {
                    const matched = user.daerah.some(d => 
                        d.includes(regionData.kabupaten) &&
                        d.includes(regionData.kecamatan) &&
                        d.includes(regionData.kelurahan)
                    );
                    if (matched) {
                        // 🔥 TAMBAHKAN USERNAME DARI DATA USER
                        const userDisplayName = user.username || user.firstName || chatId;
                        targetUsers.push({ 
                            chatId, 
                            user, 
                            displayName: userDisplayName 
                        });
                    }
                }
            }
            
            if (targetUsers.length > 0) {
                for (const { chatId, displayName } of targetUsers) {
                    const msg = `📊 *DATA DARI WA GROUP*\n\n` +
                        `📍 *Daerah:* ${daerahFormatted}\n` +
                        `📱 *Sumber:* ${senderUsername}\n` +
                        `📝 *Pesan:*\n${message || 'Data terdeteksi'}\n\n` +
                        `🕐 ${new Date().toLocaleString('id-ID')}`;
                    
                    // 🔥 KIRIM DENGAN USERNAME
                    await sendToTelegramUser(chatId, msg, null, displayName);
                    console.log(`[BRIDGE] ✅ Data dikirim ke ${displayName} (${chatId})`);
                }
                
                await sendToTelegram(
                    `📊 *DATA TERDETEKSI*\n\n` +
                    `📍 ${daerahFormatted}\n` +
                    `👥 Dikirim ke ${targetUsers.length} user\n` +
                    `📱 Dari: ${senderUsername}`
                );
                
                return res.json({ 
                    status: 'ok', 
                    type: 'region_detection',
                    delivered_to: targetUsers.length 
                });
            } else {
                console.log(`⚠️ [BRIDGE] Tidak ada user untuk daerah ini`);
                const pendingFile = path.join(__dirname, 'pending_data.json');
                let pending = [];
                if (fs.existsSync(pendingFile)) {
                    try { 
                        pending = JSON.parse(fs.readFileSync(pendingFile, 'utf8')); 
                    } catch (e) {
                        console.log('⚠️ [BRIDGE] Pending file corrupt, buat baru');
                    }
                }
                pending.push({
                    region: regionData,
                    message: message,
                    from: from,
                    username: username,
                    timestamp: Date.now()
                });
                fs.writeFileSync(pendingFile, JSON.stringify(pending, null, 2));
                
                return res.json({ 
                    status: 'pending', 
                    message: 'No user registered for this region' 
                });
            }
        }
        
        const prefix = isOwner ? '👑 [OWNER] ' : '';
        const senderDisplay = username || from || 'WhatsApp';
        const msg = `📱 ${senderDisplay}\n${prefix}💬 ${message}`;
        await sendToTelegram(msg, 'Markdown');
        
        res.json({ status: 'ok' });
    } catch (error) {
        console.log('❌ [BRIDGE ERROR]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 🔥 ENDPOINT: SEND TO TELEGRAM USER
// ==========================================

app.post('/send-to-telegram-user', async (req, res) => {
  try {
    const { chatId, message, parse_mode } = req.body;
    
    if (!chatId || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'chatId and message required'
      });
    }
    
    const bot = global.telegramBot;
    if (!bot) {
      console.log('[BRIDGE] ❌ Bot not initialized!');
      
      try {
        const TelegramBot = require('node-telegram-bot-api');
        const config = require("./config");
        const directBot = new TelegramBot(config.BOT.TOKEN, { polling: false });
        
        await directBot.sendMessage(chatId, message, { 
          parse_mode: parse_mode || 'HTML' 
        });
        console.log(`[BRIDGE] ✅ Direct bot terkirim ke ${chatId}`);
        return res.json({ status: 'success', via: 'direct' });
      } catch (e) {
        console.log('[BRIDGE] ❌ Direct bot gagal:', e.message);
        return res.status(503).json({
          status: 'error',
          message: 'Bot not initialized'
        });
      }
    }
    
    console.log(`[BRIDGE] 📤 Kirim ke user ${chatId}: ${message.substring(0, 50)}...`);
    
    try {
      await bot.sendMessage(chatId, message, { 
        parse_mode: parse_mode || 'HTML' 
      });
      console.log(`[BRIDGE] ✅ Terkirim ke ${chatId}`);
      res.json({ status: 'success' });
    } catch (sendError) {
      console.log(`[BRIDGE] ❌ Gagal kirim:`, sendError.message);
      
      try {
        await bot.sendMessage(chatId, message);
        console.log(`[BRIDGE] ✅ Fallback terkirim ke ${chatId}`);
        res.json({ status: 'success', fallback: true });
      } catch (fallbackError) {
        console.log(`[BRIDGE] ❌ Fallback gagal:`, fallbackError.message);
        res.status(500).json({ error: fallbackError.message });
      }
    }
    
  } catch (error) {
    console.log('[BRIDGE] ❌ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 🔥 ENDPOINT: UPDATE USERNAME USER SEWA
// ==========================================

app.post('/update-username', async (req, res) => {
    try {
        const { chatId, username, firstName, lastName } = req.body;
        
        if (!chatId) {
            return res.status(400).json({
                status: 'error',
                message: 'chatId required'
            });
        }
        
        console.log(`📝 [API] Update username untuk ${chatId}: ${username || firstName}`);
        
        let sewaData = loadSewaData();
        const chatIdStr = chatId.toString();
        
        if (!sewaData[chatIdStr]) {
            return res.status(404).json({
                status: 'error',
                message: 'User tidak ditemukan'
            });
        }
        
        // 🔥 UPDATE USERNAME
        if (username) {
            sewaData[chatIdStr].username = username;
        }
        if (firstName) {
            sewaData[chatIdStr].firstName = firstName;
        }
        if (lastName) {
            sewaData[chatIdStr].lastName = lastName;
        }
        
        saveSewaData(sewaData);
        
        // 🔥 FORCE SYNC KE WA-BOT
        setTimeout(async () => {
            await forceSyncToWABot();
        }, 1000);
        
        res.json({
            status: 'success',
            message: 'Username berhasil diupdate',
            data: sewaData[chatIdStr]
        });
        
    } catch (error) {
        console.log('[API] Update username error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 🔥 ENDPOINT: GET USER BY USERNAME
// ==========================================

app.get('/get-user-by-username/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        if (!username) {
            return res.status(400).json({
                status: 'error',
                message: 'username required'
            });
        }
        
        const sewaData = loadSewaData();
        const foundUsers = [];
        
        for (const [chatId, user] of Object.entries(sewaData)) {
            if (user.username && user.username.toLowerCase().includes(username.toLowerCase())) {
                foundUsers.push({
                    chatId: chatId,
                    username: user.username,
                    firstName: user.firstName || '-',
                    lastName: user.lastName || '-',
                    daerah: user.daerah || [],
                    active: user.active || false
                });
            }
        }
        
        res.json({
            status: 'success',
            total: foundUsers.length,
            data: foundUsers
        });
        
    } catch (error) {
        console.log('[API] Get user error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 🔥 ENDPOINT: SYNC ALL TO WA-BOT (DIPANGGIL OLEH ADMIN MENU)
// ==========================================

app.post('/sync-all-to-wabot', async (req, res) => {
    try {
        const { sewaData, daerahData, timestamp } = req.body;
        
        console.log(`🔄 [SYNC-ALL] Menerima sync dari admin menu...`);
        
        // 🔥 RESPON LEBIH CEPAT (SEBELUM PROSES BERAT)
        res.json({ status: 'accepted', message: 'Data diterima, diproses' });
        
        // 🔥 PROSES DI LATAR BELAKANG (TANPA MENAHAN RESPONSE)
        setImmediate(async () => {
            try {
                // Simpan data ke file
                if (sewaData && Object.keys(sewaData).length > 0) {
                    let currentSewa = loadSewaData();
                    for (const [chatId, data] of Object.entries(sewaData)) {
                        currentSewa[chatId] = {
                            ...currentSewa[chatId],
                            ...data
                        };
                    }
                    saveSewaData(currentSewa);
                    console.log(`✅ [SYNC-ALL] Sewa data disimpan: ${Object.keys(currentSewa).length} users`);
                }
                
                // Force sync ke WA-Bot
                await forceSyncToWABot();
                console.log(`✅ [SYNC-ALL] Force sync selesai`);
            } catch (err) {
                console.error(`❌ [SYNC-ALL] Proses background error:`, err.message);
            }
        });
        
    } catch (error) {
        console.error('❌ [SYNC-ALL] Error:', error.message);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// ==========================================
// 🔥 ENDPOINT: TERIMA HASIL CEK DPT DARI WA BOT
// ==========================================
app.post('/send-cekdpt-result', async (req, res) => {
    try {
        const { chatId, result, status, fileName } = req.body;
        
        console.log(`📥 [CEKDPT-RESULT] Terima hasil untuk chatId: ${chatId}`);
        
        if (!chatId) {
            return res.status(400).json({ status: 'error', message: 'chatId required' });
        }
        
        const bot = global.telegramBot;
        if (!bot) {
            console.log('❌ [CEKDPT-RESULT] Bot Telegram tidak aktif');
            return res.status(503).json({ status: 'error', message: 'Bot not initialized' });
        }
        
        // 🔥 FORMAT RINGKAS
        let message;
        
        if (status === 'success') {
            // Coba extract angka dari result kalau formatnya "Total NIK: 2, Berhasil: 2..."
            let total = 0, sukses = 0, tidakAda = 0, gagal = 0;
            
            if (typeof result === 'string') {
                // Coba parse dari string result
                const totalMatch = result.match(/[Tt]otal\s*(?:NIK)?\s*[:=]?\s*(\d+)/);
                const suksesMatch = result.match(/[Bb]erhasil\s*[:=]?\s*(\d+)/);
                const tidakMatch = result.match(/[Tt]idak\s*[Tt]erdaftar\s*[:=]?\s*(\d+)/);
                const gagalMatch = result.match(/[Gg]agal\s*[:=]?\s*(\d+)/);
                
                if (totalMatch) total = parseInt(totalMatch[1]);
                if (suksesMatch) sukses = parseInt(suksesMatch[1]);
                if (tidakMatch) tidakAda = parseInt(tidakMatch[1]);
                if (gagalMatch) gagal = parseInt(gagalMatch[1]);
            }
            
            // Kalau berhasil parse angka, pakai format ringkas
            if (total > 0) {
                message = `📊 *HASIL CEK DPT*\n\n` +
                          `Total: ${total} NIK\n` +
                          `✅ ${sukses} | ⚠️ ${tidakAda} | ❌ ${gagal}`;
            } else {
                // Fallback: kirim result apa adanya tapi tanpa header panjang
                message = `📊 *HASIL CEK DPT*\n\n${result}`;
            }
        } else if (status === 'processing') {
            message = result || `⏳ Memproses...`;
        } else {
            // 🔥 SKIP — jangan kirim "Gagal proses file"
            console.log(`⚠️ [CEKDPT-RESULT] Skip status "${status}": ${result}`);
            return res.json({ status: 'ok', skipped: true });
        }
        
           // Kirim ke Telegram user — SIMPAN messageId
        let sentMessage = null;
        try {
            sentMessage = await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            console.log(`✅ [CEKDPT-RESULT] Terkirim ke ${chatId} (msgId: ${sentMessage.message_id})`);
        } catch (err) {
            // Fallback tanpa markdown
            sentMessage = await bot.sendMessage(chatId, message);
            console.log(`✅ [CEKDPT-RESULT] Terkirim (fallback) ke ${chatId}`);
        }
        
        // 🔥 RETURN messageId biar bisa dihapus nanti
        res.json({ 
            status: 'ok', 
            messageId: sentMessage ? sentMessage.message_id : null 
        });
        
    } catch (error) {
        console.log('❌ [CEKDPT-RESULT] Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// ==========================================
// 🔥 ENDPOINT: DELETE MESSAGE (untuk hapus notif processing)
// ==========================================
app.post('/delete-message', async (req, res) => {
    try {
        const { chatId, messageId } = req.body;
        
        if (!chatId || !messageId) {
            return res.status(400).json({ status: 'error', message: 'chatId & messageId required' });
        }
        
        const bot = global.telegramBot;
        if (!bot) {
            console.log('❌ [DELETE-MSG] Bot Telegram tidak aktif');
            return res.status(503).json({ status: 'error', message: 'Bot not initialized' });
        }
        
        try {
            await bot.deleteMessage(chatId, messageId);
            console.log(`🗑️ [DELETE-MSG] Pesan ${messageId} dihapus di chat ${chatId}`);
            res.json({ status: 'ok' });
        } catch (e) {
            console.log(`⚠️ [DELETE-MSG] Gagal hapus: ${e.message}`);
            res.json({ status: 'error', message: e.message });
        }
        
    } catch (error) {
        console.log('❌ [DELETE-MSG] Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// ==========================================
// 🔥 ENDPOINT: KIRIM FILE EXCEL HASIL CEK DPT KE TELEGRAM
// ==========================================
app.post('/send-cekdpt-file', async (req, res) => {
    try {
        const { chatId, fileName, fileBase64, caption } = req.body;
        
        console.log(`📥 [CEKDPT-FILE] Terima file untuk ${chatId}: ${fileName}`);
        
        if (!chatId || !fileBase64) {
            return res.status(400).json({ status: 'error', message: 'chatId & fileBase64 required' });
        }
        
        const bot = global.telegramBot;
        if (!bot) {
            console.log('❌ [CEKDPT-FILE] Bot Telegram tidak aktif');
            return res.status(503).json({ status: 'error', message: 'Bot not initialized' });
        }
        
        // Convert base64 ke buffer
        const fileBuffer = Buffer.from(fileBase64, 'base64');
        
        // Kirim file ke Telegram
        await bot.sendDocument(chatId, fileBuffer, {
            caption: caption || `📊 File: ${fileName}`
        }, {
            filename: fileName,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        
        console.log(`✅ [CEKDPT-FILE] File terkirim ke ${chatId}`);
        res.json({ status: 'ok' });
        
    } catch (error) {
        console.log('❌ [CEKDPT-FILE] Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
});


// ==========================================
// 🔥 ENDPOINT: STATUS
// ==========================================

app.get('/wa-status', async (req, res) => {
    try {
        const sewaData = loadSewaData();
        const daerahData = loadDaerahData();
        
        // Cek file WA-Bot
        let waSewaExists = fs.existsSync(SEWA_FILE_WA);
        let waDaerahExists = fs.existsSync(DAERAH_FILE_WA);
        
        res.json({
            bridge: 'running',
            wa_api: WA_API_URL,
            total_users: Object.keys(sewaData).length,
            total_regions: Object.values(sewaData).reduce((sum, u) => sum + (u.daerah?.length || 0), 0),
            files: {
                sewa: SEWA_FILE,
                sewa_wa: SEWA_FILE_WA,
                sewa_wa_exists: waSewaExists,
                daerah: DAERAH_FILE,
                daerah_wa: DAERAH_FILE_WA,
                daerah_wa_exists: waDaerahExists
            },
            wabot_folder: WA_DATA_FOLDER,
            wabot_folder_exists: fs.existsSync(WA_DATA_FOLDER)
        });
    } catch (error) {
        console.log('[STATUS] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 🔥 GET WA STATUS (UNTUK TELEGRAM BOT)
// ==========================================

const getWAStatus = async () => {
    try {
        const response = await axios.get(`${WA_API_URL}/api/pairing-status`, {
            timeout: 3000
        });
        
        if (response.data) {
            return {
                connected: response.data.connected || false,
                phone: response.data.phone || '-',
                contacts: 0,
                uptime: 0
            };
        }
        return null;
    } catch (error) {
        console.log('❌ [getWAStatus] Error:', error.message);
        return null;
    }
};

// ==========================================
// 🔥 ENDPOINT SEND QR - DENGAN TOMBOL BATAL
// ==========================================

const qrMessages = {};

// ==========================================
// 🔥 ENDPOINT SEND QR - MATIKAN (BIAR TIDAK DOUBLE)
// ==========================================

app.post('/send-qr', async (req, res) => {
    try {
        const { qr } = req.body;
        console.log(`📱 [QR] Menerima QR...`);
        
        console.log(`📌 [QR] QR diterima, TIDAK dikirim otomatis (hanya via tombol manual)`);
        console.log(`📌 [QR] Gunakan tombol "📸 PAIRING QR DI SINI" di Telegram`);
        
        res.json({ status: 'success', message: 'QR diterima (tidak dikirim otomatis)' });
        
    } catch (error) {
        console.log('❌ [QR] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 🔥 START SERVER
// ==========================================

const PORT = 3004;
app.listen(PORT, () => {
    console.log(`✅ [BRIDGE] Running on port ${PORT}`);
    console.log(`✅ [BRIDGE] WA API: ${WA_API_URL}`);
    console.log(`✅ [BRIDGE] Chat ID: ${TELEGRAM_CHAT_ID}`);
    console.log(`✅ [BRIDGE] SEWA FILE: ${SEWA_FILE}`);
    console.log(`✅ [BRIDGE] SEWA WA: ${SEWA_FILE_WA}`);
    console.log(`✅ [BRIDGE] DAERAH FILE: ${DAERAH_FILE}`);
    console.log(`✅ [BRIDGE] DAERAH WA: ${DAERAH_FILE_WA}`);
    console.log(`✅ [BRIDGE] WA DATA FOLDER: ${WA_DATA_FOLDER}`);
});

// ==========================================
// 🔥 EXPORT
// ==========================================

module.exports = { 
    sendToWhatsApp: async (phone, msg) => { 
        console.log(`[BRIDGE] sendToWhatsApp: ${phone} - ${msg}`);
        return true;
    },
    sendToTelegram,
    sendToTelegramUser,
    loadSewaData,
    saveSewaData,
    loadDaerahData,
    saveDaerahData,
    addOrUpdateSewa,
    addDaerahToUser,
    forceSyncToWABot,
    getWAStatus  // ✅ SEKARANG SUDAH TERDEFINISI SEBELUM DIPANGGIL
};