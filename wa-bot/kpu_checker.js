// ==========================================
// 🔥 KPU CHECKER - FINAL FIXED (CLEAN & AKURAT)
// Flow: NIK → Langkah 2/4 → HP → Langkah 3/4 → OTP → Hasil
// ==========================================

const { chromium } = require('playwright');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const KPU_URL = 'https://cekdptonline.kpu.go.id/';
const DEFAULT_PHONE = '083830803474';
const RESULT_FILE = path.join(__dirname, 'hasil_cek_dpt.json');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const NOMOR_BOT_FILE = path.join(__dirname, 'nomor_bot.json');

// ==========================================
// 🔥 BACA NOMOR BOT DARI FILE (LANGSUNG FORMAT 62)
// ==========================================
function getPhoneNumberFromFile() {
    try {
        if (fs.existsSync(NOMOR_BOT_FILE)) {
            const data = JSON.parse(fs.readFileSync(NOMOR_BOT_FILE, 'utf8'));
            if (data.phone) {
                let clean = String(data.phone).replace(/[^0-9]/g, '');
                // 🔥 Normalisasi LANGSUNG ke format 62 (bukan 08)
                if (clean.startsWith('0')) {
                    clean = '62' + clean.substring(1);
                } else if (!clean.startsWith('62')) {
                    clean = '62' + clean;
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
    timeout: 30000,
    otpTimeout: 180000,
    phoneNumber: DEFAULT_PHONE,
    screenshotOnError: true,
};

// ==========================================
// 🔥 KEYWORD DETEKSI NOT-REGISTERED (SPESIFIK SAJA)
// ==========================================
const NOT_REGISTERED_KEYWORDS = [
    'data anda belum terdaftar',
    'nik anda belum terdaftar',
    'anda belum terdaftar',
    'tidak terdaftar dalam dpt',
];

const NOT_REGISTERED_PAGE_TIMEOUT = 8000;

// ==========================================
// 🔥 STATE
// ==========================================
let globalOtp = null;
let globalOtpTime = null;
let otpResolver = null;
let browserInstance = null;
let pageInstance = null;

let isProcessing = false;
let isWaitingForOtp = false;

const OTP_MAX_AGE_MS = 120000;

// ==========================================
// 🔥 OTP DARI LUAR
// ==========================================
function submitOtp(otpCode) {
    if (!isWaitingForOtp) {
        console.log(`⚠️ [OTP] Gak ada yang nunggu OTP, skip: ${otpCode}`);
        return false;
    }
    console.log(`🔐 [OTP] Menerima OTP: ${otpCode}`);
    globalOtp = otpCode;
    globalOtpTime = Date.now();
    if (otpResolver) {
        otpResolver(otpCode);
        otpResolver = null;
    }
    isWaitingForOtp = false;
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

        isWaitingForOtp = true;
        const timer = setTimeout(() => {
            otpResolver = null;
            isWaitingForOtp = false;
            reject(new Error('Timeout menunggu OTP'));
        }, timeout);

        otpResolver = (code) => {
            clearTimeout(timer);
            globalOtp = null;
            globalOtpTime = null;
            isWaitingForOtp = false;
            resolve(code);
        };
    });
}

// ==========================================
// 🔥 HELPER: Cari element visible
// ==========================================
async function findVisible(selector, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const els = await pageInstance.$$(selector);
            for (const el of els) {
                const visible = await el.isVisible().catch(() => false);
                if (visible) return el;
            }
        } catch (e) {}
        await pageInstance.waitForTimeout(50);
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
// 🔥 CEK FIELD OTP VISIBLE (SPESIFIK)
// ==========================================
async function isOtpFieldVisible() {
    try {
        const check = await pageInstance.evaluate(() => {
            const t = (document.body.innerText || '').toLowerCase();

            // Kalau ada heading "Nomor HP" → ini halaman HP, bukan OTP
            if (t.includes('nomor hp') || t.includes('nomor whatsapp')) {
                return { isOtp: false, reason: 'masih di halaman Nomor HP' };
            }

            // Harus ada heading SPESIFIK halaman OTP
            const hasOtpHeading =
                t.includes('otp (one time password)') ||
                t.includes('masukan kode yang terkirim') ||
                t.includes('kode verifikasi') ||
                t.includes('request kode baru');

            if (!hasOtpHeading) {
                return { isOtp: false, reason: 'heading OTP spesifik tidak ada' };
            }

            return { isOtp: true, reason: 'heading OTP spesifik ditemukan' };
        });

        if (!check.isOtp) {
            console.log(`🔍 [OTP-FIELD] Skip: ${check.reason}`);
            return false;
        }

        console.log(`🔍 [OTP-FIELD] ${check.reason} — cek input OTP...`);

        const inputs = await pageInstance.$$('input');
        for (const inp of inputs) {
            const isVis = await inp.isVisible().catch(() => false);
            if (!isVis) continue;

            const val = await inp.inputValue().catch(() => '');
            if (val && (val.startsWith('08') || val.startsWith('62') || val.length >= 10)) continue;

            const isDisabled = await inp.isDisabled().catch(() => false);
            if (isDisabled) continue;

            const isReadonly = await inp.getAttribute('readonly').catch(() => null);
            if (isReadonly) continue;

            const maxLen = await inp.getAttribute('maxlength').catch(() => '?');
            const type = await inp.getAttribute('type').catch(() => '?');
            console.log(`🔍 [OTP-FIELD] ✅ Ketemu input OTP: type="${type}", maxlength="${maxLen}"`);
            return true;
        }

        console.log(`🔍 [OTP-FIELD] Heading OTP ada, tapi input gak ketemu`);
        return false;

    } catch (e) {
        console.log(`⚠️ [OTP-FIELD] Error: ${e.message}`);
        return false;
    }
}

// ==========================================
// 🔥 CEK FIELD HP VISIBLE (SPESIFIK)
// ==========================================
async function isPhoneFieldVisible() {
    try {
        const hasPhoneHeading = await pageInstance.evaluate(() => {
            const t = (document.body.innerText || '').toLowerCase();
            return t.includes('nomor hp') ||
                   t.includes('nomor whatsapp') ||
                   t.includes('kami akan mengirimkan otp');
        });

        if (hasPhoneHeading) {
            console.log('🔍 [HP-FIELD] Heading "Nomor HP" terdeteksi di halaman');
            const candidates = await pageInstance.$$('input');
            for (const inp of candidates) {
                const isVis = await inp.isVisible().catch(() => false);
                if (!isVis) continue;
                const type = await inp.getAttribute('type').catch(() => '');
                const maxLen = await inp.getAttribute('maxlength').catch(() => '');
                if (maxLen === '1') continue;
                console.log(`🔍 [HP-FIELD] Ketemu input: type="${type}", maxlength="${maxLen}"`);
                return inp;
            }
        }

        const el = await pageInstance.$(
            'input[type="text"], input[type="tel"], input[placeholder*="HP" i], input[placeholder*="Nomor" i], input[placeholder*="Whatsapp" i], input[name*="phone" i]'
        );
        if (el && await el.isVisible().catch(() => false)) return el;
        return null;
    } catch (e) {
        return null;
    }
}

// ==========================================
// 🔥 CEK HALAMAN NOT-REGISTERED (DENGAN GUARD)
// ==========================================
async function isNotRegisteredPage() {
    try {
        if (await isOtpFieldVisible()) return false;

        // 🔥 Guard: kalau ada heading "Nomor HP" → bukan not-registered
        const onPhonePage = await pageInstance.evaluate(() => {
            const t = (document.body.innerText || '').toLowerCase();
            return t.includes('nomor hp') ||
                   t.includes('nomor whatsapp') ||
                   t.includes('kami akan mengirimkan otp');
        }).catch(() => false);
        if (onPhonePage) return false;

        const result = await pageInstance.evaluate((keywords) => {
            const allElements = document.querySelectorAll('body *');
            for (const el of allElements) {
                const tag = el.tagName.toLowerCase();
                if (tag === 'script' || tag === 'style' || tag === 'noscript') continue;

                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                if (rect.width === 0 || rect.height === 0) continue;
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

                const text = (el.innerText || '').toLowerCase().trim();
                if (!text || text.length > 200) continue;

                for (const kw of keywords) {
                    if (text.includes(kw)) {
                        return { notReg: true, reason: `keyword "${kw}" di <${tag}>` };
                    }
                }
            }
            return { notReg: false, reason: 'no visible keyword' };
        }, NOT_REGISTERED_KEYWORDS);

        if (result.notReg) console.log(`🔍 [NOT-REG] ✅ Terdeteksi: ${result.reason}`);
        return result.notReg;

    } catch (e) {
        console.log(`⚠️ [NOT-REG] Error: ${e.message}`);
        return false;
    }
}

async function waitForNotRegisteredPage(timeout = NOT_REGISTERED_PAGE_TIMEOUT) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (await isNotRegisteredPage()) return true;
        await pageInstance.waitForTimeout(200);
    }
    return false;
}

// ==========================================
// 🔥 PARSE HASIL DPT
// ==========================================
function parseDptResult(rawText) {
    const out = { nama: '-', status: '-', wilayah: '-', tanggal: '-', validasi: '-' };
    if (!rawText) return out;

    const lines = String(rawText).split('\n').map(l => l.trim()).filter(Boolean);
    const flat = String(rawText).replace(/\s+/g, ' ').trim();

    for (const line of lines) {
        const m = line.match(/^Nama\s*[:\-]\s*(.+)$/i);
        if (m) { out.nama = m[1].replace(/[,;]+$/, '').trim(); break; }
    }
    if (out.nama === '-') {
        const m = flat.match(/Selamat[,\s]+(.+?)(?=\s*(?:Anda|Status|Wilayah|Tanggal|$))/i);
        if (m) out.nama = m[1].replace(/[,;]+$/, '').trim();
    }

    // 🔥 Status: cek dulu penolakan, baru positives.
// "Data anda belum terdaftar!" mengandung kata "terdaftar" — harus dicek lebih dulu.
if (/tidak\s+terdaftar/i.test(flat) || /belum\s+terdaftar/i.test(flat)) {
    out.status = 'TIDAK TERDAFTAR';
} else if (/\bterdaftar\b/i.test(flat)) {
    out.status = 'TERDAFTAR';
}

    for (const line of lines) {
        const m = line.match(/^Wilayah\s*[:\-]\s*(.+)$/i);
        if (m) { out.wilayah = m[1].replace(/\s*,\s*/g, ', ').trim(); break; }
    }

    let m = flat.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+pukul\s+[\d:.]+\s+WIB)/i);
    if (m) out.tanggal = m[1].trim();
    else {
        m = flat.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
        if (m) out.tanggal = m[1].trim();
    }

    if (/data\s+tidak\s+valid/i.test(flat)) out.validasi = 'DATA TIDAK VALID';
    else if (/data\s+valid/i.test(flat)) out.validasi = 'DATA VALID';

    return out;
}

// ==========================================
// 🔥 KLASIFIKASI HASIL (STRING PERSIS DARI BUNDLE SITUS)
// home.js / index.js:
//   notMatch  -> "Oops, Something went wrong.." + "Maaf, kami tidak menemukan kecocokan request dengan OTP anda."
//   rto       -> "Galat, Gateway Time-out!" + screen.error
//   notreg    -> screen.notregistered  = "Data anda belum terdaftar!"
//   success   -> "Selamat, <nama>" + "Anda telah terdaftar dalam database"
// ==========================================
const RESULT_SIGNATURES = {
    OTP_MISMATCH: [
        'oops, something went wrong',
        'tidak menemukan kecocokan',
        'kecocokan request dengan otp',
    ],
    TIMEOUT: [
        'gateway time-out',
        'gateway timeout',
        'terjadi kesalahan saat berkomunikasi dengan server',
    ],
    NOT_REGISTERED: [
        'data anda belum terdaftar',
        'nik anda belum terdaftar',
        'anda belum terdaftar',
        'anda tidak ditemukan',
    ],
};

const SUCCESS_SIGNATURES = [
    'anda telah terdaftar dalam database',
    'status validasi',
    'daftar pemilih berkelanjutan',
];

function classifyResult(pageText) {
    const flat = String(pageText || '').toLowerCase().replace(/\s+/g, ' ').trim();

    // 1. OTP salah / tidak cocok
    for (const s of RESULT_SIGNATURES.OTP_MISMATCH) {
        if (flat.includes(s)) {
            return { status: 'otp_mismatch', reason: `keyword "${s}"`, error: 'OTP tidak cocok atau kedaluwarsa' };
        }
    }

    // 2. Timeout / error server
    for (const s of RESULT_SIGNATURES.TIMEOUT) {
        if (flat.includes(s)) {
            return { status: 'timeout', reason: `keyword "${s}"`, error: 'Server KPU gagal merespons' };
        }
    }

    // 3. NIK tidak terdaftar
    for (const s of RESULT_SIGNATURES.NOT_REGISTERED) {
        if (flat.includes(s)) {
            return { status: 'not_registered', reason: `keyword "${s}"`, error: 'Data belum terdaftar di DPT' };
        }
    }

    // 4. Berhasil — wajib ada tanda positives, bukan sekadar "tidak ada error"
    const hasPositive = SUCCESS_SIGNATURES.some(s => flat.includes(s));
    if (hasPositive) {
        return { status: 'success', reason: 'tanda "terdaftar" ditemukan' };
    }

    // 5. Halaman tidak dikenali — jangan dianggap sukses diam-diam
    return {
        status: 'failed',
        reason: 'tidak ada tanda hasil yang dikenali',
        error: 'Halaman hasil tidak dikenali (bukan data DPT). Cek screenshot.',
    };
}

// ==========================================
// 🔥 CEK 1 NIK - FLOW FINAL
// ==========================================
async function checkSingleNik(nik, phoneNumber = null) {
    if (!phoneNumber) phoneNumber = getActivePhone();

    const MAX_RETRY = 3;

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        console.log('\n' + '='.repeat(60));
        console.log(`🔍 [CHECK] Memproses NIK: ${nik} (Percobaan ${attempt}/${MAX_RETRY})`);
        console.log('='.repeat(60));

        const result = {
            nik, phone: phoneNumber, status: 'pending',
            data: null, error: null,
            timestamp: new Date().toISOString(),
        };

        try {
            // ==============================
            // STEP 0: BUKA KPU
            // ==============================
            console.log('🌐 [STEP 0] Buka halaman KPU...');
            try {
                await pageInstance.goto(KPU_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
            } catch (e) {
                console.log(`⚠️ [STEP 0] goto warning: ${e.message}`);
            }

            // 🔥 Tunggu heading NIK muncul dulu (Vue SPA butuh render).
            // Selector saja bisa terlalu cepat, terutama cold-start di server.
            console.log('⏳ [STEP 0] Tunggu form NIK siap...');
            let formReady = true;
            try {
                await pageInstance.waitForFunction(
                    () => (document.body.innerText || '').includes('Nomor Induk Kependudukan'),
                    { timeout: 25000, polling: 300 }
                );
            } catch (e) {
                formReady = false;
                console.log('⚠️ [STEP 0] Heading NIK tidak muncul dalam 25s');
            }

            const nikInput = formReady
                ? await findVisible('input.form-control', 10000)
                : null;

            if (!nikInput) throw new Error('Input NIK tidak ditemukan');

            await takeScreenshot(`01_home_${nik}`);
            console.log('✅ [STEP 0] Halaman KPU siap');

            // ==============================
            // STEP 1: ISI NIK
            // ==============================
            console.log('📝 [STEP 1] Mengisi NIK...');
            await nikInput.click();
            await nikInput.fill('');
            await pageInstance.waitForTimeout(100);
            await nikInput.type(nik, { delay: 30 });

            const nikValue = await nikInput.inputValue().catch(() => '');
            if (nikValue !== nik) {
                console.log(`⚠️ [STEP 1] NIK belum sempurna (${nikValue}), fill ulang...`);
                await fillFast(nikInput, nik);
            }

            console.log(`✅ [STEP 1] NIK diisi: ${nik}`);
            await pageInstance.waitForTimeout(500);
            await takeScreenshot(`02_nik_${nik}`);

            // ==============================
            // STEP 1.5: TUNGGU TOMBOL ENABLE
            // ==============================
            console.log('⏳ [STEP 1.5] Tunggu tombol "Langkah 2/4" aktif...');
            let btnEnabled = false;
            const waitBtnStart = Date.now();
            while (Date.now() - waitBtnStart < 5000) {
                const btn = await pageInstance.$('button:has-text("Langkah")');
                if (btn) {
                    const isDis = await btn.evaluate(el =>
                        el.disabled ||
                        el.hasAttribute('disabled') ||
                        el.getAttribute('aria-disabled') === 'true' ||
                        el.classList.contains('disabled') ||
                        getComputedStyle(el).pointerEvents === 'none'
                    ).catch(() => true);
                    if (!isDis) { btnEnabled = true; break; }
                }
                await pageInstance.waitForTimeout(200);
            }
            console.log(btnEnabled ? '✅ [STEP 1.5] Tombol aktif' : '⚠️ [STEP 1.5] Tombol masih disabled');

            // ==============================
            // STEP 2: KLIK LANGKAH 2/4
            // ==============================
            console.log('🔘 [STEP 2] Klik tombol "Langkah 2 / 4"...');

            let searchBtn = await findVisible(
                'button:has-text("Langkah 2"), button:has-text("Langkah"), button:has-text("Pencarian"), button:has-text("Cari"), button:has-text("Lanjut"), button:has-text("Next"), button[type="submit"]',
                5000
            );
            if (!searchBtn) throw new Error('Tombol Langkah 2/4 tidak ditemukan');

            await searchBtn.scrollIntoViewIfNeeded().catch(() => {});
            await pageInstance.waitForTimeout(300);

            try {
                await searchBtn.click({ timeout: 5000 });
                console.log('✅ [STEP 2] Tombol "Langkah 2/4" diklik (1x saja)');
            } catch (e) {
                throw new Error(`Gagal klik tombol Langkah 2/4: ${e.message}`);
            }

            await pageInstance.waitForTimeout(5000);

            // Polling field HP / OTP / not-reg (20 detik)
            let hpField = null;
            let otpLangsungMuncul = false;
            let notRegStep2 = false;

            const step2Start = Date.now();
            const STEP2_MAX = 20000;

            while (Date.now() - step2Start < STEP2_MAX) {
                hpField = await isPhoneFieldVisible();
                if (hpField) break;
                if (await isOtpFieldVisible()) { otpLangsungMuncul = true; break; }
                if (await isNotRegisteredPage()) { notRegStep2 = true; break; }
                await pageInstance.waitForTimeout(300);
            }

            await takeScreenshot(`03_after_next_${nik}`);

            if (notRegStep2 && !hpField && !otpLangsungMuncul) {
                console.log(`❌ [NOT-REG] NIK ${nik} TIDAK TERDAFTAR`);
                await takeScreenshot(`not_registered_${nik}`);
                result.status = 'not_registered';
                result.data = {
                    nama: '-', status: 'TIDAK TERDAFTAR', wilayah: '-',
                    tanggal: '-', validasi: '-',
                    raw_text: 'Data anda belum terdaftar!',
                    url: pageInstance.url(),
                };
                result.error = 'Data belum terdaftar di DPT';
                return result;
            }

            if (!hpField && !otpLangsungMuncul) {
                throw new Error('Field HP tidak muncul setelah klik Langkah 2/4 (timeout 20s)');
            }

            // ==============================
            // STEP 3: ISI NOMOR HP (FORMAT 62)
            // ==============================
            if (hpField) {
                console.log('📱 [STEP 3] Mengisi nomor HP...');

                let formattedPhone = phoneNumber.replace(/[^0-9]/g, '');
                if (formattedPhone.startsWith('0')) {
                    formattedPhone = '62' + formattedPhone.substring(1);
                }
                if (!formattedPhone.startsWith('62')) {
                    formattedPhone = '62' + formattedPhone;
                }

                console.log(`📱 [STEP 3] Format nomor: ${formattedPhone}`);

                await hpField.click();
                await pageInstance.waitForTimeout(300);
                await hpField.fill('');
                await pageInstance.waitForTimeout(300);
                await hpField.type(formattedPhone, { delay: 80 });
                await pageInstance.waitForTimeout(2000);

                const filledValue = await hpField.inputValue().catch(() => '');
                console.log(`🔍 [STEP 3] Value terisi: "${filledValue}"`);

                if (filledValue !== formattedPhone) {
                    console.log(`⚠️ [STEP 3] Value beda, coba fill ulang...`);
                    await hpField.fill('');
                    await pageInstance.waitForTimeout(200);
                    await hpField.type(formattedPhone, { delay: 80 });
                    await pageInstance.waitForTimeout(1000);
                }

                console.log(`✅ [STEP 3] Nomor diisi: ${formattedPhone}`);
                await takeScreenshot(`04_phone_${nik}`);

                console.log('⏳ [STEP 3.5] Tunggu 1s sebelum klik Langkah 3/4...');
                await pageInstance.waitForTimeout(1000);

                // ==============================
                // STEP 4: KLIK LANGKAH 3/4
                // ==============================
                console.log('🔘 [STEP 4] Klik tombol "Langkah 3/4"...');

                async function findStep3Button(timeout = 8000) {
                    const start = Date.now();
                    while (Date.now() - start < timeout) {
                        const buttons = await pageInstance.$$('button');
                        for (const btn of buttons) {
                            const visible = await btn.isVisible().catch(() => false);
                            if (!visible) continue;

                            const text = (await btn.textContent().catch(() => '')).trim();
                            if (/langkah\s*3\s*\/\s*4/i.test(text)) {
                                console.log(`🔍 [STEP 4] Ketemu tombol: "${text}"`);
                                return btn;
                            }
                        }
                        await pageInstance.waitForTimeout(200);
                    }
                    return null;
                }

                let nextBtn = await findStep3Button(5000);

                if (!nextBtn) {
                    console.log('⚠️ [STEP 4] Tombol "Langkah 3/4" gak ketemu, coba alternatif...');
                    nextBtn = await findVisible(
                        'button:has-text("Kirim OTP"), button:has-text("Kirim"), button:has-text("Verifikasi"), button:has-text("Next")',
                        3000
                    );
                }

                if (!nextBtn) {
                    await takeScreenshot(`04_no_button_${nik}`);
                    throw new Error('Tombol Langkah 3/4 tidak ditemukan');
                }

                console.log('⏳ [STEP 4] Nunggu tombol enabled...');
                const enableStart = Date.now();
                let btnReady = false;

                while (Date.now() - enableStart < 10000) {
                    const state = await nextBtn.evaluate(el => {
                        const style = getComputedStyle(el);
                        return {
                            disabled: el.disabled,
                            hasDisabledAttr: el.hasAttribute('disabled'),
                            ariaDisabled: el.getAttribute('aria-disabled'),
                            pointerEvents: style.pointerEvents,
                            opacity: style.opacity,
                        };
                    }).catch(() => null);

                    if (state) {
                        const isBlocked =
                            state.disabled ||
                            state.hasDisabledAttr ||
                            state.ariaDisabled === 'true' ||
                            state.pointerEvents === 'none' ||
                            parseFloat(state.opacity) < 0.5;

                        if (!isBlocked) {
                            btnReady = true;
                            console.log('✅ [STEP 4] Tombol siap diklik');
                            break;
                        }
                    }
                    await pageInstance.waitForTimeout(300);
                }

                if (!btnReady) {
                    console.log('⚠️ [STEP 4] Tombol masih ke-block setelah 10s — coba paksa klik');
                    await takeScreenshot(`04c_btn_blocked_${nik}`);
                }

                await nextBtn.scrollIntoViewIfNeeded().catch(() => {});
                await pageInstance.waitForTimeout(300);

                let clickSuccess = false;

                try {
                    await nextBtn.click({ timeout: 5000 });
                    clickSuccess = true;
                    console.log('✅ [STEP 4] Klik normal berhasil');
                } catch (e) {
                    console.log(`⚠️ [STEP 4] Click normal gagal: ${e.message}`);
                }

                if (!clickSuccess) {
                    try {
                        await nextBtn.click({ force: true, timeout: 3000 });
                        clickSuccess = true;
                        console.log('✅ [STEP 4] Klik force berhasil');
                    } catch (e) {
                        console.log(`⚠️ [STEP 4] Click force gagal: ${e.message}`);
                    }
                }

                if (!clickSuccess) {
                    try {
                        await nextBtn.evaluate(el => {
                            el.scrollIntoView({ block: 'center' });
                            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        });
                        clickSuccess = true;
                        console.log('✅ [STEP 4] Klik via dispatchEvent berhasil');
                    } catch (e) {
                        console.log(`⚠️ [STEP 4] dispatchEvent gagal: ${e.message}`);
                    }
                }

                if (!clickSuccess) {
                    console.log('⚠️ [STEP 4] Semua klik gagal — coba tekan Enter di field HP...');
                    try {
                        await hpField.focus();
                        await pageInstance.keyboard.press('Enter');
                        clickSuccess = true;
                        console.log('✅ [STEP 4] Enter berhasil');
                    } catch (e) {
                        console.log(`⚠️ [STEP 4] Enter gagal: ${e.message}`);
                    }
                }

                if (!clickSuccess) {
                    await takeScreenshot(`04_click_failed_${nik}`);
                    throw new Error('Semua metode klik tombol Langkah 3/4 gagal');
                }

                console.log('⏳ [STEP 4.5] Tunggu 8s cek hasil...');
                await pageInstance.waitForTimeout(8000);
                await takeScreenshot(`04b_after_click_${nik}`);

            } else {
                console.log('✅ [STEP 3-4] Skip ke halaman OTP langsung');
            }

            // ==============================
            // STEP 5: TUNGGU FIELD OTP MUNCUL
            // ==============================
            console.log('⏳ [STEP 5] Menunggu field OTP dari KPU...');

            let otpFieldMuncul = false;
            let notRegMuncul = false;
            const step5Start = Date.now();

            while (Date.now() - step5Start < 15000) {
                if (await isOtpFieldVisible()) { otpFieldMuncul = true; break; }
                if (await isNotRegisteredPage()) { notRegMuncul = true; break; }
                await pageInstance.waitForTimeout(300);
            }

            await takeScreenshot(`05_otp_page_${nik}`);

            if (notRegMuncul && !otpFieldMuncul) {
                console.log(`❌ [NOT-REG] NIK ${nik} TIDAK TERDAFTAR`);
                await takeScreenshot(`not_registered_${nik}`);
                result.status = 'not_registered';
                result.data = {
                    nama: '-', status: 'TIDAK TERDAFTAR', wilayah: '-',
                    tanggal: '-', validasi: '-',
                    raw_text: 'Data anda belum terdaftar!',
                    url: pageInstance.url(),
                };
                result.error = 'Data belum terdaftar di DPT';
                return result;
            }

            if (!otpFieldMuncul) {
                throw new Error('Field OTP tidak muncul setelah kirim OTP (timeout 15s)');
            }

            console.log('✅ [STEP 5] Field OTP muncul — menunggu OTP dari user...');
            let otpCode = null;
            try {
                otpCode = await waitForOtp();
            } catch (e) {
                console.log(`⚠️ [STEP 5] Timeout nunggu OTP — RETRY dari awal...`);
                if (attempt < MAX_RETRY) {
                    console.log(`🔄 [RETRY] Percobaan ${attempt} gagal, ulang (${attempt + 1}/${MAX_RETRY})...`);
                    await pageInstance.waitForTimeout(2000);
                    continue;
                }
                throw new Error('OTP_TIMEOUT: KPU ga kirim OTP setelah 3 percobaan');
            }

            console.log(`✅ [STEP 5] OTP diterima: ${otpCode}`);

            // ==============================
            // STEP 6: ISI OTP
            // ==============================
            console.log('🔐 [STEP 6] Mengisi OTP...');
            await pageInstance.waitForTimeout(500);

            const otpInputs = await pageInstance.$$('input');
            const visibleOtp = [];
            for (const inp of otpInputs) {
                if (!await inp.isVisible().catch(() => false)) continue;

                const val = await inp.inputValue().catch(() => '');
                if (val && (val.startsWith('08') || val.startsWith('62') || val.length >= 10)) continue;

                const isDisabled = await inp.isDisabled().catch(() => false);
                if (isDisabled) continue;

                visibleOtp.push(inp);
            }
            console.log(`🔍 [STEP 6] Ditemukan ${visibleOtp.length} input OTP visible`);

            if (visibleOtp.length >= 6) {
                console.log('📝 [STEP 6] Format: 6 input terpisah');
                const digits = otpCode.split('');
                for (let i = 0; i < 6; i++) {
                    await fillFast(visibleOtp[i], digits[i] || '');
                    await pageInstance.waitForTimeout(50);
                }
                await visibleOtp[5].focus().catch(() => {});

            } else if (visibleOtp.length >= 1) {
                console.log('📝 [STEP 6] Format: 1 input gabungan');
                const target = visibleOtp[visibleOtp.length - 1];

                await target.click();
                await pageInstance.waitForTimeout(100);
                await target.fill('').catch(() => {});
                await pageInstance.waitForTimeout(100);
                await target.type(otpCode, { delay: 50 });

                const filled = await target.inputValue().catch(() => '');
                if (filled.length < otpCode.length) {
                    console.log(`⚠️ [STEP 6] OTP belum penuh (${filled}), coba fill ulang...`);
                    await fillFast(target, otpCode);
                }
                console.log(`✅ [STEP 6] OTP diisi: ${await target.inputValue().catch(() => '?')}`);
            } else {
                throw new Error('Input OTP tidak ditemukan');
            }

            console.log('✅ [STEP 6] OTP diisi');
            await pageInstance.waitForTimeout(500);
            await takeScreenshot(`06_otp_filled_${nik}`);

            // ==============================
            // STEP 7: SUBMIT OTP
            // ==============================
            console.log('🔘 [STEP 7] Submit OTP...');

            let submitBtn = await findVisible('button:has-text("Konfirmasi")', 3000);
            if (!submitBtn) {
                console.log('⚠️ [STEP 7] Cari tombol alternatif...');
                submitBtn = await findVisible(
                    'button:has-text("Verifikasi"), button:has-text("Submit"), button:has-text("Kirim"), button:has-text("Langkah"), button[type="submit"]',
                    3000
                );
            }

            if (submitBtn) {
                const btnText = await submitBtn.textContent().catch(() => '?');
                console.log(`✅ [STEP 7] Klik tombol: "${btnText}"`);
                await submitBtn.click({ timeout: 5000 });
                console.log('✅ [STEP 7] Tombol submit diklik (1x saja)');
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
                    { timeout: 20000, polling: 150 }
                );
                console.log('✅ [STEP 7.5] Halaman hasil muncul');
            } catch (e) {
                console.log('⚠️ [STEP 7.5] Timeout, baca apa adanya');
            }

            await pageInstance.waitForTimeout(1000);
            await takeScreenshot(`07_result_${nik}`);

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
                result.data = { raw_text: pageText.substring(0, 5000), url: pageInstance.url() };
                return result;
            }

            console.log(`📄 [STEP 8] Preview:\n${pageText.substring(0, 500)}`);

            const parsed = parseDptResult(pageText);
            console.log(`📊 [STEP 8] Hasil parse:`, JSON.stringify(parsed, null, 2));

            // 🔥 KLASIFIKASI AKURAT (string persis dari bundle situs)
            const verdict = classifyResult(pageText);

            result.status = verdict.status;
            result.error = verdict.error || null;
            result.data = {
                ...parsed,
                status_label: parsed.status,
                raw_text: pageText.substring(0, 5000),
                url: pageInstance.url(),
            };

            console.log(`📊 [STEP 8] Status: ${result.status} (${verdict.reason})`);
            return result;

        } catch (error) {
            console.error(`❌ [CHECK] Error NIK ${nik} (percobaan ${attempt}):`, error.message);

            if (attempt < MAX_RETRY) {
                console.log(`🔄 [RETRY] Percobaan ${attempt} gagal, ulang (${attempt + 1}/${MAX_RETRY})...`);
                await pageInstance.waitForTimeout(2000);
                continue;
            }

            result.status = 'error';
            result.error = error.message;
            if (CONFIG.screenshotOnError) await takeScreenshot(`error_${nik}`);
        }
    }

    return {
        nik, phone: phoneNumber, status: 'error', data: null,
        error: `Gagal setelah ${MAX_RETRY} percobaan`,
        timestamp: new Date().toISOString(),
    };
}

// ==========================================
// 🔥 CEK BANYAK NIK (DENGAN LOCK)
// ==========================================
async function checkMultipleNik(nikList, phoneNumber = null) {
    if (!phoneNumber) phoneNumber = getActivePhone();

    if (isProcessing) {
        console.log('⏳ [LOCK] Masih ada proses NIK berjalan, tunggu...');
        while (isProcessing) await new Promise(r => setTimeout(r, 1000));
    }
    isProcessing = true;

    console.log(`\n🚀 [BATCH] Memproses ${nikList.length} NIK...`);

    try {
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
                    await new Promise(r => setTimeout(r, 500));
                }
            } catch (e) {
                console.error(`❌ [BATCH] Gagal NIK ${nik}:`, e.message);
                results.push({ nik, status: 'error', error: e.message, timestamp: new Date().toISOString() });
            }
        }

        await closeBrowser();
        console.log(`\n✅ [BATCH] Selesai! ${results.length} NIK diproses`);
        return results;

    } finally {
        isProcessing = false;
        console.log('🔓 [LOCK] Proses selesai, lock dibuka');
    }
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
    isOtpFieldVisible,
    isPhoneFieldVisible,
    waitForNotRegisteredPage,
    CONFIG,
    KPU_URL,
    RESULT_FILE,
};