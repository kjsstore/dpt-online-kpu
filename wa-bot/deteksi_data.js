// ==========================================
// 🔥 DETEKSI DATA DARI WHATSAPP & KIRIM KE USER SEWA
// ==========================================

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ==========================================
// 🔥 FUNGSI CEK USER PUNYA AKSES (DARI SEWA_AKTIF.JSON)
// ==========================================

function userHasAccess(chatId, kabupaten, kecamatan, kelurahan) {
    const sewaFile = path.join(__dirname, 'sewa_aktif.json');
    if (!fs.existsSync(sewaFile)) return false;
    
    let sewa = {};
    try { sewa = JSON.parse(fs.readFileSync(sewaFile)); } catch (e) { return false; }
    
    const userSewa = sewa[chatId];
    if (!userSewa || !userSewa.active) return false;
    
    // CEK EXPIRED
    const now = Date.now();
    if (now >= userSewa.expired) {
        userSewa.active = false;
        fs.writeFileSync(sewaFile, JSON.stringify(sewa, null, 2));
        return false;
    }
    
    if (!userSewa.daerah || userSewa.daerah.length === 0) return false;
    
    const searchText = `${kabupaten || ''} ${kecamatan || ''} ${kelurahan || ''}`.toLowerCase();
    
    for (const daerah of userSewa.daerah) {
        const daerahLower = daerah.toLowerCase();
        // Cek apakah match
        if (searchText.includes(daerahLower) || daerahLower.includes(searchText)) {
            return true;
        }
        // Split by >
        const parts = daerahLower.split('>').map(p => p.trim());
        for (const part of parts) {
            if (searchText.includes(part) && part.length > 3) {
                return true;
            }
        }
    }
    return false;
}

// ==========================================
// 🔥 FUNGSI EKSTRAK DAERAH DARI PESAN (UNTUK DETEKSI)
// ==========================================

function extractRegionFromText(text) {
    const data = {
        kabupaten: null,
        kecamatan: null,
        kelurahan: null
    };

    // Pattern untuk detect daerah
    const patterns = {
        kabupaten: [
            /KAB\s*[:.]?\s*(.*?)(?:\n|$)/i,
            /KABUPATEN\s*[:.]?\s*(.*?)(?:\n|$)/i,
            /KOTA\s*[:.]?\s*(.*?)(?:\n|$)/i,
            /Kabupaten\s*[:.]?\s*(.*?)(?:\n|$)/i,
        ],
        kecamatan: [
            /KEC\s*[:.]?\s*(.*?)(?:\n|$)/i,
            /KECAMATAN\s*[:.]?\s*(.*?)(?:\n|$)/i,
            /Kecamatan\s*[:.]?\s*(.*?)(?:\n|$)/i,
        ],
        kelurahan: [
            /KEL\s*[:.]?\s*(.*?)(?:\n|$)/i,
            /DESA\s*[:.]?\s*(.*?)(?:\n|$)/i,
            /KELURAHAN\s*[:.]?\s*(.*?)(?:\n|$)/i,
            /Kelurahan\s*[:.]?\s*(.*?)(?:\n|$)/i,
            /Desa\s*[:.]?\s*(.*?)(?:\n|$)/i,
        ]
    };

    for (const [key, patternList] of Object.entries(patterns)) {
        for (const pattern of patternList) {
            const match = text.match(pattern);
            if (match) {
                let value = match[1] || match[0] || '';
                value = value.replace(/\*/g, '').trim();
                if (value && value.length > 0 && value.length < 100) {
                    data[key] = value;
                    break;
                }
            }
        }
    }

    // Fallback: coba cari di baris
    if (!data.kabupaten || !data.kecamatan || !data.kelurahan) {
        const lines = text.split('\n').map(l => l.replace(/\*/g, '').trim());
        
        for (const line of lines) {
            if (!line) continue;
            const upperLine = line.toUpperCase();
            
            if (!data.kabupaten && (upperLine.includes('KAB') || upperLine.includes('KABUPATEN') || upperLine.includes('KOTA'))) {
                const match = line.match(/(?:KAB|KABUPATEN|KOTA)\s*[:.]?\s*(.*)/i);
                if (match) {
                    const val = match[1].trim();
                    if (val && val.length < 100) data.kabupaten = val;
                }
            }
            
            if (!data.kecamatan && (upperLine.includes('KEC') || upperLine.includes('KECAMATAN'))) {
                const match = line.match(/(?:KEC|KECAMATAN)\s*[:.]?\s*(.*)/i);
                if (match) {
                    const val = match[1].trim();
                    if (val && val.length < 100) data.kecamatan = val;
                }
            }
            
            if (!data.kelurahan && (upperLine.includes('KEL') || upperLine.includes('KELURAHAN') || upperLine.includes('DESA'))) {
                const match = line.match(/(?:KEL|KELURAHAN|DESA)\s*[:.]?\s*(.*)/i);
                if (match) {
                    const val = match[1].trim();
                    if (val && val.length < 100) data.kelurahan = val;
                }
            }
        }
    }

    // Clean up
    for (const key of ['kabupaten', 'kecamatan', 'kelurahan']) {
        if (data[key]) {
            data[key] = data[key].replace(/[:;]/g, '').trim();
        }
    }

    return data;
}

// ==========================================
// 🔥 FUNGSI KIRIM DATA KE SEMUA USER YANG PUNYA AKSES
// ==========================================

async function sendDataToSubscribers(messageData, bot = null) {
    const sewaFile = path.join(__dirname, 'sewa_aktif.json');
    if (!fs.existsSync(sewaFile)) {
        console.log('[DATA] No sewa file found');
        return { sent: 0, total: 0 };
    }
    
    let sewa = {};
    try { sewa = JSON.parse(fs.readFileSync(sewaFile)); } catch (e) { 
        console.log('[DATA] Error reading sewa file');
        return { sent: 0, total: 0 };
    }
    
    const now = Date.now();
    let sent = 0;
    let total = 0;
    
    // Ambil semua user yang aktif
    const activeUsers = Object.keys(sewa).filter(userId => {
        const user = sewa[userId];
        if (!user.active) return false;
        if (now >= user.expired) {
            user.active = false;
            return false;
        }
        return true;
    });
    
    // Simpan update expired
    fs.writeFileSync(sewaFile, JSON.stringify(sewa, null, 2));
    
    console.log(`[DATA] Active users: ${activeUsers.length}`);
    console.log(`[DATA] Target region: ${messageData.kabupaten} > ${messageData.kecamatan} > ${messageData.kelurahan}`);
    
    // 🔥 FORMAT PESAN UTUH (LENGKAP)
    let fullMessage = `📊 DATA DARI WHATSAPP\n\n`;
    
    // Tambahkan data lengkap (format asli)
    if (messageData.raw) {
        fullMessage += `${messageData.raw}\n\n`;
    } else {
        // Format standar
        fullMessage += `📍 Kabupaten: ${messageData.kabupaten || '-'}\n`;
        fullMessage += `📍 Kecamatan: ${messageData.kecamatan || '-'}\n`;
        fullMessage += `📍 Kelurahan: ${messageData.kelurahan || '-'}\n`;
        if (messageData.kpj) fullMessage += `🆔 KPJ: ${messageData.kpj}\n`;
        if (messageData.nik) fullMessage += `🆔 NIK: ${messageData.nik}\n`;
        if (messageData.kelamin) fullMessage += `👤 Kelamin: ${messageData.kelamin}\n`;
        if (messageData.ttl) fullMessage += `📅 TTL: ${messageData.ttl}\n`;
        if (messageData.saldo) fullMessage += `💰 Saldo: ${messageData.saldo}\n`;
        if (messageData.pt) fullMessage += `🏢 PT: ${messageData.pt}\n`;
    }
    
    // 🔥 TAMBAHKAN INFORMASI SUMBER
    fullMessage += `\n─────────────────────\n`;
    fullMessage += `📱 Dari: ${messageData.pengirim || '-'}\n`;
    fullMessage += `👥 Group: ${messageData.group || 'Private'}\n`;
    fullMessage += `⏰ Waktu: ${new Date().toLocaleString('id-ID')}\n`;
    fullMessage += `🆔 ID Group: ${messageData.groupId || '-'}`;
    
    // Kirim ke setiap user yang punya akses
    for (const userId of activeUsers) {
        const user = sewa[userId];
        if (!user.daerah || user.daerah.length === 0) continue;
        
        // Cek apakah user punya akses ke daerah ini
        const hasAccess = userHasAccess(
            userId, 
            messageData.kabupaten, 
            messageData.kecamatan, 
            messageData.kelurahan
        );
        
        if (hasAccess) {
            total++;
            try {
                // Kirim ke Telegram user
                if (bot) {
                    await bot.sendMessage(userId, fullMessage, { parse_mode: 'Markdown' });
                } else {
                    // Kirim via API ke bridge
                    await axios.post('http://localhost:3004/send-to-telegram-user', {
                        chatId: userId,
                        message: fullMessage
                    }).catch(() => {});
                }
                sent++;
                console.log(`[DATA] ✅ Terkirim ke ${userId}`);
            } catch (error) {
                console.log(`[DATA] ❌ Gagal kirim ke ${userId}:`, error.message);
            }
        }
    }
    
    console.log(`[DATA] Dikirim ke ${sent} dari ${total} user yang punya akses`);
    return { sent, total };
}

// ==========================================
// 🔥 FUNGSI PROSES PESAN MASUK
// ==========================================

async function processIncomingMessage(msg, bot = null) {
    try {
        // Ambil text
        let text = '';
        const message = msg.message;
        
        if (message.conversation) {
            text = message.conversation;
        } else if (message.extendedTextMessage?.text) {
            text = message.extendedTextMessage.text;
        } else if (message.imageMessage?.caption) {
            text = message.imageMessage.caption;
        } else if (message.videoMessage?.caption) {
            text = message.videoMessage.caption;
        } else {
            return null;
        }
        
        if (!text) return null;
        
        const sender = msg.key.remoteJid;
        const senderName = msg.pushName || sender || 'Unknown';
        const isGroup = msg.key.remoteJid?.includes('@g.us');
        const groupName = isGroup ? sender : 'Private';
        const groupId = isGroup ? sender : null;
        
        console.log(`📩 [PESAN] Dari: ${senderName}`);
        console.log(`📩 [PESAN] Text: ${text.substring(0, 200)}...`);
        
        // 🔥 EKSTRAK DAERAH DARI PESAN
        const region = extractRegionFromText(text);
        
        // Cek apakah ada data daerah
        if (region.kabupaten || region.kecamatan || region.kelurahan) {
            console.log(`✅ [DATA] Terdeteksi daerah: ${region.kabupaten} > ${region.kecamatan} > ${region.kelurahan}`);
            
            // 🔥 FORMAT DATA LENGKAP
            const messageData = {
                kabupaten: region.kabupaten,
                kecamatan: region.kecamatan,
                kelurahan: region.kelurahan,
                raw: text, // Kirim text UTUH
                pengirim: senderName,
                senderNumber: sender,
                group: groupName,
                groupId: groupId,
                timestamp: new Date().toISOString()
            };
            
            // 🔥 KIRIM KE SEMUA USER YANG PUNYA AKSES
            const result = await sendDataToSubscribers(messageData, bot);
            
            return {
                region: region,
                sent: result.sent,
                total: result.total,
                messageData: messageData
            };
        }
        
        return null;
        
    } catch (error) {
        console.log('❌ [PROCESS] Error:', error.message);
        console.log('❌ [PROCESS] Stack:', error.stack);
        return null;
    }
}

// ==========================================
// 🔥 SIMPAN DATA DETEKSI KE FILE
// ==========================================

const dataFile = path.join(__dirname, 'data_detected.json');
let allData = [];
if (fs.existsSync(dataFile)) {
    try { allData = JSON.parse(fs.readFileSync(dataFile)); } catch (e) {}
}

function saveDetectedData(data) {
    allData.push(data);
    // Keep last 1000
    if (allData.length > 1000) {
        allData = allData.slice(-1000);
    }
    fs.writeFileSync(dataFile, JSON.stringify(allData, null, 2));
}

// ==========================================
// 🔥 EXPORT
// ==========================================

module.exports = {
    extractRegionFromText,
    sendDataToSubscribers,
    userHasAccess,
    processIncomingMessage,
    saveDetectedData,
    allData,
    dataFile
};