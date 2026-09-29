// ============================================================
// FREE_QUOTA.JS - Kelola 3 free per hari (reset 00:00 WIB)
// ============================================================

const fs = require('fs');
const path = require('path');

const QUOTA_FILE = path.join(__dirname, 'free_quota.json');
const MAX_FREE = 6;

function loadQuota() {
    try {
        if (!fs.existsSync(QUOTA_FILE)) {
            fs.writeFileSync(QUOTA_FILE, JSON.stringify({}, null, 2));
            return {};
        }
        const raw = fs.readFileSync(QUOTA_FILE, 'utf8').trim();
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (err) {
        console.error('❌ Load quota error:', err.message);
        return {};
    }
}

function saveQuota(data) {
    try {
        fs.writeFileSync(QUOTA_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('❌ Save quota error:', err.message);
    }
}

function getTodayWIB() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function getFreeQuota(userId) {
    const id = String(userId).trim();
    const data = loadQuota();
    const today = getTodayWIB();

    let userQuota = data[id];

    if (!userQuota || userQuota.date !== today) {
        userQuota = {
            used: 0,
            date: today,
            total: userQuota?.total || 0
        };
        data[id] = userQuota;
        saveQuota(data);
    }

    return {
        used: userQuota.used,
        remaining: Math.max(0, MAX_FREE - userQuota.used),
        max: MAX_FREE,
        date: userQuota.date,
        total: userQuota.total
    };
}

function useFreeQuota(userId) {
    const id = String(userId).trim();
    const data = loadQuota();
    const today = getTodayWIB();

    let userQuota = data[id];

    if (!userQuota || userQuota.date !== today) {
        userQuota = {
            used: 0,
            date: today,
            total: userQuota?.total || 0
        };
    }

    if (userQuota.used >= MAX_FREE) {
        return { success: false, message: 'Free harian habis. Coba lagi besok.' };
    }

    userQuota.used += 1;
    userQuota.total = (userQuota.total || 0) + 1;
    data[id] = userQuota;
    saveQuota(data);

    return {
        success: true,
        used: userQuota.used,
        remaining: MAX_FREE - userQuota.used,
        max: MAX_FREE
    };
}

function resetFreeQuota(userId) {
    const id = String(userId).trim();
    const data = loadQuota();
    data[id] = {
        used: 0,
        date: getTodayWIB(),
        total: data[id]?.total || 0
    };
    saveQuota(data);
    return getFreeQuota(id);
}

module.exports = {
    getFreeQuota,
    useFreeQuota,
    resetFreeQuota,
    MAX_FREE
};