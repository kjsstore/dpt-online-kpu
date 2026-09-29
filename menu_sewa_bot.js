// ==========================================
// 🔥 MENU SEWA BOT (AUTOGOPAY ONLY)
// 🔥 FIX: SEMUA TOMBOL REPLY DIKASIH WARNA
// ==========================================

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const payment = require('./payment');

// ==========================================
// 🔥 FUNGSI AMBIL USERNAME DARI TELEGRAM
// ==========================================

async function getUserInfo(bot, chatId) {
    try {
        if (!bot) {
            return { username: chatId.toString(), firstName: '', lastName: '' };
        }

        const userInfo = await bot.getChat(chatId);

        let username = chatId.toString();
        let firstName = '';
        let lastName = '';

        if (userInfo?.username) {
            username = `@${userInfo.username}`;
        } else if (userInfo?.first_name) {
            firstName = userInfo.first_name;
            username = firstName;
            if (userInfo.last_name) {
                lastName = userInfo.last_name;
                username += ` ${lastName}`;
            }
        } else {
            const shortId = chatId.toString().slice(-4);
            username = `User_${shortId}`;
        }

        return { username, firstName, lastName };

    } catch (error) {
        console.log(`❌ [USER] Gagal ambil info: ${error.message}`);
        return { username: chatId.toString(), firstName: '', lastName: '' };
    }
}

// ==========================================
// 🔥 KONFIGURASI LOGO QRIS (AUTOGOPAY ONLY)
// ==========================================

const QRIS_CONFIG = {
    autogopay: {
        logoUrl: 'https://files.catbox.moe/cnveuv.png',
        logoSize: 0.25,
        useCircle: true,
    },
    default: {
        logoUrl: 'https://files.catbox.moe/cnveuv.png',
        logoSize: 0.25,
        useCircle: true,
    }
};

// ==========================================
// 🔥 FUNGSI TAMBAH LOGO KE QRIS
// ==========================================

const { createCanvas, loadImage } = require('canvas');
const logoCache = {};
const downloadingLogos = {};

async function getLogoForMethod(method = 'autogopay') {
    const cfg = QRIS_CONFIG[method.toLowerCase()] || QRIS_CONFIG.default;
    const logoUrl = cfg.logoUrl;

    if (logoCache[logoUrl]) return logoCache[logoUrl];
    if (downloadingLogos[logoUrl]) return downloadingLogos[logoUrl];

    downloadingLogos[logoUrl] = (async () => {
        try {
            console.log(`📥 [QRIS] Downloading logo...`);
            const response = await axios.get(logoUrl, {
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                }
            });

            const logoBuffer = Buffer.from(response.data, 'binary');
            const logoImg = await loadImage(logoBuffer);
            logoCache[logoUrl] = logoImg;
            console.log(`✅ [QRIS] Logo downloaded: ${logoImg.width}x${logoImg.height}`);
            return logoImg;
        } catch (err) {
            console.log(`⚠️ [QRIS] Logo download failed:`, err.message);
            return null;
        } finally {
            delete downloadingLogos[logoUrl];
        }
    })();

    return downloadingLogos[logoUrl];
}

async function addLogoToQRIS(qrImageBuffer, method = 'autogopay') {
    try {
        const cfg = QRIS_CONFIG[method.toLowerCase()] || QRIS_CONFIG.default;
        const logoImg = await getLogoForMethod(method);

        if (!logoImg) {
            console.log(`⚠️ [QRIS] No logo, using original`);
            return qrImageBuffer;
        }

        const qrImage = await loadImage(qrImageBuffer);
        const scale = 1.3;
        const canvasWidth = Math.round(qrImage.width * scale);
        const canvasHeight = Math.round(qrImage.height * scale);
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(qrImage, 0, 0, canvasWidth, canvasHeight);

        const logoSize = Math.min(canvasWidth, canvasHeight) * cfg.logoSize;
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;

        ctx.save();
        if (cfg.useCircle) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, logoSize / 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
        }
        ctx.drawImage(logoImg, centerX - logoSize / 2, centerY - logoSize / 2, logoSize, logoSize);
        ctx.restore();

        const buffer = canvas.toBuffer('image/png', { compressionLevel: 6 });
        console.log(`✅ [QRIS] Logo added! Size: ${buffer.length} bytes`);
        return buffer;

    } catch (error) {
        console.error(`❌ [QRIS] Error:`, error.message);
        return qrImageBuffer;
    }
}

// ==========================================
// 🔥 AMBIL CONFIG
// ==========================================

const TOPUP_CONFIG = config.TOPUP || { CHECK_INTERVAL: 10000, MAX_CHECKS: 60, EXPIRY_MINUTES: 10 };
const NOTIF_CONFIG = config.NOTIFICATION || {};

// ==========================================
// 🔥 KONFIGURASI BRIDGE & WA-BOT
// ==========================================

const BRIDGE_CONFIG = {
    URL: process.env.BRIDGE_URL || 'http://127.0.0.1:3004',
    ENABLED: true
};

const WA_BOT_CONFIG = {
    PATH: process.env.WA_BOT_PATH || path.join(__dirname, '../wabot'),
    DATA_FOLDER: 'data',
    SEWA_FILE: 'sewa_aktif.json',
    DAERAH_FILE: 'daerah_user.json'
};

// ==========================================
// 🔥 FUNGSI FORMAT RUPIAH
// ==========================================

const formatRupiah = (angka) => {
    if (!angka && angka !== 0) return '0';
    return new Intl.NumberFormat('id-ID').format(angka);
};

// ==========================================
// 🔥 FUNGSI SYNC KE BRIDGE
// ==========================================

async function syncToBridge(endpoint, data) {
    try {
        if (!BRIDGE_CONFIG.ENABLED) {
            console.log('⚠️ [SYNC] Bridge disabled');
            return { success: false, error: 'Bridge disabled' };
        }

        const response = await axios.post(`${BRIDGE_CONFIG.URL}${endpoint}`, data, {
            timeout: 5000
        });

        console.log(`✅ [SYNC] ${endpoint} berhasil`);
        return response.data;
    } catch (error) {
        console.log(`⚠️ [SYNC] ${endpoint} gagal:`, error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 🔥 FUNGSI SYNC SEWA KE WA-BOT
// ==========================================

async function syncSewaToWABot(chatId, sewaData) {
    try {
        const result = await syncToBridge('/add-sewa', {
            chatId: chatId.toString(),
            duration: sewaData.duration,
            expired: sewaData.expired,
            startDate: sewaData.start_date,
            expiredDate: sewaData.expired_date,
            username: sewaData.username || chatId.toString()
        });

        const waFolder = path.join(WA_BOT_CONFIG.PATH, WA_BOT_CONFIG.DATA_FOLDER);
        if (!fs.existsSync(waFolder)) {
            fs.mkdirSync(waFolder, { recursive: true });
        }

        const waSewaFile = path.join(waFolder, WA_BOT_CONFIG.SEWA_FILE);
        let waData = {};
        if (fs.existsSync(waSewaFile)) {
            try { waData = JSON.parse(fs.readFileSync(waSewaFile, 'utf8')); } catch (e) {}
        }

        waData[chatId] = {
            active: sewaData.active,
            expired: sewaData.expired,
            daerah: sewaData.daerah || [],
            duration: sewaData.duration,
            start_date: sewaData.start_date,
            expired_date: sewaData.expired_date,
            username: sewaData.username || chatId.toString()
        };

        fs.writeFileSync(waSewaFile, JSON.stringify(waData, null, 2));
        console.log(`✅ [SYNC] File WA-Bot updated: ${waSewaFile}`);

        return { success: true, result };
    } catch (error) {
        console.error('❌ [SYNC] Error:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 🔥 FUNGSI SYNC DAERAH KE WA-BOT
// ==========================================

async function syncDaerahToWABot(chatId, daerah) {
    try {
        const parsed = parseDaerahString(daerah);
        const result = await syncToBridge('/add-daerah', {
            chatId: chatId.toString(),
            kabupaten: parsed.kabupaten,
            kecamatan: parsed.kecamatan,
            kelurahan: parsed.kelurahan
        });

        const waFolder = path.join(WA_BOT_CONFIG.PATH, WA_BOT_CONFIG.DATA_FOLDER);
        if (!fs.existsSync(waFolder)) {
            fs.mkdirSync(waFolder, { recursive: true });
        }

        const waSewaFile = path.join(waFolder, WA_BOT_CONFIG.SEWA_FILE);
        let waData = {};
        if (fs.existsSync(waSewaFile)) {
            try { waData = JSON.parse(fs.readFileSync(waSewaFile, 'utf8')); } catch (e) {}
        }

        if (!waData[chatId]) {
            waData[chatId] = {
                active: true,
                expired: 'Forever',
                daerah: [],
                duration: 'Unknown',
                start_date: new Date().toISOString().split('T')[0],
                expired_date: 'Forever',
                username: chatId.toString()
            };
        }

        if (!waData[chatId].daerah) waData[chatId].daerah = [];
        if (!waData[chatId].daerah.includes(daerah)) {
            waData[chatId].daerah.push(daerah);
        }

        fs.writeFileSync(waSewaFile, JSON.stringify(waData, null, 2));
        console.log(`✅ [SYNC] Daerah ditambahkan ke WA-Bot: ${daerah}`);

        return { success: true, result };
    } catch (error) {
        console.error('❌ [SYNC] Error:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 🔥 FUNGSI PARSE DAERAH
// ==========================================

function parseDaerahString(daerahString) {
    const parts = daerahString.split(' > ');
    if (parts.length === 3) {
        return {
            kabupaten: parts[0],
            kecamatan: parts[1],
            kelurahan: parts[2]
        };
    }
    return null;
}

// ==========================================
// 🔥 HARGA SEWA - AMBIL DARI CONFIG.JS
// ==========================================

const HARGA_SEWA = config.SEWA || {
    '2minggu': { price: 50000, days: 14, label: '2 Minggu' },
    '1bulan': { price: 100000, days: 30, label: '1 Bulan' },
    '1tahun': { price: 500000, days: 365, label: '1 Tahun' }
};

// ==========================================
// 🔥 GLOBAL UNTUK SIMPAN MESSAGE ID QRIS
// ==========================================

global.lastQRMessage = global.lastQRMessage || {};
const autoCheckIntervals = {};
const processingFlags = {};
const pendingSewa = {};

// ==========================================
// 🔥 FUNGSI HAPUS QRIS
// ==========================================

const deleteQRMessage = async (bot, chatId) => {
    try {
        const lastMsg = global.lastQRMessage?.[chatId];
        if (lastMsg) {
            await bot.deleteMessage(chatId, lastMsg);
            console.log(`🗑️ QRIS deleted for ${chatId}`);
            delete global.lastQRMessage[chatId];
        }
    } catch (error) {
        console.log(`❌ Gagal hapus QRIS: ${error.message}`);
    }
};

// ==========================================
// 🔥 FUNGSI HAPUS REPLY KEYBOARD
// ==========================================

const removeReplyKeyboard = async (bot, chatId) => {
    try {
        const sent = await bot.sendMessage(chatId, '\u200B', {
            reply_markup: { remove_keyboard: true },
            disable_notification: true,
            disable_web_page_preview: true
        });
        console.log(`✅ [KEYBOARD] Removed for ${chatId}`);

        setTimeout(async () => {
            try {
                await bot.deleteMessage(chatId, sent.message_id);
            } catch (e) {}
        }, 500);

        return true;
    } catch (error) {
        console.log(`❌ [KEYBOARD] Failed to remove: ${error.message}`);
        return false;
    }
};

// ==========================================
// 🔥 FUNGSI STOP AUTO CHECK
// ==========================================

function stopAutoCheck(chatId) {
    if (autoCheckIntervals[chatId]) {
        clearInterval(autoCheckIntervals[chatId]);
        delete autoCheckIntervals[chatId];
        console.log(`🛑 [AUTOCHECK] Stopped for ${chatId}`);
        return true;
    }
    return false;
}

// ==========================================
// 🔥 FUNGSI NOTIFIKASI KE CHANNEL
// ==========================================

const sendNotifToChannel = async (bot, message) => {
    try {
        if (!NOTIF_CONFIG.ENABLED) return;

        const channelId = NOTIF_CONFIG.CHAT_ID;
        if (!channelId || channelId === '-100XXXXXXXXX') {
            console.log('⚠️ [NOTIF] CHAT_ID tidak valid!');
            return;
        }

        let cleanMessage = message || '';
        cleanMessage = cleanMessage
            .replace(/[*_`\[\]()|]/g, '')
            .trim();

        const result = await bot.sendMessage(channelId, cleanMessage, {
            disable_notification: false
        });

        console.log('✅ [NOTIF] NOTIFIKASI CHANNEL BERHASIL!');

    } catch (error) {
        console.log('❌ [NOTIF] GAGAL KIRIM KE CHANNEL:', error.message);

        try {
            const ownerId = config.BOT.OWNER_ID;
            if (ownerId) {
                const cleanMsg = (message || '').replace(/[*_`]/g, '').trim();
                await bot.sendMessage(ownerId,
                    `⚠️ GAGAL KIRIM KE CHANNEL\n\nError: ${error.message}\n\nPesan:\n${cleanMsg.substring(0, 200)}`,
                    { disable_notification: false }
                );
            }
        } catch (e) {
            console.log(`❌ [NOTIF] Gagal kirim ke owner:`, e.message);
        }
    }
};

// ==========================================
// 🔥 QRIS GENERATOR - AUTOGOPAY ONLY
// ==========================================

async function generateQRIS(amount) {
    try {
        console.log(`💰 [PAYMENT] Generating QRIS for Rp${amount} via AUTOGOPAY...`);

        const cleanAmount = parseInt(amount) || 0;
        if (cleanAmount <= 0) {
            throw new Error(`Invalid amount: ${amount}`);
        }

        const result = await payment.generateQRIS(cleanAmount, 'Sewa Bot KJS');

        if (result.success) {
            console.log(`✅ [PAYMENT] QRIS Generated: ID=${result.transaction_id}, Amount=${result.amount}`);
            return result;
        }

        throw new Error(result.error || 'Gagal generate QRIS');

    } catch (error) {
        console.error('❌ [PAYMENT] Error:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 🔥 FUNGSI SEWA
// ==========================================

const getSewa = (chatId) => {
    const sewaFile = '/root/BotKJS/wa-bot/sewa_aktif.json';
    let sewa = {};
    let result = null;

    if (fs.existsSync(sewaFile)) {
        try {
            sewa = JSON.parse(fs.readFileSync(sewaFile, 'utf8'));
            result = sewa[chatId] || null;
            console.log(`[GETSEWA] ✅ Dari WA-BOT: ${chatId} -> ${result ? 'ADA' : 'TIDAK'}`);
        } catch (e) {
            console.log(`[GETSEWA] ❌ Error:`, e.message);
        }
    } else {
        console.log(`[GETSEWA] ❌ File tidak ditemukan: ${sewaFile}`);
    }

    return result || null;
};

// ==========================================
// 🔥 FUNGSI FORMAT DURASI
// ==========================================

function formatDurationLabel(totalDays) {
    const days = Math.round(totalDays);
    if (days === 14) return '2 Minggu';
    if (days === 30) return '1 Bulan';
    if (days === 365) return '1 Tahun';
    if (days % 7 === 0) return `${days / 14} Minggu`;
    if (days % 30 === 0) return `${days / 30} Bulan`;
    if (days % 365 === 0) return `${days / 365} Tahun`;
    return `${days} Hari`;
}

// ==========================================
// 🔥 AKTIFKAN SEWA
// ==========================================

const aktifkanSewa = async (chatId, duration, days, username = null, bot = null) => {
    const sewaFile = '/root/BotKJS/wa-bot/sewa_aktif.json';
    let sewa = {};
    if (fs.existsSync(sewaFile)) {
        try { sewa = JSON.parse(fs.readFileSync(sewaFile, 'utf8')); } catch (e) {
            console.log(`[AKTIFKAN] ❌ Error baca:`, e.message);
        }
    }

    const now = Date.now();
    const userSewa = sewa[chatId];
    const daerahLama = userSewa?.daerah || [];

    let userInfo = { username: chatId.toString(), firstName: '', lastName: '' };
    if (bot) {
        userInfo = await getUserInfo(bot, chatId);
    } else if (username && username !== chatId.toString()) {
        userInfo.username = username.startsWith('@') ? username : `@${username}`;
    } else {
        const shortId = chatId.toString().slice(-4);
        userInfo.username = `User_${shortId}`;
    }

    const baseStart = (userSewa && typeof userSewa.start === 'number') ? userSewa.start : now;
    let baseExpired;

    if (userSewa && typeof userSewa.expired === 'number') {
        baseExpired = userSewa.expired;
    } else if (userSewa && userSewa.expired === 'Forever') {
        baseExpired = 'Forever';
    } else {
        baseExpired = now;
    }

    let newExpired;
    if (baseExpired === 'Forever') {
        newExpired = 'Forever';
    } else {
        newExpired = baseExpired + (days * 24 * 60 * 60 * 1000);
    }

    let totalDays = 0;
    if (newExpired !== 'Forever' && typeof baseStart === 'number') {
        totalDays = Math.round((newExpired - baseStart) / (1000 * 60 * 60 * 24));
    } else if (newExpired === 'Forever') {
        totalDays = Infinity;
    }

    const newDurationLabel = newExpired === 'Forever' ? 'Forever' : formatDurationLabel(totalDays);
    const startDate = userSewa?.start_date || new Date(baseStart).toISOString().split('T')[0];

    const sewaData = {
        duration: newDurationLabel,
        start: baseStart,
        expired: newExpired,
        active: true,
        start_date: startDate,
        expired_date: newExpired === 'Forever' ? 'Forever' : new Date(newExpired).toISOString().split('T')[0],
        daerah: daerahLama,
        username: userInfo.username,
        firstName: userInfo.firstName,
        lastName: userInfo.lastName,
        last_active: new Date().toISOString()
    };

    sewa[chatId] = sewaData;
    fs.writeFileSync(sewaFile, JSON.stringify(sewa, null, 2));
    console.log(`✅ [SEWA] Data tersimpan untuk ${chatId}, durasi baru: ${newDurationLabel}`);

    await syncSewaToWABot(chatId, sewaData);
    return sewa[chatId];
};

// ==========================================
// 🔥 START AUTO CHECK - AUTOGOPAY ONLY
// ==========================================

const startAutoCheck = async (chatId, bot, sendMessage, trx) => {
    stopAutoCheck(chatId);

    console.log(`🚀 [AUTOCHECK] Starting for ${chatId}, ID: ${trx.transaction_id}`);

    const CHECK_INTERVAL = TOPUP_CONFIG.CHECK_INTERVAL || 10000;
    const MAX_CHECKS = TOPUP_CONFIG.MAX_CHECKS || 40;
    let checkCount = 0;
    let isCompleted = false;

    const intervalId = setInterval(async () => {
        if (isCompleted) {
            stopAutoCheck(chatId);
            return;
        }

        checkCount++;

        if (!pendingSewa[chatId]) {
            stopAutoCheck(chatId);
            return;
        }

        const currentTrx = pendingSewa[chatId];
        if (currentTrx.transaction_id !== trx.transaction_id) {
            stopAutoCheck(chatId);
            return;
        }

        if (Date.now() > trx.expiry) {
            isCompleted = true;
            stopAutoCheck(chatId);
            await deleteQRMessage(bot, chatId);
            delete pendingSewa[chatId];
            sendMessage(chatId, '⏰ QRIS Expired! Silahkan sewa ulang.');
            return;
        }

        if (checkCount >= MAX_CHECKS) {
            stopAutoCheck(chatId);
            sendMessage(chatId, '⏰ Waktu cek habis. Cek manual dengan /ceksewa');
            return;
        }

        try {
            console.log(`🔄 [AUTOCHECK] #${checkCount} - Checking payment for ${chatId}...`);

            const result = await payment.cekStatusDual(
                trx.transaction_id,
                trx.originalAmount
            );

            console.log(`📊 [AUTOCHECK] Status: ${result.status}, matched: ${result.matched}`);

            if (result.matched || ['settlement', 'success', 'paid'].includes(result.status)) {
                console.log(`✅ [AUTOCHECK] PAYMENT FOUND for ${chatId}!`);
                isCompleted = true;
                stopAutoCheck(chatId);
                await prosesAktivasiSewa(chatId, bot, sendMessage, trx);
                return;
            }

        } catch (error) {
            console.error('❌ [AUTOCHECK] Error:', error.message);
        }

    }, CHECK_INTERVAL);

    autoCheckIntervals[chatId] = intervalId;
};

// ==========================================
// 🔥 SHOW SEWA BOT MENU
// ==========================================

const showSewaBotMenu = async (chatId, sendNewMessage, bot = null) => {
    const currentSewa = getSewa(chatId);
    let statusText = '';

    if (currentSewa && currentSewa.active) {
        const now = Date.now();
        const expired = currentSewa.expired === 'Forever' ? Infinity : currentSewa.expired;
        if (expired === Infinity || expired > now) {
            const sisaHari = expired === Infinity ? '∞' : Math.ceil((expired - now) / (1000 * 60 * 60 * 24));
            statusText = `
📊 *Status Sewa:* ✅ ACTIVE
📦 Paket: ${currentSewa.duration}
📅 Mulai: ${currentSewa.start_date}
📅 Berakhir: ${currentSewa.expired_date}
⏳ Sisa: ${sisaHari} ${sisaHari === '∞' ? '' : 'hari lagi'}
📍 Daerah: ${currentSewa.daerah?.length || 0} terdaftar
`;
        } else {
            statusText = `
📊 *Status Sewa:* ⏰ EXPIRED
📦 Paket: ${currentSewa.duration}
📅 Berakhir: ${currentSewa.expired_date}
`;
        }
    } else {
        statusText = `
📊 *Status Sewa:* ❌ BELUM SEWA
`;
    }

    // 🔥 FIX: TOMBOL PAKET DIKASIH WARNA (primary = biru)
    const keyboardRows = [];
    const packageKeys = Object.keys(HARGA_SEWA);
    let row = [];

    for (let i = 0; i < packageKeys.length; i++) {
        const key = packageKeys[i];
        const val = HARGA_SEWA[key];
        row.push({
            text: `${val.label} - Rp${formatRupiah(val.price)}`,
            style: "primary"  // 🔥 BIRU
        });

        if (row.length === 2 || i === packageKeys.length - 1) {
            keyboardRows.push(row);
            row = [];
        }
    }

    // 🔥 FIX: TOMBOL CEK & DAERAH (success = hijau), BACK (danger = merah)
    keyboardRows.push([
        { text: "📊 CEK SEWA", style: "success" },
        { text: "📍 DAERAH SAYA", style: "success" }
    ]);
    keyboardRows.push([
        { text: "🔙 BACK MENU", style: "danger" }
    ]);

    const replyButtons = {
        keyboard: keyboardRows,              // ← REPLY keyboard
        resize_keyboard: true,
        one_time_keyboard: false,
        selective: true
    };

    const sewaPackages = Object.entries(HARGA_SEWA).map(([key, val]) => {
        return `${val.label}\n└─ Rp${formatRupiah(val.price)}`;
    }).join('\n\n');

    const content = `
💰 PAKET SEWA BOT

🔥 PROMO SPESIAL!
${sewaPackages}

${statusText}

💳 Pembayaran : QRIS (AutoGoPay)
⚡ Aktivasi : Otomatis

📌 Pilih paket sewa di bawah untuk melanjutkan.
`;

    // 🔥 GAMBAR UNTUK MENU SEWA (sama seperti menu utama)
    const SEWA_IMAGE_URL = "https://files.catbox.moe/0edb7q.jpg"; // ← GANTI dengan URL gambar kamu

    if (bot) {
        try {
            if (global.lastQRMessage?.[chatId]) {
                await bot.deleteMessage(chatId, global.lastQRMessage[chatId]);
                console.log(`🗑️ [SEWA] Hapus pesan lama: ${global.lastQRMessage[chatId]}`);
                delete global.lastQRMessage[chatId];
            }
        } catch (e) {
            console.log(`⚠️ [SEWA] Gagal hapus pesan lama: ${e.message}`);
        }

        try {
            // 🔥 PAKAI sendPhoto → tombol nempel ke caption + gambar
            const sent = await bot.sendPhoto(chatId, SEWA_IMAGE_URL, {
                caption: content,
                parse_mode: "Markdown",
                reply_markup: replyButtons
            });

            if (sent?.message_id) {
                if (!global.lastQRMessage) global.lastQRMessage = {};
                global.lastQRMessage[chatId] = sent.message_id;
            }
        } catch (err) {
            // 🔥 FALLBACK: kalau gambar gagal, kirim teks biasa
            console.log(`⚠️ [SEWA] Gagal kirim gambar, fallback ke text: ${err.message}`);
            const sent = await bot.sendMessage(chatId, content, {
                parse_mode: "Markdown",
                reply_markup: replyButtons
            });

            if (sent?.message_id) {
                if (!global.lastQRMessage) global.lastQRMessage = {};
                global.lastQRMessage[chatId] = sent.message_id;
            }
        }
    } else {
        await sendNewMessage(chatId, content, {
            parse_mode: "Markdown",
            reply_markup: replyButtons
        });
    }
};

// ==========================================
// 🔥 PROSES SEWA - AUTOGOPAY ONLY
// ==========================================

const processSewa = async (chatId, duration, price, days, bot, sendMessage, sendNewMessage) => {
    if (processingFlags[chatId]) {
        console.log(`⚠️ [SEWA] Already processing for ${chatId}, skipping duplicate...`);
        await sendMessage(chatId,
            `⏳ *Proses sedang berjalan...*\n\n` +
            `Mohon tunggu sebentar, jangan klik tombol berulang kali.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    processingFlags[chatId] = true;
    console.log(`🔒 [SEWA] Processing lock acquired for ${chatId}`);

    try {
        const cleanPrice = parseInt(price) || 0;
        if (cleanPrice <= 0) {
            console.error(`❌ [SEWA] Invalid price: ${price}`);
            await sendMessage(chatId,
                `❌ *Harga tidak valid!*\n\n` +
                `📦 Paket: ${duration}\n` +
                `💰 Harga: ${price}\n\n` +
                `Silahkan coba lagi.`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        console.log(`💰 [SEWA] Processing: ${duration}, Price: ${cleanPrice}, Days: ${days}`);

        if (pendingSewa[chatId]) {
            const trx = pendingSewa[chatId];
            if (Date.now() < trx.expiry) {
                const sisa = Math.ceil((trx.expiry - Date.now()) / 1000 / 60);
                await sendMessage(chatId,
                    `⚠️ *Ada transaksi pending!*\n` +
                    `📦 ${trx.duration}\n` +
                    `💰 Rp${formatRupiah(trx.amount)}\n` +
                    `⏳ Sisa ${sisa} menit\n\n` +
                    `Tunggu selesai atau /batalkan`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            delete pendingSewa[chatId];
        }

        const prosesMsg = await sendMessage(chatId,
            `⏳ *Memproses pembayaran...*\n\n` +
            `📦 Paket: ${duration}\n` +
            `💰 Harga: Rp${formatRupiah(cleanPrice)}\n\n` +
            `⏱️ Mohon tunggu sebentar...`,
            { parse_mode: 'Markdown' }
        );

        const qris = await generateQRIS(cleanPrice);

        try {
            if (prosesMsg?.message_id) {
                await bot.deleteMessage(chatId, prosesMsg.message_id);
            }
        } catch (e) {}

        if (!qris.success) {
            await sendMessage(chatId,
                `❌ Gagal generate QRIS: ${qris.error || 'Coba lagi'}`,
                { parse_mode: 'Markdown' }
            );
            return;
        }

        const expiryTime = qris.expiry_time || Date.now() + (TOPUP_CONFIG.EXPIRY_MINUTES * 60 * 1000);

        pendingSewa[chatId] = {
            duration: duration,
            days: days,
            price: cleanPrice,
            amount: qris.amount,
            originalAmount: qris.amount_original || cleanPrice,
            transaction_id: qris.transaction_id,
            expiry: expiryTime,
            created_at: qris.created_at || Date.now(),
            username: chatId.toString(),
            method: 'AUTOGOPAY'
        };

        const caption = `
⟣⚋⚋⚋⚋⚋⚋⚋⚋⚋⚋𝐒𝐄𝐖𝐀 𝐁𝐎𝐓⚋⚋⚋⚋⚋⚋⚋⚋⚋⚋⟢

📦 𝙋𝙖𝙠𝙚𝙩: ${duration}
💰 𝘿𝙚𝙩𝙖𝙞𝙡:
├ 𝙏𝙤𝙩𝙖𝙡: 𝙍𝙥${formatRupiah(qris.amount)}
├ 𝙆𝙤𝙙𝙚 𝙐𝙣𝙞𝙠: ${qris.random_add || 0}
└ 𝙄𝘿: ${qris.transaction_id}

💳 𝙈𝙚𝙩𝙤𝙙𝙚: AUTOGOPAY
⏳ 𝙀𝙭𝙥𝙞𝙧𝙚𝙙: ${Math.ceil((expiryTime - Date.now()) / 60000)} 𝙢𝙚𝙣𝙞𝙩
`;

        try {
            const paymentButtons = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🔄 𝗖𝗵𝗲𝗰𝗸", callback_data: "ceksewa" },
                            { text: "❌ 𝗕𝗮𝘁𝗮𝗹", callback_data: "batalkan_sewa" }
                        ]
                    ]
                }
            };

            let sentMsg;

            if (qris.image_data) {
                const base64Data = qris.image_data.replace(/^data:image\/\w+;base64,/, '');
                let photoBuffer = Buffer.from(base64Data, 'base64');

                try {
                    photoBuffer = await addLogoToQRIS(photoBuffer, 'autogopay');
                    console.log(`✅ [LOGO] Logo berhasil ditambahkan ke QRIS!`);
                } catch (logoError) {
                    console.log('⚠️ [LOGO] Gagal tambah logo, pakai QRIS asli:', logoError.message);
                }

                sentMsg = await bot.sendPhoto(chatId, photoBuffer, {
                    caption: caption,
                    parse_mode: "HTML",
                    ...paymentButtons
                });

                console.log('✅ [processSewa] QRIS PHOTO TERKIRIM!');

            } else {
                sentMsg = await sendNewMessage(chatId, caption, {
                    parse_mode: "HTML",
                    ...paymentButtons
                });
            }

            if (sentMsg?.message_id) {
                global.lastQRMessage[chatId] = sentMsg.message_id;
            }

        } catch (error) {
            console.log('❌ [processSewa] Gagal kirim QRIS:', error.message);

            await sendNewMessage(chatId, caption, {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "🔄 𝗖𝗵𝗲𝗰𝗸", callback_data: "ceksewa" },
                            { text: "❌ 𝗕𝗮𝘁𝗮𝗹", callback_data: "batalkan_sewa" }
                        ]
                    ]
                }
            });
        }

        await startAutoCheck(chatId, bot, sendMessage, pendingSewa[chatId]);

    } catch (error) {
        console.error('❌ Sewa error:', error);
        await sendMessage(chatId, '❌ Gagal memproses sewa.');
    } finally {
        delete processingFlags[chatId];
        console.log(`🔓 [SEWA] Processing lock released for ${chatId}`);
    }
};

// ==========================================
// 🔥 CEK SEWA
// ==========================================

const cekSewa = async (chatId, sendMessage) => {
    const sewa = getSewa(chatId);

    if (!sewa || !sewa.active) {
        return sendMessage(chatId,
            `❌ *Belum ada sewa aktif*\n\nGunakan /sewa untuk mulai.`,
            { parse_mode: 'Markdown' }
        );
    }

    const now = Date.now();
    const expired = sewa.expired === 'Forever' ? Infinity : sewa.expired;

    if (expired !== Infinity && now >= expired) {
        return sendMessage(chatId,
            `⏰ *Sewa sudah EXPIRED*\n\n` +
            `📦 ${sewa.duration}\n` +
            `📅 Berakhir: ${sewa.expired_date}\n\n` +
            `Gunakan /sewa untuk perpanjang.`,
            { parse_mode: 'Markdown' }
        );
    }

    const sisaMs = expired === Infinity ? Infinity : expired - now;
    const sisaHari = sisaMs === Infinity ? '∞' : Math.ceil(sisaMs / (1000 * 60 * 60 * 24));
    const sisaJam = sisaMs === Infinity ? '-' : Math.floor((sisaMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    let daerahList = '';
    if (sewa.daerah && sewa.daerah.length > 0) {
        sewa.daerah.forEach((d, i) => {
            daerahList += `${i + 1}. ${d}\n`;
        });
    } else {
        daerahList = 'Belum ada daerah terdaftar';
    }

    const username = sewa.username || chatId;

    return sendMessage(chatId,
        `✅ *Status Sewa Aktif*\n\n` +
        `👤 *User:* ${username}\n` +
        `📦 *Paket:* ${sewa.duration}\n` +
        `📅 *Mulai:* ${sewa.start_date}\n` +
        `📅 *Berakhir:* ${sewa.expired_date}\n` +
        `⏳ *Sisa:* ${sisaHari} ${sisaHari === '∞' ? '' : `hari ${sisaJam} jam`}\n\n` +
        `📍 *Daerah Terdaftar:*\n${daerahList}\n\n` +
        `💡 Sewa baru: /sewa\n` +
        `📍 Tambah daerah: /tambah`,
        { parse_mode: 'Markdown' }
    );
};

// ==========================================
// 🔥 FUNGSI TAMBAH DAERAH
// ==========================================

const tambahDaerah = async (chatId, text, sendMessage) => {
    try {
        const match = text.match(/^\/tambah\s+(.+?)\s*>\s*(.+?)\s*>\s*(.+)$/i);
        if (!match) {
            return sendMessage(chatId,
                `❌ *Format salah!*\n\n` +
                `Gunakan format:\n` +
                `/tambah KABUPATEN  KECAMATAN  KELURAHAN\n\n` +
                `📌 *Contoh:*\n` +
                `/tambah AMPAR  AMPARID  PISANG`,
                { parse_mode: 'Markdown' }
            );
        }

        const kabupaten = match[1].trim().toUpperCase();
        const kecamatan = match[2].trim().toUpperCase();
        const kelurahan = match[3].trim().toUpperCase();
        const daerahFormatted = `${kabupaten} > ${kecamatan} > ${kelurahan}`;

        const sewaFile = path.join(__dirname, 'wa-bot', 'sewa_aktif.json');
        let sewaData = {};
        if (fs.existsSync(sewaFile)) {
            try { sewaData = JSON.parse(fs.readFileSync(sewaFile, 'utf8')); } catch (e) {}
        }

        const sewa = sewaData[chatId];

        if (!sewa || !sewa.active) {
            return sendMessage(chatId,
                `❌ *Sewa tidak aktif!*\n\n` +
                `Silahkan sewa dulu dengan /sewa\n` +
                `Baru bisa tambah daerah.`,
                { parse_mode: 'Markdown' }
            );
        }

        const now = Date.now();
        const expired = sewa.expired === 'Forever' ? Infinity : sewa.expired;
        if (expired !== Infinity && now >= expired) {
            return sendMessage(chatId,
                `❌ *Sewa sudah EXPIRED!*\n\n` +
                `Silahkan perpanjang dengan /sewa`,
                { parse_mode: 'Markdown' }
            );
        }

        if (!sewaData[chatId].daerah) sewaData[chatId].daerah = [];

        if (sewaData[chatId].daerah.includes(daerahFormatted)) {
            return sendMessage(chatId,
                `⚠️ *Daerah sudah terdaftar!*\n\n` +
                `📍 ${daerahFormatted}\n\n` +
                `Gunakan /daerahsaya untuk lihat semua daerah.`,
                { parse_mode: 'Markdown' }
            );
        }

        sewaData[chatId].daerah.push(daerahFormatted);
        fs.writeFileSync(sewaFile, JSON.stringify(sewaData, null, 2));
        console.log(`✅ [TAMBAH DAERAH] ${daerahFormatted} untuk ${chatId}`);

        await syncDaerahToWABot(chatId, daerahFormatted);

        const msg = `✅ *DAERAH BERHASIL DITAMBAHKAN!*\n\n` +
            `📍 ${daerahFormatted}\n\n` +
            `📊 *Total daerah terdaftar:* ${sewaData[chatId].daerah.length}\n\n` +
            `📌 WA-Bot akan mulai mendeteksi data dari grup\n` +
            `untuk daerah ini.\n\n` +
            `💡 *Untuk menambah lagi:*\n` +
            `/tambah KABUPATEN  KECAMATAN  KELURAHAN`;

        await sendMessage(chatId, msg, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('❌ Tambah daerah error:', error);
        sendMessage(chatId, '❌ Gagal menambah daerah.');
    }
};

// ==========================================
// 🔥 FUNGSI LIHAT DAERAH SAYA
// ==========================================

const daerahSaya = async (chatId, sendMessage) => {
    const sewa = getSewa(chatId);

    if (!sewa || !sewa.daerah || sewa.daerah.length === 0) {
        return sendMessage(chatId,
            `📍 *Belum ada daerah terdaftar*\n\n` +
            `Tambahkan dengan:\n` +
            `/tambah KABUPATEN  KECAMATAN  KELURAHAN`,
            { parse_mode: 'Markdown' }
        );
    }

    let daftar = '';
    sewa.daerah.forEach((d, i) => {
        daftar += `${i + 1}. ${d}\n`;
    });

    const username = sewa.username || chatId;

    return sendMessage(chatId,
        `📍 *DAFTAR DAERAH TERDAFTAR*\n\n` +
        `👤 *User:* ${username}\n` +
        `📦 Paket: ${sewa.duration}\n` +
        `📅 Aktif sampai: ${sewa.expired_date}\n` +
        `📊 Total: ${sewa.daerah.length} daerah\n\n` +
        `📋 *Daftar:*\n${daftar}\n\n` +
        `💡 *Tambah lagi:* /tambah`,
        { parse_mode: 'Markdown' }
    );
};

// ==========================================
// 🔥 HANDLE SEWA COMMAND
// ==========================================

const handleSewaCommand = async (msg, bot, sendMessage, sendNewMessage) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    if (text === '/sewa') {
        return showSewaBotMenu(chatId, sendNewMessage, bot);
    }

    if (text.match(/^\/tambah\s+/i)) {
        return await tambahDaerah(chatId, text, sendMessage);
    }

    if (text === '/daerahsaya' || text === '/daerah_saya') {
        return await daerahSaya(chatId, sendMessage);
    }

    if (processingFlags[chatId]) {
        console.log(`⚠️ [HANDLE] Duplicate command from ${chatId}, ignoring...`);
        await sendMessage(chatId,
            `⏳ *Proses sedang berjalan...*\n\n` +
            `Mohon tunggu sebentar, jangan klik tombol berulang kali.`,
            { parse_mode: 'Markdown' }
        );
        return;
    }

    const lowerText = text.toLowerCase();

    for (const [key, val] of Object.entries(HARGA_SEWA)) {
        const label = `${val.label} - Rp${formatRupiah(val.price)}`;
        if (lowerText === label.toLowerCase()) {
            await processSewa(chatId, val.label, val.price, val.days, bot, sendMessage, sendNewMessage);
            return;
        }
    }

    if (text === '📊 CEK SEWA') {
        await cekSewa(chatId, sendMessage);
        return;
    }

    if (text === '📍 DAERAH SAYA') {
        await daerahSaya(chatId, sendMessage);
        return;
    }

    const match = text.match(/^\/sewa\s+(2minggu|1bulan|1tahun)$/i);
    if (match) {
        const duration = match[1].toLowerCase();
        const info = HARGA_SEWA[duration];
        if (!info) {
            return sendMessage(chatId, '❌ Paket tidak valid');
        }

        const cleanPrice = parseInt(info.price) || 0;
        if (cleanPrice <= 0) {
            return sendMessage(chatId, '❌ Harga paket tidak valid!', { parse_mode: 'Markdown' });
        }

        await processSewa(chatId, info.label, cleanPrice, info.days, bot, sendMessage, sendNewMessage);
        return;
    }

    if (text === '/ceksewa') {
        await cekSewa(chatId, sendMessage);
        return;
    }

    if (text === '/batalkan') {
        if (pendingSewa[chatId]) {
            stopAutoCheck(chatId);
            delete pendingSewa[chatId];
            sendMessage(chatId, '🥲');
        } else {
            sendMessage(chatId, '❌ Tidak ada transaksi pending');
        }
        return;
    }
};

// ==========================================
// 🔥 HANDLE SEWA CALLBACK
// ==========================================

const handleSewaCallback = async (q, bot, sendMessage, sendNewMessage) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    // 🔥 CEK DULU: apakah ini callback milik sewa?
    const isSewaCallback = 
        data.startsWith('sewa_') ||
        data === 'cek_sewa' ||
        data === 'ceksewa' ||
        data === 'batalkan_sewa';

    // 🔥 KALAU BUKAN milik sewa → LANGSUNG return false
    if (!isSewaCallback) {
        return false;
    }

    // 🔥 BARU cek processingFlags (khusus callback sewa)
    if (processingFlags[chatId]) {
        console.log(`⚠️ [CALLBACK] Duplicate callback from ${chatId}, ignoring...`);
        await sendMessage(chatId,
            `⏳ *Proses sedang berjalan...*\n\n` +
            `Mohon tunggu sebentar, jangan klik tombol berulang kali.`,
            { parse_mode: 'Markdown' }
        );
        return true;
    }

    if (data.startsWith('sewa_')) {
        const duration = data.replace('sewa_', '');
        const info = HARGA_SEWA[duration];
        if (!info) {
            sendMessage(chatId, '❌ Paket tidak valid');
            return true;
        }

        await processSewa(chatId, info.label, info.price, info.days, bot, sendMessage, sendNewMessage);
        return true;
    }

    if (data === 'cek_sewa') {
        await cekSewa(chatId, sendMessage);
        return true;
    }

    if (data === 'ceksewa') {
        const trx = pendingSewa[chatId];
        if (!trx) {
            await sendMessage(chatId, '❌ Tidak ada transaksi pending');
            return true;
        }

        const statusMsg = await sendMessage(chatId,
            `🔄 *Mengecek pembayaran...*\n\n` +
            `📦 Paket: ${trx.duration}\n` +
            `💰 Target: Rp${formatRupiah(trx.originalAmount)}\n` +
            `💳 Metode: AUTOGOPAY\n` +
            `⏳ Mohon tunggu sebentar...`,
            { parse_mode: 'Markdown' }
        );

        const result = await payment.cekStatusDual(
            trx.transaction_id,
            trx.originalAmount
        );

        try {
            await bot.deleteMessage(chatId, statusMsg.message_id);
        } catch (e) {}

        if (result.matched || ['settlement', 'success', 'paid'].includes(result.status)) {
            console.log(`✅ [CALLBACK] PEMBAYARAN DITEMUKAN!`);
            await prosesAktivasiSewa(chatId, bot, sendMessage, trx);
        } else {
            let msg = '⏳ *Masih pending pembayaran.*\n\n';
            msg += `💰 Target: Rp${formatRupiah(trx.originalAmount)}\n`;
            msg += `💳 Metode: AUTOGOPAY\n`;
            msg += `🆔 ID: ${trx.transaction_id}\n\n`;
            msg += `💡 *Tips:*\n`;
            msg += `1. Pastikan sudah bayar sesuai total (Rp${formatRupiah(trx.amount)})\n`;
            msg += `2. Tunggu 1-2 menit setelah bayar\n`;
            msg += `3. Klik tombol Cek Pembayaran lagi`;

            await sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        }
        return true;
    }

    if (data === 'batalkan_sewa') {
        stopAutoCheck(chatId);
        await deleteQRMessage(bot, chatId);
        delete pendingSewa[chatId];
        sendMessage(chatId, '🥲');
        return true;
    }

    return false;
};

// ==========================================
// 🔥 FUNGSI PROSES AKTIVASI SEWA (REUSABLE)
// ==========================================

async function prosesAktivasiSewa(chatId, bot, sendMessage, trx) {
    try {
        console.log(`🚀 [AKTIVASI] Memulai aktivasi untuk ${chatId}`);

        await deleteQRMessage(bot, chatId);

        const username = trx.username || chatId.toString();

        const oldSewa = getSewa(chatId);
        const now = Date.now();
        const isExtend = oldSewa && oldSewa.active &&
                        oldSewa.expired !== 'Forever' &&
                        oldSewa.expired > now;

        const sewa = await aktifkanSewa(chatId, trx.duration, trx.days, username, bot);

        delete pendingSewa[chatId];
        stopAutoCheck(chatId);

        const expired = sewa.expired === 'Forever' ? Infinity : sewa.expired;
        let sisaHari = 0;
        let sisaJam = 0;
        if (expired === Infinity) {
            sisaHari = '∞';
        } else {
            const sisaMs = expired - now;
            sisaHari = Math.ceil(sisaMs / (1000 * 60 * 60 * 24));
            sisaJam = Math.floor((sisaMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        }

        let usernameTele = username || chatId.toString();
        try {
            const userInfo = await bot.getChat(chatId);
            if (userInfo?.username) {
                usernameTele = `@${userInfo.username}`;
            } else if (userInfo?.first_name) {
                usernameTele = userInfo.first_name;
            }
        } catch (e) {}

        const notifMessage =
            `${isExtend ? '🔄 SEWA DIPERPANJANG!' : '🎉 SEWA BARU BERHASIL!'}\n\n` +
            `👤 User: ${usernameTele}\n` +
            `🆔 ID: ${chatId}\n` +
            `📦 Paket: ${trx.duration}\n` +
            `💰 Harga: Rp${formatRupiah(trx.price)}\n` +
            `📅 Mulai: ${sewa.start_date}\n` +
            `📅 Berakhir: ${sewa.expired_date}\n` +
            `⏳ Sisa: ${sisaHari} hari ${sisaJam} jam\n\n` +
            `✅ Status: AKTIF`;

        await sendNotifToChannel(bot, notifMessage);

        const msg =
            `${isExtend ? '✅ Perpanjangan Berhasil' : '✅ Sewa Berhasil Diaktifkan'}\n\n` +
            `📦 Paket: ${trx.duration}\n` +
            `💰 Harga: Rp${formatRupiah(trx.price)}\n` +
            `📅 Mulai: ${sewa.start_date}\n` +
            `📅 Berakhir: ${sewa.expired_date}\n` +
            `⏳ Sisa: ${sisaHari} hari ${sisaJam} jam\n` +
            `👤 User: ${username}\n\n` +
            `📍 Tambahkan daerah sekarang!\n\n` +
            `📌 Data sudah sync ke WA-Bot!`;

        await sendMessage(chatId, msg, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📍 TAMBAH DAERAH", callback_data: "tambah_daerah" }],
                    [{ text: "📊 CEK SEWA", callback_data: "cek_sewa" }],
                    [{ text: "🔙 KEMBALI KE MENU", callback_data: "back_to_menu" }]
                ]
            }
        });

        const ownerId = config.BOT.OWNER_ID;
        if (ownerId) {
            await bot.sendMessage(ownerId,
                `${isExtend ? '🔄 PERPANJANG' : '✅ SEWA BARU'}\n` +
                `👤 ${chatId}\n📦 ${trx.duration}\n💰 Rp${formatRupiah(trx.price)}\n💳 AUTOGOPAY`,
                { parse_mode: 'Markdown' }
            );
        }

        console.log(`✅ [AKTIVASI] Selesai untuk ${chatId}`);

    } catch (error) {
        console.error('❌ [AKTIVASI] Error:', error.message);
        await sendMessage(chatId, '❌ Gagal mengaktifkan sewa. Hubungi admin.');
    }
}

// ==========================================
// 🔥 EXPORT
// ==========================================

module.exports = {
    showSewaBotMenu,
    processSewa,
    handleSewaCommand,
    handleSewaCallback,
    cekSewa,
    getSewa,
    aktifkanSewa,
    pendingSewa,
    generateQRIS,
    tambahDaerah,
    daerahSaya,
    syncSewaToWABot,
    syncDaerahToWABot,
    startAutoCheck,
    stopAutoCheck,
    removeReplyKeyboard,
    addLogoToQRIS
};