// ============================================================
// 🔥 MENU-TOPUP.JS - Topup Saldo dengan Reply Keyboard
// ============================================================

const path = require('path');
const saldo = require('./saldo');

// ==========================================
// 🔥 WARNA — KONSISTEN DENGAN MENU-FIRST.JS
// ==========================================
const COLOR = {
    PRIMARY: 'primary',   // 🔵 BIRU
    SUCCESS: 'success',   // 🟢 HIJAU
    DANGER:  'danger'     // 🔴 MERAH
};

// ==========================================
// 🔥 SESSION
// ==========================================
const sessions = {};

const setSession = (chatId, data) => {
    sessions[String(chatId)] = { ...data, createdAt: Date.now() };
};

const getSession = (chatId) => {
    const s = sessions[String(chatId)];
    if (!s) return null;
    if (Date.now() - s.createdAt > 30 * 60 * 1000) {
        delete sessions[String(chatId)];
        return null;
    }
    return s;
};

const clearSession = (chatId) => {
    delete sessions[String(chatId)];
};

// ==========================================
// 🔥 KEYBOARD — DENGAN STYLE WARNA
// ==========================================

// Keyboard menu topup (nominal)
const TOPUP_KEYBOARD = [
    [
        { text: '💰 Rp10.000', style: COLOR.SUCCESS },
        { text: '💰 Rp20.000', style: COLOR.SUCCESS }
    ],
    [
        { text: '💰 Rp50.000', style: COLOR.SUCCESS },
        { text: '💰 Rp100.000', style: COLOR.SUCCESS }
    ],
    [
        { text: '💰 Rp200.000', style: COLOR.SUCCESS },
        { text: '💰 Rp500.000', style: COLOR.SUCCESS }
    ],
    [
        { text: '✏️ INPUT MANUAL', style: COLOR.PRIMARY }
    ],
    [
        { text: '🔙 KEMBALI KE MENU', style: COLOR.DANGER }
    ]
];

// Keyboard QRIS (setelah generate)
const QRIS_KEYBOARD = [
    [
        { text: '✅ CEK PEMBAYARAN', style: COLOR.SUCCESS }
    ],
    [
        { text: '❌ BATAL', style: COLOR.DANGER }
    ]
];

// Keyboard input manual
const MANUAL_KEYBOARD = [
    [
        { text: '❌ BATAL', style: COLOR.DANGER }
    ]
];

// Keyboard coba lagi (kalau QRIS gagal)
const COBA_LAGI_KEYBOARD = [
    [
        { text: '🔄 COBA LAGI', style: COLOR.PRIMARY }
    ],
    [
        { text: '🔙 KEMBALI KE MENU', style: COLOR.DANGER }
    ]
];

// Keyboard sukses (setelah topup berhasil)
const SUKSES_KEYBOARD = [
    [
        { text: '💰 CEK SALDO', style: COLOR.SUCCESS }
    ],
    [
        { text: '🔙 KEMBALI KE MENU', style: COLOR.DANGER }
    ]
];

// ==========================================
// 🔥 TAMPILKAN MENU TOPUP
// ==========================================
async function showTopupMenu(bot, chatId) {
    // 🔥 HAPUS PESAN LAMA
    try {
        const { lastMessages } = require('./menu');
        if (lastMessages[chatId]) {
            try { await bot.deleteMessage(chatId, lastMessages[chatId]); } catch (e) {}
            delete lastMessages[chatId];
        }
    } catch (e) {}

    const userId = chatId;
    const saldoUser = saldo.getSaldo(userId);

    const content =
`💰 <b>TOPUP SALDO</b>
━━━━━━━━━━━━━━━━━━━━

💳 <b>Saldo Anda:</b> Rp${saldo.formatRupiah(saldoUser)}

━━━━━━━━━━━━━━━━━━━━
📌 <b>Cara Topup:</b>

1️⃣ Pilih nominal di bawah
2️⃣ Scan QRIS yang muncul
3️⃣ Bayar sesuai nominal
4️⃣ Saldo otomatis bertambah

━━━━━━━━━━━━━━━━━━━━
💡 Pilih nominal topup:
`;

    const sent = await bot.sendMessage(chatId, content, {
        parse_mode: 'HTML',
        reply_markup: {
            keyboard: TOPUP_KEYBOARD,
            resize_keyboard: true,
            one_time_keyboard: false
        }
    });

    // 🔥 SIMPAN PESAN TERAKHIR
    if (sent && sent.message_id) {
        try {
            const { lastMessages } = require('./menu');
            lastMessages[chatId] = sent.message_id;
        } catch (e) {}
    }

    setSession(chatId, {
        feature: 'topup',
        status: 'waiting_nominal'
    });

    console.log(`[TOPUP] Menu tampil untuk ${chatId}`);
}

// ==========================================
// 🔥 PROSES TOPUP - GENERATE QRIS
// ==========================================
async function processTopup(bot, chatId, amount) {
    if (!amount || amount < 10000) {
        return bot.sendMessage(chatId, '❌ Minimal topup Rp10.000!', { parse_mode: 'HTML' });
    }
    if (amount > 1000000) {
        return bot.sendMessage(chatId, '❌ Maksimal topup Rp1.000.000!', { parse_mode: 'HTML' });
    }

    const loadingMsg = await bot.sendMessage(chatId,
        `⏳ <b>Generate QRIS untuk Rp${saldo.formatRupiah(amount)}...</b>`,
        { parse_mode: 'HTML' }
    );

    try {
        let result;

        // 🔥 COBA PAKAI payment_gomerch
               // 🔥 PAKAI payment_autogopay
        try {
            const autogopay = require('./payment_autogopay');
            result = await autogopay.generateQRIS(amount, `Topup Saldo - ${saldo.formatRupiah(amount)}`);
        } catch (e) {
            console.log('⚠️ [TOPUP] payment_autogopay gagal:', e.message);
            result = { success: false, error: e.message };
        }

        if (!result.success) {
            try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}

            return bot.sendMessage(chatId,
                `⚠️ <b>QRIS SEDANG MAINTENANCE!</b>\n\n` +
                `📌 Mohon maaf, sistem pembayaran sedang dalam perbaikan.\n\n` +
                `💡 <b>Solusi:</b>\n` +
                `├ Coba beberapa menit lagi\n` +
                `└ Atau hubungi admin untuk topup manual`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        keyboard: COBA_LAGI_KEYBOARD,
                        resize_keyboard: true
                    }
                }
            );
        }

        try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}

        setSession(chatId, {
            feature: 'topup',
            amount,
            transactionId: result.transaction_id || result.transactionId,
            paymentMethod: result.method || 'AUTOGOPAY',
            timestamp: Date.now(),
            status: 'pending_qris',
            qrisMessageId: null
        });

        const caption =
`💰 <b>TOPUP SALDO</b>
━━━━━━━━━━━━━━━━━━━━
💳 <b>Nominal:</b> Rp${saldo.formatRupiah(amount)}

📌 Setelah bayar, klik
<b>✅ CEK PEMBAYARAN</b>
`;

        let sentMsg = null;

        if (result.image_data) {
            const buffer = Buffer.from(result.image_data.split(',')[1], 'base64');
            sentMsg = await bot.sendPhoto(chatId, buffer, {
                caption,
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: QRIS_KEYBOARD,
                    resize_keyboard: true
                }
            });
        } else if (result.qr_url) {
            sentMsg = await bot.sendPhoto(chatId, result.qr_url, {
                caption,
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: QRIS_KEYBOARD,
                    resize_keyboard: true
                }
            });
        } else {
            return bot.sendMessage(chatId,
                `❌ <b>QRIS tidak tersedia!</b>\n\nSilakan hubungi admin untuk topup manual.`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        keyboard: [
                            [{ text: '🔙 KEMBALI KE MENU', style: COLOR.DANGER }]
                        ],
                        resize_keyboard: true
                    }
                }
            );
        }

        if (sentMsg) {
            const s = getSession(chatId);
            if (s) {
                s.qrisMessageId = sentMsg.message_id;
                sessions[String(chatId)] = s;
            }
        }

        startAutoCheck(bot, chatId);

    } catch (error) {
        console.error('❌ [TOPUP] Error:', error.message);
        try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
        await bot.sendMessage(chatId,
            `❌ <b>GAGAL GENERATE QRIS!</b>\n\nError: ${error.message}`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: COBA_LAGI_KEYBOARD,
                    resize_keyboard: true
                }
            }
        );
    }
}

// ==========================================
// 🔥 AUTO CHECK PAYMENT
// ==========================================
function startAutoCheck(bot, chatId) {
    let checkCount = 0;
    const maxChecks = 30;
    const checkInterval = 5000;

    if (!global.autoCheckIntervals) global.autoCheckIntervals = {};
    if (global.autoCheckIntervals[chatId]) {
        clearInterval(global.autoCheckIntervals[chatId]);
    }

    const intervalId = setInterval(async () => {
        checkCount++;
        const session = getSession(chatId);
        if (!session || session.status === 'completed') {
            clearInterval(intervalId);
            delete global.autoCheckIntervals[chatId];
            return;
        }

        try {
            let result = { matched: false };
             try {
                const autogopay = require('./payment_autogopay');
                result = await autogopay.cekStatusWithRetry(session.transactionId, 1);
            } catch (e) {}

            if (result.matched || ['settlement','success','paid'].includes(result.status)) {
                clearInterval(intervalId);
                delete global.autoCheckIntervals[chatId];
                await processTopupSuccess(bot, chatId, session);
                return;
            }

            if (checkCount >= maxChecks) {
                clearInterval(intervalId);
                delete global.autoCheckIntervals[chatId];
                console.log(`⏰ [TOPUP] Auto-check habis untuk ${chatId}`);
            }
        } catch (e) {
            console.log(`⚠️ [TOPUP] Auto-check error: ${e.message}`);
        }
    }, checkInterval);

    global.autoCheckIntervals[chatId] = intervalId;
}

// ==========================================
// 🔥 PROSES TOPUP SUKSES
// ==========================================
async function processTopupSuccess(bot, chatId, session) {
    try {
        const userId = chatId;
        const amount = session.amount;

        if (session.qrisMessageId) {
            try { await bot.deleteMessage(chatId, session.qrisMessageId); } catch (e) {}
        }

        const success = saldo.tambahSaldo(userId, amount);

        if (success) {
            const newSaldo = saldo.getSaldo(userId);
            session.status = 'completed';
            clearSession(chatId);

            await bot.sendMessage(chatId,
                `✅ <b>TOPUP BERHASIL!</b>\n` +
                `━━━━━━━━━━━━━━━━━━━━\n\n` +
                `💰 <b>Jumlah Topup:</b> Rp${saldo.formatRupiah(amount)}\n` +
                `💳 <b>Saldo Baru:</b> Rp${saldo.formatRupiah(newSaldo)}\n` +
                `🆔 <b>Transaksi:</b> ${session.transactionId}\n` +
                `📅 <b>Tanggal:</b> ${new Date().toLocaleString('id-ID')}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `🙏 Terima kasih!\n`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        keyboard: SUKSES_KEYBOARD,
                        resize_keyboard: true
                    }
                }
            );

            // Notif ke owner
            try {
                const config = require('./config');
                await bot.sendMessage(config.BOT.OWNER_ID,
                    `✅ <b>TOPUP BERHASIL</b>\n\n` +
                    `🆔 User: <code>${userId}</code>\n` +
                    `💰 Jumlah: Rp${saldo.formatRupiah(amount)}\n` +
                    `💳 Saldo Baru: Rp${saldo.formatRupiah(newSaldo)}\n` +
                    `🆔 Trx: ${session.transactionId}`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) {}
        }
    } catch (error) {
        console.error('❌ [TOPUP SUCCESS] Error:', error.message);
    }
}

// ==========================================
// 🔥 CEK STATUS MANUAL
// ==========================================
async function checkTopupStatus(bot, chatId) {
    const session = getSession(chatId);
    if (!session || !session.transactionId) {
        return bot.sendMessage(chatId, '❌ Tidak ada transaksi aktif!', { parse_mode: 'HTML' });
    }

    const loadingMsg = await bot.sendMessage(chatId, '⏳ <b>Mengecek pembayaran...</b>', { parse_mode: 'HTML' });

    try {
        let result = { matched: false };
            try {
                const autogopay = require('./payment_autogopay');
                result = await autogopay.cekStatusWithRetry(session.transactionId, 1);
            } catch (e) {}

        try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}

        if (result.matched || ['settlement','success','paid'].includes(result.status)) {
            await processTopupSuccess(bot, chatId, session);
            return true;
        }

        if (result.status === 'pending') {
            await bot.sendMessage(chatId,
                `⏳ <b>PEMBAYARAN BELUM DITERIMA</b>\n\n` +
                `🆔 Trx: ${session.transactionId}\n\n` +
                `Silakan scan QRIS dan lakukan pembayaran.\n` +
                `Klik "✅ CEK PEMBAYARAN" lagi setelah bayar.`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        keyboard: QRIS_KEYBOARD,
                        resize_keyboard: true
                    }
                }
            );
            return false;
        }

        await bot.sendMessage(chatId,
            `❌ <b>PEMBAYARAN GAGAL</b>\n\nStatus: ${result.status || 'error'}`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: COBA_LAGI_KEYBOARD,
                    resize_keyboard: true
                }
            }
        );
        clearSession(chatId);
        return false;

    } catch (error) {
        try { await bot.deleteMessage(chatId, loadingMsg.message_id); } catch (e) {}
        console.error('❌ [TOPUP CHECK] Error:', error.message);
        await bot.sendMessage(chatId, `❌ Error: ${error.message}`, { parse_mode: 'HTML' });
        return false;
    }
}

// ==========================================
// 🔥 HANDLE TOMBOL REPLY
// ==========================================
async function handleTopupButton(bot, chatId, text) {
    const session = getSession(chatId);
    if (!session || session.feature !== 'topup') return false;

    console.log(`[TOPUP] Button: "${text}" dari ${chatId}`);

    // 🔥 Nominal
    const match = text.match(/^💰\s*Rp([\d.]+)$/);
    if (match) {
        const amount = parseInt(match[1].replace(/\./g, ''));
        await processTopup(bot, chatId, amount);
        return true;
    }

    // 🔥 INPUT MANUAL
    if (text === '✏️ INPUT MANUAL') {
        setSession(chatId, {
            feature: 'topup_manual',
            status: 'waiting_amount'
        });
        await bot.sendMessage(chatId,
            `✏️ <b>INPUT MANUAL</b>\n\n` +
            `📌 Kirim nominal topup (angka saja)\n` +
            `📌 Contoh: <code>25000</code> untuk Rp25.000\n` +
            `📌 Minimal: Rp10.000\n` +
            `📌 Maksimal: Rp1.000.000\n\n` +
            `Ketik <b>batal</b> untuk membatalkan.`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: MANUAL_KEYBOARD,
                    resize_keyboard: true
                }
            }
        );
        return true;
    }

    // 🔥 CEK PEMBAYARAN
    if (text === '✅ CEK PEMBAYARAN') {
        await checkTopupStatus(bot, chatId);
        return true;
    }

    // 🔥 BATAL
        // 🔥 BATAL
        // 🔥 BATAL — balik ke menu topup
    if (text === '❌ BATAL') {
        if (session.qrisMessageId) {
            try { await bot.deleteMessage(chatId, session.qrisMessageId); } catch (e) {}
        }
        clearSession(chatId);
        if (global.autoCheckIntervals?.[chatId]) {
            clearInterval(global.autoCheckIntervals[chatId]);
            delete global.autoCheckIntervals[chatId];
        }
        // 🔥 BALIK KE MENU TOPUP
        await showTopupMenu(bot, chatId);
        return true;
    }

    // 🔥 COBA LAGI
    if (text === '🔄 COBA LAGI') {
        await showTopupMenu(bot, chatId);
        return true;
    }

    // 🔥 CEK SALDO
    if (text === '💰 CEK SALDO') {
        const s = saldo.getSaldo(chatId);
        await bot.sendMessage(chatId,
            `💰 <b>SALDO ANDA</b>\n\n💳 Rp${saldo.formatRupiah(s)}`,
            { parse_mode: 'HTML' }
        );
        return true;
    }

    // 🔥 KEMBALI KE MENU
        // 🔥 KEMBALI KE MENU
    if (text === '🔙 KEMBALI KE MENU') {
        console.log(`[TOPUP] Kembali ke menu utama untuk ${chatId}`);
        clearSession(chatId);
        if (global.autoCheckIntervals?.[chatId]) {
            clearInterval(global.autoCheckIntervals[chatId]);
            delete global.autoCheckIntervals[chatId];
        }
        // 🔥 LANGSUNG TAMPILKAN MENU UTAMA
        const menuFirst = require('./menu-first');
        const users = require('./menu-first');  // fallback
        // Ambil users dari index.js secara global
        const allUsers = global.usersData || {};
        await menuFirst.showMainMenu(bot, chatId, false, allUsers);
        return { handled: true, action: 'BACK_TO_MAIN' };
    }

    return false;
}

// ==========================================
// 🔥 HANDLE MANUAL INPUT
// ==========================================
async function handleManualInput(bot, chatId, text) {
    const session = getSession(chatId);
    if (!session || session.feature !== 'topup_manual') return false;

       if (text.toLowerCase() === 'batal' || text === '❌ BATAL') {
        clearSession(chatId);
        // 🔥 BALIK KE MENU TOPUP
        await showTopupMenu(bot, chatId);
        return true;
    }

    const amount = parseInt(text.replace(/[^0-9]/g, ''));
    if (isNaN(amount) || amount < 10000) {
        await bot.sendMessage(chatId, '❌ Minimal topup Rp10.000!', { parse_mode: 'HTML' });
        return true;
    }
    if (amount > 1000000) {
        await bot.sendMessage(chatId, '❌ Maksimal topup Rp1.000.000!', { parse_mode: 'HTML' });
        return true;
    }

    clearSession(chatId);
    await bot.sendMessage(chatId, '🔄', { reply_markup: { remove_keyboard: true } });
    await processTopup(bot, chatId, amount);
    return true;
}

// ==========================================
// 🔥 EXPORT
// ==========================================
module.exports = {
    showTopupMenu,
    handleTopupButton,
    handleManualInput,
    getSession,
    clearSession,
    getSaldo: saldo.getSaldo,
    tambahSaldo: saldo.tambahSaldo,
    formatRupiah: saldo.formatRupiah
};