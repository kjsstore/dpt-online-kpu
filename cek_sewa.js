// ============================================================
// CEK_SEWA.JS - Baca user sewa dari wa-bot/sewa_aktif.json
// Path: /root/BotKJS/wa-bot/sewa_aktif.json
// ============================================================

const fs = require('fs');

const SEWA_FILE = '/root/BotKJS/wa-bot/sewa_aktif.json';

// ============================
// LOAD DATA SEWA
// ============================
function loadSewa() {
    try {
        if (!fs.existsSync(SEWA_FILE)) {
            console.log(`⚠️ File sewa tidak ditemukan: ${SEWA_FILE}`);
            return {};
        }
        const raw = fs.readFileSync(SEWA_FILE, 'utf8').trim();
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (err) {
        console.error(`❌ Load sewa error:`, err.message);
        return {};
    }
}

// ============================
// CEK USER SEWA AKTIF
// ============================
function isUserSewaAktif(userId) {
    try {
        const id = String(userId).trim();
        const data = loadSewa();
        const user = data[id];

        if (!user) return false;
        if (user.active !== true) return false;

        // Cek expired
        if (user.expired === 'Forever') {
            // Forever = selalu aktif
        } else if (user.expired) {
            if (Date.now() > user.expired) return false;
        }

        if (user.deleted_at) return false;

        return true;
    } catch (err) {
        console.error(`❌ isUserSewaAktif error:`, err.message);
        return false;
    }
}

// ============================
// GET INFO USER SEWA
// ============================
function getSewaInfo(userId) {
    try {
        const id = String(userId).trim();
        const data = loadSewa();
        const user = data[id];

        if (!user) return null;

        return {
            userId: id,
            username: user.username || '-',
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            duration: user.duration || '-',
            start_date: user.start_date || '-',
            expired_date: user.expired_date || '-',
            expired: user.expired || null,
            active: user.active === true,
            daerah: user.daerah || []
        };
    } catch (err) {
        return null;
    }
}

// ============================
// CEK STATUS + PESAN
// ============================
function checkSewaStatus(userId) {
    const id = String(userId).trim();
    const data = loadSewa();
    const user = data[id];

    if (!user) {
        return {
            allowed: false,
            reason: 'NOT_REGISTERED',
            message: `❌ Anda belum terdaftar sebagai user sewa.\n\n📌 Hubungi Owner untuk sewa akses.`
        };
    }

    if (user.deleted_at) {
        return {
            allowed: false,
            reason: 'DELETED',
            message: `❌ Akun sewa Anda telah dihapus oleh admin.\n\n📌 Hubungi Owner untuk info lebih lanjut.`
        };
    }

    if (user.active !== true) {
        return {
            allowed: false,
            reason: 'INACTIVE',
            message: `❌ Akun sewa Anda tidak aktif.\n\n📌 Hubungi Owner untuk perpanjang sewa.`
        };
    }

    if (user.expired && user.expired !== 'Forever' && Date.now() > user.expired) {
        return {
            allowed: false,
            reason: 'EXPIRED',
            message: `❌ Masa sewa Anda sudah habis.\n\n📅 Expired: ${user.expired_date || '-'}\n\n📌 Hubungi Owner untuk perpanjang.`
        };
    }

    return {
        allowed: true,
        reason: 'ACTIVE',
        info: getSewaInfo(id),
        message: `✅ User sewa aktif`
    };
}

module.exports = {
    loadSewa,
    isUserSewaAktif,
    getSewaInfo,
    checkSewaStatus
};