// ==========================================
// 🔥 KPU INTEGRATION - HUBUNGKAN KE WA BOT
// ==========================================
// File ini yang akan dipanggil dari file utama bot Anda
// ==========================================

const path = require('path');
const fs = require('fs');
const kpuChecker = require('./kpu_checker.js');
const wabotPayment = require('./wabot_payment.js');
const { parseWilayah } = require('./wilayah-lookup');

const saldo = require('./saldo.js');
const HARGA_PER_NIK = 500;
const MINIMAL_SALDO_CEK = HARGA_PER_NIK; // minimal 1 NIK

// ==========================================
// 🔥 WHITELIST NOMOR PENGIRIM OTP (HANYA KPU)
// ==========================================

// 🔥 KOSONG = terima semua nomor, filter pakai ISI PESAN
const KPU_OTP_SENDERS = [];

function isKpuSender(senderNumber) {
    // 🔥 Kalau whitelist KOSONG → terima semua (filter pakai isi pesan)
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

// 🔥 HELPER: cek owner
function isOwnerNumber(number) {
    try {
        const config = require('./config.js');
        const ownerId = String(config.BOT?.OWNER_ID || '').trim();
        const userNum = String(number || '').trim();

        // 🔥 Cek langsung
        if (userNum === ownerId) return true;

        // 🔥 Cek varian format (62 ↔ 0 ↔ tanpa prefix)
        const variants = [
            ownerId,                              // 8677011932
            ownerId.replace(/^62/, '0'),          // 08677011932
            ownerId.replace(/^0/, '62'),          // 628677011932
            ownerId.replace(/^62/, ''),           // 8677011932 (tanpa 62)
            ownerId.replace(/^0/, '')             // 8677011932 (tanpa 0)
        ];

        for (const v of variants) {
            if (!v) continue;
            if (userNum === v) return true;
            if (userNum.endsWith(v) && v.length >= 8) return true;
        }

        console.log(`🔍 [OWNER-CHECK] userNum="${userNum}" vs ownerId="${ownerId}" → FALSE`);
        return false;
    } catch (e) {
        console.log('❌ [OWNER] Error:', e.message);
        return false;
    }
}

// ==========================================
// 🔥 STATE
// ==========================================

const activeSessions = new Map(); // { senderNumber: { status, nikList, currentIndex, results } }

// 🔥 GUARD: biar OTP gak diproses 2x dalam waktu dekat
let lastOtpHandled = { code: null, time: 0 };
const OTP_DEDUP_MS = 15000; // 15 detik — OTP sama dalam 15s dianggap duplikat

// ==========================================
// 🔥 AUTO-DETECT OTP dari pesan KPU - FULL FIX + TEMPLATE MESSAGE
// ==========================================

async function autoDetectOtp(sock, m) {
    try {
        const msg = m.message || {};
        const remoteJid = m.key?.remoteJid || '';

        // 🔥 SKIP KALAU DARI GROUP (DOUBLE PROTECTION)
        if (remoteJid.endsWith('@g.us')) {
            return false;
        }

        // 🔥 SKIP KALAU DARI STATUS
        if (remoteJid === 'status@broadcast') {
            return false;
        }

        // 🔥 SKIP KALAU DARI BOT SENDIRI
        if (m.key?.fromMe) {
            return false;
        }
        
        // 🔥🔥🔥 FILTER: HANYA PROSES OTP DARI KPU
const senderNumber = (remoteJid || '').split('@')[0].replace(/[^0-9]/g, '');

if (!isKpuSender(senderNumber)) {
    console.log(`⏭️ [OTP-CHECK] Skip — bukan dari KPU: ${senderNumber || 'unknown'}`);
    return false;
}

console.log(`✅ [OTP-CHECK] Pengirim valid dari KPU: ${senderNumber}`);

        // 🔥 EKSTRAK BODY DARI SEMUA KEMUNGKINAN TIPE PESAN
        let body =
            msg.conversation ||
            msg.extendedTextMessage?.text ||
            msg.imageMessage?.caption ||
            msg.videoMessage?.caption ||
            msg.documentMessage?.caption ||
            msg.viewOnceMessage?.message?.conversation ||
            msg.viewOnceMessage?.message?.extendedTextMessage?.text ||
            msg.viewOnceMessage?.message?.imageMessage?.caption ||
            msg.ephemeralMessage?.message?.conversation ||
            msg.ephemeralMessage?.message?.extendedTextMessage?.text ||
            msg.ephemeralMessage?.message?.imageMessage?.caption ||
            '';

        // ============================================================
        // 🔥 TAMBAHAN: HANDLE templateMessage (dari WhatsApp Business API / KPU)
        // ============================================================
        if (!body && msg.templateMessage) {
            const tm = msg.templateMessage;
            console.log(`🔍 [OTP-CHECK] templateMessage keys:`, Object.keys(tm));

            // Format 1: hydratedTemplate
            if (tm.hydratedTemplate) {
                const ht = tm.hydratedTemplate;
                body =
                    ht.hydratedContentText ||
                    ht.hydratedTitleText ||
                    ht.hydratedFooterText ||
                    '';
                if (body) {
                    console.log(`🔍 [OTP-CHECK] hydratedTemplate text: "${body.substring(0, 200)}"`);
                }

                // Kalau masih kosong, coba scan button
                if (!body && ht.hydratedButtons) {
                    for (const btn of ht.hydratedButtons) {
                        const btnText = btn?.quickReplyButton?.displayText ||
                                       btn?.urlButton?.displayText ||
                                       btn?.callButton?.displayText ||
                                       '';
                        if (btnText) body += btnText + ' ';
                    }
                }
            }

            // Format 2: fourRowTemplate
            if (!body && tm.fourRowTemplate) {
                const frt = tm.fourRowTemplate;
                body =
                    frt.content?.extendedTextMessage?.text ||
                    frt.content?.imageMessage?.caption ||
                    frt.highlightText ||
                    frt.title ||
                    '';
            }

            // Format 3: hydratedFourRowTemplate
            if (!body && tm.hydratedFourRowTemplate) {
                const hfrt = tm.hydratedFourRowTemplate;
                body =
                    hfrt.hydratedContentText ||
                    hfrt.hydratedTitleText ||
                    '';
            }

            // Format 4: interactiveMessage
            if (!body && tm.interactiveMessage) {
                const im = tm.interactiveMessage;
                body =
                    im.body?.text ||
                    im.header?.text ||
                    im.footer?.text ||
                    '';
            }

            // 🔥 Format 5: raw scan — cari text & angka di dalam JSON template
            if (!body) {
                try {
                    const rawJson = JSON.stringify(tm);

                    // Cari semua field "text":"..."
                    const textMatches = rawJson.match(/"text"\s*:\s*"([^"]{3,300})"/g);
                    if (textMatches) {
                        body = textMatches
                            .map(s => {
                                const m = s.match(/"text"\s*:\s*"([^"]+)"/);
                                return m ? m[1] : '';
                            })
                            .join(' ');
                    }

                    // Kalau masih kosong, cari angka 4-8 digit apapun di JSON
                    if (!body) {
                        const numMatch = rawJson.match(/\b(\d{4,8})\b/);
                        if (numMatch) {
                            body = numMatch[1];
                            console.log(`🔍 [OTP-CHECK] Fallback raw JSON, dapat angka: ${body}`);
                        }
                    }

                    // Cari juga field hydratedContentText / displayText / hydratedTitleText
                    if (!body) {
                        const altMatches = rawJson.match(/"(?:hydratedContentText|displayText|hydratedTitleText)"\s*:\s*"([^"]{3,300})"/g);
                        if (altMatches) {
                            body = altMatches
                                .map(s => {
                                    const m = s.match(/:\s*"([^"]+)"\s*$/);
                                    return m ? m[1] : '';
                                })
                                .join(' ');
                        }
                    }
                } catch (e) {
                    console.log(`⚠️ [OTP-CHECK] Gagal scan raw template: ${e.message}`);
                }
            }

            if (body) {
                console.log(`✅ [OTP-CHECK] Body dari templateMessage: "${body.substring(0, 200)}"`);
            }
        }
        // ============================================================
        // 🔥 AKHIR TAMBAHAN templateMessage
        // ============================================================

        if (!body) {
            const sender = m.key?.remoteJid || m.senderJid || '';
            console.log(`⚠️ [OTP-CHECK] Body kosong dari ${sender}, tipe: ${Object.keys(msg)[0]}`);
            return false;
        }

        console.log(`📩 [OTP-CHECK] Body: "${body.substring(0, 200)}"`);

        // 🔥 DETEKSI: apakah ini pesan OTP?
        const lower = body.toLowerCase();
        const hasOtpKeyword =
            lower.includes('otp') ||
            lower.includes('kode') ||
            lower.includes('code') ||
            lower.includes('verifikasi') ||
            lower.includes('verification') ||
            lower.includes('teman pemilih') ||
            lower.includes('cekdptonline') ||
            lower.includes('cek dpt') ||
            lower.includes('masukkan angka') ||
            lower.includes('angka ini') ||
            lower.includes('berlaku') ||
            lower.includes('rahasia') ||
            lower.includes('jangan bagikan');

        // 🔥 EKSTRAK KODE OTP (4-8 digit)
        let otpCode = null;

        // Prioritas 1: angka 4-8 digit berdiri sendiri di baris
        let match = body.match(/^\s*(\d{4,8})\s*$/m);
        if (match) otpCode = match[1];

        // Prioritas 2: setelah kata kunci OTP
        if (!otpCode) {
            match = body.match(/(?:otp|kode|code|verifikasi)[^\d]{0,30}(\d{4,8})/i);
            if (match) otpCode = match[1];
        }

        // Prioritas 3: angka 6 digit (paling umum untuk OTP)
        if (!otpCode) {
            match = body.match(/\b(\d{6})\b/);
            if (match) otpCode = match[1];
        }

        // Prioritas 4: angka 4-8 digit apapun
        if (!otpCode) {
            match = body.match(/\b(\d{4,8})\b/);
            if (match) otpCode = match[1];
        }

        // 🔥 PRIORITAS KHUSUS KPU: "masukkan angka ini ke halaman cekdptonline anda :\n\n 27423"
        if (!otpCode) {
            match = body.match(/masukkan\s+angka[^\d]*(\d{4,8})/i);
            if (match) {
                otpCode = match[1];
                console.log(`✅ [OTP-CHECK] Regex KPU match: ${otpCode}`);
            }
        }

        // 🔥 PRIORITAS: angka berdiri sendiri setelah baris kosong
        if (!otpCode) {
            match = body.match(/\n\s*(\d{4,8})\s*\n/);
            if (match) {
                otpCode = match[1];
                console.log(`✅ [OTP-CHECK] Regex newline match: ${otpCode}`);
            }
        }

        if (!otpCode) {
            console.log('⚠️ [OTP-CHECK] Tidak ada kode OTP di body');
            return false;
        }

        // 🔥 DEDUP: kalau OTP sama baru diproses <15s lalu, skip
        const now = Date.now();
        if (lastOtpHandled.code === otpCode && (now - lastOtpHandled.time) < OTP_DEDUP_MS) {
            console.log(`⏭️ [OTP-CHECK] Duplikat OTP ${otpCode} (baru diproses ${Math.round((now - lastOtpHandled.time)/1000)}s lalu), skip`);
            return true;
        }

        console.log(`🔐 [OTP-CHECK] ✅ Kode terdeteksi: ${otpCode} | Keyword: ${hasOtpKeyword}`);

        // 🔥 Kirim ke browser checker
        const success = kpuChecker.submitOtp(otpCode);
        if (success) {
            console.log(`✅ [OTP-CHECK] OTP ${otpCode} dikirim ke browser`);
            lastOtpHandled = { code: otpCode, time: now };
        } else {
            console.log(`⚠️ [OTP-CHECK] submitOtp return false (mungkin tidak ada proses aktif)`);
        }

        return true;
    } catch (e) {
        console.log(`❌ [OTP-CHECK] Error: ${e.message}`);
        return false;
    }
}

// ==========================================
// 🔥 HANDLE COMMAND DARI WA
// ==========================================

async function handleKpuCommand(sock, m, cmdName, args, context = {}) {
    const { settings, isOwner: ctxIsOwner } = context; // ✅ renamed biar ga redeclare
    const senderNumber = m.senderNumber;
    const remoteJid = m.key.remoteJid;
    const isGroup = m.isGroup;

    // 🔥 OTP sudah di-handle di server.js — JANGAN dipanggil lagi di sini
    // biar gak dobel submitOtp()

    // 🔥 Hanya handle di private chat
    if (isGroup) return false;

    // ==========================================
    // 🔥 COMMAND: /cekdpt
    // ==========================================

    if (cmdName === 'cekdpt' || cmdName === 'ceknik') {
        console.log(`📋 [KPU] Command dari ${senderNumber}`);

        const isOwnerUser = isOwnerNumber(senderNumber); // ✅ nama beda dari ctxIsOwner

        // 🔥 CEK SALDO DULU (khusus non-owner)
        if (!isOwnerUser) {
            const saldoUser = saldo.getSaldo(senderNumber);
            console.log(`💰 [KPU] Saldo ${senderNumber}: Rp${saldo.formatRupiah(saldoUser)}`);

            if (saldoUser < MINIMAL_SALDO_CEK) {
                await sock.sendMessage(remoteJid, {
                    text: `⚠️ *SALDO KURANG*\n\n` +
                          `💰 Saldo kamu: *Rp${saldo.formatRupiah(saldoUser)}*\n` +
                          `📌 Minimal: *Rp${saldo.formatRupiah(MINIMAL_SALDO_CEK)}* (1 NIK)\n` +
                          `💵 Harga: Rp${saldo.formatRupiah(HARGA_PER_NIK)}/NIK valid\n\n` +
                          `👉 Silakan *TOPUP* dulu sebelum cek DPT.\n` +
                          `Ketik menu topup atau hubungi owner.`
                });
                return true;
            }
        }

        await sock.sendMessage(remoteJid, {
            text: `📋 *CEK DPT ONLINE KPU*\n\n` +
                  `📌 *Cara pakai:*\n` +
                  `1. Kirim file Excel (.xlsx) berisi NIK\n` +
                  `2. Bot akan cek otomatis satu per satu\n` +
                  `3. OTP akan dikirim ke WA: ${kpuChecker.CONFIG.phoneNumber}\n` +
                  `4. OTP akan otomatis terisi (atau kirim: /otp 123456)\n\n` +
                  `💰 *BIAYA:*\n` +
                  `• Rp${saldo.formatRupiah(HARGA_PER_NIK)}/NIK *valid*\n` +
                  `• NIK tidak terdaftar = GRATIS\n` +
                  (isOwnerUser
                      ? `• 👑 *OWNER: GRATIS UNLIMITED*\n`
                      : `• 💳 Saldo kamu: *Rp${saldo.formatRupiah(saldo.getSaldo(senderNumber))}*\n`) +
                  `\n⚠️ *Syarat:*\n` +
                  `• File harus .xlsx\n` +
                  `• NIK harus 16 digit\n` +
                  `• Nomor WA aktif\n\n` +
                  `💡 Kirim file Excel sekarang...`
        });

        // Set session nunggu file
        activeSessions.set(senderNumber, {
            status: 'waiting_file',
            createdAt: Date.now(),
            isOwner: isOwnerUser, // ✅
            senderNumber: senderNumber,
        });

        return true;
    }

    // ==========================================
    // 🔥 COMMAND: /otp <kode>
    // ==========================================

    if (cmdName === 'otp') {
        console.log(`🔐 [OTP-CMD] Command /otp dari ${senderNumber}, args: ${JSON.stringify(args)}`);

        if (!args[0]) {
            console.log(`❌ [OTP-CMD] Tidak ada argumen`);
            await sock.sendMessage(remoteJid, {
                text: `❌ *Format salah!*\n\nGunakan: /otp 123456`
            });
            return true;
        }

        const otpCode = args[0].replace(/[^0-9]/g, '');
        console.log(`🔐 [OTP-CMD] Kode yang akan dikirim: ${otpCode}`);

        if (otpCode.length < 4 || otpCode.length > 8) {
            await sock.sendMessage(remoteJid, {
                text: `❌ *OTP harus 4-8 digit!*\n\nContoh: /otp 123456`
            });
            return true;
        }

        console.log(`🔐 [OTP-CMD] Memanggil submitOtp...`);
        const success = kpuChecker.submitOtp(otpCode);
        console.log(`🔐 [OTP-CMD] submitOtp result: ${success}`);

        if (success) {
            await sock.sendMessage(remoteJid, {
                text: `✅ *OTP terkirim ke sistem!*\n\n🔐 Kode: ${otpCode}\n⏳ Mohon tunggu proses verifikasi...`
            });
        } else {
            await sock.sendMessage(remoteJid, {
                text: `⚠️ *Tidak ada proses cek DPT yang aktif*`
            });
        }

        return true;
    }

    // ==========================================
    // 🔥 COMMAND: /statusdpt
    // ==========================================

    if (cmdName === 'statusdpt') {
        const session = activeSessions.get(senderNumber);

        if (!session) {
            await sock.sendMessage(remoteJid, {
                text: `📊 *Tidak ada proses cek DPT aktif*`
            });
            return true;
        }

        let statusText = `📊 *STATUS CEK DPT*\n\n`;
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
    // 🔥 COMMAND: /bataldpt
    // ==========================================

    if (cmdName === 'bataldpt' || cmdName === 'stopdpt') {
        console.log(`🛑 [KPU] Batal dari ${senderNumber}`);

        activeSessions.delete(senderNumber);
        await kpuChecker.closeBrowser();

        await sock.sendMessage(remoteJid, {
            text: `🛑 *Proses cek DPT dibatalkan*`
        });

        return true;
    }

    return false;
}

// ==========================================
// 🔥 HANDLE FILE EXCEL MASUK
// ==========================================

async function handleExcelFile(sock, m, context = {}) {
    const senderNumber = m.senderNumber;
    const remoteJid = m.key.remoteJid;

    // 🔥 Ambil document apapun bentuknya
    const msg = m.message;
    let doc = null;

    const msgType = Object.keys(msg)[0];

    if (msgType === 'documentMessage') {
        doc = msg.documentMessage;
    } else if (msgType === 'documentWithCaptionMessage') {
        doc = msg.documentWithCaptionMessage?.message?.documentMessage;
    } else if (msgType === 'viewOnceMessage') {
        doc = msg.viewOnceMessage?.message?.documentMessage;
    } else if (msgType === 'ephemeralMessage') {
        const inner = msg.ephemeralMessage?.message || {};
        const innerType = Object.keys(inner)[0];
        if (innerType === 'documentMessage') {
            doc = inner.documentMessage;
        } else if (innerType === 'documentWithCaptionMessage') {
            doc = inner.documentWithCaptionMessage?.message?.documentMessage;
        }
    }

    if (!doc) return false;

    // 🔥 Cek session pakai senderNumber, kalau Unknown pakai remoteJid
    let key = senderNumber;
    if (!key || key === 'Unknown') {
        key = remoteJid;
        console.log(`⚠️ [KPU] senderNumber Unknown, pakai remoteJid sebagai key: ${remoteJid}`);
    }

    let session = activeSessions.get(key);

    // 🔥 FALLBACK: kalau session tidak ketemu, TETAP proses file
    if (!session) {
        console.log(`⚠️ [KPU] Tidak ada session untuk ${key}, tapi tetap proses file`);
        session = {
            status: 'processing',
            createdAt: Date.now(),
        };
        activeSessions.set(key, session);
    }

    const fileName = doc.fileName || '';

    // Cek .xlsx
    if (!fileName.toLowerCase().endsWith('.xlsx')) {
        await sock.sendMessage(remoteJid, {
            text: `❌ *File harus .xlsx!*\n\n📄 File Anda: ${fileName}`
        });
        return true;
    }

    console.log(`📂 [KPU] Menerima file: ${fileName} (key=${key})`);

    try {
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(doc, 'document');

        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const safeName = senderNumber === 'Unknown' ? 'user' : senderNumber;
        const filePath = path.join(uploadDir, `${safeName}_${Date.now()}.xlsx`);
        fs.writeFileSync(filePath, buffer);

        console.log(`✅ [KPU] File disimpan: ${filePath}`);

        const nikList = kpuChecker.readNikFromExcel(filePath);

        if (nikList.length === 0) {
            await sock.sendMessage(remoteJid, {
                text: `❌ *Tidak ada NIK ditemukan di file Excel*\n\n💡 Pastikan ada kolom berisi 16 digit NIK`
            });
            return true;
        }

        // 🔥 PAKAI isOwner DARI SESSION (konsisten)
        const isOwner = session.isOwner === true;

        console.log(`👑 [KPU] User: ${senderNumber} | Owner: ${isOwner}`);

        if (!isOwner) {
            const saldoUser = saldo.getSaldo(senderNumber);
            const estimasiMaksimal = nikList.length * HARGA_PER_NIK;

            console.log(`💰 [KPU] Saldo: Rp${saldo.formatRupiah(saldoUser)} | Estimasi maks: Rp${saldo.formatRupiah(estimasiMaksimal)}`);

            if (saldoUser < estimasiMaksimal) {
                const cukupUntuk = Math.floor(saldoUser / HARGA_PER_NIK);
                await sock.sendMessage(remoteJid, {
                    text: `❌ *SALDO TIDAK CUKUP*\n\n` +
                          `📋 Total NIK di file: *${nikList.length}*\n` +
                          `💰 Estimasi maksimal: *Rp${saldo.formatRupiah(estimasiMaksimal)}*\n` +
                          `   _(asumsi semua NIK valid)_\n` +
                          `💳 Saldo kamu: *Rp${saldo.formatRupiah(saldoUser)}*\n` +
                          `✅ Cukup untuk: *${cukupUntuk} NIK*\n\n` +
                          `📌 *Catatan:* Yang benar-benar dipotong hanya NIK dengan data *VALID*.\n` +
                          `NIK tidak terdaftar = GRATIS.\n\n` +
                          `👉 Silakan *TOPUP* dulu, atau kirim file dengan NIK ≤ ${cukupUntuk}.`
                });
                return true;
            }
        } else {
            console.log(`👑 [KPU] Owner mode — GRATIS UNLIMITED`);
        }

        session.status = 'processing';
        session.nikList = nikList;
        session.currentIndex = 0;
        session.results = [];
        session.filePath = filePath;
        session.isOwner = isOwner;
        session.senderNumber = senderNumber;

        // 🔥 Notif awal — kasih tau user proses dimulai (SILENT MODE)
        await sock.sendMessage(remoteJid, {
            text: `⏳ *Memproses ${nikList.length} NIK...*\n\nHasil akan dikirim setelah selesai.`
        });

        // 🔥 Jalankan batch di background
        processBatch(sock, key, remoteJid, nikList).catch(err => {
            console.error(`❌ [KPU] Batch error:`, err.message);
        });

        return true;

    } catch (e) {
        console.error(`❌ [KPU] Error handle file:`, e.message);
        await sock.sendMessage(remoteJid, {
            text: `❌ *Gagal memproses file:* ${e.message}`
        });
        return true;
    }
}

// ==========================================
// 🔥 PROSES BATCH — SILENT MODE
// (diem selama proses, kirim cuma di akhir)
// ==========================================

async function processBatch(sock, sessionKey, remoteJid, nikList) {
    const session = activeSessions.get(sessionKey);
    if (!session) return;

    let excelPath = null; // ✅ di scope yang bisa diakses finally

    console.log(`\n🚀 [KPU] Memulai batch ${nikList.length} NIK (SILENT MODE)...`);

    try {
        await kpuChecker.initBrowser();

        for (let i = 0; i < nikList.length; i++) {
            const nik = nikList[i];
            session.currentIndex = i;

            console.log(`\n📋 [KPU] ${i + 1}/${nikList.length} - NIK: ${nik}`);

            // 🔥 Proses NIK — TANPA kirim pesan ke WA
            const result = await kpuChecker.checkSingleNik(nik, kpuChecker.CONFIG.phoneNumber);
            session.results.push(result);

            // 🔥 Log di terminal aja (gak kirim ke WA)
            if (result.status === 'success') {
                console.log(`   ✅ ${result.data?.nama || '-'} | ${result.data?.status || '-'}`);
            } else if (result.status === 'not_registered') {
                console.log(`   ⚠️ TIDAK TERDAFTAR`);
            } else if (result.status === 'captcha_failed') {
                // reCAPTCHA ditolak != NIK tidak terdaftar. Jangan
                // digabung ke "TIDAK TERDAFTAR" karena menyesatkan.
                console.log(`   🤖 CAPTCHA DITOLAK (bukan berarti NIK tidak terdaftar)`);
            } else {
                console.log(`   ❌ ${result.error || 'Gagal'}`);
            }

            // 🔥 Delay antar NIK (di terminal aja)
            if (i < nikList.length - 1) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // ============================================================
        // 🔥 SEMUA NIK SELESAI — BARU KIRIM KE WA
        // ============================================================
        session.status = 'completed';

        const successCount = session.results.filter(r => r.status === 'success').length;
        const notRegCount = session.results.filter(r => r.status === 'not_registered').length;
        const captchaCount = session.results.filter(r => r.status === 'captcha_failed').length;
        const failedCount = session.results.filter(
            r => !['success', 'not_registered', 'captcha_failed'].includes(r.status)
        ).length;

        // 🔥 SIMPAN KE EXCEL
        try {
            // 🔥 PAKAI EXCEL BUILDER KEREN
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
            excelPath = path.join(__dirname, `Hasil_Cek_DPT_${timestamp}.xlsx`);
            await buildExcel(session.results, excelPath);

            console.log(`📊 [KPU] Excel tersimpan: ${excelPath}`);

            // 🔥 KIRIM FILE EXCEL (1x aja di akhir)
            await sock.sendMessage(remoteJid, {
                document: fs.readFileSync(excelPath),
                mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                fileName: `Hasil_Cek_DPT_${timestamp}.xlsx`,
                caption: `📊 *HASIL CEK DPT*\n\nTotal: ${nikList.length} NIK\n✅ ${successCount} | ⚠️ ${notRegCount} | 🤖 ${captchaCount} | ❌ ${failedCount}`
            });

            console.log(`✅ [KPU] File Excel terkirim ke WA`);
        } catch (e) {
            console.error(`❌ [KPU] Gagal buat Excel:`, e.message);
        }

        // 🔥 HITUNG BERAPA NIK YANG VALID (DATA VALID)
        const validCount = session.results.filter(r =>
            r.status === 'success' &&
            r.data &&
            r.data.validasi === 'DATA VALID'
        ).length;

        const totalBiaya = validCount * HARGA_PER_NIK;

        console.log(`💰 [KPU] NIK valid: ${validCount} | Biaya: Rp${saldo.formatRupiah(totalBiaya)}`);

        // 🔥 PAKAI isOwner DARI SESSION (konsisten)
        const isOwner = session.isOwner === true;

        // 🔥 POTONG SALDO (KHUSUS NON-OWNER)
        let saldoCukup = true;
        let sisaSaldo = saldo.getSaldo(sessionKey);

        if (!isOwner && totalBiaya > 0) {
            const potongBerhasil = saldo.kurangiSaldo(sessionKey, totalBiaya);

            if (potongBerhasil) {
                sisaSaldo = saldo.getSaldo(sessionKey);
                console.log(`✅ [KPU] Saldo dipotong: Rp${saldo.formatRupiah(totalBiaya)} | Sisa: Rp${saldo.formatRupiah(sisaSaldo)}`);
            } else {
                saldoCukup = false;
                console.log(`❌ [KPU] Gagal potong saldo (tidak cukup)`);
            }
        } else if (isOwner) {
            console.log(`👑 [KPU] Owner mode — GRATIS UNLIMITED (tidak dipotong)`);
        }

        // 🔥 KIRIM RINGKASAN AKHIR + INFO BIAYA
        let ringkasanText = `📊 *HASIL CEK DPT*\n\n` +
                            `Total: ${nikList.length} NIK\n` +
                            `✅ ${successCount} | ⚠️ ${notRegCount} | 🤖 ${captchaCount} | ❌ ${failedCount}\n\n`;

        if (isOwner) {
            // 🔥 OWNER — GRATIS
            ringkasanText += `━━━━━━━━━━━━━━━━━━\n`;
            ringkasanText += `👑 *OWNER MODE*\n`;
            ringkasanText += `💰 *GRATIS UNLIMITED*\n`;
            ringkasanText += `📋 Data Valid: ${validCount} NIK\n`;
            if (validCount > 0) {
                ringkasanText += `💵 Normalnya: Rp${saldo.formatRupiah(totalBiaya)} (gratis)`;
            }
        } else if (validCount > 0) {
            ringkasanText += `━━━━━━━━━━━━━━━━━━\n`;
            ringkasanText += `💰 *BIAYA CEK DPT*\n`;
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

        console.log(`\n✅ [KPU] Batch selesai — ${session.results.length} NIK diproses`);

    } catch (e) {
        console.error(`❌ [KPU] Batch error:`, e.message);
        await sock.sendMessage(remoteJid, {
            text: `❌ *Proses gagal:* ${e.message}`
        });
    } finally {
        await kpuChecker.closeBrowser();

        // 🔥 HAPUS FILE EXCEL HASIL
        try {
            if (excelPath && fs.existsSync(excelPath)) {
                fs.unlinkSync(excelPath);
                console.log(`🗑️ [KPU] File Excel dihapus: ${excelPath}`);
            }
        } catch (e) {
            console.log(`⚠️ [KPU] Gagal hapus Excel: ${e.message}`);
        }

        // 🔥 HAPUS FILE UPLOAD
        try {
            if (session?.filePath && fs.existsSync(session.filePath)) {
                fs.unlinkSync(session.filePath);
                console.log(`🗑️ [KPU] File upload dihapus: ${session.filePath}`);
            }
        } catch (e) {}

        // 🔥 CLEANUP SESSION setelah 5 menit
        setTimeout(() => {
            activeSessions.delete(sessionKey);
            console.log(`🗑️ [KPU] Session ${sessionKey} dihapus`);
        }, 5 * 60 * 1000);
    }
}

// ==========================================
// 🔥 EXPORT
// ==========================================

module.exports = {
    handleKpuCommand,
    handleExcelFile,
    autoDetectOtp,
    activeSessions,
};