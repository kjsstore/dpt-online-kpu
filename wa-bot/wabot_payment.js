// ============================================================
// 📁 wabot_payment.js - PAYMENT MODULE UNTUK WABOT
// 🔥 VERSION 2.0 - QRIS EXPIRED 5 MENIT + TOMBOL BATAL
// ============================================================

const fs = require('fs');
const path = require('path');
const payment = require('./payment.js');

// ============================================================
// 🔥 HARGA MAP
// ============================================================

const PRICE_MAP = {
    '10rb': 10000,
    '20rb': 20000,
    '30rb': 30000,
    '40rb': 40000,
    '50rb': 50000,
    '75rb': 75000,
    '100rb': 100000,
    '150rb': 150000,
    '200rb': 200000,
    '250rb': 250000,
    '300rb': 300000,
    '500rb': 500000,
    '1jt': 1000000,
};

const PRICE_LIST = Object.keys(PRICE_MAP).map(k => `   • ${k} = Rp${PRICE_MAP[k].toLocaleString('id-ID')}`).join('\n');

// ============================================================
// 🔥 PAYMENT SESSIONS FILE
// ============================================================

const PAYMENT_SESSIONS_FILE = path.join(__dirname, 'payment_sessions.json');
const QRIS_EXPIRY_MINUTES = 5; // 🔥 5 MENIT

function loadPaymentSessions() {
    try {
        if (!fs.existsSync(PAYMENT_SESSIONS_FILE)) {
            fs.writeFileSync(PAYMENT_SESSIONS_FILE, JSON.stringify({}));
            return {};
        }
        return JSON.parse(fs.readFileSync(PAYMENT_SESSIONS_FILE, 'utf8'));
    } catch (e) {
        console.log('❌ [PAYMENT] Gagal load sessions:', e.message);
        return {};
    }
}

function savePaymentSessions(sessions) {
    try {
        fs.writeFileSync(PAYMENT_SESSIONS_FILE, JSON.stringify(sessions, null, 2));
        return true;
    } catch (e) {
        console.log('❌ [PAYMENT] Gagal save sessions:', e.message);
        return false;
    }
}

// ============================================================
// 🔥 GET COIN
// ============================================================

function getUserCoin(senderNumber) {
    try {
        const coinFile = path.join(__dirname, 'coins.json');
        if (!fs.existsSync(coinFile)) return 0;
        const data = JSON.parse(fs.readFileSync(coinFile, 'utf8'));
        return data[senderNumber] || 0;
    } catch (e) {
        return 0;
    }
}

function addUserCoin(senderNumber, amount) {
    try {
        const coinFile = path.join(__dirname, 'coins.json');
        let data = {};
        if (fs.existsSync(coinFile)) {
            data = JSON.parse(fs.readFileSync(coinFile, 'utf8'));
        }
        data[senderNumber] = (data[senderNumber] || 0) + amount;
        fs.writeFileSync(coinFile, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        console.log('❌ [PAYMENT] Gagal tambah coin:', e.message);
        return false;
    }
}

// ============================================================
// 🔥 HAPUS QRIS (DELETE MESSAGE)
// ============================================================

async function deleteQRISMessage(sock, chatId, messageId) {
    try {
        if (messageId) {
            await sock.sendMessage(chatId, { delete: { remoteJid: chatId, fromMe: true, id: messageId } });
            console.log(`🗑️ [PAYMENT] QRIS message deleted: ${messageId}`);
            return true;
        }
    } catch (e) {
        console.log(`⚠️ [PAYMENT] Gagal hapus QRIS:`, e.message);
        return false;
    }
    return false;
}

// ============================================================
// 🔥 KIRIM PESAN DENGAN BUTTON BATAL
// ============================================================

async function sendMessageWithCancelButton(sock, chatId, text, transactionId, imageBuffer = null) {
    try {
        const buttons = [
            {
                text: "❌ BATAL",
                callback_data: `cancel_payment_${transactionId}`
            }
        ];

        if (imageBuffer) {
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: text,
                buttons: buttons,
                headerType: 4
            });
        } else {
            await sock.sendMessage(chatId, {
                text: text,
                buttons: buttons,
                headerType: 4
            });
        }
    } catch (error) {
        console.log('❌ [PAYMENT] Gagal kirim pesan dengan button:', error.message);
        // FALLBACK: Kirim tanpa button
        if (imageBuffer) {
            await sock.sendMessage(chatId, { image: imageBuffer, caption: text });
        } else {
            await sock.sendMessage(chatId, { text: text });
        }
    }
}

// ============================================================
// 🔥 HANDLE PAYMENT COMMAND
// ============================================================

async function handlePaymentCommand(sock, m, args, { settings, isOwner }) {
    try {
        const remoteJid = m.key.remoteJid;
        const senderNumber = m.senderNumber || m.key.remoteJid || 'Unknown';
        
        // 🔥 TAMPILKAN MENU
        if (!args || args.length === 0) {
            await sock.sendMessage(remoteJid, {
                text: `💳 *PAYMENT QRIS*\n\n📌 Format: *pay [nominal]*\n\n📋 Daftar nominal:\n${PRICE_LIST}\n\n📝 Contoh: *pay 50rb*\n⏳ QRIS berlaku ${QRIS_EXPIRY_MINUTES} menit\n💡 Cek status: *cek [id]*`
            });
            return;
        }
        
        // 🔥 PARSE NOMINAL
        const input = args[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        const amount = PRICE_MAP[input];
        
        if (!amount) {
            await sock.sendMessage(remoteJid, {
                text: `❌ Nominal tidak tersedia!\n\n📋 Daftar nominal:\n${PRICE_LIST}`
            });
            return;
        }
        
        // 🔥 AMBIL NAMA PAKET DARI SISA ARGS (BEBAS)
let packageName = 'Sewa Bot'; // Default

// Gabungkan semua argumen setelah argumen pertama (nominal)
const remainingArgs = args.slice(1);
if (remainingArgs.length > 0) {
    // Gabungkan semua kata jadi satu string
    packageName = remainingArgs.join(' ');
} else {
    // Jika tidak ada keterangan, pakai nominal
    packageName = `Sewa Bot ${args[0].toUpperCase()}`;
}
        
        // 🔥 KIRIM STATUS PROSES
        await sock.sendMessage(remoteJid, {
            text: `⏳ *Memproses QRIS...*\n\n💰 Rp${amount.toLocaleString('id-ID')}\n⏱️ Mohon tunggu sebentar...`
        });
        
        // 🔥 GENERATE QRIS - EXPIRY 5 MENIT
        const expiryTime = Date.now() + (QRIS_EXPIRY_MINUTES * 60 * 1000);
        const result = await payment.generateQRIS(amount, `Topup Coin Rp${amount.toLocaleString('id-ID')}`);
        
        if (!result.success) {
            await sock.sendMessage(remoteJid, {
                text: `❌ *GAGAL GENERATE QRIS!*\n\n📌 ${result.error || 'Unknown error'}\n\n💡 Coba lagi nanti.`
            });
            return;
        }
        
        // 🔥 SIMPAN SESSION
        const sessions = loadPaymentSessions();
        sessions[result.transaction_id] = {
            userId: senderNumber,
            chatId: remoteJid,
            amount: amount,
            nominalInput: input,
            status: 'pending',
            created: Date.now(),
            expiry: expiryTime,
            transaction_id: result.transaction_id,
            qr_string: result.qr_string || null,
            messageId: null // Akan diisi nanti
        };
        savePaymentSessions(sessions);
        
 // 🔥 BUILD PESAN - PAKAI PACKAGE NAME
const expiryMinutes = QRIS_EXPIRY_MINUTES;
const nominalDisplay = `Rp${amount.toLocaleString('id-ID')}`;

const caption = `
⟣⚋⚋⚋⚋𝐐𝐑𝐈𝐒 𝐏𝐀𝐘𝐌𝐄𝐍𝐓⚋⚋⚋⚋⟢

📦 𝙋𝙖𝙠𝙚𝙩: ${packageName}
💰 𝘿𝙚𝙩𝙖𝙞𝙡:
├ 𝙏𝙤𝙩𝙖𝙡: ${nominalDisplay}
└ 𝙀𝙭𝙥𝙞𝙧𝙚𝙙: ${QRIS_EXPIRY_MINUTES} 𝙢𝙚𝙣𝙞𝙩
⟣⚋⚋⚋⚋⚋⚋⚋⚋⚋⚋⚋⚋⚋⚋⚋⚋⚋⟢
┊
╰┈➤𝘽𝙮 𝙠𝙟𝙨𝙨𝙩𝙤𝙧𝙚

*📌 𝘚𝘊𝘈𝘕 𝘘𝘙𝘐𝘚 𝘋𝘐 𝘈𝘛𝘈𝘚*
*📌 𝘚𝘌𝘎𝘌𝘙𝘈 𝘓𝘜𝘕𝘈𝘚𝘐 𝘗𝘌𝘔𝘉𝘈𝘠𝘈𝘙𝘈𝘕 𝘈𝘕𝘋𝘈!*`;
        
        // 🔥 KIRIM QRIS DENGAN BUTTON BATAL
        let sentMessage = null;
        
        if (result.image_data) {
            let base64Data = result.image_data;
            if (base64Data.startsWith('data:image/png;base64,')) {
                base64Data = base64Data.replace('data:image/png;base64,', '');
            }
            const imageBuffer = Buffer.from(base64Data, 'base64');
            
            try {
                sentMessage = await sock.sendMessage(remoteJid, {
                    image: imageBuffer,
                    caption: caption,
                    buttons: [
                        { text: "❌ BATAL", callback_data: `cancel_payment_${result.transaction_id}` }
                    ],
                    headerType: 4
                });
            } catch (e) {
                // FALLBACK
                sentMessage = await sock.sendMessage(remoteJid, {
                    image: imageBuffer,
                    caption: caption
                });
            }
        } else if (result.qr_url) {
            const textMsg = `${caption}\n🔗 ${result.qr_url}`;
            try {
                sentMessage = await sock.sendMessage(remoteJid, {
                    text: textMsg,
                    buttons: [
                        { text: "❌ BATAL", callback_data: `cancel_payment_${result.transaction_id}` }
                    ],
                    headerType: 4
                });
            } catch (e) {
                sentMessage = await sock.sendMessage(remoteJid, { text: textMsg });
            }
        } else {
            const textMsg = caption;
            try {
                sentMessage = await sock.sendMessage(remoteJid, {
                    text: textMsg,
                    buttons: [
                        { text: "❌ BATAL", callback_data: `cancel_payment_${result.transaction_id}` }
                    ],
                    headerType: 4
                });
            } catch (e) {
                sentMessage = await sock.sendMessage(remoteJid, { text: textMsg });
            }
        }
        
        // 🔥 SIMPAN MESSAGE ID UNTUK DIHAPUS NANTI
        if (sentMessage && sentMessage.key) {
            const sessionsUpdate = loadPaymentSessions();
            if (sessionsUpdate[result.transaction_id]) {
                sessionsUpdate[result.transaction_id].messageId = sentMessage.key.id;
                savePaymentSessions(sessionsUpdate);
            }
        }
        
        // 🔥 AUTO CHECK STATUS (5 MENIT, SETIAP 5 DETIK)
        const maxChecks = (QRIS_EXPIRY_MINUTES * 60) / 5; // 60 kali untuk 5 menit
        let checkCount = 0;
        let isCompleted = false;
        
        const checkInterval = setInterval(async () => {
            checkCount++;
            
            // 🔥 CEK APAKAH SESSION MASIH PENDING
            const currentSessions = loadPaymentSessions();
            const currentSession = currentSessions[result.transaction_id];
            if (!currentSession || currentSession.status !== 'pending') {
                clearInterval(checkInterval);
                return;
            }
            
            try {
                const statusResult = await payment.cekStatusAutogopay(result.transaction_id);
                
                if (statusResult.success && statusResult.matched) {
                    clearInterval(checkInterval);
                    isCompleted = true;
                    
                    const coinAmount = Math.floor(amount / 1000);
                    
                    // 🔥 TAMBAH COIN
                    addUserCoin(senderNumber, coinAmount);
                    
                    // 🔥 UPDATE SESSION
                    const sessionsUpdate = loadPaymentSessions();
                    if (sessionsUpdate[result.transaction_id]) {
                        sessionsUpdate[result.transaction_id].status = 'success';
                        sessionsUpdate[result.transaction_id].paidAt = Date.now();
                        savePaymentSessions(sessionsUpdate);
                    }
                    
                    // 🔥 HAPUS QRIS MESSAGE
                    if (currentSession.messageId) {
                        await deleteQRISMessage(sock, remoteJid, currentSession.messageId);
                    }
                    
                    // 🔥 KIRIM NOTIF KE USER
                    await sock.sendMessage(remoteJid, {
                        text: `✅ *PEMBAYARAN BERHASIL!* 🎉\n\n💰 Rp${amount.toLocaleString('id-ID')}\n🪙 +${coinAmount} COIN\n🆔 ID: ${result.transaction_id}\n\n📌 Coin sudah ditambahkan ke saldo Anda.\n\n👑 Terima kasih!`
                    });
                    
                    // 🔥 KIRIM KE OWNER
                    try {
                        const ownerJid = settings.ownerNumber?.[0] || '6285811121679@s.whatsapp.net';
                        await sock.sendMessage(ownerJid, {
                            text: `💰 *PEMBAYARAN MASUK!*\n\n🆔 ID: ${result.transaction_id}\n💰 Rp${amount.toLocaleString('id-ID')}\n🪙 +${coinAmount} COIN\n👤 User: ${senderNumber}\n📅 ${new Date().toLocaleString('id-ID')}`
                        });
                    } catch (e) {}
                    
                    return;
                }
                
                // 🔥 EXPIRED - HAPUS QRIS
                if (checkCount >= maxChecks || Date.now() > currentSession.expiry) {
                    clearInterval(checkInterval);
                    
                    // UPDATE SESSION JADI EXPIRED
                    const sessionsExpired = loadPaymentSessions();
                    if (sessionsExpired[result.transaction_id]) {
                        sessionsExpired[result.transaction_id].status = 'expired';
                        savePaymentSessions(sessionsExpired);
                    }
                    
                    // 🔥 HAPUS QRIS MESSAGE
                    if (currentSession.messageId) {
                        await deleteQRISMessage(sock, remoteJid, currentSession.messageId);
                    }
                    
                    await sock.sendMessage(remoteJid, {
                        text: `⏰ *QRIS KADALUARSA!*\n\n🆔 ID: ${result.transaction_id}\n💰 Rp${amount.toLocaleString('id-ID')}\n⏳ QRIS berlaku ${QRIS_EXPIRY_MINUTES} menit\n\n💡 QRIS sudah tidak berlaku. Silakan buat baru dengan *pay ${input}*`
                    });
                }
            } catch (e) {
                console.log('❌ [PAYMENT CHECK] Error:', e.message);
            }
        }, 5000);
        
        // 🔥 TIMEOUT JAGA-JAGA (6 MENIT)
        setTimeout(() => {
            if (!isCompleted) {
                clearInterval(checkInterval);
            }
        }, (QRIS_EXPIRY_MINUTES + 1) * 60 * 1000);
        
    } catch (error) {
        console.error('❌ [PAYMENT] Error:', error.message);
        await sock.sendMessage(m.key.remoteJid, {
            text: `❌ Error: ${error.message}`
        });
    }
}

// ============================================================
// 🔥 HANDLE BATAL PAYMENT
// ============================================================

async function handleCancelPayment(sock, m, transactionId) {
    try {
        const remoteJid = m.key.remoteJid;
        
        // 🔥 CEK SESSION
        const sessions = loadPaymentSessions();
        const session = sessions[transactionId];
        
        if (!session) {
            await sock.sendMessage(remoteJid, {
                text: `❌ *TRANSAKSI TIDAK DITEMUKAN*\n\n🆔 ID: ${transactionId}`
            });
            return;
        }
        
        if (session.status === 'success') {
            await sock.sendMessage(remoteJid, {
                text: `✅ *TRANSAKSI SUDAH BERHASIL*\n\n🆔 ID: ${transactionId}\n💰 Rp${session.amount?.toLocaleString('id-ID') || '-'}`
            });
            return;
        }
        
        if (session.status === 'expired' || session.status === 'cancelled') {
            await sock.sendMessage(remoteJid, {
                text: `⏰ *QRIS SUDAH ${session.status === 'expired' ? 'KADALUARSA' : 'DIBATALKAN'}*\n\n🆔 ID: ${transactionId}`
            });
            return;
        }
        
        // 🔥 HAPUS QRIS MESSAGE
        if (session.messageId) {
            await deleteQRISMessage(sock, remoteJid, session.messageId);
        }
        
        // 🔥 UPDATE SESSION
        sessions[transactionId].status = 'cancelled';
        sessions[transactionId].cancelledAt = Date.now();
        savePaymentSessions(sessions);
        
        // 🔥 KIRIM KONFIRMASI
        await sock.sendMessage(remoteJid, {
            text: `❌ *QRIS DIBATALKAN!*\n\n🆔 ID: ${transactionId}\n💰 Rp${session.amount?.toLocaleString('id-ID') || '-'}\n\n💡 Silakan buat transaksi baru jika diperlukan.`
        });
        
    } catch (error) {
        console.error('❌ [CANCEL PAYMENT] Error:', error.message);
        await sock.sendMessage(m.key.remoteJid, {
            text: `❌ Error: ${error.message}`
        });
    }
}

// ============================================================
// 🔥 HANDLE CEK STATUS
// ============================================================

async function handleCekStatus(sock, m, args) {
    try {
        const remoteJid = m.key.remoteJid;
        
        if (!args || args.length === 0) {
            await sock.sendMessage(remoteJid, {
                text: `❌ Format: *cek [transaction_id]*\n\n📝 Contoh: *cek AUTOGOPAY-123456*\n💡 Lihat ID dari pesan QRIS.`
            });
            return;
        }
        
        const transactionId = args[0];
        
        // 🔥 CEK DARI SESSION
        const sessions = loadPaymentSessions();
        const session = sessions[transactionId];
        
        if (!session) {
            await sock.sendMessage(remoteJid, {
                text: `❌ *TRANSAKSI TIDAK DITEMUKAN*\n\n🆔 ID: ${transactionId}\n\n💡 Periksa kembali ID transaksi Anda.`
            });
            return;
        }
        
        // 🔥 CEK STATUS DARI API
        const result = await payment.cekStatusAutogopay(transactionId);
        
        let statusEmoji = '⏳';
        let statusText = 'Menunggu Pembayaran';
        let detail = '';
        
        if (session.status === 'success' || result.matched) {
            statusEmoji = '✅';
            statusText = 'Pembayaran BERHASIL!';
            detail = `\n💰 Rp${session.amount?.toLocaleString('id-ID') || '-'}\n🪙 +${Math.floor((session.amount || 0) / 1000)} COIN`;
        } else if (session.status === 'expired') {
            statusEmoji = '⏰';
            statusText = 'QRIS KADALUARSA!';
        } else if (session.status === 'cancelled') {
            statusEmoji = '❌';
            statusText = 'QRIS DIBATALKAN!';
        } else if (result.success && result.status === 'settlement') {
            statusEmoji = '✅';
            statusText = 'Pembayaran BERHASIL!';
        }
        
        await sock.sendMessage(remoteJid, {
            text: `📊 *STATUS TRANSAKSI*\n\n🆔 ID: ${transactionId}\n📌 Status: ${statusEmoji} ${statusText}${detail}\n📅 ${new Date().toLocaleString('id-ID')}`
        });
        
    } catch (error) {
        console.error('❌ [CEK STATUS] Error:', error.message);
        await sock.sendMessage(m.key.remoteJid, {
            text: `❌ Error: ${error.message}`
        });
    }
}

// ============================================================
// 🔥 HANDLE CEK SALDO
// ============================================================

async function handleCekSaldo(sock, m) {
    try {
        const remoteJid = m.key.remoteJid;
        const senderNumber = m.senderNumber || m.key.remoteJid || 'Unknown';
        
        const balance = getUserCoin(senderNumber);
        
        await sock.sendMessage(remoteJid, {
            text: `💳 *SALDO COIN*\n\n👤 User: ${senderNumber}\n🪙 Saldo: ${balance} COIN\n\n💡 Topup: *pay [nominal]*\n📋 Daftar: 10rb,20rb,30rb,40rb,50rb,75rb,100rb,150rb,200rb,250rb,300rb,500rb,1jt`
        });
    } catch (error) {
        console.error('❌ [CEK SALDO] Error:', error.message);
    }
}

// ============================================================
// 🔥 HANDLE RIWAYAT TRANSAKSI
// ============================================================

async function handleRiwayat(sock, m) {
    try {
        const remoteJid = m.key.remoteJid;
        const senderNumber = m.senderNumber || m.key.remoteJid || 'Unknown';
        
        const sessions = loadPaymentSessions();
        const userTransactions = Object.values(sessions)
            .filter(s => s.userId === senderNumber)
            .sort((a, b) => (b.created || 0) - (a.created || 0))
            .slice(0, 10);
        
        if (userTransactions.length === 0) {
            await sock.sendMessage(remoteJid, {
                text: `📋 *RIWAYAT TRANSAKSI*\n\nBelum ada transaksi.\n💡 Lakukan topup: *pay [nominal]*`
            });
            return;
        }
        
        let teks = `📋 *RIWAYAT TRANSAKSI*\n\n`;
        userTransactions.forEach((t, i) => {
            const statusEmoji = t.status === 'success' ? '✅' : t.status === 'expired' ? '⏰' : t.status === 'cancelled' ? '❌' : '⏳';
            const statusText = t.status === 'success' ? 'Berhasil' : t.status === 'expired' ? 'Kadaluarsa' : t.status === 'cancelled' ? 'Dibatalkan' : 'Pending';
            const date = t.created ? new Date(t.created).toLocaleString('id-ID') : '-';
            teks += `${i+1}. ${statusEmoji} Rp${(t.amount || 0).toLocaleString('id-ID')} - ${statusText}\n   🆔 ${t.transaction_id || '-'}\n   📅 ${date}\n\n`;
        });
        
        teks += `💡 Topup: *pay [nominal]*`;
        
        await sock.sendMessage(remoteJid, {
            text: teks
        });
    } catch (error) {
        console.error('❌ [RIWAYAT] Error:', error.message);
    }
}

// ============================================================
// 🔥 HANDLE CALLBACK BUTTON
// ============================================================

async function handlePaymentCallback(sock, m) {
    try {
        const remoteJid = m.key.remoteJid;
        const buttonData = m.message?.buttonsResponseMessage?.selectedButtonId || m.message?.templateButtonReplyMessage?.selectedId || '';
        
        console.log(`🔘 [PAYMENT CALLBACK] Data: ${buttonData}`);
        
        if (buttonData && buttonData.startsWith('cancel_payment_')) {
            const transactionId = buttonData.replace('cancel_payment_', '');
            await handleCancelPayment(sock, m, transactionId);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('❌ [PAYMENT CALLBACK] Error:', error.message);
        return false;
    }
}

// ============================================================
// 🔥 MAIN HANDLER - DIPANGGIL DARI WABOT
// ============================================================

async function handlePayment(sock, m, args, options) {
    const cmdName = (args && args.length > 0) ? args[0] : '';
    
    // 🔥 CEK APAKAH INI CALLBACK BUTTON
    if (m.message?.buttonsResponseMessage || m.message?.templateButtonReplyMessage) {
        const handled = await handlePaymentCallback(sock, m);
        if (handled) return true;
    }
    
    // 🔥 CEK COMMAND
    if (cmdName === 'pay' || cmdName === 'payment') {
        const payArgs = args.slice(1);
        await handlePaymentCommand(sock, m, payArgs, options);
        return true;
    }
    
    if (cmdName === 'cek' || cmdName === 'check') {
        const cekArgs = args.slice(1);
        await handleCekStatus(sock, m, cekArgs);
        return true;
    }
    
    if (cmdName === 'saldo' || cmdName === 'balance' || cmdName === 'cekcoin') {
        await handleCekSaldo(sock, m);
        return true;
    }
    
    if (cmdName === 'riwayat' || cmdName === 'history' || cmdName === 'transaksi') {
        await handleRiwayat(sock, m);
        return true;
    }
    
    return false;
}

// ============================================================
// 🔥 EXPORT
// ============================================================

module.exports = {
    handlePayment,
    handlePaymentCommand,
    handleCekStatus,
    handleCekSaldo,
    handleRiwayat,
    handleCancelPayment,
    handlePaymentCallback,
    deleteQRISMessage,
    loadPaymentSessions,
    savePaymentSessions,
    getUserCoin,
    addUserCoin,
    PRICE_MAP,
    PRICE_LIST,
    QRIS_EXPIRY_MINUTES,
};

console.log('✅ [WABOT PAYMENT] Module loaded!');
console.log(`⏳ QRIS Expiry: ${QRIS_EXPIRY_MINUTES} minutes`);