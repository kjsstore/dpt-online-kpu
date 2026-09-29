// ==========================================
// scraper.js - VERSI API WILAYAH.ID
// LENGKAP + PEMBAYARAN (HARGA & OWNER DARI CONFIG.JS)
// + FORMAT BIAYA DINAMIS (perak/Rupiah otomatis)
// ==========================================

// ============ IMPORT CONFIG ============
const config = require('./config');

// ============ KONFIGURASI ============
const CONFIG = {
    timeout: 30000,

    // ====== HARGA DIAMBIL DARI config.js ======
    hargaCekNik: config.PRICING?.CEK_NIK ?? 100,
    mataUang: config.PRICING?.MATA_UANG ?? "perak",

    // ====== OWNER DIAMBIL DARI config.js ======
    ownerIds: String(config.BOT?.OWNER_ID || "")
        .split(",")
        .map(id => id.trim())
        .filter(Boolean)
};

console.log(`⚙️  [SCRAPER] Harga cek NIK: ${CONFIG.hargaCekNik} ${CONFIG.mataUang}`);
console.log(`⚙️  [SCRAPER] Owner IDs: ${CONFIG.ownerIds.join(", ") || "(kosong)"}`);

// ============ GLOBAL SESSION ============
global.searchSessionScrape = global.searchSessionScrape || {};

// ============ HELPER FUNCTIONS ============
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function resetSessionScrape(chatId) {
    global.searchSessionScrape = global.searchSessionScrape || {};
    global.searchSessionScrape[chatId] = {};
}

function cleanText(str) {
    if (!str) return '-';
    return String(str).replace(/[:]\s*/, '').replace(/\s+/g, ' ').trim() || '-';
}

// ============ FORMAT BIAYA DINAMIS ============
// < 1.000  → "100 perak"
// ≥ 1.000  → "Rp 151.500"
function formatBiaya(nominal, mataUang = CONFIG.mataUang) {
    if (nominal === null || nominal === undefined || isNaN(nominal)) {
        return `0 ${mataUang}`;
    }

    const num = parseInt(nominal);

    if (num < 1000) {
        return `${num} ${mataUang}`;
    }

    const formatted = String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `Rp ${formatted}`;
}

// Format angka saja (tanpa unit)
function formatAngka(angka) {
    if (angka === null || angka === undefined || isNaN(angka)) return '0';
    return String(parseInt(angka)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ============ CEK OWNER (dari config.js) ============
function isOwner(userId) {
    if (!userId) return false;
    return CONFIG.ownerIds.includes(String(userId));
}

// ============ SALDO (SILAKAN SESUAIKAN DB KAMU) ============
function getSaldo(userId) {
    global.userBalance = global.userBalance || {};
    return global.userBalance[String(userId)] || 0;
}

function setSaldo(userId, amount) {
    global.userBalance = global.userBalance || {};
    global.userBalance[String(userId)] = amount;
}

function potongSaldo(userId, amount) {
    const saldo = getSaldo(userId);
    if (saldo < amount) return false;
    setSaldo(userId, saldo - amount);
    return true;
}

// ============ MAIN FUNCTION (API WILAYAH.ID) ============
async function scrapeNik(nik) {
    console.log(`🔍 Mencari NIK: ${nik}`);

    try {
        const provCode = nik.substring(0, 2);
        const kabCode = provCode + '.' + nik.substring(2, 4);
        const kecCode = kabCode + '.' + nik.substring(4, 6);

        // 2. Ambil data Provinsi
        const provRes = await fetch('https://wilayah.id/api/provinces.json', { signal: AbortSignal.timeout(CONFIG.timeout) });
        const provData = await provRes.json();
        const provinsi = provData.data.find(p => p.code === provCode);

        if (!provinsi) {
            throw new Error('Kode Provinsi tidak valid / tidak terdaftar');
        }

        // 3. Ambil data Kabupaten/Kota
        let kabupatenKota = '-';
        try {
            const kabRes = await fetch(`https://wilayah.id/api/regencies/${provCode}.json`, { signal: AbortSignal.timeout(CONFIG.timeout) });
            const kabData = await kabRes.json();
            const kabObj = kabData.data.find(k => k.code === kabCode);
            if (kabObj) kabupatenKota = kabObj.name;
        } catch (e) {
            console.log(`⚠️ Gagal mengambil data kabupaten: ${e.message}`);
        }

        // 4. Ambil data Kecamatan
        let kecamatan = '-';
        try {
            const kecRes = await fetch(`https://wilayah.id/api/districts/${kabCode}.json`, { signal: AbortSignal.timeout(CONFIG.timeout) });
            const kecData = await kecRes.json();
            const kecObj = kecData.data.find(k => k.code === kecCode);
            if (kecObj) kecamatan = kecObj.name;
        } catch (e) {
            console.log(`⚠️ Gagal mengambil data kecamatan: ${e.message}`);
        }

        // 5. Ambil data Kelurahan/Desa
        let kelurahan = '-';
        try {
            const kelRes = await fetch(`https://wilayah.id/api/villages/${kecCode}.json`, { signal: AbortSignal.timeout(CONFIG.timeout) });
            const kelData = await kelRes.json();
            if (kelData && kelData.data && kelData.data.length > 0) {
                kelurahan = kelData.data[0].name;
            }
        } catch (e) {
            console.log(`⚠️ Gagal mengambil data kelurahan: ${e.message}`);
        }

        // 6. Analisis Jenis Kelamin dan Tanggal Lahir otomatis dari NIK
        let kelamin = '-';
        let lahir = '-';
        try {
            let tgl = parseInt(nik.substring(6, 8), 10);
            const bln = nik.substring(8, 10);
            let thn = nik.substring(10, 12);

            if (!isNaN(tgl) && !isNaN(parseInt(bln, 10)) && !isNaN(parseInt(thn, 10))) {
                if (tgl > 40) {
                    kelamin = 'PEREMPUAN';
                    tgl = tgl - 40;
                } else {
                    kelamin = 'LAKI-LAKI';
                }

                const tahunSekarang = new Date().getFullYear() % 100;
                thn = parseInt(thn, 10) <= tahunSekarang ? `20${thn}` : `19${thn}`;

                lahir = `${String(tgl).padStart(2, '0')}-${bln}-${thn}`;
            }
        } catch (e) {
            console.log(`⚠️ Gagal mengurai tanggal lahir NIK: ${e.message}`);
        }

        const result = {
            nik: nik,
            provinsi: provinsi.name || '-',
            kabupatenKota: kabupatenKota,
            kecamatan: kecamatan,
            kelurahan: kelurahan,
            kelamin: kelamin,
            lahir: lahir,
            idUnik: nik.slice(-4)
        };

        return result;

    } catch (error) {
        console.error(`❌ Error API: ${error.message}`);
        throw new Error(`Gagal mengambil data: ${error.message}`);
    }
}

// ============ FUNGSI CEK NIK SCRAPING ============
async function cekNikScrape(nik) {
    try {
        const result = await scrapeNik(nik);
        return result;
    } catch (error) {
        throw error;
    }
}

// ============ FORMAT HASIL ============
function formatHasilScrape(result, nik, isOwnerUser = false, saldoSisa = null) {
    const garis = "━━━━━━━━━━━━━━━━━━━━";
    const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    let teks = `<pre>`;
    teks += `📋 DATA KEPENDUDUKAN\n`;
    teks += `${garis}\n`;

    teks += `👤 IDENTITAS\n`;
    teks += `┣ 🆔 NIK      : ${result.nik || nik}\n`;
    if (result.nama && result.nama !== "-") {
        teks += `┣ 👤 Nama     : ${result.nama}\n`;
    }
    teks += `┣ 🚻 Kelamin  : ${result.kelamin || '-'}\n`;
    teks += `┣ 🎂 Lahir    : ${result.lahir || '-'}\n`;
    teks += `┗ 🔑 ID Unik  : ${result.idUnik || nik.slice(-4)}\n\n`;

    teks += `📍 WILAYAH\n`;
    teks += `┣ 🌏 Provinsi : ${result.provinsi || '-'}\n`;
    teks += `┣ 🏙️ Kab/Kota : ${result.kabupatenKota || '-'}\n`;
    teks += `┣ 🏡 Kecamatan: ${result.kecamatan || '-'}\n`;
    teks += `┗ 🏘️ Kelurahan: ${result.kelurahan || '-'}\n`;
    teks += `${garis}\n`;

    // ====== INFO BIAYA ======
    if (isOwnerUser) {
        teks += `💎 Status     : OWNER (FREE)\n`;
    } else {
        teks += `💸 Biaya      : ${formatBiaya(CONFIG.hargaCekNik, CONFIG.mataUang)}\n`;
        if (saldoSisa !== null) {
            teks += `💰 Saldo Sisa : ${formatBiaya(saldoSisa, CONFIG.mataUang)}\n`;
        }
    }

    teks += `⏰ ${waktu}\n`;
    teks += `🔎 OSINT TOOL`;
    teks += `</pre>`;

    return teks;
}

// ============ HANDLER CEK NIK SCRAPING ============
async function cekNikScrapeHandler(bot, q, sendNewMessage, sendPlainMessage) {
    const chatId = q.message?.chat?.id || q.chat?.id || q.from?.id || q.message?.from?.id;
    const data = q.data;
    const message = q.message || q;
    const from = q.from || q.message?.from || { id: chatId };
    const userId = String(from.id || chatId);

    global.searchSessionScrape = global.searchSessionScrape || {};

    console.log(`🔍 [V1 DEBUG] chatId: ${chatId}, userId: ${userId}, data: ${data}, hasText: ${!!message?.text}, owner: ${isOwner(userId)}`);

    // ===== HANDLE CALLBACK QUERY =====
    if (data === "menu_cek_nik_scrape" || data === "cek_nik_scrape" || data === "start_cek_nik_scrape") {
        console.log(`✅ [V1] Callback detected! Reset session untuk ${chatId}`);

        resetSessionScrape(chatId);
        global.searchSessionScrape[chatId] = { waitingNikScrape: true };

        const ownerStatus = isOwner(userId);
        const biayaInfo = ownerStatus
            ? `💎 <b>Status:</b> OWNER — <b>FREE</b> (tanpa biaya)\n`
            : `💸 <b>Biaya:</b> ${formatBiaya(CONFIG.hargaCekNik, CONFIG.mataUang)} / cek\n` +
              `💰 <b>Saldo Kamu:</b> ${formatBiaya(getSaldo(userId), CONFIG.mataUang)}\n`;

        const messageText = `🤖 <b>CEK NIK OTOMATIS V1</b>\n\n` +
                           `📌 Silakan kirimkan <b>16 digit NIK</b> kamu sekarang bro.\n\n` +
                           `📝 Contoh: <code>8109011306920001</code>\n\n` +
                           biayaInfo +
                           `\n✅ <b>STATUS:</b> AKTIF (Siap Menerima NIK)\n` +
                           `⚡ Proses INSTANT ±0.5 detik`;

        try {
            if (q.message?.message_id) {
                await bot.deleteMessage(chatId, q.message.message_id);
            }
        } catch (e) {
            console.log(`⚠️ [V1] Gagal hapus pesan: ${e.message}`);
        }

        try {
            await bot.sendMessage(chatId, messageText, {
                parse_mode: "HTML",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "❌ BATAL", callback_data: "back_to_main" }]
                    ]
                }
            });
        } catch (e) {
            console.log(`⚠️ [V1] Gagal kirim pesan: ${e.message}`);
        }
        return;
    }

    // ===== HANDLE TEXT INPUT =====
    if (message?.text) {
        const text = message.text.trim();

        if (global.searchSessionScrape?.[chatId]?.waitingNikScrape) {
            console.log(`📝 [V1] Processing NIK: ${text} untuk ${chatId}`);

            global.searchSessionScrape[chatId].waitingNikScrape = false;

            // Validasi NIK
            if (!/^\d{16}$/.test(text) || text.startsWith("0000") || /^(\d)\1+$/.test(text)) {
                return bot.sendMessage(chatId,
                    `❌ <b>Format NIK tidak valid!</b>\n\nPastikan berisi 16 digit angka.\n📝 Contoh: <code>8109011306920001</code>`,
                    {
                        parse_mode: "HTML",
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: "🔍 CEK LAGI", callback_data: "menu_cek_nik_scrape" }],
                                [{ text: "🔙 MENU UTAMA", callback_data: "back_to_main" }]
                            ]
                        }
                    }
                );
            }

            // ====== 💰 CEK PEMBAYARAN ======
            const ownerStatus = isOwner(userId);
            const harga = CONFIG.hargaCekNik;

            if (!ownerStatus) {
                const saldo = getSaldo(userId);

                if (saldo < harga) {
                    return bot.sendMessage(chatId,
                        `💸 <b>SALDO KURANG!</b>\n\n` +
                        `📌 <b>Harga Cek NIK:</b> ${formatBiaya(harga, CONFIG.mataUang)}\n` +
                        `💰 <b>Saldo Kamu:</b> ${formatBiaya(saldo, CONFIG.mataUang)}\n` +
                        `❗ <b>Kurang:</b> ${formatBiaya(harga - saldo, CONFIG.mataUang)}\n\n` +
                        `💡 Silakan TOP UP dulu bro biar bisa cek NIK.`,
                        {
                            parse_mode: "HTML",
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: "💳 TOP UP SALDO", callback_data: "topup_saldo" }],
                                    [{ text: "🔙 MENU UTAMA", callback_data: "back_to_main" }]
                                ]
                            }
                        }
                    );
                }
            }

            // ===== ANIMASI LOADING =====
            let animMsg = null;
            let animasiRunning = true;

            (async () => {
                const frames = ['⏳', '🔄', '⚡', '🔄'];
                const texts = [
                    `⚡ Proses NIK: <code>${text}</code>`,
                    `🔄 Mencari data wilayah...`,
                    `⏳ Menghubungi server...`,
                    `⚡ Mengambil data...`
                ];
                let idx = 0;

                while (animasiRunning) {
                    try {
                        const pesan = `${frames[idx]} ${texts[idx]}`;
                        if (animMsg) {
                            await bot.editMessageText(pesan, {
                                chat_id: chatId,
                                message_id: animMsg.message_id,
                                parse_mode: 'HTML'
                            });
                        } else {
                            animMsg = await bot.sendMessage(chatId, pesan, { parse_mode: 'HTML' });
                        }
                        idx = (idx + 1) % frames.length;
                        await delay(500);
                    } catch (e) {
                        break;
                    }
                }
            })();

            try {
                const startTime = Date.now();
                const result = await cekNikScrape(text);
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);

                animasiRunning = false;
                if (animMsg) {
                    try { await bot.deleteMessage(chatId, animMsg.message_id); } catch (e) {}
                }

                // ====== 💰 POTONG SALDO ======
                let saldoSisa = null;
                if (!ownerStatus) {
                    const suksesPotong = potongSaldo(userId, harga);
                    if (!suksesPotong) {
                        return bot.sendMessage(chatId,
                            `❌ <b>Gagal potong saldo.</b> Saldo kamu tidak cukup.`,
                            { parse_mode: "HTML" }
                        );
                    }
                    saldoSisa = getSaldo(userId);
                    console.log(`💸 [V1] Potong ${harga} ${CONFIG.mataUang} dari ${userId}. Sisa: ${saldoSisa}`);
                } else {
                    console.log(`💎 [V1] Owner ${userId} — FREE, tidak dipotong.`);
                }

                let teksHasil = formatHasilScrape(result, text, ownerStatus, saldoSisa);
                teksHasil = teksHasil.replace('</pre>', `⏱️ Proses: ${duration} detik\n</pre>`);

                await bot.sendMessage(chatId, teksHasil, {
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🔍 CEK NIK LAIN", callback_data: "menu_cek_nik_scrape" }],
                            [{ text: "🔙 MENU UTAMA", callback_data: "back_to_main" }]
                        ]
                    }
                });

            } catch (err) {
                console.error("❌ [V1] ERROR:", err.message);
                animasiRunning = false;
                if (animMsg) {
                    try { await bot.deleteMessage(chatId, animMsg.message_id); } catch (e) {}
                }

                let errorMsg = `❌ <b>GAGAL MENGAMBIL DATA</b>\n\n`;
                errorMsg += `📌 <b>Error:</b> ${err.message}\n\n`;
                errorMsg += `💡 Saldo kamu <b>TIDAK</b> dipotong. Silakan coba lagi.`;

                return bot.sendMessage(chatId, errorMsg, {
                    parse_mode: "HTML",
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🔄 COBA LAGI", callback_data: "menu_cek_nik_scrape" }],
                            [{ text: "🔙 MENU UTAMA", callback_data: "back_to_main" }]
                        ]
                    }
                });
            }
        }
        return;
    }

    console.log(`⚠️ [V1] No matching handler for:`, { chatId, data, hasText: !!message?.text });
}

// ============ EXPORT ============
module.exports = {
    scrapeNik,
    cekNikScrape,
    cekNikScrapeHandler,
    formatHasilScrape,
    resetSessionScrape,
    isOwner,
    getSaldo,
    setSaldo,
    potongSaldo,
    formatBiaya,      // ← Export
    formatAngka,      // ← Export
    CONFIG
};