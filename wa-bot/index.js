// ==========================================
// 🔥 KJS-WABOT - FULL FIXED (QR CODE PRIMARY)
// ==========================================

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  jidDecode,
  downloadContentFromMessage,
  Browsers
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
const wabotPayment = require('./wabot_payment.js');
const kpuIntegration = require('./kpu-integration.js');
const kpuIntegrationV2 = require('./kpu-integration-v2.js');  // ← TAMBAH INI
const kpuChecker = require('./kpu_checker.js');
const { parseWilayah } = require('./wilayah-lookup');

// ==========================================
// 🔥 SUPPRESS BAD MAC LOG (NOISE DARI NEWSLETTER WA)
// ==========================================
const _originalConsoleError = console.error;
console.error = (...args) => {
    const msg = args.map(a => String(a)).join(' ');
    if (
        msg.includes('Bad MAC') ||
        msg.includes('Failed to decrypt') ||
        msg.includes('Session error') ||
        msg.includes('verifyMAC') ||
        msg.includes('SessionCipher') ||
        msg.includes('doDecryptWhisperMessage') ||
        msg.includes('_asyncQueueExecutor') ||
        msg.includes('Closing open session') ||
        msg.includes('Closing session:')
    ) {
        return; // skip noise ini
    }
    _originalConsoleError.apply(console, args);
};
// ==========================================
// 🔥 AKHIR SUPPRESS BAD MAC
// ==========================================


const config = require('./config');
const OWNER_ID = config.BOT.OWNER_ID.toString();
let activePairingSock = null;
let isPairingActive = false; 
let _forceQR = false;       
let _pairingRequested = false; 

global.telegramBot = {
    sendPhoto: async (chatId, photo, options) => {
        // 🔥 DIKOSONGKAN - TIDAK KIRIM APA-APA (SUDAH PAKAI /send-qr)
        console.log('📤 [WA] sendPhoto di-skip (qr dikirim via /send-qr saja)');
        return;
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

const HTTP_PORT = 3006;
const START_TIME = Math.floor(Date.now() / 1000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ==========================================
// 🔥 PATH FILE
// ==========================================

// ==========================================
// 🔥 FILE DETEKSI DAERAH (UNTUK PENCARIAN)
// ==========================================
const DETECTED_DATA_FILE = path.join(__dirname, 'detected_data.json');

function loadDetectedData() {
    try {
        if (!fs.existsSync(DETECTED_DATA_FILE)) {
            fs.writeFileSync(DETECTED_DATA_FILE, JSON.stringify([]));
            return [];
        }
        const raw = fs.readFileSync(DETECTED_DATA_FILE, 'utf8');
        return JSON.parse(raw) || [];
    } catch (e) {
        console.log('❌ Gagal load detected_data:', e.message);
        return [];
    }
}

function saveDetectedData(data) {
    try {
        // Batasi maksimal 1000 data agar file tidak membesar
        if (data.length > 1000) {
            data = data.slice(-1000);
        }
        fs.writeFileSync(DETECTED_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('❌ Gagal simpan detected_data:', e.message);
    }
}

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
const searchModes = {};
const CACHE_DURATION = 60 * 60 * 1000;
const __sendQueues = new Map();
const __lastSent = new Map();

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

const sharedRL = readline.createInterface({ input: process.stdin, output: process.stdout });
let _questionActive = false;

const question = (text) =>
  new Promise((res) => {
    _questionActive = true;
    sharedRL.question(text, (ans) => {
      _questionActive = false;
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
// 🔥 EKSTRAK NOMOR DARI JID
// ==========================================

function extractPhoneNumber(jid) {
    if (!jid) return null;
    if (typeof jid !== 'string') jid = String(jid);
    
    console.log(`🔍 [EXTRACT] Memproses JID: ${jid}`);
    
    // 🔥 CASE 1: @s.whatsapp.net
    if (jid.includes('@s.whatsapp.net')) {
        let num = jid.split('@')[0];
        num = num.replace(/[^0-9]/g, '');
        if (num && num.length >= 10 && num.length <= 13) {
            console.log(`✅ [EXTRACT] Dari @s.whatsapp.net: ${num}`);
            return normalizeWhatsAppNumber(num);
        }
    }
    
    // 🔥 CASE 2: @lid
    if (jid.includes('@lid')) {
        let raw = jid.split('@lid')[0];
        let digits = raw.replace(/[^0-9]/g, '');
        console.log(`🔍 [EXTRACT] @lid raw: ${raw}, digits: ${digits}`);
        
        if (digits.length >= 9) {
            const patterns = [
                /62[0-9]{8,11}/,
                /08[0-9]{8,11}/,
                /0[0-9]{9,12}/
            ];
            
            for (const pattern of patterns) {
                const match = digits.match(pattern);
                if (match) {
                    let normalized = normalizePhoneNumber(match[0]);
                    if (normalized) {
                        console.log(`✅ [EXTRACT] Dari @lid pattern: ${normalized}`);
                        return normalized;
                    }
                }
            }
            
            for (let len = 10; len <= 12; len++) {
                if (digits.length >= len) {
                    let candidate = digits.slice(-len);
                    let normalized = normalizePhoneNumber(candidate);
                    if (normalized) {
                        console.log(`✅ [EXTRACT] Dari @lid last ${len}: ${normalized}`);
                        return normalized;
                    }
                }
            }
            
            if (digits.length >= 9) {
                let with62 = '62' + digits.slice(-9);
                if (with62.length >= 10 && with62.length <= 13) {
                    console.log(`✅ [EXTRACT] Dari @lid +62: ${with62}`);
                    return with62;
                }
            }
        }
        return null;
    }
    
    // 🔥 CASE 3: @g.us (group - skip)
    if (jid.includes('@g.us')) {
        return null;
    }
    
    // 🔥 CASE 4: Fallback
    const match = jid.match(/(08[0-9]{8,11}|62[0-9]{9,12})/);
    if (match) {
        let normalized = normalizePhoneNumber(match[1]);
        if (normalized) {
            console.log(`✅ [EXTRACT] Dari fallback: ${normalized}`);
            return normalized;
        }
    }
    
    return null;
}

// ==========================================
// 🔥 NORMALISASI NOMOR TELEPON
// ==========================================

function normalizePhoneNumber(input) {
    if (!input) return null;
    if (typeof input !== 'string') input = String(input);
    
    let clean = input.replace(/[^0-9]/g, '');
    if (!clean || clean.length < 8) return null;
    
    if (clean.startsWith('62') && clean.length >= 10 && clean.length <= 13) {
        return clean;
    }
    
    if (clean.startsWith('08') && clean.length >= 10 && clean.length <= 13) {
        return '62' + clean.substring(1);
    }
    
    if (clean.startsWith('0') && clean.length >= 10 && clean.length <= 12) {
        return '62' + clean.substring(1);
    }
    
    if (clean.startsWith('628') && clean.length >= 10 && clean.length <= 13) {
        return clean;
    }
    
    if (clean.length >= 10 && clean.length <= 12) {
        if (clean.startsWith('8')) {
            let result = '62' + clean;
            if (result.length >= 10 && result.length <= 13) {
                return result;
            }
        }
        let with62 = '62' + clean;
        if (with62.length >= 10 && with62.length <= 13) {
            return with62;
        }
    }
    
    if (clean.length === 9) {
        let with62 = '62' + clean;
        if (with62.length >= 10 && with62.length <= 13) {
            return with62;
        }
    }
    
    return null;
}

// ==========================================
// 🔥 VALIDASI NOMOR TELEPON
// ==========================================

function validatePhoneNumber(input) {
    if (!input) return null;
    if (typeof input !== 'string') input = String(input);
    
    let clean = input.replace(/[^0-9]/g, '');
    if (!clean || clean.length < 10 || clean.length > 13) return null;
    if (!clean.startsWith('62')) return null;
    
    return clean;
}

// ==========================================
// 🔥 EKSTRAK SEMUA NOMOR DARI TEKS
// ==========================================

function extractAllNumbersFromText(text) {
    if (!text) return [];
    
    const numbers = [];
    const patterns = [
        /\+62[0-9\s\-]{9,15}/g,
        /62[0-9\s\-]{9,15}/g,
        /08[0-9\s\-]{8,13}/g,
        /0[0-9\s\-]{9,13}/g
    ];
    
    for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
            for (const match of matches) {
                let clean = match.replace(/[\s\-]/g, '');
                let normalized = normalizePhoneNumber(clean);
                if (normalized && normalized.length >= 10 && normalized.length <= 13) {
                    numbers.push(normalized);
                }
            }
        }
    }
    
    return numbers;
}

// ==========================================
// 🔥 EKSTRAK BODY PESAN
// ==========================================

function extractMessageBody(m) {
    if (!m?.message) return '';
    
    try {
        const msg = m.message;
        const msgType = Object.keys(msg)[0];
        
        if (msgType === 'conversation') {
            return msg.conversation || '';
        }
        if (msgType === 'extendedTextMessage') {
            return msg.extendedTextMessage.text || '';
        }
        if (msgType === 'imageMessage') {
            return msg.imageMessage.caption || '';
        }
        if (msgType === 'videoMessage') {
            return msg.videoMessage.caption || '';
        }
        if (msgType === 'documentMessage') {
            return msg.documentMessage.caption || '';
        }
        if (msgType === 'viewOnceMessage') {
            const onceMsg = msg.viewOnceMessage.message || {};
            if (onceMsg.imageMessage) return onceMsg.imageMessage.caption || '';
            if (onceMsg.videoMessage) return onceMsg.videoMessage.caption || '';
            if (onceMsg.extendedTextMessage) return onceMsg.extendedTextMessage.text || '';
        }
        
        if (msg.extendedTextMessage) return msg.extendedTextMessage.text || '';
        if (msg.imageMessage) return msg.imageMessage.caption || '';
        if (msg.videoMessage) return msg.videoMessage.caption || '';
        if (msg.documentMessage) return msg.documentMessage.caption || '';
        if (msg.conversation) return msg.conversation || '';
        
        return '';
    } catch (e) {
        return '';
    }
}

// ==========================================
// 🔥 VALIDASI NOMOR WHATSAPP - PASTIKAN 62 FORMAT
// ==========================================

function isValidWhatsAppNumber(number) {
    if (!number) return false;
    if (typeof number !== 'string') number = String(number);
    
    // Hapus semua karakter non-digit
    let clean = number.replace(/[^0-9]/g, '');
    
    // 🔥 HARUS 10-13 DIGIT
    if (clean.length < 10 || clean.length > 13) return false;
    
    // 🔥 HARUS DIMULAI DENGAN 62 ATAU 08
    if (!clean.startsWith('62') && !clean.startsWith('08')) {
        // Coba tambahkan 62 jika dimulai dengan 0
        if (clean.startsWith('0') && clean.length >= 10) {
            let with62 = '62' + clean.substring(1);
            return with62.length >= 10 && with62.length <= 13;
        }
        return false;
    }
    
    // 🔥 Jika 08, ubah ke 62 untuk konsistensi
    if (clean.startsWith('08')) {
        return true; // Tetap valid, nanti dinormalisasi
    }
    
    return true;
}

function normalizeWhatsAppNumber(number) {
    if (!number) return null;
    if (typeof number !== 'string') number = String(number);
    
    let clean = number.replace(/[^0-9]/g, '');
    if (!clean || clean.length < 10) return null;
    
    // 🔥 Jika 08, ubah ke 62
    if (clean.startsWith('08')) {
        return '62' + clean.substring(1);
    }
    
    // 🔥 Jika 0, ubah ke 62
    if (clean.startsWith('0') && clean.length >= 10) {
        return '62' + clean.substring(1);
    }
    
    // 🔥 Jika 62 dan valid, return
    if (clean.startsWith('62') && clean.length >= 10 && clean.length <= 13) {
        return clean;
    }
    
    return null;
}

// ==========================================
// 🔥 FUNGSI EKSTRAK NOMOR WHATSAPP - DIPERBAIKI
// ==========================================

function extractWhatsAppNumber(text) {
    if (!text) return null;
    if (typeof text !== 'string') text = String(text);
    
    // 🔥 Pola 1: Nomor dengan 08 (10-13 digit)
    let match = text.match(/(08[0-9]{8,11})(?![0-9])/);
    if (match) {
        const num = match[1].replace(/[^0-9]/g, '');
        if (num.length >= 10 && num.length <= 13) return num;
    }
    
    // 🔥 Pola 2: Nomor dengan 62 (10-13 digit)
    match = text.match(/(62[0-9]{8,11})(?![0-9])/);
    if (match) {
        const num = match[1].replace(/[^0-9]/g, '');
        if (num.length >= 10 && num.length <= 13) return num;
    }
    
    // 🔥 Pola 3: Nomor dengan +62
    match = text.match(/\+62([0-9]{9,12})(?![0-9])/);
    if (match) {
        const num = '62' + match[1].replace(/[^0-9]/g, '');
        if (num.length >= 10 && num.length <= 13) return num;
    }
    
    // 🔥 Pola 4: Nomor dengan 0 di awal (tanpa 8)
    match = text.match(/0([0-9]{9,12})(?![0-9])/);
    if (match) {
        const num = match[1].replace(/[^0-9]/g, '');
        if (num.length >= 9 && num.length <= 12) return '0' + num;
    }
    
    // 🔥 Pola 5: Nomor dengan pola 08xxxxxxxx
    match = text.match(/08[0-9]{8,11}/);
    if (match) {
        const num = match[0].replace(/[^0-9]/g, '');
        if (num.length >= 10 && num.length <= 13) return num;
    }
    
    // 🔥 Pola 6: Nomor dengan pola 62xxxxxxxx
    match = text.match(/62[0-9]{8,11}/);
    if (match) {
        const num = match[0].replace(/[^0-9]/g, '');
        if (num.length >= 10 && num.length <= 13) return num;
    }
    
    return null;
}

// ==========================================
// 🔥 EKSTRAK NOMOR DARI PUSHNAME (NAMA DI SAMPING)
// ==========================================

function extractNumberFromPushName(pushName) {
    if (!pushName) return null;
    if (typeof pushName !== 'string') pushName = String(pushName);
    
    console.log(`🔍 [PUSHNAME] Memproses: "${pushName}"`);
    
    // 🔥 POLA 1: +62 838-4755-7344
    let match = pushName.match(/\+62\s*[0-9\s\-]{9,15}/);
    if (match) {
        let num = match[0].replace(/[^0-9]/g, '');
        if (num.length >= 10 && num.length <= 13) {
            let normalized = normalizeWhatsAppNumber(num);
            if (normalized) {
                console.log(`✅ [PUSHNAME] +62: ${normalized}`);
                return normalized;
            }
        }
    }
    
    // 🔥 POLA 2: 62 838-4755-7344
    match = pushName.match(/62\s*[0-9\s\-]{9,15}/);
    if (match) {
        let num = match[0].replace(/[^0-9]/g, '');
        if (num.length >= 10 && num.length <= 13) {
            let normalized = normalizeWhatsAppNumber(num);
            if (normalized) {
                console.log(`✅ [PUSHNAME] 62: ${normalized}`);
                return normalized;
            }
        }
    }
    
    // 🔥 POLA 3: 0838-4755-7344
    match = pushName.match(/08[0-9\s\-]{8,12}/);
    if (match) {
        let num = match[0].replace(/[^0-9]/g, '');
        if (num.length >= 10 && num.length <= 13) {
            let normalized = normalizeWhatsAppNumber(num);
            if (normalized) {
                console.log(`✅ [PUSHNAME] 08: ${normalized}`);
                return normalized;
            }
        }
    }
    
    // 🔥 POLA 4: 083847557344
    match = pushName.match(/08[0-9]{8,11}/);
    if (match) {
        let num = match[0].replace(/[^0-9]/g, '');
        if (num.length >= 10 && num.length <= 13) {
            let normalized = normalizeWhatsAppNumber(num);
            if (normalized) {
                console.log(`✅ [PUSHNAME] 08 tanpa spasi: ${normalized}`);
                return normalized;
            }
        }
    }
    
    // 🔥 POLA 5: 6283847557344
    match = pushName.match(/62[0-9]{8,11}/);
    if (match) {
        let num = match[0].replace(/[^0-9]/g, '');
        if (num.length >= 10 && num.length <= 13) {
            let normalized = normalizeWhatsAppNumber(num);
            if (normalized) {
                console.log(`✅ [PUSHNAME] 62 tanpa spasi: ${normalized}`);
                return normalized;
            }
        }
    }
    
    return null;
}

function extractNumberFromJid(jid) {
    if (!jid) return null;
    if (typeof jid !== 'string') jid = String(jid);
    
    console.log(`🔍 [JID] Parsing: ${jid}`);
    
    // 🔥 Jika JID mengandung @lid
    if (jid.includes('@lid')) {
        let raw = jid.split('@lid')[0];
        let digits = raw.replace(/[^0-9]/g, '');
        console.log(`🔍 [JID] Raw @lid: ${raw}, Digits: ${digits}`);
        
        if (digits.length >= 10) {
            // 🔥 CARI 62 atau 08 di dalam digits
            const patterns = [
                /62[0-9]{8,11}/,
                /08[0-9]{8,11}/,
                /0[0-9]{9,12}/
            ];
            
            for (const pattern of patterns) {
                const match = digits.match(pattern);
                if (match) {
                    let num = match[0];
                    // Jika mulai dengan 0, ubah ke 62
                    if (num.startsWith('0')) {
                        num = '62' + num.substring(1);
                    }
                    // Jika mulai dengan 08, ubah ke 62
                    if (num.startsWith('08')) {
                        num = '62' + num.substring(1);
                    }
                    if (num.length >= 10 && num.length <= 13) {
                        console.log(`✅ [JID] Nomor dari @lid (pattern): ${num}`);
                        return num;
                    }
                }
            }
            
            // 🔥 FALLBACK: Ambil 10-12 digit terakhir
            for (let i = 10; i <= 12; i++) {
                if (digits.length >= i) {
                    let candidate = digits.slice(-i);
                    console.log(`🔍 [JID] Coba candidate: ${candidate}`);
                    
                    // Coba sebagai 62
                    if (candidate.startsWith('62') && candidate.length >= 10 && candidate.length <= 13) {
                        console.log(`✅ [JID] Nomor dari @lid (62): ${candidate}`);
                        return candidate;
                    }
                    // Coba sebagai 08
                    if (candidate.startsWith('08') && candidate.length >= 10 && candidate.length <= 13) {
                        console.log(`✅ [JID] Nomor dari @lid (08): ${candidate}`);
                        return candidate;
                    }
                    // Coba tambahkan 62
                    if (candidate.length >= 9 && !candidate.startsWith('0')) {
                        const with62 = '62' + candidate;
                        if (with62.length >= 10 && with62.length <= 13) {
                            console.log(`✅ [JID] Nomor dari @lid (+62): ${with62}`);
                            return with62;
                        }
                    }
                }
            }
            
            // 🔥 LAST RESORT: Coba ambil 12 digit terakhir dan tambahkan 62
            if (digits.length >= 12) {
                const last12 = digits.slice(-12);
                // Coba jika sudah 62 atau 08
                if (last12.startsWith('62') || last12.startsWith('08')) {
                    console.log(`✅ [JID] Nomor dari @lid (last12): ${last12}`);
                    return last12;
                }
                // Tambahkan 62
                const with62 = '62' + last12;
                if (with62.length >= 10 && with62.length <= 13) {
                    console.log(`✅ [JID] Nomor dari @lid (last12+62): ${with62}`);
                    return with62;
                }
            }
        }
        return null;
    }
    
    // 🔥 Jika JID mengandung @s.whatsapp.net
    if (jid.includes('@s.whatsapp.net')) {
        let num = jid.split('@')[0];
        num = num.replace(/[^0-9]/g, '');
        if (num && num.length >= 10 && num.length <= 13) {
            console.log(`✅ [JID] Nomor dari @s.whatsapp.net: ${num}`);
            return num;
        }
        return null;
    }
    
    // 🔥 Jika JID mengandung @g.us (group)
    if (jid.includes('@g.us')) {
        return null;
    }
    
    // 🔥 Fallback
    const match = jid.match(/(08[0-9]{8,11}|62[0-9]{9,12})/);
    if (match) {
        return match[1];
    }
    
    return null;
}

// ==========================================
// 🔥 RESOLVE LID → NOMOR WHATSAPP
// ==========================================

const lidCache = new Map();
const LID_CACHE_DURATION = 6 * 60 * 60 * 1000;

async function resolveSenderFromLid(sock, lidJid, remoteJid) {
    try {
        if (!lidJid || !lidJid.includes('@lid')) return null;

        const cached = lidCache.get(lidJid);
        if (cached && (Date.now() - cached.time) < LID_CACHE_DURATION) {
            console.log(`✅ [LID] Cache hit: ${lidJid} → ${cached.pn}`);
            return cached.pn;
        }

        // 🔥 PRIORITAS 1: signalRepository internal baileys (LID→PN mapping)
        let pn = null;
        try {
            const raw = await sock.signalRepository?.lidMapping?.getPNForLID(lidJid);
            if (raw) {
                const num = normalizeWhatsAppNumber(raw);
                if (num) {
                    pn = num;
                    console.log(`✅ [LID] Dari signalRepository: ${lidJid} → ${pn}`);
                }
            }
        } catch (e) {
            console.log(`⚠️ [LID] signalRepository gagal: ${e.message}`);
        }

        // 🔥 PRIORITAS 2: groupMetadata participants
        if (!pn && remoteJid) {
            try {
                const meta = await sock.groupMetadata(remoteJid);
                const lidRaw = lidJid.split('@')[0];
                const part = (meta.participants || []).find((p) =>
                    p.id === lidJid || p.id?.split('@')[0] === lidRaw
                );
                const rawNum = part?.phoneNumber || part?.pn || part?.id || null;
                const num = normalizeWhatsAppNumber(rawNum);
                if (num) {
                    pn = num;
                    console.log(`✅ [LID] Dari groupMetadata: ${lidJid} → ${pn}`);
                }
            } catch (e) {
                console.log(`⚠️ [LID] groupMetadata gagal: ${e.message}`);
            }
        }

        // 🔥 PRIORITAS 3: DEEP SCAN semua grup untuk mapping {id, phoneNumber}
        if (!pn) {
            try {
                const groups = await sock.groupFetchAllParticipating();
                for (const jid in groups) {
                    const group = groups[jid];
                    if (!group?.participants) continue;
                    for (const p of group.participants) {
                        if (p.id?.includes('@lid') && p.id.split('@')[0] === lidJid.split('@')[0]) {
                            const num = normalizeWhatsAppNumber(p.phoneNumber || p.pn || p.id);
                            if (num) {
                                pn = num;
                                console.log(`✅ [LID] Dari deep scan: ${lidJid} → ${pn}`);
                                break;
                            }
                        }
                    }
                    if (pn) break;
                }
            } catch (e) {
                console.log(`⚠️ [LID] Deep scan gagal: ${e.message}`);
            }
        }

        if (pn) {
            lidCache.set(lidJid, { pn, time: Date.now() });
        }
        return pn;
    } catch (e) {
        console.log(`❌ [LID] Error resolve ${lidJid}: ${e.message}`);
        return null;
    }
}

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
// 🔥 KIRIM KE TELEGRAM DENGAN BUTTON ADMIN REKBER (Markdown + Code Block)
// ==========================================

async function sendToTelegramUserWithAdminButton(fullMessage, chatId, username = null) {
    try {
        const telegramUrl = settings.telegramBridge?.url || 'http://localhost:3004';
        const ADMIN_WA_NUMBER = "6285943111681";
        
        // 🔥 AMBIL NOMOR DARI PESAN
        let nomorPenjual = 'Tidak terdeteksi';
        const nomorMatch = fullMessage.match(/Nomor Penjual:\*?\s*(?:https:\/\/wa\.me\/)?([0-9]+)/);
        if (nomorMatch) {
            nomorPenjual = nomorMatch[1];
        }
        
        // 🔥 AMBIL DATA DARI <pre>
        let cleanData = '';
        const preMatch = fullMessage.match(/<pre>([\s\S]*?)<\/pre>/);
        if (preMatch) {
            cleanData = preMatch[1].trim();
        }
        
        // 🔥 HAPUS <pre> DARI PESAN
        let textPart = fullMessage.replace(/<pre>[\s\S]*?<\/pre>/, '');
        textPart = textPart.trim();
        
        // 🔥 BUILD PESAN AKHIR: Teks + Code Block (```)
        let finalMessage = textPart + '\n\n';
        finalMessage += '```\n' + cleanData + '\n```';
        
        // 🔥 BUILD PESAN UNTUK WHATSAPP
        const waMessage = `Assalamualaikum Admin, saya member Bot SUNG JIN WOO BOT dan ingin menggunakan jasa rekber.%0A%0ANomor Penjual: ${nomorPenjual}`;
        const encodedText = encodeURIComponent(waMessage);
        
        const payload = {
            chatId: chatId,
            message: finalMessage,
            parse_mode: 'Markdown', // 🔥 PAKAI MARKDOWN UNTUK CODE BLOCK
            reply_markup: {
                inline_keyboard: [
                    [{ 
                        text: "💬 ADMIN REKBER", 
                        url: `https://wa.me/${ADMIN_WA_NUMBER}?text=${encodedText}`
                    }]
                ]
            }
        };
        
        console.log(`[WA-BOT] 📤 Mengirim ke ${chatId} (${username || 'User'}) dengan button Admin (Markdown + Code Block)...`);
        
        await axios.post(`${telegramUrl}/send-to-telegram-user-button`, payload, {
            timeout: 10000
        });
        
        console.log('[WA-BOT] ✅ Pesan dengan button Admin terkirim');
        return true;
        
    } catch (error) {
        console.log('[WA-BOT] ❌ Gagal kirim dengan button:', error.message);
        
        // 🔥 FALLBACK: KIRIM TANPA BUTTON
        try {
            const fallbackPayload = {
                chatId: chatId,
                message: fullMessage.replace(/<pre>|<\/pre>/g, ''),
                parse_mode: 'Markdown'
            };
            
            await axios.post(`${telegramUrl}/send-to-telegram-user`, fallbackPayload, {
                timeout: 8000
            });
            console.log('[WA-BOT] ✅ Fallback terkirim');
            return true;
        } catch (e) {
            console.log('[WA-BOT] ❌ Fallback gagal:', e.message);
            return false;
        }
    }
}

// ==========================================
// 🔥 KIRIM KE TELEGRAM DENGAN BUTTON
// ==========================================

async function sendToTelegramUserWithWAButton(chatId, fullMessage, rawData) {
  try {
    const telegramUrl = settings.telegramBridge?.url || 'http://localhost:3004';
    const ADMIN_WA_NUMBER = "6285943111681";
    
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
      const ADMIN_WA_NUMBER = "6285943111681";
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

// ==========================================
// 🔥 FUNGSI DETEKSI DAERAH DARI PESAN (TANPA PROVINSI)
// ==========================================

function extractRegionFromText(text) {
  const data = { kabupaten: null, kecamatan: null, kelurahan: null };

  console.log('[DETEKSI] 🔍 Mencari daerah di pesan...');

  // ==========================================
  // 🔥 STRATEGI 1: LABEL EKSPLISIT
  // Format: 📍KAB : BANDUNG / *KAB* BANDUNG / KAB: BANDUNG
  // ==========================================

  const kabupatenPatterns = [
    /(?:📍\s*)?(?:KAB|KABUPATEN|KOTA)\s*[:.]?\s*([A-Z][A-Z\s]+?)(?=\n|$|,|;)/i,
    /\*\s*KAB\s*\*?\s*[:.]?\s*([A-Z][A-Z\s]+?)(?=\n|$|,|;)/i,
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
    /(?:📍\s*)?(?:KEC|KECAMATAN)\s*[:.]?\s*([A-Z][A-Z\s]+?)(?=\n|$|,|;)/i,
    /\*\s*KEC\s*\*?\s*[:.]?\s*([A-Z][A-Z\s]+?)(?=\n|$|,|;)/i,
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
    /(?:📍\s*)?(?:KEL|KELURAHAN|DESA)\s*[:.]?\s*([A-Z][A-Z\s]+?)(?=\n|$|,|;)/i,
    /\*\s*KEL\s*\*?\s*[:.]?\s*([A-Z][A-Z\s]+?)(?=\n|$|,|;)/i,
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

  // ==========================================
  // 🔥 STRATEGI 2: POSITIONAL (baris ke-3, 4, 5 dari bawah)
  // Format DATER polos: KABUPATEN\nKECAMATAN\nKELURAHAN
  // ==========================================

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
        const skipWords = [
          'DATA', 'INFO', 'PROMO', 'HARGA', 'SALDO', 'KPJ', 'NIK', 'TTL',
          'JMO', 'GO_', 'GO ', 'REGIST', 'LANJUT', 'TOTAL', 'JUMLAH',
          'CIRCLEKA', 'WASERBA', 'LAKI', 'PEREMPUAN', 'SENSOR', 'RP ',
          'PT ', 'KPJ ', 'DIV', 'KONTRAK', 'INDONESIA', 'MULTIKARYA',
          'KLINIK', 'DEPARTMENT', 'STORE', 'CENTER', 'HOME', 'SUMBER',
          'HASIL', 'PRIMA', 'SHINWON', 'MATAHARI', 'ARINA', 'KAHATEX',
          'BALI MELITA', 'SINAR', 'MENTARI', 'MAKMUR', 'DJAVA', 'BERKAH',
          'MINERAL', 'SITE', 'INASENTRA', 'UNISATYA', 'OPEN', 'BIOMETRIK',
          'SUSPEND', 'RESKUN', 'VIP', 'PAKLARING', 'KOREKSI', 'VALIDASI',
          'ACAK', 'CETAK', 'KTP', 'SIAK', 'LASIK', 'GOCENG'
        ];
        return !skipWords.some(word => l.toUpperCase().includes(word));
      });

    // Ambil baris yang kemungkinan besar kabupaten/kecamatan/kelurahan
    // Biasanya 3 baris berurutan
    let candidates = [];

    for (const line of lines) {
      const upper = line.toUpperCase();
      // Skip kalau mengandung "GO_JMO", "DPT", "SUDAH", "TERDAFTAR"
      if (upper.includes('GO_JMO') || upper.includes('DPT') || 
          upper.includes('SUDAH TERDAFTAR') || upper.includes('LASIK')) continue;
      candidates.push(upper);
    }

    console.log(`[DETEKSI] 🔍 Kandidat baris (${candidates.length}): ${JSON.stringify(candidates)}`);

    // Ambil 3 baris terakhir sebagai kabupaten, kecamatan, kelurahan
    // (karena biasanya format DATER: di bawah ada kab/kec/kel)
    if (candidates.length >= 3) {
      // Kalau ada 3 baris berurutan di akhir
      const lastThree = candidates.slice(-3);
      
      // Cek apakah ini benar kabupaten/kecamatan/kelurahan
      const validRegion = lastThree.every(s => 
        s.length >= 3 && s.length < 40 && /^[A-Z\s\-\.]+$/.test(s)
      );

      if (validRegion) {
        // Urutan bisa dibolak-balik, tapi biasanya: kabupaten, kecamatan, kelurahan
        // Atau: kecamatan, kelurahan, kabupaten (tergantung format)
        // Default: ambil dari atas ke bawah
        if (!data.kabupaten) data.kabupaten = lastThree[0];
        if (!data.kecamatan) data.kecamatan = lastThree[1];
        if (!data.kelurahan) data.kelurahan = lastThree[2];
        
        console.log(`[DETEKSI] ✅ Format DATER (positional):`);
        console.log(`   🏙️ Kabupaten: ${data.kabupaten}`);
        console.log(`   🏘️ Kecamatan: ${data.kecamatan}`);
        console.log(`   🏡 Kelurahan: ${data.kelurahan}`);
      }
    }
  }

  // ==========================================
  // 🔥 STRATEGI 3: HANYA KABUPATEN (fallback)
  // Kalau cuma dapat kabupaten, biarkan kecamatan/kelurahan null
  // ==========================================

  // Cleanup final
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

async function sendDataToSubscribers(messageData) {
    console.log('='.repeat(60));
    console.log('📊 [SEND] DATA MASUK:');
    console.log(`  📱 Pengirim: ${messageData.pengirim}`);
    console.log(`  📱 Nomor: ${messageData.nomor || '❌ TIDAK ADA'}`);
    console.log(`  🏙️ Kabupaten: ${messageData.kabupaten}`);
    console.log(`  🏘️ Kecamatan: ${messageData.kecamatan}`);
    console.log(`  🏡 Kelurahan: ${messageData.kelurahan}`);
    console.log(`  👥 Group: ${messageData.group}`);
    console.log('='.repeat(60));
    
    let nomorPenjual = 'Tidak terdeteksi';
    
    function cleanPhoneNumber(input) {
        if (!input) return null;
        if (typeof input !== 'string') input = String(input);
        
        let clean = input.replace(/[^0-9]/g, '');
        if (!clean || clean.length < 9) return null;
        
        if (clean.startsWith('08')) {
            return '62' + clean.substring(1);
        }
        if (clean.startsWith('0') && clean.length >= 10) {
            return '62' + clean.substring(1);
        }
        if (clean.startsWith('62') && clean.length >= 10 && clean.length <= 13) {
            return clean;
        }
        if (clean.length >= 10 && clean.length <= 12) {
            let with62 = '62' + clean;
            if (with62.length >= 10 && with62.length <= 13) {
                return with62;
            }
        }
        return null;
    }
    
    function isValidNumber(num) {
        if (!num) return false;
        let clean = num.replace(/[^0-9]/g, '');
        return clean.length >= 10 && clean.length <= 13 && clean.startsWith('62');
    }
    
    if (messageData.nomor && messageData.nomor !== 'Tidak terdeteksi' && messageData.nomor !== 'Unknown') {
        let cleaned = cleanPhoneNumber(messageData.nomor);
        if (cleaned && isValidNumber(cleaned)) {
            nomorPenjual = cleaned;
            console.log(`✅ [VALIDASI] Pakai nomor sender: ${nomorPenjual}`);
        }
    }
    
    if (nomorPenjual === 'Tidak terdeteksi' && messageData.pengirim) {
        let extracted = extractNumberFromPushName(messageData.pengirim);
        if (extracted && isValidNumber(extracted)) {
            nomorPenjual = extracted;
            console.log(`✅ [VALIDASI] Pakai dari pushName: ${nomorPenjual}`);
        }
    }
    
    if (nomorPenjual === 'Tidak terdeteksi' && messageData.raw) {
        let extracted = extractWhatsAppNumber(messageData.raw);
        if (extracted && isValidNumber(extracted)) {
            nomorPenjual = extracted;
            console.log(`✅ [VALIDASI] Pakai dari body: ${nomorPenjual}`);
        }
    }
    
    if (!isValidNumber(nomorPenjual)) {
        let normalized = cleanPhoneNumber(nomorPenjual);
        if (normalized && isValidNumber(normalized)) {
            nomorPenjual = normalized;
        } else {
            nomorPenjual = messageData.nomor || messageData.pengirim || 'Tidak terdeteksi';
        }
    }
    
    console.log(`📱 [FINAL] Nomor Penjual: ${nomorPenjual}`);
    
    if (!fs.existsSync(sewaFile)) {
        console.log('❌ No sewa file found');
        return 0;
    }
    
    let sewa = {};
    try { 
        sewa = JSON.parse(fs.readFileSync(sewaFile)); 
    } catch (e) { 
        console.log('❌ Error reading sewa file');
        return 0;
    }
    
    const now = Date.now();
    let sent = 0;
    
    // 🔥 FORMAT PESAN DENGAN <pre> UNTUK MUDAH DI COPY
    let cleanData = messageData.raw || '';
    cleanData = cleanData.replace(/\*/g, '');
    cleanData = cleanData.replace(/_/g, '');
    cleanData = cleanData.replace(/`/g, '');
    cleanData = cleanData.replace(/~/g, '');
    cleanData = cleanData.replace(/[📊📍🆔👤📅💰🏢❍⚏➥●🔐❀]/g, '');
    cleanData = cleanData.trim();
    
    // 🔥 BUAT PESAN DENGAN <pre> + BUTTON ADMIN REKBER
    let fullMessage = `📊 *DATA DARI WHATSAPP*\n\n`;
    
    // 🔥 DATA UTAMA DALAM <pre> - USER BISA COPY LANGSUNG
    fullMessage += `<pre>\n`;
    fullMessage += `${cleanData}\n`;
    fullMessage += `</pre>\n\n`;
    
    fullMessage += `┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅\n`;
    fullMessage += `📱 *Dari:* ${messageData.pengirim || '-'}\n`;
    fullMessage += `📱 *Nomor Penjual:* https://wa.me/${nomorPenjual}\n`;
    fullMessage += `👥 *Dari Group:* ${messageData.group || 'Private'}\n`;
    fullMessage += `⏰ *Waktu:* ${new Date().toLocaleString('id-ID')}\n`;
    fullMessage += `┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅\n`;
    fullMessage += `\n➥ *MINAT DENGAN DATA INI?* ✓\n`;
    fullMessage += `● Silakan hubungi nomor penjual yang tertera di atas.\n\n`;
    fullMessage += `🔐 *UTAMAKAN KEAMANAN TRANSAKSI*\n\n`;
    fullMessage += `➥ Disarankan menggunakan jasa *Rekber*.\n\n`;
    fullMessage += ` *Bijak dalam bertransaksi.* ✓\n`;
    fullMessage += `┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅`;
    
    // 🔥 KIRIM KE SEMUA USER
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
            // ================================================================
            // 🔥🔥🔥 BAGIAN YANG DIPERBAIKI - PASTIKAN USERNAME DI TAG
            // ================================================================
            
            let displayName = userId; // Default ke ID
            
            // 🔥 PRIORITAS 1: Username Telegram (dengan @)
            if (user.username && user.username !== '-' && user.username.length > 0) {
                // Pastikan ada @ di depan
                displayName = user.username.startsWith('@') ? user.username : '@' + user.username;
                console.log(`✅ [USER] Pakai username: ${displayName}`);
            } 
            // 🔥 PRIORITAS 2: Nama dari duration (jika terlihat seperti nama)
            else if (user.duration && user.duration !== '-' && user.duration.length > 0 && !/^[0-9]+$/.test(user.duration)) {
                displayName = user.duration;
                console.log(`✅ [USER] Pakai duration sebagai nama: ${displayName}`);
            } 
            // 🔥 PRIORITAS 3: Ambil dari chatId (formatnya biasanya @username atau angka)
            else if (userId) {
                // Coba ambil username dari chatId
                let extracted = userId;
                // Jika userId mengandung @, ambil setelah @
                if (userId.includes('@')) {
                    let parts = userId.split('@');
                    // Ambil bagian terakhir yang bukan angka
                    for (let p of parts) {
                        if (p && !/^[0-9]+$/.test(p) && p.length > 0) {
                            extracted = '@' + p;
                            break;
                        }
                    }
                }
                // Jika extracted masih sama dengan userId (biasanya angka), coba cari di user.daerah
                if (extracted === userId && /^[0-9]+$/.test(userId)) {
                    // Coba cari username di data lain
                    if (user.firstName) {
                        extracted = user.firstName;
                    } else if (user.lastName) {
                        extracted = user.lastName;
                    } else {
                        extracted = 'User'; // Fallback
                    }
                }
                displayName = extracted;
                console.log(`✅ [USER] Pakai dari chatId: ${displayName}`);
            }
            
            // 🔥 CLEANUP: Hapus karakter aneh tapi PERTAHANKAN @ untuk tag
            // Jika displayName dimulai dengan @, jaga @-nya
            let hasAt = displayName.startsWith('@');
            let cleanDisplay = displayName.replace(/[^a-zA-Z0-9_\s@]/g, '').trim();
            if (hasAt && !cleanDisplay.startsWith('@')) {
                cleanDisplay = '@' + cleanDisplay;
            }
            
            if (!cleanDisplay || cleanDisplay.length < 1) {
                cleanDisplay = userId; // Fallback ke ID
            }
            
            // 🔥 BUAT GREETING DENGAN NAMA (dengan tag @ jika ada)
            const greeting = `Hallo *${cleanDisplay}*, data pesananmu nih 🥳👇\n\n`;
            const taggedMessage = `${greeting}${fullMessage}`;
            
            // 🔥 KIRIM KE TELEGRAM DENGAN BUTTON ADMIN REKBER
            await sendToTelegramUserWithAdminButton(taggedMessage, userId, cleanDisplay);
            sent++;
            
            console.log(`✅ KIRIM: User ${cleanDisplay} (${userId}) | ${messageData.kabupaten} > ${messageData.kecamatan} > ${messageData.kelurahan}`);
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

// ==========================================
// 🔥 ENDPOINT: TERIMA FILE CEK DPT DARI TELEGRAM (via bridge)
// 🔥 VERSI FIXED — PAKAI kpuChecker LANGSUNG
// ==========================================
app.post('/api/cekdpt-from-telegram', async (req, res) => {
  try {
    const { chatId, userId, username, fileUrl, fileName } = req.body;
    
    console.log(`📥 [CEKDPT-TG] Terima dari Telegram: ${fileName}`);
    console.log(`📥 [CEKDPT-TG] User: ${username} (${chatId})`);
    
    if (!chatId || !fileUrl) {
      return res.status(400).json({ success: false, error: 'chatId & fileUrl required' });
    }
    
    // Respon cepat ke Telegram
    res.json({ success: true, message: 'File diterima, sedang diproses' });
    
    // Proses di background
    setImmediate(async () => {
      let excelPath = null;   // ✅ TAMBAH INI
      let tmpPath = null;     // ✅ TAMBAH INI
      try {
        // 1. Download file dari Telegram
        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        
        const safeName = (fileName || 'file.xlsx').replace(/[^a-zA-Z0-9._-]/g, '_');
        tmpPath = path.join(uploadsDir, `cekdpt_tg_${Date.now()}_${safeName}`);
        
        console.log(`📥 [CEKDPT-TG] Download: ${fileUrl}`);
        const fileResp = await axios.get(fileUrl, { 
          responseType: 'arraybuffer',
          timeout: 30000 
        });
        fs.writeFileSync(tmpPath, Buffer.from(fileResp.data));
        console.log(`✅ [CEKDPT-TG] File disimpan: ${tmpPath}`);
        
// 2. Kirim notif "sedang diproses" (RINGKAS) — SIMPAN message_id
let processingMsgId = null;
try {
  const processingRes = await axios.post('http://localhost:3004/send-cekdpt-result', {
    chatId: chatId,
    result: `⏳ Memproses ${fileName}...`,
    status: 'processing',
    fileName: fileName,
    version: 'v1'   // ← TAMBAHKAN INI
  });
  // Simpan message_id untuk dihapus nanti
  if (processingRes.data && processingRes.data.messageId) {
    processingMsgId = processingRes.data.messageId;
  }
} catch (e) {
  console.log('⚠️ Gagal kirim notif processing:', e.message);
}
        
        // 3. Baca NIK dari Excel
        console.log(`🔍 [CEKDPT-TG] Membaca NIK dari Excel...`);
        const nikList = kpuChecker.readNikFromExcel(tmpPath);
        
        if (nikList.length === 0) {
          throw new Error('Tidak ada NIK ditemukan di file Excel');
        }
        
        console.log(`✅ [CEKDPT-TG] Ditemukan ${nikList.length} NIK`);
        
        // 4. Init browser
        await kpuChecker.initBrowser();
        
        // 5. Proses semua NIK
        const results = [];
        for (let i = 0; i < nikList.length; i++) {
          const nik = nikList[i];
          console.log(`📋 [CEKDPT-TG] ${i + 1}/${nikList.length} - NIK: ${nik}`);
          
          try {
            const result = await kpuChecker.checkSingleNik(nik);
            results.push(result);
            
            if (result.status === 'success') {
              console.log(`   ✅ ${result.data?.nama || '-'} | ${result.data?.status || '-'}`);
            } else if (result.status === 'not_registered') {
              console.log(`   ⚠️ TIDAK TERDAFTAR`);
            } else {
              console.log(`   ❌ ${result.error || 'Gagal'}`);
            }
          } catch (err) {
            console.log(`   ❌ Error NIK ${nik}: ${err.message}`);
            results.push({
              nik: nik,
              status: 'error',
              error: err.message,
              data: null
            });
          }
          
          // Delay antar NIK
          if (i < nikList.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
        
        // 6. Tutup browser
        await kpuChecker.closeBrowser();
        
        // 7. Bikin Excel hasil
                // 🔥 PAKAI EXCEL BUILDER KEREN
        const { buildExcel } = require('./excel-builder');

        results.forEach(r => {
          if (r.data && r.data.wilayah) {
            const w = parseWilayah(r.data.wilayah);
            r.data.provinsi = w.provinsi;
            r.data.kabupaten = w.kabupaten;
            r.data.kecamatan = w.kecamatan;
            r.data.kelurahan = w.kelurahan;
          }
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        excelPath = path.join(uploadsDir, `Hasil_Cek_DPT_${timestamp}.xlsx`);
        await buildExcel(results, excelPath);
        console.log(`📊 [CEKDPT-TG] Excel tersimpan: ${excelPath}`);
        
        // 8. Hitung ringkasan
        const successCount = results.filter(r => r.status === 'success').length;
        const notRegCount = results.filter(r => r.status === 'not_registered').length;
        const failedCount = results.filter(r => r.status !== 'success' && r.status !== 'not_registered').length;
        
        // 🔥 HAPUS notif "Memproses" biar chat bersih
        if (processingMsgId) {
          try {
            await axios.post('http://localhost:3004/delete-message', {
              chatId: chatId,
              messageId: processingMsgId
            });
            console.log(`🗑️ [CEKDPT-TG] Notif processing dihapus`);
          } catch (e) {
            console.log('⚠️ Gagal hapus notif processing:', e.message);
          }
        }
        
        console.log(`✅ [CEKDPT-TG] Hasil ringkasan terkirim ke Telegram`);
        
        // 11. Kirim file Excel ke Telegram (via WA Bot → bridge)
        try {
          const excelBuffer = fs.readFileSync(excelPath);
          const base64Excel = excelBuffer.toString('base64');
          const fileNameHasil = `Hasil_Cek_DPT_${timestamp}.xlsx`;
          
                    await axios.post('http://localhost:3004/send-cekdpt-file', {
            chatId: chatId,
            fileName: fileNameHasil,
            fileBase64: base64Excel,
            caption: `📌 *HASIL CEK DPT V1*\n\nTotal: ${nikList.length} NIK\n✅ ${successCount} | ⚠️ ${notRegCount} | ❌ ${failedCount}`,
            version: 'v1'   // ← TAMBAHKAN INI
          }, { timeout: 30000 }).catch(err => {
            console.log(`⚠️ [CEKDPT-TG] Gagal kirim file Excel: ${err.message}`);
          });
          
          console.log(`✅ [CEKDPT-TG] File Excel terkirim ke Telegram`);
        } catch (fileErr) {
          console.log(`⚠️ [CEKDPT-TG] Gagal baca file Excel: ${fileErr.message}`);
        }
        
        // 12. Hapus file temporary
        try { fs.unlinkSync(tmpPath); } catch (e) {}
        try { fs.unlinkSync(excelPath); } catch (e) {}
        
      } catch (error) {
        console.log(`❌ [CEKDPT-TG] Error:`, error.message);
        
        // Tutup browser kalau masih kebuka
        try { await kpuChecker.closeBrowser(); } catch (e) {}
        
        await axios.post('http://localhost:3004/send-cekdpt-result', {
          chatId: chatId,
          result: `❌ *Gagal memproses file:*\n\n${error.message}`,
          status: 'error',
          fileName: fileName,
          version: 'v1'   // ← TAMBAHKAN INI
        }).catch(() => {});
      }
    });
    
  } catch (error) {
    console.log('❌ [CEKDPT-TG] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 🔥 ENDPOINT: TERIMA FILE CEK DPT V2 DARI TELEGRAM
// ==========================================
app.post('/api/cekdpt-v2-from-telegram', async (req, res) => {
  try {
    const { chatId, userId, username, fileUrl, fileName } = req.body;
    
    console.log(`📥 [CEKDPT V2-TG] Terima dari Telegram: ${fileName}`);
    console.log(`📥 [CEKDPT V2-TG] User: ${username} (${chatId})`);
    
    if (!chatId || !fileUrl) {
      return res.status(400).json({ success: false, error: 'chatId & fileUrl required' });
    }
    
    res.json({ success: true, message: 'File V2 diterima, sedang diproses' });
    
    setImmediate(async () => {
      let excelPath = null;
      let tmpPath = null;
      try {
        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
        
        const safeName = (fileName || 'file.xlsx').replace(/[^a-zA-Z0-9._-]/g, '_');
        tmpPath = path.join(uploadsDir, `cekdpt_v2_tg_${Date.now()}_${safeName}`);
        
        console.log(`📥 [CEKDPT V2-TG] Download: ${fileUrl}`);
        const fileResp = await axios.get(fileUrl, { 
          responseType: 'arraybuffer',
          timeout: 30000 
        });
        fs.writeFileSync(tmpPath, Buffer.from(fileResp.data));
        console.log(`✅ [CEKDPT V2-TG] File disimpan: ${tmpPath}`);
        
        // Notif processing
        let processingMsgId = null;
        try {
          const processingRes = await axios.post('http://localhost:3004/send-cekdpt-result', {
            chatId: chatId,
            result: `⏳ Memproses V2 ${fileName}...`,
            status: 'processing',
            fileName: fileName,
            version: 'v2'
          });
          if (processingRes.data && processingRes.data.messageId) {
            processingMsgId = processingRes.data.messageId;
          }
        } catch (e) {
          console.log('⚠️ Gagal kirim notif processing V2:', e.message);
        }
        
        // Baca NIK
        console.log(`🔍 [CEKDPT V2-TG] Membaca NIK dari Excel...`);
        const nikList = kpuChecker.readNikFromExcel(tmpPath);
        
        if (nikList.length === 0) {
          throw new Error('Tidak ada NIK ditemukan di file Excel');
        }
        
        console.log(`✅ [CEKDPT V2-TG] Ditemukan ${nikList.length} NIK`);
        
        await kpuChecker.initBrowser();
        
        const results = [];
        for (let i = 0; i < nikList.length; i++) {
          const nik = nikList[i];
          console.log(`📋 [CEKDPT V2-TG] ${i + 1}/${nikList.length} - NIK: ${nik}`);
          
          try {
            const result = await kpuChecker.checkSingleNik(nik);
            results.push(result);
            
            if (result.status === 'success') {
              console.log(`   ✅ ${result.data?.nama || '-'} | ${result.data?.status || '-'}`);
            } else if (result.status === 'not_registered') {
              console.log(`   ⚠️ TIDAK TERDAFTAR`);
            } else {
              console.log(`   ❌ ${result.error || 'Gagal'}`);
            }
          } catch (err) {
            console.log(`   ❌ Error NIK ${nik}: ${err.message}`);
            results.push({
              nik: nik,
              status: 'error',
              error: err.message,
              data: null
            });
          }
          
          if (i < nikList.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
        
        await kpuChecker.closeBrowser();
        
        const { buildExcel } = require('./excel-builder');

        results.forEach(r => {
          if (r.data && r.data.wilayah) {
            const w = parseWilayah(r.data.wilayah);
            r.data.provinsi = w.provinsi;
            r.data.kabupaten = w.kabupaten;
            r.data.kecamatan = w.kecamatan;
            r.data.kelurahan = w.kelurahan;
          }
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        excelPath = path.join(uploadsDir, `Hasil_Cek_DPT_V2_${timestamp}.xlsx`);
        await buildExcel(results, excelPath);
        console.log(`📊 [CEKDPT V2-TG] Excel tersimpan: ${excelPath}`);
        
        const successCount = results.filter(r => r.status === 'success').length;
        const notRegCount = results.filter(r => r.status === 'not_registered').length;
        const failedCount = results.filter(r => r.status !== 'success' && r.status !== 'not_registered').length;
        
        // Hapus notif processing
        if (processingMsgId) {
          try {
            await axios.post('http://localhost:3004/delete-message', {
              chatId: chatId,
              messageId: processingMsgId
            });
            console.log(`🗑️ [CEKDPT V2-TG] Notif processing dihapus`);
          } catch (e) {
            console.log('⚠️ Gagal hapus notif processing:', e.message);
          }
        }
        
        // Kirim file Excel V2
        try {
          const excelBuffer = fs.readFileSync(excelPath);
          const base64Excel = excelBuffer.toString('base64');
          const fileNameHasil = `Hasil_Cek_DPT_V2_${timestamp}.xlsx`;
          
          await axios.post('http://localhost:3004/send-cekdpt-file', {
            chatId: chatId,
            fileName: fileNameHasil,
            fileBase64: base64Excel,
            caption: `🆕 *HASIL CEK DPT V2*\n\nTotal: ${nikList.length} NIK\n✅ ${successCount} | ⚠️ ${notRegCount} | ❌ ${failedCount}`,
            version: 'v2'
          }, { timeout: 30000 }).catch(err => {
            console.log(`⚠️ [CEKDPT V2-TG] Gagal kirim file Excel: ${err.message}`);
          });
          
          console.log(`✅ [CEKDPT V2-TG] File Excel terkirim ke Telegram`);
        } catch (fileErr) {
          console.log(`⚠️ [CEKDPT V2-TG] Gagal baca file Excel: ${fileErr.message}`);
        }
        
        try { fs.unlinkSync(tmpPath); } catch (e) {}
        try { fs.unlinkSync(excelPath); } catch (e) {}
        
      } catch (error) {
        console.log(`❌ [CEKDPT V2-TG] Error:`, error.message);
        
        try { await kpuChecker.closeBrowser(); } catch (e) {}
        
        await axios.post('http://localhost:3004/send-cekdpt-result', {
          chatId: chatId,
          result: `❌ *Gagal memproses file V2:*\n\n${error.message}`,
          status: 'error',
          fileName: fileName,
          version: 'v2'
        }).catch(() => {});
      }
    });
    
  } catch (error) {
    console.log('❌ [CEKDPT V2-TG] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 🔥 ENDPOINT: TERIMA NIK TEKS V2 DARI TELEGRAM
// ==========================================
app.post('/api/cekdpt-v2-from-nik', async (req, res) => {
  try {
    const { chatId, userId, username, nikList } = req.body;
    
    console.log(`📥 [CEKDPT V2-NIK] Terima dari Telegram: ${nikList?.length || 0} NIK`);
    console.log(`📥 [CEKDPT V2-NIK] User: ${username} (${chatId})`);
    
    if (!chatId || !nikList || !Array.isArray(nikList)) {
      return res.status(400).json({ success: false, error: 'chatId & nikList required' });
    }
    
    if (nikList.length === 0) {
      return res.status(400).json({ success: false, error: 'NIK list kosong' });
    }
    
    if (nikList.length > 50) {
      return res.status(400).json({ success: false, error: 'Maksimal 50 NIK' });
    }
    
    res.json({ success: true, message: `${nikList.length} NIK diterima, sedang diproses` });
    
    setImmediate(async () => {
      let excelPath = null;
      try {
        // Notif processing
        let processingMsgId = null;
        try {
          const processingRes = await axios.post('http://localhost:3004/send-cekdpt-result', {
            chatId: chatId,
            result: `⏳ Memproses V2 (${nikList.length} NIK)...`,
            status: 'processing',
            version: 'v2'
          });
          if (processingRes.data && processingRes.data.messageId) {
            processingMsgId = processingRes.data.messageId;
          }
        } catch (e) {
          console.log('⚠️ Gagal kirim notif processing V2:', e.message);
        }
        
        // Init browser
        await kpuChecker.initBrowser();
        
        const results = [];
        for (let i = 0; i < nikList.length; i++) {
          const nik = String(nikList[i]).replace(/[^0-9]/g, '');
          if (nik.length !== 16) continue;
          
          console.log(`📋 [CEKDPT V2-NIK] ${i + 1}/${nikList.length} - NIK: ${nik}`);
          
          try {
            const result = await kpuChecker.checkSingleNik(nik);
            results.push(result);
            
            if (result.status === 'success') {
              console.log(`   ✅ ${result.data?.nama || '-'} | ${result.data?.status || '-'}`);
            } else if (result.status === 'not_registered') {
              console.log(`   ⚠️ TIDAK TERDAFTAR`);
            } else {
              console.log(`   ❌ ${result.error || 'Gagal'}`);
            }
          } catch (err) {
            console.log(`   ❌ Error NIK ${nik}: ${err.message}`);
            results.push({ nik, status: 'error', error: err.message, data: null });
          }
          
          if (i < nikList.length - 1) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
        
        await kpuChecker.closeBrowser();
        
        // Enrich wilayah
        const { parseWilayah } = require('./wilayah-lookup');
        results.forEach(r => {
          if (r.data && r.data.wilayah) {
            const w = parseWilayah(r.data.wilayah);
            r.data.provinsi = w.provinsi;
            r.data.kabupaten = w.kabupaten;
            r.data.kecamatan = w.kecamatan;
            r.data.kelurahan = w.kelurahan;
          }
        });
        
        const successCount = results.filter(r => r.status === 'success').length;
        const notRegCount = results.filter(r => r.status === 'not_registered').length;
        const failedCount = results.filter(r => r.status !== 'success' && r.status !== 'not_registered').length;
        
        // 🔥 HAPUS notif processing
        if (processingMsgId) {
          try {
            await axios.post('http://localhost:3004/delete-message', {
              chatId: chatId, messageId: processingMsgId
            });
          } catch (e) {}
        }
        
        // ==========================================
        // 🔥 KONDISIONAL: ≤ 10 = TEKS, > 10 = EXCEL
        // ==========================================
        if (nikList.length <= 10) {
          console.log(`📝 [CEKDPT V2-NIK] Mode TEKS (${nikList.length} NIK ≤ 10)`);
          
          // 🔥 BUILD HASIL TEKS DETAIL
                    // 🔥 BUILD HASIL TEKS DETAIL (FORMAT CANTIK)
          const now = new Date();
          const tglStr = now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
          const jamStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(/\./g, ":");

          let textResult = `╭ ───┈ " 🆕 " ── ⬦ ׁ\n`;
          textResult += `├  HASIL CEK DPT V2\n`;
          textResult += `╰─┈꯭─꯭──꯭─꯭─꯭──꯭─╌─꯭─꯭─꯭─꯭──꯭──꯭\n\n`;
          textResult += `📊 Total NIK: ${nikList.length}\n`;
          textResult += `✅ Terdaftar: ${successCount}\n`;
          textResult += `⚠️ Tidak Terdaftar: ${notRegCount}\n`;
          textResult += `❌ Error: ${failedCount}\n\n`;
          textResult += `━━━━━━━━━━━━━━━━━━━━\n`;

          results.forEach((r, i) => {
            const no = String(i + 1).padStart(2, "0");
            textResult += `\n${no}. `;

            if (r.status === "success" && r.data) {
              textResult += `🟢 DATA TERDAFTAR\n\n`;
              textResult += `🆔 NIK: \`${r.nik}\`\n`;
              textResult += `👤 Nama: ${r.data.nama || "-"}\n`;
              textResult += `📌 Status: ${r.data.status || "-"}\n`;
              textResult += `✅ Validasi: ${r.data.validasi || "-"}\n`;

              if (r.data.wilayah && r.data.wilayah !== "-") {
                try {
                  const w = parseWilayah(r.data.wilayah);
                  if (w.provinsi && w.provinsi !== "-") textResult += `🏛️ Provinsi: ${w.provinsi}\n`;
                  if (w.kabupaten && w.kabupaten !== "-") textResult += `🏢 Kabupaten: ${w.kabupaten}\n`;
                  if (w.kecamatan && w.kecamatan !== "-") textResult += `📍 Kecamatan: ${w.kecamatan}\n`;
                  if (w.kelurahan && w.kelurahan !== "-") textResult += `🏠 Kelurahan: ${w.kelurahan}\n`;
                } catch (e) {
                  textResult += `📍 Wilayah: ${r.data.wilayah}\n`;
                }
              }

              textResult += `🕐 ${tglStr} • ${jamStr} WIB\n`;
            } else if (r.status === "not_registered") {
              textResult += `⚠️ DATA TIDAK TERDAFTAR\n\n`;
              textResult += `🆔 NIK: \`${r.nik}\`\n`;
              textResult += `⚠️ Status: TIDAK TERDAFTAR\n`;
            } else {
              textResult += `❌ ERROR\n\n`;
              textResult += `🆔 NIK: \`${r.nik}\`\n`;
              textResult += `❌ Error: ${r.error || "Unknown"}\n`;
            }

            textResult += `\n━━━━━━━━━━━━━━━━━━━━\n`;
          });

          textResult += `\n━━━━━━━━━━━━━━━━━━━━`;
     
          
          // Kirim via bridge (tanpa file)
          await axios.post('http://localhost:3004/send-cekdpt-result', {
            chatId: chatId,
            result: textResult,
            status: 'success',
            version: 'v2',
            raw: true   // flag biar bridge gak format ulang
          }, { timeout: 30000 }).catch(err => {
            console.log(`⚠️ Gagal kirim teks: ${err.message}`);
          });
          
          console.log(`✅ [CEKDPT V2-NIK] Hasil teks terkirim`);
          
        } else {
          console.log(`📊 [CEKDPT V2-NIK] Mode EXCEL (${nikList.length} NIK > 10)`);
          
          // Bikin Excel
          const { buildExcel } = require('./excel-builder');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const uploadsDir = path.join(__dirname, 'uploads');
          if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
          excelPath = path.join(uploadsDir, `Hasil_Cek_DPT_V2_${timestamp}.xlsx`);
          await buildExcel(results, excelPath);
          console.log(`📊 Excel tersimpan: ${excelPath}`);
          
          // Kirim file Excel via bridge
          try {
            const excelBuffer = fs.readFileSync(excelPath);
            const base64Excel = excelBuffer.toString('base64');
            
            await axios.post('http://localhost:3004/send-cekdpt-file', {
              chatId: chatId,
              fileName: `Hasil_Cek_DPT_V2_${timestamp}.xlsx`,
              fileBase64: base64Excel,
              caption: `🆕 *HASIL CEK DPT V2*\n\nTotal: ${nikList.length} NIK\n✅ ${successCount} | ⚠️ ${notRegCount} | ❌ ${failedCount}`,
              version: 'v2'
            }, { timeout: 30000 }).catch(err => {
              console.log(`⚠️ Gagal kirim file: ${err.message}`);
            });
            
            console.log(`✅ [CEKDPT V2-NIK] File Excel terkirim`);
          } catch (fileErr) {
            console.log(`⚠️ Gagal baca Excel: ${fileErr.message}`);
          }
          
          // Hapus file
          try { fs.unlinkSync(excelPath); } catch (e) {}
        }
        
      } catch (error) {
        console.log(`❌ [CEKDPT V2-NIK] Error:`, error.message);
        try { await kpuChecker.closeBrowser(); } catch (e) {}
        
        await axios.post('http://localhost:3004/send-cekdpt-result', {
          chatId: chatId,
          result: `❌ *Gagal memproses V2:*\n\n${error.message}`,
          status: 'error',
          version: 'v2'
        }).catch(() => {});
      }
    });
    
  } catch (error) {
    console.log('❌ [CEKDPT V2-NIK] Error:', error.message);
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

// ==========================================
// 🔥 ENDPOINT: SYNC SALDO DARI BOT TELEGRAM
// ==========================================

app.post('/api/sync-saldo-data', (req, res) => {
  try {
    const { saldoData } = req.body;
    
    console.log(`📡 [WA-BOT] Menerima sync saldo`);
    console.log(`📊 Total user: ${Object.keys(saldoData || {}).length}`);
    
    if (saldoData) {
      const saldoFile = path.join(__dirname, 'saldo.json');
      fs.writeFileSync(saldoFile, JSON.stringify(saldoData, null, 2));
      console.log(`✅ [WA-BOT] saldo.json diupdate: ${Object.keys(saldoData).length} user`);
    }
    
    res.json({ 
      success: true, 
      message: 'Saldo data synced',
      total: Object.keys(saldoData || {}).length
    });
  } catch (error) {
    console.error('❌ [WA-BOT] Sync saldo error:', error.message);
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

app.get('/api/search-region', (req, res) => {
    try {
        const query = req.query.q || '';
        if (!query || query.length < 2) {
            return res.status(400).json({ success: false, error: 'Minimal 2 huruf' });
        }
        const allData = loadDetectedData();
        const keyword = query.toLowerCase().trim();
        const results = allData.filter(item => {
            const kab = (item.kabupaten || '').toLowerCase();
            const kec = (item.kecamatan || '').toLowerCase();
            const kel = (item.kelurahan || '').toLowerCase();
            return kab.includes(keyword) || kec.includes(keyword) || kel.includes(keyword);
        });
        results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        res.json({
            success: true,
            query: query,
            total: results.length,
            data: results.slice(0, 50)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔍 Aktifkan mode pencarian real-time
app.post('/api/activate-search', (req, res) => {
    try {
        const { chatId, keyword, duration = 300 } = req.body;
        if (!chatId || !keyword) {
            return res.status(400).json({ success: false, error: 'chatId dan keyword required' });
        }

        searchModes[chatId] = {
            keyword: keyword.toLowerCase().trim(),
            expiresAt: Date.now() + (duration * 1000)
        };

        console.log(`🔍 [SEARCH] Aktif untuk ${chatId}: "${keyword}" selama ${duration} detik`);
        res.json({ success: true, message: `Mencari "${keyword}" selama ${duration} detik` });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 🔍 Nonaktifkan mode pencarian
app.post('/api/deactivate-search', (req, res) => {
    try {
        const { chatId } = req.body;
        if (chatId && searchModes[chatId]) {
            delete searchModes[chatId];
            console.log(`🔍 [SEARCH] Dinonaktifkan untuk ${chatId}`);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
            browser: Browsers.ubuntu('Chrome'),
            markOnlineOnConnect: true,
        });

        activePairingSock = sock;
        global.sock = sock;

        let pairingCode = null;
        let codeSent = false;

        console.log(`🔑 [PAIR] Meminta pairing code untuk ${cleanPhone}...`);
        
        try {
            pairingCode = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error("Timeout 20 detik menunggu socket siap")), 20000);
                
                sock.ev.on('connection.update', async (update) => {
                    const { qr, connection } = update;
                    
                    if (qr && !sock.authState.creds.registered) {
                        try {
                            const code = await sock.requestPairingCode(cleanPhone);
                            clearTimeout(timeout);
                            resolve(code);
                        } catch (err) {
                            clearTimeout(timeout);
                            reject(err);
                        }
                    }
                    
                    if (connection === 'close') {
                        clearTimeout(timeout);
                        reject(new Error("Connection closed sebelum QR muncul"));
                    }
                });
            });
            console.log(`✅ [PAIR] Pairing Code: ${pairingCode}`);
        } catch (err) {
            console.log(`❌ [PAIR] Gagal mendapatkan pairing code:`, err.message);
            return res.status(500).json({ 
                success: false, 
                error: err.message
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

const sock = global.sock;
if (!sock) {
    return res.status(503).json({ error: 'Bot belum connect' });
}

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

// 🔍 CARI LANGSUNG DI SEMUA GRUP (TANPA FILE)
app.get('/api/search-groups', async (req, res) => {
    try {
        const query = req.query.q || '';
        if (!query || query.length < 2) {
            return res.status(400).json({ success: false, error: 'Minimal 2 huruf' });
        }

        const keyword = query.toLowerCase().trim();
        const sock = global.sock;
        
        if (!sock) {
            return res.status(503).json({ success: false, error: 'WA Bot belum terhubung!' });
        }

        // 🔥 AMBIL SEMUA GRUP
        const groups = await sock.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        
        if (groupIds.length === 0) {
            return res.json({ success: true, total: 0, data: [] });
        }

        console.log(`🔍 [SEARCH] Mencari "${keyword}" di ${groupIds.length} grup...`);

        let results = [];

        for (const groupId of groupIds) {
            try {
                const meta = await sock.groupMetadata(groupId);
                const groupName = meta.subject || groupId;

                // 🔥 COBA AMBIL 100 PESAN
                let messages = [];
                try {
                    messages = await sock.loadMessages(groupId, 100);
                } catch (e) {
                    console.log(`⚠️ Gagal load messages ${groupId}:`, e.message);
                    continue;
                }
                
                if (messages.length === 0) continue;
                
                for (const msg of messages) {
                    if (!msg.message) continue;
                    
                    const body = extractMessageBody(msg);
                    if (!body) continue;
                    
                    if (body.toLowerCase().includes(keyword)) {
                        const sender = msg.pushName || 'Unknown';
                        const senderJid = msg.key?.participant || msg.key?.remoteJid || 'Unknown';
                        const nomor = extractPhoneNumber(senderJid) || 'Tidak diketahui';
                        const waktu = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toLocaleString('id-ID') : '-';
                        
                        results.push({
                            kabupaten: '-',
                            kecamatan: '-',
                            kelurahan: '-',
                            pengirim: sender,
                            nomor: nomor,
                            group: groupName,
                            raw: body.substring(0, 1000),
                            timestamp: msg.messageTimestamp || Date.now()
                        });
                    }
                }
                
                await sleep(300);
                
            } catch (e) {
                console.log(`⚠️ [SEARCH] Gagal scan grup ${groupId}:`, e.message);
            }
        }

        results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        res.json({
            success: true,
            query: query,
            total: results.length,
            data: results.slice(0, 50)
        });

    } catch (error) {
        console.error('❌ [SEARCH-GROUPS] Error:', error.message);
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

sharedRL.on('line', async (input) => {
    if (_questionActive) return;
    const cmd = input.trim().toLowerCase();
    
    if (cmd === 'qr' || cmd === 'q') {
        console.log(color('\n📸 Mendapatkan QR Code...', '36'));
        try {
            const response = await axios.get('http://localhost:3006/qr-base64');
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

// ==========================================
// 🔥 START MENU - QR ATAU PAIRING CODE
// ==========================================

async function startMenu() {
    console.clear();
    const colors = ['green', 'blue', 'magenta', 'cyan'];
    cfonts.say('KJS-BOT', {
        font: 'block',
        align: 'center',
        gradient: [pickRandom(colors), pickRandom(colors)]
    });

    const credsPath = path.join(sessionDir, 'creds.json');
    if (fs.existsSync(credsPath)) {
        console.log(color('\n[SYS] Session ditemukan → Auto Continue ✅\n', '32'));
        connectToWhatsApp(false);
        return;
    }

    console.log(color('\n=========================================', '36'));
    console.log(color('         🔥 KJS-BOT WITH QR PAIR 🔥', '33'));
    console.log(color('=========================================', '36'));
    console.log(color('\n[1] Connect With Pairing Code', '32'));
    console.log(color('[2] Connect With QR Code (Kirim ke Telegram) 🔥', '33'));
    console.log(color('=========================================', '36'));    
  
    const method = await question(color('Pilih metode [1/2]: ', '36'));
    
    // 🔥 Jika pilih 2, PAKSA QR AKTIF
    if (method.trim() === '2') {
        console.log(color('\n📱 Mode QR CODE - QR akan dikirim ke Telegram', '33'));
        console.log(color('💡 Pastikan bot Telegram berjalan di port 3004', '33'));
        console.log(color('📲 QR Code akan dikirim ke Owner Telegram\n', '33'));
        
        // HAPUS SESSION BIAR QR MUNCUL
        if (fs.existsSync(sessionDir)) {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                try { fs.unlinkSync(path.join(sessionDir, file)); } catch (e) {}
            }
            console.log(color('🗑️ Session dihapus, QR akan muncul', '33'));
        }
        
        try {
            await axios.post('http://localhost:3004/send-to-telegram-user', {
                chatId: OWNER_ID,
                message: 
`🔔 *QR PAIRING MODE AKTIF!*

📌 Bot akan generate QR Code untuk pairing WhatsApp
📲 Scan QR Code di WhatsApp > Perangkat Tertaut
⏱️ QR berlaku 3 menit

💡 Tunggu QR Code muncul di chat ini...`
            });
        } catch (e) {
            console.log(color('⚠️ Gagal kirim notif ke Telegram:', '31'), e.message);
        }
    }
    
    // FALSE = QR CODE, TRUE = PAIRING CODE
    connectToWhatsApp(method.trim() === '1');
}

// ==========================================
// 🔥 CONNECT WHATSAPP - QR CODE PRIMARY
// ==========================================

async function connectToWhatsApp(usePairingCode = false) {
    global._reconnectAttempts = 0;  // ← TAMBAH INI
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
    
    console.log(`🔍 [DEBUG] hasSession=${hasSession}, forceQR=${forceQR}, usePairingCode=${usePairingCode}`);

    // 🔥 TAMPILKAN MODE YANG DIGUNAKAN
    if (usePairingCode) {
        console.log(color('\n🔑 [SYS] Mode PAIRING CODE - Menggunakan Pairing Code\n', '32'));
        console.log(color('💡 Kirim /pair 628xxxxxxxxxx untuk mendapatkan kode\n', '33'));
    } else {
        console.log(color('\n📸 [SYS] Mode QR CODE - QR akan muncul di terminal & Telegram\n', '32'));
        console.log(color('💡 Scan QR Code dengan WhatsApp > Perangkat Tertaut\n', '33'));
    }

    // 🔥 BUAT SOCKET - printQRInTerminal AKTIF jika mode QR
    const sock = makeWASocket({
        auth: { 
            creds: state.creds, 
            keys: makeCacheableSignalKeyStore(state.keys, logger) 
        },
        version: version,
        printQRInTerminal: false, // 🔥 QR TAMPIL DI TERMINAL JIKA MODE QR
        logger,
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: true,
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

    // 🔥 EVENT CONNECTION UPDATE - QR AKTIF!
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        // 🔥🔥🔥 QR CODE DETEKTED - KIRIM KE TELEGRAM!
        if (qr && !usePairingCode) {
    console.log('📸 [QR] QR Code detected!');
    
    // Simpan QR untuk diakses nanti
    global._lastQR = qr;
    global._lastQRTime = Date.now();
    
    // Tampilkan di terminal
    console.log(color('\n[SYS] QR Code (terminal):', '36'));
    qrcode.toString(qr, { type: 'terminal', small: true }, (err, url) => {
        if (!err) console.log(url);
    });
   
    
        console.log(color('📌 QR tersedia via /qr-base64 atau tombol "PAIRING QR DI SINI"', '33'));
}

        if (qr && usePairingCode && !sock.authState.creds.registered && !global._pairingRequestedCLI) {
            global._pairingRequestedCLI = true;
            try {
                const phoneNumber = await question(color('\nMasukkan Nomor Bot (e.g 628xxx): ', '32'));
                const code = await sock.requestPairingCode(phoneNumber.trim());
                console.log(color(`\nPairing Code: ${code}\n`, '33'));
                
                try {
                    await axios.post('http://localhost:3004/send-to-telegram-user', {
                        chatId: OWNER_ID,
                        message: 
`🔑 *PAIRING CODE WHATSAPP*

📱 Nomor: ${phoneNumber}
🔐 Kode: *${code}*

📌 Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat
📌 Masukkan kode: *${code}*
⏳ Kode berlaku 5 menit

⚠️ JANGAN bagikan kode ini ke siapapun!`
                    });
                } catch (e) {}
            } catch (e) {
                console.error('❌ [PAIR ERROR]', e.message);
                global._pairingRequestedCLI = false;
            }
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
            
if (global._reconnectAttempts <= 3) {
    const delay = 8000 * global._reconnectAttempts;
    console.log(color(`🔄 Reconnecting in ${delay/1000}s... (${global._reconnectAttempts}/3)`, '33'));
                setTimeout(() => {
                    connectToWhatsApp(usePairingCode);
                }, delay);
            } else {
                console.log(color('❌ Gagal reconnect setelah 3 percobaan', '31'));
                console.log(color('💡 Kirim /pair 628xxxxxxxxxx untuk pairing ulang', '33'));
            }
} else if (connection === 'open') {
    global._reconnectAttempts = 0;
    console.log(color('✅ [SYS] Bot Connected ✅', '32'));
    console.log(`📱 Nomor: ${sock.user.id}`);
    console.log(color('🎉 WhatsApp Bot Berhasil Terhubung!', '32'));

    // ============================================================
    // 🔥🔥🔥 SIMPAN NOMOR BOT KE FILE (BUAT KPU CHECKER AUTO)
    // ============================================================
    try {
        const nomorBot = sock.user.id.split(':')[0].split('@')[0];  // 6283830803474
        const nomorFile = path.join(__dirname, 'nomor_bot.json');
        fs.writeFileSync(nomorFile, JSON.stringify({
            phone: nomorBot,
            updated: Date.now()
        }, null, 2));
        console.log(`💾 [SYS] Nomor bot disimpan: ${nomorBot}`);
    } catch (e) {
        console.log('❌ [SYS] Gagal simpan nomor bot:', e.message);
    }
    // ============================================================
    // 🔥 AKHIR SIMPAN NOMOR BOT
    // ============================================================

    // 🔥 Kirim notif ke Telegram HANYA kalau belum pernah connect
    if (!global._notifSent) {
        global._notifSent = true;
        try {
            await sendToTelegram(`✅ *WhatsApp Bot Connected!*\n\n📱 Nomor: ${sock.user.id}\n⏰ ${new Date().toLocaleString('id-ID')}`, 'System');
        } catch (e) {
            console.log('❌ Gagal kirim notif ke Telegram:', e.message);
        }
    }  // ← 🔥 TUTUP if (!global._notifSent) DI SINI

    // 🔥🔥🔥 DEEP SCAN LID → NOMOR (SEMUA GRUP)
    setTimeout(async () => {
        try {
            console.log('🔍 [LID] Deep scan semua grup untuk mapping LID...');
            const groups = await sock.groupFetchAllParticipating();
            let scanned = 0;
            for (const jid in groups) {
                const group = groups[jid];
                if (!group?.participants) continue;
                for (const p of group.participants) {
                    if (p.id?.includes('@lid') && p.phoneNumber) {
                        const pn = normalizeWhatsAppNumber(p.phoneNumber);
                        if (pn && !lidCache.has(p.id)) {
                            lidCache.set(p.id, { pn, time: Date.now() });
                            scanned++;
                        }
                    }
                }
            }
            console.log(`✅ [LID] Deep scan selesai: ${scanned} mapping baru dari ${Object.keys(groups).length} grup`);
        } catch (e) {
            console.log(`⚠️ [LID] Deep scan gagal: ${e.message}`);
        }
    }, 5000);

    // 🔥 MAPPING LID DARI GRUP BARU/BERGABUNG
    sock.ev.on('groups.upsert', (groups) => {
        for (const group of groups || []) {
            if (!group?.participants) continue;
            for (const p of group.participants) {
                if (p.id?.includes('@lid') && p.phoneNumber) {
                    const pn = normalizeWhatsAppNumber(p.phoneNumber);
                    if (pn) {
                        lidCache.set(p.id, { pn, time: Date.now() });
                        console.log(`✅ [LID] Mapping dari groups.upsert: ${p.id} → ${pn}`);
                    }
                }
            }
        }
    });

    // 🔥 MAPPING LID SAAT MEMBER GRUP BERUBAH
    sock.ev.on('group-participants.update', async (update) => {
        try {
            const meta = await sock.groupMetadata(update.id);
            for (const p of meta.participants || []) {
                if (p.id?.includes('@lid') && p.phoneNumber) {
                    const pn = normalizeWhatsAppNumber(p.phoneNumber);
                    if (pn) {
                        lidCache.set(p.id, { pn, time: Date.now() });
                        console.log(`✅ [LID] Mapping dari group-participants.update: ${p.id} → ${pn}`);
                    }
                }
            }
        } catch (e) {
            console.log(`⚠️ [LID] group-participants.update gagal: ${e.message}`);
        }
    });
}  // ← 🔥 TUTUP else if (connection === 'open') DI SINI
});  // ← 🔥 TUTUP sock.ev.on('connection.update') DI SINI

   

    // 🔥 SIMPAN MAPPING LID → NOMOR DARI KONTAK WA
    sock.ev.on('contacts.upsert', (contacts) => {
        for (const c of contacts || []) {
            if (c?.lid && c?.id) {
                const pn = normalizeWhatsAppNumber(c.id);
                if (pn) {
                    lidCache.set(c.lid, { pn, time: Date.now() });
                    console.log(`✅ [LID] Mapping dari contacts.upsert: ${c.lid} → ${pn}`);
                }
            }
        }
    });
    sock.ev.on('contacts.update', (contacts) => {
        for (const c of contacts || []) {
            if (c?.lid && c?.id) {
                const pn = normalizeWhatsAppNumber(c.id);
                if (pn) {
                    lidCache.set(c.lid, { pn, time: Date.now() });
                    console.log(`✅ [LID] Mapping dari contacts.update: ${c.lid} → ${pn}`);
                }
            }
        }
    });

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
    if (ts < START_TIME - 300) return;
    
    const remoteJid = m.key.remoteJid;
    const isGroup = remoteJid?.endsWith('@g.us');
    const isStatus = remoteJid === 'status@broadcast';
    
    if (isGroup) return;
    if (isStatus) return;
    if (remoteJid?.endsWith('@newsletter')) return;

    // 🔥 AUTO-DETECT OTP (berlaku untuk V1 & V2)
    try {
        const otpHandled = await kpuIntegration.autoDetectOtp(sock, m);
        if (otpHandled) return;
    } catch (err) {
        console.log('❌ [KPU-OTP] Error:', err.message);
    }

    // 🔥 HANDLE FILE EXCEL DARI WA (V1)
    const msgTypeCheck = Object.keys(m.message)[0];
    const hasDocument = msgTypeCheck === 'documentMessage' || 
                        m.message?.documentMessage ||
                        m.message?.documentWithCaptionMessage;

    if (hasDocument) {
        try {
            const excelHandled = await kpuIntegration.handleExcelFile(sock, m, { settings, isOwner: false });
            if (excelHandled) return;
        } catch (err) {
            console.log('❌ [KPU-EXCEL] Error:', err.message);
        }
    }

    // 🔥 HANDLE NIK TEKS LANGSUNG (V2)
    try {
        const nikHandled = await kpuIntegrationV2.handleNikTextMessage(sock, m, { settings });
        if (nikHandled) return;
    } catch (err) {
        console.log('❌ [KPU V2-NIK] Error:', err.message);
    }

    // 🔥 KALO BUKAN OTP, EXCEL, ATAU NIK → SKIP SEMUA
    return;

    // ⬇️ KODE DI BAWAH INI DEAD CODE
    const pushName = m.pushName || 'Unknown';
    let senderNumber = null;
    let senderJid = null;

// ==========================================
// 1. AMBIL PARTICIPANT
// ==========================================

const participant =
    m.key?.participant ||
    null;

const participantAlt =
    m.key?.participantAlt ||
    null;

// ==========================================
// 2. PRIORITAS: participantAlt
// Biasanya dapat berisi JID nomor asli
// ==========================================

if (participantAlt) {
    const altJid = decodeJid(participantAlt);

    if (altJid?.includes('@s.whatsapp.net')) {
        senderNumber = extractPhoneNumber(altJid);
        senderJid = altJid;

        if (senderNumber) {
            console.log(
                `✅ [SENDER] Nomor dari participantAlt: ${senderNumber}`
            );
        }
    }
}

// ==========================================
// 3. PRIORITAS: participant
// ==========================================

if (!senderNumber && participant) {

    const participantJid = decodeJid(participant);

    senderJid = participantJid;

    if (participantJid?.includes('@s.whatsapp.net')) {

        senderNumber = extractPhoneNumber(
            participantJid
        );

        if (senderNumber) {
            console.log(
                `✅ [SENDER] Nomor dari participant: ${senderNumber}`
            );
        }
    }
}

// ==========================================
// 4. PESAN DARI BOT SENDIRI
// ==========================================

if (!senderNumber && m.key?.fromMe) {

    const myJid = decodeJid(
        sock.user?.id || ''
    );

    senderJid = myJid;

    senderNumber = extractPhoneNumber(
        myJid
    );

    if (senderNumber) {
        console.log(
            `✅ [SENDER] Nomor bot: ${senderNumber}`
        );
    }
}

// ==========================================
// 4.5 JIKA @lid DAN BELUM ADA NOMOR → RESOLVE LID
// ==========================================

if (!senderNumber) {
    const lidJid = (participantAlt || participant || '');
    if (lidJid.includes('@lid')) {
        const resolved = await resolveSenderFromLid(sock, decodeJid(lidJid), isGroup ? remoteJid : null);
        if (resolved) {
            senderNumber = resolved;
            senderJid = senderJid || decodeJid(lidJid);
            console.log(`✅ [SENDER] Nomor dari LID resolve: ${senderNumber}`);
        } else {
            console.log(`⚠️ [SENDER] LID tidak dapat di-resolve: ${lidJid}`);
        }
    }
}

// ==========================================
// 5. JIKA @lid DAN TIDAK ADA NOMOR ASLI
// JANGAN MENEBak
// ==========================================

if (!senderNumber) {

    senderNumber = 'Unknown';

    console.log(
        `⚠️ [SENDER] Nomor asli tidak tersedia`
    );

    console.log(
        `   participant     : ${participant || '-'}`
    );

    console.log(
        `   participantAlt  : ${participantAlt || '-'}`
    );

    console.log(
        `   senderJid       : ${senderJid || '-'}`
    );
}

// ==========================================
// DEBUG
// ==========================================

console.log('======================================');
console.log(`👤 Nama     : ${pushName}`);
console.log(`🆔 JID      : ${senderJid || '-'}`);
console.log(`📱 Nomor    : ${senderNumber}`);
console.log(`👥 Group    : ${isGroup ? remoteJid : 'PRIVATE'}`);
console.log('======================================');

// Simpan ke object message
m.isGroup = isGroup;
m.senderNumber = senderNumber;
m.senderJid = senderJid;
m.senderPushName = pushName;

// ==========================================
// 🔥 CEK OWNER
// ==========================================

const isOwner =
    settings.ownerNumber.includes(senderNumber) ||
    m.key?.fromMe ||
    false;

if (settings.mode === 'self' && !isOwner) {
    return;
}

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
// 🔥 DETEKSI DAERAH - FIXED (PAKAI SENDER NUMBER)
// ==========================================

if (isGroup) {
    try {
        // 🔥 CEK APAKAH SENDER NUMBER VALID
        if (senderNumber === 'Unknown' || senderNumber.length < 10) {
            console.log(`⚠️ [GROUP] Sender number tidak valid: ${senderNumber}, skip deteksi`);
            // TAPI TETAP LANJUT UNTUK DETEKSI DAERAH
        }
        
        console.log(`🔍 [GROUP] SenderNumber: ${senderNumber}`);
        console.log(`🔍 [GROUP] SenderJid: ${senderJid}`);
// 🔍 CEK MODE PENCARIAN REAL-TIME
if (body) {
    const now = Date.now();
    const bodyLower = body.toLowerCase();
    for (const [chatId, mode] of Object.entries(searchModes)) {
        if (mode.expiresAt && now > mode.expiresAt) {
            delete searchModes[chatId];
            console.log(`⏰ [SEARCH] Expired untuk ${chatId}`);
            continue;
        }
        if (bodyLower.includes(mode.keyword)) {
            try {
                // Ambil daerah dari region (jika ada)
                const region = extractRegionFromText(body);
                const kab = region.kabupaten || '-';
                const kec = region.kecamatan || '-';
                const kel = region.kelurahan || '-';
                const pengirim = pushName || senderNumber || 'Unknown';
                const nomor = senderNumber || 'Tidak diketahui';
                const groupName = remoteJid || 'Private';
                const waktu = new Date().toLocaleString('id-ID');

                const caption = 
`📍 *${kab} > ${kec} > ${kel}*

👤 Nama: ${pengirim}
📱 Nomor: ${nomor}
👥 Grup: ${groupName}
🕐 Waktu: ${waktu}

${body}`;

                await sendToTelegramUser(chatId, caption);
                console.log(`✅ [SEARCH] Dikirim ke ${chatId}: ${mode.keyword}`);
            } catch (e) {
                console.log(`❌ [SEARCH] Gagal kirim ke ${chatId}:`, e.message);
            }
        }
    }
}
        
        const region = extractRegionFromText(body);
        const hasRegion = region.kabupaten || region.kecamatan || region.kelurahan;
        
        if (hasRegion) {
            const dataHash = createDataHash(region);
            
            // 🔥 SKIP DUPLIKAT HANYA JIKA SENDER NUMBER VALID
            if (senderNumber !== 'Unknown' && isDuplicateDetect(senderNumber, dataHash)) {
                console.log(`⏭️ SKIP: ${senderNumber} | ${region.kabupaten} > ${region.kecamatan} > ${region.kelurahan}`);
                return;
            }
            
            if (senderNumber !== 'Unknown') {
                updateDetectCache(senderNumber, dataHash);
            }
            
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
            
            // 🔥🔥🔥 PAKAI SENDER NUMBER LANGSUNG
            const messageData = {
                kabupaten: region.kabupaten,
                kecamatan: region.kecamatan,
                kelurahan: region.kelurahan,
                raw: body,
                pengirim: pushName || senderNumber || 'Unknown',
                nomor: senderNumber,  // ← LANGSUNG PAKAI SENDER NUMBER
                group: groupName,
                timestamp: new Date().toISOString()
            };
            
            console.log('📤 [SEND] messageData:', JSON.stringify(messageData, null, 2));
            
            const sent = await sendDataToSubscribers(messageData);
            console.log(`📤 TERKIRIM: ${sent} user dari grup "${groupName}"`);
            
            // 🔥🔥🔥 TAMBAHAN: SIMPAN DATA UNTUK PENCARIAN (TIDAK TERGANTUNG SEWA)
            try {
                const allData = loadDetectedData();
                allData.push({
                    kabupaten: region.kabupaten,
                    kecamatan: region.kecamatan,
                    kelurahan: region.kelurahan,
                    pengirim: pushName || senderNumber || 'Unknown',
                    nomor: senderNumber,
                    group: groupName,
                    raw: body || '',
                    timestamp: Date.now()
                });
                saveDetectedData(allData);
                console.log(`💾 Data tersimpan: ${region.kabupaten} > ${region.kecamatan} > ${region.kelurahan}`);
            } catch (e) {
                console.log('❌ Gagal simpan data deteksi:', e.message);
            }
            // 🔥🔥🔥 AKHIR TAMBAHAN
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

// 🔥 Build paymentArgs SEKALI saja
const paymentArgs = [cmdName, ...args];
console.log('🔍 [DEBUG] body:', body);
console.log('🔍 [DEBUG] cmdName:', cmdName);
console.log('🔍 [DEBUG] args:', args);
console.log('🔍 [DEBUG] paymentArgs:', paymentArgs);

// ============================================================
// 🔥 KPU V2 COMMAND HANDLER - JALANKAN DULU
// ============================================================
try {
    const kpuV2Handled = await kpuIntegrationV2.handleKpuV2Command(
        sock, m, cmdName, args, 
        { settings, isOwner }
    );
    if (kpuV2Handled) return;
} catch (err) {
    console.log('❌ [KPU V2-CMD] Error:', err.message);
}

// ============================================================
// 🔥 KPU V1 COMMAND HANDLER
// ============================================================
try {
    const kpuHandled = await kpuIntegration.handleKpuCommand(
        sock, m, cmdName, args, 
        { settings, isOwner }
    );
    if (kpuHandled) return;
} catch (err) {
    console.log('❌ [KPU-CMD] Error:', err.message);
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