const pairingMode = {};
const axios = require('axios');

// ==========================================
// 🔥 SHOW WHATSAPP MENU - DENGAN QR PAIRING
// ==========================================

const showWhatsAppMenu = async (chatId, sendNewMessage, bot = null, sendNewMessageWithCleanup = null) => {

    const content = `<b>WHATSAPP CONTROL</b>

📱 Status WA Bot
 └─ Cek status & koneksi bot
🔑 Pairing WhatsApp
 └─ Hubungkan nomor WhatsApp (via kode)
📸 PAIRING QR DI SINI
 └─ Dapatkan QR Code untuk pairing via scan
🔄 Reset Session
 └─ Reset sesi WhatsApp
🔧 Repair WA
 └─ Perbaiki koneksi WhatsApp
♻️ Restart WA Bot
 └─ Restart layanan WhatsApp
📋 Logs WA Bot
 └─ Lihat log aktivitas bot
📢 Broadcast WA
 └─ Kirim pesan ke pengguna`;

    const replyButtons = {
        keyboard: [
            [
                { text: "📱 STATUS WA", style: "success" },
                { text: "🔑 PAIRING", style: "primary" }
            ],
            [
                { text: "📸 PAIRING QR DI SINI", style: "primary" }
            ],
            [
                { text: "🔄 RESET SESSION", style: "danger" },
                { text: "🔧 REPAIR WA", style: "primary" }
            ],
            [
                { text: "♻️ RESTART WA", style: "danger" },
                { text: "📋 LOGS WA", style: "success" }
            ],
            [
                { text: "📢 BROADCAST WA", style: "primary" }
            ],
            [
                { text: "🔙 MENU", style: "danger" }
            ]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    };

    const sent = await bot.sendMessage(chatId, content, {
        parse_mode: "HTML",
        reply_markup: replyButtons
    });
    
    if (!global.menuMessageIds) global.menuMessageIds = {};
    global.menuMessageIds[chatId] = sent.message_id;
    console.log('✅ [WA Menu] Text terkirim!');
};

// ==========================================
// 🔥 SHOW PAIRING MENU (PAIRING CODE)
// ==========================================

const showPairingMenu = async (chatId, sendNewMessage, bot = null, sendNewMessageWithCleanup = null) => {

    pairingMode[chatId] = true;
    console.log(`🔑 [PAIRING] Mode aktif untuk ${chatId}`);
    
    setTimeout(() => {
        delete pairingMode[chatId];
        console.log(`⏰ [PAIRING] Mode timeout untuk ${chatId}`);
    }, 300000);

    const content = `🔑 <b>PAIRING WHATSAPP (KODE)</b>

📱 Kirim <b>langsung nomor WhatsApp</b> Anda di bawah ini:

<b>Format:</b> 628xxxxxxxxxx
<b>Contoh:</b> 6285943111681

⚠️ Pastikan WA Bot berjalan di port 3006

📱 Setelah pairing, WA Bot akan otomatis terhubung.`;

    const replyButtons = {
        keyboard: [
            [
                { text: "📱 STATUS WA", style: "success" }
            ],
            [
                { text: "📸 PAIRING QR DI SINI", style: "primary" },
                { text: "🔙 WHATSAPP", style: "danger" }
            ],
            [
                { text: "🔙 MENU", style: "danger" }
            ]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    };

    const sent = await bot.sendMessage(chatId, content, {
        parse_mode: "HTML",
        reply_markup: replyButtons
    });
    if (!global.menuMessageIds) global.menuMessageIds = {};
    global.menuMessageIds[chatId] = sent.message_id;
};

// ==========================================
// 🔥 SHOW QR PAIRING MENU - KIRIM QR KE TELEGRAM
// 🔥 PORT SUDAH DIGANTI 3005 → 3006
// ==========================================

let _qrSentToTelegram = {};

const showQRPairingMenu = async (chatId, sendNewMessage, bot = null, sendNewMessageWithCleanup = null) => {

    console.log(`📸 [QR PAIRING] Request QR untuk ${chatId}`);
    
    // 🔥 CEK APAKAH SEDANG PROSES
    if (_qrSentToTelegram[chatId]) {
        console.log(`⏳ [QR PAIRING] Sedang proses untuk ${chatId}, skip`);
        await bot.sendMessage(chatId, 
            `⏳ *Sedang diproses...*`,
            { parse_mode: 'Markdown' }
        );
        return;
    }
    
    // 🔥 SET FLAG PROSES
    _qrSentToTelegram[chatId] = true;
    
    let loadingMsg = null;
    
    try {
        // 🔥 1. Kirim pesan loading
        loadingMsg = await bot.sendMessage(chatId, 
            `⏳ *Mengambil QR Code...*`,
            { parse_mode: 'Markdown' }
        );
        
        // 🔥 2. Minta WA Bot untuk refresh QR — PORT 3006 (FIX)
        try {
            await axios.post('http://localhost:3006/refresh-qr', {}, { timeout: 5000 });
            console.log(`📸 [QR PAIRING] QR refresh requested`);
        } catch (refreshErr) {
            console.log(`⚠️ [QR PAIRING] Refresh gagal (mungkin belum perlu): ${refreshErr.message}`);
        }
        
        // 🔥 3. Tunggu QR tergenerate
        await new Promise(r => setTimeout(r, 5000));
        
        // 🔥 4. Ambil QR dari WA Bot — PORT 3006 (FIX)
        const response = await axios.get('http://localhost:3006/qr-base64', { timeout: 10000 });
        
        // 🔥 5. Hapus loading
        try { 
            await bot.deleteMessage(chatId, loadingMsg.message_id); 
        } catch (e) {}
        
        if (response.data.success && response.data.qr) {
            
            // 🔥 6. KIRIM QR KE TELEGRAM
            await bot.sendPhoto(chatId, Buffer.from(response.data.qr, 'base64'), {
                caption: `📸 *QR CODE PAIRING WHATSAPP*

📲 *CARA PAIRING:*
1️⃣ Buka WhatsApp di HP
2️⃣ Pergi ke *Pengaturan* > *Perangkat Tertaut*
3️⃣ Pilih *Tautkan Perangkat*
4️⃣ Scan QR Code di atas

⚠️ *JANGAN BAGIKAN QR CODE INI!*`,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🔄 Refresh", callback_data: `refresh_qr_${chatId}` }],
                        [{ text: "❌ Batal", callback_data: `batal_qr_${chatId}` }]
                    ]
                }
            });
            
            console.log(`✅ [QR PAIRING] QR terkirim ke ${chatId}`);
            
        } else {
            // 🔥 QR belum tersedia
            await bot.sendMessage(chatId, 
                `❌ QR Code belum tersedia. Tunggu 10 detik, lalu klik lagi.`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [
                            [{ text: "📸 PAIRING QR DI SINI", style: "primary" }],
                            [{ text: "🔙 WHATSAPP", style: "danger" }],
                            [{ text: "🔙 MENU", style: "danger" }]
                        ],
                        resize_keyboard: true
                    }
                }
            );
        }
        
    } catch (error) {
        console.log(`❌ [QR PAIRING] Error:`, error.message);
        
        try { 
            if (loadingMsg) await bot.deleteMessage(chatId, loadingMsg.message_id); 
        } catch (e) {}
        
        let errorMsg = `❌ Gagal ambil QR.\n\n`;
        
        if (error.code === 'ECONNREFUSED') {
            errorMsg += `WA Bot tidak berjalan.\nFix: pm2 restart wabot`;
        } else if (error.response?.status === 404) {
            errorMsg += `Endpoint WA Bot tidak ditemukan.\nPastikan port 3006 aktif.\nFix: pm2 restart wabot`;
        } else {
            errorMsg += `Error: ${error.message}`;
        }
        
        await bot.sendMessage(chatId, errorMsg, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: "📸 PAIRING QR DI SINI", style: "primary" }],
                    [{ text: "🔙 WHATSAPP", style: "danger" }],
                    [{ text: "🔙 MENU", style: "danger" }]
                ],
                resize_keyboard: true
            }
        });
    } finally {
        // 🔥 RESET FLAG SETELAH 30 DETIK
        setTimeout(() => {
            delete _qrSentToTelegram[chatId];
            console.log(`🔄 [QR PAIRING] Flag reset untuk ${chatId}`);
        }, 30000);
    }
};

// ==========================================
// 🔥 SHOW BROADCAST MENU
// ==========================================

const showBroadcastWAMenu = async (chatId, sendNewMessage, bot = null, sendNewMessageWithCleanup = null) => {

    const content = `📢 <b>BROADCAST WHATSAPP</b>

Kirim pesan broadcast ke semua kontak WhatsApp:

/broadcastwa <pesan>

Contoh: /broadcastwa Promo spesial hari ini!

⚠️ Pastikan WA Bot terhubung`;

    const replyButtons = {
        keyboard: [
            [
                { text: "📱 STATUS WA", style: "success" }
            ],
            [
                { text: "📸 PAIRING QR DI SINI", style: "primary" },
                { text: "🔙 WHATSAPP", style: "danger" }
            ],
            [
                { text: "🔙 MENU", style: "danger" }
            ]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    };

    const sent = await bot.sendMessage(chatId, content, {
        parse_mode: "HTML",
        reply_markup: replyButtons
    });
    if (!global.menuMessageIds) global.menuMessageIds = {};
    global.menuMessageIds[chatId] = sent.message_id;
};

// ==========================================
// 🔥 EXPORT
// ==========================================

module.exports = {
    showWhatsAppMenu,
    showPairingMenu,
    showQRPairingMenu,
    showBroadcastWAMenu,
    pairingMode
};