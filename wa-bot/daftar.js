/**
 * COMMAND: /daftar (VIA TELEGRAM)
 * Fungsi: Melihat daftar daerah yang sudah disubscribe
 */

const fs = require('fs');
const path = require('path');

module.exports = {
    trigger: ['daftar', 'list', 'lihat', 'mydaerah'],
    execute: async (sock, m, args, { settings, isOwner }) => {
        try {
            // 🔥 CHAT ID TELEGRAM
            const chatId = m.key.remoteJid;
            
            const sewaFile = path.join(__dirname, '..', 'sewa_aktif.json');
            
            if (!fs.existsSync(sewaFile)) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Belum ada data sewa.' 
                });
                return;
            }
            
            const sewa = JSON.parse(fs.readFileSync(sewaFile));
            const userData = sewa[chatId];
            
            if (!userData || !userData.daerah || userData.daerah.length === 0) {
                await sock.sendMessage(chatId, { 
                    text: `📋 *Daftar Daerah*\n\n` +
                          'Belum ada daerah yang terdaftar.\n' +
                          'Gunakan /tambah untuk menambahkan.\n\n' +
                          '📌 Contoh: /tambah SUMENEP > PRAGAAN > PAKAMBAN DAYA' 
                });
                return;
            }
            
            // Cek status expired
            const now = Date.now();
            let statusText = '✅ Aktif';
            let sisaText = '';
            
            if (userData.expired && now >= userData.expired) {
                statusText = '❌ Expired';
                sisaText = '⏰ Sudah expired, perpanjang sewa!';
            } else if (userData.expired) {
                const sisaHari = Math.ceil((userData.expired - now) / (1000 * 60 * 60 * 24));
                sisaText = `⏳ Sisa ${sisaHari} hari`;
            }
            
            // Format daftar daerah
            let daerahList = '';
            userData.daerah.forEach((d, i) => {
                const parts = d.split('>').map(p => p.trim());
                daerahList += `  ${i+1}. ${parts[0]} > ${parts[1]} > ${parts[2]}\n`;
            });
            
            const message = `📋 *DAFTAR DAERAH TERSUBSCRIBE*\n\n` +
                           `📍 *Total:* ${userData.daerah.length} daerah\n` +
                           `📌 *Status:* ${statusText}\n` +
                           `${sisaText}\n\n` +
                           `📌 *Daftar Daerah:*\n${daerahList}\n\n` +
                           `📌 *Command:*\n` +
                           `/tambah - Tambah daerah\n` +
                           `/hapus [nomor] - Hapus daerah\n` +
                           `/daftar - Lihat daftar ini\n\n` +
                           `⏰ Data akan dikirim otomatis ke Telegram saat terdeteksi di WhatsApp.`;
            
            await sock.sendMessage(chatId, { text: message });
            
        } catch (error) {
            console.log('[DAFTAR] Error:', error.message);
            const chatId = m.key.remoteJid;
            await sock.sendMessage(chatId, { 
                text: `❌ Error: ${error.message}` 
            });
        }
    }
};