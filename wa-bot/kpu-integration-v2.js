// ==========================================
// 🔥 KPU INTEGRATION V2 - INPUT NIK LANGSUNG (TANPA FILE)
// ==========================================
// V2: User kirim NIK langsung di chat (max 50 NIK)
// Harga: Rp500/NIK valid (sama seperti V1)
// ==========================================

const path = require('path');
const fs = require('fs');
const kpuChecker = require('./kpu_checker.js');
const { parseWilayah } = require('./wilayah-lookup');
const saldo = require('./saldo.js');

const HARGA_PER_NIK = 500;
const MINIMAL_SALDO_CEK = HARGA_PER_NIK;
const MAX_NIK_V2 = 50;

// ==========================================
// 🔥 WHITELIST NOMOR PENGIRIM OTP (HANYA KPU)
// ==========================================

const KPU_OTP_SENDERS = [];

function isKpuSender(senderNumber) {
    if (KPU_OTP_SENDERS.length === 0) return true;
    
    if (!senderNumber) return false;
    const clean = String(senderNumber).replace(/[^0-9]/g, '');
    
    for (const allowed of KPU_OTP_SENDERS) {
        const cleanAllowed = String(allowed).replace(/[^0-9]/g, '');
        if (clean === cleanAllowed) return true;
        if (cleanAllowed.length >= 8 && clean.endsWith(cleanAllowed)) return true;
        if (clean.length >= 8 && cleanAllowed.endsWith(clean)) return true;
    }
    
    return false;
}

// ==========================================
// 🔥 HELPER: CEK OWNER
// ==========================================

function isOwnerNumber(number) {
    try {
        const config = require('./config.js');
        const ownerId = String(config.BOT?.OWNER_ID || '').trim();
        const userNum = String(number || '').trim();

        if (userNum === ownerId) return true;

        const variants = [
            ownerId,
            ownerId.replace(/^62/, '0'),
            ownerId.replace(/^0/, '62'),
            ownerId.replace(/^62/, ''),
            ownerId.replace(/^0/, '')
        ];

        for (const v of variants) {
            if (!v) continue;
            if (userNum === v) return true;
            if (userNum.endsWith(v) && v.length >= 8) return true;
        }

        return false;
    } catch (e) {
        console.log('❌ [OWNER] Error:', e.message);
        return false;
    }
}

// ==========================================
// 🔥 STATE V2
// ==========================================

const activeSessionsV2 = new Map();
// Format: { senderNumber: { status, nikList, currentIndex, results, isOwner } }

// ==========================================
// 🔥 PARSE NIK DARI PESAN TEKS
// ==========================================

function parseNikFromText(text) {
    if (!text) return [];
    
    // 🔥 Split per baris, koma, spasi, atau newline
    const tokens = text.split(/[\s,;\n\r\t]+/);
    
    const nikList = [];
    const seen = new Set();
    
    for (const token of tokens) {
        // 🔥 Hanya ambil yang 16 digit angka
        const clean = token.replace(/[^0-9]/g, '');
        if (clean.length === 16) {
            if (!seen.has(clean)) {
                seen.add(clean);
                nikList.push(clean);
            }
        }
    }
    
    return nikList;
}

// ==========================================
// 🔥 HANDLE COMMAND V2
// ==========================================

async function handleKpuV2Command(sock, m, cmdName, args, context = {}) {
    const { settings } = context;
    const senderNumber = m.senderNumber;
    const remoteJid = m.key.remoteJid;
    const isGroup = m.isGroup;

    if (isGroup) return false;

    // ==========================================
    // 🔥 COMMAND: /cekdptv2
    // ==========================================

    if (cmdName === 'cekdptv2' || cmdName === 'cekdpt2') {
        console.log(`📋 [KPU V2] Command dari ${senderNumber}`);

        const isOwnerUser = isOwnerNumber(senderNumber);

        // 🔥 CEK SALDO
        if (!isOwnerUser) {
            const saldoUser = saldo.getSaldo(senderNumber);
            console.log(`💰 [KPU V2] Saldo ${senderNumber}: Rp${saldo.formatRupiah(saldoUser)}`);

            if (saldoUser < MINIMAL_SALDO_CEK) {
                await sock.sendMessage(remoteJid, {
                    text: `⚠️ *SALDO KURANG*\n\n` +
                          `💰 Saldo kamu: *Rp${saldo.formatRupiah(saldoUser)}*\n` +
                          `📌 Minimal: *Rp${saldo.formatRupiah(MINIMAL_SALDO_CEK)}* (1 NIK)\n` +
                          `💵 Harga: Rp${saldo.formatRupiah(HARGA_PER_NIK)}/NIK valid\n\n` +
                          `👉 Silakan *TOPUP* dulu sebelum cek DPT V2.`
                });
                return true;
            }
        }

        await sock.sendMessage(remoteJid, {
            text: `📋 *CEK DPT V2 - INPUT NIK LANGSUNG*\n\n` +
                  `📌 *Cara pakai:*\n` +
                  `1. Kirim NIK langsung di chat (tanpa file)\n` +
                  `2. Bisa 1 NIK atau banyak (max ${MAX_NIK_V2} NIK)\n` +
                  `3. Bot akan cek otomatis satu per satu\n` +
                  `4. OTP akan dikirim ke WA: ${kpuChecker.CONFIG.phoneNumber}\n` +
                  `5. OTP akan otomatis terisi\n\n` +
                  `📝 *Format:*\n` +
                  `\`\`\`\n` +
                  `37042356757867886\n` +
                  `37042356757867886\n` +
                  `37042356757867886\n` +
                  `\`\`\`\n` +
                  `_(1 NIK per baris, atau pisah dengan spasi/koma)_\n\n` +
                  `💰 *BIAYA:*\n` +
                  `• Rp${saldo.formatRupiah(HARGA_PER_NIK)}/NIK *valid*\n` +
                  `• NIK tidak terdaftar = GRATIS\n` +
                  `• Max: ${MAX_NIK_V2} NIK per request\n` +
                  (isOwnerUser
                      ? `• 👑 *OWNER: GRATIS UNLIMITED*\n`
                      : `• 💳 Saldo kamu: *Rp${saldo.formatRupiah(saldo.getSaldo(senderNumber))}*\n`) +
                  `\n⚠️ *Syarat:*\n` +
                  `• NIK harus 16 digit\n` +
                  `• Nomor WA aktif\n\n` +
                  `💡 Kirim NIK sekarang...`
        });

        // 🔥 SET SESSION: nunggu NIK
        activeSessionsV2.set(senderNumber, {
            status: 'waiting_nik',
            createdAt: Date.now(),
            isOwner: isOwnerUser,
            senderNumber: senderNumber,
        });

        return true;
    }

    // ==========================================
    // 🔥 COMMAND: /statusdptv2
    // ==========================================

    if (cmdName === 'statusdptv2' || cmdName === 'statusdpt2') {
        const session = activeSessionsV2.get(senderNumber);

        if (!session) {
            await sock.sendMessage(remoteJid, {
                text: `📊 *Tidak ada proses cek DPT V2 aktif*`
            });
            return true;
        }

        let statusText = `📊 *STATUS CEK DPT V2*\n\n`;
        statusText += `📌 Status: ${session.status}\n`;

        if (session.nikList) {
            statusText += `📋 Total NIK: ${session.nikList.length}\n`;
            statusText += `✅ Selesai: ${session.currentIndex || 0}\n`;
            statusText += `⏳ Sisa: ${session.nikList.length - (session.currentIndex || 0)}\n`;
        }

        await sock.sendMessage(remoteJid, { text: statusText });
        return true;
    }

    // ==========================================
    // 🔥 COMMAND: /bataldptv2
    // ==========================================

    if (cmdName === 'bataldptv2' || cmdName === 'stopdptv2') {
        console.log(`🛑 [KPU V2] Batal dari ${senderNumber}`);

        activeSessionsV2.delete(senderNumber);
        await kpuChecker.closeBrowser();

        await sock.sendMessage(remoteJid, {
            text: `🛑 *Proses cek DPT V2 dibatalkan*`
        });

        return true;
    }

    // ==========================================
    // 🔥 COMMAND: /otp (sama seperti V1)
    // ==========================================

    if (cmdName === 'otp') {
        console.log(`🔐 [OTP V2] Command /otp dari ${senderNumber}, args: ${JSON.stringify(args)}`);

        if (!args[0]) {
            await sock.sendMessage(remoteJid, {
                text: `❌ *Format salah!*\n\nGunakan: /otp 123456`
            });
            return true;
        }

        const otpCode = args[0].replace(/[^0-9]/g, '');

        if (otpCode.length < 4 || otpCode.length > 8) {
            await sock.sendMessage(remoteJid, {
                text: `❌ *OTP harus 4-8 digit!*\n\nContoh: /otp 123456`
            });
            return true;
        }

        const success = kpuChecker.submitOtp(otpCode);

        if (success) {
            await sock.sendMessage(remoteJid, {
                text: `✅ *OTP terkirim ke sistem!*\n\n🔐 Kode: ${otpCode}\n⏳ Mohon tunggu proses verifikasi...`
            });
        } else {
            await sock.sendMessage(remoteJid, {
                text: `⚠️ *Tidak ada proses cek DPT V2 yang aktif*`
            });
        }

        return true;
    }

    return false;
}

// ==========================================
// 🔥 HANDLE PESAN TEKS (NIK LANGSUNG)
// ==========================================

async function handleNikTextMessage(sock, m, context = {}) {
    const { settings } = context;
    const senderNumber = m.senderNumber;
    const remoteJid = m.key.remoteJid;
    const isGroup = m.isGroup;

    if (isGroup) return false;

    // 🔥 Cek session V2
    let key = senderNumber;
    if (!key || key === 'Unknown') {
        key = remoteJid;
    }

    const session = activeSessionsV2.get(key);
    if (!session) return false;
    if (session.status !== 'waiting_nik') return false;

    // 🔥 Ambil body pesan
    const msg = m.message || {};
    const body =
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        '';

    if (!body) return false;

    // 🔥 Skip kalau pesan berupa command
    if (body.startsWith('/') || body.startsWith('.') || body.startsWith('!')) {
        return false;
    }

    console.log(`📩 [KPU V2] Terima input NIK dari ${senderNumber}: "${body.substring(0, 100)}..."`);

    // 🔥 Parse NIK dari teks
    const nikList = parseNikFromText(body);

    if (nikList.length === 0) {
        await sock.sendMessage(remoteJid, {
            text: `❌ *Tidak ada NIK valid ditemukan!*\n\n` +
                  `📌 Pastikan format:\n` +
                  `\`\`\`\n` +
                  `37042356757867886\n` +
                  `37042356757867886\n` +
                  `\`\`\`\n\n` +
                  `• NIK harus 16 digit\n` +
                  `• Bisa 1 per baris / spasi / koma\n` +
                  `• Max ${MAX_NIK_V2} NIK\n\n` +
                  `💡 Kirim ulang NIK, atau ketik /bataldptv2 untuk batal.`
        });
        return true;
    }

    // 🔥 Cek max 50 NIK
    if (nikList.length > MAX_NIK_V2) {
        await sock.sendMessage(remoteJid, {
            text: `❌ *Terlalu banyak NIK!*\n\n` +
                  `📋 NIK terdeteksi: *${nikList.length}*\n` +
                  `📌 Maksimal: *${MAX_NIK_V2} NIK* per request\n\n` +
                  `💡 Silakan kirim ulang dengan jumlah ≤ ${MAX_NIK_V2}, atau bagi jadi beberapa request.`
        });
        return true;
    }

    // 🔥 Cek saldo (non-owner)
    const isOwner = session.isOwner === true;
    
    if (!isOwner) {
        const saldoUser = saldo.getSaldo(senderNumber);
        const estimasiMaksimal = nikList.length * HARGA_PER_NIK;

        console.log(`💰 [KPU V2] Saldo: Rp${saldo.formatRupiah(saldoUser)} | Estimasi maks: Rp${saldo.formatRupiah(estimasiMaksimal)}`);

        if (saldoUser < estimasiMaksimal) {
            const cukupUntuk = Math.floor(saldoUser / HARGA_PER_NIK);
            await sock.sendMessage(remoteJid, {
                text: `❌ *SALDO TIDAK CUKUP*\n\n` +
                      `📋 Total NIK: *${nikList.length}*\n` +
                      `💰 Estimasi maksimal: *Rp${saldo.formatRupiah(estimasiMaksimal)}*\n` +
                      `   _(asumsi semua NIK valid)_\n` +
                      `💳 Saldo kamu: *Rp${saldo.formatRupiah(saldoUser)}*\n` +
                      `✅ Cukup untuk: *${cukupUntuk} NIK*\n\n` +
                      `📌 *Catatan:* Yang benar-benar dipotong hanya NIK dengan data *VALID*.\n` +
                      `NIK tidak terdaftar = GRATIS.\n\n` +
                      `👉 Silakan *TOPUP* dulu.`
            });
            return true;
        }
    }

    // 🔥 Update session
    session.status = 'processing';
    session.nikList = nikList;
    session.currentIndex = 0;
    session.results = [];

    // 🔥 Notif mulai proses
    await sock.sendMessage(remoteJid, {
        text: `⏳ *Memproses ${nikList.length} NIK...*\n\n` +
              `📋 Mode: *CEK DPT V2*\n` +
              `💰 Harga: Rp${saldo.formatRupiah(HARGA_PER_NIK)}/NIK valid\n` +
              `Hasil akan dikirim setelah selesai.`
    });

    // 🔥 Jalankan batch di background
    processBatchV2(sock, key, remoteJid, nikList).catch(err => {
        console.error(`❌ [KPU V2] Batch error:`, err.message);
    });

    return true;
}

// ==========================================
// 🔥 PROSES BATCH V2
// ==========================================

async function processBatchV2(sock, sessionKey, remoteJid, nikList) {
    const session = activeSessionsV2.get(sessionKey);
    if (!session) return;

    let excelPath = null;

    console.log(`\n🚀 [KPU V2] Memulai batch ${nikList.length} NIK...`);

    try {
        await kpuChecker.initBrowser();

        for (let i = 0; i < nikList.length; i++) {
            const nik = nikList[i];
            session.currentIndex = i;

            console.log(`\n📋 [KPU V2] ${i + 1}/${nikList.length} - NIK: ${nik}`);

            const result = await kpuChecker.checkSingleNik(nik, kpuChecker.CONFIG.phoneNumber);
            session.results.push(result);

            if (result.status === 'success') {
                console.log(`   ✅ ${result.data?.nama || '-'} | ${result.data?.status || '-'}`);
            } else if (result.status === 'not_registered') {
                console.log(`   ⚠️ TIDAK TERDAFTAR`);
            } else {
                console.log(`   ❌ ${result.error || 'Gagal'}`);
            }

            if (i < nikList.length - 1) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // 🔥 Selesai
        session.status = 'completed';

        const successCount = session.results.filter(r => r.status === 'success').length;
        const notRegCount = session.results.filter(r => r.status === 'not_registered').length;
        const failedCount = session.results.filter(r => r.status !== 'success' && r.status !== 'not_registered').length;

        // 🔥 Simpan ke Excel (untuk dikirim ke Telegram via bridge)
        try {
            const { buildExcel } = require('./excel-builder');

            session.results.forEach(r => {
                if (r.data && r.data.wilayah) {
                    const w = parseWilayah(r.data.wilayah);
                    r.data.provinsi = w.provinsi;
                    r.data.kabupaten = w.kabupaten;
                    r.data.kecamatan = w.kecamatan;
                    r.data.kelurahan = w.kelurahan;
                }
            });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            excelPath = path.join(__dirname, `Hasil_Cek_DPT_V2_${timestamp}.xlsx`);
            await buildExcel(session.results, excelPath);

            console.log(`📊 [KPU V2] Excel tersimpan: ${excelPath}`);

            // 🔥 Kirim file Excel via WA
            await sock.sendMessage(remoteJid, {
                document: fs.readFileSync(excelPath),
                mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                fileName: `Hasil_Cek_DPT_V2_${timestamp}.xlsx`,
                caption: `📊 *HASIL CEK DPT V2*\n\nTotal: ${nikList.length} NIK\n✅ ${successCount} | ⚠️ ${notRegCount} | ❌ ${failedCount}`
            });

            console.log(`✅ [KPU V2] File Excel terkirim ke WA`);
        } catch (e) {
            console.error(`❌ [KPU V2] Gagal buat Excel:`, e.message);
        }

        // 🔥 Hitung biaya
        const validCount = session.results.filter(r =>
            r.status === 'success' &&
            r.data &&
            r.data.validasi === 'DATA VALID'
        ).length;

        const totalBiaya = validCount * HARGA_PER_NIK;

        console.log(`💰 [KPU V2] NIK valid: ${validCount} | Biaya: Rp${saldo.formatRupiah(totalBiaya)}`);

        const isOwner = session.isOwner === true;

        // 🔥 Potong saldo
        let saldoCukup = true;
        let sisaSaldo = saldo.getSaldo(sessionKey);

        if (!isOwner && totalBiaya > 0) {
            const potongBerhasil = saldo.kurangiSaldo(sessionKey, totalBiaya);

            if (potongBerhasil) {
                sisaSaldo = saldo.getSaldo(sessionKey);
                console.log(`✅ [KPU V2] Saldo dipotong: Rp${saldo.formatRupiah(totalBiaya)} | Sisa: Rp${saldo.formatRupiah(sisaSaldo)}`);
            } else {
                saldoCukup = false;
                console.log(`❌ [KPU V2] Gagal potong saldo`);
            }
        } else if (isOwner) {
            console.log(`👑 [KPU V2] Owner mode — GRATIS`);
        }

        // 🔥 Kirim ringkasan
        let ringkasanText = `📊 *HASIL CEK DPT V2*\n\n` +
                            `Total: ${nikList.length} NIK\n` +
                            `✅ ${successCount} | ⚠️ ${notRegCount} | ❌ ${failedCount}\n\n`;

        if (isOwner) {
            ringkasanText += `━━━━━━━━━━━━━━━━━━\n`;
            ringkasanText += `👑 *OWNER MODE*\n`;
            ringkasanText += `💰 *GRATIS UNLIMITED*\n`;
            ringkasanText += `📋 Data Valid: ${validCount} NIK\n`;
            if (validCount > 0) {
                ringkasanText += `💵 Normalnya: Rp${saldo.formatRupiah(totalBiaya)} (gratis)`;
            }
        } else if (validCount > 0) {
            ringkasanText += `━━━━━━━━━━━━━━━━━━\n`;
            ringkasanText += `💰 *BIAYA CEK DPT V2*\n`;
            ringkasanText += `📋 Data Valid: ${validCount} NIK\n`;
            ringkasanText += `💵 Harga: Rp${saldo.formatRupiah(HARGA_PER_NIK)}/NIK\n`;
            ringkasanText += `💳 Total Biaya: *Rp${saldo.formatRupiah(totalBiaya)}*\n`;

            if (saldoCukup) {
                ringkasanText += `💰 Sisa Saldo: *Rp${saldo.formatRupiah(sisaSaldo)}*`;
            } else {
                ringkasanText += `\n⚠️ *Saldo tidak cukup!* Silakan topup.`;
            }
        } else {
            ringkasanText += `💰 *GRATIS* — tidak ada data valid`;
        }

        await sock.sendMessage(remoteJid, { text: ringkasanText });

        console.log(`\n✅ [KPU V2] Batch selesai — ${session.results.length} NIK diproses`);

    } catch (e) {
        console.error(`❌ [KPU V2] Batch error:`, e.message);
        await sock.sendMessage(remoteJid, {
            text: `❌ *Proses gagal:* ${e.message}`
        });
    } finally {
        await kpuChecker.closeBrowser();

        try {
            if (excelPath && fs.existsSync(excelPath)) {
                fs.unlinkSync(excelPath);
                console.log(`🗑️ [KPU V2] File Excel dihapus: ${excelPath}`);
            }
        } catch (e) {}

        setTimeout(() => {
            activeSessionsV2.delete(sessionKey);
            console.log(`🗑️ [KPU V2] Session ${sessionKey} dihapus`);
        }, 5 * 60 * 1000);
    }
}

// ==========================================
// 🔥 AUTO-DETECT OTP (sama seperti V1)
// ==========================================

async function autoDetectOtpV2(sock, m) {
    // 🔥 Reuse logic dari V1 (import dari kpu-integration.js)
    const kpuIntegration = require('./kpu-integration.js');
    return await kpuIntegration.autoDetectOtp(sock, m);
}

// ==========================================
// 🔥 EXPORT
// ==========================================

module.exports = {
    handleKpuV2Command,
    handleNikTextMessage,
    autoDetectOtpV2,
    activeSessionsV2,
    parseNikFromText,
    MAX_NIK_V2,
    HARGA_PER_NIK,
};