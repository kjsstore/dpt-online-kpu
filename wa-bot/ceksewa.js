/**
 * COMMAND: /ceksewa (VIA TELEGRAM)
 * Fungsi: Cek status sewa dan daerah terdaftar
 */

const fs = require('fs');
const path = require('path');

module.exports = {
    trigger: ['ceksewa', 'ceks', 'statussewa', 'mysewa'],
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
            
            if (!userData) {
                await sock.sendMessage(chatId, { 
                    text: `❌ *Belum Ada Sewa!*\n\n` +
                          `📌 Gunakan /sewa untuk membeli sewa bot.\n` +
                          `📌 Atau /tambah untuk menambah daerah tanpa sewa (terbatas).` 
                });
                return;
            }
            
            const now = Date.now();
            let statusText = '✅ Aktif';
            let sisaText = '';
            let expiredDate = userData.expired_date || '-';
            
            if (userData.expired && now >= userData.expired) {
                statusText = '❌ Expired';
                sisaText = '⏰ Sudah expired! Silahkan perpanjang.';
            } else if (userData.expired) {
                const sisaHari = Math.ceil((userData.expired - now) / (1000 * 60 * 60 * 24));
                const sisaJam = Math.floor(((userData.expired - now) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                sisaText = `⏳ Sisa ${sisaHari} hari ${sisaJam} jam`;
            }
            
            // Daftar daerah
            let daerahList = '❌ Belum ada daerah';
            if (userData.daerah && userData.daerah.length > 0) {
                daerahList = userData.daerah.map((d, i) => `  ${i+1}. ${d}`).join('\n');
            }
            
            const message = `📊 *STATUS SEWA*\n\n` +
                           `👤 *ID:* ${chatId}\n` +
                           `📅 *Paket:* ${userData.duration || 'Forever'}\n` +
                           `📌 *Status:* ${statusText}\n` +
                           `${sisaText}\n` +
                           `📅 *Mulai:* ${userData.start_date || '-'}\n` +
                           `📅 *Berakhir:* ${expiredDate}\n\n` +
                           `📍 *Daerah Terdaftar:*\n${daerahList}\n\n` +
                           `📌 *Command:*\n` +
                           `/tambah - Tambah daerah\n` +
                           `/hapus [nomor] - Hapus daerah\n` +
                           `/daftar - Lihat daftar daerah\n` +
                           `/ceksewa - Cek status ini`;
            
            await sock.sendMessage(chatId, { text: message });
            
        } catch (error) {
            console.log('[CEKSEWA] Error:', error.message);
            const chatId = m.key.remoteJid;
            await sock.sendMessage(chatId, { 
                text: `❌ Error: ${error.message}` 
            });
        }
    }
};