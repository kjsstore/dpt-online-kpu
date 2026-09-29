// ============================================================
// WEB_TOKEN.JS - Generate & validasi token untuk web NIK
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN_FILE = path.join(__dirname, 'web_tokens.json');
const TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 menit

// ============================
// LOAD / SAVE TOKEN
// ============================
function loadTokens() {
    try {
        if (!fs.existsSync(TOKEN_FILE)) {
            fs.writeFileSync(TOKEN_FILE, JSON.stringify({}, null, 2));
            return {};
        }
        const raw = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (err) {
        console.error('❌ Load tokens error:', err.message);
        return {};
    }
}

function saveTokens(data) {
    try {
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('❌ Save tokens error:', err.message);
    }
}

// ============================
// GENERATE TOKEN BARU
// ============================
function generateToken(userId) {
    const id = String(userId).trim();
    const token = crypto.randomBytes(16).toString('hex');

    const data = loadTokens();

    // Hapus token lama user ini (kalau ada)
    for (const [key, val] of Object.entries(data)) {
        if (val.userId === id) {
            delete data[key];
        }
    }

    data[token] = {
        userId: id,
        createdAt: Date.now(),
        expiresAt: Date.now() + TOKEN_EXPIRY_MS
    };

    saveTokens(data);
    console.log(`🎫 [TOKEN] Generated untuk ${id}: ${token}`);

    return token;
}

// ============================
// VALIDASI TOKEN
// ============================
function validateToken(token) {
    if (!token) return null;

    const data = loadTokens();
    const entry = data[token];

    if (!entry) return null;

    // Cek expired
    if (Date.now() > entry.expiresAt) {
        delete data[token];
        saveTokens(data);
        console.log(`⏰ [TOKEN] Expired: ${token}`);
        return null;
    }

    return {
        userId: entry.userId,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt
    };
}

// ============================
// HAPUS TOKEN
// ============================
function deleteToken(token) {
    const data = loadTokens();
    if (data[token]) {
        delete data[token];
        saveTokens(data);
        return true;
    }
    return false;
}

// ============================
// CLEANUP TOKEN EXPIRED
// ============================
function cleanupExpired() {
    const data = loadTokens();
    let cleaned = 0;
    const now = Date.now();

    for (const [key, val] of Object.entries(data)) {
        if (now > val.expiresAt) {
            delete data[key];
            cleaned++;
        }
    }

    if (cleaned > 0) {
        saveTokens(data);
        console.log(`🧹 [TOKEN] Cleanup ${cleaned} token expired`);
    }
}

// Auto cleanup tiap 5 menit
setInterval(cleanupExpired, 5 * 60 * 1000);

module.exports = {
    generateToken,
    validateToken,
    deleteToken,
    cleanupExpired,
    TOKEN_EXPIRY_MS
};