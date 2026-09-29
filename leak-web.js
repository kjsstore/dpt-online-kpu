// ==========================================
// 🔥 LEAKOSINT WEB SERVER
// ==========================================

const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3006;

const TOKEN = '8677011932:05EaVBXT';
const API_URL = 'https://leakosintapi.com/';

// ==========================================
// 🔥 FUNGSI FORMAT
// ==========================================

function escapeHtml(text) {
    if (!text) return '';
    text = String(text);
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatPhone(phone) {
    if (!phone || phone === 'None' || phone === 'null') return '';
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '62' + clean.slice(1);
    if (!clean.startsWith('62')) clean = '62' + clean;
    return clean;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
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
// 🔥 GENERATE HTML
// ==========================================

function generateHTML(result, query, error = null) {
    if (error) {
        return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Error</title>
<style>
body { font-family: Arial; background: #0a0a0a; color: #e0e0e0; padding: 50px; text-align: center; }
.error { color: #ff4444; font-size: 24px; }
</style>
</head>
<body>
<div class="error">❌ Error: ${escapeHtml(error)}</div>
</body>
</html>`;
    }

    if (!result.success || result.total === 0) {
        return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Hasil Pencarian</title>
<style>
body { font-family: Arial; background: #0a0a0a; color: #e0e0e0; padding: 50px; text-align: center; }
.notfound { color: #ffaa44; font-size: 20px; }
</style>
</head>
<body>
<div class="notfound">🔍 Tidak ada hasil ditemukan untuk: <b>${escapeHtml(query)}</b></div>
</body>
</html>`;
    }

    let html = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔍 Hasil Pencarian - ${escapeHtml(query)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            background: #0a0a0a;
            color: #e0e0e0;
            padding: 20px;
            min-height: 100vh;
        }
        .container { max-width: 900px; margin: 0 auto; }
        .header {
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 25px;
            border: 1px solid #2a2a4a;
        }
        .header h1 {
            font-size: 28px;
            background: linear-gradient(90deg, #00d2ff, #3a7bd5);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 8px;
        }
        .header .sub { color: #8899aa; font-size: 14px; }
        .header .sub span { color: #00d2ff; }
        .stats {
            display: flex;
            gap: 20px;
            flex-wrap: wrap;
            margin-top: 15px;
        }
        .stats .stat {
            background: rgba(255,255,255,0.05);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 13px;
            border: 1px solid #2a2a4a;
        }
        .stats .stat strong { color: #00d2ff; }
        .db-card {
            background: #12121f;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            border: 1px solid #1e2a3a;
        }
        .db-card:hover { border-color: #3a7bd5; }
        .db-name {
            font-size: 20px;
            font-weight: bold;
            color: #00d2ff;
            margin-bottom: 8px;
        }
        .db-info {
            color: #8899aa;
            font-size: 13px;
            margin-bottom: 15px;
            padding: 10px 15px;
            background: rgba(0,210,255,0.05);
            border-radius: 8px;
            border-left: 3px solid #00d2ff;
        }
        .divider {
            border: none;
            height: 1px;
            background: linear-gradient(90deg, transparent, #2a3a5a, transparent);
            margin: 10px 0 15px 0;
        }
        .data-item {
            background: #0d0d1a;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 10px;
            border-left: 3px solid #2a3a5a;
        }
        .data-item .item-header {
            font-size: 12px;
            color: #667788;
            margin-bottom: 6px;
        }
        .field {
            display: flex;
            padding: 3px 0;
            font-size: 14px;
            border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .field:last-child { border-bottom: none; }
        .field .key {
            color: #8899aa;
            min-width: 140px;
            font-weight: 500;
        }
        .field .value { color: #e0e0e0; word-break: break-all; }
        .field .value a { color: #00d2ff; text-decoration: none; }
        .field .value a:hover { text-decoration: underline; }
        .whatsapp-btn {
            display: inline-block;
            background: #25D366;
            color: white !important;
            padding: 4px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-decoration: none;
            margin-top: 6px;
        }
        .whatsapp-btn:hover { background: #1da851; }
        .footer {
            text-align: center;
            color: #445566;
            font-size: 12px;
            padding: 20px 0;
            border-top: 1px solid #1a2a3a;
            margin-top: 20px;
        }
        .badge {
            display: inline-block;
            background: rgba(0,210,255,0.15);
            color: #00d2ff;
            padding: 2px 10px;
            border-radius: 12px;
            font-size: 11px;
            margin-left: 8px;
        }
        @media (max-width: 600px) {
            .field { flex-direction: column; padding: 5px 0; }
            .field .key { min-width: auto; font-size: 12px; }
            .field .value { font-size: 13px; }
            .stats .stat { font-size: 11px; padding: 5px 12px; }
            .header h1 { font-size: 20px; }
            .db-name { font-size: 17px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 HASIL PENCARIAN DATA</h1>
            <div class="sub">Kata kunci: <span>${escapeHtml(query)}</span></div>
            <div class="stats">
                <div class="stat">📊 Total: <strong>${result.total}</strong> data</div>
                <div class="stat">⏰ Waktu: <strong>${new Date().toLocaleString('id-ID')}</strong></div>
                <div class="stat">📁 Database: <strong>${result.results.length}</strong></div>
            </div>
        </div>`;

    // Database
    let dbCounter = 0;
    for (const db of result.results) {
        dbCounter++;
        const itemCount = db.data ? db.data.length : 0;
        
        html += `
        <div class="db-card">
            <div class="db-name">📁 ${escapeHtml(db.database)} <span class="badge">${itemCount} data</span></div>`;
        
        if (db.info) {
            html += `<div class="db-info">📌 ${escapeHtml(db.info)}</div>`;
        }
        
        html += `<hr class="divider">`;
        
        if (db.data && db.data.length > 0) {
            let itemCounter = 0;
            for (const item of db.data) {
                itemCounter++;
                html += `
            <div class="data-item">
                <div class="item-header">📌 Data #${itemCounter}</div>`;
                
                for (const key in item) {
                    let value = item[key];
                    
                    if (key.toLowerCase() === 'password' || key.toLowerCase() === 'pass' || key.toLowerCase().includes('passwd')) {
                        value = '••••••••';
                    }
                    
                    let displayValue = escapeHtml(String(value));
                    
                    // Format tanggal
                    if (key.toLowerCase().includes('date') || key.toLowerCase().includes('birth') || key.toLowerCase().includes('tgl')) {
                        displayValue = formatDate(value);
                    }
                    
                    // Format email
                    if (key.toLowerCase().includes('email') && value && value !== 'None') {
                        displayValue = `<a href="mailto:${escapeHtml(String(value))}">${displayValue}</a>`;
                    }
                    
                    // Format telepon + WhatsApp
                    let isPhone = key.toLowerCase().includes('phone') || key.toLowerCase().includes('tel') || key.toLowerCase().includes('hp');
                    let phoneLink = '';
                    if (isPhone && value && value !== 'None' && value !== 'null') {
                        const formatted = formatPhone(value);
                        if (formatted && formatted !== '62') {
                            phoneLink = `<br><a href="https://wa.me/${formatted}" class="whatsapp-btn">💬 Chat WhatsApp</a>`;
                        }
                    }
                    
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
                    
                    const displayKey = fieldNames[key] || key;
                    
                    html += `
                <div class="field">
                    <span class="key">${displayKey}</span>
                    <span class="value">${displayValue}${phoneLink}</span>
                </div>`;
                }
                
                html += `
            </div>`;
            }
        }
        
        html += `
        </div>`;
    }

    html += `
        <div class="footer">
            🔍 Dicari melalui Leakosint API • ${new Date().toLocaleString('id-ID')}
        </div>
    </div>
</body>
</html>`;

    return html;
}

// ==========================================
// 🔥 ROUTE WEB
// ==========================================

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Leak Checker</title>
<style>
body { font-family: Arial; background: #0a0a0a; color: #e0e0e0; padding: 50px; text-align: center; }
input { padding: 12px 20px; width: 400px; border-radius: 8px; border: 1px solid #2a2a4a; background: #12121f; color: white; font-size: 16px; }
button { padding: 12px 30px; background: #00d2ff; border: none; border-radius: 8px; color: #0a0a0a; font-weight: bold; cursor: pointer; font-size: 16px; }
button:hover { background: #3a7bd5; }
.box { background: #12121f; padding: 30px; border-radius: 12px; max-width: 500px; margin: auto; border: 1px solid #2a2a4a; }
h1 { color: #00d2ff; }
</style>
</head>
<body>
<div class="box">
<h1>🔍 LEAK CHECKER</h1>
<p>Cari data dari database kebocoran</p>
<form method="GET" action="/search">
    <input type="text" name="q" placeholder="Email, username, no HP..." required>
    <br><br>
    <button type="submit">🔍 Cari</button>
</form>
<p style="color:#667788;font-size:12px;margin-top:20px;">Contoh: dickojr77@gmail.com</p>
</div>
</body>
</html>`);
});

app.get('/search', async (req, res) => {
    const query = req.query.q;
    
    if (!query || query.trim().length < 2) {
        return res.send(`
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Error</title>
<style>body{background:#0a0a0a;color:#e0e0e0;padding:50px;text-align:center;font-family:Arial;}.error{color:#ff4444;font-size:20px;}</style>
</head>
<body>
<div class="error">❌ Masukkan minimal 2 huruf!</div>
<a href="/" style="color:#00d2ff;">← Kembali</a>
</body>
</html>`);
    }
    
    try {
        const response = await axios.post(API_URL, {
            token: TOKEN,
            request: query.trim(),
            limit: 300,
            lang: 'id'
        });
        
        const data = response.data;
        
        if (data["Error code"]) {
            return res.send(generateHTML(null, query, data["Error code"]));
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
        
        const result = { success: true, total: total, results: results };
        const html = generateHTML(result, query);
        res.send(html);
        
    } catch (error) {
        res.send(generateHTML(null, query, error.message));
    }
});

// ==========================================
// 🔥 START SERVER
// ==========================================

app.listen(PORT, () => {
    console.log(`🚀 LeakOSINT Web Server berjalan di port ${PORT}`);
    console.log(`🌐 Buka: http://localhost:${PORT}`);
    console.log(`📌 Contoh: http://localhost:${PORT}/search?q=email@domain.com`);
});