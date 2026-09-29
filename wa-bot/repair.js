// ==========================================
// 🔧 REPAIR WA BOT - HAPUS SESSION & GANTI NOMOR
// ==========================================

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const axios = require('axios');

const sessionDir = path.join(__dirname, 'sessions');
const credsPath = path.join(sessionDir, 'creds.json');

// ==========================================
// 🔥 FUNGSI HAPUS SESSION
// ==========================================

function deleteAllSession() {
    console.log('🗑️  Menghapus semua session lama...');
    
    if (fs.existsSync(sessionDir)) {
        const files = fs.readdirSync(sessionDir);
        let deleted = 0;
        
        for (const file of files) {
            try {
                const filePath = path.join(sessionDir, file);
                if (fs.statSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                    deleted++;
                    console.log(`✅ Hapus: ${file}`);
                }
            } catch (e) {
                console.log(`⚠️ Gagal hapus ${file}:`, e.message);
            }
        }
        
        console.log(`✅ Total ${deleted} file session dihapus`);
    } else {
        console.log('📁 Folder sessions tidak ditemukan, membuat baru...');
        fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    console.log('✅ Session berhasil dibersihkan!');
}

// ==========================================
// 🔥 FUNGSI PAIRING NOMOR BARU
// ==========================================

async function pairNewNumber(phoneNumber) {
    console.log(`\n📱 Memulai pairing dengan nomor: ${phoneNumber}`);
    console.log('⏳ Mohon tunggu...\n');
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            markOnlineOnConnect: false,
            syncFullHistory: false,
            version: [2, 2412, 0] // Versi stabil
        });
        
        let pairingCode = null;
        let connected = false;
        
        sock.ev.on('connection.update', (update) => {
            console.log('🔄 Status:', update.connection || 'connecting...');
            
            if (update.connection === 'open') {
                connected = true;
                console.log('\n✅ ==========================================');
                console.log('✅  WHATSAPP BOT BERHASIL TERHUBUNG!');
                console.log(`✅  Nomor: ${sock.user.id}`);
                console.log('✅ ==========================================\n');
                
                // Kirim notifikasi ke Telegram
                try {
                    axios.post('http://localhost:3004/wa-to-telegram', {
                        message: `✅ *WA BOT REPAIR BERHASIL!*\n\n📱 Nomor baru: ${sock.user.id}\n🔄 Session lama dihapus\n🔗 Status: Terhubung`,
                        from: 'System',
                        isOwner: true
                    }, { timeout: 3000 }).catch(() => {});
                } catch (e) {}
                
                process.exit(0);
            }
            
            if (update.connection === 'close') {
                const error = update.lastDisconnect?.error;
                if (error) {
                    console.log('❌ Error:', error.message || 'Unknown error');
                }
            }
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        // Request pairing code dengan timeout 60 detik
        pairingCode = await Promise.race([
            sock.requestPairingCode(phoneNumber),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout 60 detik')), 60000))
        ]);
        
        console.log('\n🔑 ==========================================');
        console.log(`🔑  PAIRING CODE: ${pairingCode}`);
        console.log('🔑 ==========================================\n');
        console.log('📌 LANGKAH SELANJUTNYA:');
        console.log('1. Buka WhatsApp di HP');
        console.log('2. Buka Perangkat tertaut > Tautkan perangkat');
        console.log(`3. Masukkan kode: ${pairingCode}`);
        console.log('4. Tunggu 5-10 detik sampai terhubung ✅\n');
        console.log('⏳ Menunggu koneksi...');
        
        // Tunggu sampai connected atau timeout
        await new Promise((resolve) => {
            setTimeout(() => {
                if (!connected) {
                    console.log('\n⚠️ Timeout menunggu koneksi.');
                    console.log('📌 Jika sudah memasukkan kode di WhatsApp,');
                    console.log('   tunggu beberapa saat atau restart bot.');
                    console.log('   Cek status: pm2 logs wabot');
                }
                resolve();
            }, 60000);
        });
        
    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.log('\n📌 SOLUSI:');
        console.log('1. Pastikan nomor benar: 628xxxxxxxxxx');
        console.log('2. Pastikan internet stabil');
        console.log('3. Coba lagi: node repair.js');
        process.exit(1);
    }
}

// ==========================================
// 🔥 MAIN FUNCTION
// ==========================================

async function main() {
    console.log('🔧 ==========================================');
    console.log('🔧  REPAIR WA BOT - HAPUS SESSION & GANTI NOMOR');
    console.log('🔧 ==========================================\n');
    
    // 1. Hapus session
    deleteAllSession();
    
    // 2. Minta nomor baru
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const phoneNumber = await new Promise((resolve) => {
        rl.question('\n📱 Masukkan nomor baru (628xxxxxxxxxx): ', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
    
    // Validasi nomor
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanPhone.startsWith('628') || cleanPhone.length < 11) {
        console.log('\n❌ Nomor tidak valid!');
        console.log('📌 Format: 628xxxxxxxxxx');
        console.log('📌 Contoh: 6283830803474');
        process.exit(1);
    }
    
    // 3. Pairing nomor baru
    await pairNewNumber(cleanPhone);
}

// ==========================================
// 🔥 RUN
// ==========================================

main().catch(console.error);