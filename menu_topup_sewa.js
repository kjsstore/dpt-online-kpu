// ==========================================
// 🔥 MENU SEWA BOT (LANGSUNG QRIS, TANPA SALDO)
// ==========================================

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// ==========================================
// 🔥 AMBIL CONFIG
// ==========================================

const ORDERKUOTA = config.ORDERKUOTA;
const TOPUP_CONFIG = config.TOPUP;
const SEWA_PRICES = config.PRICES.SEWA;

// ==========================================
// 🔥 QRIS GENERATOR (ORDERKUOTA/ORKUT)
// ==========================================

async function generateQRIS(amount) {
    try {
        console.log(`💰 [ORDERKUOTA] Generating QRIS for Rp${amount}...`);
        
        const response = await axios.get(
            ORDERKUOTA.QRIS_API,
            {
                params: {
                    qris_string: ORDERKUOTA.QRIS_STRING,
                    amount: amount,
                    format: 'json',
                },
                timeout: ORDERKUOTA.TIMEOUT,
            }
        );

        if (response.data?.success) {
            const data = response.data;
            
            const randomAdd = data.random_add || 0;
            const totalAmount = data.amount || amount;
            const originalAmount = data.amount_original || amount;
            
            console.log(`✅ [ORDERKUOTA] Generated: Original: ${originalAmount}, Random: ${randomAdd}, Total: ${totalAmount}`);
            
            return {
                success: true,
                merchant: data.merchant || 'CHIKEN MANG KEMET',
                amount: totalAmount,
                amount_original: originalAmount,
                random_add: randomAdd,
                reference: data.reference || `QRIS_${Date.now()}`,
                qr_string: data.qr_string || ORDERKUOTA.QRIS_STRING,
                image_data: data.image_data || null,
                expiry_time: Date.now() + (TOPUP_CONFIG.EXPIRY_MINUTES * 60 * 1000),
                created_at: Date.now(),
                display: {
                    harga: originalAmount,
                    kode_unik: randomAdd,
                    total: totalAmount,
                }
            };
        }
        
        throw new Error(response.data?.message || 'Gagal generate QRIS');
    } catch (error) {
        console.error('❌ [ORDERKUOTA] Generate error:', error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 🔥 ORDERKUOTA CHECKER
// ==========================================

let lastRequestTime = 0;
let rateLimitCount = 0;
let isRateLimited = false;
let rateLimitUntil = 0;

const RATE_LIMIT_CONFIG = ORDERKUOTA.RATE_LIMIT || {
    MIN_INTERVAL: 5000,
    MAX_RETRY: 3,
    BACKOFF_MS: 300000,
};

const MATCH_RANGE = ORDERKUOTA.MATCH_RANGE || 100;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseIndonesianDate(dateStr) {
    if (!dateStr) return null;
    try {
        const parts = dateStr.split(' ');
        if (parts.length !== 2) return null;
        const dateParts = parts[0].split('/');
        const timeParts = parts[1].split(':');
        if (dateParts.length !== 3 || timeParts.length !== 3) return null;
        return new Date(
            parseInt(dateParts[2]),
            parseInt(dateParts[1]) - 1,
            parseInt(dateParts[0]),
            parseInt(timeParts[0]),
            parseInt(timeParts[1]),
            parseInt(timeParts[2])
        );
    } catch (e) {
        return null;
    }
}

function createProxyAgent() {
    try {
        const proxy = ORDERKUOTA.PROXY;
        if (!proxy || !proxy.HOST) return null;
        const { SocksProxyAgent } = require('socks-proxy-agent');
        const proxyUrl = `socks5://${proxy.USERNAME}:${proxy.PASSWORD}@${proxy.HOST}:${proxy.PORT}`;
        console.log(`🔗 [PROXY] Creating SOCKS5 proxy: ${proxy.HOST}:${proxy.PORT}`);
        return new SocksProxyAgent(proxyUrl);
    } catch (error) {
        console.error('❌ [PROXY] Failed:', error.message);
        return null;
    }
}

async function getMutasiOrderKuota() {
    if (!ORDERKUOTA.ENABLED) {
        return { success: false, error: 'Disabled' };
    }
    
    if (isRateLimited) {
        const now = Date.now();
        if (now < rateLimitUntil) {
            const remaining = Math.ceil((rateLimitUntil - now) / 1000);
            return { 
                success: false, 
                error: `Rate limited, tunggu ${remaining} detik`,
                rateLimit: true,
                retryAfter: rateLimitUntil - now
            };
        } else {
            isRateLimited = false;
            rateLimitCount = 0;
        }
    }
    
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_CONFIG.MIN_INTERVAL) {
        const waitTime = RATE_LIMIT_CONFIG.MIN_INTERVAL - timeSinceLastRequest;
        await delay(waitTime);
    }
    
    lastRequestTime = Date.now();
    const proxyAgent = createProxyAgent();
    if (!proxyAgent) {
        return { success: false, error: 'Proxy failed' };
    }
    
    try {
        const timestamp = Date.now();
        const device = ORDERKUOTA.DEVICE || {};
        
        const headers = {
            'Authorization': `Bearer ${ORDERKUOTA.BEARER}`,
            'X-Safe-Device': 'TRUE',
            'Signature': 'a8957f608020db6fbd8e2368a6faa1fadda4ea31aaaefe5652ea469d076f9b77c70e050d436c6a14b833898acfbc5d29134f7aff5610975fabc714bc97484f05',
            'Timestamp': timestamp.toString(),
            'Content-Type': 'application/x-www-form-urlencoded',
            'Host': 'app.orderkuota.com',
            'Connection': 'Keep-Alive',
            'Accept-Encoding': 'gzip',
            'User-Agent': 'okhttp/5.3.2',
        };

        const data = new URLSearchParams({
            'app_reg_id': device.APP_REG_ID || 'c0kJIbm4SA6gDFtD4C72Fc%3AAPA91bGM94YX75ZlGfdAglNLgT5Igjpp-lTZbg8aDRSFRtIbMcAkkZpVuDE1JhV0xV2IAzLZedgb_TOvPIof-aWeyacmO6_9QbbnQxSDZSapLKtedM88QcU',
            'phone_uuid': device.PHONE_UUID || 'c0kJIbm4SA6gDFtD4C72Fc',
            'requests[qris_history][jenis]': 'kredit',
            'phone_model': device.PHONE_MODEL || '23108RN04Y',
            'requests[qris_history][keterangan]': '',
            'requests[qris_history][jumlah]': '',
            'request_time': timestamp.toString(),
            'phone_android_version': device.PHONE_ANDROID_VERSION || '15',
            'app_version_code': device.APP_VERSION_CODE || '260627',
            'auth_username': ORDERKUOTA.USERNAME,
            'requests[qris_history][page]': '1',
            'auth_token': ORDERKUOTA.TOKEN,
            'app_version_name': device.APP_VERSION_NAME || '26.06.27',
            'ui_mode': device.UI_MODE || 'light',
            'requests[qris_history][dari_tanggal]': '',
            'requests[0]': 'account',
            'requests[qris_history][ke_tanggal]': '',
        });

        console.log(`🔍 [ORDERKUOTA] Fetching mutasi...`);
        
        const response = await axios.post(
            ORDERKUOTA.MUTASI_URL,
            data.toString(),
            {
                headers: headers,
                httpsAgent: proxyAgent,
                timeout: ORDERKUOTA.TIMEOUT,
            }
        );

        rateLimitCount = 0;

        if (response.data?.success) {
            const history = response.data.qris_history || {};
            const transactions = history.results || [];
            
            const formattedTransactions = transactions.map(tx => ({
                id: tx.id,
                amount: tx.kredit || tx.amount || '0',
                type: tx.type || 'kredit',
                description: tx.keterangan || '',
                date: tx.tanggal || '',
                brand: tx.brand?.name || 'QRIS',
                brand_logo: tx.brand?.logo || '',
                fee: tx.fee || '',
                saldo_akhir: tx.saldo_akhir || '',
                status: tx.status || 'IN',
            }));
            
            return {
                success: true,
                transactions: formattedTransactions,
                count: history.total || 0,
            };
        }
        
        if (response.data?.message?.includes('terlalu sering')) {
            rateLimitCount++;
            if (rateLimitCount >= RATE_LIMIT_CONFIG.MAX_RETRY) {
                isRateLimited = true;
                rateLimitUntil = Date.now() + RATE_LIMIT_CONFIG.BACKOFF_MS;
            }
            return { 
                success: false, 
                error: response.data.message,
                rateLimit: true,
                retryAfter: RATE_LIMIT_CONFIG.BACKOFF_MS,
            };
        }
        
        return { success: false, error: response.data?.message || 'API error' };
        
    } catch (error) {
        console.error('❌ [ORDERKUOTA] Error:', error.message);
        if (error.response?.status === 469) {
            rateLimitCount++;
            if (rateLimitCount >= RATE_LIMIT_CONFIG.MAX_RETRY) {
                isRateLimited = true;
                rateLimitUntil = Date.now() + RATE_LIMIT_CONFIG.BACKOFF_MS;
            }
            return { 
                success: false, 
                error: 'Rate limited (469)',
                rateLimit: true,
                retryAfter: RATE_LIMIT_CONFIG.BACKOFF_MS,
            };
        }
        if (error.response?.status === 403) {
            return { success: false, error: 'Proxy diblokir (403)', blocked: true };
        }
        return { success: false, error: error.message };
    }
}

async function checkPaymentByTotal(targetAmount, retryCount = 0, startTime = null) {
    const MAX_RETRY = 3;
    const checkStartTime = startTime || Date.now() - 300000;
    
    console.log(`🔍 [ORDERKUOTA] Checking payment for Rp${targetAmount}...`);
    console.log(`📊 Range: +/- ${MATCH_RANGE} (${targetAmount - MATCH_RANGE} - ${targetAmount + MATCH_RANGE})`);
    
    const result = await getMutasiOrderKuota();
    
    if (result.rateLimit && retryCount < MAX_RETRY) {
        const waitTime = result.retryAfter || 5000;
        console.log(`⏳ Retry dalam ${waitTime/1000} detik...`);
        await delay(waitTime);
        return checkPaymentByTotal(targetAmount, retryCount + 1, startTime);
    }
    
    if (!result.success) {
        return { 
            success: false, 
            matched: false, 
            error: result.error,
            blocked: result.blocked || false,
            rateLimit: result.rateLimit || false,
        };
    }
    
    const transactions = result.transactions || [];
    console.log(`📊 Checking ${transactions.length} transactions...`);
    
    const sortedTx = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    const recentTx = sortedTx.slice(0, 15);
    
    const minAmount = targetAmount - MATCH_RANGE;
    const maxAmount = targetAmount + MATCH_RANGE;
    
    let bestMatch = null;
    let smallestDiff = Infinity;
    
    for (const tx of recentTx) {
        let cleanAmount = 0;
        if (typeof tx.amount === 'string') {
            cleanAmount = parseInt(tx.amount.replace(/[Rp.,\s]/g, ''));
        } else if (typeof tx.amount === 'number') {
            cleanAmount = tx.amount;
        } else {
            cleanAmount = parseInt(String(tx.amount).replace(/[Rp.,\s]/g, ''));
        }
        
        const txDate = parseIndonesianDate(tx.date);
        let isAfterStartTime = true;
        if (txDate) {
            isAfterStartTime = txDate.getTime() >= checkStartTime;
        }
        
        if (cleanAmount >= minAmount && cleanAmount <= maxAmount && isAfterStartTime) {
            const diff = cleanAmount - targetAmount;
            if (Math.abs(diff) < Math.abs(smallestDiff)) {
                smallestDiff = diff;
                bestMatch = {
                    success: true,
                    matched: true,
                    transaction: tx,
                    amount: cleanAmount,
                    brand: tx.brand || 'QRIS',
                    date: tx.date,
                    id: tx.id,
                    selisih: diff,
                    random_add: diff > 0 ? diff : 0,
                };
            }
        }
    }
    
    if (bestMatch) {
        console.log(`✅ [ORDERKUOTA] MATCH FOUND! Amount: ${bestMatch.transaction.amount}`);
        return bestMatch;
    }
    
    return { success: true, matched: false };
}

// ==========================================
// 🔥 STORE PENDING SEWA
// ==========================================

const pendingSewa = {};

// ==========================================
// 🔥 FUNGSI SEWA
// ==========================================

const getSewa = (chatId) => {
    const sewaFile = path.join(__dirname, 'sewa_aktif.json');
    let sewa = {};
    if (fs.existsSync(sewaFile)) {
        try { sewa = JSON.parse(fs.readFileSync(sewaFile)); } catch (e) {}
    }
    return sewa[chatId] || null;
};

const aktifkanSewa = (chatId, duration, days) => {
    const sewaFile = path.join(__dirname, 'sewa_aktif.json');
    let sewa = {};
    if (fs.existsSync(sewaFile)) {
        try { sewa = JSON.parse(fs.readFileSync(sewaFile)); } catch (e) {}
    }
    
    const now = Date.now();
    const expired = now + (days * 24 * 60 * 60 * 1000);
    
    sewa[chatId] = {
        duration: duration,
        start: now,
        expired: expired,
        active: true,
        start_date: new Date(now).toLocaleDateString('id-ID'),
        expired_date: new Date(expired).toLocaleDateString('id-ID'),
    };
    
    fs.writeFileSync(sewaFile, JSON.stringify(sewa, null, 2));
    return sewa[chatId];
};

const notifyOwner = async (bot, message) => {
    try {
        const ownerId = config.BOT.OWNER_ID;
        if (ownerId) {
            await bot.sendMessage(ownerId, 
                `🔔 *NOTIFIKASI SEWA*\n\n${message}`,
                { parse_mode: 'Markdown' }
            );
        }
    } catch (error) {
        console.error('Notify owner error:', error);
    }
};

// ==========================================
// 🔥 SHOW SEWA BOT MENU
// ==========================================

const showSewaBotMenu = async (chatId, sendNewMessage, bot = null) => {
    const currentSewa = getSewa(chatId);
    let statusText = '';
    
    if (currentSewa && currentSewa.active) {
        const now = Date.now();
        const sisaMs = currentSewa.expired - now;
        if (sisaMs > 0) {
            const sisaHari = Math.ceil(sisaMs / (1000 * 60 * 60 * 24));
            statusText = `
📊 *Status Sewa:* ✅ ACTIVE
📦 Paket: ${currentSewa.duration}
📅 Mulai: ${currentSewa.start_date}
📅 Berakhir: ${currentSewa.expired_date}
⏳ Sisa: ${sisaHari} hari lagi
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

    const content = `
🤖 *SEWA BOT*

💵 *Paket Sewa:*

┌─────────────────────────
│ 🏷️ 1 Minggu  : Rp 10.000
│ 🏷️ 2 Minggu  : Rp 15.000
│ 🏷️ 1 Bulan   : Rp 25.000
│ 🏷️ 2 Bulan   : Rp 45.000
│ 🏷️ 6 Bulan   : Rp 120.000
│ 🏷️ 1 Tahun   : Rp 200.000
└─────────────────────────
${statusText}
📌 Klik tombol paket di bawah
💳 Pembayaran via QRIS (OrderKuota)
✅ Aktifasi otomatis setelah bayar

🔄 *Atau gunakan command:*
/sewa [durasi]
Contoh: /sewa 1bulan
`;

    const options = {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "1 Minggu - Rp10.000", callback_data: "sewa_1minggu" },
                    { text: "2 Minggu - Rp15.000", callback_data: "sewa_2minggu" }
                ],
                [
                    { text: "1 Bulan - Rp25.000", callback_data: "sewa_1bulan" },
                    { text: "2 Bulan - Rp45.000", callback_data: "sewa_2bulan" }
                ],
                [
                    { text: "6 Bulan - Rp120.000", callback_data: "sewa_6bulan" },
                    { text: "1 Tahun - Rp200.000", callback_data: "sewa_1tahun" }
                ],
                [
                    { text: "📊 CEK SEWA", callback_data: "cek_sewa" },
                    { text: "🔙 BACK MENU", callback_data: "back_to_main" }
                ]
            ]
        }
    };

    if (bot && typeof sendNewMessageWithCleanup !== 'undefined') {
        await sendNewMessageWithCleanup(bot, chatId, content, options, "sewa");
    } else {
        await sendNewMessage(chatId, content, options, "sewa");
    }
};

// ==========================================
// 🔥 PROSES SEWA
// ==========================================

const processSewa = async (chatId, duration, price, days, bot, sendMessage, sendNewMessage) => {
    try {
        // Cek apakah user        // Cek apakah apakah user sudah punya sudah punya sewa aktif user sudah punya sewa aktif
        const current sudah punya sewa aktif
        const currentSewa = get sewa aktif
        const currentSewa = getSewa(chatId);
        if
        const currentSewa = getSewa(chatId);
        ifSewa = getSewa(chatId);
        if (currentSewaSewa(chatId);
        if (currentSewa && currentSewa (currentSewa && currentSewa (currentSewa && currentSewa.active) {
            const now = && currentSewa.active) {
            const now = Date.now();
           .active) {
            const now = Date.active) {
            const now = Date Date.now();
            if (now < currentSewa.exp if (now < currentSewa.expired) {
                const sisa.now();
            if (now < currentSewa.exp.now();
            if (now < currentSewa.expired) {
               ired) {
                const sisaHari = Math.ceil((currentSHari = Math.ceil((currentSired) {
                const sisaHari = Math.ceil((currentS const sisaHari = Math.ceil((currentSewa.expired -ewa.expired - now) / (1000 * ewa.expired - now) / (1000 * ewa.expired - now) / (1000 *  now) / (1000 * 60 * 60 * 24));
                return sendMessage60 * 60 * 24));
                return sendMessage60 * 60 * 24));
                return sendMessage60 * 60 * 24));
                return sendMessage(chatId, 
                    `⚠️ *Kamu masih pun(chatId, 
                    `⚠️ *Kamu masih pun(chatId, 
                    `⚠️ *Kamu masih pun(chatId, 
                    `⚠️ *Kamu masih punya sewa aktif!*\n\n` +
                    `📦 ${currentya sewa aktif!*\n\n` +
                    `📦 ${currentya sewa aktif!*\n\n` +
                    `📦 ${currentya sewa aktif!*\n\n` +
                    `📦 ${currentSewa.duration}\n` +
Sewa.duration}\n` +
Sewa.duration}\n` +
                    `⏳ Sisa ${Sewa.duration}\n` +
                    `⏳ Sisa ${                    `⏳ Sisa ${sisaHari} hari\n\n                    `⏳ Sisa ${sisaHari} hari\nsisaHari} hari\n\nsisaHari} hari\n\n\n` +
                    `Tunggu sampai habis atau` +
                    `Tunggu sampai habis atau` +
                    `Tunggu sampai habis atau` +
                    `Tunggu sampai habis atau /batalkan jika /batalkan jika mau /batalkan jika / mau sewa baru.`,
                    { parse sewa baru.`,
                    { parse mau sewa baru.`,
                    { parse_mode: 'Markdown' }
                );
            }
        }

        // Cbatalkan jika mau sewa baru.`,
                    { parse_mode: 'Markdown' }
                );
            }
        }

        // C_mode: 'Markdown' }
                );
            }
        }

        // Cek pending
_mode: 'Markdown' }
                );
            }
        }

        // Cek pending
ek pending
        if (pendingSewa[chatek pending
        if (pendingSewa[chat        if (pendingSewa[chat        if (pendingSewa[chatId]) {
            const trx =Id]) {
            const trx =Id]) {
            const trx = pendingSewaId]) {
            const trx = pendingSewa[chatId];
            if (Date.now() < trx.expiry) {
                const sisa pendingSewa[chatId];
            if (Date.now() < trx.expiry) {
                const sisa[chatId];
            if (Date.now() < trx.expiry) {
 pendingSewa[chatId];
            if (Date.now() < trx.expiry) {
                const sisa = Math.ceil((trx.exp = Math.ceil((trx.exp                const sisa = Math.ceil = Math.ceil((trx.expiry - Date.now()) / 1000 / 60);
                return sendiry - Date.now()) / 1000 / 60);
                returniry - Date.now()) / 1000 / 60);
                return send((trx.expiry - Date.now()) / 1000 / 60Message(chatId, 
                    `⚠️ *Ada sendMessage(chatId, 
                    `⚠️ *AdaMessage(chatId, 
                    `⚠️ *Ada transaksi pending!*\n`);
                return sendMessage(chatId, 
                    `⚠️ *Ada transaksi pending!*\n` +
                    ` transaksi pending!*\n` +
                    `📦 ${tr transaksi pending!*\n` +
                    `📦 ${tr +
                    `📦 ${trx.duration}\n` +
                    `💰 Rp${trx.amount📦 ${trx.duration}\n` +
                    `💰 Rp${x.duration}\n` +
                    `💰 Rp${trx.amountx.duration}\n` +
                    `💰 Rp${trx.amount}\n` +
                    `}\n` +
                    `trx.amount}\n` +
                    `⏳ Sisa}\n` +
                    `⏳ Sisa ${⏳ Sisa ${sisa}⏳ Sisa ${sisa} menit\n\n` +
                    `T ${sisa} menit\nsisa} menit\n\n` +
                    `Tunggu s menit\n\n` +
                    `Tunggu selesai atau /batalkan`,
unggu selesai atau /batalkan`,
                    { parse\n` +
                    `Tunggu selesai atau /elesai atau /batalkan`,
                    { parse_mode: 'Markdown' }
                );
            }
            delete pendingSewa[chatId];
_mode: 'Markdown' }
                );
            }
            delete pendingSewa[chatId];
batalkan`,
                    { parse_mode: 'Markdown' }
                );
            }
            delete pendingSewa                    { parse_mode: 'Markdown' }
                );
            }
            delete pendingSewa[chatId];
        }

        // Generate QRIS
        const qris = await generateQR        }

        // Generate QRIS
        const qris = await generateQR        }

        // Generate QRIS
        const qris = await generateQR[chatId];
        }

        // Generate QRIS
       IS(price);
        if (!qris.success) {
IS(price);
        if (!qris.success) {
IS(price);
        if (!qris.success) {
 const qris = await generateQRIS(price);
        if (!qris.success) {
            return sendMessage            return sendMessage(chatId, 
                `❌ Gagal generate QRIS: ${qris.error            return sendMessage(chatId, 
                `❌ Gagal generate QRIS: ${qris.error            return sendMessage(chatId, 
                `❌ Gagal generate QRIS: ${qris.error(chatId, 
                `❌ Gagal generate QRIS: ${qris.error || || 'Coba lagi'}`,
 || 'Coba lagi'}`,
 || 'Coba lagi'}`,
 'Coba lagi'}`,
                { parse_mode: 'Markdown                { parse_mode: 'Markdown' }
            );
                       { parse_mode: 'Markdown' }
            );
                       { parse_mode: 'Markdown' }
            );
        }

        // Simpan pending
 }

        // Simpan pending
' }
            );
        }

        // Simpan pending
        pendingSewa }

        // Simpan pending
        pendingSewa[chatId] = {
            duration: duration,
                   pendingSewa[chatId] = {
            duration: duration,
            days: days,
            price: price,
            amount: qris.[chatId] = {
            duration: duration,
            days: days,
            price: price,
            amount: qris.        pendingSewa[chatId] = {
            duration: duration,
            days: days,
            price: price,
            amount: qris. days: days,
            price: price,
            amount: qris.amount,
            originalAmount: qris.amount_originalamount,
            originalAmount: qris.amount_original || price,
           amount,
            originalAmount: qris.amount_originalamount,
            originalAmount: qris.amount_original || price,
            transaction_id: qris.reference,
 || price,
            transaction_id: qris.reference,
 transaction_id: qris.reference,
 || price,
            transaction_id: qris.reference,
            expiry: qris.expiry_time            expiry: qris.expiry_time,
            created_at: qris.created_at || Date.now(),
                   expiry: qris.expiry_time,
            created_at: qris.created_at || Date.now(),
        };

                   expiry: qris.expiry_time,
            created_at: qris.created_at || Date.now(),
        };

       ,
            created_at: qris.created_at || Date.now(),
        };

        const caption = };

        const caption = const caption = `
🤖 const caption = `
🤖 *SEWA BOT `
🤖 *SEWA BOT `
🤖 *SEWA BOT *SEWA BOT*

📦 Paket: ${duration*

📦 Paket: ${duration*

📦 Paket: ${duration}
💰 Detail:
├ Harga: Rp*

📦 Paket: ${duration}
💰 Detail:
├ Harga: Rp}
💰 Detail:
├ Harga: Rp}
💰 Detail:
├ Harga: Rp${qris.display?.harga || qris.amount_original || price${qris.display?.harga || qris.amount_original || price${qris.display?.harga || qris.amount_original || price${qris.display?.harga || qris.amount_original || price}
├ Kode Unik: Rp${qris.display?.kode_unik || qris}
├ Kode Unik: Rp${qris.display?.kode_unik || qris.random_add || 0}
├ Total}
├ Kode Unik: Rp${qris.display?.kode_unik || qris.random_add || 0}
├ Total: Rp}
├ Kode Unik: Rp${qris.display?.kode_unik || qris.random_add || 0}
├ Total: Rp.random_add || 0}
├ Total: Rp${qris.amount}
└ ID: ${qris: Rp${qris.amount}
└ ID: ${qris${qris.amount}
└ ID: ${qris${qris.amount}
└ ID: ${qris.reference}

⏳ Exp.reference}

⏳ Exp.reference}

⏳ Exp.reference}

⏳ Expired: 10 menit

📌 Scan QR di bawah untuk bayired: 10 menit

📌 Scan QRired: 10 menit

📌 Scan QR di bawah untuk bayired: 10 menit

📌 Scan QR di bawah untuk bayar
💡 Bayar sesuai total (Rp${qris.amount di bawah untuk bayar
💡 Bayar sesuai total (Rp${ar
💡 Bayar sesuai total (Rp${qris.ar
💡 Bayar sesuai total (Rp${qrisqris.amount})

✅ Setelah bayar, bot})

✅ Setelah bayar, bot akan aktif otamount})

✅ Setelah bayar, bot akan aktif ot.amount})

✅ Setelah bayar, bot akan aktif otomatis!
`;

        await sendNewMessage(chatId akan aktif otomatis!
`;

        await sendNewMessage(chatIdomatis!
`;

        await sendNewMessage(chatId,omatis!
`;

        await sendNewMessage(chatId, caption, {
            parse_mode: "Markdown",
            reply_mark, caption, {
            parse_mode: "Markdown",
            reply_mark, caption, {
            parse_mode: "Markdown",
            reply_m caption, {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🔄up: {
                inline_keyboard: [
                    [{ text: "🔄arkup: {
                inline_keyboard: [
                    [{ text: "🔄 CEK PEMBAup: {
                inline_keyboard: [
                    [{ text: "🔄 CEK PEMBAYARAN", CEK PEMBAYARAN", CEK PEMBAYARAN",YARAN", callback_data: " callback_data: "ceksewa" }],
                    [{ text: " callback_data: "ceksewa" }],
                    [{ text: "❌ BATALK callback_data: "ceksewa" }],
                    [{ text: "❌ BATALKceksewa" }],
                    [{ text: "❌ BATALK❌ BATALKAN", callback_data: "batalkan_sewa" }]
                ]
            }
        },AN", callback_data: "batalkan_sewa" }]
                ]
            }
        }, "payment", qAN", callback_data: "batalkan_sewa" }]
                ]
            }
        }, "payment", qAN", callback_data: "batalkan_sewa" }]
                ]
            }
        }, "payment", q "payment", qris.image_data);

        startSewaChecker(chatris.image_data);

        startSewaChecker(chatId, bot,ris.image_data);

        startSewaChecker(chatId, bot,ris.image_data);

        startSewaChecker(chatId, bot,Id, bot, sendMessage);

    } catch (error sendMessage);

    } catch (error) {
        console sendMessage);

    } catch (error) {
        console sendMessage);

    } catch (error) {
        console) {
        console.error('S.error('Sewa.error('Sewa.error('Sewaewa error:', error);
        sendMessage(chatId, '❌ Gagal memproses sewa.');
 error:', error);
        sendMessage(chatId, '❌ Gagal memproses sewa.');
    }
};

// error:', error);
        sendMessage(chatId, '❌ Gagal memproses sewa.');
    }
};

// error:', error);
        sendMessage(chatId, '❌ Gagal memproses sewa.');
    }
};

// ==========================================
    }
};

// ==========================================
// 🔥 CHECKER SEWA ==========================================
// 🔥 CHECK ==========================================
// 🔥 CHECKER SEWA
// =================================// 🔥 CHECKER SEWA
// ==========================================

const startSewaChecker = (chatId,
// ==========================================

const startSewaChecker = (chatId,ER SEWA
// ==========================================

const startSewaChecker ==========

const startSewaChecker = bot, sendMessage) => {
    let checkCount = 0;
    const maxChecks = TOP bot, sendMessage) => {
    let checkCount = 0;
    const maxChecks = TOPUP_CONFIG (chatId, bot, sendMessage) => {
    let checkCount = 0;
    const maxChecks = TOPUP_CONFIG.MAX_CHEC (chatId, bot, sendMessage) => {
    let checkCount = 0;
    const maxChecks = TOPUP_CONFIG.MAX_CHECKS || 60;
    
    constUP_CONFIG.MAX_CHECKS || 60;
    
    const interval.MAX_CHECKS || 60;
    
    const interval = setInterval(asyncKS || 60;
    
    const interval = setInterval(async interval = setInterval(async () => {
        checkCount++;
        const trx = pendingSewa () => {
        checkCount++;
        const trx = pendingSewa[chatId];
        = setInterval(async () => {
        checkCount++;
        const trx = pendingSewa[chatId];
        () => {
        checkCount++;
        const trx = pendingSewa[chatId];
        if (!trx[chatId];
        if (!trx) { clearInterval(interval); if (!trx) { clearInterval(interval); return; }
 if (!trx) { clearInterval(interval); return; }
        
) { clearInterval(interval); return; }
        
 return; }
        
        if (Date        
        if (Date.now() > tr        if (Date.now() > tr        if (Date.now() > trx.expiry) {
            clearInterval.now() > trx.expiry)x.expiry) {
            clearInterval(interval);
            delete pendingSewax.expiry) {
            clearInterval(interval);
            delete pendingSewa[chatId];
            sendMessage(chatId, '(interval);
            delete pendingSewa[chatId];
            sendMessage( {
            clearInterval(interval);
            delete pendingSewa[chatId];
            sendMessage([chatId];
            sendMessage(chatId, '⏰ QRIS Expired! SilahkanchatId, '⏰ QRISchatId, '⏰ QRIS Exp⏰ QRIS sewa ul Expired! Silahkan sewa ulang.');
            return;
        }
        
ired! Silahkan sewa ulang.');
            return Expired! Silahkan sewa ulang.');
            return;
        }
        
        try {
ang.');
            return;
        }
        
        try {
            const result = await        try {
            const result = await checkPaymentByTotal;
        }
        
        try {
            const result = await checkPaymentByTotal(trx.originalAmount, 0, trx.created_at);
                       const result = await checkPaymentByTotal(trx.originalAmount, 0, trx checkPaymentByTotal(trx.originalAmount, 0, trx(trx.originalAmount, 0, trx.created_at);
            if (result.success && result.matched) {
                clear.created_at);
            if (result.success && result.matched) {
                clearInterval(interval);
                
                // Akt.created_at);
            if (result.success && result.matched) {
                clearInterval(interval);
                
                // Aktifkan sewa if (result.success && result.matched) {
                clearInterval(interval);
                
                // Aktifkan sewaInterval(interval);
                
                // Aktifkan sewa
                const sewa = aktifkanSewa(chatId, trx.duration, trifkan sewa
                const sewa = aktifkanSewa(chatId, trx.duration, trx.days);
                delete pending
                const sewa = aktifkanSewa(chatId, trx.duration, tr
                const sewa = aktifkanSewa(chatId, trx.duration, trx.days);
x.days);
                delete pendingx.days);
                delete pending                delete pendingSewa[chatId];
                
                sendMessage(chatId, 
                    `✅ *SESewa[chatId];
                
                sendMessage(chatId, 
                    `✅ *SEWA BERSewa[chatId];
                
                sendMessage(chatId, 
                    `✅ *SEWA BERHASSewa[chatId];
                
                sendMessage(chatId, 
                    `✅ *SEWA BERHASIL!*\n\n`WA BERHASIL!*\n\n` +
                    `🤖 PakHASIL!*\n\n` +
                    `🤖 PakIL!*\n\n` +
                    `🤖 Paket +
                    `🤖 Paket:et: ${trx.durationet: ${trx.duration}\: ${trx.duration}\ ${trx.duration}\n}\n` +
                    `📅 Muln` +
                    `📅 Mulai: ${sewa.start_daten` +
                    `📅 Mulai: ${sewa.start_date}\n` +
                    `📅` +
                    `📅 Mulai: ${sewa.start_date}\n` +
                    `📅ai: ${sewa.start_date}\n` +
                    `📅 Berakhir: ${}\n` +
                    `📅 Berakhir: ${ Berakhir: ${sewa.expired Berakhir: ${sewa.expiredsewa.expired_date}\n\n` +
                    `🎉 Selamat botsewa.expired_date}\n\n` +
                    `🎉 Selamat bot_date}\n\n` +
                    `🎉 Selamat bot sudah_date}\n\n` +
                    `🎉 Selamat bot sudah sudah aktif!\n` +
                    `G sudah aktif!\n` +
                    `G aktif!\n` +
                    `G aktif!\n` +
                    `Gunakan /ceksewa untuk cek status.`,
unakan /ceksewa untuk cek status.`,
                    {unakan /ceksewa untuk cek status.`,
                    {unakan /ceksewa untuk cek status.`,
                    { parse_mode                    { parse_mode: 'Markdown' }
                );
                
                notifyOwner parse_mode: 'Markdown' }
                );
                
                notifyOwner parse_mode: 'Markdown' }
                );
                
                notifyOwner(bot: 'Markdown' }
                );
                
                notifyOwner(bot, 
(bot, 
                    `✅ SEWA BER(bot, 
                    `✅ SEWA BER, 
                    `✅ SEWA BERHASIL\n                    `✅ SEWA BERHASIL\nHASIL\n` +
                    `👤 User: ${HASIL\n` +
                    `👤 User: ${chat` +
                    `👤 User` +
                    `👤 User: ${chatId}\n` +
                    `📦 Paket: ${trx.duration}\n` +
                    `💰: ${chatId}\n` +
                    `📦 Paket: ${trx.duration}\n` +
                    `💰chatId}\n` +
                    `📦 Paket: ${trx.duration}\n` +
                    `💰Id}\n` +
                    `📦 Paket: ${trx.duration}\n` +
                    `💰 H Harga: Rp${arga: Rp${ Harga: Rp${trx.price Harga: Rp${trx.price}\n` +
trx.price}\n` +
                    `📅 Berakhir: ${newtrx.price}\n` +
                    `📅 Berakhir: ${new Date(se}\n` +
                    `📅 Berakhir: ${new Date(sewa.expired).                    `📅 Berakhir: ${new Date Date(sewa.expired).toLocaleDateString('id-ID')wa.expired).toLocaleDateString('id-ID')}`
                );
toLocaleDateString('id-ID')(sewa.expired).toLocaleDateString('id-ID')}`
                );
            }
        }}`
                );
            }
        } catch (error)            }
        } catch (error) {
            console.error}`
                );
            }
        } catch (error) catch (error) {
            console.error('Check error:', error);
        }
        
        if ( {
            console.error('Check error:', error);
        }
        
        if (('Check error:', error);
        }
        
        if (checkCount >= maxChecks) {
            clearInterval( {
            console.error('Check error:', error);
        }
        
        if (checkCount >= maxChecks) {
checkCount >= maxChecks) {
checkCount >= maxChecks) {
interval);
            sendMessage(chatId            clearInterval(interval);
            send            clearInterval(interval);
            send            clearInterval(interval);
            sendMessage(chatId, '⏰ Waktu cek habis. C, '⏰ Waktu cek habMessage(chatId, '⏰ Waktu cek habis. CMessage(chatId, '⏰ Waktu cek habis. Cek manual dengan /ceksewa');
is. Cek manual dengan /ceksewa');
ek manual dengan /ceksewa');
ek manual dengan /ceksewa');
        }
    }, TOPUP_CONFIG.CHECK_INTER        }
    }, TOPUP_CONFIG.CHECK_INTERVAL || 100        }
    }, TOPUP_CONFIG.CHECK_INTERVAL || 10000        }
    }, TOPUP_CONFIG.CHECK_INTERVAL || 10000);
};

// =========================================00);
};

//);
};

// ==========================================
// 🔥VAL || 10000);
};

// ==========================================
// 🔥=
// 🔥 CEK SEWA (FUNCTION)
 ==========================================
// 🔥 CEK SEWA (F CEK SEWA (FUNCTION)
 CEK SEWA (FUNCTION)
// ==========================================

UNCTION)
// ==========================================

const cek// ==========================================

// ==========================================

const cekSewa = async (chatId, sendMessage) => {
const cekSewa = async (chatId, sendSewa = async (chatId, sendMessage) => {
const cekSewa = async (chatId, sendMessage) => {
    const sewa = getSewa(chatId);
    
    if (!sewa || !sewa.active) {
        return    const sewa = getSewa(chatId);
    
    if (!sewa || !sewa.active) {
        return send    const sewa = getSewa(chatId);
    
    if (!sewa || !sewa.activeMessage) => {
    const sewa = getSewa(chatId);
    
    if (!sewa || !sewa.active) {
        returnMessage(chat) {
        return sendMessage(chatId, 
            `❌ * sendMessage(chatId, 
            `❌ *Belum ada sendMessage(chatId, 
            `❌ *Belum adaId, 
            `❌ *Belum ada sewa aktif*\n\nGunakan /sewa untuk sewa aktif*\n\nGunakan / sewa aktif*\n\nGunakan /Belum ada sewa aktif*\n\nGunakan /sewa untuk mulai. mulai.sewa untuk mulai.`,
            { parsesewa untuk mulai.`,
            { parse`,
            { parse_mode: 'Mark`,
            { parse_mode: 'Markdown' }
        );
    }
    
    const now_mode: 'Markdown' }
        );
    }
    
_mode: 'Markdown' }
        );
    }
    
down' }
        );
    }
    
    const now = Date.now();
    = Date.now();
    if (now >= sewa.expired) {
           const now = Date.now();
    if (now >= sewa.exp    const now = Date.now();
    if (now >= sewa.exp if (now >= sewa.expired) {
        return return sendMessage(chatId, 
            `⏰ *ired) {
        return sendMessage(chatId, 
            `ired) {
        return sendMessage(chatId, 
            ` sendMessage(chatId, 
            `Sewa sudah EXPIRED*\n\n` +
            `📦 ${sewa⏰ *Sewa sudah EXPIRED*\n\n` +
            `📦 ${sewa.duration⏰ *Sewa sudah EXPIRED*\n\n` +
            `📦 ${sewa.duration}\n` +
            `📅 Berakhir⏰ *Sewa sudah EXPIRED*\n\n` +
            `📦 ${sewa.duration}\.duration}\n` +
            `📅 Berakhir: ${sewa}\n` +
            `📅 Berakhir: ${sewa.expired_date}\: ${sewa.expired_date}\n` +
            `📅 Berakhir: ${sewa.expired_date}\n\n` +
            `G.expired_date}\n\n` +
            `Gunakan /sewa untuk perpanjang.n\n` +
            `Gunakan /sewa untuk pern\n` +
            `Gunakan /sewa untuk perunakan /sewa untuk perpanjang.`,
            { parse`,
            { parse_mode: 'Markpanjang.`,
            { parsepanjang.`,
            { parse_mode: 'Markdown' }
        );
    }
    
down' }
        );
    }
    
    const sisaMs =_mode: 'Markdown' }
        );
    }
    
_mode: 'Markdown' }
        );
    }
    
    const    const sisaMs = sewa.expired - now;
       const sisaMs = sewa.expired - now;
    sisaMs = sewa.expired - now;
    const sisaHari = Math.ceil(sisaMs sewa.expired - now;
    const sisaHari = Math.ceil(sisaMs const sisaHari = Math.ceil(sisaMs / (1000 * 60 * 60 * 24));
    const sisaJam const sisaHari = Math.ceil(sisaMs / (1000 * 60 * 60 * 24));
    const sisa / (1000 * 60 * 60 * 24));
    const / (1000 * 60 * 60 * 24));
    const = Math.floor((sisaMs %Jam = Math.floor((sisaMs % sisaJam = Math.floor((sisaMs % (100 sisaJam = Math.floor((sisaMs % (100 (1000 * 60 * 60 * 24)) (1000 * 60 * 60 * 240 * 60 * 60 *0 * 60 * 60 * / (1000 * 60 * )) / (1000 * 60 * 24)) / (1000 * 60 * 60));
    
    24)) / (1000 * 60 * 6060));
    
    return send 60));
    
    return send return sendMessage(chatId));
    
    return sendMessage(chatId, 
        `Message(chatId, 
        `✅ *StatusMessage(chatId, 
        `✅ *Status, 
        `✅ *Status Sewa Aktif*\n\n` +
        `📦 Pak✅ *Status Sewa Aktif*\n\n` +
        ` Sewa Aktif*\n\n` +
        `📦 Pak Sewa Aktif*\n\n` +
        `📦 Pak📦 Paket: ${seet: ${sewa.det: ${sewa.duration}\n` +
        `📅 Mulet: ${sewa.duration}\n` +
        `📅 Mulwa.duration}\n` +
        `📅 Mulai: ${seuration}\n` +
        `📅 Mulai: ${sewa.start_date}\ai: ${sewa.start_date}\wa.start_date}\n` +
       ai: ${sewa.start_date}\n` +
        `📅 Bern` +
        `📅 Ber `📅 Berakhir: ${sewa.expired_date}\n` +
n` +
        `📅 Berakhir: ${sewa.expired_date}\n` +
        `⏳ Sisa:akhir: ${sewa.expired_date}\n` +
        `⏳ Sisa: ${sakhir: ${sewa.expired_date}\n` +
        `⏳ Sisa: ${sisa        `⏳ Sisa: ${sisaHari} hari ${sisaJam} jam\n\n` ${sisaHari} hari ${sisaJam} jam\n\n`isaHari} hari ${sisaJam} jam\n\n` +
        `Hari} hari ${sisaJam} jam\n\n` +
 +
        `💡 Sew +
        `💡 Sewa baru: /sewa`,
💡 Sewa baru: /se        `💡 Sewa baru:a baru: /sewa`,
        { parse_mode: 'wa`,
        { parse_mode: ' /sewa`,
        { parse_mode: 'Markdown' }
        { parse_mode: 'Markdown' }
    );
};

Markdown' }
    );
};

Markdown' }
    );
};

// ==========================================
// 🔥 HANDLE CALLBACK
// =================================    );
};

// ==========================================
// 🔥 HANDLE CALLBACK// ==========================================
// 🔥 HANDLE CALLBACK
// =================================// ==========================================
// 🔥 HANDLE CALLBACK=========

const handleSewaCallback = async (q,
// ==========================================

const handleSewaCallback = async (q,=========

const handleSewaCallback = async (q, bot, sendMessage, sendNewMessage) => {
    const chatId =
// ==========================================

const handleSewaCallback = async (q, bot, sendMessage, sendNewMessage) => {
    const bot, sendMessage, sendNewMessage) => {
    bot, sendMessage, sendNewMessage) => {
    q.message.chat.id;
    const data = q.data;
    
    // chatId = q.message.chat.id;
    const data = q.data const chatId = q.message.chat.id;
    const data = q.data const chatId = q.message.chat.id;
    const data = q.data Sewa
    if (data;
    
    // Sewa
    if (data.startsWith('se;
    
    // Sewa
    if (data.startsWith('se;
    
    // Sewa
    if (data.startsWith('se.startsWith('sewa_')) {
        const duration = datawa_')) {
        const duration =wa_')) {
        const duration =wa_')) {
        const duration = data.replace('sewa_', '');
        const priceMap = {
           .replace('sewa_', '');
        const priceMap = {
            data.replace('sewa_', '');
        const priceMap = {
            data.replace('sewa_', '');
        const priceMap = {
            '1minggu': { '1minggu': { '1minggu': { price: 100 '1minggu': { price: 100 price: 100 price: 10000, days:00, days: 7 },
            '2minggu': { price: 15000, days: 14 },
            '100, days: 7 },
            '2minggu': { price: 15000, days: 14 },
            '100, days: 7 },
            '2minggu': { price: 15000, days: 14 },
            '1 7 },
            '2minggu': { price: 15000, days: 14bulan': { price: 25000, days: 30 },
           bulan': { price: 25000, days: 30 },
           bulan': { price: 25000, days: 30 },
            '2bulan': { price: },
            '1bulan': { price: 25000, days: 30 },
            '2bulan '2bulan': '2bulan': { price: 45000, days: 60 },
            '6bulan': {': { price: 45000, days: 60 },
            '6bulan': { { price: 45000, days: 60 },
            '6bulan': { price:  45000, days: 60 },
            '6bulan': { price: 120120000, days: 180 },
            '1tahun000, days: 180 },
            '1tahun': { price: price: 120000, days: 180 },
            '1tahun': { price: price: 120000, days: 180 },
            '1tahun': { price: 200000,': { price: 200000, 200000, days: 365 200000, days: 365 }
        };
        
        const info = priceMap[duration];
        if (!info) {
            send days: 365 }
        };
        
        const info = priceMap[duration];
        if (!info) {
            sendMessage( days: 365 }
        };
        
        const info = priceMap[duration];
        if (!info) {
            sendMessage(chatId, '❌ Paket tidak valid');
 }
        };
        
        const info = priceMap[duration];
        if (!info) {
            sendMessage(chatId, '❌Message(chatId, '❌ Paket tidak valid');
chatId, '❌ Paket tidak valid');
            return true;
        }
        
        const label            return true;
        }
        
        const labelMap = Paket tidak valid');
            return true;
        }
        
        const label            return true;
        }
        
        const labelMap =Map = {
            '1 {
            '1minggu':Map = {
            '1 {
            '1minggu': '1 Minggu',
            '2minggu': '2 Minggu',
           minggu': '1 Minggu',
            '2minggu': '2 '1 Minggu',
            '2minggu': '2 Minggu',
           minggu': '1 Minggu',
            '2minggu': '2 Minggu',
            '1bulan': '1 Bulan',
            ' '1bulan': '1 Bul Minggu',
            '1bulan': '1 Bulan',
            ' '1bulan': '1 Bulan',
            '2bulan': '2 Bulan2bulan': '2 Bulan',
            '6an',
            '2bulan': '2 Bulan',
            '62bulan': '2 Bulan',
            '6',
            '6bulan': '6 Bulan',
            '1tahun': '1 Tahun'
        };
        
        await processSewa(chatbulan': '6 Bulan',
            '1tahun': '1 Tahun'
        };
        
        await processbulan': '6 Bulan',
            '1tahun': '1 Tahun'
        };
        
        await processbulan': '6 Bulan',
            '1tahun': '1 Tahun'
        };
        
        await processId, labelMap[duration], info.priceSewa(chatId, labelMap[duration], infoSewa(chatId, labelMap[duration], info.priceSewa(chatId, labelMap[duration], info.price, info.days,.price, info.days, bot, sendMessage, sendNewMessage);
        return true;
    }
    
    // Cek se, info.days, bot, sendMessage, sendNewMessage);
        return true;
    }
    
    // C, info.days, bot, sendMessage, sendNewMessage);
        return true;
    }
    
    // Cek sewa
    if (data === 'cek_sewa') {
        bot, sendMessage, sendNewMessage);
        return true;
    }
    
    // Cek sewa
    if (data === 'cek_sewa') {
        await cwa
    if (data === 'cek_sewa') {
        await cekSewa(chatId, sendek sewa
    if (data === 'cek_sewa') {
        await cekSewa(chatId, send await cekSewa(chatId, sendMessage);
        return true;
    }
    
    // CekSewa(chatId, sendMessage);
        return true;
    }
Message);
        return true;
    }
    
    // Cek pembMessage);
        return true;
    }
    
    // Cek pembayaran
ek pembayaran
    if (data === 'ceksewa') {
        const tr    
    // Cek pembayaran
    if (data === 'ceksewa') {
        const trayaran
    if (data === 'ceksewa') {
        const tr    if (data === 'ceksewa') {
        const trx = pendingSewa[chatId];
        if (!trx) {
            sendMessage(chatId, '❌ Tidak ada transaksi pending');
x = pendingSewa[chatId];
        if (!trx) {
            sendMessage(chatId, '❌ Tidak adax = pendingSewa[chatId];
        if (!trx) {
            sendMessage(chatId, '❌ Tidak ada transaksi pending');
x = pendingSewa[chatId];
        if (!trx) {
            sendMessage(chatId, '❌ Tidak ada            return true;
        }
        
        transaksi pending');
            return true;
        }
        
        const result            return true;
        }
        
        transaksi pending');
            return true;
        }
        
        const result = await const result = await checkPaymentByTotal(trx.originalAmount, = await checkPaymentByTotal(trx.originalAmount, 0, trx const result = await checkPaymentByTotal(trx.originalAmount,  checkPaymentByTotal(trx.originalAmount, 0, trx 0, trx.created_at);
        if (result.success && result.matched.created_at);
        if (0, trx.created_at);
        if (result.success && result.matched.created_at);
        if (result.success && result.matchedresult.success && result.matched) {
            const sewa = aktifkanSewa(chatId, tr) {
            const sewa = aktifkanSewa(chatId, trx.duration, trx.days);
            delete pendingSewa[chat) {
            const sewa = aktifkanSewa(chatId, trx.duration, trx.days);
            delete pendingSewa[chat) {
            const sewa = aktifkanSewa(chatId, trx.duration, trx.days);
            delete pendingSewa[chatx.duration, trx.days);
            delete pendingSewa[chatId];
            sendMessage(chatId, 
                `Id];
            sendMessage(chatId, 
                `Id];
            sendMessage(chatId, 
                `Id];
            sendMessage(chatId, 
                `✅ *SEWA BERHASIL!*\n\n✅ *SEWA BERHASIL!*\n\n` +
                `✅ *SEWA BERHASIL!*\n\n` +
                `🤖 Paket: ${tr✅ *SEWA BERHASIL!*\n\n` +
                `` +
                `🤖 Paket: ${trx.duration}\n` +
               🤖 Paket: ${trx.duration}\n` +
               x.duration}\n` +
               🤖 Paket: ${trx.duration}\n` +
                `📅 Berakhir: ${ `📅 Berakhir: ${ `📅 Berakhir: ${ `📅 Berakhir: ${new Date(sewa.expired).toLocaleDatenew Date(sewa.expired).toLocaleDatenew Date(sewa.expired).toLocaleDatenew Date(sewa.expired).toLocaleDateString('id-ID')}\n\n` +
                `🎉String('id-ID')}\n\n` +
                `🎉String('id-ID')}\n\n` +
String('id-ID')}\n\n` +
 Selamat bot sudah aktif!`,
                { parse_mode: 'Markdown' }
            );
            Selamat bot sudah aktif!`,
                { parse_mode: 'Markdown' }
            );
                           `🎉 Selamat bot sudah aktif!`,
                { parse_mode: 'Markdown' }
            );
            notifyOwner(bot, `✅ S                `🎉 Selamat bot sudah aktif!`,
                { parse_mode: 'Markdown' }
            );
            notifyOwner(bot, `✅ SEWA\n👤 ${chat notifyOwner(bot, `✅ SEWA\n👤 ${chatEWA\n👤 ${chat notifyOwner(bot, `✅ SEWA\n👤 ${chatId}\n📦 ${trxId}\n📦 ${trxId}\n📦 ${trxId}\n📦 ${tr.duration}\n💰 Rp${trx.price}`);
        } else {
           .duration}\n💰 Rp${trx.price}`);
        } else {
           .duration}\n💰 Rp${trx.price}`);
        } else {
           x.duration}\n💰 Rp${trx.price}`);
        } else {
            let msg = '⏳ Masih pending. Pastikan let msg = '⏳ Masih pending. Pastikan let msg = '⏳ Mas let msg = '⏳ Masih pending. Pastikan sudah bayar sesuai total sudah bayar sesuai total sudah bayar sesuai total.';
            if (result.rateLimit) msg += '\n\n⚠ih pending. Pastikan sudah bayar sesuai total.';
            if (result.rateLimit) msg +=.';
            if (result.rateLimit) msg += '\n\n⚠.';
            if (result.rateLimit) msg += '\n\n⚠ '\n\n⚠️ Rate️ Rate limit, coba lagi nanti.';
            if (️ Rate limit, coba lagi nanti.';
            if (️ Rate limit, coba lagi nanti.';
            if ( limit, coba lagi nantiresult.blocked) msg += '\nresult.blocked) msg += '\result.blocked) msg += '\n.';
            if (result.blocked) msg += '\n\n⚠️ Proxy\n⚠️ Proxy diblokirn\n⚠️ Proxy diblokir\n⚠️ Proxy diblokir, hubungi owner.';
            sendMessage(chatId diblokir, hubungi owner.';
            sendMessage(chatId, msg);
       , hubungi owner.';
            sendMessage(chatId, msg, hubungi owner.';
            sendMessage(chatId,, msg);
        }
        return true;
    }
    
    // Batal }
        return true;
    }
    
);
        }
        return true;
    }
    
 msg);
        }
        return true;
    }
    
    // Batal
    if (data === 'bat    // Batal
    if (data === 'bat    // Batal
    if (data === 'bat
    if (data === 'batalkan_sewa') {
        delete pendingSewa[chatId];
        sendalkan_sewa') {
        delete pendingSewa[chatalkan_sewa') {
        delete pendingSewa[chatId];
        sendalkan_sewa') {
        delete pendingSewa[chatId];
        sendMessage(chatId, '❌ Transaksi dibatalkan');
        return true;
    }
    
    returnMessage(chatId, '❌ Transaksi dibatalkan');
        return true;
    }
    
    returnMessage(chatId, '❌ Transaksi dibatalkan');
        return true;
    }
    
    return false;
};

//Id];
        sendMessage(chatId, '❌ Transaksi dibatalkan');
        return true;
    }
    
    return false;
 false;
};

// ==========================================
// 🔥 COMMAND HANDLERS
// ==========================================

 false;
};

// ==========================================
// 🔥 COMMAND HANDLERS
// ==========================================

 ==========================================
// 🔥 COMMAND HANDLERS
//};

// ==========================================
// 🔥 COMMAND HANDLERS
// ==========================================

const handleSewaCommand = async ==========================================

const handleSewaCommand = asyncconst handleSewaCommand = async (msgconst handleSewaCommand = async (msg (msg, bot, sendMessage, sendNewMessage) => {
    const (msg, bot, sendMessage, sendNewMessage) => {
    const, bot, sendMessage,, bot, sendMessage, chatId = msg.chat.id;
    const text = msg.text || chatId = msg.chat.id;
 sendNewMessage) => {
    const chatId = msg.chat.id;
 sendNewMessage) => {
    const chatId = msg.chat.id;
    const text = '';
    
    // /    const text = msg.text || '';
    
    // /    const text = msg.text || '';
    
    // / msg.text || '';
    
    // /sewasewa -sewa -sewa - tamp - tampilkan menu
    if (text === '/sewa') {
        return tampilkan menu
    if (text === '/sewa') {
        return show tampilkan menu
    if (text === '/sewa') {
        return showilkan menu
    if (text === '/sewa') {
        return show showSewaBotMenu(SewaBotMenu(chatId, sendNewMessage, botSewaBotMenu(chatId, sendNewMessage, botSewaBotMenu(chatId, sendNewMessage, botchatId, sendNewMessage, bot);
    }
    
    // /se);
    }
    
    // /sewa 1bulan
    const match);
    }
    
    // /sewa 1bulan
);
    }
    
    // /sewa 1bulan
    const matchwa 1bulan
    = text.match(/^\/sewa    const match = text.match(/^\/sewa = text.match(/^\/sewa\s+(1minggu const match = text.match(/^\/sewa\s+(1minggu|2minggu|\s+(1minggu|2minggu|1bulan|\s+(1minggu|2minggu|1bulan||2minggu|1bulan|1bulan|2bulan|6bulan|1tahun)$2bulan|6bulan|1tahun)$/i);
   2bulan|6bulan|2bulan|6bulan|1tahun)$/i);
   /i);
    if (match) if (match)1tahun)$/i);
    if (match) if (match) {
        const duration = match[1].toLowerCase();
        const priceMap = {
            '1minggu': {
        const duration = match[1].toLowerCase();
        const priceMap = {
            ' {
        const duration = match[1].toLowerCase();
        const priceMap = {
            ' {
        const duration = match[1].toLowerCase();
        const priceMap = {
            '1minggu': { price:  { price: 10000, days: 7, label: '11minggu': { price: 10000, days: 7, label: '1 Minggu' },
1minggu': { price: 10000, days: 7, label: '1 Minggu' },
10000, days: 7, label: '1 Minggu' },
 Minggu' },
            '2minggu': { price: 15000            '2minggu': { price: 15000, days:             '2minggu': { price: 15000, days:             '2minggu': { price: 15000, days: 14, label: '2 Minggu' },
            ', days: 14, label: '2 Minggu' },
            '14, label: '2 Minggu' },
            '14, label: '2 Minggu' },
            '1bulan': { price: 1bulan': { price: 1bulan': { price: 25000, days1bulan': { price: 25000, days: 30,25000, days: 30, label: '1 Bulan' },
25000, days: 30, label: '1 Bulan' },
: 30, label: '1 label: '1 Bulan' },
 Bulan' },
            '2bul            '2bulan': { price: 45000, days:             '2bulan': { price: 45000, days:             '2bulan': { price: 45000, days: an': { price: 45000, days: 60, label: '2 Bulan' },
            '60, label: '2 Bulan60, label: '2 Bulan60, label: '2 Bulan' },
            '6bulan':' },
            '6bulan':' },
            '6bulan':6bulan': { price: 120000, days: 180, label: '6 Bul { price: 120000, days: 180, label: '6 Bulan' },
            { price: 120000, days: 180, label: '6 Bulan' },
            '1 { price: 120000, days: 180, label: '6 Bulan' },
           an' },
            '1tahun': { price: 200000, days: '1tahun': { price: 200000, days: 365tahun': { price: 200000, days: 365, label: '1tahun': { price: 200000, days: 365, label: 365, label: '1 Tahun' }
        };
        const info = price, label: '1 Tahun' '1 Tahun' }
        };
        const info = price '1 Tahun' }
        };
        const info = priceMap[duration];
        await processSMap[duration];
 }
        };
        const info = priceMap[duration];
        await processSMap[duration];
        await processSewa(chatId        await processSewa(chatId, info.label, info.price,ewa(chatIdewa(chatId, info.label, info.label, info.price, info.days, bot, sendMessage, info.label, info.price, info.days, bot, sendMessage, info.price, info.days, info.days, bot, sendMessage, sendNewMessage);
        return, sendNewMessage);
        return;
    }
    
    // /cek, sendNewMessage);
        return;
    }
    
    // /cek bot, sendMessage, sendNewMessage);
        return;
    }
    
;
    }
    
    // /cek    // /ceksewa
sewa
    if (text === '/ceksewa') {
sewa
    if (text === '/ceksewa') {
sewa
    if (text === '/ceksewa') {
    if (text === '/cek        await cekSewa(chatId, sendMessage);
        return;
        await cekSewa(chatId, sendMessage);
        return;
        await cekSewa(chatId, sendMessage);
        return;
    }
    
   sewa') {
        await cekSewa(chatId, sendMessage);
        return;
    }
    
    // /batalkan
    if (text === '/bat    }
    
       }
    
    // /batalkan
    if (text === '/ // /batalkan
    if (text === '/batalkan') {
        if (pendingSalkan') {
        if (pendingS // /batalkan
    if (text === '/batalkan') {
        if (pendingSbatalkan') {
        if (pendingSewa[chatId]) {
            delete pendingSewaewa[chatId]) {
            delete pendingSewa[chatId];
           ewa[chatId]) {
            delete pendingSewa[chatId];
           ewa[chatId]) {
            delete pendingSewa[chatId];
[chatId];
            sendMessage(chat sendMessage(chatId, '❌ Transaksi dibatalkan');
        sendMessage(chatId, '❌ Transaksi dibatalkan');
                   sendMessage(chatId, '❌ Transaksi dibatalkan');
        } else {
            sendMessage(chatId, '❌ Transaksi dibatalkan');
        } else {
            } else {
            sendMessage(chatId, '❌ Tidak ada transaksi pending');
        }
        return;
 } else {
            sendMessage(chatId, '❌ Tidak ada transaksi pending');
        }
        return;
Id, '❌ Tidak ada transaksi pending');
        }
        return;
 sendMessage(chatId, '❌ Tidak ada transaksi pending');
        }
        return;
    }
    }
};

// ==========================================
// 🔥 EXPORT
// =    }
};

// ==========================================
// 🔥 EXPORT
// =    }
};

// ==========================================
// 🔥 EXPORT
// =};

// ==========================================
// 🔥 EXPORT
// ==========================================

module=========================================

module.exports = {
    showSewaBotMenu,
    process=========================================

module.exports = {
    showSewaBotMenu,
    process=========================================

module.exports = {
    showSewaBotMenu,
    process.exports = {
    showSewaBotMenu,
    processSewa,
   Sewa,
    handleSewaCallback,
    handleSewaCommand,
    cekSewa,
    getSewa,
    handleSewaCallback,
    handleSewaCommand,
    cekSewa,
    getSewa,
    handleSewaCallback,
    handleSewaCommand,
    cekS handleSewaCallback,
    handleSewaCommand,
   Sewa,
    aktifkanSewaSewa,
    aktifkanSewa,
    pendingSewa,
    checkPaymentByTotal,
ewa,
    getSewa,
    aktifkanSewa,
    pendingSewa,
    checkPaymentByTotal cekSewa,
    getSewa,
    aktifkanSewa,
    pendingSewa,
    check,
    pendingSewa,
    check    generateQRIS
};