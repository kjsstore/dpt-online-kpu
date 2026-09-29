// ==========================================
// 🔥 WILAYAH LOOKUP — Pakai nusantara-api
// ==========================================
// Parse "KUALA MULYA, INDRAGIRI HULU"
// → { kelurahan, kecamatan, kabupaten, provinsi }
// ==========================================

const Wilayah = require('nusantara-api');
const w = new Wilayah();

/**
 * Normalisasi nama: lowercase, hapus prefix "kab./kota/kec./kel./desa"
 */
function normalizeName(name) {
    if (!name) return '';
    return String(name)
        .toLowerCase()
        .replace(/^(kab\.?|kabupaten|kota)\s+/i, '')
        .replace(/^(kec\.?|kecamatan)\s+/i, '')
        .replace(/^(kel\.?|kelurahan|desa|desa)\s+/i, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Parse string "KUALA MULYA, INDRAGIRI HULU" 
 * → { kelurahan, kecamatan, kabupaten, provinsi }
 */
function parseWilayah(wilayahStr) {
    const result = {
        kelurahan: '-',
        kecamatan: '-',
        kabupaten: '-',
        provinsi: '-'
    };

    if (!wilayahStr || wilayahStr === '-') return result;

    const parts = String(wilayahStr).split(',').map(s => s.trim());
    const namaKelurahan = parts[0] || '';
    const namaKabupaten = parts[1] || '';

    result.kelurahan = namaKelurahan;
    result.kabupaten = namaKabupaten;

    const normKel = normalizeName(namaKelurahan);
    const normKab = normalizeName(namaKabupaten);

    // ==========================================
    // STEP 1: Lookup kelurahan by nama
    // ==========================================
    let kodeKelurahan = null;

    try {
        // Cari pakai autocomplete (max 100 untuk cover duplikat)
        const hasil = w.autocomplete(namaKelurahan, 100);

        // Filter: kode harus 4 level (xx.xx.xx.xxxx)
        const kandidat = hasil.filter(h => h.kode.split('.').length === 4);

        // Cari yang kabupaten-nya cocok
        let match = null;
        for (const k of kandidat) {
            const kodeKab = k.kode.split('.').slice(0, 2).join('.');
            const namaKabFromKode = normalizeName(w.getName(kodeKab) || '');
            
            if (namaKabFromKode === normKab || 
                namaKabFromKode.includes(normKab) || 
                normKab.includes(namaKabFromKode)) {
                match = k;
                break;
            }
        }

        // Kalau tidak ada yang kabupaten-nya cocok, ambil match pertama
        // (tapi tetap prioritas yang nama-nya persis sama)
        if (!match && kandidat.length > 0) {
            match = kandidat.find(k => normalizeName(k.nama) === normKel) || kandidat[0];
        }

        if (match) kodeKelurahan = match.kode;

    } catch (e) {
        console.log(`⚠️ [WILAYAH] Lookup kelurahan gagal: ${e.message}`);
    }

    // ==========================================
    // STEP 2: Kalau kelurahan ketemu → parse kode
    // ==========================================
    if (kodeKelurahan) {
        const kp = kodeKelurahan.split('.');
        const kodeProvinsi  = kp[0];
        const kodeKabupaten = kp.slice(0, 2).join('.');
        const kodeKecamatan = kp.slice(0, 3).join('.');

        result.kecamatan = (w.getName(kodeKecamatan) || '-');
        result.kabupaten = (w.getName(kodeKabupaten) || '-').replace(/^(Kabupaten|Kota)\s+/i, '');
        result.provinsi  = (w.getName(kodeProvinsi)  || '-').replace(/^Provinsi\s+/i, '');

        // Kalau kecamatan kosong, isi '-'
        if (!result.kecamatan || result.kecamatan === 'undefined') result.kecamatan = '-';
        if (!result.provinsi  || result.provinsi  === 'undefined') result.provinsi  = '-';

        return result;
    }

    // ==========================================
    // STEP 3: Fallback — lookup kabupaten → provinsi
    // ==========================================
    try {
        const hasilKab = w.autocomplete(namaKabupaten, 30);
        const kabMatch = hasilKab.find(h => {
            if (h.kode.split('.').length !== 2) return false;
            const namaKab = normalizeName(h.nama);
            return namaKab === normKab || namaKab.includes(normKab) || normKab.includes(namaKab);
        }) || hasilKab.find(h => h.kode.split('.').length === 2);

        if (kabMatch) {
            result.kabupaten = kabMatch.nama.replace(/^(Kabupaten|Kota)\s+/i, '');
            const kodeProvinsi = kabMatch.kode.split('.')[0];
            result.provinsi = (w.getName(kodeProvinsi) || '-').replace(/^Provinsi\s+/i, '');
        }
    } catch (e) {
        console.log(`⚠️ [WILAYAH] Lookup kabupaten gagal: ${e.message}`);
    }

    return result;
}

// ==========================================
// PRELOAD saat require (biar cepet pas dipakai)
// ==========================================
try {
    w.getStats(); // trigger load
    console.log('✅ [WILAYAH] nusantara-api siap');
} catch (e) {
    console.log(`⚠️ [WILAYAH] Gagal preload: ${e.message}`);
}

module.exports = {
    parseWilayah,
    normalizeName
};