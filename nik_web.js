// ============================================================
// NIK_WEB.JS - Versi standalone untuk web cek NIK
// Tidak butuh coin.js, unlimited.js, maintenance.js
// ============================================================

// ============================================================
// API KONFIGURASI
// ============================================================
const API_CONFIGS = [
    {
        name: 'Leakosint',
        url: 'https://leakosintapi.com/',
        token: '8714776841:5pdmtQyw',
        method: 'POST',
        format: (nik) => ({
            token: '8714776841:5pdmtQyw',
            request: nik,
            limit: 100,
            lang: 'id'
        })
    }
];

const NIK_REGEX = /^\d{16}$/;

console.log(`📱 [NIK WEB] Standalone mode`);
console.log(`📊 API: ${API_CONFIGS.map(a => a.name).join(', ')}`);

// ============================
// VALIDASI NIK
// ============================
function validateNik(nik) {
    if (!nik) return { valid: false, message: '❌ NIK harus diisi' };
    const cleaned = nik.toString().trim();

    if (!NIK_REGEX.test(cleaned)) {
        return { valid: false, message: '❌ NIK harus 16 digit angka' };
    }

    const invalidPatterns = [
        /^(\d)\1{15}$/,
        /^1234567890123456$/,
        /^0000000000000000$/,
        /^1111111111111111$/,
        /^2222222222222222$/,
        /^3333333333333333$/,
        /^4444444444444444$/,
        /^5555555555555555$/,
        /^6666666666666666$/,
        /^7777777777777777$/,
        /^8888888888888888$/,
        /^9999999999999999$/
    ];

    for (const pattern of invalidPatterns) {
        if (pattern.test(cleaned)) {
            return { valid: false, message: '❌ NIK tidak valid (terlalu sederhana)' };
        }
    }

    return { valid: true, nik: cleaned };
}

// ============================
// FORMAT HASIL DATA
// ============================
function formatHasilData(data, nik) {
    const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    if (!data || data.length === 0) {
        return '❌ Tidak ada data untuk NIK: ' + nik;
    }

    const allPhones = [];

    data.forEach((item) => {
        const records = item.records || [];
        const sumber = item.sumber || 'Tidak diketahui';

        records.forEach((record) => {
            if (typeof record === 'object' && record !== null) {
                for (const key of Object.keys(record)) {
                    const value = record[key];
                    if (value !== null && value !== undefined && value !== '') {
                        const keyLower = key.toLowerCase();
                        if (keyLower.includes('phone') ||
                            keyLower.includes('tel') ||
                            keyLower === 'telepon' ||
                            keyLower === 'hp' ||
                            keyLower === 'handphone') {
                            const cleanPhone = String(value).replace(/[^0-9]/g, '');
                            if (cleanPhone.length >= 10) {
                                const waNumber = cleanPhone.startsWith('62') ? cleanPhone : '62' + cleanPhone;
                                if (!allPhones.some(p => p.phone === cleanPhone)) {
                                    allPhones.push({
                                        phone: cleanPhone,
                                        waLink: 'https://wa.me/' + waNumber,
                                        sumber: sumber,
                                        provider: record.Provider || record.provider || '-',
                                        regDate: record.RegDate || record.regDate || '-',
                                        email: record.Email || record.email || '-',
                                        name: record.Name || record.name || '-'
                                    });
                                }
                            }
                        }
                    }
                }
            }
        });
    });

    if (allPhones.length === 0) {
        return `❌ Tidak ada nomor HP ditemukan untuk NIK: ${nik}`;
    }

    // ===== HEADER =====
    let teks = '📱 NIK TO HP\n';
    teks += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    // ===== INFO NIK =====
    teks += '🆔 NIK\n';
    teks += '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n';
    teks += nik + '\n\n';

    // ===== HASIL NOMOR HP =====
    teks += '📱 DAFTAR NOMOR HP\n';
    teks += '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄\n';

    allPhones.forEach((item, index) => {
        const num = String(index + 1).padStart(2, '0');

        teks += num + '. ' + item.phone;

        if (item.provider && item.provider !== '-') {
            teks += '  [' + item.provider + ']';
        }
        teks += '\n';

        teks += '   ↳ 🔗 wa.me/' + item.phone + '\n';

        if (item.email && item.email !== '-') {
            teks += '   ↳ 📧 ' + item.email + '\n';
        }

        if (item.name && item.name !== '-') {
            teks += '   ↳ 👤 ' + item.name + '\n';
        }

        if (item.regDate && item.regDate !== '-') {
            teks += '   ↳ 📅 ' + item.regDate + '\n';
        }

        if (index < allPhones.length - 1) {
            teks += '\n';
        }
    });

    teks += '\n';

    // ===== FOOTER =====
    teks += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    teks += '📊 TOTAL: ' + allPhones.length + ' nomor HP\n';
    teks += '⏰ ' + waktu + '\n';
    teks += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    teks += '⚠️ Data ini bersifat rahasia! Jangan disebarluaskan.';

    return teks;
}

// ============================
// PARSE LEAKOSINT RESPONSE
// ============================
function parseLeakosintResponse(response) {
    const result = [];

    console.log('🔍 [PARSER] Starting to parse Leakosint response...');

    if (!response || typeof response !== 'object') {
        console.log('⚠️ [PARSER] Invalid response object');
        return result;
    }

    let dataFound = false;

    // Format 1: { List: { ... } }
    if (response.List && typeof response.List === 'object') {
        console.log(`📊 [PARSER] Found List with ${Object.keys(response.List).length} entries`);

        for (const [dbName, dbData] of Object.entries(response.List)) {
            if (dbName === "No results found") {
                console.log(`ℹ️ [PARSER] Skipping "No results found"`);
                continue;
            }

            let records = [];

            if (dbData.Data && Array.isArray(dbData.Data)) {
                records = dbData.Data.filter(r => r && typeof r === 'object' && Object.keys(r).length > 0);
            } else if (dbData.Phone || dbData.phone || dbData.telepon || dbData.hp) {
                records = [dbData];
            }

            if (records.length > 0) {
                const cleanRecords = records.map(record => {
                    const clean = {};
                    const fieldMap = {
                        'phone': 'Phone', 'Phone': 'Phone', 'telepon': 'Phone',
                        'hp': 'Phone', 'HP': 'Phone', 'handphone': 'Phone',
                        'email': 'Email', 'Email': 'Email',
                        'name': 'Name', 'Name': 'Name', 'nama': 'Name',
                        'provider': 'Provider', 'Provider': 'Provider',
                        'regDate': 'RegDate', 'RegDate': 'RegDate', 'reg_date': 'RegDate',
                        'address': 'Address', 'Address': 'Address', 'alamat': 'Address'
                    };

                    for (const [oldKey, newKey] of Object.entries(fieldMap)) {
                        if (record[oldKey] !== undefined && record[oldKey] !== null && record[oldKey] !== '') {
                            clean[newKey] = record[oldKey];
                        }
                    }

                    for (const [k, v] of Object.entries(record)) {
                        if (!fieldMap[k] && v !== null && v !== undefined && v !== '') {
                            clean[k] = v;
                        }
                    }

                    return clean;
                }).filter(r => Object.keys(r).length > 0);

                if (cleanRecords.length > 0) {
                    result.push({
                        sumber: dbName,
                        info_bocor: dbData.InfoLeak || dbData.info_bocor || '',
                        records: cleanRecords
                    });
                    dataFound = true;
                    console.log(`✅ [PARSER] Found ${cleanRecords.length} records in ${dbName}`);
                }
            }
        }
    }

    // Format 2: { data: [ ... ] }
    if (!dataFound && response.data && Array.isArray(response.data)) {
        console.log(`📊 [PARSER] Found data array with ${response.data.length} items`);
        const records = response.data.filter(r => r && typeof r === 'object' && Object.keys(r).length > 0);

        if (records.length > 0) {
            const cleanRecords = records.map(record => {
                const clean = {};
                for (const [k, v] of Object.entries(record)) {
                    if (v !== null && v !== undefined && v !== '') {
                        const lowerK = k.toLowerCase();
                        if (lowerK.includes('phone') || lowerK.includes('tel') || lowerK === 'telepon' || lowerK === 'hp') {
                            clean.Phone = v;
                        } else if (lowerK.includes('email')) {
                            clean.Email = v;
                        } else if (lowerK.includes('name') || lowerK.includes('nama')) {
                            clean.Name = v;
                        } else if (lowerK.includes('provider')) {
                            clean.Provider = v;
                        } else if (lowerK.includes('date') || lowerK.includes('reg')) {
                            clean.RegDate = v;
                        } else {
                            clean[k] = v;
                        }
                    }
                }
                return clean;
            }).filter(r => Object.keys(r).length > 0);

            if (cleanRecords.length > 0) {
                result.push({
                    sumber: 'Leakosint Data',
                    info_bocor: response.info_bocor || response.InfoLeak || '',
                    records: cleanRecords
                });
                dataFound = true;
                console.log(`✅ [PARSER] Found ${cleanRecords.length} records in data array`);
            }
        }
    }

    // Format 3: Langsung object
    if (!dataFound) {
        const keys = Object.keys(response).filter(k =>
            k !== 'status' && k !== 'message' && k !== 'success' && k !== 'List' && k !== 'data'
        );

        for (const key of keys) {
            const value = response[key];
            if (value && typeof value === 'object') {
                let records = [];

                if (Array.isArray(value)) {
                    records = value.filter(r => r && typeof r === 'object' && Object.keys(r).length > 0);
                } else if (value.Phone || value.phone || value.telepon || value.hp) {
                    records = [value];
                }

                if (records.length > 0) {
                    const cleanRecords = records.map(record => {
                        const clean = {};
                        for (const [k, v] of Object.entries(record)) {
                            if (v !== null && v !== undefined && v !== '') {
                                const lowerK = k.toLowerCase();
                                if (lowerK.includes('phone') || lowerK.includes('tel') || lowerK === 'telepon' || lowerK === 'hp') {
                                    clean.Phone = v;
                                } else if (lowerK.includes('email')) {
                                    clean.Email = v;
                                } else if (lowerK.includes('name') || lowerK.includes('nama')) {
                                    clean.Name = v;
                                } else if (lowerK.includes('provider')) {
                                    clean.Provider = v;
                                } else if (lowerK.includes('date') || lowerK.includes('reg')) {
                                    clean.RegDate = v;
                                } else {
                                    clean[k] = v;
                                }
                            }
                        }
                        return clean;
                    }).filter(r => Object.keys(r).length > 0);

                    if (cleanRecords.length > 0) {
                        result.push({
                            sumber: key,
                            info_bocor: '',
                            records: cleanRecords
                        });
                        dataFound = true;
                        console.log(`✅ [PARSER] Found ${cleanRecords.length} records in field ${key}`);
                    }
                }
            }
        }
    }

    if (!dataFound) {
        console.log(`⚠️ [PARSER] No data found in any format`);
        if (response.message) console.log(`📝 [PARSER] Message: ${response.message}`);
        if (response.status) console.log(`📝 [PARSER] Status: ${response.status}`);
    }

    console.log(`📊 [PARSER] Total sources parsed: ${result.length}`);
    return result;
}

// ============================
// CEK NIK DENGAN LEAKOSINT
// ============================
async function cekNikDenganAPI(nik) {
    const errors = [];
    const successData = [];

    console.log(`🔍 [START] Checking NIK: ${nik} with Leakosint API`);

    for (const api of API_CONFIGS) {
        try {
            console.log(`🔍 [${api.name}] Mencoba NIK: ${nik}`);

            const options = {
                method: api.method,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                body: JSON.stringify(api.format(nik))
            };

            console.log(`📤 [${api.name}] URL: ${api.url}`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);

            const response = await fetch(api.url, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            console.log(`📱 [${api.name}] Status: ${response.status}`);

            if (!response.ok) {
                console.log(`⚠️ [${api.name}] HTTP ${response.status}`);
                errors.push(`${api.name}: HTTP ${response.status}`);
                continue;
            }

            const rawResponse = await response.text();
            console.log(`📦 [${api.name}] Response preview:`, rawResponse.substring(0, 300));

            let json;
            try {
                json = JSON.parse(rawResponse);
            } catch (e) {
                console.log(`⚠️ [${api.name}] Invalid JSON:`, e.message);
                errors.push(`${api.name}: Invalid JSON`);
                continue;
            }

            const result = parseLeakosintResponse(json);

            if (result && result.length > 0) {
                let hasPhone = false;
                for (const item of result) {
                    for (const record of item.records) {
                        if (record.Phone || record.phone || record.telepon || record.hp || record.HP) {
                            hasPhone = true;
                            break;
                        }
                    }
                    if (hasPhone) break;
                }

                if (hasPhone) {
                    console.log(`✅ [${api.name}] BERHASIL! Found ${result.length} sources`);
                    successData.push({
                        source: api.name,
                        data: result
                    });
                } else {
                    console.log(`⚠️ [${api.name}] No phone numbers found`);
                    errors.push(`${api.name}: No phone numbers found`);
                }
            } else {
                console.log(`⚠️ [${api.name}] No data found`);
                errors.push(`${api.name}: No data found`);
            }

        } catch (error) {
            console.log(`❌ [${api.name}] Error:`, error.message);
            errors.push(`${api.name}: ${error.message}`);
        }
    }

    if (successData.length > 0) {
        const combinedData = [];
        for (const success of successData) {
            combinedData.push(...success.data);
        }

        const totalRecords = combinedData.reduce((sum, item) => sum + (item.records ? item.records.length : 0), 0);

        console.log(`✅ [SUMMARY] Total: ${combinedData.length} sources, ${totalRecords} records`);

        return {
            success: true,
            data: combinedData,
            total: totalRecords,
            sources: successData.map(s => s.source)
        };
    }

    console.log(`❌ [SUMMARY] API gagal. Errors: ${errors.join('; ')}`);
    return {
        success: false,
        message: `❌ ${errors.join('; ')}`
    };
}

module.exports = {
    cekNikDenganAPI,
    formatHasilData,
    validateNik
};

console.log('✅ [NIK WEB] Module loaded successfully!');