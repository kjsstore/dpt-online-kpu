// ==========================================
// 🔥 KPU CHECKER - FINAL FIXED (CLEAN & AKURAT)
// Flow: NIK → Langkah 2/4 → HP → Langkah 3/4 → OTP → Hasil
// ==========================================

const { chromium } = require('playwright');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const KPU_URL = 'https://cekdptonline.kpu.go.id/';
const DEFAULT_PHONE = '6283830803474';
const RESULT_FILE = path.join(__dirname, 'hasil_cek_dpt.json');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const NOMOR_BOT_FILE = path.join(__dirname, 'nomor_bot.json');

// ==========================================
// 🔥 PROFIL CHROME PERSISTEN (WAJIB UNTUK CAPTCHA)
// ==========================================
// reCAPTCHA KPU menolak profil anonim: setiap launch()/context baru
// berarti cookie & sid baru, sehingga skor risiko selalu tinggi dan
// server membalas "INVALID_CAPTCHA, are you robot ?". Dengan profil
// persisten, sid dari request sebelumnya ikut terbawa sehingga
// challenge berikutnya jauh lebih mungkin lolos.
const PROFILE_DIR = path.join(__dirname, '.kpu-profile');

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

    // Pakai Chrome asli (channel: 'chrome') + profil persisten.
    // Setel false hanya untuk debug: captcha hampir pasti ditolak.
    persistentProfile: true,
    chromeChannel: 'chrome',

    // Backoff retry captcha: attempt 1 -> 5s, 2 -> 10s, 3 -> 15s.
    captchaBaseDelayMs: 5000,
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
// 🔥 KEYWORD DETEKSI CAPTCHA
// ==========================================
// PENTING: server KPU memakai statusCode "400" untuk DUA kondisi yang
// sama-sama gagal: reCAPTCHA ditolak DAN NIK tidak ditemukan.
// Jadi status code tidak bisa dipakai untuk membedakan keduanya —
// yang dipakai adalah TEKS pesan. Captcha dicek LEBIH DAHULU.
const CAPTCHA_SIGNATURES = [
    'invalid_captcha',
    'invalid captcha',
    'are you robot',
    'captcha tidak valid',
    'verifikasi captcha',
    'verify you are human',
];

const CAPTCHA_MAX_RETRY = 3;

function matchCaptcha(rawText) {
    const flat = String(rawText || '').toLowerCase().replace(/\s+/g, ' ');
    for (const s of CAPTCHA_SIGNATURES) {
        if (flat.includes(s)) return s;
    }
    return null;
}

function isCaptchaPage(rawText) {
    return matchCaptcha(rawText) !== null;
}

// ==========================================
// 🔥 DETEKSI CAPTCHA DARI RESPONS API (WAJIB)
// ==========================================
// PENTING: situs KPU menampilkan "Data anda belum terdaftar!" bahkan
// ketika server menolak reCAPTCHA. Respon aslinya:
//   {"errors":[{"message":"INVALID_CAPTCHA, are you robot ?",
//              "statusCode":"400"}],"data":{"findNikPilkada":null}}
// Jadi kalau hanya membaca teks halaman, captcha yang gagal akan
// TERLALAH dikira "tidak terdaftar" — jawaban yang salah.
// Karena itu payload respons juga harus diperiksa.
let captchaApiError = null;
let captchaApiSeen = false;

function watchCaptchaResponses(page) {
    if (!page || typeof page.on !== 'function') return;
    page.on('response', async (res) => {
        let u = '';
        try { u = res.url(); } catch (e) { return; }
        if (!/\/v2(\?|$)/.test(u)) return;
        let body = null;
        try { body = await res.text(); } catch (e) { return; }
        if (!body) return;
        const hit = matchCaptcha(body);
        if (hit) {
            captchaApiError = hit;
            captchaApiSeen = true;
            console.log(`🛰️  [CAPTCHA-API] Server menolak: "${hit}" (dari respons /v2)`);
        }
    });
}

function resetCaptchaApiState() {
    captchaApiError = null;
    captchaApiSeen = false;
}

// ==========================================
// 🔥 SOLVE reCAPTCHA VIA 2CAPTCHA
// ==========================================
// Situs KPU memakai reCAPTCHA v2 checkbox. Checkbox-nya tidak bisa
// diklik normal dari otomasimu (elemennya berukuran 0x0 sehingga klik
// tidak menghasilkan token), jadi token diambil dari 2Captcha lalu
// disuntik ke textarea g-recaptcha-response sebelum form dikirim.
async function detectSiteKey() {
    if (!pageInstance) return null;
    try {
        const key = await pageInstance.evaluate(() => {
            const el = document.querySelector('[data-sitekey]');
            if (el && el.getAttribute('data-sitekey')) return el.getAttribute('data-sitekey');

            // Fallback: sitekey ikut di URL iframe anchor reCAPTCHA.
            const f = [...document.querySelectorAll('iframe')].find((x) => /recaptcha/i.test(x.src || ''));
            if (f) {
                const m = (f.src || '').match(/k=([A-Za-z0-9_-]+)/);
                if (m) return m[1];
            }

            // Fallback terakhir: cari pola site key di HTML.
            const m = document.documentElement.outerHTML.match(/6L[A-Za-z0-9_-]{38}/);
            return m ? m[0] : null;
        });
        return key || null;
    } catch (e) {
        return null;
    }
}

async function hasCaptchaWidget() {
    if (!pageInstance) return false;
    try {
        return await pageInstance.evaluate(() =>
            !!document.querySelector('textarea[name="g-recaptcha-response"], input[name="g-recaptcha-response"]') ||
            !!document.querySelector('iframe[src*="recaptcha"]')
        );
    } catch (e) {
        return false;
    }
}

/**
 * Minta 2Captcha menyelesaikan captcha lalu suntikkan tokennya ke form.
 * @returns {Promise<{ok:boolean, reason?:string, tokenLength?:number}>}
 */
async function solveCaptchaWith2Captcha() {
    const solver = require('./captcha-solver.js');

    if (!solver.isEnabled()) {
        return { ok: false, reason: 'CAPTCHA_API_KEY belum diset (captcha tidak bisa diselesaikan otomatis)' };
    }

    const siteKey = await detectSiteKey();
    if (!siteKey) return { ok: false, reason: 'siteKey reCAPTCHA tidak ditemukan di halaman' };

    try {
        const { token } = await solver.solve(pageInstance.url(), siteKey);

        // Suntik token. Widget sengaja dinonaktifkan dulu supaya tidak
        // menimpa atau membatalkan token yang baru disuntikkan.
        const injected = await pageInstance.evaluate((val) => {
            let el = document.querySelector('textarea[name="g-recaptcha-response"]');
            if (!el) {
                el = document.createElement('textarea');
                el.name = 'g-recaptcha-response';
                el.id = 'g-recaptcha-response';
                el.style.display = 'none';
                document.body.appendChild(el);
            }
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return el.value.length;
        }, token);

        // responseCallback: site sering memanggil grecaptcha.getResponse()
        // alih-alih membaca textarea. Dioverride supaya sama-sama kena.
        await pageInstance.evaluate((val) => {
            if (window.grecaptcha && typeof window.grecaptcha.getResponse === 'function') {
                window.grecaptcha.getResponse = () => val;
            }
        }, token).catch(() => {});

        await pageInstance.waitForTimeout(400);
        console.log(`✅ [2CAPTCHA] Token disuntik ke form (${injected} karakter)`);
        return { ok: true, tokenLength: injected };
    } catch (e) {
        console.log(`❌ [2CAPTCHA] Gagal: ${e.message}`);
        return { ok: false, reason: e.message, hint: e.hint };
    }
}


// ==========================================
// 🔥 STATE
// ==========================================
let globalOtp = null;
let globalOtpTime = null;
let otpResolver = null;
let browserInstance = null;
let contextInstance = null;
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
// 🔥 INIT BROWSER — CHROME ASLI + PROFIL PERSISTEN
// ==========================================
async function initBrowser() {
    console.log('🌐 [BROWSER] Membuka browser...');

    const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
    ];

    // Samakan navigator.webdriver & bahasa dengan browser asli.
    const stealth = () => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    };

    if (CONFIG.persistentProfile) {
        try {
            if (!fs.existsSync(PROFILE_DIR)) {
                fs.mkdirSync(PROFILE_DIR, { recursive: true });
            }

            // CATATAN: TIDAK set userAgent. Memalsukan UA ke versi lama
            // bikin fingerprint UA tidak cocok dengan fingerprint engine
            // Chrome yang sebenarnya — itu sendiri pemicu skor captcha tinggi.
            contextInstance = await chromium.launchPersistentContext(PROFILE_DIR, {
                channel: CONFIG.chromeChannel,
                headless: CONFIG.headless,
                slowMo: CONFIG.slowMo,
                args,
                viewport: { width: 1280, height: 800 },
                locale: 'id-ID',
            });

            browserInstance = contextInstance.browser();
            await contextInstance.addInitScript(stealth);

            pageInstance = contextInstance.pages()[0] || await contextInstance.newPage();
            pageInstance.setDefaultTimeout(CONFIG.timeout);
            pageInstance.setDefaultNavigationTimeout(CONFIG.timeout);

            await warmUpPage(pageInstance);
            watchCaptchaResponses(pageInstance);

            console.log(`✅ [BROWSER] Chrome siap (profil persisten: ${PROFILE_DIR})`);
            return pageInstance;
        } catch (e) {
            console.log(`⚠️ [BROWSER] Gagal pakai Chrome persisten: ${e.message}`);
            console.log('⚠️ [BROWSER] Fallback ke Chromium non-persistent — captcha kemungkinan ditolak.');
            try {
                if (contextInstance) await contextInstance.close().catch(() => {});
            } catch (e2) {}
            contextInstance = null;
            browserInstance = null;
        }
    }

    browserInstance = await chromium.launch({
        headless: CONFIG.headless,
        slowMo: CONFIG.slowMo,
        args,
    });

    const context = await browserInstance.newContext({
        viewport: { width: 1280, height: 800 },
        locale: 'id-ID',
    });

    await context.addInitScript(stealth);

    pageInstance = await context.newPage();
    pageInstance.setDefaultTimeout(CONFIG.timeout);
    pageInstance.setDefaultNavigationTimeout(CONFIG.timeout);

    await warmUpPage(pageInstance);
    watchCaptchaResponses(pageInstance);

    console.log('✅ [BROWSER] Browser siap');
    return pageInstance;
}

// ==========================================
// 🔥 WARM-UP: gerakan mouse + scroll ringan
// ==========================================
// Request pertama dari profil yang baru dibuat selalu terlihat seperti bot.
// Gerak mouse acak singkat sebelum halaman sungguhan dibuka menurunkan
// pola "0 interaksi lalu langsung POST".
async function warmUpPage(page) {
    try {
        await page.mouse.move(120 + Math.floor(Math.random() * 200), 180 + Math.floor(Math.random() * 120));
        await page.waitForTimeout(120);
        await page.mouse.move(420 + Math.floor(Math.random() * 200), 320 + Math.floor(Math.random() * 140));
        await page.waitForTimeout(150);
        await page.mouse.move(680 + Math.floor(Math.random() * 160), 240 + Math.floor(Math.random() * 160));
        await page.waitForTimeout(120);
        await page.mouse.wheel(0, 180);
        await page.waitForTimeout(100);
        await page.mouse.wheel(0, -220);
        await page.waitForTimeout(80);
    } catch (e) {}
}

async function closeBrowser() {
    try {
        if (contextInstance) {
            await contextInstance.close();
        } else if (browserInstance) {
            await browserInstance.close();
        }
    } catch (e) {}

    contextInstance = null;
    browserInstance = null;
    pageInstance = null;
    console.log('🔒 [BROWSER] Browser ditutup');
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
// 🔥 DETEKSI CAPTCHA DI HALAMAN SAAT INI
// ==========================================
async function detectCaptchaPage() {
    try {
        if (!pageInstance) return { detected: false, reason: null, text: '' };
        const text = await pageInstance.evaluate(() => document.body.innerText || '');
        const hit = matchCaptcha(text);
        // Respons API menang: teks halaman bisa menampilkan
        // "Data anda belum terdaftar!" walau captcha-nya ditolak.
        if (hit) return { detected: true, reason: hit, text };
        if (captchaApiSeen) {
            return {
                detected: true,
                reason: `${captchaApiError} (dari respons API /v2)`,
                text,
            };
        }
        return { detected: false, reason: null, text };
    } catch (e) {
        if (captchaApiSeen) {
            return { detected: true, reason: `${captchaApiError} (dari respons API /v2)`, text: '' };
        }
        return { detected: false, reason: null, text: '' };
    }
}

function captchaBackoffMs(attempt) {
    return CONFIG.captchaBaseDelayMs * Math.max(1, attempt);
}

function buildCaptchaResult(nik, phoneNumber, reason, text) {
    return {
        nik,
        phone: phoneNumber,
        status: 'captcha_failed',
        data: {
            nama: '-', status: 'CAPTCHA GAGAL', wilayah: '-',
            tanggal: '-', validasi: '-',
            raw_text: String(text || '').substring(0, 5000),
            captcha_reason: reason || null,
            url: pageInstance ? pageInstance.url() : null,
        },
        error: 'reCAPTCHA KPU ditolak (INVALID_CAPTCHA). Profil browser persisten dipakai agar cookie diteruskan; ulangi percobaan.',
        timestamp: new Date().toISOString(),
    };
}

// Retry khusus captcha: tunggu backoff lalu ulang dari STEP 0.
// Kalau attempt terakhir, kembalikan status 'captcha_failed' —
// BUKAN error generik, supaya bisa dibedakan dari kegagalan lain
// dan tidak dilaporkan sebagai "tidak terdaftar".
async function handleCaptchaRetry(nik, phoneNumber, attempt, reason, text) {
    await takeScreenshot(`captcha_failed_${nik}_a${attempt}`).catch(() => {});

    if (attempt < CAPTCHA_MAX_RETRY) {
        const delay = captchaBackoffMs(attempt);
        console.log(`🔄 [CAPTCHA] ${reason} — tunggu ${Math.round(delay / 1000)}s lalu retry (${attempt + 1}/${CAPTCHA_MAX_RETRY})`);
        await pageInstance.waitForTimeout(delay).catch(() => {});
        return { retry: true };
    }

    console.log(`❌ [CAPTCHA] Gagal terus setelah ${CAPTCHA_MAX_RETRY} percobaan`);
    return { retry: false, result: buildCaptchaResult(nik, phoneNumber, reason, text) };
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
    // ⚠️ NOT_REGISTERED diperiksa lebih dulu daripada OTP_MISMATCH.
    // Halaman sukses juga memuat kata "terdaftar" ("Anda telah terdaftar..."),
    // dan versi EN "Your data is Not Registered!" memuat "registered".
    // Jadi kata "registered" tidak boleh dipakai sebagai penanda gagal.
    NOT_REGISTERED: [
        'data anda belum terdaftar',
        'nik anda belum terdaftar',
        'anda belum terdaftar',
        'your data is not registered',
        'contact nearest emb',
    ],
    OTP_MISMATCH: [
        'oops, something went wrong',
        'tidak menemukan kecocokan',
        'kecocokan request dengan otp',
        'maaf, data anda tidak ditemukan',   // EN: speak.notregistered (beda dari notMatch)
    ],
    TIMEOUT: [
        'gateway time-out',
        'gateway timeout',
        'terjadi kesalahan saat berkomunikasi dengan server',
        'internal server error',
    ],
};

const SUCCESS_SIGNATURES = [
    'anda telah terdaftar dalam database',
    'status validasi',
    'daftar pemilih berkelanjutan',
];

function classifyResult(pageText) {
    const flat = String(pageText || '').toLowerCase().replace(/\s+/g, ' ').trim();

    // 0. CAPTCHA ditolak — WAJIB paling awal.
    // Server memakai statusCode "400" untuk captcha YANG SAMA dengan
    // "tidak ditemukan". Kalau captcha tidak dicek duluan, NIK terdaftar
    // bisa salah dilabeli "tidak terdaftar" padahal captcha-nya ditolak.
    const cap = matchCaptcha(flat);
    if (cap) {
        return {
            status: 'captcha_failed',
            reason: `keyword "${cap}"`,
            error: 'reCAPTCHA KPU ditolak (INVALID_CAPTCHA). Profil browser persisten dipakai agar cookie diteruskan; ulangi percobaan.',
        };
    }

    // 1. NIK tidak terdaftar (CEK DULU — lihat catatan di RESULT_SIGNATURES)
    for (const s of RESULT_SIGNATURES.NOT_REGISTERED) {
        if (flat.includes(s)) {
            return { status: 'not_registered', reason: `keyword "${s}"`, error: 'Data belum terdaftar di DPT' };
        }
    }

    // 2. OTP salah / tidak cocok
    for (const s of RESULT_SIGNATURES.OTP_MISMATCH) {
        if (flat.includes(s)) {
            return { status: 'otp_mismatch', reason: `keyword "${s}"`, error: 'OTP tidak cocok atau kedaluwarsa' };
        }
    }

    // 3. Timeout / error server
    for (const s of RESULT_SIGNATURES.TIMEOUT) {
        if (flat.includes(s)) {
            return { status: 'timeout', reason: `keyword "${s}"`, error: 'Server KPU gagal merespons' };
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
// VALIDASI FORMAT NIK (CEK CEPAT - TANPA BROWSER)
// ==========================================
// KPU hanya memvalidasi format di langkah 2; membership DPT baru dicek
// di langkah 3 saat mengirim OTP. Jadi NIK format-salah wasting ~25 detik
// per NIK kalau tetap dibuka di browser. Tolak lebih dulu di sini.
//
// ⚠️ POSISI DIGIT (Kepmendagri No. 25/2002):
//   digit  1-2 : provinsi
//   digit  3-4 : kabupaten/kota
//   digit  5-6 : kecamatan
//   digit  7-8 : tanggal lahir (DD)
//   digit  9-10: bulan lahir (MM)
//   digit 11-12: tahun lahir (YY, 2 digit terakhir)
//   digit 13-16: nomor urut
//
// Tanggal lahir menempati digit 7-12, BUKAN 9-14.
// Versi lama memakai slice(8,10)/slice(10,12)/slice(12,14) sehingga
// "bulan" terbaca dari digit tahun -> hampir semua NIK asli ditolak.
// Contoh: 3602041211870001 = lahir 12 November 1987, laki-laki.
function validateNikFormat(nik) {
    const s = String(nik || '').trim();

    if (!/^\d{16}$/.test(s)) {
        return { valid: false, reason: `harus 16 digit angka (terisi ${s.length})` };
    }

    const prov = parseInt(s.slice(0, 2), 10);
    const ddRaw = parseInt(s.slice(6, 8), 10);
    const mm = parseInt(s.slice(8, 10), 10);
    const yy = parseInt(s.slice(10, 12), 10);

    if (prov < 11 || prov > 94) return { valid: false, reason: `kode provinsi tidak valid (${s.slice(0, 2)})` };
    if (mm < 1 || mm > 12) return { valid: false, reason: `bulan lahir tidak valid (${s.slice(8, 10)})` };

    // Untuk perempuan, kode tanggal lahir ditambah 40 pada NIK.
    // Contoh lahir 25 Feb 1987 -> tanggal pada NIK tertulis "65".
    const jk = ddRaw > 40 ? 'P' : 'L';
    const dd = ddRaw > 40 ? ddRaw - 40 : ddRaw;

    if (dd < 1 || dd > 31) return { valid: false, reason: `tanggal lahir tidak valid (${s.slice(6, 8)})` };

    const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
    if (dd > maxDay) return { valid: false, reason: `tanggal ${dd} tidak ada di bulan ${mm}` };

    // Tahun lahir 2 digit: coba 2000+yy dulu, kalau sudah di masa depan
    // mundur ke 1900+yy. (Aturan ini otomatis adapting, tidak hardcode.)
    const nowYear = new Date().getFullYear();
    let tahun = 2000 + yy;
    if (tahun > nowYear) tahun = 1900 + yy;
    if (tahun < 1900 || tahun > nowYear) {
        return { valid: false, reason: `tahun lahir tidak valid (${s.slice(10, 12)})` };
    }

    return {
        valid: true,
        lahir: `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${tahun}`,
        jk,
    };
}

// ==========================================
// ?? CEK 1 NIK - FLOW FINAL
// ==========================================
async function checkSingleNik(nik, phoneNumber = null) {
    if (!phoneNumber) phoneNumber = getActivePhone();

    // Validasi format dulu - hemat ~25 detik per NIK cacat
    const fmt = validateNikFormat(nik);
    if (!fmt.valid) {
        console.log(`?? [CEK] NIK ${nik} dilewati (format tidak valid: ${fmt.reason})`);
        return {
            nik, phone: phoneNumber, status: 'invalid_format',
            data: {
                nama: '-', status: 'NIK TIDAK VALID', wilayah: '-',
                tanggal: '-', validasi: '-', raw_text: fmt.reason,
                url: null,
            },
            error: `Format NIK tidak valid: ${fmt.reason}`,
            timestamp: new Date().toISOString(),
        };
    }


    const MAX_RETRY = 3;

    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        console.log('\n' + '='.repeat(60));
        console.log(`🔍 [CHECK] Memproses NIK: ${nik} (Percobaan ${attempt}/${MAX_RETRY})`);
        console.log('='.repeat(60));

        // Reset penanda captcha per percobaan, supaya respons dari
        // percobaan sebelumnya tidak ikut terhitung.
        resetCaptchaApiState();

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

            // Polling field HP / OTP / captcha / not-reg (20 detik)
            let hpField = null;
            let otpLangsungMuncul = false;
            let notRegStep2 = false;
            let captchaStep2 = null;

            const step2Start = Date.now();
            const STEP2_MAX = 20000;

            while (Date.now() - step2Start < STEP2_MAX) {
                // Captcha dicek paling awal: halaman sebelumnya masih
                // menampilkan "Nomor HP" sementara server sudah menolak challenge.
                const cap = await detectCaptchaPage();
                if (cap.detected) { captchaStep2 = cap; break; }

                hpField = await isPhoneFieldVisible();
                if (hpField) break;
                if (await isOtpFieldVisible()) { otpLangsungMuncul = true; break; }
                if (await isNotRegisteredPage()) { notRegStep2 = true; break; }
                await pageInstance.waitForTimeout(300);
            }

            await takeScreenshot(`03_after_next_${nik}`);

            if (captchaStep2 && !hpField && !otpLangsungMuncul) {
                const capRetry = await handleCaptchaRetry(
                    nik, phoneNumber, attempt, captchaStep2.reason, captchaStep2.text
                );
                if (capRetry.retry) continue;
                return capRetry.result;
            }

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

                // ==============================
                // STEP 3.9: SELESAIKAN CAPTCHA DULU
                // ==============================
                // Tombol "Langkah 3/4" memancing panggilan findNikPilkada
                // yang dilindungi reCAPTCHA. Kalau token belum ada, server
                // pasti membalas INVALID_CAPTCHA. Jadi token wajib tersedia
                // SEBELUM tombol diklik.
                if (await hasCaptchaWidget()) {
                    console.log('🔒 [STEP 3.9] Widget reCAPTCHA terdeteksi — minta token ke 2Captcha...');
                    const solved = await solveCaptchaWith2Captcha();
                    if (!solved.ok) {
                        console.log(`⚠️ [STEP 3.9] Captcha belum terselesaikan: ${solved.reason}`);
                        if (solved.hint) console.log(`💡 [STEP 3.9] ${solved.hint}`);
                    }
                } else {
                    console.log('ℹ️ [STEP 3.9] Tidak ada widget reCAPTCHA di halaman ini');
                }

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

                // Challenge reCAPTCHA paling sering ditolak tepat di sini,
                // saat tombol "Langkah 3/4" (kirim OTP) ditekan. Jangan
                // langsung lanjut — cek dulu apakah server menolak captcha.
                const capAfterSend = await detectCaptchaPage();
                if (capAfterSend.detected) {
                    const capRetry = await handleCaptchaRetry(
                        nik, phoneNumber, attempt, capAfterSend.reason, capAfterSend.text
                    );
                    if (capRetry.retry) continue;
                    return capRetry.result;
                }

            } else {
                console.log('✅ [STEP 3-4] Skip ke halaman OTP langsung');
            }

            // ==============================
            // STEP 5: TUNGGU FIELD OTP MUNCUL
            // ==============================
            console.log('⏳ [STEP 5] Menunggu field OTP dari KPU...');

            let otpFieldMuncul = false;
            let notRegMuncul = false;
            let captchaStep5 = null;
            const step5Start = Date.now();

            while (Date.now() - step5Start < 15000) {
                const cap = await detectCaptchaPage();
                if (cap.detected) { captchaStep5 = cap; break; }

                if (await isOtpFieldVisible()) { otpFieldMuncul = true; break; }
                if (await isNotRegisteredPage()) { notRegMuncul = true; break; }
                await pageInstance.waitForTimeout(300);
            }

            await takeScreenshot(`05_otp_page_${nik}`);

            if (captchaStep5 && !otpFieldMuncul && !notRegMuncul) {
                const capRetry = await handleCaptchaRetry(
                    nik, phoneNumber, attempt, captchaStep5.reason, captchaStep5.text
                );
                if (capRetry.retry) continue;
                return capRetry.result;
            }

            // ⚠️ Halaman "Data anda belum terdaftar!" juga muncul ketika server
// menolak reCAPTCHA. Sebelum menyimpulkan not_registered, pastikan
// dulu tidak ada respons INVALID_CAPTCHA dari /v2.
if (notRegMuncul && !otpFieldMuncul) {
                if (captchaApiSeen) {
                    const capRetry = await handleCaptchaRetry(
                        nik, phoneNumber, attempt,
                        `${captchaApiError} (dari respons API /v2)`, ''
                    );
                    if (capRetry.retry) continue;
                    return capRetry.result;
                }
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

            // Halaman hasil error masih bisa menyisakan heading OTP di DOM,
            // jadi captcha harus dicek dulu — kalau tidak, pesan
            // INVALID_CAPTCHA akan salah dilabeli "failed" generik.
            const captchaDiHasil = isCaptchaPage(pageText);

            const stillOnOtpPage = !captchaDiHasil && (
                pageText.includes('OTP (One Time Password)') ||
                pageText.includes('Masukan kode yang terkirim')
            );

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
                // pageInstance bisa null kalau browser gagal init / crash.
                // Tanpa guard ini, catch ikut lempar error dan proses bot mati.
                if (!pageInstance) {
                    result.status = 'error';
                    result.error = `Browser tidak siap: ${error.message}`;
                    break;
                }
                console.log(`🔄 [RETRY] Percobaan ${attempt} gagal, ulang (${attempt + 1}/${MAX_RETRY})...`);
                await pageInstance.waitForTimeout(2000).catch(() => {});
                continue;
            }

            result.status = 'error';
            result.error = error.message;
            if (CONFIG.screenshotOnError) await takeScreenshot(`error_${nik}`).catch(() => {});
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
    classifyResult,
    validateNikFormat,
    isNotRegisteredPage,
    isOtpFieldVisible,
    isPhoneFieldVisible,
    isCaptchaPage,
    detectCaptchaPage,
    matchCaptcha,
    waitForNotRegisteredPage,
    CONFIG,
    KPU_URL,
    RESULT_FILE,
    PROFILE_DIR,
    CAPTCHA_SIGNATURES,
    DEFAULT_PHONE,
};