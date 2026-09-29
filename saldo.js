// ============================================================
// 🔥 SALDO.JS - SISTEM SALDO USER (FIXED - HANDLE 2 FORMAT)
// ============================================================

const fs = require('fs');
const path = require('path');

const SALDO_FILE = path.join(__dirname, 'saldo.json');

// ==========================================
// 🔥 LOAD / SAVE
// ==========================================

function loadSaldo() {
    try {
        if (!fs.existsSync(SALDO_FILE)) {
            fs.writeFileSync(SALDO_FILE, '{}');
            return {};
        }
        const raw = fs.readFileSync(SALDO_FILE, 'utf8').trim();
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (e) {
        console.log('❌ [SALDO] Load error:', e.message);
        return {};
    }
}

function saveSaldo(data) {
    try {
        fs.writeFileSync(SALDO_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        console.log('❌ [SALDO] Save error:', e.message);
        return false;
    }
}

// ==========================================
// 🔥 HELPER: PARSE ENTRY (HANDLE 2 FORMAT)
// ==========================================

/**
 * Normalisasi entry jadi format { saldo, riwayat }
 * Support 2 format:
 *   - Flat:   5000
 *   - Nested: { saldo: 5000, riwayat: [] }
 */
function normalizeEntry(entry) {
    if (entry === undefined || entry === null) {
        return { saldo: 0, riwayat: [] };
    }
    if (typeof entry === 'number') {
        // Format flat
        return { saldo: entry, riwayat: [] };
    }
    if (typeof entry === 'object') {
        // Format nested
        return {
            saldo: Number(entry.saldo) || 0,
            riwayat: Array.isArray(entry.riwayat) ? entry.riwayat : []
        };
    }
    return { saldo: 0, riwayat: [] };
}

// ==========================================
// 🔥 GET SALDO
// ==========================================

function getSaldo(userId) {
    const data = loadSaldo();
    const entry = data[String(userId)];
    const normalized = normalizeEntry(entry);
    return normalized.saldo;
}

// ==========================================
// 🔥 GET RAW (BUAT CEK RIWAYAT DLL)
// ==========================================

function getSaldoRaw(userId) {
    const data = loadSaldo();
    const entry = data[String(userId)];
    return normalizeEntry(entry);
}

// ==========================================
// 🔥 TAMBAH SALDO
// ==========================================

function tambahSaldo(userId, amount) {
    const data = loadSaldo();
    const key = String(userId);
    const entry = normalizeEntry(data[key]);

    entry.saldo += Number(amount) || 0;
    entry.riwayat.push({
        type: 'topup',
        amount: Number(amount) || 0,
        date: new Date().toISOString()
    });

    // Batasi riwayat max 100 entry
    if (entry.riwayat.length > 100) {
        entry.riwayat = entry.riwayat.slice(-100);
    }

    data[key] = entry;
    return saveSaldo(data);
}

// ==========================================
// 🔥 KURANGI SALDO
// ==========================================

function kurangiSaldo(userId, amount) {
    const data = loadSaldo();
    const key = String(userId);
    const entry = normalizeEntry(data[key]);

    const nominal = Number(amount) || 0;
    if (entry.saldo < nominal) return false;

    entry.saldo -= nominal;
    entry.riwayat.push({
        type: 'pemakaian',
        amount: nominal,
        date: new Date().toISOString()
    });

    // Batasi riwayat max 100 entry
    if (entry.riwayat.length > 100) {
        entry.riwayat = entry.riwayat.slice(-100);
    }

    data[key] = entry;
    return saveSaldo(data);
}

// ==========================================
// 🔥 SET SALDO (SET LANGSUNG, TANPA RIWAYAT)
// ==========================================

function setSaldo(userId, amount) {
    const data = loadSaldo();
    const key = String(userId);
    const entry = normalizeEntry(data[key]);

    entry.saldo = Number(amount) || 0;
    entry.riwayat.push({
        type: 'set',
        amount: entry.saldo,
        date: new Date().toISOString()
    });

    // Batasi riwayat max 100 entry
    if (entry.riwayat.length > 100) {
        entry.riwayat = entry.riwayat.slice(-100);
    }

    data[key] = entry;
    return saveSaldo(data);
}

// ==========================================
// 🔥 FORMAT RUPIAH
// ==========================================

function formatRupiah(num) {
    return Number(num || 0).toLocaleString('id-ID');
}

// ==========================================
// 🔥 EXPORT
// ==========================================

module.exports = {
    loadSaldo,
    saveSaldo,
    getSaldo,
    getSaldoRaw,      // ← BARU
    tambahSaldo,
    kurangiSaldo,
    setSaldo,         // ← BARU
    formatRupiah
};