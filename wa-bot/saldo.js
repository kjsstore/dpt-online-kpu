// ============================================================
// 🔥 SALDO.JS - SISTEM SALDO USER
// ============================================================

const fs = require('fs');
const path = require('path');

const SALDO_FILE = path.join(__dirname, 'saldo.json');

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

function getSaldo(userId) {
    const data = loadSaldo();
    return data[String(userId)]?.saldo || 0;
}

function tambahSaldo(userId, amount) {
    const data = loadSaldo();
    const key = String(userId);
    if (!data[key]) data[key] = { saldo: 0, riwayat: [] };
    data[key].saldo += amount;
    data[key].riwayat = data[key].riwayat || [];
    data[key].riwayat.push({
        type: 'topup',
        amount,
        date: new Date().toISOString()
    });
    return saveSaldo(data);
}

function kurangiSaldo(userId, amount) {
    const data = loadSaldo();
    const key = String(userId);
    if (!data[key] || data[key].saldo < amount) return false;
    data[key].saldo -= amount;
    data[key].riwayat = data[key].riwayat || [];
    data[key].riwayat.push({
        type: 'pemakaian',
        amount,
        date: new Date().toISOString()
    });
    return saveSaldo(data);
}

function formatRupiah(num) {
    return Number(num || 0).toLocaleString('id-ID');
}

module.exports = {
    loadSaldo,
    saveSaldo,
    getSaldo,
    tambahSaldo,
    kurangiSaldo,
    formatRupiah
};