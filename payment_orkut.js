// ==========================================
// 🔥 MENU SEWA BOT (PAKE ORKUT API)
// ==========================================

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const orkut = require('./payment_orkut');

// ==========================================
// 🔥 AMBIL CONFIG
// ==========================================

const TOPUP_CONFIG = config.TOPUP || { CHECK_INTERVAL: 10000, MAX_CHECKS: 60, EXPIRY_MINUTES: 10 };

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
💳 Pembayaran via QRIS (ORKUT)
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
// 🔥 PROSES SEWA (PAKE ORKUT)
// ==========================================

const processSewa = async (chatId, duration, price, days, bot, sendMessage, sendNewMessage) => {
    try {
        const currentSewa = getSewa(chatId);
        if (currentSewa && currentSewa.active) {
            const now = Date.now();
            if (now < currentSewa.expired) {
                const sisaHari = Math.ceil((currentSewa.expired - now) / (1000 * 60 * 60 * 24));
                return sendMessage(chatId, 
                    `⚠️ *Kamu masih punya sewa aktif!*\n\n` +
                    `📦 ${currentSewa.duration}\n` +
                    `⏳ Sisa ${sisaHari} hari\n\n` +
                    `Tunggu sampai habis atau /batalkan.`,
                    { parse_mode: 'Markdown' }
                );
            }
        }

        if (pendingSewa[chatId]) {
            const trx = pendingSewa[chatId];
            if (Date.now() < trx.expiry) {
                const sisa = Math.ceil((trx.expiry - Date.now()) / 1000 / 60);
                return sendMessage(chatId, 
                    `⚠️ *Ada transaksi pending!*\n` +
                    `📦 ${trx.duration}\n` +
                    `💰 Rp${trx.amount}\n` +
                    `⏳ Sisa ${sisa} menit\n\n` +
                    `Tunggu selesai atau /batalkan`,
                    { parse_mode: 'Markdown' }
                );
            }
            delete pendingSewa[chatId];
        }

        // 🔥 GENERATE QRIS PAKE ORKUT
        const qris = await orkut.generateQRIS(price, `Sewa ${duration}`);
        if (!qris.success) {
            console.log('❌ QRIS Error:', qris.error || qris.message);
            return sendMessage(chatId, 
                `❌ Gagal generate QRIS: ${qris.error || qris.message || 'Coba lagi'}`,
                { parse_mode: 'Markdown' }
            );
        }

        console.log('✅ QRIS Generated:', qris);

        pendingSewa[chatId] = {
            duration: duration,
            days: days,
            price: price,
            amount: qris.amount || price,
            transaction_id: qris.transaction_id || qris.reference,
            expiry: qris.expiry || Date.now() + 900000,
            created_at: qris.created_at || Date.now(),
        };

        const caption = `
🤖 *SEWA BOT*

📦 Paket: ${duration}
💰 Total: Rp${qris.amount || price}
🆔 ID: ${qris.transaction_id || qris.reference}

⏳ Expired: 10 menit

📌 Scan QR di bawah untuk bayar
💡 Bayar sesuai total (Rp${qris.amount || price})

✅ Setelah bayar, bot akan aktif otomatis!
`;

        // 🔥 KIRIM QRIS
        await sendNewMessage(
            chatId, 
            caption, 
            {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔄 CEK PEMBAYARAN", callback_data: "ceksewa" }],
                        [{ text: "❌ BATALKAN", callback_data: "batalkan_sewa" }]
                    ]
                }
            }, 
            null,
            qris.qr_url || qris.image_data
        );

        startSewaChecker(chatId, bot, sendMessage);

    } catch (error) {
        console.error('Sewa error:', error);
        sendMessage(chatId, '❌ Gagal memproses sewa.');
    }
};

// ==========================================
// 🔥 CHECKER SEWA (PAKE ORKUT)
// ==========================================

const startSewaChecker = (chatId, bot, sendMessage) => {
    let checkCount = 0;
    const maxChecks = TOPUP_CONFIG.MAX_CHECKS || 60;
    
    const interval = setInterval(async () => {
        checkCount++;
        const trx = pendingSewa[chatId];
        if (!trx) { clearInterval(interval); return; }
        
        if (Date.now() > trx.expiry) {
            clearInterval(interval);
            delete pendingSewa[chatId];
            sendMessage(chatId, '⏰ QRIS Expired! Silahkan sewa ulang.');
            return;
        }
        
        try {
            // 🔥 CEK STATUS PAKE ORKUT
            const result = await orkut.checkQRISStatus(trx.transaction_id);
            console.log('📊 [CHECK] Result:', result);
            
            if (result.success && result.matched) {
                clearInterval(interval);
                const sewa = aktifkanSewa(chatId, trx.duration, trx.days);
                delete pendingSewa[chatId];
                
                sendMessage(chatId, 
                    `✅ *SEWA BERHASIL!*\n\n` +
                    `🤖 Paket: ${trx.duration}\n` +
                    `📅 Mulai: ${sewa.start_date}\n` +
                    `📅 Berakhir: ${sewa.expired_date}\n\n` +
                    `🎉 Selamat bot sudah aktif!\n` +
                    `Gunakan /ceksewa untuk cek status.`,
                    { parse_mode: 'Markdown' }
                );
                
                notifyOwner(bot, 
                    `✅ SEWA BERHASIL\n` +
                    `👤 User: ${chatId}\n` +
                    `📦 Paket: ${trx.duration}\n` +
                    `💰 Harga: Rp${trx.price}\n` +
                    `📅 Berakhir: ${new Date(sewa.expired).toLocaleDateString('id-ID')}`
                );
            }
        } catch (error) {
            console.error('Check error:', error);
        }
        
        if (checkCount >= maxChecks) {
            clearInterval(interval);
            sendMessage(chatId, '⏰ Waktu cek habis. Cek manual dengan /ceksewa');
        }
    }, TOPUP_CONFIG.CHECK_INTERVAL || 10000);
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
    if (now >= sewa.expired) {
        return sendMessage(chatId, 
            `⏰ *Sewa sudah EXPIRED*\n\n` +
            `📦 ${sewa.duration}\n` +
            `📅 Berakhir: ${sewa.expired_date}\n\n` +
            `Gunakan /sewa untuk perpanjang.`,
            { parse_mode: 'Markdown' }
        );
    }
    
    const sisaMs = sewa.expired - now;
    const sisaHari = Math.ceil(sisaMs / (1000 * 60 * 60 * 24));
    const sisaJam = Math.floor((sisaMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return sendMessage(chatId, 
        `✅ *Status Sewa Aktif*\n\n` +
        `📦 Paket: ${sewa.duration}\n` +
        `📅 Mulai: ${sewa.start_date}\n` +
        `📅 Berakhir: ${sewa.expired_date}\n` +
        `⏳ Sisa: ${sisaHari} hari ${sisaJam} jam\n\n` +
        `💡 Sewa baru: /sewa`,
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
    
    const match = text.match(/^\/sewa\s+(1minggu|2minggu|1bulan|2bulan|6bulan|1tahun)$/i);
    if (match) {
        const duration = match[1].toLowerCase();
        const priceMap = {
            '1minggu': { price: 10000, days: 7, label: '1 Minggu' },
            '2minggu': { price: 15000, days: 14, label: '2 Minggu' },
            '1bulan': { price: 25000, days: 30, label: '1 Bulan' },
            '2bulan': { price: 45000, days: 60, label: '2 Bulan' },
            '6bulan': { price: 120000, days: 180, label: '6 Bulan' },
            '1tahun': { price: 200000, days: 365, label: '1 Tahun' }
        };
        const info = priceMap[duration];
        await processSewa(chatId, info.label, info.price, info.days, bot, sendMessage, sendNewMessage);
        return;
    }
    
    if (text === '/ceksewa') {
        await cekSewa(chatId, sendMessage);
        return;
    }
    
    if (text === '/batalkan') {
        if (pendingSewa[chatId]) {
            delete pendingSewa[chatId];
            sendMessage(chatId, '❌ Transaksi dibatalkan');
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
    
    if (data.startsWith('sewa_')) {
        const duration = data.replace('sewa_', '');
        const priceMap = {
            '1minggu': { price: 10000, days: 7, label: '1 Minggu' },
            '2minggu': { price: 15000, days: 14, label: '2 Minggu' },
            '1bulan': { price: 25000, days: 30, label: '1 Bulan' },
            '2bulan': { price: 45000, days: 60, label: '2 Bulan' },
            '6bulan': { price: 120000, days: 180, label: '6 Bulan' },
            '1tahun': { price: 200000, days: 365, label: '1 Tahun' }
        };
        const info = priceMap[duration];
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
            sendMessage(chatId, '❌ Tidak ada transaksi pending');
            return true;
        }
        
        const result = await orkut.checkQRISStatus(trx.transaction_id);
        if (result.success && result.matched) {
            const sewa = aktifkanSewa(chatId, trx.duration, trx.days);
            delete pendingSewa[chatId];
            sendMessage(chatId, 
                `✅ *SEWA BERHASIL!*\n\n` +
                `🤖 Paket: ${trx.duration}\n` +
                `📅 Berakhir: ${new Date(sewa.expired).toLocaleDateString('id-ID')}\n\n` +
                `🎉 Selamat bot sudah aktif!`,
                { parse_mode: 'Markdown' }
            );
            notifyOwner(bot, `✅ SEWA\n👤 ${chatId}\n📦 ${trx.duration}\n💰 Rp${trx.price}`);
        } else {
            sendMessage(chatId, '⏳ Masih pending. Pastikan sudah bayar sesuai total.');
        }
        return true;
    }
    
    if (data === 'batalkan_sewa') {
        delete pendingSewa[chatId];
        sendMessage(chatId, '❌ Transaksi dibatalkan');
        return true;
    }
    
    return false;
};

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
};