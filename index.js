// ==========================================
// 🔥 KJS-WABOT - FULL FIXED (QR CODE PRIMARY)
// ==========================================

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  jidDecode,
  downloadContentFromMessage
} = require('@whiskeysockets/baileys');

const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const cfonts = require('cfonts');
const qrcode = require('qrcode');
const axios = require('axios');
const crypto = require('crypto');
const express = require('express');


const OWNER_ID = '8677011932';
let activePairingSock = null;
let isPairingActive = false; 
let _forceQR = false;       
let _pairingRequested = false; 

global.telegramBot = {
    sendPhoto: async (chatId, photo, options) => {
        console.log('📤 [WA] Kirim QR via Bridge...');
        try {
            const base64 = photo.toString('base64');
            
            // 🔥 AMBIL NOMOR DARI CAPTION
            let phoneNumber = '6285811121679';
            if (options && options.caption) {
                const match = options.caption.match(/📞 Nomor: (\d+)/);
                if (match) {
                    phoneNumber = match[1];
                }
            }
            
            await axios.post('http://localhost:3004/send-qr', {
                qr: base64,
                phone: phoneNumber
            });
            console.log('✅ [WA] QR terkirim ke Bridge');
        } catch (e) {
            console.log('❌ [WA] Gagal kirim QR:', e.message);
        }
    },
    sendMessage: async (chatId, text, options) => {
        console.log('📤 [WA] Kirim pesan via Bridge...');
        try {
            await axios.post('http://localhost:3004/send-to-telegram-user', {
                chatId: chatId,
                message: text
            });
        } catch (e) {
            console.log('❌ [WA] Gagal kirim pesan:', e.message);
        }
    }
};
console.log('✅ [WA] Global Telegram Bot siap (redirect ke Bridge)');

let globalTelegramBot = null;
// ==========================================
// 🔥 KONFIGURASI DASAR
// ==========================================

const app = express();
app.use(express.json());

const HTTP_PORT = 3005;
const START_TIME = Math.floor(Date.now() / 1000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ==========================================
// 🔥 PATH FILE
// ==========================================

const sessionDir = path.join(__dirname, 'sessions');
const storePath = path.join(__dirname, 'baileys_store.json');
const settingsPath = path.join(__dirname, 'settings.json');
const functionsDir = path.join(__dirname, 'function');
const sentStatusFile = path.join(__dirname, 'sentStatus.json');
const sewaFile = path.join(__dirname, 'sewa_aktif.json');

// ==========================================
// 🔥 FLAG FILE UNTUK KONTROL QR (PERSISTEN)
// ==========================================

const qrFlagFile = path.join(__dirname, 'qr_flag.json');

function loadQrFlag() {
    try {
        if (fs.existsSync(qrFlagFile)) {
            const data = JSON.parse(fs.readFileSync(qrFlagFile, 'utf8'));
            console.log(`📊 [FLAG] Load: forceQR=${data.forceQR}`);
            return data.forceQR || false;
        }
    } catch (e) {
        console.log(`❌ [FLAG] Error load:`, e.message);
    }
    return false;
}

function saveQrFlag(value) {
    try {
        const data = { forceQR: value, updated: Date.now() };
        fs.writeFileSync(qrFlagFile, JSON.stringify(data, null, 2), 'utf8');
        console.log(`📊 [FLAG] Save: forceQR=${value}`);
    } catch (e) {
        console.log(`❌ [FLAG] Error save:`, e.message);
    }
}

// ==========================================
// 🔥 DATABASE & CACHE
// ==========================================

let activeUsers = {};
let settings = {};
let contacts = {};
let sentStatus = new Set();
const detectCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000;
const __sendQueues = new Map();
const __lastSent = new Map();

// ==========================================
// 🔥 TARGET STATUS AUTO REPOST
// ==========================================

const TARGET_STATUS = ['85912247636205@lid'];

// ==========================================
// 🔥 FUNGSI FORMAT UPTIME
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
// 🔥 FUNGSI HELPER
// ==========================================

const color = (text, code) => `\x1b[${code}m${text}\x1b[0m`;
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const question = (text) =>
  new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(text, (ans) => {
      rl.close();
      res(ans);
    });
  });

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

const decodeJid = (jid) => {
  if (!jid) return jid;
  if (/:\d+@/gi.test(jid)) {
    const d = jidDecode(jid) || {};
    return (d.user && d.server && `${d.user}@${d.server}`) || jid;
  }
  return jid;
};

// ==========================================
// 🔥 FUNGSI CACHE DETEKSI
// ==========================================

function createDataHash(region) {
  const parts = [
    region.kabupaten || '',
    region.kecamatan || '',
    region.kelurahan || ''
  ];
  const raw = parts.join('|').toUpperCase().trim();
  return crypto.createHash('md5').update(raw).digest('hex');
}

function isDuplicateDetect(senderNumber, dataHash) {
  if (!senderNumber || senderNumber === 'Unknown') return false;
  if (!dataHash) return false;
  const key = `${senderNumber}|${dataHash}`;
  const lastDetect = detectCache.get(key);
  if (lastDetect && (Date.now() - lastDetect) < CACHE_DURATION) {
    console.log(`[CACHE] ⏳ Nomor ${senderNumber} dengan data SAMA`);
    return true;
  }
  return false;
}

function updateDetectCache(senderNumber, dataHash) {
  if (!senderNumber || senderNumber === 'Unknown') return;
  if (!dataHash) return;
  const key = `${senderNumber}|${dataHash}`;
  detectCache.set(key, Date.now());
  console.log(`[CACHE] ✅ ${senderNumber} | data ${dataHash.substring(0,8)}...`);
}

// ==========================================
// 🔥 CLEANUP CACHE
// ==========================================

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, time] of detectCache) {
    if (now - time > CACHE_DURATION) {
      detectCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[CACHE] 🧹 Bersihkan ${cleaned} cache`);
  }
}, 10 * 60 * 1000);

// ==========================================
// 🔥 LOAD / SAVE SETTINGS
// ==========================================

const loadSettings = () => {
  try {
    if (!fs.existsSync(settingsPath)) {
      settings = { 
        ownerNumber: [], 
        mode: 'public', 
        botName: 'KJS-BOT',
        telegramBridge: {
          enabled: true,
          url: 'http://localhost:3004',
          endpoints: {
            waToTelegram: '/wa-to-telegram',
            sendToUser: '/send-to-telegram-user'
          }
        }
      };
      ensureDir(settingsPath);
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      return;
    }
    settings = JSON.parse(fs.readFileSync(settingsPath));
    if (typeof settings.ownerNumber === 'string') settings.ownerNumber = [settings.ownerNumber];
  } catch (e) {
    settings = { ownerNumber: [], mode: 'public', botName: 'KJS-BOT' };
  }
};

const saveSettings = () => {
  try {
    ensureDir(settingsPath);
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (e) {}
};

// ==========================================
// 🔥 LOAD / SAVE CONTACTS
// ==========================================

try {
  if (fs.existsSync(storePath)) contacts = JSON.parse(fs.readFileSync(storePath));
} catch (e) {}

const saveContacts = () => {
  try {
    fs.writeFileSync(storePath, JSON.stringify(contacts, null, 2));
  } catch (e) {}
};

// ==========================================
// 🔥 LOAD / SAVE SENT STATUS
// ==========================================

if (fs.existsSync(sentStatusFile)) {
  try {
    const data = JSON.parse(fs.readFileSync(sentStatusFile));
    sentStatus = new Set(data);
  } catch {}
}

const saveSentStatus = () => {
  try {
    fs.writeFileSync(sentStatusFile, JSON.stringify([...sentStatus]));
  } catch {}
};

// ==========================================
// 🔥 LOAD / SAVE SEWA AKTIF
// ==========================================

function loadSewaAktif() {
  if (!fs.existsSync(sewaFile)) {
    console.log('[WA-BOT] ⚠️ File sewa_aktif.json belum ada');
    return {};
  }
  try {
    const data = JSON.parse(fs.readFileSync(sewaFile, 'utf8'));
    console.log(`[WA-BOT] 📊 Load sewa_aktif.json: ${Object.keys(data).length} users`);
    return data;
  } catch (e) {
    console.log('[WA-BOT] ❌ Error load sewa_aktif.json:', e.message);
    return {};
  }
}

function saveSewaAktif(data) {
  try {
    fs.writeFileSync(sewaFile, JSON.stringify(data, null, 2));
    console.log(`[WA-BOT] ✅ Save sewa_aktif.json: ${Object.keys(data).length} users`);
    return true;
  } catch (e) {
    console.log('[WA-BOT] ❌ Error save sewa_aktif.json:', e.message);
    return false;
  }
}

// ==========================================
// 🔥 LOAD COMMANDS
// ==========================================

const commands = new Map();

const loadCommands = () => {
  commands.clear();
  if (!fs.existsSync(functionsDir)) fs.mkdirSync(functionsDir);
  const files = fs.readdirSync(functionsDir).filter((f) => f.endsWith('.js')).sort();
  for (const file of files) {
    try {
      delete require.cache[require.resolve(path.join(functionsDir, file))];
      const cmd = require(path.join(functionsDir, file));
      if (cmd.trigger && cmd.execute) {
        Array.isArray(cmd.trigger)
          ? cmd.trigger.forEach((t) => commands.set(t, cmd))
          : commands.set(cmd.trigger, cmd);
      }
    } catch (e) {
      console.error('[CMD ERR]', file, e?.message || e);
    }
  }
  console.log(`[SYS] Loaded ${commands.size} commands`);
};

// ==========================================
// 🔥 PATCH SEND MESSAGE (RATE LIMIT)
// ==========================================

function patchSendMessage(sock) {
  const original = sock.sendMessage.bind(sock);

  sock.sendMessage = async (chatId, content, options = {}) => {
    const text = content?.text || '';

    const keyMap = {
      'Format respon server tidak valid': 'invalid_resp',
      'Sistem pembayaran sedang gangguan': 'pay_down',
      'tunggu 5 menit': 'rate_limit'
    };

    for (const k in keyMap) {
      if (text.includes(k)) {
        const last = __lastSent.get(chatId + keyMap[k]) || 0;
        if (Date.now() - last < 60_000) return;
        __lastSent.set(chatId + keyMap[k], Date.now());
        break;
      }
    }

    const prev = __sendQueues.get(chatId) || Promise.resolve();
    const next = prev
      .then(async () => {
        await sleep(700 + rand(0, 800));
        return original(chatId, content, options);
      })
      .catch((err) => {
        console.error('[SENDMSG ERR]', chatId, err?.message || err);
      });
    __sendQueues.set(chatId, next);
    return next;
  };
}

// ==========================================
// 🔥 LOGGER BAILEYS
// ==========================================

const logger = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => logger
};

// ==========================================
// 🔥 FUNGSI KIRIM KE TELEGRAM - FIXED
// ==========================================

async function sendToTelegram(message, from = 'WhatsApp', isOwner = false) {
  try {
    const telegramUrl = settings.telegramBridge?.url || 'http://localhost:3004';
    
    const cleanMessage = message
      .replace(/\*/g, '')
      .replace(/_/g, '')
      .replace(/`/g, '')
      .replace(/~/g, '')
      .replace(/\[/g, '')
      .replace(/\]/g, '')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .replace(/\{/g, '')
      .replace(/\}/g, '')
      .replace(/\+/g, '')
      .replace(/=/g, '')
      .replace(/\|/g, '')
      .trim();
    
    await axios.post(`${telegramUrl}/wa-to-telegram`, {
      message: cleanMessage,
      from: from || 'WhatsApp',
      isOwner: isOwner
    });
    console.log('[TELEGRAM] ✅ Pesan terkirim');
  } catch (error) {
    console.log('[TELEGRAM] ❌ Gagal kirim:', error.message);
    
    try {
      const telegramUrl = settings.telegramBridge?.url || 'http://localhost:3004';
      const plainMessage = message.replace(/[^a-zA-Z0-9\s\n\r.,!?]/g, '');
      await axios.post(`${telegramUrl}/wa-to-telegram`, {
        message: plainMessage.substring(0, 4096),
        from: from || 'WhatsApp',
        isOwner: isOwner
      });
      console.log('[TELEGRAM] ✅ Fallback terkirim');
    } catch (e) {
      console.log('[TELEGRAM] ❌ Fallback gagal:', e.message);
    }
  }
}

// ==========================================
// 🔥 FUNGSI KIRIM KE TELEGRAM USER - FIXED
// ==========================================

async function sendToTelegramUser(chatId, message) {
  try {
    const telegramUrl = settings.telegramBridge?.url || 'http://localhost:3004';
    console.log(`[TELEGRAM] 📤 Mencoba kirim ke ${chatId}...`);
    
    const cleanMessage = message
      .replace(/\*/g, '')
      .replace(/_/g, '')
      .replace(/`/g, '')
      .replace(/~/g, '')
      .replace(/\[/g, '')
      .replace(/\]/g, '')
      .replace(/\(/g, '')
      .replace(/\)/g, '')
      .trim();
    
    await axios.post(`${telegramUrl}/send-to-telegram-user`, {
      chatId: chatId,
      message: cleanMessage
    });
    console.log(`[TELEGRAM] ✅ Terkirim ke ${chatId}`);
  } catch (error) {
    console.log(`[TELEGRAM] ❌ Gagal kirim ke ${chatId}:`, error.message);
    
    try {
      const telegramUrl = settings.telegramBridge?.url || 'http://localhost:3004';
      const plainMessage = message.replace(/[^a-zA-Z0-9\s\n\r.,!?]/g, '');
      await axios.post(`${telegramUrl}/send-to-telegram-user`, {
        chatId: chatId,
        message: plainMessage.substring(0, 4096)
      });
      console.log(`[TELEGRAM] ✅ Fallback terkirim ke ${chatId}`);
    } catch (e) {
      console.log(`[TELEGRAM] ❌ Fallback gagal:`, e.message);
    }
  }
}

// ==========================================
// 🔥 KIRIM KE TELEGRAM DENGAN BUTTON
// ==========================================

async function sendToTelegramUserWithWAButton(chatId, fullMessage, rawData) {
  try {
    const telegramUrl = settings.telegramBridge?.url || 'http://localhost:3004';
    const ADMIN_WA_NUMBER = "6285811121679";
    
    let copyText = rawData || fullMessage;
    copyText = copyText.replace(/\*/g, '');
    copyText = copyText.replace(/_/g, '');
    copyText = copyText.replace(/`/g, '');
    copyText = copyText.replace(/[📊📍🆔👤📅💰🏢❍⚏➥●🔐❀]/g, '').trim();
    copyText = copyText.replace(/Hallo \*.*?\*, data pesananmu nih 📦\n\n/g, '').trim();
    
    const encodedText = encodeURIComponent(copyText.substring(0, 500));
    
    const payload = {
      chatId: chatId,
      message: fullMessage,
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 Copy Data", callback_data: `copy_${Date.now()}` }],
          [{ text: "💬 ADMIN REKBER", url: `https://wa.me/${ADMIN_WA_NUMBER}?text=Assalamualaikum%20Admin%2C%20saya%20member%20KJS%20Bot%20dan%20ingin%20menggunakan%20jasa%20rekber.%0A%0ADetail%20transaksi%3A%0A${encodedText}` }]
        ]
      }
    };
    
    await axios.post(`${telegramUrl}/send-to-telegram-user-button`, payload);
  } catch (error) {
    try {
      const telegramUrl = settings.telegramBridge?.url || 'http://localhost:3004';
      const ADMIN_WA_NUMBER = "6285811121679";
      const simplePayload = {
        chatId: chatId,
        message: fullMessage,
        reply_markup: {
          inline_keyboard: [
            [{ text: "📋 Copy Data", callback_data: `copy_${Date.now()}` }],
            [{ text: "💬 ADMIN REKBER", url: `https://wa.me/${ADMIN_WA_NUMBER}?text=Assalamualaikum%20Admin%2C%20saya%20member%20KJS%20Bot` }]
          ]
        }
      };
      await axios.post(`${telegramUrl}/send-to-telegram-user-button`, simplePayload);
    } catch (e) {
      await sendToTelegramUser(chatId, fullMessage + `\n\n📞 Chat Admin: https://wa.me/6285811121679`);
    }
  }
}

// ==========================================
// 🔥 FUNGSI DETEKSI DAERAH DARI PESAN
// ==========================================

function extractRegionFromText(text) {
  const data = { kabupaten: null, kecamatan: null, kelurahan: null };

  console.log('[DETEKSI] 🔍 Mencari daerah di pesan...');

  const kabupatenPatterns = [
    /(?:KAB|KABUPATEN|KOTA)\s*[:.]?\s*([A-Z][A-Z\s]+?)(?=\n|$|,|;)/i,
    /Kabupaten\s*[:.]?\s*([A-Z][a-z\s]+?)(?=\n|$|,|;)/i,
    /Kota\s*[:.]?\s*([A-Z][a-z\s]+?)(?=\n|$|,|;)/i,
  ];

  for (const pattern of kabupatenPatterns) {
    const match = text.match(pattern);
    if (match) {
      let value = match[1].trim();
      value = value.replace(/^(KAB|KABUPATEN|KOTA)\s*/i, '');
      value = value.replace(/[*:;,.()]/g, '').trim();
      if (value && value.length >= 2 && value.length < 50) {
        data.kabupaten = value.toUpperCase();
        console.log(`[DETEKSI] ✅ Kabupaten (label): ${data.kabupaten}`);
        break;
      }
    }
  }

  const kecamatanPatterns = [
    /(?:KEC|KECAMATAN)\s*[:.]?\s*([A-Z][A-Z\s]+?)(?=\n|$|,|;)/i,
    /Kecamatan\s*[:.]?\s*([A-Z][a-z\s]+?)(?=\n|$|,|;)/i,
  ];

  for (const pattern of kecamatanPatterns) {
    const match = text.match(pattern);
    if (match) {
      let value = match[1].trim();
      value = value.replace(/^(KEC|KECAMATAN)\s*/i, '');
      value = value.replace(/[*:;,.()]/g, '').trim();
      if (value && value.length >= 2 && value.length < 50) {
        data.kecamatan = value.toUpperCase();
        console.log(`[DETEKSI] ✅ Kecamatan (label): ${data.kecamatan}`);
        break;
      }
    }
  }

  const kelurahanPatterns = [
    /(?:KEL|KELURAHAN|DESA)\s*[:.]?\s*([A-Z][A-Z\s]+?)(?=\n|$|,|;)/i,
    /Kelurahan\s*[:.]?\s*([A-Z][a-z\s]+?)(?=\n|$|,|;)/i,
    /Desa\s*[:.]?\s*([A-Z][a-z\s]+?)(?=\n|$|,|;)/i,
  ];

  for (const pattern of kelurahanPatterns) {
    const match = text.match(pattern);
    if (match) {
      let value = match[1].trim();
      value = value.replace(/^(KEL|KELURAHAN|DESA)\s*/i, '');
      value = value.replace(/[*:;,.()]/g, '').trim();
      if (value && value.length >= 2 && value.length < 50) {
        data.kelurahan = value.toUpperCase();
        console.log(`[DETEKSI] ✅ Kelurahan (label): ${data.kelurahan}`);
        break;
      }
    }
  }

  if (!data.kabupaten || !data.kecamatan || !data.kelurahan) {
    const lines = text.split('\n')
      .map(l => l.trim())
      .filter(l => l.length >= 2 && l.length < 50)
      .filter(l => /[A-Za-z]/.test(l))
      .filter(l => !/^[0-9]+$/.test(l))
      .filter(l => !l.includes(':'))
      .filter(l => !l.includes('@'))
      .filter(l => !l.includes('http'))
      .filter(l => {
        const skipWords = ['DATA', 'INFO', 'PROMO', 'HARGA', 'SALDO', 'KPJ', 'NIK', 'TTL', 'JMO', 'GO', 'REGIST', 'LANJUT', 'TOTAL', 'JUMLAH', 'CIRCLEKA', 'WASERBA', 'LAKI', 'PEREMPUAN'];
        return !skipWords.some(word => l.toUpperCase().includes(word));
      });

    let found = 0;
    for (const line of lines) {
      if (found >= 3) break;
      const upperLine = line.toUpperCase();
      if (upperLine.length < 2 || upperLine.length > 50) continue;
      const skipWords = ['DATA', 'INFO', 'PROMO', 'HARGA', 'SALDO', 'KPJ', 'NIK', 'TTL', 'JMO', 'GO', 'CIRCLEKA', 'WASERBA'];
      if (skipWords.some(word => upperLine.includes(word))) continue;

      if (!data.kabupaten && found === 0) {
        data.kabupaten = upperLine;
        console.log(`[DETEKSI] ✅ Kabupaten (bebas): ${upperLine}`);
        found++;
      } else if (!data.kecamatan && found === 1 && upperLine !== data.kabupaten) {
        data.kecamatan = upperLine;
        console.log(`[DETEKSI] ✅ Kecamatan (bebas): ${upperLine}`);
        found++;
      } else if (!data.kelurahan && found === 2 && upperLine !== data.kabupaten && upperLine !== data.kecamatan) {
        data.kelurahan = upperLine;
        console.log(`[DETEKSI] ✅ Kelurahan (bebas): ${upperLine}`);
        found++;
      }
    }
  }

  if (!data.kabupaten || !data.kecamatan || !data.kelurahan) {
    const emojiPatterns = [
      /🎡\s*([A-Z][A-Z\s]+?)(?=\n|$)/g,
      /📍\s*([A-Z][A-Z\s]+?)(?=\n|$)/g,
      /🏙️\s*([A-Z][A-Z\s]+?)(?=\n|$)/g,
      /🌾\s*([A-Z][A-Z\s]+?)(?=\n|$)/g,
    ];

    let emojiMatches = [];
    for (const pattern of emojiPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let value = match[1].trim();
        value = value.replace(/[*:;,.()]/g, '').trim();
        if (value && value.length >= 2 && value.length < 50) {
          emojiMatches.push(value.toUpperCase());
        }
      }
    }

    if (emojiMatches.length >= 3) {
      if (!data.kabupaten) { data.kabupaten = emojiMatches[0]; console.log(`[DETEKSI] ✅ Kabupaten (emoji): ${data.kabupaten}`); }
      if (!data.kecamatan) { data.kecamatan = emojiMatches[1]; console.log(`[DETEKSI] ✅ Kecamatan (emoji): ${data.kecamatan}`); }
      if (!data.kelurahan) { data.kelurahan = emojiMatches[2]; console.log(`[DETEKSI] ✅ Kelurahan (emoji): ${data.kelurahan}`); }
    }
  }

  for (const key of ['kabupaten', 'kecamatan', 'kelurahan']) {
    if (data[key]) {
      data[key] = data[key].replace(/[:;,.()*]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (data[key].length < 2) data[key] = null;
    }
  }

  console.log('[DETEKSI] 📍 HASIL AKHIR:');
  console.log(`  🏙️ Kabupaten: ${data.kabupaten || '-'}`);
  console.log(`  🏘️ Kecamatan: ${data.kecamatan || '-'}`);
  console.log(`  🏡 Kelurahan: ${data.kelurahan || '-'}`);

  return data;
}

// ==========================================
// 🔥 FUNGSI SEND DATA KE SUBSCRIBER
// ==========================================

async function sendDataToSubscribers(messageData) {
  if (!fs.existsSync(sewaFile)) {
    console.log('❌ No sewa file found');
    return 0;
  }
  
  let sewa = {};
  try { sewa = JSON.parse(fs.readFileSync(sewaFile)); } catch (e) { 
    console.log('❌ Error reading sewa file');
    return 0;
  }
  
  const now = Date.now();
  let sent = 0;
  
  let fullMessage = `📊 *DATA DARI WHATSAPP*\n\n`;

  if (messageData.raw) {
    fullMessage += `${messageData.raw}\n\n`;
  }

  fullMessage += `\n❍⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏❍\n`;
  fullMessage += `📱 Dari: ${messageData.pengirim || '-'}\n`;
  fullMessage += `📱 Nomor penjual: ${messageData.nomor || '-'}\n`;
  fullMessage += `👥 Dari Group: ${messageData.group || 'Private'}\n`;
  fullMessage += `⏰ Waktu: ${new Date().toLocaleString('id-ID')}\n`;
  fullMessage += `❍⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏❍\n`;

  fullMessage += `\n➥ *MINAT DENGAN DATA INI?* ✓\n`;
  fullMessage += `● Silakan hubungi nomor penjual yang tertera di atas.\n\n`;
  fullMessage += `🔐 *UTAMAKAN KEAMANAN TRANSAKSI*\n\n`;
  fullMessage += `➥ Disarankan menggunakan jasa *Rekber*.\n\n`;
  fullMessage += `➥ 📲 *Admin Rekber:* Klik Di bawah\n`;
  fullMessage += ` *Bijak dalam bertransaksi.* ✓\n`;
  fullMessage += `❍⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏⚏❍`;
  
  for (const userId of Object.keys(sewa)) {
    const user = sewa[userId];
    if (!user.active) continue;
    if (now >= user.expired) {
      user.active = false;
      continue;
    }
    if (!user.daerah || user.daerah.length === 0) continue;
    
    let hasAccess = false;
    const kabDetected = messageData.kabupaten ? messageData.kabupaten.toUpperCase().trim() : null;
    const kecDetected = messageData.kecamatan ? messageData.kecamatan.toUpperCase().trim() : null;
    const kelDetected = messageData.kelurahan ? messageData.kelurahan.toUpperCase().trim() : null;

    for (const daerah of user.daerah) {
      const daerahUpper = daerah.toUpperCase().trim();

      if (kabDetected && daerahUpper.includes(kabDetected)) { hasAccess = true; break; }
      if (kecDetected && daerahUpper.includes(kecDetected)) { hasAccess = true; break; }
      if (kelDetected && daerahUpper.includes(kelDetected)) { hasAccess = true; break; }

      const parts = daerahUpper.split('>').map(p => p.trim());
      for (const part of parts) {
        if (kabDetected && part.includes(kabDetected)) { hasAccess = true; break; }
        if (kecDetected && part.includes(kecDetected)) { hasAccess = true; break; }
        if (kelDetected && part.includes(kelDetected)) { hasAccess = true; break; }
      }
      if (hasAccess) break;
    }

    if (!hasAccess && kabDetected && kecDetected) {
      for (const daerah of user.daerah) {
        const daerahUpper = daerah.toUpperCase().trim();
        if (daerahUpper.includes(kabDetected) && daerahUpper.includes(kecDetected)) { hasAccess = true; break; }
      }
    }

    if (!hasAccess && kabDetected && kelDetected) {
      for (const daerah of user.daerah) {
        const daerahUpper = daerah.toUpperCase().trim();
        if (daerahUpper.includes(kabDetected) && daerahUpper.includes(kelDetected)) { hasAccess = true; break; }
      }
    }

    if (hasAccess) {
      let username = user.username || userId;
      username = username.replace(/[^a-zA-Z0-9_]/g, '');
      if (!username || username.length < 2) username = 'User';
      
      const greeting = `Hallo *${username}*, data pesananmu nih 🥳👇\n\n`;
      const taggedMessage = `${greeting}${fullMessage}`;
      
      await sendToTelegramUserWithWAButton(userId, taggedMessage, messageData.raw);
      sent++;
      
      console.log(`✅ KIRIM: User ${userId} | ${messageData.kabupaten} > ${messageData.kecamatan} > ${messageData.kelurahan}`);
    }
  }
  
  fs.writeFileSync(sewaFile, JSON.stringify(sewa, null, 2));
  console.log(`📊 TOTAL: ${sent} user terkirim`);
  return sent;
}

// ==========================================
// 🔥 HTTP API SERVER
// ==========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() / 1000) - START_TIME),
    users: Object.keys(activeUsers).length
  });
});

app.get('/status', (req, res) => {
    try {
        let totalUsers = 0;
        let phone = '-';
        let contactsCount = 0;
        
        // 🔥 AMBIL DARI SEWA FILE
        if (fs.existsSync(sewaFile)) {
            try {
                const sewaData = JSON.parse(fs.readFileSync(sewaFile, 'utf8'));
                totalUsers = Object.keys(sewaData).length;
                // HITUNG USER AKTIF
                const aktif = Object.keys(sewaData).filter(id => sewaData[id].active).length;
                contactsCount = aktif;
            } catch (e) {}
        }
        
        const credsPath = path.join(__dirname, 'sessions', 'creds.json');
        const isConnected = fs.existsSync(credsPath);
        
        if (isConnected) {
            try {
                const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                if (creds.me && creds.me.id) {
                    phone = creds.me.id.split('@')[0] || '-';
                }
            } catch (e) {}
        }
        
        const uptime = Math.floor((Date.now() / 1000) - START_TIME);
        
        res.json({
            connected: isConnected,
            phone: phone,
            contacts: contactsCount,   // 🔥 KONTAK AKTIF
            totalUsers: totalUsers,    // 🔥 TOTAL USER SEWA
            uptime: uptime,            // 🔥 UPTIME
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.json({ 
            connected: false, 
            error: error.message,
            contacts: 0,
            uptime: 0
        });
    }
});

// ==========================================
// 🔥 ENDPOINT RESET SESSION
// ==========================================

app.post('/reset-session', async (req, res) => {
    try {
        console.log('🔄 [RESET] Menghapus session WhatsApp...');
        
        // 🔥 SET FLAG PAIRING - QR AKAN MUNCUL
        _forceQR = true;
        _pairingRequested = true;
        isPairingActive = true;
        
        const sessionDir = path.join(__dirname, 'sessions');
        let deletedFiles = 0;
        
        if (fs.existsSync(sessionDir)) {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                try {
                    fs.unlinkSync(path.join(sessionDir, file));
                    deletedFiles++;
                    console.log(`🗑️ [RESET] Hapus: ${file}`);
                } catch (e) {}
            }
            console.log(`✅ [RESET] ${deletedFiles} file dihapus dari sessions`);
        } else {
            console.log('⚠️ [RESET] Folder sessions tidak ada');
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        
        // Kirim notifikasi ke Telegram
        try {
            await sendToTelegram(
                '🔄 *Session WhatsApp telah direset!*\n\n📌 Mode pairing aktif\n📌 Kirim nomor baru: 628xxxxxxxxxx',
                'System'
            );
        } catch (e) {
            console.log('⚠️ [RESET] Gagal kirim notif ke Telegram:', e.message);
        }
        
        res.json({
            status: 'success',
            message: 'Session WhatsApp berhasil dihapus!',
            deleted: deletedFiles,
            pairingMode: true
        });
        
    } catch (error) {
        console.error('❌ [RESET] Error:', error.message);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

app.post('/api/sync-users', (req, res) => {
  try {
    const { users, timestamp } = req.body;
    
    if (!users || !Array.isArray(users)) {
      return res.status(400).json({ success: false, error: 'Invalid users data' });
    }
    
    const newActiveUsers = {};
    users.forEach(user => {
      if (user.userId) {
        newActiveUsers[user.userId] = {
          userId: user.userId,
          username: user.username || '-',
          daerah: user.daerah || [],
          active: user.active !== false,
          expired: user.expired || null,
          duration: user.duration || '-',
          syncedAt: timestamp || new Date().toISOString()
        };
      }
    });
    
    activeUsers = newActiveUsers;
    console.log(`📡 [SYNC] Synced ${Object.keys(activeUsers).length} users from Telegram`);
    console.log(`📡 [SYNC] User list:`, Object.keys(activeUsers).join(', '));
    
    res.json({ success: true, count: Object.keys(activeUsers).length });
    
  } catch (error) {
    console.error('❌ [SYNC] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/sync-sewa-data', (req, res) => {
  try {
    const { sewaData, daerahData, timestamp } = req.body;
    
    console.log(`📡 [WA-BOT] Menerima sync data dari Bridge`);
    console.log(`📊 Total users: ${Object.keys(sewaData || {}).length}`);
    
    if (sewaData) {
      fs.writeFileSync(sewaFile, JSON.stringify(sewaData, null, 2));
      console.log(`✅ [WA-BOT] sewa_aktif.json diupdate`);
      
      const newActiveUsers = {};
      for (const [userId, data] of Object.entries(sewaData)) {
        newActiveUsers[userId] = {
          userId: userId,
          username: data.duration || '-',
          daerah: data.daerah || [],
          active: data.active || false,
          expired: data.expired || null,
          duration: data.duration || '-',
          syncedAt: timestamp || new Date().toISOString()
        };
      }
      activeUsers = newActiveUsers;
      console.log(`✅ [WA-BOT] Active users updated: ${Object.keys(activeUsers).length}`);
    }
    
    if (daerahData) {
      const daerahFile = path.join(__dirname, 'daerah_user.json');
      fs.writeFileSync(daerahFile, JSON.stringify(daerahData, null, 2));
      console.log(`✅ [WA-BOT] daerah_user.json diupdate`);
    }
    
    res.json({ success: true, message: 'Data berhasil disync', users: Object.keys(sewaData || {}).length });
    
  } catch (error) {
    console.error('❌ [WA-BOT] Sync error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/sync-daerah-data', (req, res) => {
  try {
    const { daerahData } = req.body;
    
    console.log(`📡 [WA-BOT] Menerima sync daerah`);
    console.log(`📊 Total users with daerah: ${Object.keys(daerahData || {}).length}`);
    
    if (daerahData) {
      const daerahFile = path.join(__dirname, 'daerah_user.json');
      fs.writeFileSync(daerahFile, JSON.stringify(daerahData, null, 2));
      console.log(`✅ [WA-BOT] daerah_user.json diupdate`);
    }
    
    res.json({ success: true, message: 'Daerah data synced' });
  } catch (error) {
    console.error('❌ [WA-BOT] Sync daerah error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/active-users', (req, res) => {
  res.json({ success: true, users: activeUsers, count: Object.keys(activeUsers).length });
});

app.get('/api/get-sewa-aktif', (req, res) => {
  try {
    if (!fs.existsSync(sewaFile)) {
      return res.json({ success: true, data: {}, total: 0 });
    }
    const data = JSON.parse(fs.readFileSync(sewaFile, 'utf8'));
    res.json({ success: true, data: data, total: Object.keys(data).length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/check-wa-data', (req, res) => {
  try {
    const daerahFile = path.join(__dirname, 'daerah_user.json');
    let sewaData = {}, daerahData = {};
    
    if (fs.existsSync(sewaFile)) {
      try { sewaData = JSON.parse(fs.readFileSync(sewaFile, 'utf8')); } catch (e) {}
    }
    if (fs.existsSync(daerahFile)) {
      try { daerahData = JSON.parse(fs.readFileSync(daerahFile, 'utf8')); } catch (e) {}
    }
    
    res.json({
      success: true,
      total_users: Object.keys(sewaData).length,
      total_with_daerah: Object.keys(daerahData).length,
      sewa_data: sewaData,
      daerah_data: daerahData,
      active_users: Object.keys(activeUsers).length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 🔥 ENDPOINT PAIRING - FIXED (QR KE TELEGRAM)
// ==========================================

app.post('/pair', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');

        if (!cleanPhone || cleanPhone.length < 10) {
            return res.status(400).json({ success: false, error: 'Nomor tidak valid!' });
        }

        console.log(`📱 [PAIR] Request: ${cleanPhone}`);

        // 🔥 MATIKAN SOCKET LAMA
        if (activePairingSock) {
            try {
                await activePairingSock.end();
                console.log('🔄 [PAIR] Socket lama ditutup');
            } catch (e) {}
            activePairingSock = null;
        }
        if (global.sock) {
            try {
                await global.sock.end();
                console.log('🔄 [PAIR] Global sock ditutup');
            } catch (e) {}
            global.sock = null;
        }

        // 🔥 SET FLAG PAIRING
        _forceQR = true;
        _pairingRequested = true;
        isPairingActive = true;
        saveQrFlag(true);

        // 🔥 HAPUS SESSION LAMA
        if (fs.existsSync(sessionDir)) {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                try { 
                    fs.unlinkSync(path.join(sessionDir, file));
                    console.log(`🗑️ [PAIR] Hapus session: ${file}`);
                } catch (e) {}
            }
        }
        
        await new Promise(r => setTimeout(r, 2000));
        
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const version = [6, 7, 10];

        // 🔥 BUAT SOCKET BARU
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            version: version,
            printQRInTerminal: false,
            logger: logger,
            browser: ['Chrome', 'Windows', '10.0.0'],
            markOnlineOnConnect: true,
        });

        activePairingSock = sock;
        global.sock = sock;

        let pairingCode = null;
        let codeSent = false;

        // 🔥🔥🔥 HAPUS WAIT FOR CONNECTION - LANGSUNG REQUEST CODE!
        console.log(`🔑 [PAIR] Meminta pairing code untuk ${cleanPhone}...`);

        // 🔥 TUNGGU 5 DETIK BIAR SOCKET SIAP
        await new Promise(r => setTimeout(r, 5000));

        // 🔥 REQUEST PAIRING CODE (3x PERCOBAAN)
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries && !pairingCode) {
            try {
                console.log(`🔑 [PAIR] Percobaan ${retryCount + 1}/${maxRetries}...`);
                pairingCode = await sock.requestPairingCode(cleanPhone);
                console.log(`✅ [PAIR] Pairing Code: ${pairingCode}`);
            } catch (err) {
                console.log(`❌ [PAIR] Percobaan ${retryCount + 1} gagal:`, err.message);
                retryCount++;
                if (retryCount < maxRetries) {
                    console.log(`🔄 [PAIR] Tunggu 3 detik, coba lagi...`);
                    await new Promise(r => setTimeout(r, 3000));
                }
            }
        }

        if (!pairingCode) {
            console.log(`❌ [PAIR] Gagal mendapatkan pairing code setelah ${maxRetries} percobaan`);
            return res.status(500).json({ 
                success: false, 
                error: 'Gagal mendapatkan pairing code' 
            });
        }

        // 🔥 KIRIM PAIRING CODE KE TELEGRAM
        try {
            const bot = global.telegramBot;
            if (bot && OWNER_ID) {
                await bot.sendMessage(OWNER_ID, 
                    `🔑 *PAIRING CODE WHATSAPP*\n\n` +
                    `📱 Nomor: ${cleanPhone}\n` +
                    `🔐 Kode: *${pairingCode}*\n\n` +
                    `📌 Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat\n` +
                    `📌 Masukkan kode: *${pairingCode}*\n` +
                    `⏳ Kode berlaku 5 menit\n\n` +
                    `⚠️ JANGAN bagikan kode ini ke siapapun!`,
                    { parse_mode: 'Markdown' }
                );
                codeSent = true;
                console.log(`✅ [PAIR] Pairing code terkirim ke Telegram: ${pairingCode}`);
            } else {
                console.log('❌ [PAIR] Telegram bot tidak tersedia!');
                await sendToTelegram(
                    `🔑 Pairing Code: ${pairingCode}\nNomor: ${cleanPhone}`,
                    'System'
                );
                codeSent = true;
            }
        } catch (e) {
            console.log(`❌ [PAIR] Gagal kirim pairing code ke Telegram:`, e.message);
        }

        // 🔥 TUNGGU KONEKSI
        sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
            if (connection === 'open') {
                console.log(`✅ [PAIR] Bot terhubung! 📱 ${sock.user.id}`);
                await saveCreds();
                
                try {
                    await axios.post('http://localhost:3004/wa-connected', {
                        phone: sock.user.id.split(':')[0] || sock.user.id,
                        timestamp: new Date().toISOString()
                    });
                    console.log('✅ [PAIR] Notif connect terkirim ke Bridge');
                } catch (e) {
                    console.log('❌ [PAIR] Gagal kirim notif connect:', e.message);
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('❌ [PAIR] Logged out!');
                } else {
                    console.log('🔄 [PAIR] Reconnecting...');
                }
            }
        });

        sock.ev.on('creds.update', async () => {
            try { await saveCreds(); } catch (e) {}
        });

        res.json({
            success: true,
            phone: cleanPhone,
            method: 'pairing_code',
            code: pairingCode,
            message: 'Pairing code dikirim ke Telegram'
        });

        // 🔥 TIMEOUT 5 MENIT
        setTimeout(async () => {
            if (!codeSent) {
                console.log('⏰ [PAIR] Pairing code timeout');
                await sendToTelegram(
                    `⚠️ Pairing code tidak terkirim. Coba ulang: /pair ${cleanPhone}`,
                    'System'
                );
            }
        }, 300000);

    } catch (error) {
        console.error('❌ [PAIR] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/repair', async (req, res) => {
    try {
        const { phoneNumber } = req.body;
        
        console.log(`🔧 [REPAIR] Request diterima${phoneNumber ? ' untuk ' + phoneNumber : ''}`);
        
        // 🔥 HAPUS SESSION LEBIH EKSTENSIF
        const sessionDir = path.join(__dirname, 'sessions');
        let deletedFiles = 0;
        
        if (fs.existsSync(sessionDir)) {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                try {
                    const filePath = path.join(sessionDir, file);
                    if (fs.statSync(filePath).isFile()) {
                        fs.unlinkSync(filePath);
                        deletedFiles++;
                        console.log(`🗑️ [REPAIR] Hapus: ${file}`);
                    }
                } catch (e) {
                    console.log(`⚠️ [REPAIR] Gagal hapus ${file}:`, e.message);
                }
            }
            console.log(`✅ [REPAIR] ${deletedFiles} file dihapus dari sessions`);
        } else {
            console.log('⚠️ [REPAIR] Folder sessions tidak ada');
            fs.mkdirSync(sessionDir, { recursive: true });
        }
        
        // 🔥 KIRIM NOTIF KE TELEGRAM
        try {
            await sendToTelegram(
                '🔧 *Repair WhatsApp Bot*\n\n' +
                '✅ Session berhasil dihapus\n' +
                '📱 Nomor lama telah diputus\n' +
                '🔑 Silahkan pairing dengan nomor baru\n\n' +
                '📌 Kirim: /pair 628xxxxxxxxxx',
                'System'
            );
        } catch (e) {
            console.log('⚠️ [REPAIR] Gagal kirim notif ke Telegram:', e.message);
        }
        
        // 🔥 RESPON SUKSES
        res.json({
            success: true,
            message: 'Session WhatsApp berhasil dihapus!',
            deleted: deletedFiles,
            phone: phoneNumber || null
        });
        
    } catch (error) {
        console.error('❌ [REPAIR] Error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ==========================================
// 🔥 ENDPOINT: RESTART WA BOT (TANPA QR)
// ==========================================

app.post('/restart', async (req, res) => {
    try {
        console.log('🔄 [RESTART] Merestart WA Bot...');
        
        // 🔥 RESET FLAG DI FILE
        _forceQR = false;
        _pairingRequested = false;
        isPairingActive = false;
        
        const flagPath = path.join(__dirname, 'qr_flag.json');
        fs.writeFileSync(flagPath, JSON.stringify({ forceQR: false, updated: Date.now() }));
        console.log('✅ [RESTART] Flag direset ke false');
        
        const { exec } = require('child_process');
        exec('pm2 restart wabot', (error, stdout, stderr) => {
            if (error) {
                console.log('❌ [RESTART] Error:', error.message);
                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
            console.log('✅ [RESTART] WA Bot direstart');
            
            res.json({
                success: true,
                message: 'WA Bot berhasil direstart'
            });
        });
        
    } catch (error) {
        console.error('❌ [RESTART] Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/pairing-status', (req, res) => {
    const credsPath = path.join(__dirname, 'sessions', 'creds.json');
    const isConnected = fs.existsSync(credsPath);
    
    let phone = '-';
    let contactsCount = 0;
    
    if (isConnected) {
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
            if (creds.me && creds.me.id) {
                phone = creds.me.id.split('@')[0] || '-';
            }
            
            // 🔥 HITUNG KONTAK DARI FILE SEWA
            if (fs.existsSync(sewaFile)) {
                const sewaData = JSON.parse(fs.readFileSync(sewaFile, 'utf8'));
                contactsCount = Object.keys(sewaData).length;
            }
        } catch (e) {}
    }
    
    // 🔥 HITUNG UPTIME
    const uptime = Math.floor((Date.now() / 1000) - START_TIME);
    
    res.json({
        connected: isConnected,
        phone: phone,
        contacts: contactsCount,  // 🔥 INI YANG DITAMBAH
        uptime: uptime,           // 🔥 INI YANG DITAMBAH
        hasPairingSock: !!activePairingSock,
        timestamp: new Date().toISOString()
    });
});

// ==========================================
// 🔥 ENDPOINT: STOP PAIRING
// ==========================================

app.post('/stop-pairing', async (req, res) => {
    try {
        console.log('🛑 [STOP] Menghentikan proses pairing...');
        
        // Matikan flag pairing
        isPairingActive = false;
        
        // Tutup socket kalo ada
        if (activePairingSock) {
            try {
                await activePairingSock.end();
                console.log('✅ [STOP] Socket ditutup');
            } catch (e) {
                console.log('⚠️ [STOP] Gagal tutup socket:', e.message);
            }
            activePairingSock = null;
        }
        
        // Hapus session biar ga restart otomatis
        if (fs.existsSync(sessionDir)) {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                try {
                    fs.unlinkSync(path.join(sessionDir, file));
                    console.log(`🗑️ [STOP] Hapus: ${file}`);
                } catch (e) {}
            }
        }
        
        res.json({ 
            success: true, 
            message: 'Pairing dihentikan, session dihapus' 
        });
        
    } catch (error) {
        console.error('❌ [STOP] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});


app.post('/broadcast-wa', async (req, res) => {
    try {
        const { message } = req.body;
        
        console.log(`📢 [BROADCAST] Mengirim broadcast...`);
        console.log(`📝 Pesan: ${message?.substring(0, 50)}...`);
        
        const allContacts = Object.keys(contacts).filter(j => j.endsWith('@s.whatsapp.net'));
        
        let sent = 0;
        let failed = 0;
        
        for (const contact of allContacts) {
            try {
                await sock.sendMessage(contact, { text: message });
                sent++;
                await sleep(1000);
            } catch (e) {
                failed++;
                console.log(`❌ Gagal kirim ke ${contact}:`, e.message);
            }
        }
        
        res.json({
            status: 'success',
            total: allContacts.length,
            sent: sent,
            failed: failed
        });
    } catch (error) {
        console.error('❌ [BROADCAST] Error:', error.message);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// ==========================================
// 🔥 ENDPOINT QR CODE
// ==========================================

// 📸 GET QR Code sebagai Image
app.get('/qr', async (req, res) => {
    try {
        if (!global._lastQR) {
            return res.status(404).json({ 
                success: false, 
                error: 'QR Code belum tersedia. Tunggu QR muncul di terminal.' 
            });
        }
        
        // CEK KADALUARSA (3 menit)
        if (Date.now() - global._lastQRTime > 180000) {
            return res.status(410).json({ 
                success: false, 
                error: 'QR Code sudah kadaluarsa (3 menit). Ketik "restart" di console untuk QR baru.' 
            });
        }
        
        const qrBuffer = await qrcode.toBuffer(global._lastQR, {
            type: 'png',
            margin: 2,
            width: 500
        });
        
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(qrBuffer);
        
        console.log(`📸 QR Code diakses via HTTP (${new Date().toISOString()})`);
        
    } catch (error) {
        console.error('❌ Error get QR:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 📸 GET QR Code sebagai Base64
app.get('/qr-base64', async (req, res) => {
    try {
        if (!global._lastQR) {
            return res.status(404).json({ 
                success: false, 
                error: 'QR Code belum tersedia' 
            });
        }
        
        if (Date.now() - global._lastQRTime > 180000) {
            return res.status(410).json({ 
                success: false, 
                error: 'QR Code sudah kadaluarsa' 
            });
        }
        
        const qrBuffer = await qrcode.toBuffer(global._lastQR, {
            type: 'png',
            margin: 2,
            width: 500
        });
        
        const base64 = qrBuffer.toString('base64');
        res.json({ 
            success: true, 
            qr: base64,
            expiresIn: Math.max(0, 180 - (Date.now() - global._lastQRTime) / 1000),
            phone: global._lastQRPhone || '6285811121679'
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔄 Refresh QR (restart pairing)
app.post('/refresh-qr', async (req, res) => {
    try {
        console.log('🔄 [REFRESH] Merestart koneksi untuk QR baru...');
        
        // HAPUS SESSION
        if (fs.existsSync(sessionDir)) {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                try { fs.unlinkSync(path.join(sessionDir, file)); } catch (e) {}
            }
        }
        
        global._lastQR = null;
        global._lastQRTime = null;
        global._reconnectAttempts = 0;
        
        // RESTART CONNECTION
        setTimeout(() => {
            connectToWhatsApp(false);
        }, 1000);
        
        res.json({ 
            success: true, 
            message: 'QR Code direset, tunggu QR baru muncul di terminal' 
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 🔥 START HTTP SERVER
// ==========================================

app.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`✅ HTTP Server running on port ${HTTP_PORT}`);
  console.log(`🏥 Health: http://localhost:${HTTP_PORT}/health`);
  console.log(`📡 Sync: http://localhost:${HTTP_PORT}/api/sync-users`);
});

// ==========================================
// 🔥 CONSOLE COMMANDS
// ==========================================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', async (input) => {
    const cmd = input.trim().toLowerCase();
    
    if (cmd === 'qr' || cmd === 'q') {
        console.log(color('\n📸 Mendapatkan QR Code...', '36'));
        try {
            const response = await axios.get('http://localhost:3005/qr-base64');
            if (response.data.success) {
                const qrBuffer = Buffer.from(response.data.qr, 'base64');
                fs.writeFileSync('qr_current.png', qrBuffer);
                console.log(color('✅ QR Code disimpan ke qr_current.png', '32'));
                console.log(color(`⏳ Expires in: ${Math.round(response.data.expiresIn)} seconds`, '33'));
                console.log(color('📱 Scan dengan WhatsApp > Perangkat Tertaut', '33'));
            }
        } catch (e) {
            console.log(color('❌ Gagal: ' + e.message, '31'));
        }
        return;
    }
    
    if (cmd === 'status' || cmd === 's') {
        const credsPath = path.join(sessionDir, 'creds.json');
        const isConnected = fs.existsSync(credsPath);
        console.log(color(`\n📊 Status: ${isConnected ? '✅ Connected' : '❌ Not Connected'}`, isConnected ? '32' : '31'));
        if (isConnected) {
            try {
                const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
                if (creds.me && creds.me.id) {
                    console.log(color(`📱 Nomor: ${creds.me.id}`, '33'));
                }
            } catch (e) {}
        }
        console.log('');
        return;
    }
    
    if (cmd === 'restart' || cmd === 'r') {
        console.log(color('\n🔄 Restarting bot...', '33'));
        // HAPUS SESSION
        if (fs.existsSync(sessionDir)) {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                try { fs.unlinkSync(path.join(sessionDir, file)); } catch (e) {}
            }
        }
        global._lastQR = null;
        global._lastQRTime = null;
        setTimeout(() => {
            startMenu();
        }, 1000);
        return;
    }
    
    if (cmd === 'help' || cmd === 'h') {
        console.log(color('\n📚 CONSOLE COMMANDS:', '36'));
        console.log(color('  q / qr     - Get QR Code', '33'));
        console.log(color('  s / status - Check connection status', '33'));
        console.log(color('  r / restart- Restart bot with new QR', '33'));
        console.log(color('  h / help   - Show this help', '33'));
        console.log('');
        return;
    }
});

console.log(color('\n📚 Ketik "help" untuk daftar perintah console\n', '33'));

// ==========================================
// 🔥 START MENU - QR CODE PRIMARY
// ==========================================

async function startMenu() {
    console.clear();
    const colors = ['green', 'blue', 'magenta', 'cyan'];
    cfonts.say('KJS-BOT', {
        font: 'block',
        align: 'center',
        gradient: [pickRandom(colors), pickRandom(colors)]
    });

    // 🔥 OTOMATIS PAKE PAIRING CODE! GA USAH PILIH!
    console.log(color('\n🔑 [SYS] Mode PAIRING CODE OTOMATIS\n', '32'));
    console.log(color('📱 Masukkan nomor di bawah ini:\n', '33'));
    
    // 🔥 PAKSA PAIRING CODE
    connectToWhatsApp(true);  // <-- TRUE = PAIRING CODE!
}

// ==========================================
// 🔥 CONNECT WHATSAPP - QR CODE PRIMARY
// ==========================================

async function connectToWhatsApp(usePairingCode = false) {
    loadSettings();
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    const version = [6, 7, 10];
    console.log(`📦 WhatsApp Web version: ${version.join('.')}`);
    
    loadCommands();

    // 🔥 CEK FLAG DARI FILE
    let forceQR = false;
    try {
        const flagPath = path.join(__dirname, 'qr_flag.json');
        if (fs.existsSync(flagPath)) {
            const data = JSON.parse(fs.readFileSync(flagPath, 'utf8'));
            forceQR = data.forceQR || false;
            console.log(`📊 [FLAG] forceQR = ${forceQR}`);
        } else {
            console.log(`⚠️ [FLAG] File tidak ada, buat baru`);
            fs.writeFileSync(flagPath, JSON.stringify({ forceQR: false, updated: Date.now() }));
            forceQR = false;
        }
    } catch (e) {
        console.log(`❌ [FLAG] Error:`, e.message);
        forceQR = false;
    }

    // 🔥 CEK APAKAH ADA SESSION VALID
    const credsPath = path.join(sessionDir, 'creds.json');
    const hasSession = fs.existsSync(credsPath);
    
    console.log(`🔍 [DEBUG] hasSession=${hasSession}, forceQR=${forceQR}`);

    // 🔥 SELALU PAKE PAIRING CODE, BUKAN QR!
    console.log(color('\n🔑 [SYS] Mode PAIRING CODE - Menggunakan Pairing Code\n', '32'));
    console.log(color('💡 Kirim /pair 628xxxxxxxxxx untuk mendapatkan kode\n', '33'));

    // 🔥 BUAT SOCKET TANPA QR
    const sock = makeWASocket({
        auth: { 
            creds: state.creds, 
            keys: makeCacheableSignalKeyStore(state.keys, logger) 
        },
        version: version,
        printQRInTerminal: false,
        logger,
        browser: ['Edge', 'Windows', '10.0.0'],
        markOnlineOnConnect: true,
        // 🔥 PAKAI PAIRING CODE
        getMessage: async () => {
            return {
                text: 'Kode pairing akan dikirim ke Telegram'
            };
        }
    });

    patchSendMessage(sock);
    global.sock = sock;

    sock.ev.on('creds.update', async () => {
        console.log('✅ [SYS] Credentials updated, saving...');
        try {
            await saveCreds();
            console.log('✅ [SYS] Credentials saved');
        } catch (e) {
            console.error('❌ [SYS] Failed to save creds:', e.message);
        }
    });

    // 🔥 EVENT CONNECTION UPDATE - TIDAK ADA QR!
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        // 🔥 QR DIABAIKAN - TIDAK DIKIRIM!
        if (qr) {
            console.log('⏸️ [QR] QR Code detected but DISABLED (using Pairing Code)');
            return;
        }
        
        // 🔥 CONNECTION CLOSE
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const isLoggedOut = statusCode === DisconnectReason.loggedOut;
            
            if (isLoggedOut) {
                console.log(color('❌ [SYS] Logged out!', '31'));
                if (fs.existsSync(sessionDir)) {
                    const files = fs.readdirSync(sessionDir);
                    for (const file of files) {
                        try { fs.unlinkSync(path.join(sessionDir, file)); } catch (e) {}
                    }
                }
                console.log(color('💡 Kirim /pair 628xxxxxxxxxx untuk pairing ulang', '33'));
                return;
            }
            
            if (!global._reconnectAttempts) global._reconnectAttempts = 0;
            global._reconnectAttempts++;
            
            if (global._reconnectAttempts <= 5) {
                const delay = 3000 * global._reconnectAttempts;
                console.log(color(`🔄 Reconnecting in ${delay/1000}s... (${global._reconnectAttempts}/5)`, '33'));
                setTimeout(() => {
                    connectToWhatsApp(false);
                }, delay);
            } else {
                console.log(color('❌ Gagal reconnect setelah 5 percobaan', '31'));
                console.log(color('💡 Kirim /pair 628xxxxxxxxxx untuk pairing ulang', '33'));
            }
        } else if (connection === 'open') {
            global._reconnectAttempts = 0;
            console.log(color('✅ [SYS] Bot Connected ✅', '32'));
            console.log(`📱 Nomor: ${sock.user.id}`);
            console.log(color('🎉 WhatsApp Bot Berhasil Terhubung!', '32'));
            
            try {
                await sendToTelegram(`✅ *WhatsApp Bot Connected!*\n\n📱 Nomor: ${sock.user.id}\n⏰ ${new Date().toLocaleString('id-ID')}`, 'System');
            } catch (e) {
                console.log('❌ Gagal kirim notif ke Telegram:', e.message);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    if (settings.antiCall) {
        sock.ev.on('call', async (call) => {
            try {
                for (const c of call) {
                    if (c.status !== 'offer') continue;
                    const num = decodeJid(c.from).split('@')[0];
                    if (settings.ownerNumber.includes(num)) continue;
                    await sock.rejectCall(c.id, c.from);
                    await sock.sendMessage(c.from, { text: '❌ Chat only ya.' });
                }
            } catch (e) {
                console.log('❌ Error handling call:', e.message);
            }
        });
    }

  // ==========================================
  // 🔥 MESSAGES HANDLER - SEMUA FITUR TETAP ADA
  // ==========================================

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const m = messages[0];
    if (!m?.message) return;

    let ts = m.messageTimestamp;
    if (typeof ts === 'object' && ts !== null) ts = ts.low || ts.toNumber?.() || parseInt(ts);
    if (ts < START_TIME) return;

    const remoteJid = m.key.remoteJid;
    const isGroup = remoteJid?.endsWith('@g.us');
    const isStatus = remoteJid === 'status@broadcast';

    // ==========================================
    // 🔥 HANDLE STATUS (AUTO REPOST) - TETAP ADA
    // ==========================================

    if (isStatus) {
      let sender = decodeJid(m.key.participant || '');
      const fromBot = m.key.fromMe || sender === decodeJid(sock.user.id);
      if (fromBot) return;
      if (!TARGET_STATUS.includes(sender)) return;

      let content = m.message;
      if (content?.viewOnceMessage) content = content.viewOnceMessage.message;

      const text = content.conversation ||
        content.extendedTextMessage?.text ||
        content.imageMessage?.caption ||
        content.videoMessage?.caption ||
        '';

      const hash = crypto.createHash('md5').update(JSON.stringify(content)).digest('hex');
      const uniqueId = sender + '-' + hash;

      if (sentStatus.has(uniqueId)) return;
      sentStatus.add(uniqueId);
      saveSentStatus();

      console.log('[AUTO REPOST] Status dari:', sender);

      const allContacts = Object.keys(contacts).filter(j => j.endsWith('@s.whatsapp.net'));
      console.log('[DEBUG] Total viewer:', allContacts.length);

      const chunkSize = 300;
      const sendWithBatch = async (msg) => {
        for (let i = 0; i < allContacts.length; i += chunkSize) {
          const chunk = allContacts.slice(i, i + chunkSize);
          console.log(`[SEND] Batch ${i} → ${chunk.length}`);
          await sock.sendMessage('status@broadcast', msg, { statusJidList: chunk });
          await sleep(1500);
        }
      };

      if (content.conversation || content.extendedTextMessage) {
        await sendWithBatch({ text });
      } else if (content.imageMessage) {
        const stream = await downloadContentFromMessage(content.imageMessage, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        await sendWithBatch({ image: buffer, caption: text });
      } else if (content.videoMessage) {
        const stream = await downloadContentFromMessage(content.videoMessage, 'video');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
        await sendWithBatch({ video: buffer, caption: text });
      }

      console.log('[AUTO REPOST] ✔ STATUS NAIK');
      return;
    }

    // ==========================================
    // 🔥 EKSTRAK SENDER
    // ==========================================

    let senderNumber = 'Unknown';
    let senderJid = '';

    try {
      if (m.key?.participantAlt) {
        senderJid = m.key.participantAlt;
        let num = senderJid.split('@')[0];
        num = num.replace(/[^0-9]/g, '');
        if (num && num.length >= 10 && num.length <= 13) {
          senderNumber = num;
        }
      }
      
      if (senderNumber === 'Unknown' && m.key?.participant) {
        senderJid = m.key.participant;
        if (!senderJid.includes('@lid')) {
          let num = senderJid.split('@')[0];
          num = num.replace(/[^0-9]/g, '');
          if (num && num.length >= 10 && num.length <= 13) {
            senderNumber = num;
          }
        }
      }
      
      if (senderNumber === 'Unknown' && m.sender) {
        senderJid = m.sender;
        let num = senderJid.split('@')[0];
        num = num.replace(/[^0-9]/g, '');
        if (num && num.length >= 10 && num.length <= 13) {
          senderNumber = num;
        }
      }
      
      if (senderNumber === 'Unknown' && m.key?.remoteJid && !isGroup) {
        senderJid = m.key.remoteJid;
        let num = senderJid.split('@')[0];
        num = num.replace(/[^0-9]/g, '');
        if (num && num.length >= 10 && num.length <= 13) {
          senderNumber = num;
        }
      }
    } catch (e) {
      senderNumber = 'Unknown';
      senderJid = '';
    }

    const isOwner = settings.ownerNumber.includes(senderNumber) || m.key?.fromMe || false;
    m.isGroup = isGroup;
    m.senderNumber = senderNumber;
    m.senderJid = senderJid;

    if (settings.mode === 'self' && !isOwner) return;

    // ==========================================
    // 🔥 EKSTRAK BODY PESAN
    // ==========================================

    const msgType = Object.keys(m.message)[0];
    let body = '';

    try {
      if (msgType === 'conversation') {
        body = m.message.conversation || '';
      } else if (msgType === 'extendedTextMessage') {
        body = m.message.extendedTextMessage.text || '';
      } else if (msgType === 'imageMessage') {
        body = m.message.imageMessage.caption || '';
      } else if (msgType === 'videoMessage') {
        body = m.message.videoMessage.caption || '';
      } else if (msgType === 'documentMessage') {
        body = m.message.documentMessage.caption || '';
      } else if (msgType === 'viewOnceMessage') {
        const onceMsg = m.message.viewOnceMessage.message || {};
        if (onceMsg.imageMessage) body = onceMsg.imageMessage.caption || '';
        else if (onceMsg.videoMessage) body = onceMsg.videoMessage.caption || '';
        else if (onceMsg.extendedTextMessage) body = onceMsg.extendedTextMessage.text || '';
      } else {
        const msg = m.message;
        if (msg.extendedTextMessage) body = msg.extendedTextMessage.text || '';
        else if (msg.imageMessage) body = msg.imageMessage.caption || '';
        else if (msg.videoMessage) body = msg.videoMessage.caption || '';
        else if (msg.documentMessage) body = msg.documentMessage.caption || '';
        else if (msg.conversation) body = msg.conversation || '';
      }
    } catch (e) {
      body = '';
    }

    if (!body) return;

    const pushName = m.pushName || 'Unknown';
    const time = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });
    
    console.log(color('\n=========================================', '90'));
    console.log(color(`TIME    : ${time}`, '90'));
    console.log(color(`TYPE    : ${isGroup ? 'GROUP' : 'PRIVATE'}`, '90'));
    console.log(color('NAME    : ', '32') + pushName + (isOwner ? color(' [OWNER]', '33') : ''));
    console.log(color('NUMBER  : ', '33') + senderNumber);
    console.log(color('MESSAGE : ', '36') + (body || color('[Media/Other]', '31')));
    if (isGroup) console.log(color('GROUP   : ', '33') + remoteJid);
    console.log(color('=========================================', '90'));

    // ==========================================
    // 🔥 AUTO JOIN GROUP - TETAP ADA
    // ==========================================

    const GROUP_BLACKLIST_KEYWORDS = ['jb'];

    if (settings.autoJoin && body) {
      const regex = /https?:\/\/chat\.whatsapp\.com\/([0-9A-Za-z]+)/g;
      const matches = [...body.matchAll(regex)];

      for (const mm of matches) {
        const inviteCode = mm[1];
        try {
          const jid = await sock.groupAcceptInvite(inviteCode);
          console.log('[AUTO JOIN] OK:', inviteCode);

          const meta = await sock.groupMetadata(jid);
          const groupName = (meta.subject || '').toLowerCase();

          const isBlocked = GROUP_BLACKLIST_KEYWORDS.some((k) => groupName.includes(k));
          if (isBlocked) {
            console.log('[BLACKLIST] LEAVE GROUP:', meta.subject);
            await sock.groupLeave(jid);
          }

          await new Promise((r) => setTimeout(r, 3000));
        } catch {
          console.log('[AUTO JOIN] FAIL:', inviteCode);
        }
      }
    }

    // ==========================================
    // 🔥 AUTO READ - TETAP ADA
    // ==========================================

    try {
      const ar = settings.autoRead;
      if (ar?.enabled) {
        const isStatusChat = remoteJid === 'status@broadcast';
        if (!isStatusChat) {
          if (!(ar.ignoreOwner && isOwner)) {
            const min = ar.delayMs?.[0] ?? 500;
            const max = ar.delayMs?.[1] ?? 1500;
            await sleep(rand(Math.min(min, max), Math.max(min, max)));
            await sock.readMessages([m.key]);
          }
        }
      }
    } catch {}

    // ==========================================
    // 🔥 DETEKSI DAERAH (HANYA GROUP) - TETAP ADA
    // ==========================================

    if (isGroup) {
      try {
        const region = extractRegionFromText(body);
        const hasRegion = region.kabupaten || region.kecamatan || region.kelurahan;
        
        if (hasRegion) {
          const dataHash = createDataHash(region);
          
          if (isDuplicateDetect(senderNumber, dataHash)) {
            console.log(`⏭️ SKIP: ${senderNumber} | ${region.kabupaten} > ${region.kecamatan} > ${region.kelurahan}`);
            return;
          }
          
          updateDetectCache(senderNumber, dataHash);
          
          let groupName = 'Private';
          if (isGroup) {
            try {
              const metadata = await sock.groupMetadata(remoteJid);
              groupName = metadata.subject || remoteJid;
            } catch (e) {
              groupName = remoteJid;
            }
          }
          
          console.log(`📥 DETEKSI: ${senderNumber} | ${region.kabupaten} > ${region.kecamatan} > ${region.kelurahan} | Grup: ${groupName}`);
          
          const messageData = {
            kabupaten: region.kabupaten,
            kecamatan: region.kecamatan,
            kelurahan: region.kelurahan,
            raw: body,
            pengirim: pushName || senderNumber,
            nomor: senderNumber,
            group: groupName,
            timestamp: new Date().toISOString()
          };
          
          const sent = await sendDataToSubscribers(messageData);
          console.log(`📤 TERKIRIM: ${sent} user dari grup "${groupName}"`);
        }
      } catch (detectError) {
        console.log(`❌ ERROR: ${detectError.message}`);
      }
      return;
    }

    // ==========================================
    // 🔥 HANDLE COMMAND (PRIVATE CHAT) - TETAP ADA
    // ==========================================

    const hasPrefix = /^[./!#]/.test(body);
    const cmdName = (hasPrefix ? body.slice(1) : body).trim().split(/ +/).shift().toLowerCase();
    const args = body.trim().split(/ +/).slice(1);

    if (cmdName === 'ping' || cmdName === 'p') {
      console.log('🏓 PING COMMAND DETECTED!');
      try {
        const uptime = Math.floor((Date.now() / 1000) - START_TIME);
        await sock.sendMessage(remoteJid, { 
          text: `🏓 *PONG!*\n\n⏱️ Uptime: ${formatUptime(uptime)}\n📞 Bot: ${sock.user.id}\n👥 Kontak: ${Object.keys(contacts || {}).length}\n⏰ ${new Date().toLocaleString('id-ID')}`
        });
        console.log('✅ PONG SENT!');
      } catch (err) {
        console.log('❌ Gagal kirim ping:', err.message);
      }
      return;
    }

    if (cmdName === 'test') {
      console.log('🧪 TEST COMMAND DETECTED!');
      try {
        await sock.sendMessage(remoteJid, { 
          text: `✅ *TEST BERHASIL!*\n\n📱 Bot berjalan normal\n⏰ ${new Date().toLocaleString('id-ID')}`
        });
        console.log('✅ TEST SENT!');
      } catch (err) {
        console.log('❌ Gagal kirim test:', err.message);
      }
      return;
    }

    if (cmdName === 'status') {
      console.log('📊 STATUS COMMAND DETECTED!');
      try {
        const uptime = Math.floor((Date.now() / 1000) - START_TIME);
        await sock.sendMessage(remoteJid, { 
          text: `📊 *STATUS BOT*\n\n📱 Status: ✅ Online\n⏱️ Uptime: ${formatUptime(uptime)}\n👥 Kontak: ${Object.keys(contacts || {}).length}\n📞 Bot: ${sock.user.id}`
        });
        console.log('✅ STATUS SENT!');
      } catch (err) {
        console.log('❌ Gagal kirim status:', err.message);
      }
      return;
    }

    if (cmdName === 'help' || cmdName === 'menu' || cmdName === 'h') {
      console.log('📚 HELP COMMAND DETECTED!');
      try {
        await sock.sendMessage(remoteJid, { 
          text: `🤖 *COMMANDS*\n\n/ping - Cek bot\n/test - Test bot\n/status - Status bot\n/help - Menu ini\n/info - Info bot`
        });
        console.log('✅ HELP SENT!');
      } catch (err) {
        console.log('❌ Gagal kirim help:', err.message);
      }
      return;
    }

    if (cmdName === 'info' || cmdName === 'i') {
      console.log('ℹ️ INFO COMMAND DETECTED!');
      try {
        const uptime = Math.floor((Date.now() / 1000) - START_TIME);
        await sock.sendMessage(remoteJid, { 
          text: `ℹ️ *INFO BOT*\n\n📱 Nama: KJS BOT\n📞 Nomor: ${sock.user.id}\n⏱️ Uptime: ${formatUptime(uptime)}\n👥 Kontak: ${Object.keys(contacts || {}).length}`
        });
        console.log('✅ INFO SENT!');
      } catch (err) {
        console.log('❌ Gagal kirim info:', err.message);
      }
      return;
    }

    // ==========================================
    // 🔥 HANDLE PURCHASE / TRIAL / RENEW FLOW - TETAP ADA
    // ==========================================

    try {
      const purchaseFlow = require('./function/purchaseFlow');
      const handled = await purchaseFlow.handleMessage(sock, m, { settings, saveSettings, isOwner });
      if (handled) return;
    } catch (e) {}

    try {
      const trialFlow = require('./function/trialFlow');
      const handled = await trialFlow.handleMessage(sock, m);
      if (handled) return;
    } catch (e) {}

    try {
      const renewFlow = require('./function/renewFlow');
      const handled = await renewFlow.handleMessage(sock, m, { settings, saveSettings, isOwner });
      if (handled) return;
    } catch (e) {}

    if (m.key.fromMe && !commands.has(cmdName)) return;

    if (commands.has(cmdName)) {
      try {
        await commands
          .get(cmdName)
          .execute(sock, m, args, { settings, saveSettings, isOwner, store: contacts, command: cmdName, allCommands: commands });
      } catch (e) {
        console.error(`[ERR CMD] ${cmdName}:`, e?.message || e);
      }
    }
  });
}

// ==========================================
// 🔥 START BOT
// ==========================================

startMenu();