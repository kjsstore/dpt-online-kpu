// ==========================================
// MODUL CAPTCHA SOLVER (2CAPTCHA)
// ==========================================
// Token lewat ENV var, TIDAK PERNAH ditulis di source.
//
//   PowerShell : $env:CAPTCHA_API_KEY="..."
//   CMD        : set CAPTCHA_API_KEY=...
//   Linux/VPS  : export CAPTCHA_API_KEY=...
//   .env       : CAPTCHA_API_KEY=...
//
// Kenapa lewat ENV? Repository ini ada di GitHub publik. Kalau API key
// ditulis langsung di dalam .js, siapa pun yang membuka repo bisa
// mengambil key-mu lalu menghabiskan saldomu.
//
// Method "userrecaptcha" dipakai karena situs KPU memakai reCAPTCHA
// v2 checkbox: 2Captcha mengembalikan token g-recaptcha-response yang
// disuntikkan ke form, lalu server KPU yang memverifikasinya ke Google
// memakai secret key miliknya.

const https = require('https');
const { URLSearchParams } = require('url');

const API_HOST = '2captcha.com';
const API_TIMEOUT_MS = 60000;

// Biaya & batas agar saldo tidak terkuras diam-diam.
const MAX_SOLVE_COST = 0.02;
const DEFAULT_POLL_INTERVAL_MS = 6000;
const DEFAULT_MAX_WAIT_MS = 180000;

function getApiKey() {
    const k =
        process.env.CAPTCHA_API_KEY ||
        process.env.TWO_CAPTCHA_KEY ||
        process.env.TWOCAPTCHA_KEY;
    return k ? String(k).trim() : null;
}

function isEnabled() {
    return !!getApiKey();
}

function request(params, timeoutMs = API_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const qs = new URLSearchParams(params).toString();
        const req = https.request(
            { host: API_HOST, path: '/in.php?' + qs, method: 'GET', timeout: timeoutMs },
            (res) => {
                let data = '';
                res.on('data', (c) => (data += c));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Respons 2Captcha bukan JSON: ' + data.substring(0, 160)));
                    }
                });
            }
        );
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout saat contacting 2Captcha')); });
        req.on('error', reject);
        req.end();
    });
}

function pollParams(params, timeoutMs = API_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const qs = new URLSearchParams(params).toString();
        const req = https.request(
            { host: API_HOST, path: '/res.php?' + qs, method: 'GET', timeout: timeoutMs },
            (res) => {
                let data = '';
                res.on('data', (c) => (data += c));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Respons res.php bukan JSON: ' + data.substring(0, 160)));
                    }
                });
            }
        );
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout saat polling 2Captcha')); });
        req.on('error', reject);
        req.end();
    });
}

async function getBalance() {
    const key = getApiKey();
    if (!key) throw new Error('CAPTCHA_API_KEY belum diset');
    const r = await request({ key, action: 'getbalance', json: '1' });
    const bal = parseFloat(r.request);
    return {
        status: r.status,
        balance: Number.isFinite(bal) ? bal : null,
        ok: r.status === 1 && Number.isFinite(bal) && bal > 0,
    };
}

/**
 * Minta 2Captcha menyelesaikan reCAPTCHA v2 pada sebuah URL.
 * @returns {Promise<{token:string, cost:number, id:string}>}
 */
async function solve(pageUrl, siteKey, opts = {}) {
    const key = getApiKey();
    if (!key) throw new Error('CAPTCHA_API_KEY belum diset');
    if (!siteKey) throw new Error('siteKey reCAPTCHA tidak ditemukan di halaman');

    const pollInterval = opts.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    const maxWait = opts.maxWaitMs || DEFAULT_MAX_WAIT_MS;
    const start = Date.now();

    const submit = await request({
        key,
        method: 'userrecaptcha',
        googlekey: siteKey,
        pageurl: pageUrl,
        json: '1',
    });

    if (submit.status !== 1) {
        const err = new Error('2Captcha menolak request: ' + (submit.request || 'tanpa detail'));
        err.code = submit.request;
        if (submit.request === 'ERROR_ZERO_BALANCE') {
            err.hint = 'Saldo 2Captcha habis. Top up di https://2captcha.com lalu coba lagi.';
        }
        throw err;
    }

    const id = submit.request;
    console.log(`🔑 [2CAPTCHA] Request ${id} dikirim (sitekey ${String(siteKey).slice(0, 12)}...)`);

    while (Date.now() - start < maxWait) {
        await new Promise((r) => setTimeout(r, pollInterval));

        const res = await pollParams({ key, action: 'get', id, json: '1' });

        if (res.status === 1) {
            const token = String(res.request || '').trim();
            console.log(`✅ [2CAPTCHA] Token diterima (${token.length} karakter)`);
            return { token, cost: Number(res.request_cost) || 0, id };
        }

        if (res.request === 'CAPCHA_NOT_READY') continue;

        // Kode error yang jelas supaya tidak looping tanpa ujung.
        if (String(res.request || '').startsWith('ERROR_')) {
            const err = new Error('2Captcha error: ' + res.request);
            err.code = res.request;
            if (res.request === 'ERROR_NO_SLOT_AVAILABLE') {
                err.hint = 'Server 2Captcha penuh, coba lagi beberapa saat.';
            }
            throw err;
        }

        console.log(`⏳ [2CAPTCHA] Status: ${res.request}`);
    }

    throw new Error(`2Captcha timeout setelah ${Math.round(maxWait / 1000)} detik`);
}

module.exports = { solve, getBalance, isEnabled, getApiKey, MAX_SOLVE_COST };
