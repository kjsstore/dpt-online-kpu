/**
 * COMMAND: /hapus (VIA TELEGRAM)
 * Fungsi: Menghapus daerah dari daftar subscribe
 * Format: /hapus [nomor]
 * Contoh: /hapus 1
 */

const fs = require('fs');
const path = require('path');

module.exports = {
    trigger: ['hapus', 'delete', 'remove', 'del'],
    execute: async (sock, m, args, { settings, isOwner }) => {
        try {
            // 🔥 CHAT ID TELEGRAM
            const chatId = m.key.remoteJid;
            
            // CEK ARGUMEN
            if (!args || args.length === 0) {
                await sock.sendMessage(chatId, { 
                    text: `❌ *Format Salah!*\n\n` +
                          `📌 *Cara penggunaan:*\n` +
                          `/hapus [nomor]\n\n` +
                          `📌 *Contoh:*\n` +
                          `/hapus 1\n\n` +
                          `📌 Lihat daftar: /daftar` 
                });
                return;
            }
            
            const index = parseInt(args[0]) - 1;
            
            if (isNaN(index) || index < 0) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Masukkan nomor yang valid!' 
                });
                return;
            }
            
            const sewaFile = path.join(__dirname, '..', 'sewa_aktif.json');
            
            if (!fs.existsSync(sewaFile)) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Belum ada data.' 
                });
                return;
            }
            
            const sewa = JSON.parse(fs.readFileSync(sewaFile));
            const userData = sewa[chatId];
            
            if (!userData || !userData.daerah || userData.daerah.length === 0) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Tidak ada daerah yang terdaftar.' 
                });
                return;
            }
            
            if (index >= userData.daerah.length) {
                await sock.sendMessage(chatId, { 
                    text: `❌ Nomor tidak valid! Maksimal ${userData.daerah.length}` 
                });
                return;
            }
            
            // HAPUS
            const removed = userData.daerah.splice(index, 1)[0];
            fs.writeFileSync(sewaFile, JSON.stringify(sewa, null, 2));
            
            // TAMPILKAN SISA DAERAH
            let sisaList = '';
            if (userData.daerah.length > 0) {
                userData.daerah.forEach((d, i) => {
                    sisaList += `  ${i+1}. ${d}\n`;
                });
            } else {
                sisaList = '  (kosong)';
            }
            
            await sock.sendMessage(chatId, { 
                text: `✅ *Berhasil Dihapus!*\n\n` +
                      `🗑️ *Dihapus:* ${removed}\n\n` +
                      `📋 *Sisa:* ${userData.daerah.length} daerah\n` +
                      `${sisaList}\n\n` +
                      `📌 Gunakan /tambah untuk menambah daerah baru.` 
            });
            
            console.log(`[HAPUS] ✅ Telegram ${chatId} menghapus: ${removed}`);
            
        } catch (error) {
            console.log('[HAPUS] Error:', error.message);
            const chatId = m.key.remoteJid;
            await sock.sendMessage(chatId, { 
                text: `❌ Error: ${error.message}` 
            });
        }
    }
};