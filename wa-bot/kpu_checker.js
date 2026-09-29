// ==========================================
// 🔥 KPU CHECKER - TURBO MODE (SUPER CEPAT)
// ==========================================

const { chromium } = require('playwright');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const KPU_URL = 'https://cekdptonline.kpu.go.id/';
const DEFAULT_PHONE = '083830803474';
const RESULT_FILE = path.join(__dirname, 'hasil_cek_dpt.json');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

// ==========================================
// 🔥 BACA NOMOR BOT DARI FILE (HASIL PAIRING)
// ==========================================

const NOMOR_BOT_FILE = path.join(__dirname, 'nomor_bot.json');

function getPhoneNumberFromFile() {
    try {
        if (fs.existsSync(NOMOR_BOT_FILE)) {
            const data = JSON.parse(fs.readFileSync(NOMOR_BOT_FILE, 'utf8'));
            if (data.phone) {
                let clean = String(data.phone).replace(/[^0-9]/g, '');
                // Normalisasi ke format 0 di depan
                if (clean.startsWith('62')) {
                    clean = '0' + clean.substring(2);
                }
                console.log(`📱 [KPU] Nomor bot dari file: ${clean}`);
                return clean;
            }
        }
    } catch (e) {
        console.log(`⚠️ [KPU] Gagal baca nomor_bot.json: ${e.message}`);
    }
    return null;
}

function getActivePhone() {
    return getPhoneNumberFromFile() || DEFAULT_PHONE;
}

if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const CONFIG = {
    headless: true,
    slowMo: 0,
    timeout: 15000,
    otpTimeout: 180000,
    phoneNumber: getActivePhone(),  
    screenshotOnError: true,
};

// ==========================================
// 🔥 DETEKSI HALAMAN "DATA BELUM TERDAFTAR"
// ==========================================

const NOT_REGISTERED_KEYWORDS = [
    'data anda belum terdaftar',
    'belum terdaftar',
    'hubungi pantarlih',
    'data anda belum',
];

const NOT_REGISTERED_PAGE_TIMEOUT = 3000;  // 🔥 3s (dari 8s)

// ==========================================
// 🔥 STATE (OTP + TIMESTAMP)
// ==========================================

let globalOtp = null;
let globalOtpTime = null;
let otpResolver = null;
let browserInstance = null;
let pageInstance = null;

const OTP_MAX_AGE_MS = 120000;

// ==========================================
// 🔥 OTP DARI LUAR
// ==========================================

function submitOtp(otpCode) {
    console.log(`🔐 [OTP] Menerima OTP: ${otpCode}`);
    globalOtp = otpCode;
    globalOtpTime = Date.now();
    if (otpResolver) {
        otpResolver(otpCode);
        otpResolver = null;
    }
    return true;
}

// ==========================================
// 🔥 BACA EXCEL
// ==========================================

function readNikFromExcel(filePath) {
    console.log(`📂 [EXCEL] Membaca file: ${filePath}`);
    if (!fs.existsSync(filePath)) throw new Error(`File tidak ditemukan: ${filePath}`);

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const nikList = [];
    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;
        for (const cell of row) {
            if (!cell) continue;
            const str = String(cell).trim().replace(/[^0-9]/g, '');
            if (/^\d{16}$/.test(str)) nikList.push(str);
        }
    }

    const uniqueNik = [...new Set(nikList)];
    console.log(`✅ [EXCEL] Ditemukan ${uniqueNik.length} NIK unik`);
    return uniqueNik;
}

// ==========================================
// 🔥 INIT BROWSER
// ==========================================

async function initBrowser() {
    console.log('🌐 [BROWSER] Membuka browser...');

    browserInstance = await chromium.launch({
        headless: CONFIG.headless,
        slowMo: CONFIG.slowMo,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
        ],
    });

    const context = await browserInstance.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'id-ID',
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    pageInstance = await context.newPage();
    pageInstance.setDefaultTimeout(CONFIG.timeout);
    pageInstance.setDefaultNavigationTimeout(CONFIG.timeout);

    console.log('✅ [BROWSER] Browser siap');
    return pageInstance;
}

async function closeBrowser() {
    if (browserInstance) {
        try { await browserInstance.close(); } catch (e) {}
        browserInstance = null;
        pageInstance = null;
        console.log('🔒 [BROWSER] Browser ditutup');
    }
}

// ==========================================
// 🔥 SCREENSHOT
// ==========================================

async function takeScreenshot(name) {
    if (!pageInstance) return;
    try {
        const filename = path.join(SCREENSHOT_DIR, `${name}_${Date.now()}.png`);
        await pageInstance.screenshot({ path: filename, fullPage: true });
        console.log(`📸 [SCREENSHOT] ${filename}`);
        return filename;
    } catch (e) {
        console.log(`⚠️ [SCREENSHOT] Gagal: ${e.message}`);
    }
}

// ==========================================
// 🔥 WAIT OTP
// ==========================================

function waitForOtp(timeout = CONFIG.otpTimeout) {
    return new Promise((resolve, reject) => {
        if (globalOtp) {
            const age = Date.now() - (globalOtpTime || 0);
            if (age < OTP_MAX_AGE_MS) {
                const code = globalOtp;
                globalOtp = null;
                globalOtpTime = null;
                console.log(`✅ [OTP] Pakai OTP tersimpan (umur ${Math.round(age/1000)}s): ${code}`);
                return resolve(code);
            } else {
                console.log(`⚠️ [OTP] OTP tersimpan kadaluarsa, dibuang`);
                globalOtp = null;
                globalOtpTime = null;
            }
        }

        const timer = setTimeout(() => {
            otpResolver = null;
            reject(new Error('Timeout menunggu OTP'));
        }, timeout);

        otpResolver = (code) => {
            clearTimeout(timer);
            globalOtp = null;
            globalOtpTime = null;
            resolve(code);
        };
    });
}

// ==========================================
// 🔥 FIND VISIBLE (POLLING 30ms)
// ==========================================

async function findVisible(selector, timeout = 3000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const els = await pageInstance.$$(selector);
            for (const el of els) {
                const visible = await el.isVisible().catch(() => false);
                if (visible) return el;
            }
        } catch (e) {}
        await pageInstance.waitForTimeout(30);   // 🔥 30ms polling
    }
    return null;
}

// ==========================================
// 🔥 FAST FILL
// ==========================================

async function fillFast(element, value) {
    try {
        await element.fill('');
        await element.fill(value);
        return true;
    } catch (e) {
        try {
            await element.evaluate((el, val) => {
                el.focus();
                el.value = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
            }, value);
            return true;
        } catch (e2) {
            await element.type(value, { delay: 0 });
            return false;
        }
    }
}

// ==========================================
// 🔥 CEK HALAMAN "BELUM TERDAFTAR" (EVALUATE LANGSUNG)
// ==========================================

async function isNotRegisteredPage() {
    try {
        const hasKeyword = await pageInstance.evaluate((keywords) => {
            const t = (document.body.innerText || '').toLowerCase();
            return keywords.some(k => t.includes(k));
        }, NOT_REGISTERED_KEYWORDS).catch(() => false);

        if (hasKeyword) {
            console.log(`🔍 [NOT-REG] Terdeteksi halaman "belum terdaftar"`);
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function waitForNotRegisteredPage(timeout = NOT_REGISTERED_PAGE_TIMEOUT) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (await isNotRegisteredPage()) {
            return true;
        }
        await pageInstance.waitForTimeout(100);
    }
    return false;
}

// ==========================================
// 🔥 PARSE HASIL DPT
// ==========================================

function parseDptResult(rawText) {
    const out = {
        nama: '-',
        status: '-',
        wilayah: '-',
        tanggal: '-',
        validasi: '-',
    };

    if (!rawText) return out;

    const text = String(rawText).replace(/\s+/g, ' ').trim();

    let m = text.match(/Nama\s*[:\-]\s*([A-Z][A-Z\s.'-]{2,60}?)(?=\s*(?:Status|Wilayah|Tanggal|Pengecekan|$))/i);
    if (m) out.nama = m[1].trim();

    if (out.nama === '-') {
        m = text.match(/Selamat[,\s]+([A-Z][A-Z\s.'-]{2,60}?)(?=\s*(?:Anda|Status|Wilayah|$))/i);
        if (m) out.nama = m[1].trim();
    }

    if (/tidak\s+terdaftar/i.test(text)) {
        out.status = 'TIDAK TERDAFTAR';
    } else if (/\bterdaftar\b/i.test(text)) {
        out.status = 'TERDAFTAR';
    }

    m = text.match(/Wilayah\s*[:\-]\s*(.+?)(?=\s*(?:Tanggal|Pengecekan|Status\s*Validasi|Data\s+Valid|$))/i);
    if (m) {
        out.wilayah = m[1].replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
    }

    m = text.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+pukul\s+[\d:.]+\s+WIB)/i);
    if (m) {
        out.tanggal = m[1].trim();
    } else {
        m = text.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
        if (m) out.tanggal = m[1].trim();
    }

    if (/data\s+tidak\s+valid/i.test(text)) {
        out.validasi = 'DATA TIDAK VALID';
    } else if (/data\s+valid/i.test(text)) {
        out.validasi = 'DATA VALID';
    }

    return out;
}

// ==========================================
// 🔥 CEK 1 NIK - TURBO MODE (OPTIMIZED)
// ==========================================

async function checkSingleNik(nik, phoneNumber = null) {
    if (!phoneNumber) phoneNumber = getActivePhone();
    const MAX_RETRY = 3;  // 🔥 Coba 3x kalo OTP timeout

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        console.log('\n' + '='.repeat(60));
        console.log(`🔍 [CHECK] Memproses NIK: ${nik} (Percobaan ${attempt}/${MAX_RETRY})`);
        console.log('='.repeat(60));

        const result = {
            nik,
            phone: phoneNumber,
            status: 'pending',
            data: null,
            error: null,
            timestamp: new Date().toISOString(),
        };

        try {
            // ==============================
            // STEP 0: BUKA HALAMAN KPU
            // ==============================
            console.log('🌐 [STEP 0] Buka halaman KPU...');
            try {
                await pageInstance.goto(KPU_URL, {
                    waitUntil: 'domcontentloaded',
                    timeout: 15000,
                });
            } catch (e) {
                console.log(`⚠️ [STEP 0] goto warning: ${e.message}`);
            }

            const nikInput = await findVisible(
                'textarea, input[type="text"], input[type="number"], input[placeholder*="NIK" i], input[name*="nik" i]',
                5000
            );
            if (!nikInput) throw new Error('Input NIK tidak ditemukan');
            console.log('✅ [STEP 0] Halaman KPU siap');

            // ==============================
            // STEP 1: ISI NIK
            // ==============================
            console.log('📝 [STEP 1] Mengisi NIK...');
            await fillFast(nikInput, nik);
            console.log(`✅ [STEP 1] NIK diisi: ${nik}`);

            // ==============================
            // STEP 2: KLIK LANJUT
            // ==============================
            console.log('🔘 [STEP 2] Klik tombol lanjut...');
            let nextButton = await findVisible(
                'button:has-text("Langkah"), button:has-text("Lanjut"), button:has-text("Next"), button[type="submit"]',
                3000
            );
            if (!nextButton) throw new Error('Tombol lanjut tidak ditemukan');
            await nextButton.click();
            console.log('✅ [STEP 2] Tombol lanjut diklik');

            try {
                await Promise.race([
                    pageInstance.waitForSelector(
                        'input[type="tel"], input[placeholder*="HP" i], input[placeholder*="Nomor" i], input[placeholder*="Whatsapp" i], input[name*="phone" i]',
                        { timeout: 3000, state: 'visible' }
                    ),
                    pageInstance.waitForFunction(
                        () => {
                            const t = document.body.innerText.toLowerCase();
                            return t.includes('belum terdaftar') || t.includes('data anda belum');
                        },
                        { timeout: 3000 }
                    ),
                ]);
            } catch (e) {
                console.log('⚠️ [STEP 2] Selector HP / not-registered belum muncul');
            }

            const notRegisteredAfterNext = await isNotRegisteredPage();
            if (notRegisteredAfterNext) {
                console.log(`❌ [NOT-REG] NIK ${nik} TIDAK TERDAFTAR`);
                result.status = 'not_registered';
                result.data = {
                    nama: '-',
                    status: 'TIDAK TERDAFTAR',
                    wilayah: '-',
                    tanggal: '-',
                    validasi: '-',
                    raw_text: 'Data anda belum terdaftar!',
                    url: pageInstance.url(),
                };
                result.error = 'Data belum terdaftar di DPT';
                return result;  // ✅ LANGSUNG RETURN, GA PERLU RETRY
            }

            // ==============================
            // STEP 3: ISI NOMOR HP
            // ==============================
            console.log('📱 [STEP 3] Mengisi nomor HP...');
            let phoneInput = await findVisible(
                'input[type="tel"], input[placeholder*="HP" i], input[placeholder*="Whatsapp" i], input[placeholder*="Nomor" i], input[name*="phone" i]',
                3000
            );
            if (!phoneInput) {
                phoneInput = await findVisible('input[type="text"], input[type="number"]', 1500);
            }
            if (!phoneInput) throw new Error('Input nomor HP tidak ditemukan');

            let formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
            if (formattedPhone.startsWith('0')) {
                formattedPhone = '62' + formattedPhone.substring(1);
            }

            await fillFast(phoneInput, formattedPhone);
            const filledValue = await phoneInput.inputValue().catch(() => '');
            if (!filledValue || filledValue.length < 8) {
                console.log(`⚠️ [STEP 3] Value belum masuk, type manual...`);
                await phoneInput.click();
                await phoneInput.type(formattedPhone, { delay: 5 });
            }
            console.log(`✅ [STEP 3] Nomor diisi: ${formattedPhone}`);

            // ==============================
            // STEP 4: KIRIM OTP
            // ==============================
            console.log('🔘 [STEP 4] Klik kirim OTP...');
            let sendBtn = await findVisible(
                'button:has-text("Kirim"), button:has-text("OTP"), button:has-text("Langkah"), button[type="submit"]',
                3000
            );
            if (!sendBtn) throw new Error('Tombol kirim OTP tidak ditemukan');
            await sendBtn.click();
            console.log('✅ [STEP 4] OTP diminta, tunggu OTP masuk...');

            // ==============================
            // STEP 5: TUNGGU OTP
            // ==============================
            console.log('⏳ [STEP 5] Menunggu OTP dari KPU...');

            const otpPromise = waitForOtp().catch(() => null);

            const selectorPromise = pageInstance.waitForSelector(
                'input[inputmode="numeric"], input[maxlength="1"], input[placeholder*="OTP" i]',
                { timeout: 3000, state: 'visible' }
            ).then(() => 'selector').catch(() => null);

            const notRegPromise = pageInstance.waitForFunction(
                () => {
                    const t = document.body.innerText.toLowerCase();
                    return t.includes('belum terdaftar') || t.includes('data anda belum');
                },
                { timeout: 3000 }
            ).then(() => 'notreg').catch(() => null);

            const winner = await Promise.race([otpPromise, selectorPromise, notRegPromise]);

            if (winner === 'notreg' || await isNotRegisteredPage()) {
                console.log(`❌ [NOT-REG] NIK ${nik} TIDAK TERDAFTAR`);
                result.status = 'not_registered';
                result.data = {
                    nama: '-',
                    status: 'TIDAK TERDAFTAR',
                    wilayah: '-',
                    tanggal: '-',
                    validasi: '-',
                    raw_text: 'Data anda belum terdaftar!',
                    url: pageInstance.url(),
                };
                result.error = 'Data belum terdaftar di DPT';
                return result;  // ✅ LANGSUNG RETURN
            }

            // 🔥 AMBIL OTP — kalo belum dapet dari race, tunggu max 60 detik
            let otpCode = await otpPromise;

            if (!otpCode) {
                console.log('⏳ [STEP 5] OTP belum masuk, tunggu max 60 detik...');
                try {
                    otpCode = await waitForOtp(60000);
                } catch (e) {
                    console.log(`⚠️ [STEP 5] Timeout 60s nunggu OTP — RETRY dari awal...`);
                    
                    // 🔥 KALO MASIH ADA PERCOBAAN, RETRY
                    if (attempt < MAX_RETRY) {
                        console.log(`🔄 [RETRY] Percobaan ${attempt} gagal, ulang dari awal (${attempt + 1}/${MAX_RETRY})...`);
                        await pageInstance.waitForTimeout(2000);  // jeda 2 detik
                        continue;  // 🔥 LANJUT KE PERCOBAAN BERIKUTNYA
                    }
                    
                    // 🔥 KALO UDAH MAX, BARU ERROR
                    throw new Error('OTP_TIMEOUT: KPU ga kirim OTP setelah 3 percobaan');
                }
            }

            console.log(`✅ [STEP 5] OTP diterima: ${otpCode}`);

            // ==============================
            // STEP 6: ISI OTP
            // ==============================
            console.log('🔐 [STEP 6] Mengisi OTP...');
            const otpInputs = await pageInstance.$$('input[type="text"], input[type="number"], input[inputmode="numeric"], input[maxlength="1"]');
            const visibleOtp = [];
            for (const inp of otpInputs) {
                if (await inp.isVisible().catch(() => false)) {
                    visibleOtp.push(inp);
                }
            }
            console.log(`🔍 [STEP 6] Ditemukan ${visibleOtp.length} input OTP visible`);

            if (visibleOtp.length >= 6) {
                console.log('📝 [STEP 6] Format: 6 input terpisah — isi PARALEL');
                const digits = otpCode.split('');
                await Promise.all([
                    fillFast(visibleOtp[0], digits[0] || ''),
                    fillFast(visibleOtp[1], digits[1] || ''),
                    fillFast(visibleOtp[2], digits[2] || ''),
                    fillFast(visibleOtp[3], digits[3] || ''),
                    fillFast(visibleOtp[4], digits[4] || ''),
                    fillFast(visibleOtp[5], digits[5] || ''),
                ]);
                await visibleOtp[5].focus().catch(() => {});
            } else if (visibleOtp.length >= 1) {
                console.log('📝 [STEP 6] Format: 1 input gabungan');
                const target = visibleOtp[visibleOtp.length - 1];
                await fillFast(target, otpCode);
                const filled = await target.inputValue().catch(() => '');
                if (filled.length < otpCode.length) {
                    console.log(`⚠️ [STEP 6] OTP belum penuh, type manual...`);
                    await target.click();
                    await target.type(otpCode, { delay: 5 });
                }
            } else {
                throw new Error('Input OTP tidak ditemukan');
            }
            console.log('✅ [STEP 6] OTP diisi');

            // ==============================
            // STEP 7: SUBMIT OTP
            // ==============================
            console.log('🔘 [STEP 7] Submit OTP...');
            let submitBtn = await findVisible('button:has-text("Konfirmasi")', 2000);
            if (!submitBtn) {
                console.log('⚠️ [STEP 7] Cari tombol alternatif...');
                submitBtn = await findVisible(
                    'button:has-text("Verifikasi"), button:has-text("Submit"), button:has-text("Kirim"), button:has-text("Langkah"), button[type="submit"]',
                    2000
                );
            }
            if (submitBtn) {
                const btnText = await submitBtn.textContent().catch(() => '?');
                console.log(`✅ [STEP 7] Klik tombol: "${btnText}"`);
                await submitBtn.click();
            } else {
                console.log('⚠️ [STEP 7] Tidak ada tombol, coba Enter');
                await pageInstance.keyboard.press('Enter');
            }

            // ==============================
            // STEP 7.5: TUNGGU HASIL
            // ==============================
            console.log('⏳ [STEP 7.5] Tunggu halaman hasil...');
            try {
                await pageInstance.waitForFunction(
                    () => {
                        const t = document.body.innerText;
                        return (t.includes('Nama') && t.includes('Status')) ||
                               t.toLowerCase().includes('belum terdaftar');
                    },
                    { timeout: 10000, polling: 100 }
                );
                console.log('✅ [STEP 7.5] Halaman hasil muncul');
            } catch (e) {
                console.log('⚠️ [STEP 7.5] Timeout, baca apa adanya');
            }

            // ==============================
            // STEP 8: AMBIL HASIL
            // ==============================
            console.log('📊 [STEP 8] Mengambil hasil...');
            const pageText = await pageInstance.evaluate(() => document.body.innerText || '');

            const stillOnOtpPage = pageText.includes('OTP (One Time Password)') ||
                                   pageText.includes('Masukan kode yang terkirim');

            if (stillOnOtpPage) {
                console.log('❌ [STEP 8] MASIH DI HALAMAN OTP!');
                result.status = 'failed';
                result.error = 'OTP gagal dimasukkan atau OTP salah/expired';
                result.data = {
                    raw_text: pageText.substring(0, 5000),
                    url: pageInstance.url(),
                };
                return result;
            }

            console.log(`📄 [STEP 8] Preview (500 char):\n${pageText.substring(0, 500)}`);
            const parsed = parseDptResult(pageText);
            console.log(`📊 [STEP 8] Hasil parse:`, JSON.stringify(parsed, null, 2));

            const lower = pageText.toLowerCase();
            const isSuccess = !lower.includes('gagal') &&
                              !lower.includes('tidak ditemukan') &&
                              !lower.includes('invalid') &&
                              pageText.length > 50;

            result.status = isSuccess ? 'success' : 'failed';
            result.data = {
                ...parsed,
                raw_text: pageText.substring(0, 5000),
                url: pageInstance.url(),
            };
            console.log(`📊 [STEP 8] Status: ${result.status}`);

            // 🔥 SUKSES → RETURN
            return result;

        } catch (error) {
            console.error(`❌ [CHECK] Error NIK ${nik} (percobaan ${attempt}):`, error.message);
            
            // 🔥 KALO MASIH ADA PERCOBAAN, RETRY
            if (attempt < MAX_RETRY) {
                console.log(`🔄 [RETRY] Percobaan ${attempt} gagal, ulang dari awal (${attempt + 1}/${MAX_RETRY})...`);
                await pageInstance.waitForTimeout(2000);
                continue;
            }
            
            // 🔥 KALO UDAH MAX, BARU ERROR
            result.status = 'error';
            result.error = error.message;
            if (CONFIG.screenshotOnError) await takeScreenshot(`error_${nik}`);
        }
    }

    // 🔥 KALO SAMPE SINI, ARTINYA UDAH MAX RETRY — RETURN ERROR
    return {
        nik,
        phone: phoneNumber,
        status: 'error',
        data: null,
        error: `Gagal setelah ${MAX_RETRY} percobaan`,
        timestamp: new Date().toISOString(),
    };
}

// ==========================================
// 🔥 CEK BANYAK NIK
// ==========================================

async function checkMultipleNik(nikList, phoneNumber = null) {
    if (!phoneNumber) phoneNumber = getActivePhone();
    console.log(`\n🚀 [BATCH] Memproses ${nikList.length} NIK...`);
    const results = [];
    await initBrowser();

    for (let i = 0; i < nikList.length; i++) {
        const nik = nikList[i];
        console.log(`\n📋 [BATCH] ${i + 1}/${nikList.length} - NIK: ${nik}`);
        try {
            const result = await checkSingleNik(nik, phoneNumber);
            results.push(result);
            fs.writeFileSync(RESULT_FILE, JSON.stringify(results, null, 2));

            if (i < nikList.length - 1) {
                console.log('⏳ [BATCH] Delay 500ms...');
                await new Promise(r => setTimeout(r, 500));   // 🔥 500ms (dari 1000ms)
            }
        } catch (e) {
            console.error(`❌ [BATCH] Gagal NIK ${nik}:`, e.message);
            results.push({
                nik,
                status: 'error',
                error: e.message,
                timestamp: new Date().toISOString(),
            });
        }
    }

    await closeBrowser();
    console.log(`\n✅ [BATCH] Selesai! ${results.length} NIK diproses`);
    return results;
}

// ==========================================
// 🔥 EXPORT
// ==========================================

module.exports = {
    readNikFromExcel,
    initBrowser,
    closeBrowser,
    checkSingleNik,
    checkMultipleNik,
    submitOtp,
    waitForOtp,
    takeScreenshot,
    parseDptResult,
    isNotRegisteredPage,
    waitForNotRegisteredPage,
    CONFIG,
    KPU_URL,
    RESULT_FILE,
};