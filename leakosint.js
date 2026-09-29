// ==========================================
// 🔥 LEAKOSINT API INTEGRATION (PASSPORT TIDAK DISENSOR)
// ==========================================

const axios = require('axios');

// ==========================================
// 🔥 KONFIGURASI
// ==========================================

const LEAKOSINT_CONFIG = {
    API_URL: 'https://leakosintapi.com/',
    API_TOKEN: '8677011932:05EaVBXT',
    DEFAULT_LANG: 'id',
    DEFAULT_LIMIT: 300,
};

// ==========================================
// 🔥 FUNGSI ESCAPE HTML
// ==========================================

function escapeHtml(text) {
    if (!text) return '';
    text = String(text);
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, ' ');
}

// ==========================================
// 🔥 FUNGSI FORMAT NOMOR TELEPON INDONESIA
// ==========================================

function formatPhone(phone) {
    if (!phone || phone === 'None' || phone === 'null') return '❌ Tidak tersedia';
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '62' + clean.slice(1);
    if (!clean.startsWith('62')) clean = '62' + clean;
    return clean;
}

// ==========================================
// 🔥 FUNGSI FORMAT TANGGAL
// ==========================================

function formatDate(dateStr) {
    if (!dateStr) return '❌ Tidak tersedia';
    try {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            return `${parts[2]} ${months[parseInt(parts[1])-1]} ${parts[0]}`;
        }
        return dateStr;
    } catch (e) {
        return dateStr;
    }
}

// ==========================================
// 🔥 FUNGSI FORMAT HASIL (PASSPORT TIDAK DISENSOR)
// ==========================================

function formatResultsForTelegram(result, maxLength = 3800) {
    if (!result.success) {
        return `❌ Error: ${result.error}`;
    }
    
    if (result.total === 0) {
        return `🔍 Tidak ada hasil ditemukan untuk kata kunci tersebut.`;
    }
    
    // ========== HEADER ==========
    let text = `<b>🔍 HASIL PENCARIAN DATA</b>\n`;
    text += `<code>━━━━━━━━━━━━━━━━━━━━━━</code>\n`;
    text += `📊 Total: <b>${result.total}</b> data ditemukan\n`;
    text += `⏰ Waktu: ${new Date().toLocaleString('id-ID')}\n`;
    text += `<code>━━━━━━━━━━━━━━━━━━━━━━</code>\n\n`;
    
    let currentLength = text.length;
    let dbCounter = 0;
    
    for (const db of result.results) {
        if (currentLength > maxLength) break;
        dbCounter++;
        
        // ========== NAMA DATABASE ==========
        text += `<b>📁 ${escapeHtml(db.database)}</b>\n`;
        text += `<code>┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈</code>\n`;
        
        // ========== INFO DATABASE ==========
        if (db.info) {
            let info = escapeHtml(db.info);
            if (info.length > 200) info = info.substring(0, 200) + '...';
            text += `📌 <i>${info}</i>\n`;
            text += `<code>┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈</code>\n`;
        }
        
        // ========== DATA ==========
        let itemCounter = 0;
        for (const item of db.data) {
            if (currentLength > maxLength) {
                text += `\n⚠️ <i>Data terpotong...</i>`;
                break;
            }
            itemCounter++;
            
            // Header item
            if (db.data.length > 1) {
                text += `\n<b>📌 Data #${itemCounter}</b>\n`;
            }
            
            // Fields
            for (const key in item) {
                let value = item[key];
                
                // ==========================================
                // 🔥 HANYA PASSWORD YANG DISENSOR!
                // PASSPORT TIDAK DISENSOR!
                // ==========================================
                if (key.toLowerCase() === 'password' || 
                    key.toLowerCase() === 'pass' || 
                    key.toLowerCase().includes('passwd')) {
                    value = '••••••••';
                }
                // Passport, PassportNumber, dll tetap ditampilkan!
                
                // Format khusus
                let displayKey = key;
                let displayValue = escapeHtml(String(value));
                
                // Format nomor telepon
                if (key.toLowerCase().includes('phone') || key.toLowerCase().includes('tel') || key.toLowerCase().includes('hp')) {
                    const formatted = formatPhone(value);
                    displayValue = `<a href="tel:${formatted}">${displayValue}</a>`;
                }
                
                // Format tanggal
                if (key.toLowerCase().includes('date') || key.toLowerCase().includes('birth') || key.toLowerCase().includes('tgl')) {
                    displayValue = formatDate(value);
                }
                
                // Format email
                if (key.toLowerCase().includes('email')) {
                    displayValue = `<a href="mailto:${escapeHtml(String(value))}">${displayValue}</a>`;
                }
                
                // Ganti nama field agar lebih rapi
                const fieldNames = {
                    'FullName': '👤 Nama Lengkap',
                    'Email': '📧 Email',
                    'Phone': '📱 Telepon',
                    'BDay': '🎂 Tanggal Lahir',
                    'Gender': '⚧ Jenis Kelamin',
                    'Nationality': '🌍 Kewarganegaraan',
                    'DocNumber': '🪪 Nomor Dokumen',
                    'Passport': '🛂 Passport',
                    'PassportNumber': '🛂 Passport',
                    'Provider': '📶 Provider',
                    'RegDate': '📅 Tgl Registrasi',
                    'Type': '📋 Tipe',
                    'Category': '🏷 Kategori',
                    'Lang': '🌐 Bahasa',
                    'Address': '📍 Alamat',
                    'City': '🏙 Kota',
                    'Province': '🗺 Provinsi',
                    'PostalCode': '📮 Kode Pos',
                    'Username': '👤 Username',
                    'Password': '🔒 Password',
                };
                
                displayKey = fieldNames[displayKey] || displayKey;
                
                text += `├ ${displayKey}: ${displayValue}\n`;
                currentLength += displayKey.length + String(displayValue).length + 10;
            }
            
            // Tombol WhatsApp (jika ada nomor)
            if (item.Phone && item.Phone !== 'None' && item.Phone !== 'null') {
                const phone = formatPhone(item.Phone);
                if (phone && phone !== '62') {
                    text += `└─ <a href="https://wa.me/${phone}">💬 Chat WhatsApp</a>\n`;
                }
            }
            
            text += `\n`;
            currentLength += 2;
        }
        
        text += `\n`;
        currentLength += 2;
    }
    
    // ========== FOOTER ==========
    if (text.length > maxLength) {
        text = text.substring(0, maxLength - 50) + `\n\n⚠️ <i>Data terpotong...</i>`;
    }
    
    text += `\n<code>━━━━━━━━━━━━━━━━━━━━━━</code>\n`;
    text += `📌 <i>Klik nomor telepon untuk menghubungi</i>`;
    
    return text;
}

// ==========================================
// 🔥 FUNGSI SEARCH
// ==========================================

async function searchLeak(query, options = {}) {
    try {
        const limit = options.limit || LEAKOSINT_CONFIG.DEFAULT_LIMIT;
        const lang = options.lang || LEAKOSINT_CONFIG.DEFAULT_LANG;
        
        const payload = {
            token: LEAKOSINT_CONFIG.API_TOKEN,
            request: query,
            limit: limit,
            lang: lang
        };
        
        console.log(`🔍 [LEAKOSINT] Mencari: ${query}`);
        
        const response = await axios.post(LEAKOSINT_CONFIG.API_URL, payload, {
            timeout: 30000
        });
        
        const data = response.data;
        console.log(`📥 [LEAKOSINT] Response diterima`);
        
        if (data["Error code"]) {
            return { success: false, error: data["Error code"] };
        }
        
        let results = [];
        let total = 0;
        
        if (data.List) {
            for (const dbName in data.List) {
                const dbData = data.List[dbName];
                if (dbName === "No results found") continue;
                total += dbData.Data ? dbData.Data.length : 0;
                results.push({
                    database: dbName,
                    info: dbData.InfoLeak || '',
                    data: dbData.Data || []
                });
            }
        }
        
        return { success: true, total: total, results: results, raw: data };
        
    } catch (error) {
        console.error(`❌ [LEAKOSINT] Error:`, error.message);
        return { success: false, error: error.message };
    }
}

// ==========================================
// 🔥 FUNGSI CEK SALDO
// ==========================================

async function checkBalance() {
    try {
        const payload = { token: LEAKOSINT_CONFIG.API_TOKEN, request: 'balance' };
        const response = await axios.post(LEAKOSINT_CONFIG.API_URL, payload, { timeout: 10000 });
        return { success: true, data: response.data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ==========================================
// 🔥 FUNGSI CEK STATUS
// ==========================================

async function checkStatus() {
    try {
        const payload = { token: LEAKOSINT_CONFIG.API_TOKEN, request: 'status' };
        const response = await axios.post(LEAKOSINT_CONFIG.API_URL, payload, { timeout: 10000 });
        return { success: true, data: response.data };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ==========================================
// 🔥 EXPORT
// ==========================================

module.exports = {
    searchLeak,
    formatResultsForTelegram,
    checkBalance,
    checkStatus,
    LEAKOSINT_CONFIG
};