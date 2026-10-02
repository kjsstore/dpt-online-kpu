// ============================================================
// MENU-FIRST.JS - Menu pertama + Menu utama (REPLY KEYBOARD)
// 🔥 Update: Pakai BANNER JPG
// ============================================================

const fs = require('fs');
const path = require('path');
const saldo = require('./saldo');

// ==========================================
// 🔥 BANNER URL — GANTI SAMA LINK JPG KAMU
// ==========================================
const BANNER_URL = 'https://files.catbox.moe/t7zmak.png'; // ← ganti link ini
const BANNER_URL_PROFILE = 'https://files.catbox.moe/t7zmak.png'; // ← ganti link ini

// 🔥 WARNA
const COLOR = {
    PRIMARY: 'primary',
    SUCCESS: 'success',
    DANGER:  'danger'
};

// ==========================================
// LOAD USERS
// ==========================================
const loadUsers = () => {
    try {
        const file = path.join(__dirname, 'users.json');
        if (!fs.existsSync(file)) return {};
        const raw = fs.readFileSync(file, 'utf8').trim();
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (err) {
        console.log('Load users error:', err.message);
        return {};
    }
};

// ==========================================
// SIMPAN PESAN
// ==========================================
const lastFirstMsg = {};
const lastMainMsg = {};

const deleteFirstMsg = async (bot, chatId) => {
    if (lastFirstMsg[chatId]) {
        try { await bot.deleteMessage(chatId, lastFirstMsg[chatId]); } catch (e) {}
        delete lastFirstMsg[chatId];
    }
};

const deleteMainMsg = async (bot, chatId) => {
    if (lastMainMsg[chatId]) {
        try { await bot.deleteMessage(chatId, lastMainMsg[chatId]); } catch (e) {}
        delete lastMainMsg[chatId];
    }
};

// ==========================================
// KEYBOARD
// ==========================================
const FIRST_KEYBOARD = [
    [{ text: '⋪ MENU ⋫', style: COLOR.SUCCESS }]
];

const MAIN_KEYBOARD_USER = [
    [{ text: '⋪ 𝗣𝗥𝗢𝗙𝗜𝗟 ⋫', style: COLOR.DANGER }],
    [
        { text: '⋪ 𝗖𝗘𝗞 𝗗𝗣𝗧 𝗩𝟭 ⋫', style: COLOR.SUCCESS },
        { text: '⋪ 𝗖𝗘𝗞 𝗗𝗣𝗧 𝗩𝟮 ⋫', style: COLOR.PRIMARY }
    ],
    [
        { text: '⋪ 𝗧𝗢𝗣𝗨𝗣 ⋫', style: COLOR.PRIMARY }
    ],
    [{ text: '♲ 𝗥𝗘𝗙𝗥𝗘𝗦𝗛 ♲', style: COLOR.DANGER }]
];

const MAIN_KEYBOARD_OWNER = [
    [{ text: '⋪ 𝗣𝗥𝗢𝗙𝗜𝗟 ⋫', style: COLOR.DANGER }],
    [
        { text: '⋪ 𝗖𝗘𝗞 𝗗𝗣𝗧 𝗩𝟭 ⋫', style: COLOR.SUCCESS },
        { text: '⋪ 𝗖𝗘𝗞 𝗗𝗣𝗧 𝗩𝟮 ⋫', style: COLOR.PRIMARY }
    ],
    [
        { text: '⋪ 𝗧𝗢𝗣𝗨𝗣 ⋫', style: COLOR.PRIMARY }
    ],
    [
        { text: '⋪ 𝗦𝗘𝗧𝗧𝗜𝗡𝗚 ⋫', style: COLOR.DANGER },
        { text: '⋪ 𝗠𝗘𝗡𝗨 𝗪𝗔 ⋫', style: COLOR.SUCCESS }
    ],
    [{ text: '♲ 𝗥𝗘𝗙𝗥𝗘𝗦𝗛 ♲', style: COLOR.DANGER }]
];

// ==========================================
// SHOW MENU-FIRST (PAKAI BANNER)
// ==========================================
const showFirstMenu = async (bot, chatId, msg = null) => {
    try {
        const { lastMessages } = require('./menu');

        if (lastMessages[chatId]) {
            try { await bot.deleteMessage(chatId, lastMessages[chatId]); } catch (e) {}
            delete lastMessages[chatId];
        }
        await deleteFirstMsg(bot, chatId);
        await deleteMainMsg(bot, chatId);

        let username = chatId;
        const users = loadUsers();
        if (users[chatId]) {
            username = users[chatId].username || users[chatId].first_name || chatId;
        }
        if (msg && msg.from) {
            username = msg.from.username || msg.from.first_name || username;
        }

        const caption = `
◉ |  𝘾𝙚𝙠_𝘽𝙔-𝙕𝙊𝙍𝙊
━━━━━━━━━━━━━━━━━━━━━━━━━━━⩥
┏┅➤  S E L A M A T   D A T A N G
┋
┋  👋 Halo, <b>@${username}</b>!
┋
┋  📌 Bot ini untuk <b>Cek DPT ONLINE KPU</b>
┋     Silakan kirim file Excel berisi NIK,
┋     bot akan cek otomatis satu per satu.
┋
┋  🔍 Fitur:
┋  ├ 📄 Cek DPT Online KPU
┋  ├ 📊 Export hasil ke Excel
┋  └ 💰 Topup saldo
┋
┗┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅⚼

📌 Klik <b>⋪ MENU ⋫</b> untuk membuka menu utama

◉  2026 - 2027 | All Rights Reserved
`;

        // 🔥 PAKAI sendPhoto (BANNER + CAPTION)
        let sent;
        try {
            sent = await bot.sendPhoto(chatId, BANNER_URL, {
                caption: caption,
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: FIRST_KEYBOARD,
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        } catch (photoErr) {
            console.log(`⚠️ [MENU-FIRST] Gagal kirim banner: ${photoErr.message}`);
            // 🔥 FALLBACK: kirim text aja kalau banner gagal
            sent = await bot.sendMessage(chatId, caption, {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: FIRST_KEYBOARD,
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        }

        if (sent && sent.message_id) {
            lastFirstMsg[chatId] = sent.message_id;
            lastMessages[chatId] = sent.message_id;
        }

        console.log(`[MENU-FIRST] Tampil untuk ${chatId}`);
        return sent;

    } catch (err) {
        console.log(`[MENU-FIRST] Error:`, err.message);
        return null;
    }
};

// ==========================================
// SHOW MENU UTAMA (PAKAI BANNER)
// ==========================================
const showMainMenu = async (bot, chatId, isAuthorizedUser = false, users = {}) => {
    try {
        const { lastMessages } = require('./menu');

        if (lastMessages[chatId]) {
            try { await bot.deleteMessage(chatId, lastMessages[chatId]); } catch (e) {}
            delete lastMessages[chatId];
        }
        await deleteFirstMsg(bot, chatId);
        await deleteMainMsg(bot, chatId);

        const baseUser = 1;
        const totalUser = baseUser + Object.keys(users || {}).length;

        let username = chatId;
        if (users && users[chatId]) {
            username = users[chatId].username || users[chatId].first_name || chatId;
        }

        // 🔥 AMBIL SALDO USER
        let saldoUser = saldo.getSaldo(chatId);
        if (isAuthorizedUser) saldoUser = 1000000000;

        const caption = `
◉ |  𝘾𝙚𝙠_𝘽𝙔-𝙕𝙊𝙍𝙊
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━⩥
┏┅➤  U S E R   I N F O
┋
┋  〄 Username  : @${username} ${isAuthorizedUser ? '👑' : ''}
┋  〄 User ID   : ${chatId}
┋  〄 Total User : ${totalUser}
┋  〄 Status Bot : ACTIVE
┋  〄 Saldo     : Rp${saldo.formatRupiah(saldoUser)}
┋
┗┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅⚼

◉  2026 - 2027 | 𝘈𝘭𝘭 𝘙𝘪𝘨𝘩𝘵𝘴 𝘙𝘦𝘴𝘦𝘳𝘷𝘦𝘥
`;

        // 🔥 PILIH KEYBOARD
        const keyboard = isAuthorizedUser ? MAIN_KEYBOARD_OWNER : MAIN_KEYBOARD_USER;

        // 🔥 PAKAI sendPhoto
        let sent;
        try {
            sent = await bot.sendPhoto(chatId, BANNER_URL, {
                caption: caption,
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: keyboard,
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        } catch (photoErr) {
            console.log(`⚠️ [MENU-FIRST] Gagal kirim banner: ${photoErr.message}`);
            // 🔥 FALLBACK
            sent = await bot.sendMessage(chatId, caption, {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: keyboard,
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        }

        if (sent && sent.message_id) {
            lastMainMsg[chatId] = sent.message_id;
            lastMessages[chatId] = sent.message_id;
        }

        console.log(`[MENU-FIRST] Menu utama tampil untuk ${chatId}`);
        return sent;

    } catch (err) {
        console.log(`[MENU-FIRST] Error showMainMenu:`, err.message);
        return null;
    }
};

// ==========================================
// SHOW PROFIL MENU (PAKAI BANNER)
// ==========================================
const showProfilMenu = async (bot, chatId, sendNewMessage = null) => {
    try {
        const { lastMessages } = require('./menu');
        if (lastMessages[chatId]) {
            try { await bot.deleteMessage(chatId, lastMessages[chatId]); } catch (e) {}
            delete lastMessages[chatId];
        }
        await deleteFirstMsg(bot, chatId);
        await deleteMainMsg(bot, chatId);

        const users = loadUsers();
        const userData = users[chatId] || {};

        const username = userData.username || userData.first_name || '-';
        const joinDate = userData.date
            ? new Date(userData.date).toLocaleDateString('id-ID', {
                day: 'numeric', month: 'long', year: 'numeric'
            })
            : '-';

        // 🔥 CEK STATUS
        const config = require('./config');
        const ownerId = config.BOT.OWNER_ID.toString();
        let statusText = 'User Biasa';
        let statusEmoji = '👤';

        if (chatId.toString() === ownerId) {
            statusText = 'Owner';
            statusEmoji = '👑';
        } else {
            try {
                const adminsFile = path.join(__dirname, 'admins.json');
                if (fs.existsSync(adminsFile)) {
                    const adminsData = JSON.parse(fs.readFileSync(adminsFile, 'utf8'));
                    const admins = adminsData.admins || [];
                    if (admins.includes(chatId.toString())) {
                        statusText = 'Admin';
                        statusEmoji = '⭐';
                    }
                }
            } catch (e) {}
        }

        // 🔥 AMBIL SALDO
        let saldoUser = saldo.getSaldo(chatId);
        if (chatId.toString() === ownerId) {
            saldoUser = 1000000000;
        }

        const caption = `
╭ ───┈ " 👤 " ── ⬦ ׁ
├  <b>PROFIL USER</b>
╰─┈꯭─꯭──꯭─꯭─꯭──꯭─╌─꯭─꯭─꯭─꯭──꯭──꯭

🆔 <b>ID</b>         : <code>${chatId}</code>
👤 <b>Username</b>   : @${username}
${statusEmoji} <b>Status</b>     : ${statusText}
📅 <b>Bergabung</b>  : ${joinDate}
⚡ <b>Status Bot</b> : ✅ACTIVE
━━━━━━━━━━━━━━━━━━
💰 <b>SALDO</b> Rp : ${saldo.formatRupiah(saldoUser)}
━━━━━━━━━━━━━━━━━━
`;

        // 🔥 PAKAI sendPhoto
        let sent;
        try {
            sent = await bot.sendPhoto(chatId, BANNER_URL_PROFILE, {
                caption: caption,
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: FIRST_KEYBOARD,
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        } catch (photoErr) {
            console.log(`⚠️ [MENU-FIRST] Gagal kirim banner profil: ${photoErr.message}`);
            sent = await bot.sendMessage(chatId, caption, {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: FIRST_KEYBOARD,
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            });
        }

        if (sent && sent.message_id) {
            lastMessages[chatId] = sent.message_id;
            lastFirstMsg[chatId] = sent.message_id;
        }

        console.log(`[MENU-FIRST] Profil tampil untuk ${chatId}`);
        return true;

    } catch (err) {
        console.log(`[MENU-FIRST] Error showProfilMenu:`, err.message);
        return false;
    }
};

// ==========================================
// HANDLE TOMBOL
// ==========================================
const handleFirstMenuButton = async (bot, chatId, text, msg = null, isAuthorizedUser = false, users = {}) => {
    // 🔥 MENU
    if (text === '⋪ MENU ⋫' || text === 'MENU') {
        console.log(`[MENU-FIRST] Buka menu utama: ${chatId}`);
        await showMainMenu(bot, chatId, isAuthorizedUser, users);
        return { handled: true, action: 'OPEN_MAIN_MENU' };
    }
    
        // 🔥 TOMBOL BATAL
    if (text === '⋪ ❌ 𝗕𝗔𝗧𝗔𝗟 ⋫' || text === '❌ BATAL') {
        console.log(`[MENU-FIRST] Batal: ${chatId}`);

        if (global.cekdptMode) delete global.cekdptMode[chatId];
        if (global.cekdptWaitingNik) delete global.cekdptWaitingNik[chatId];

        await bot.sendMessage(chatId,
            `❌ *DIBATALKAN*\n\nSilakan pilih menu lagi.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [[{ text: '⋪ MENU ⋫', style: COLOR.SUCCESS }]],
                    resize_keyboard: true,
                    one_time_keyboard: false
                }
            }
        );
        return { handled: true, action: 'BATAL' };
    }

    // 🔥 TOMBOL KEMBALI KE MENU
    if (text === '⋪ 🔙 𝗞𝗘𝗠𝗕𝗔𝗟𝗜 𝗞𝗘 𝗠𝗘𝗡𝗨 ⋫' || text === '🔙 KEMBALI KE MENU') {
        console.log(`[MENU-FIRST] Kembali ke menu: ${chatId}`);

        if (global.cekdptMode) delete global.cekdptMode[chatId];
        if (global.cekdptWaitingNik) delete global.cekdptWaitingNik[chatId];

        await showMainMenu(bot, chatId, isAuthorizedUser, users);
        return { handled: true, action: 'BACK_TO_MENU' };
    }

    // 🔥 REFRESH
    if (text === '♲ 𝗥𝗘𝗙𝗥𝗘𝗦𝗛 ♲' || text === '♲ REFRESH') {
        console.log(`[MENU-FIRST] Refresh: ${chatId}`);
        await showMainMenu(bot, chatId, isAuthorizedUser, users);
        return { handled: true, action: 'REFRESH' };
    }

    // 🔥 PROFIL
    if (text === '⋪ 𝗣𝗥𝗢𝗙𝗜𝗟 ⋫') {
        console.log(`[MENU-FIRST] Profil: ${chatId}`);
        await showProfilMenu(bot, chatId);
        return { handled: true, action: 'PROFIL' };
    }

    // 🔥 CEK DPT V1 (FILE EXCEL)
    if (text === '⋪ 𝗖𝗘𝗞 𝗗𝗣𝗧 𝗩𝟭 ⋫' || text === '⋪ 𝗖𝗘𝗞 𝗗𝗣𝗧 ⋫') {
        console.log(`[MENU-FIRST] Cek DPT V1: ${chatId}`);

        if (!isAuthorizedUser) {
            const saldoUser = saldo.getSaldo(chatId);
            const MINIMAL_SALDO = 1000;

            if (saldoUser < MINIMAL_SALDO) {
                await bot.sendMessage(chatId,
                    `⚠️ *SALDO KURANG*\n\n` +
                    `💰 Saldo kamu: *${saldo.formatRupiah(saldoUser)}*\n` +
                    `📌 Minimal saldo: *${saldo.formatRupiah(MINIMAL_SALDO)}*\n\n` +
                    `👉 Silakan *TOPUP* dulu sebelum Cek DPT V1.\n` +
                    `Klik tombol *⋪ 𝗧𝗢𝗣𝗨𝗣 ⋫* di menu.`,
                    { parse_mode: 'Markdown' }
                );
                return { handled: true, action: 'CEKDPT_NO_SALDO' };
            }
        } else {
            console.log(`👑 [MENU-FIRST] Owner mode — skip cek saldo`);
        }

        if (global.cekdptWaitingNik) delete global.cekdptWaitingNik[chatId];

        global.cekdptMode = global.cekdptMode || {};
        global.cekdptMode[chatId] = true;

        await bot.sendMessage(chatId,
            `📌 *CEK DPT ONLINE V1*\n\n📄 *Silakan kirim file Excel (.xlsx) berisi NIK*\n\n` +
            `📋 *Format File:*\n• Kolom A: NIK (16 digit)\n• Bisa banyak baris\n• File harus .xlsx atau .xls\n\n` +
            `⏱️ Proses ±1-3 menit tergantung jumlah NIK`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
    keyboard: [
        [{ text: '⋪ ❌ 𝗕𝗔𝗧𝗔𝗟 ⋫', style: COLOR.DANGER }],
        [{ text: '⋪ 🔙 𝗞𝗘𝗠𝗕𝗔𝗟𝗜 𝗞𝗘 𝗠𝗘𝗡𝗨 ⋫', style: COLOR.PRIMARY }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
}
            }
        );
        return { handled: true, action: 'CEKDPT_V1' };
    }

    // 🔥 CEK DPT V2 (KIRIM NIK LANGSUNG)
    if (text === '⋪ 𝗖𝗘𝗞 𝗗𝗣𝗧 𝗩𝟮 ⋫') {
        console.log(`[MENU-FIRST] Cek DPT V2: ${chatId}`);

        if (!isAuthorizedUser) {
            const saldoUser = saldo.getSaldo(chatId);
            const MINIMAL_SALDO = 1000;

            if (saldoUser < MINIMAL_SALDO) {
                await bot.sendMessage(chatId,
                    `⚠️ *SALDO KURANG*\n\n` +
                    `💰 Saldo kamu: *${saldo.formatRupiah(saldoUser)}*\n` +
                    `📌 Minimal saldo: *${saldo.formatRupiah(MINIMAL_SALDO)}*\n\n` +
                    `👉 Silakan *TOPUP* dulu sebelum Cek DPT V2.\n` +
                    `Klik tombol *⋪ 𝗧𝗢𝗣𝗨𝗣 ⋫* di menu.`,
                    { parse_mode: 'Markdown' }
                );
                return { handled: true, action: 'CEKDPT_V2_NO_SALDO' };
            }
        } else {
            console.log(`👑 [MENU-FIRST] Owner mode — skip cek saldo`);
        }

        if (global.cekdptMode) delete global.cekdptMode[chatId];

        global.cekdptWaitingNik = global.cekdptWaitingNik || {};
        global.cekdptWaitingNik[chatId] = true;

        await bot.sendMessage(chatId,
            `🆕 *CEK DPT ONLINE V2*\n\n` +
            `📝 *Kirim NIK langsung di chat (tanpa file)*\n\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `📋 *Format:*\n` +
            `Kirim 1 NIK per baris, atau pisah dengan spasi/koma:\n\n` +
            '```\n' +
            `37042356757867886\n` +
            `37042356757867886\n` +
            `37042356757867886\n` +
            '```\n\n' +
            `📌 *Ketentuan:*\n` +
            `• NIK harus 16 digit\n` +
            `• Bisa 1 NIK atau banyak (max 50 NIK)\n` +
            `• Harga: Rp500/NIK valid\n` +
            `• NIK tidak terdaftar = GRATIS\n\n` +
            `📌 *Output:*\n` +
            `• ≤ 10 NIK → Hasil dikirim sebagai teks\n` +
            `• > 10 NIK → Hasil dikirim sebagai file Excel\n\n` +
            `⏱️ _Proses ±1-3 menit tergantung jumlah NIK_\n\n` +
            `💡 Kirim NIK sekarang...`,
            {
                parse_mode: 'Markdown',
reply_markup: {
    keyboard: [
        [{ text: '⋪ ❌ 𝗕𝗔𝗧𝗔𝗟 ⋫', style: COLOR.DANGER }],
        [{ text: '⋪ 🔙 𝗞𝗘𝗠𝗕𝗔𝗟𝗜 𝗞𝗘 𝗠𝗘𝗡𝗨 ⋫', style: COLOR.PRIMARY }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
}
            }
        );
        return { handled: true, action: 'CEKDPT_V2' };
    }
    
    // 🔥 TOPUP
    if (text === '⋪ 𝗧𝗢𝗣𝗨𝗣 ⋫') {
        console.log(`[MENU-FIRST] Topup: ${chatId}`);
        const topupMenu = require('./menu-topup');
        await topupMenu.showTopupMenu(bot, chatId);
        return { handled: true, action: 'TOPUP' };
    }

    // 🔥 SETTING (OWNER)
    if (text === '⋪ 𝗦𝗘𝗧𝗧𝗜𝗡𝗚 ⋫' && isAuthorizedUser) {
        console.log(`[MENU-FIRST] Setting: ${chatId}`);
        const adminMenu = require('./menu_admin');
        const menu = require('./menu');
        await adminMenu.showAdminMenu(chatId, menu.sendNewMessageWithCleanup, bot);
        return { handled: true, action: 'SETTING' };
    }

    // 🔥 MENU WA (OWNER)
    if (text === '⋪ 𝗠𝗘𝗡𝗨 𝗪𝗔 ⋫' && isAuthorizedUser) {
        console.log(`[MENU-FIRST] Menu WA: ${chatId}`);
        const waMenu = require('./menu_wa');
        const menu = require('./menu');
        await waMenu.showWhatsAppMenu(chatId, menu.sendNewMessageWithCleanup, bot);
        return { handled: true, action: 'MENU_WA' };
    }

    return { handled: false };
};

// ==========================================
// EXPORT
// ==========================================
module.exports = {
    showFirstMenu,
    showMainMenu,
    showProfilMenu,
    handleFirstMenuButton,
    deleteFirstMsg,
    deleteMainMsg,
    lastFirstMsg,
    lastMainMsg,
    FIRST_KEYBOARD,
    MAIN_KEYBOARD_USER,
    MAIN_KEYBOARD_OWNER
};