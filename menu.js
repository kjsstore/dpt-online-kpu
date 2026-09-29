// ==========================================
// 🔥 MENU.JS - FIXED + SYNC KE WA-BOT (TANPA SAVE DATA)
// 🔥 FIX: SEMUA TOMBOL INLINE DIKASIH WARNA
// ==========================================

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const waMenu = require("./menu_wa");
const sewaBot = require("./menu_sewa_bot");
const adminMenu = require("./menu_admin");

// Store last message IDs for each chat
const lastMessages = {};

// 🔥 GANTI VIDEO KE JPG
const IMAGE_URL = "https://files.catbox.moe/0edb7q.jpg"; // Ganti dengan URL JPG kamu

// ==========================================
// 🔥 KONFIGURASI BRIDGE
// ==========================================

const config = require('./config');
const BRIDGE_URL = process.env.BRIDGE_URL || config.URLS.BRIDGE;
const WA_API_URL = process.env.WA_API_URL || config.URLS.WA_BOT;

// ==========================================
// 🔥 FUNCTION DELETE PREVIOUS MESSAGE
// ==========================================

const deletePreviousMessage = async (bot, chatId) => {
  if (lastMessages[chatId]) {
    try {
      await bot.deleteMessage(chatId, lastMessages[chatId]);
      delete lastMessages[chatId];
    } catch (err) {
      console.log(`Gagal hapus pesan di ${chatId}: ${err.message}`);
    }
  }
};

// ==========================================
// 🔥 FUNGSI HAPUS REPLY KEYBOARD
// ==========================================

const removeReplyKeyboard = async (bot, chatId) => {
  try {
    // 🔥 LOG — SIAPA YANG PANGGIL
    const stack = new Error().stack.split('\n').slice(1, 4).join(' ← ');
    console.log(`🚨 [removeReplyKeyboard] Dipanggil untuk ${chatId}`);
    console.log(`🚨 [removeReplyKeyboard] Dari: ${stack}`);
    
    const sent = await bot.sendMessage(chatId, '\u200B', {
      reply_markup: { remove_keyboard: true },
      disable_notification: true,
      disable_web_page_preview: true
    });
    setTimeout(async () => {
      try { await bot.deleteMessage(chatId, sent.message_id); } catch (e) {}
    }, 500);
    return true;
  } catch (error) {
    console.log(`❌ [KEYBOARD] Failed: ${error.message}`);
    return false;
  }
};

// ==========================================
// 🔥 SEND IMAGE WITH CLEANUP (GANTI VIDEO)
// ==========================================

const sendImageWithCleanup = async (bot, chatId, caption, options = {}) => {
  await deletePreviousMessage(bot, chatId);
  let sentMessage;
  
  try {
    sentMessage = await bot.sendPhoto(chatId, IMAGE_URL, {
      caption: caption,
      parse_mode: options.parse_mode || "HTML",
      reply_markup: options.reply_markup
    });
  } catch (err) {
    // FALLBACK: Kirim text aja kalo gambar gagal
    console.log(`⚠️ Gagal kirim gambar, fallback ke text: ${err.message}`);
    sentMessage = await bot.sendMessage(chatId, caption, options);
  }
  
  if (sentMessage && sentMessage.message_id) {
    lastMessages[chatId] = sentMessage.message_id;
  }
  return sentMessage;
};

// ==========================================
// 🔥 SEND NEW MESSAGE WITH CLEANUP
// 🔥 FIX: TAMBAH HANDLE CAPTION > 1024 CHAR
// ==========================================

const sendNewMessageWithCleanup = async (bot, chatId, content, options = {}, photoUrl = null, useImage = false) => {
  await deletePreviousMessage(bot, chatId);
  let sentMessage;

  // 🔥 FIX: Batas caption Telegram = 1024 char
  const MAX_CAPTION = 1024;
  const isContentTooLong = content && content.length > MAX_CAPTION;

  // 🔥 FIX: KALAU PAKE IMAGE TAPI CAPTION KEPANJANGAN
  // → kirim foto dulu (tanpa caption), baru kirim caption sebagai text
  if (useImage && isContentTooLong) {
    console.log(`⚠️ [FIX] Caption terlalu panjang (${content.length} char), kirim foto + text terpisah`);
    try {
      // Kirim foto tanpa caption
      sentMessage = await bot.sendPhoto(chatId, photoUrl || IMAGE_URL, {});
      // Kirim caption sebagai text baru (dengan button)
      const textMsg = await bot.sendMessage(chatId, content, options);
      // Simpan ID text message (biar bisa dihapus nanti)
      lastMessages[chatId] = textMsg.message_id;
      return textMsg;
    } catch (err) {
      console.log(`⚠️ [FIX] Gagal kirim foto+text, fallback: ${err.message}`);
      sentMessage = await bot.sendMessage(chatId, content, options);
      if (sentMessage?.message_id) lastMessages[chatId] = sentMessage.message_id;
      return sentMessage;
    }
  }

  // 🔥 PAKE IMAGE (caption masih muat)
  if (useImage) {
    try {
      sentMessage = await bot.sendPhoto(chatId, photoUrl || IMAGE_URL, {
        caption: content,
        parse_mode: options.parse_mode || "HTML",
        reply_markup: options.reply_markup
      });
    } catch (err) {
      console.log(`⚠️ Gagal kirim gambar, fallback ke text: ${err.message}`);
      sentMessage = await bot.sendMessage(chatId, content, options);
    }
  } else if (photoUrl) {
    try {
      sentMessage = await bot.sendPhoto(chatId, photoUrl, {
        caption: content,
        parse_mode: options.parse_mode || "HTML",
        reply_markup: options.reply_markup
      });
    } catch (err) {
      sentMessage = await bot.sendMessage(chatId, content, options);
    }
  } else {
    sentMessage = await bot.sendMessage(chatId, content, options);
  }

  if (sentMessage && sentMessage.message_id) {
    lastMessages[chatId] = sentMessage.message_id;
  }
  return sentMessage;
};

// ==========================================
// 🔥 FUNGSI HAPUS SEMUA PESAN UNTUK CHAT
// ==========================================

const deleteAllMessages = async (bot, chatId) => {
    try {
        // Hapus dari lastMessages (menu utama)
        if (lastMessages && lastMessages[chatId]) {
            await bot.deleteMessage(chatId, lastMessages[chatId]);
            delete lastMessages[chatId];
            console.log(`🗑️ [DELETE ALL] Hapus lastMessages untuk ${chatId}`);
        }
        
        // Hapus dari global.lastQRMessage (menu sewa)
        if (global.lastQRMessage && global.lastQRMessage[chatId]) {
            await bot.deleteMessage(chatId, global.lastQRMessage[chatId]);
            delete global.lastQRMessage[chatId];
            console.log(`🗑️ [DELETE ALL] Hapus lastQRMessage untuk ${chatId}`);
        }
        
        // Hapus dari global.menuMessageIds (menu WA)
        if (global.menuMessageIds && global.menuMessageIds[chatId]) {
            await bot.deleteMessage(chatId, global.menuMessageIds[chatId]);
            delete global.menuMessageIds[chatId];
            console.log(`🗑️ [DELETE ALL] Hapus menuMessageIds untuk ${chatId}`);
        }
        
        console.log(`✅ [DELETE ALL] Semua pesan dihapus untuk ${chatId}`);
        return true;
    } catch (error) {
        console.log(`⚠️ [DELETE ALL] Gagal hapus: ${error.message}`);
        return false;
    }
};

// ==========================================
// 🔥 WELCOME SCREEN (PERTAMA KALI USER START) - WITH FILE STORAGE
// ==========================================

const WELCOME_FILE = path.join(__dirname, 'welcome_shown.json');

// 🔥 LOAD DATA WELCOME DARI FILE
const loadWelcomeData = () => {
    try {
        if (!fs.existsSync(WELCOME_FILE)) {
            fs.writeFileSync(WELCOME_FILE, JSON.stringify({}, null, 2));
            return {};
        }
        const raw = fs.readFileSync(WELCOME_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        console.log(`❌ [WELCOME] Gagal load data: ${error.message}`);
        return {};
    }
};

// 🔥 SAVE DATA WELCOME KE FILE
const saveWelcomeData = (data) => {
    try {
        fs.writeFileSync(WELCOME_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.log(`❌ [WELCOME] Gagal save data: ${error.message}`);
    }
};

// 🔥 CEK APAKAH USER SUDAH LIHAT WELCOME
const hasSeenWelcome = (chatId) => {
    const data = loadWelcomeData();
    return data[chatId] || false;
};

// 🔥 TANDAI USER SUDAH LIHAT WELCOME
const markWelcomeSeen = (chatId) => {
    const data = loadWelcomeData();
    data[chatId] = true;
    saveWelcomeData(data);
};

const showWelcomeScreen = async (chatId, username, sendNewMessage, bot = null) => {
    // 🔥 TANDAI USER SUDAH LIHAT WELCOME (SIMPAN KE FILE)
    markWelcomeSeen(chatId);
    
const content = `

<blockquote>
<b>👋 Halo @${username || chatId}!</b>

Saya adalah asisten bot yang dibuat untuk membantu Anda menemukan informasi yang dibagikan di berbagai grup WhatsApp secara lebih mudah dan terorganisir.

📌 <b>Fungsi Bot:</b>
├ 🔍 Memantau data sesuai daerah
├ 💾 Menyimpan daerah yang Anda pilih
├ 🤖 Mendeteksi informasi secara otomatis
└ 📩 Mengirim notifikasi langsung ke ID Anda

📌 <b>Keamanan:</b>
Untuk keamanan transaksi, tersedia rekomendasi <b>Admin Rekber</b>.
Anda juga bebas menggunakan admin andalan Anda sendiri selama terpercaya.

⚠️ <b>Gunakan bot dengan bijak.</b>
Hormati privasi dan jangan menyalahgunakan informasi yang diperoleh.

Jika Anda sudah memahami maksud dan cara penggunaan bot ini, silakan klik <b>LANJUT</b> di bawah.

<b>🙏 Terima kasih dan selamat menggunakan.</b>
</blockquote>
`;

    // 🔥 FIX: TOMBOL LANJUT DIKASIH WARNA HIJAU (success)
    const options = {
        parse_mode: "HTML",
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "𝙋𝘼𝙃𝘼𝙈, 𝙇𝘼𝙉𝙅𝙐𝙏𝙆𝘼𝙉!",
                        callback_data: "welcome_continue",
                        style: "success"  // 🔥 HIJAU
                    }
                ]
            ]
        }
    };

    if (bot) {
        // 🔥 FIX: PAKE IMAGE_URL + true biar gambar muncul
        await sendNewMessageWithCleanup(bot, chatId, content, options, IMAGE_URL, true);
    } else {
        await sendNewMessage(chatId, content, options);
    }
};

// ==========================================
// 🔥 HANDLE WELCOME CONTINUE
// ==========================================

const handleWelcomeContinue = async (q, bot, sendNewMessage, users, isAuthorizedUser) => {
    const chatId = q.message.chat.id;
    
    // 🔥 PASTIKAN USER TETAP TERSIMPAN
    markWelcomeSeen(chatId);
    
    // HAPUS PESAN WELCOME
    try {
        await bot.deleteMessage(chatId, q.message.message_id);
    } catch (e) {}
    
    // ❌ JANGAN HAPUS REPLY KEYBOARD
    
    // TAMPILKAN MENU UTAMA
    await showMenu(chatId, isAuthorizedUser, users, sendNewMessage, bot);
    return true;
};

// ==========================================
// 🔥 FUNGSI SYNC KE WA-BOT
// ==========================================

async function syncToWABot(chatId) {
  try {
    console.log(`📤 [SYNC] Mengirim data user ${chatId} ke WA-Bot...`);
    
    const sewaFile = path.join(__dirname, 'sewa_aktif.json');
    let sewa = {};
    if (fs.existsSync(sewaFile)) {
      try { sewa = JSON.parse(fs.readFileSync(sewaFile)); } catch (e) {}
    }
    
    if (!sewa[chatId]) {
      console.log(`⚠️ [SYNC] User ${chatId} tidak ditemukan`);
      return false;
    }
    
    try {
      await axios.post(`${BRIDGE_URL}/add-daerah`, {
        chatId: chatId.toString(),
        kabupaten: sewa[chatId].daerah?.slice(-1)[0]?.split(' > ')[0] || '',
        kecamatan: sewa[chatId].daerah?.slice(-1)[0]?.split(' > ')[1] || '',
        kelurahan: sewa[chatId].daerah?.slice(-1)[0]?.split(' > ')[2] || ''
      }, { timeout: 5000 });
      console.log(`✅ [SYNC] Terkirim ke Bridge untuk ${chatId}`);
    } catch (e) {
      console.log(`⚠️ [SYNC] Bridge tidak merespon:`, e.message);
    }
    
    try {
      await axios.post(`${WA_API_URL}/api/sync-sewa-data`, {
        sewaData: sewa,
        timestamp: Date.now()
      }, { timeout: 3000 });
      console.log(`✅ [SYNC] Terkirim ke API WA-Bot`);
    } catch (e) {
      console.log(`⚠️ [SYNC] API WA-Bot tidak merespon:`, e.message);
    }
    
    try {
      await axios.post(`${BRIDGE_URL}/force-sync`, {}, { timeout: 5000 });
      console.log(`✅ [SYNC] Force sync berhasil`);
    } catch (e) {
      console.log(`⚠️ [SYNC] Force sync gagal:`, e.message);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ [SYNC] Error:`, error.message);
    return false;
  }
}

// ==========================================
// 🔥 FUNGSI SYNC MASSAL KE WA-BOT
// ==========================================

async function syncAllToWABot() {
  try {
    console.log(`📤 [SYNC MASSAL] Mengirim semua data ke WA-Bot...`);
    
    const sewaFile = path.join(__dirname, 'sewa_aktif.json');
    let sewa = {};
    if (fs.existsSync(sewaFile)) {
      try { sewa = JSON.parse(fs.readFileSync(sewaFile)); } catch (e) {}
    }
    
    try {
      await axios.post(`${BRIDGE_URL}/sync-all-to-wabot`, {
        sewaData: sewa,
        daerahData: {},
        timestamp: Date.now()
      }, { timeout: 10000 });
      console.log(`✅ [SYNC MASSAL] Terkirim ke Bridge`);
    } catch (e) {
      console.log(`⚠️ [SYNC MASSAL] Bridge tidak merespon:`, e.message);
    }
    
    try {
      await axios.post(`${WA_API_URL}/api/sync-sewa-data`, {
        sewaData: sewa,
        timestamp: Date.now()
      }, { timeout: 5000 });
      console.log(`✅ [SYNC MASSAL] Terkirim ke API WA-Bot`);
    } catch (e) {
      console.log(`⚠️ [SYNC MASSAL] API WA-Bot tidak merespon:`, e.message);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ [SYNC MASSAL] Error:`, error.message);
    return false;
  }
}

// ==========================================
// 🔥 MENU SEWA BOT (LANGSUNG QRIS)
// ==========================================

const showSewaMenu = async (chatId, sendNewMessage, bot = null) => {
  // ❌ JANGAN HAPUS REPLY KEYBOARD
  return sewaBot.showSewaBotMenu(chatId, sendNewMessage, bot);
};

// ==========================================
// 🔥 MENU PROFIL (CEK SEWA DENGAN TANGGAL + DAERAH + HAPUS)
// ==========================================

const showProfilMenu = async (chatId, sendNewMessage, bot = null) => {
  // ❌ JANGAN HAPUS REPLY KEYBOARD

  const sewa = sewaBot.getSewa(chatId);

  let sewaText = '❌ Belum sewa';
  let statusText = 'Tidak aktif';
  let detailText = '';
  let daerahText = '❌ Belum ada daerah';
  let daerahList = [];

  if (sewa && sewa.active) {
    const now = Date.now();

    if (now < sewa.expired) {
      const sisaHari = Math.ceil(
        (sewa.expired - now) / (1000 * 60 * 60 * 24)
      );

      const sisaJam = Math.floor(
        ((sewa.expired - now) / (1000 * 60 * 60)) % 24
      );

      sewaText = `✅ ${sewa.duration}`;
      statusText = `Aktif (${sisaHari} hari ${sisaJam} jam)`;

      detailText = `
📅 <b>Mulai:</b> ${sewa.start_date || '-'}
📅 <b>Berakhir:</b> ${sewa.expired_date || '-'}
⏳ <b>Sisa:</b> ${sisaHari} hari ${sisaJam} jam`;

      if (sewa.daerah && sewa.daerah.length > 0) {
        daerahList = sewa.daerah;
        daerahText = sewa.daerah
          .map((d, i) => `  ${i + 1}. ${d}`)
          .join('\n');
      } else {
        daerahText = `❌ Belum ada daerah
📌 Gunakan /tambah untuk menambah`;
      }
    } else {
      sewaText = `⏰ ${sewa.duration}`;
      statusText = 'Expired';

      detailText = `
📅 <b>Mulai:</b> ${sewa.start_date || '-'}
📅 <b>Berakhir:</b> ${sewa.expired_date || '-'}
⏰ <b>Status:</b> Sudah expired`;
    }
  }

  // 🔥 BUILD INLINE KEYBOARD — FIX: TOMBOL DIKASIH WARNA
  let inlineKeyboard = [
    [
      {
        text: "📍𝐓𝐚𝐦𝐛𝐚𝐡 𝐋𝐚𝐠𝐢",
        callback_data: "tambah_daerah",
        style: "success"  // 🟢 HIJAU
      }
    ],
    [
      {
        text: "⏳𝐂𝐞𝐤 𝐒𝐞𝐰𝐚",
        callback_data: "cek_sewa",
        style: "success"  // 🟢 HIJAU
      },
      {
        text: "🤖𝐏𝐞𝐫𝐩𝐚𝐧𝐣𝐚𝐧𝐠",
        callback_data: "sewa_menu",
        style: "primary"  // 🔵 BIRU
      }
    ]
  ];

  // 🔥 TAMBAHKAN TOMBOL HAPUS DAERAH JIKA ADA DAERAH
  if (daerahList.length > 0) {
    inlineKeyboard.push([
      {
        text: "🗑️ 𝐇𝐚𝐩𝐮𝐬 𝐃𝐚𝐞𝐫𝐚𝐡",
        callback_data: "hapus_daerah",
        style: "danger"  // 🔴 MERAH
      }
    ]);
  }

  inlineKeyboard.push([
    {
      text: "🔙𝐁𝐚𝐥𝐢𝐤 𝐮𝐧𝐭𝐮𝐤",
      callback_data: "back_to_main",
      style: "danger"  // 🔴 MERAH
    }
  ]);

  const content = `
<blockquote>
📊 <b>PROFIL USER</b>

👤 <b>ID:</b> ${chatId}
🤖 <b>Sewa:</b> ${sewaText}
📅 <b>Status:</b> ${statusText}
${detailText}

📍 <b>Daerah Terdaftar:</b>
${daerahText}
</blockquote>
`;

  const options = {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  };

  if (bot) {
    // 🔥 FIX: PAKE IMAGE_URL + true biar gambar muncul
    await sendNewMessageWithCleanup(
      bot,
      chatId,
      content,
      options,
      IMAGE_URL,
      true
    );
  } else {
    await sendNewMessage(chatId, content, options);
  }
};

// ==========================================
// 🔥 MENU TAMBAH DAERAH (CEK SEWA DARI WA-BOT)
// ==========================================

const showTambahDaerahMenu = async (chatId, sendNewMessage, bot = null) => {
  // ❌ JANGAN HAPUS REPLY KEYBOARD

  const sewaFile = path.join(__dirname, 'wa-bot', 'sewa_aktif.json');
  let sewaData = {};
  let sewa = null;

  if (fs.existsSync(sewaFile)) {
    try {
      sewaData = JSON.parse(fs.readFileSync(sewaFile, 'utf8'));
      sewa = sewaData[chatId];
      console.log(`[TAMBAH MENU] 📊 Cek sewa user ${chatId} dari wa-bot`);
    } catch (e) {
      console.log(
        `[TAMBAH MENU] ❌ Error baca sewa_aktif.json:`,
        e.message
      );
    }
  } else {
    console.log(
      `[TAMBAH MENU] ⚠️ File wa-bot/sewa_aktif.json tidak ditemukan`
    );
  }

  const now = Date.now();
  const expired =
    sewa?.expired === 'Forever' ? Infinity : sewa?.expired;

  const isActive =
    sewa?.active &&
    (expired === Infinity || expired > now);

  // ==========================================
  // ❌ BELUM ADA SEWA
  // ==========================================
  if (!sewa || !isActive) {
    const content = `
<blockquote>
❌ <b>Belum ada sewa aktif!</b>

Silahkan sewa bot terlebih dahulu:

📌 <b>Paket Sewa:</b>
├ 1 Minggu : Rp 1 (TEST)
├ 1 Bulan  : Rp 100.000
└ 1 Tahun  : Rp 500.000
</blockquote>
`;

    // 🔥 FIX: TOMBOL DIKASIH WARNA
    const options = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🤖𝐒𝐞𝐰𝐚 𝐁𝐨𝐭",
              callback_data: "sewa_menu",
              style: "primary"  // 🔵 BIRU
            }
          ],
          [
            {
              text: "🔙𝐁𝐚𝐥𝐢𝐤 𝐊𝐚𝐧𝐚𝐧",
              callback_data: "back_to_main",
              style: "danger"  // 🔴 MERAH
            }
          ]
        ]
      }
    };

    if (bot) {
      // 🔥 FIX: PAKE IMAGE_URL + true
      await sendNewMessageWithCleanup(
        bot,
        chatId,
        content,
        options,
        IMAGE_URL,
        true
      );
    } else {
      await sendNewMessage(chatId, content, options);
    }

    return;
  }

  // ==========================================
  // ⏰ SEWA EXPIRED
  // ==========================================
  if (expired !== Infinity && now >= expired) {
    const content = `
<blockquote>
⏰ <b>Sewa sudah EXPIRED!</b>

Silahkan perpanjang sewa:

📅 <b>Berakhir:</b> ${sewa.expired_date || '-'}
📦 <b>Paket:</b> ${sewa.duration || '-'}
</blockquote>
`;

    // 🔥 FIX: TOMBOL DIKASIH WARNA
    const options = {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🤖𝐒𝐞𝐰𝐚 𝐁𝐨𝐭",
              callback_data: "sewa_menu",
              style: "primary"  // 🔵 BIRU
            }
          ],
          [
            {
              text: "🔙𝐁𝐚𝐥𝐢𝐤 𝐊𝐚𝐧𝐚𝐧",
              callback_data: "back_to_main",
              style: "danger"  // 🔴 MERAH
            }
          ]
        ]
      }
    };

    if (bot) {
      // 🔥 FIX: PAKE IMAGE_URL + true
      await sendNewMessageWithCleanup(
        bot,
        chatId,
        content,
        options,
        IMAGE_URL,
        true
      );
    } else {
      await sendNewMessage(chatId, content, options);
    }

    return;
  }

  // ==========================================
  // 📍 DAERAH TERDAFTAR
  // ==========================================
  let daerahList = '❌ Belum ada daerah terdaftar';

  if (sewa.daerah && sewa.daerah.length > 0) {
    daerahList = sewa.daerah
      .map((d, i) => `  ${i + 1}. ${d}`)
      .join('\n');
  }

  const sisaHari =
    expired === Infinity
      ? '∞'
      : Math.ceil(
          (expired - now) / (1000 * 60 * 60 * 24)
        );

  const content = `
<blockquote>
📍 <b>TAMBAH DAERAH</b>

📌 <b>Kirim pesan dengan format:</b>

<code>/tambah KABUPATEN KECAMATAN KELURAHAN</code>
atau
<code>/tambah KABUPATEN &gt; KECAMATAN &gt; KELURAHAN</code>

📝 <b>Contoh:</b>
<code>/tambah SERANG CIKEUSIK CINANGKA</code>

📍 <b>Daerah Terdaftar Saat Ini:</b>
${daerahList}

📊 <b>Sisa Sewa:</b> ${sisaHari} ${sisaHari === '∞' ? '' : 'hari lagi'}
📦 <b>Paket:</b> ${sewa.duration || '-'}

✅ Pastikan format benar
(gunakan spasi atau &gt; sebagai pemisah)
</blockquote>
`;

  // ==========================================
  // 🔘 BUTTON — FIX: DIKASIH WARNA
  // ==========================================
  const options = {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📋𝐂𝐨𝐧𝐭𝐨𝐡 𝐅𝐨𝐫𝐦𝐚𝐭",
            callback_data: "contoh_format_daerah",
            style: "primary"  // 🔵 BIRU
          }
        ],
        [
          {
            text: "📊𝐂𝐞𝐤 𝐒𝐞𝐰𝐚",
            callback_data: "cek_sewa",
            style: "success"  // 🟢 HIJAU
          },
          {
            text: "🔙𝐁𝐚𝐥𝐢𝐤 𝐊𝐚𝐧𝐚𝐧",
            callback_data: "back_to_main",
            style: "danger"  // 🔴 MERAH
          }
        ]
      ]
    }
  };

  if (bot) {
    // 🔥 FIX: PAKE IMAGE_URL + true
    await sendNewMessageWithCleanup(
      bot,
      chatId,
      content,
      options,
      IMAGE_URL,
      true
    );
  } else {
    await sendNewMessage(chatId, content, options);
  }
};

// ==========================================
// 🔥 MAIN MENU (TANPA SAVE DATA) - PAKE IMAGE
// ==========================================

const showMenu = async (chatId, isAuthorizedUser, users, sendNewMessage, bot = null) => {

  const baseUser = 1;
  const totalUser = baseUser + Object.keys(users || {}).length;

  const sewa = sewaBot.getSewa(chatId);
  let sewaStatus = '❌ Belum sewa';
  let sewaDetail = '';
  let daerahCount = 0;

  if (isAuthorizedUser) {
    sewaStatus = 'Unlimted';
    sewaDetail = '✅ Akses penuh';
  } else {
    if (sewa && sewa.active) {
      const now = Date.now();
      if (now < sewa.expired) {
        const sisaHari = Math.ceil((sewa.expired - now) / (1000 * 60 * 60 * 24));
        sewaStatus = `✅ ${sewa.duration}`;
        sewaDetail = `⏳ Sisa ${sisaHari} hari`;
        if (sewa.daerah) daerahCount = sewa.daerah.length;
      } else {
        sewaStatus = '⏰ Expired';
        sewaDetail = '⏳ Silahkan perpanjang';
      }
    }
  }

  let username = chatId;
  if (users && users[chatId]) {
    username = users[chatId].username || users[chatId].first_name || chatId;
  }

  // 🔥 BUTTON MENU (BERWARNA: danger=merah, success=hijau, primary=biru)
  const colors = { danger: 'danger', success: 'success', primary: 'primary' };
  const buttons = [];

  buttons.push([
    { text: "☤⊶─── 𝗣𝗥𝗢𝗙𝗜𝗟 ───⊷☤", callback_data: "profil_menu", style: colors.danger }
  ]);

  // 🔥 TOMBOL CEK DPT (GANTI DAERAH SAYA)
  buttons.push([
    { text: "⋪ 𝗖𝗘𝗞 𝗗𝗣𝗧 ⋫", callback_data: "cekdpt", style: colors.success }
  ]);

  buttons.push([
    { text: "⋪ 𝗦𝗔𝗩𝗘 𝗗𝗔𝗘𝗥𝗔𝗛 ⋫", callback_data: "tambah_daerah", style: colors.success },
    { text: "⋪ 𝗦𝗘𝗪𝗔 𝗕𝗢𝗧 ⋫", callback_data: "sewa_menu", style: colors.primary }
  ]);
  
  buttons.push([
    { text: "⋪ 𝗖𝗔𝗥𝗜 𝗗𝗔𝗘𝗥𝗔𝗛 ⋫", callback_data: "cari_daerah", style: colors.primary }
  ]);

  if (isAuthorizedUser || (sewa && sewa.active && Date.now() < (sewa.expired === 'Forever' ? Infinity : sewa.expired))) {
    buttons.push([
      { text: "⋪ 𝗪𝗘𝗕 𝗡𝗜𝗞  ⋫", callback_data: "web_nik_menu", style: colors.primary }
    ]);
  }

  buttons.push([
    { text: "♲─── 𝗥𝗘𝗙𝗥𝗘𝗦𝗛 ───♲", callback_data: "back_to_main", style: colors.danger }
  ]);

  if (isAuthorizedUser) {
    buttons.push([
      { text: "⋪ 𝗦𝗘𝗧𝗧𝗜𝗡𝗚 ⋫", callback_data: "admin_menu", style: colors.danger },
      { text: "⋪ 𝗠𝗘𝗡𝗨 𝗪𝗔 ⋫", callback_data: "whatsapp_menu", style: colors.success }
    ]);
  }

  const caption = `
◉ |  S U N G  J I N - W O O _ B O T
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━⩥
┏┅➤  U S E R   I N F O
┋
┋  〄 Username  : @${username} ${isAuthorizedUser ? '👑' : ''}
┋  〄 User ID   : ${chatId}
┋  〄 Total User : ${totalUser}
┋  〄 Status Bot : ACTIVE
┋  〄 Status Sewa: ${sewaStatus}
┋  〄 Sisa Waktu : ${sewaDetail}
┋  〄 Daerah     : ${daerahCount}
┋
┗┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅⚼

◉  2026 - 2027 | 𝘈𝘭𝘭 𝘙𝘪𝘨𝘩𝘵𝘴 𝘙𝘦𝘴𝘦𝘳𝘷𝘦𝘥
`;

  if (bot) {
    // 🔥 FIX: GANTI null, false → IMAGE_URL, true
    // BIAR GAMBAR MUNCUL DI ATAS + CAPTION + BUTTON NEMPEL
    await sendNewMessageWithCleanup(
      bot,
      chatId,
      caption,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: buttons
        }
      },
      IMAGE_URL,   // 🔥 photoUrl
      true         // 🔥 useImage = true
    );
  } else {
    await sendNewMessage(
      chatId,
      caption,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: buttons
        }
      }
    );
  }
};             

// ==========================================
// 🔥 WHATSAPP MENU
// ==========================================

const showWhatsAppMenu = async (chatId, sendNewMessage, bot = null) => {
  // ❌ JANGAN HAPUS REPLY KEYBOARD
  return waMenu.showWhatsAppMenu(chatId, sendNewMessage, bot, null);
};

const showPairingMenu = async (chatId, sendNewMessage, bot = null) => {
  // ❌ JANGAN HAPUS REPLY KEYBOARD
  return waMenu.showPairingMenu(chatId, sendNewMessage, bot, sendNewMessageWithCleanup);
};

const showBroadcastWAMenu = async (chatId, sendNewMessage, bot = null) => {
  // ❌ JANGAN HAPUS REPLY KEYBOARD
  return waMenu.showBroadcastWAMenu(chatId, sendNewMessage, bot, sendNewMessageWithCleanup);
};

// ==========================================
// 🔥 HANDLE TAMBAH DAERAH
// ==========================================

const handleTambahDaerah = async (chatId, text, bot, sendMessage) => {
  try {
    let kabupaten, kecamatan, kelurahan;
    
    let cleanText = text.replace(/^\/tambah\s+/i, '').trim();
    
    console.log(`[TAMBAH] Clean text: ${cleanText}`);
    
    let match = cleanText.match(/^(.+?)\s*>\s*(.+?)\s*>\s*(.+)$/i);
    
    if (match) {
      kabupaten = match[1].trim().toUpperCase();
      kecamatan = match[2].trim().toUpperCase();
      kelurahan = match[3].trim().toUpperCase();
      console.log(`[TAMBAH] Format >: ${kabupaten} > ${kecamatan} > ${kelurahan}`);
    } else {
      const parts = cleanText.split(/\s+/);
      
      console.log(`[TAMBAH] Parts: ${parts.length} - ${parts.join(', ')}`);
      
      if (parts.length < 3) {
        return sendMessage(chatId, 
          `❌ *Format salah!*\n\n` +
          `📌 *Cara penggunaan:*\n` +
          `/tambah KABUPATEN KECAMATAN KELURAHAN\n\n` +
          `📝 *Contoh:*\n` +
          `/tambah SERANG CIKEUSIK CINANGKA\n\n` +
          `Atau dengan tanda >\n` +
          `/tambah SERANG > CIKEUSIK > CINANGKA`,
          { parse_mode: 'Markdown' }
        );
      }
      
      if (parts.length === 3) {
        kabupaten = parts[0].toUpperCase();
        kecamatan = parts[1].toUpperCase();
        kelurahan = parts[2].toUpperCase();
      } else if (parts.length > 3) {
        kelurahan = parts[parts.length - 1].toUpperCase();
        kecamatan = parts[parts.length - 2].toUpperCase();
        kabupaten = parts.slice(0, parts.length - 2).join(' ').toUpperCase();
      }
      
      console.log(`[TAMBAH] Format spasi: ${kabupaten} > ${kecamatan} > ${kelurahan}`);
    }
    
    if (!kabupaten || !kecamatan || !kelurahan) {
      return sendMessage(chatId, 
        `❌ *Format tidak valid!*\n\n` +
        `📌 Gunakan:\n` +
        `/tambah KABUPATEN KECAMATAN KELURAHAN\n\n` +
        `📝 Contoh:\n` +
        `/tambah SERANG CIKEUSIK CINANGKA`,
        { parse_mode: 'Markdown' }
      );
    }
    
    if (kabupaten.length < 2 || kecamatan.length < 2 || kelurahan.length < 2) {
      return sendMessage(chatId, 
        `❌ *Nama daerah terlalu pendek!*\n\n` +
        `Pastikan semua nama minimal 2 huruf.`,
        { parse_mode: 'Markdown' }
      );
    }
    
    const daerah = `${kabupaten} > ${kecamatan} > ${kelurahan}`;
    
    const sewaFile = path.join(__dirname, 'wa-bot', 'sewa_aktif.json');
    let sewaData = {};
    if (fs.existsSync(sewaFile)) {
      try {
        sewaData = JSON.parse(fs.readFileSync(sewaFile, 'utf8'));
      } catch (e) {
        console.log(`[TAMBAH] ❌ Error baca sewa_aktif.json:`, e.message);
      }
    }
    
    const userSewa = sewaData[chatId];
    
    if (!userSewa) {
      return sendMessage(chatId, 
        `❌ *Anda belum memiliki sewa aktif di WA-Bot!*\n\n` +
        `📌 Silahkan sewa terlebih dahulu:\n` +
        `/sewa\n\n` +
        `📌 Atau hubungi Admin untuk bantuan.`,
        { parse_mode: 'Markdown' }
      );
    }
    
    const now = Date.now();
    const expired = userSewa.expired === 'Forever' ? Infinity : userSewa.expired;
    const isActive = userSewa.active && (expired === Infinity || expired > now);
    
    if (!isActive) {
      return sendMessage(chatId, 
        `⏰ *Sewa Anda telah EXPIRED!*\n\n` +
        `📦 Paket: ${userSewa.duration || '-'}\n` +
        `📅 Berakhir: ${userSewa.expired_date || '-'}\n\n` +
        `📌 Silahkan perpanjang sewa:\n` +
        `/sewa\n\n` +
        `📌 Atau hubungi Admin untuk bantuan.`,
        { parse_mode: 'Markdown' }
      );
    }
    
    if (userSewa.daerah && userSewa.daerah.includes(daerah)) {
      return sendMessage(chatId, 
        `⚠️ *Daerah sudah terdaftar!*\n\n📍 ${daerah}`,
        { parse_mode: 'Markdown' }
      );
    }
    
    if (!userSewa.daerah) userSewa.daerah = [];
    userSewa.daerah.push(daerah);
    userSewa.active = true;
    
    fs.writeFileSync(sewaFile, JSON.stringify(sewaData, null, 2));
    console.log(`✅ [DAERAH] Ditambahkan untuk ${chatId}: ${daerah}`);
    console.log(`📊 [DAERAH] Total: ${userSewa.daerah.length} daerah`);
    
    await sendMessage(chatId, 
      `⏳ *Menyinkronkan ke WA-Bot...*`,
      { parse_mode: 'Markdown' }
    );
    
    try {
      await axios.post(`${BRIDGE_URL}/add-daerah`, {
        chatId: chatId.toString(),
        kabupaten: kabupaten,
        kecamatan: kecamatan,
        kelurahan: kelurahan
      }, { timeout: 5000 });
      console.log(`✅ [SYNC] Terkirim ke Bridge`);
    } catch (e) {
      console.log(`⚠️ [SYNC] Bridge tidak merespon:`, e.message);
    }
    
    try {
      await axios.post(`${WA_API_URL}/api/sync-sewa-data`, {
        sewaData: sewaData,
        timestamp: Date.now()
      }, { timeout: 3000 });
      console.log(`✅ [SYNC] Terkirim ke API WA-Bot`);
    } catch (e) {
      console.log(`⚠️ [SYNC] API WA-Bot tidak merespon:`, e.message);
    }
    
    try {
      await axios.post(`${BRIDGE_URL}/force-sync`, {}, { timeout: 5000 });
      console.log(`✅ [SYNC] Force sync berhasil`);
    } catch (e) {
      console.log(`⚠️ [SYNC] Force sync gagal:`, e.message);
    }
    
    const response = 
      `✅ *Berhasil Ditambahkan!*\n\n` +
      `📍 ${kabupaten} > ${kecamatan} > ${kelurahan}\n` +
      `📋 Total daerah: ${userSewa.daerah.length}\n\n` +
      `📌 Data telah disinkronkan ke WA-Bot!\n` +
      `WA-Bot akan mendeteksi data dari grup untuk daerah ini.\n\n` +
      `📝 *Contoh format lain:*\n` +
      `/tambah KABUPATEN KECAMATAN KELURAHAN\n` +
      `atau\n` +
      `/tambah KABUPATEN > KECAMATAN > KELURAHAN`;
    
    await sendMessage(chatId, response, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.log('[HANDLE TAMBAH] Error:', error.message);
    await sendMessage(chatId, 
      `❌ *Error:* ${error.message}\n\n` +
      `📌 Gunakan format:\n` +
      `/tambah KABUPATEN KECAMATAN KELURAHAN\n\n` +
      `📝 Contoh:\n` +
      `/tambah SERANG CIKEUSIK CINANGKA`,
      { parse_mode: 'Markdown' }
    );
  }
};

// ==========================================
// 🔥 COMMAND SYNC MANUAL (UNTUK OWNER/ADMIN)
// ==========================================

const handleSyncCommand = async (chatId, bot, sendMessage) => {
  try {
    await sendMessage(chatId, `🔄 *Sync ke WA-Bot dimulai...*`, { parse_mode: 'Markdown' });
    
    const result = await syncAllToWABot();
    
    if (result) {
      await sendMessage(chatId, 
        `✅ *Sync Berhasil!*\n\n` +
        `📊 Data telah disinkronkan ke WA-Bot\n` +
        `🕐 ${new Date().toLocaleString('id-ID')}`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await sendMessage(chatId, 
        `❌ *Sync Gagal!*\n\n` +
        `Coba lagi atau cek koneksi ke Bridge/WA-Bot.`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (error) {
    console.log('[SYNC COMMAND] Error:', error.message);
    await sendMessage(chatId, `❌ Error: ${error.message}`, { parse_mode: 'Markdown' });
  }
};

// ==========================================
// 🔥 HANDLE CALLBACK (TAMBAHAN UNTUK BACK TO MAIN)
// ==========================================

const handleMenuCallback = async (q, bot, sendNewMessage, users = {}, isAuthorizedUser = false) => {
    const chatId = q.message.chat.id;
    const data = q.data;

    if (data === 'back_to_main' || data === 'back_to_menu') {
        console.log(`🔙 [MENU CALLBACK] back ke menu utama untuk ${chatId}`);

        // 🔥 HAPUS SEMUA PESAN (pakai deleteAllMessages biar bersih total)
        await deleteAllMessages(bot, chatId);

        // Hapus pesan callback-nya juga
        try {
            await bot.deleteMessage(chatId, q.message.message_id);
        } catch (e) {}

        // 🔥 TAMPILKAN MENU UTAMA (pakai parameter yang benar)
        await showMenu(chatId, isAuthorizedUser, users, sendNewMessage, bot);
        return true;
    }

    return false;
};

// ==========================================
// 🔥 SESSION TAMBAH DAERAH STEP BY STEP
// ==========================================

const tambahDaerahSession = {};

const startTambahDaerah = async (chatId, bot, sendMessage) => {
    // 🔥 PATH YANG BENAR
    let sewaFile = '/root/BotKJS/wa-bot/sewa_aktif.json';
    let sewaData = {};
    let userSewa = null;
    
    console.log(`📍 [TAMBAH] Mencari file: ${sewaFile}`);
    
    // 🔥 BACA DARI WA-BOT
    if (fs.existsSync(sewaFile)) {
        try {
            sewaData = JSON.parse(fs.readFileSync(sewaFile, 'utf8'));
            userSewa = sewaData[chatId];
            console.log(`📍 [TAMBAH] User ditemukan di WA-BOT: ${chatId}`);
        } catch (e) {
            console.log(`❌ [TAMBAH] Error baca file:`, e.message);
        }
    } else {
        console.log(`⚠️ [TAMBAH] File tidak ditemukan: ${sewaFile}`);
    }
    
    // 🔥 FALLBACK: CEK LOKAL
    if (!userSewa || !userSewa.active) {
        const localFile = path.join(__dirname, 'sewa_aktif.json');
        if (fs.existsSync(localFile)) {
            try {
                const localData = JSON.parse(fs.readFileSync(localFile, 'utf8'));
                if (localData[chatId] && localData[chatId].active) {
                    userSewa = localData[chatId];
                    sewaData[chatId] = userSewa;
                    fs.writeFileSync(sewaFile, JSON.stringify(sewaData, null, 2));
                    console.log(`📍 [TAMBAH] ✅ Sync ke WA-BOT: ${chatId}`);
                }
            } catch (e) {
                console.log(`❌ [TAMBAH] Error fallback:`, e.message);
            }
        }
    }
    
    if (!userSewa || !userSewa.active) {
        return sendMessage(chatId, 
            `❌ Belum ada sewa aktif!\n\n📌 /sewa untuk mulai.`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // 🔥 CEK EXPIRED
    const now = Date.now();
    const expired = userSewa.expired === 'Forever' ? Infinity : userSewa.expired;
    if (expired !== Infinity && now >= expired) {
        return sendMessage(chatId, 
            `⏰ Sewa sudah EXPIRED!\n\n📌 /sewa untuk perpanjang.`,
            { parse_mode: 'Markdown' }
        );
    }
    
    // 🔥 RESET SESSION
    tambahDaerahSession[chatId] = {
        step: 'kabupaten',
        kabupaten: null,
        kecamatan: null,
        kelurahan: null
    };
    
    const msg = `📍 TAMBAH DAERAH (1/3)

📌 Masukkan KABUPATEN/KOTA:
📝 Contoh: SUMENEP

⏹️ Ketik batal untuk batal.`;
    
    await sendMessage(chatId, msg, { parse_mode: 'Markdown' });
};

// ==========================================
// 🔥 HANDLE INPUT TAMBAH DAERAH STEP BY STEP
// ==========================================

const handleTambahDaerahStep = async (chatId, text, bot, sendMessage) => {
    const session = tambahDaerahSession[chatId];
    
    if (!session) return false;
    
    // 🔥 BATAL
    if (text.toLowerCase() === 'batal') {
        delete tambahDaerahSession[chatId];
        await bot.sendMessage(chatId, `✅ Dibatalkan.`, { parse_mode: 'Markdown' });
        return true;
    }
    
    const cleanText = text.trim().toUpperCase();
    if (cleanText.length < 2) {
        await bot.sendMessage(chatId, `❌ Minimal 2 huruf. Coba lagi.`, { parse_mode: 'Markdown' });
        return true;
    }
    
    // 🔥 STEP 1: KABUPATEN
    if (session.step === 'kabupaten') {
        session.kabupaten = cleanText;
        session.step = 'kecamatan';
        
        await bot.sendMessage(chatId, 
            `✅ Kabupaten/Kota: ${cleanText}

📍 TAMBAH DAERAH (2/3)
📌 Masukkan KECAMATAN:
📝 Contoh: PRAGAAN

⏹️ Ketik batal untuk batal.`,
            { parse_mode: 'Markdown' }
        );
        return true;
    }
    
    // 🔥 STEP 2: KECAMATAN
    if (session.step === 'kecamatan') {
        session.kecamatan = cleanText;
        session.step = 'kelurahan';
        
        await bot.sendMessage(chatId, 
            `✅ Kab/Kota: ${session.kabupaten}
✅ Kecamatan: ${cleanText}

📍 TAMBAH DAERAH (3/3)
📌 Masukkan KELURAHAN/DESA:
📝 Contoh: PAKAMBAN DAYA

⏹️ Ketik batal untuk batal.`,
            { parse_mode: 'Markdown' }
        );
        return true;
    }
    
    // 🔥 STEP 3: KELURAHAN - SAVE!
    if (session.step === 'kelurahan') {
        session.kelurahan = cleanText;
        
        const kabupaten = session.kabupaten;
        const kecamatan = session.kecamatan;
        const kelurahan = cleanText;
        const daerah = `${kabupaten} > ${kecamatan} > ${kelurahan}`;
        
        // 🔥 PATH YANG BENAR
        const sewaFile = '/root/BotKJS/wa-bot/sewa_aktif.json';
        let sewaData = {};
        if (fs.existsSync(sewaFile)) {
            try {
                sewaData = JSON.parse(fs.readFileSync(sewaFile, 'utf8'));
            } catch (e) {
                console.log(`❌ [TAMBAH] Error baca:`, e.message);
            }
        }
        
        if (!sewaData[chatId]) {
            delete tambahDaerahSession[chatId];
            await bot.sendMessage(chatId, `❌ Data sewa tidak ditemukan.`, { parse_mode: 'Markdown' });
            return true;
        }
        
        if (!sewaData[chatId].daerah) sewaData[chatId].daerah = [];
        
        if (sewaData[chatId].daerah.includes(daerah)) {
            delete tambahDaerahSession[chatId];
            await bot.sendMessage(chatId, 
                `⚠️ Daerah sudah terdaftar!\n\n📍 ${daerah}`,
                { parse_mode: 'Markdown' }
            );
            return true;
        }
        
        sewaData[chatId].daerah.push(daerah);
        sewaData[chatId].active = true;
        fs.writeFileSync(sewaFile, JSON.stringify(sewaData, null, 2));
        console.log(`✅ [TAMBAH] Daerah ditambahkan: ${daerah} untuk ${chatId}`);
        
        // 🔥 SYNC KE WA-BOT VIA API
        try {
            await axios.post(`${config.URLS.WA_BOT}/api/sync-sewa-data`, {
                sewaData: sewaData,
                timestamp: Date.now()
            }, { timeout: 5000 });
            console.log(`✅ [TAMBAH] Sync ke WA-Bot berhasil`);
        } catch (e) {
            console.log(`⚠️ [TAMBAH] Sync ke WA-Bot gagal:`, e.message);
        }
        
        // 🔥 SYNC KE BRIDGE
        try {
            await axios.post(`${BRIDGE_URL}/sync-all-to-wabot`, {
                sewaData: sewaData,
                daerahData: {},
                timestamp: Date.now()
            }, { timeout: 5000 });
            console.log(`✅ [TAMBAH] Sync ke Bridge berhasil`);
        } catch (e) {
            console.log(`⚠️ [TAMBAH] Sync ke Bridge gagal:`, e.message);
        }
        
        delete tambahDaerahSession[chatId];
        
        // 🔥 KIRIM KONFIRMASI DENGAN FORMAT BARU + 2 BUTTON
        const msg = 
`✅ DAERAH BERHASIL DITAMBAHKAN!

Kab/Kota: ${kabupaten}
Kecamatan: ${kecamatan}
Desa/Kelurahan: ${kelurahan}
📋 Total: ${sewaData[chatId].daerah.length} daerah

📌 Data sudah tersimpan di database.`;
        
        // 🔥 FIX: BUTTON DIKASIH WARNA
        const options = {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ 
                        text: "📍 TAMBAH DAERAH LAGI", 
                        callback_data: "tambah_daerah",
                        style: "success"  // 🟢 HIJAU
                    }],
                    [{ 
                        text: "🔙 KEMBALI KE MENU", 
                        callback_data: "back_to_main",
                        style: "danger"  // 🔴 MERAH
                    }]
                ]
            }
        };
        
        // 🔥 PAKAI bot.sendMessage LANGSUNG
        await bot.sendMessage(chatId, msg, options);
        return true;
    }
    
    return false;
};

// ==========================================
// 🔥 EXPORT
// ==========================================
module.exports = {
    showMenu,
    showSewaMenu,   
    showProfilMenu,
    showTambahDaerahMenu, 
    handleTambahDaerah,
    handleSyncCommand,
    syncToWABot,
    syncAllToWABot,
    showWhatsAppMenu,
    showPairingMenu,
    showBroadcastWAMenu,
    deletePreviousMessage,
    sendNewMessageWithCleanup,
    sendImageWithCleanup,
    lastMessages,
    IMAGE_URL,
    removeReplyKeyboard,
    handleMenuCallback,
    deleteAllMessages,
    showWelcomeScreen,
    hasSeenWelcome,
    handleWelcomeContinue,
    markWelcomeSeen,
    startTambahDaerah,
    handleTambahDaerahStep,
    tambahDaerahSession
};