// menu_admin.js - MENU ADMIN DENGAN TOMBOL REPLY
// 🔥 SEMUA DATA MENGARAH KE WA-BOT (wabot/sewa_aktif.json)

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ==========================================
// 🔥 LOAD JSON HELPER
// ==========================================

const loadJSON = (file) => {
  try {
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw || raw === '') return {};
    return JSON.parse(raw);
  } catch (err) {
    console.log(`❌ JSON ERROR ${file}:`, err.message);
    return {};
  }
};

const saveJSON = (file, data) => {
  try {
    if (!data || typeof data !== 'object') data = {};
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.log(`❌ SAVE ERROR ${file}:`, err.message);
  }
};

// ==========================================
// 🔥 KONFIGURASI WA-BOT
// ==========================================

const WA_API_URL = process.env.WA_API_URL || 'http://127.0.0.1:3005';
const WABOT_DATA_FOLDER = '/root/DPT-ONLINE/wa-bot';
const SEWA_FILE = '/root/DPT-ONLINE/wa-bot/sewa_aktif.json';
const SALDO_FILE = '/root/DPT-ONLINE/wa-bot/saldo.json';

// ==========================================
// 🔥 PARSE JUMLAH (10rb, 100rb, 1jt, 10000)
// ==========================================

function parseAmount(input) {
  if (!input) return 0;
  let clean = String(input).toLowerCase().trim();
  let multiplier = 1;

  if (clean.endsWith('rb')) {
    multiplier = 1000;
    clean = clean.replace('rb', '');
  } else if (clean.endsWith('k')) {
    multiplier = 1000;
    clean = clean.replace('k', '');
  } else if (clean.endsWith('jt')) {
    multiplier = 1000000;
    clean = clean.replace('jt', '');
  } else if (clean.endsWith('juta')) {
    multiplier = 1000000;
    clean = clean.replace('juta', '');
  }

  const nominal = parseInt(clean.replace(/[^0-9]/g, '')) * multiplier;
  return isNaN(nominal) ? 0 : nominal;
}

// ==========================================
// 🔥 SHOW ADMIN MENU
// ==========================================

const showAdminMenu = async (chatId, sendNewMessage, bot = null) => {
  const content = `
👑 *MENU ADMIN*

👥 List User
📢 Broadcast
💰 Cek Transaksi
➕ Add Sewa Manual
❌ Delete Sewa Manual
💰 Add Saldo Manual
💸 Delete Saldo Manual
🔍 Cek Status
⚙️ Setting Bot
📊 Statistik
📦 Backup & ZIP
`;

  const replyButtons = {
    keyboard: [
      [
        { text: "👥 LIST USER", style: "success" },
        { text: "📢 BROADCAST", style: "primary" }
      ],
      [
        { text: "💰 CEK TRANSAKSI", style: "success" },
        { text: "➕ ADD SEWA", style: "primary" }
      ],
      [
        { text: "❌ DELETE SEWA", style: "danger" },
        { text: "🔍 CEK STATUS", style: "success" }
      ],
      [
        { text: "💰 ADD SALDO", style: "success" },
        { text: "💸 DEL SALDO", style: "danger" }
      ],
      [
        { text: "⚙️ SETTING", style: "primary" },
        { text: "📊 STATISTIK", style: "success" }
      ],
      [
        { text: "📦 BACKUP", style: "primary" },
        { text: "🔙 MENU", style: "danger" }
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };

  if (bot) {
    try {
      const menuModule = require('./menu.js');
      await menuModule.deletePreviousMessage(bot, chatId);
    } catch (e) {
      if (global.menuMessageIds && global.menuMessageIds[chatId]) {
        try {
          await bot.deleteMessage(chatId, global.menuMessageIds[chatId]);
        } catch (e) {}
        delete global.menuMessageIds[chatId];
      }
    }
    
    const sent = await bot.sendMessage(chatId, content, {
      parse_mode: "Markdown",
      reply_markup: replyButtons
    });
    
    if (!global.menuMessageIds) global.menuMessageIds = {};
    global.menuMessageIds[chatId] = sent.message_id;
  } else {
    await sendNewMessage(chatId, content, {
      parse_mode: "Markdown",
      reply_markup: replyButtons
    });
  }
};

// ==========================================
// 🔥 LIST USER
// ==========================================

const listUser = async (chatId, bot) => {
  console.log(`🔍 [LISTUSER] Dipanggil untuk chatId: ${chatId}`);
  
  let sewaData = {};
  if (fs.existsSync(SEWA_FILE)) {
    try {
      sewaData = JSON.parse(fs.readFileSync(SEWA_FILE, 'utf8'));
      console.log(`✅ [LISTUSER] Total user: ${Object.keys(sewaData).length}`);
    } catch (e) {
      return bot.sendMessage(chatId, `❌ Gagal baca data: ${e.message}`);
    }
  } else {
    return bot.sendMessage(chatId, `❌ File data tidak ditemukan!\n\n📌 Path: ${SEWA_FILE}`);
  }

  const now = Date.now();
  const userList = Object.keys(sewaData).filter(id => {
    const sewa = sewaData[id];
    if (!sewa || !sewa.active) return false;
    const expiredTime = sewa.expired === 'Forever' ? Infinity : sewa.expired;
    return expiredTime === Infinity || expiredTime > now;
  });

  if (userList.length === 0) {
    return bot.sendMessage(chatId, '📋 Tidak ada user dengan sewa aktif.');
  }

  const usersFile = path.join(__dirname, 'users.json');
  let users = loadJSON(usersFile);

  let lines = [];
  lines.push(`📋 *LIST USER AKTIF (${userList.length} USER)*`);
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  
  let aktif = 0;
  let akanExpired = 0;
  
  userList.forEach((id, i) => {
    const sewa = sewaData[id];
    const user = users[id] || {};
    const username = user.username || '-';
    
    let status = '✅ AKTIF';
    let daerahCount = 0;
    let paket = '-';
    let sisaHari = '-';
    
    if (sewa) {
      paket = sewa.duration || '-';
      if (sewa.daerah) daerahCount = sewa.daerah.length;
      
      if (sewa.expired !== 'Forever' && sewa.expired) {
        const sisa = Math.ceil((sewa.expired - now) / (1000 * 60 * 60 * 24));
        sisaHari = `${sisa} hari`;
        if (sisa <= 3) {
          status = '⚠️ AKAN EXPIRED';
          akanExpired++;
        }
      } else {
        sisaHari = '♾️ Forever';
      }
      aktif++;
    }
    
    const shortUsername = username.length > 15 ? username.substring(0, 15) + '..' : username;
    
    lines.push(`${i+1}. ID: ${id}`);
    lines.push(`   👤 ${shortUsername}`);
    lines.push(`   📦 ${paket}`);
    lines.push(`   ${status} | ${sisaHari} | ${daerahCount} daerah`);
    lines.push(``);
  });
  
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`📊 RINGKASAN`);
  lines.push(`➥ Total Aktif: ${aktif}`);
  lines.push(`➥ Akan Expired (< 3 hari): ${akanExpired}`);

  const teks = lines.join('\n');

  const adminKeyboard = {
    keyboard: [
      [
        { text: "👥 LIST USER", style: "success" },
        { text: "📢 BROADCAST", style: "primary" }
      ],
      [
        { text: "💰 CEK TRANSAKSI", style: "success" },
        { text: "➕ ADD SEWA", style: "primary" }
      ],
      [
        { text: "❌ DELETE SEWA", style: "danger" },
        { text: "🔍 CEK STATUS", style: "success" }
      ],
      [
        { text: "💰 ADD SALDO", style: "success" },
        { text: "💸 DEL SALDO", style: "danger" }
      ],
      [
        { text: "⚙️ SETTING", style: "primary" },
        { text: "📊 STATISTIK", style: "success" }
      ],
      [
        { text: "🔙 MENU", style: "danger" }
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };

  try {
    await bot.sendMessage(chatId, teks, { reply_markup: adminKeyboard });
    console.log(`✅ [LISTUSER] Terkirim ke ${chatId}`);
  } catch (err) {
    console.log(`❌ [LISTUSER] Error:`, err.message);
    const plainText = teks.replace(/[*_`]/g, '');
    try {
      await bot.sendMessage(chatId, plainText, { reply_markup: adminKeyboard });
    } catch (e) {
      await bot.sendMessage(chatId, '❌ Gagal menampilkan list user');
    }
  }
};

// ==========================================
// 🔥 CEK STATUS USER
// ==========================================

const cekStatusUser = async (chatId, userId, sendMessage) => {
  const bot = global.telegramBot;
  
  if (!userId) {
    const msg = `❌ *Format salah!*\n\nGunakan: /cekstatus [user_id]\n📌 *Contoh:* /cekstatus 123456789`;
    if (bot) return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  const cleanUserId = userId.replace(/[^0-9]/g, '');
  if (!cleanUserId) {
    const msg = `❌ *User ID tidak valid!*`;
    if (bot) return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  let sewaData = {};
  if (fs.existsSync(SEWA_FILE)) {
    try {
      sewaData = JSON.parse(fs.readFileSync(SEWA_FILE, 'utf8'));
    } catch (e) {}
  }

  const sewa = sewaData[cleanUserId];
  const usersFile = path.join(__dirname, 'users.json');
  const users = loadJSON(usersFile);
  const user = users[cleanUserId];

  if (!sewa && !user) {
    const msg = `❌ User ID \`${cleanUserId}\` tidak ditemukan.\n\n📌 Cek: /listuser`;
    if (bot) return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  let teks = `👤 *STATUS USER*\n\n`;
  teks += `📱 *ID:* \`${cleanUserId}\`\n`;
  teks += `👤 *Username:* ${user?.username || '-'}\n\n`;

  if (sewa) {
    const now = Date.now();
    const expired = sewa.expired === 'Forever' ? Infinity : sewa.expired;
    const isActive = sewa.active && (expired === Infinity || expired > now);
    
    teks += `📦 *Paket:* ${sewa.duration || '-'}\n`;
    teks += `📅 *Mulai:* ${sewa.start_date || '-'}\n`;
    teks += `📅 *Berakhir:* ${sewa.expired_date || '-'}\n`;
    teks += `📊 *Status:* ${isActive ? '✅ AKTIF' : '⏰ EXPIRED'}\n`;

    if (sewa.daerah && sewa.daerah.length > 0) {
      teks += `\n📍 *Daerah:*\n`;
      sewa.daerah.forEach((d, i) => { teks += `  ${i+1}. ${d}\n`; });
    }
  } else {
    teks += `\n❌ *Belum ada data sewa*`;
  }

  if (bot) return bot.sendMessage(chatId, teks, { parse_mode: 'Markdown' });
  return sendMessage(chatId, teks, { parse_mode: 'Markdown' });
};

// ==========================================
// 🔥 DELETE SEWA
// ==========================================

const deleteSewa = async (chatId, userId, sendMessage, bot = null) => {
  const botTele = bot || global.telegramBot;
  
  if (!userId) {
    const msg = `❌ Format salah!\n\nGunakan: /delsewa [user_id]\n📌 Contoh: /delsewa 123456789`;
    if (botTele) return botTele.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  let sewaData = {};
  if (fs.existsSync(SEWA_FILE)) {
    try {
      const raw = fs.readFileSync(SEWA_FILE, 'utf8');
      if (raw && raw.trim() !== '') sewaData = JSON.parse(raw);
    } catch (e) {
      const msg = `❌ Gagal baca data! Error: ${e.message}`;
      if (botTele) return botTele.sendMessage(chatId, msg);
      return sendMessage(chatId, msg);
    }
  } else {
    const msg = `⚠️ File sewa_aktif.json tidak ditemukan!`;
    if (botTele) return botTele.sendMessage(chatId, msg);
    return sendMessage(chatId, msg);
  }

  if (!sewaData[userId]) {
    const msg = `❌ User ID ${userId} tidak ditemukan.\n\n📌 Cek: /listuser`;
    if (botTele) return botTele.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  const userData = sewaData[userId];
  const daerahLama = userData.daerah || [];
  const username = userData.username || userId;

  sewaData[userId] = {
    daerah: daerahLama,
    username: username,
    active: false,
    duration: 'Dihapus Admin',
    start: null,
    expired: null,
    start_date: '-',
    expired_date: '-',
    deleted_at: new Date().toISOString(),
    deleted_by: 'admin'
  };

  try {
    fs.writeFileSync(SEWA_FILE, JSON.stringify(sewaData, null, 2), 'utf8');
    console.log(`✅ [DELSEWA] User ${userId} dihapus`);
  } catch (e) {
    const msg = `❌ Gagal simpan: ${e.message}`;
    if (botTele) return botTele.sendMessage(chatId, msg);
    return sendMessage(chatId, msg);
  }

  try {
    await axios.post(`${WA_API_URL}/api/sync-sewa-data`, {
      sewaData: sewaData, timestamp: Date.now()
    }, { timeout: 5000 });
  } catch (e) {}

  try {
    await axios.post('http://localhost:3004/sync-all-to-wabot', {
      sewaData: sewaData, daerahData: {}, timestamp: Date.now()
    }, { timeout: 5000 });
  } catch (e) {}

  try {
    if (global.telegramBot) {
      await global.telegramBot.sendMessage(userId, 
        `⛔ *Sewa Anda telah dihapus oleh Admin!*\n\n` +
        `📦 Paket: ${userData.duration || '-'}\n` +
        `📍 Daerah tetap: ${daerahLama.length} daerah\n\n` +
        `📌 Sewa ulang: /sewa`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (e) {}

  const msg = `✅ *Sewa berhasil dihapus!*\n\n` +
    `👤 User ID: \`${userId}\`\n` +
    `📦 Paket: ${userData.duration || '-'}\n` +
    `📍 Daerah tetap: ${daerahLama.length} daerah`;
  
  if (botTele) return botTele.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
};

// ==========================================
// 🔥 FORMAT DURASI
// ==========================================

function formatDurationLabel(totalDays) {
    const days = Math.round(totalDays);
    if (days === 7) return '1 Minggu';
    if (days === 30) return '1 Bulan';
    if (days === 365) return '1 Tahun';
    if (days % 7 === 0) return `${days / 7} Minggu`;
    if (days % 30 === 0) return `${days / 30} Bulan`;
    if (days % 365 === 0) return `${days / 365} Tahun`;
    return `${days} Hari`;
}

// ==========================================
// 🔥 ADD SEWA MANUAL
// ==========================================

const addSewaManual = async (chatId, userId, duration, sendMessage) => {
  const bot = global.telegramBot;
  
  if (!userId || !duration) {
    const msg = `❌ Format salah!\n/addsewa [user_id] [durasi]\n📝 Durasi: 7h, 7d, 30d\n📌 Contoh: /addsewa 123456789 30d`;
    if (bot) return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  let days = 0;
  if (duration.endsWith('h')) {
    const hours = parseInt(duration.replace('h', ''));
    if (isNaN(hours) || hours <= 0) return sendMessage(chatId, '❌ Durasi tidak valid!');
    days = hours / 24;
  } else if (duration.endsWith('d')) {
    const d = parseInt(duration.replace('d', ''));
    if (isNaN(d) || d <= 0) return sendMessage(chatId, '❌ Durasi tidak valid!');
    days = d;
  } else {
    return sendMessage(chatId, `❌ Format durasi salah!\nGunakan: 7h, 7d, 30d`, { parse_mode: 'Markdown' });
  }

  let sewaData = {};
  if (fs.existsSync(SEWA_FILE)) {
    try {
      const raw = fs.readFileSync(SEWA_FILE, 'utf8');
      if (raw && raw.trim() !== '') sewaData = JSON.parse(raw);
    } catch (e) {}
  } else {
    return sendMessage(chatId, `⚠️ File sewa_aktif.json tidak ditemukan!`);
  }

  const now = Date.now();
  const usersFile = path.join(__dirname, 'users.json');
  const users = loadJSON(usersFile);
  const username = users[userId]?.username || userId;
  const daerahLama = sewaData[userId]?.daerah || [];

  const existing = sewaData[userId];

  let baseStart = existing?.start || now;
  let baseExpired = existing?.expired || now;

  if (existing?.expired === 'Forever') {
    baseExpired = 'Forever';
  }

  const newExpired = baseExpired === 'Forever' 
    ? 'Forever' 
    : baseExpired + (days * 24 * 60 * 60 * 1000);

  let totalDays = 0;
  if (newExpired !== 'Forever') {
    totalDays = Math.round((newExpired - baseStart) / (1000 * 60 * 60 * 24));
  }

  const newDurationLabel = newExpired === 'Forever' ? 'Forever' : formatDurationLabel(totalDays);
  const startDate = existing?.start_date || new Date(baseStart).toISOString().split('T')[0];

  sewaData[userId] = {
    ...(existing || {}),
    duration: newDurationLabel,
    start: baseStart,
    expired: newExpired,
    active: true,
    start_date: startDate,
    expired_date: newExpired === 'Forever' ? 'Forever' : new Date(newExpired).toLocaleDateString('id-ID'),
    daerah: daerahLama,
    username: username,
    updated_at: new Date().toISOString()
  };

  try {
    fs.writeFileSync(SEWA_FILE, JSON.stringify(sewaData, null, 2), 'utf8');
    console.log(`✅ [ADDSEWA] User ${userId} → ${newDurationLabel}`);
  } catch (e) {
    return sendMessage(chatId, `❌ Gagal simpan data!`);
  }

  try {
    await axios.post(`${WA_API_URL}/api/sync-sewa-data`, {
      sewaData: sewaData, timestamp: Date.now()
    }, { timeout: 5000 });
  } catch (e) {}

  try {
    await axios.post('http://localhost:3004/sync-all-to-wabot', {
      sewaData: sewaData, daerahData: {}, timestamp: Date.now()
    }, { timeout: 5000 });
  } catch (e) {}

  try {
    if (global.telegramBot) {
      await global.telegramBot.sendMessage(userId, 
        `🎉 *Sewa Anda ditambahkan Admin!*\n\n` +
        `📦 Paket: ${newDurationLabel}\n` +
        `📅 Berakhir: ${sewaData[userId].expired_date}\n`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (e) {}

  const msg = `✅ *Sewa berhasil ditambahkan!*\n\n` +
    `👤 User ID: \`${userId}\`\n` +
    `📦 Paket: ${newDurationLabel}\n` +
    `📅 Berakhir: ${sewaData[userId].expired_date}`;
  
  if (bot) return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
};

// ==========================================
// 🔥 ADD SALDO MANUAL
// ==========================================

const addSaldoManual = async (chatId, userId, amount, sendMessage) => {
  const bot = global.telegramBot;
  const saldo = require('./saldo');
  
  if (!userId || !amount) {
    const msg = `❌ Format salah!\n\n/addsaldo [user_id] [jumlah]\n\n📌 Contoh:\n/addsaldo 123456789 10000\n/addsaldo 123456789 10rb\n/addsaldo 123456789 100rb\n/addsaldo 123456789 1jt`;
    if (bot) return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  const nominal = parseAmount(amount);
  
  if (nominal <= 0) {
    const msg = `❌ Jumlah tidak valid!\n\n📌 Contoh: 10000, 10rb, 100rb, 1jt`;
    if (bot) return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  // 🔥 PAKAI saldo.js (format nested + riwayat)
  const saldoLama = saldo.getSaldo(userId);
  const saldoBaru = saldoLama + nominal;

  const berhasil = saldo.tambahSaldo(userId, nominal);

  if (!berhasil) {
    const msg = `❌ Gagal simpan data saldo!`;
    if (bot) return bot.sendMessage(chatId, msg);
    return sendMessage(chatId, msg);
  }

  console.log(`✅ [ADDSALDO] User ${userId}: Rp${saldoLama} → Rp${saldoBaru}`);

  // 🔥 SYNC ke WA-Bot (pakai format nested)
  try {
    const saldoData = saldo.loadSaldo();
    await axios.post(`${WA_API_URL}/api/sync-saldo-data`, {
      saldoData: saldoData, timestamp: Date.now()
    }, { timeout: 5000 });
  } catch (e) {}

  // 🔥 NOTIF ke user
  try {
    if (bot) {
      await bot.sendMessage(userId, 
        `💰 *Saldo Anda ditambahkan Admin!*\n\n` +
        `📥 Ditambah: *Rp${nominal.toLocaleString('id-ID')}*\n` +
        `💰 Saldo baru: *Rp${saldoBaru.toLocaleString('id-ID')}*`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (e) {}

  const msg = `✅ *Saldo berhasil ditambahkan!*\n\n` +
    `👤 User ID: \`${userId}\`\n` +
    `📥 Ditambah: *Rp${nominal.toLocaleString('id-ID')}*\n` +
    `💰 Saldo lama: Rp${saldoLama.toLocaleString('id-ID')}\n` +
    `💰 Saldo baru: *Rp${saldoBaru.toLocaleString('id-ID')}*`;
  
  if (bot) return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
};

// ==========================================
// 🔥 DELETE SALDO MANUAL
// ==========================================

const deleteSaldoManual = async (chatId, userId, amount, sendMessage) => {
  const bot = global.telegramBot;
  const saldo = require('./saldo');
  
  if (!userId || !amount) {
    const msg = `❌ Format salah!\n\n/delsaldo [user_id] [jumlah]\n\n📌 Contoh:\n/delsaldo 123456789 10000\n/delsaldo 123456789 50rb`;
    if (bot) return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }

  const nominal = parseAmount(amount);
  
  if (nominal <= 0) {
    const msg = `❌ Jumlah tidak valid!`;
    if (bot) return bot.sendMessage(chatId, msg);
    return sendMessage(chatId, msg);
  }

  const saldoLama = saldo.getSaldo(userId);
  
  if (saldoLama < nominal) {
    const msg = `⚠️ *Saldo tidak cukup!*\n\n` +
                `💰 Saldo user: Rp${saldoLama.toLocaleString('id-ID')}\n` +
                `📤 Mau dihapus: Rp${nominal.toLocaleString('id-ID')}`;
    if (bot) return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }
  
  const saldoBaru = saldoLama - nominal;

  const berhasil = saldo.kurangiSaldo(userId, nominal);

  if (!berhasil) {
    const msg = `❌ Gagal simpan data saldo!`;
    if (bot) return bot.sendMessage(chatId, msg);
    return sendMessage(chatId, msg);
  }

  console.log(`✅ [DELSALDO] User ${userId}: Rp${saldoLama} → Rp${saldoBaru}`);

  // 🔥 SYNC ke WA-Bot
  try {
    const saldoData = saldo.loadSaldo();
    await axios.post(`${WA_API_URL}/api/sync-saldo-data`, {
      saldoData: saldoData, timestamp: Date.now()
    }, { timeout: 5000 });
  } catch (e) {}

  // 🔥 NOTIF ke user
  try {
    if (bot) {
      await bot.sendMessage(userId, 
        `📤 *Saldo Anda dikurangi Admin!*\n\n` +
        `📤 Dikurangi: *Rp${nominal.toLocaleString('id-ID')}*\n` +
        `💰 Saldo baru: *Rp${saldoBaru.toLocaleString('id-ID')}*`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (e) {}

  const msg = `✅ *Saldo berhasil dihapus!*\n\n` +
    `👤 User ID: \`${userId}\`\n` +
    `📤 Dihapus: *Rp${nominal.toLocaleString('id-ID')}*\n` +
    `💰 Saldo lama: Rp${saldoLama.toLocaleString('id-ID')}\n` +
    `💰 Saldo baru: *Rp${saldoBaru.toLocaleString('id-ID')}*`;
  
  if (bot) return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  return sendMessage(chatId, msg, { parse_mode: 'Markdown' });
};

// ==========================================
// 🔥 SYNC KE WA-BOT
// ==========================================

async function syncToWABot() {
  try {
    const sewa = loadJSON(SEWA_FILE);
    await axios.post(`${WA_API_URL}/api/sync-sewa-data`, {
      sewaData: sewa, timestamp: Date.now()
    }, { timeout: 5000 });
    console.log('✅ [SYNC] Data tersync');
    return true;
  } catch (error) {
    console.log('⚠️ [SYNC] Gagal sync:', error.message);
    return false;
  }
}

// ==========================================
// 🔥 HANDLE ADMIN COMMAND
// ==========================================

const handleAdminCommand = async (bot, msg, sendMessage) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const botTele = bot || global.telegramBot;
  
  // ==========================================
  // 🔥 LIST USER
  // ==========================================
  if (text === '/listuser' || text === '👥 LIST USER') {
    return await listUser(chatId, sendMessage);
  }

  // ==========================================
  // 🔥 DELETE SEWA
  // ==========================================
  if (text.match(/^\/delsewa\s+/i)) {
    const userId = text.replace(/^\/delsewa\s+/i, '').trim();
    return await deleteSewa(chatId, userId, sendMessage, botTele);
  }

  // ==========================================
  // 🔥 CEK STATUS
  // ==========================================
  if (text.match(/^\/cekstatus\s+/i)) {
    const userId = text.replace(/^\/cekstatus\s+/i, '').trim();
    return await cekStatusUser(chatId, userId, sendMessage);
  }

  // ==========================================
  // 🔥 ADD SEWA
  // ==========================================
  if (text.match(/^\/addsewa\s+/i)) {
    const parts = text.replace(/^\/addsewa\s+/i, '').trim().split(/\s+/);
    if (parts.length < 2) {
      const m = `❌ Format salah!\n/addsewa [user_id] [durasi]\nContoh: /addsewa 123456789 30d`;
      if (botTele) return botTele.sendMessage(chatId, m, { parse_mode: 'Markdown' });
      return sendMessage(chatId, m, { parse_mode: 'Markdown' });
    }
    return await addSewaManual(chatId, parts[0], parts[1], sendMessage);
  }

  // ==========================================
  // 🔥 ADD SALDO
  // ==========================================
  if (text.match(/^\/addsaldo\s+/i)) {
    const parts = text.replace(/^\/addsaldo\s+/i, '').trim().split(/\s+/);
    if (parts.length < 2) {
      const m = `❌ Format salah!\n/addsaldo [user_id] [jumlah]\nContoh: /addsaldo 123456789 10rb`;
      if (botTele) return botTele.sendMessage(chatId, m, { parse_mode: 'Markdown' });
      return sendMessage(chatId, m, { parse_mode: 'Markdown' });
    }
    return await addSaldoManual(chatId, parts[0], parts[1], sendMessage);
  }

  // ==========================================
  // 🔥 DEL SALDO
  // ==========================================
  if (text.match(/^\/delsaldo\s+/i)) {
    const parts = text.replace(/^\/delsaldo\s+/i, '').trim().split(/\s+/);
    if (parts.length < 2) {
      const m = `❌ Format salah!\n/delsaldo [user_id] [jumlah]\nContoh: /delsaldo 123456789 50rb`;
      if (botTele) return botTele.sendMessage(chatId, m, { parse_mode: 'Markdown' });
      return sendMessage(chatId, m, { parse_mode: 'Markdown' });
    }
    return await deleteSaldoManual(chatId, parts[0], parts[1], sendMessage);
  }

  // ==========================================
  // 🔥 TOMBOL: ADD SALDO
  // ==========================================
  if (text === '💰 ADD SALDO') {
    const m = `💰 *ADD SALDO MANUAL*\n\n` +
              `📌 Format:\n` +
              `/addsaldo [user_id] [jumlah]\n\n` +
              `📌 Contoh:\n` +
              `/addsaldo 123456789 10000\n` +
              `/addsaldo 123456789 10rb\n` +
              `/addsaldo 123456789 100rb\n` +
              `/addsaldo 123456789 1jt`;
    if (botTele) return botTele.sendMessage(chatId, m, { parse_mode: 'Markdown' });
    return sendMessage(chatId, m, { parse_mode: 'Markdown' });
  }

  // ==========================================
  // 🔥 TOMBOL: DEL SALDO
  // ==========================================
  if (text === '💸 DEL SALDO') {
    const m = `💸 *DELETE SALDO MANUAL*\n\n` +
              `📌 Format:\n` +
              `/delsaldo [user_id] [jumlah]\n\n` +
              `📌 Contoh:\n` +
              `/delsaldo 123456789 10000\n` +
              `/delsaldo 123456789 50rb`;
    if (botTele) return botTele.sendMessage(chatId, m, { parse_mode: 'Markdown' });
    return sendMessage(chatId, m, { parse_mode: 'Markdown' });
  }

  // ==========================================
  // 🔥 MENU
  // ==========================================
  if (text === '🔙 MENU' || text === '/menu') {
    try {
      const menuModule = require('./menu.js');
      await menuModule.deleteAllMessages(botTele, chatId);
      await menuModule.removeReplyKeyboard(botTele, chatId);
    } catch (e) {}
    
    const menu = require('./menu');
    const isOwner = msg.from.id === require('./config').BOT.OWNER_ID;
    const users = loadJSON(path.join(__dirname, 'users.json'));
    await menu.showMenu(chatId, isOwner, users, sendMessage, botTele);
    return true;
  }

  // ==========================================
  // 🔥 BACKUP MENU
  // ==========================================
  if (text === '📦 BACKUP') {
    try {
      if (global.menuMessageIds && global.menuMessageIds[chatId]) {
        await botTele.deleteMessage(chatId, global.menuMessageIds[chatId]);
        delete global.menuMessageIds[chatId];
      }
    } catch (e) {}
    
    const backupZip = require('./backupZip');
    const zips = backupZip.listZips ? backupZip.listZips() : [];
    const backupDir = path.join(__dirname, 'backups');
    let backups = [];
    if (fs.existsSync(backupDir)) {
        backups = fs.readdirSync(backupDir).filter(f => f.startsWith('sewa_aktif_') && f.endsWith('.json'));
    }
    
    const msg = `📦 *BACKUP MENU*\n\n` +
                `📌 *Perintah:*\n` +
                `💾 /backup - Backup sewa_aktif.json\n` +
                `📦 /backupzip - Backup FULL (ZIP)\n` +
                `📋 /listbackup - Lihat backup JSON\n` +
                `📋 /listzip - Lihat backup ZIP\n` +
                `📤 /sendzip - Kirim ZIP ke channel\n\n` +
                `📊 *Status*\n` +
                `📂 JSON: ${backups.length} file\n` +
                `📦 ZIP: ${zips.length} file`;

    const buttons = {
      reply_markup: {
        keyboard: [
          [
            { text: "💾 BACKUP SEWA", style: "success" },
            { text: "📦 BACKUP FULL", style: "primary" }
          ],
          [
            { text: "📋 LIST BACKUP", style: "success" },
            { text: "📋 LIST ZIP", style: "success" }
          ],
          [
            { text: "📤 SEND ZIP", style: "primary" },
            { text: "🔙 ADMIN", style: "danger" }
          ]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
    
    await botTele.sendMessage(chatId, msg, { parse_mode: 'Markdown', ...buttons });
    return true;
  }

  if (text === '💾 BACKUP SEWA') {
    botTele.emit('text', { chat: { id: chatId }, from: { id: msg.from.id }, text: '/backup' });
    return true;
  }

  if (text === '📦 BACKUP FULL') {
    botTele.emit('text', { chat: { id: chatId }, from: { id: msg.from.id }, text: '/backupzip' });
    return true;
  }

  if (text === '📋 LIST BACKUP') {
    botTele.emit('text', { chat: { id: chatId }, from: { id: msg.from.id }, text: '/listbackup' });
    return true;
  }

  if (text === '📋 LIST ZIP') {
    botTele.emit('text', { chat: { id: chatId }, from: { id: msg.from.id }, text: '/listzip' });
    return true;
  }

  if (text === '📤 SEND ZIP') {
    botTele.emit('text', { chat: { id: chatId }, from: { id: msg.from.id }, text: '/sendzip' });
    return true;
  }

  if (text === '🔙 ADMIN') {
    return showAdminMenu(chatId, sendMessage, botTele);
  }

  return false;
};

// ==========================================
// 🔥 SHOW BROADCAST MENU
// ==========================================

const showBroadcastMenu = async (chatId, sendMessage, bot = null) => {
  const botTele = bot || global.telegramBot;
  
  const content = `
📢 *MENU BROADCAST*

📝 *Text Biasa*
/broadcast [pesan]
🏷️ *Text + Tag @ALL*
/broadcasttag [pesan]
📌 *Text + Semat (Pin)*
/broadcastpin [pesan]
📸 *Foto + Caption*
/broadcastfoto [caption]
🏷️ *Foto + Tag @ALL*
/broadcastfototag [caption]
📌 *Foto + Semat*
/broadcastfotopin [caption]
🎥 *Video + Caption*
/broadcastvideo [caption]
🏷️ *Video + Tag @ALL*
/broadcastvideotag [caption]
📌 *Video + Semat*
/broadcastvideopin [caption]
━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 *Unpin*
/unpin - Lepas semat di chat ini
/unpin [user_id] - Lepas semat user tertentu
/unpinall - Lepas semat SEMUA user
`;

  const buttons = {
    keyboard: [
      [
        { text: "📝 BROADCAST TEXT", style: "primary" },
        { text: "🏷️ BROADCAST TAG", style: "primary" }
      ],
      [
        { text: "📌 BROADCAST PIN", style: "primary" },
        { text: "📸 BROADCAST FOTO", style: "success" }
      ],
      [
        { text: "🏷️ FOTO + TAG", style: "success" },
        { text: "📌 FOTO + PIN", style: "success" }
      ],
      [
        { text: "🎥 BROADCAST VIDEO", style: "primary" },
        { text: "🏷️ VIDEO + TAG", style: "primary" }
      ],
      [
        { text: "📌 VIDEO + PIN", style: "primary" }
      ],
      [
        { text: "📌 LEPAS SEMAT", style: "danger" },
        { text: "🔙 ADMIN", style: "danger" }
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };

  if (botTele) {
    const sent = await botTele.sendMessage(chatId, content, {
      parse_mode: "Markdown",
      reply_markup: buttons
    });
    if (!global.broadcastMenuIds) global.broadcastMenuIds = {};
    global.broadcastMenuIds[chatId] = sent.message_id;
  } else {
    await sendMessage(chatId, content, {
      parse_mode: "Markdown",
      reply_markup: buttons
    });
  }
};

// ==========================================
// 🔥 HANDLE BROADCAST BUTTONS
// ==========================================

const handleBroadcastButtons = async (chatId, text, sendMessage, bot = null) => {
  const botTele = bot || global.telegramBot;
  
  try {
    if (global.broadcastMenuIds && global.broadcastMenuIds[chatId]) {
      await botTele.deleteMessage(chatId, global.broadcastMenuIds[chatId]);
      delete global.broadcastMenuIds[chatId];
    }
  } catch (e) {}
  
  const sendInfo = async (msg) => {
    await sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    setTimeout(async () => {
      await showBroadcastMenu(chatId, sendMessage, botTele);
    }, 3000);
  };
  
  switch (text) {
    case '📝 BROADCAST TEXT':
      return sendInfo(`📝 *BROADCAST TEXT*\n\nKirim perintah:\n/broadcast [pesan]\n\n📌 Contoh:\n/broadcast Halo semua!`);
    case '🏷️ BROADCAST TAG':
      return sendInfo(`🏷️ *BROADCAST + TAG @ALL*\n\nKirim perintah:\n/broadcasttag [pesan]`);
    case '📌 BROADCAST PIN':
      return sendInfo(`📌 *BROADCAST + PIN*\n\nKirim perintah:\n/broadcastpin [pesan]`);
    case '📸 BROADCAST FOTO':
      return sendInfo(`📸 *BROADCAST FOTO*\n\nKirim foto dengan caption:\n/broadcastfoto [caption]`);
    case '🏷️ FOTO + TAG':
      return sendInfo(`🏷️ *FOTO + TAG @ALL*\n\nKirim foto dengan caption:\n/broadcastfototag [caption]`);
    case '📌 FOTO + PIN':
      return sendInfo(`📌 *FOTO + PIN*\n\nKirim foto dengan caption:\n/broadcastfotopin [caption]`);
    case '🎥 BROADCAST VIDEO':
      return sendInfo(`🎥 *BROADCAST VIDEO*\n\nKirim video dengan caption:\n/broadcastvideo [caption]`);
    case '🏷️ VIDEO + TAG':
      return sendInfo(`🏷️ *VIDEO + TAG @ALL*\n\nKirim video dengan caption:\n/broadcastvideotag [caption]`);
    case '📌 VIDEO + PIN':
      return sendInfo(`📌 *VIDEO + PIN*\n\nKirim video dengan caption:\n/broadcastvideopin [caption]`);
    case '🔙 ADMIN':
      return showAdminMenu(chatId, sendMessage, botTele);
    default:
      return false;
  }
};

// ==========================================
// 🔥 EXPORT
// ==========================================

module.exports = {
  showAdminMenu,
  showBroadcastMenu,
  handleBroadcastButtons,
  listUser,
  deleteSewa,
  cekStatusUser,
  addSewaManual,
  addSaldoManual,       // ← BARU
  deleteSaldoManual,    // ← BARU
  handleAdminCommand,
  syncToWABot
};