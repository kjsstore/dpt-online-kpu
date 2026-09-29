// payment_gomerch.js - INTEGRASI GOMERCH API (FIX 401)

const axios = require('axios');
const config = require('./config');
const qr = require('qrcode');

// 🔥 AMBIL KONFIGURASI DARI CONFIG.JS
const GOMERCH_CONFIG = config.GOMERCH || {};

// State untuk token
let state = {
    accessToken: GOMERCH_CONFIG.ACCESS_TOKEN,
    refreshToken: GOMERCH_CONFIG.REFRESH_TOKEN,
    merchantId: GOMERCH_CONFIG.MERCHANT_ID,
};

// 🔥 FLAG UNTUK MENCEGAH REFRESH BERULANG
let isRefreshing = false;
let refreshPromise = null;

// ============================
// HELPER FUNCTIONS
// ============================

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function generateUniqueAmount(baseAmount) {
    const cleanAmount = Math.floor(baseAmount);
    
    // 🔥 CEK KONFIGURASI UNIQUE CODE
    const uniqueConfig = GOMERCH_CONFIG.UNIQUE_CODE || {};
    const isEnabled = uniqueConfig.ENABLED !== false;
    
    if (!isEnabled) {
        console.log(`ℹ️ [GOMERCH] Kode unik dimatikan, pakai exact: ${cleanAmount}`);
        return { 
            uniqueAmount: cleanAmount, 
            uniqueNumber: 0 
        };
    }
    
    const min = uniqueConfig.MIN || 1;
    const max = uniqueConfig.MAX || 10;
    const uniqueNumber = Math.floor(Math.random() * (max - min + 1)) + min;
    const uniqueAmount = cleanAmount + uniqueNumber;
    
    console.log(`🔄 [GOMERCH] Kode unik: +${uniqueNumber}`);
    
    return { uniqueAmount, uniqueNumber };
}

function getTodayRange() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString(), end: end.toISOString() };
}

// ============================
// API CALL DENGAN RETRY
// ============================

async function apiPost(path, body = {}, retryCount = 0) {
    try {
        console.log(`📤 [GOMERCH] API Request: ${path}`);
        console.log(`📤 [GOMERCH] Body:`, JSON.stringify(body).substring(0, 200));
        
        const response = await axios.post(GOMERCH_CONFIG.BASE_URL + path, body, {
            headers: { 'Content-Type': 'application/json' },
            timeout: GOMERCH_CONFIG.TIMEOUT || 15000,
        });
        
        console.log(`📊 [GOMERCH] Response status: ${response.status}`);
        return response.data;
        
    } catch (error) {
        console.log(`❌ [GOMERCH] API Error:`, error.message);
        
        if (error.response) {
            console.log(`📊 [GOMERCH] Status: ${error.response.status}`);
            console.log(`📊 [GOMERCH] Data:`, JSON.stringify(error.response.data, null, 2));
            
            // 🔥 JIKA 401 DAN BELUM RETRY
            if (error.response.status === 401 && retryCount < 2) {
                console.log(`🔄 [GOMERCH] Token expired, mencoba refresh...`);
                
                // 🔥 REFRESH TOKEN
                const refreshed = await refreshToken();
                
                if (refreshed) {
                    console.log(`✅ [GOMERCH] Token berhasil di-refresh, retry...`);
                    // Update body dengan token baru
                    if (body.access_token) {
                        body.access_token = state.accessToken;
                    }
                    return await apiPost(path, body, retryCount + 1);
                } else {
                    throw new Error('Gagal refresh token');
                }
            }
            
            throw new Error(`API Error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        }
        
        throw new Error(`Network Error: ${error.message}`);
    }
}

// ============================
// REFRESH TOKEN - DENGAN LOCK
// ============================

async function refreshToken() {
    // 🔥 CEK APAKAH SEDANG REFRESH
    if (isRefreshing) {
        console.log(`⏳ [GOMERCH] Menunggu refresh token selesai...`);
        return refreshPromise;
    }
    
    isRefreshing = true;
    refreshPromise = (async () => {
        try {
            console.log(`🔄 [GOMERCH] Merefresh token...`);
            
            if (!state.refreshToken) {
                throw new Error('Refresh token tidak tersedia');
            }

            const response = await axios.post(GOMERCH_CONFIG.BASE_URL + '/gomerch/api/auth/refresh', {
                refresh_token: state.refreshToken
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000,
            });

            console.log(`📊 [GOMERCH] Refresh response:`, JSON.stringify(response.data, null, 2));

            if (response.data.success && response.data.data?.access_token) {
                state.accessToken = response.data.data.access_token;
                if (response.data.data.refresh_token) {
                    state.refreshToken = response.data.data.refresh_token;
                }
                console.log(`✅ [GOMERCH] Token berhasil di-refresh!`);
                
                // 🔥 UPDATE CONFIG
                if (config.GOMERCH) {
                    config.GOMERCH.ACCESS_TOKEN = state.accessToken;
                    config.GOMERCH.REFRESH_TOKEN = state.refreshToken;
                }
                
                return true;
            }
            
            console.log(`❌ [GOMERCH] Refresh gagal:`, response.data);
            return false;
            
        } catch (error) {
            console.error(`❌ [GOMERCH] Refresh error:`, error.message);
            if (error.response) {
                console.error(`📊 Status: ${error.response.status}`);
                console.error(`📊 Data:`, JSON.stringify(error.response.data, null, 2));
            }
            return false;
        } finally {
            isRefreshing = false;
            refreshPromise = null;
        }
    })();
    
    return refreshPromise;
}

// ============================
// GENERATE QRIS GOMERCH
// ============================

const generateQRIS = async (amount, description = '') => {
    try {
        let cleanAmount = 0;
        if (typeof amount === 'number') {
            cleanAmount = amount;
        } else if (typeof amount === 'string') {
            const cleaned = amount.replace(/[^0-9]/g, '');
            cleanAmount = parseInt(cleaned) || 0;
        } else {
            cleanAmount = parseInt(amount) || 0;
        }

        if (cleanAmount <= 0) {
            console.error(`❌ [GOMERCH] Invalid amount: ${amount}`);
            return {
                success: false,
                method: 'GOMERCH',
                error: `Invalid amount: ${amount}. Harus berupa angka positif.`
            };
        }

        if (!GOMERCH_CONFIG.ENABLED) {
            throw new Error("GoMerch dinonaktifkan di config");
        }

        if (!state.accessToken || !state.merchantId) {
            throw new Error("Access token atau merchant ID kosong");
        }

        if (!GOMERCH_CONFIG.STATIC_QR || GOMERCH_CONFIG.STATIC_QR === 'YOUR_STATIC_QR_STRING_HERE') {
            throw new Error("Static QR belum diisi di config.js");
        }

        console.log(`💰 [GOMERCH] Generating QRIS for Rp${cleanAmount}`);
        console.log(`📝 [GOMERCH] Description: ${description || 'Sewa Bot KJS'}`);

        const { uniqueAmount, uniqueNumber } = generateUniqueAmount(cleanAmount);
        console.log(`🔄 [GOMERCH] Unique amount: ${uniqueAmount} (+${uniqueNumber})`);

        const payload = {
            amount: uniqueAmount,
            static_qr: GOMERCH_CONFIG.STATIC_QR
        };

        console.log(`📤 [GOMERCH] Payload:`, JSON.stringify(payload));

        const response = await apiPost('/gomerch/api/qris/generate', payload);

        console.log(`📊 [GOMERCH] Response:`, JSON.stringify(response, null, 2));

        if (response.success) {
            const data = response.data || response;
            const createdTime = Date.now();
            const expiryTime = createdTime + (15 * 60 * 1000);

            console.log(`✅ [GOMERCH] QRIS Generated!`);

            let imageData = null;
            let qrString = '';

            // 🔥 CEK ADA QR_STRING ATAU QR_URL
            if (data.qr_string) {
                qrString = data.qr_string;
                console.log(`🔄 [GOMERCH] QR String found: ${qrString.substring(0, 50)}...`);
            } else if (data.qr_url) {
                qrString = data.qr_url;
                console.log(`🔄 [GOMERCH] QR URL found: ${qrString}`);
            }

            // 🔥 GENERATE QR DARI QR STRING
            if (qrString && qrString.startsWith('000201')) {
                console.log(`🔄 [GOMERCH] Generating QR code from valid QRIS string...`);
                try {
                    const qrBuffer = await qr.toBuffer(qrString, {
                        type: 'png',
                        width: 400,
                        margin: 2,
                        errorCorrectionLevel: 'H'
                    });
                    imageData = `data:image/png;base64,${qrBuffer.toString('base64')}`;
                    console.log(`✅ [GOMERCH] QR code generated successfully!`);
                } catch (qrError) {
                    console.log(`❌ [GOMERCH] QR generation failed:`, qrError.message);
                }
            }

            // 🔥 FALLBACK: FETCH DARI QR_URL
            if (!imageData && data.qr_url) {
                console.log(`🔄 [GOMERCH] Trying to fetch QR image from qr_url...`);
                try {
                    const imgResponse = await axios.get(data.qr_url, {
                        responseType: 'arraybuffer',
                        timeout: 10000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                    const base64Data = Buffer.from(imgResponse.data, 'binary').toString('base64');
                    imageData = `data:image/png;base64,${base64Data}`;
                    console.log(`✅ [GOMERCH] QR image fetched from qr_url!`);
                } catch (fetchError) {
                    console.log(`❌ [GOMERCH] Failed to fetch from qr_url:`, fetchError.message);
                }
            }

            // 🔥 FALLBACK TERAKHIR: GENERATE DARI STATIC QR
            if (!imageData && GOMERCH_CONFIG.STATIC_QR) {
                console.log(`🔄 [GOMERCH] Fallback: Generating QR from static QR...`);
                try {
                    const qrBuffer = await qr.toBuffer(GOMERCH_CONFIG.STATIC_QR, {
                        type: 'png',
                        width: 400,
                        margin: 2,
                        errorCorrectionLevel: 'H'
                    });
                    imageData = `data:image/png;base64,${qrBuffer.toString('base64')}`;
                    console.log(`✅ [GOMERCH] QR generated from static QR fallback!`);
                } catch (qrError) {
                    console.log(`❌ [GOMERCH] Fallback QR generation failed:`, qrError.message);
                }
            }

            if (!imageData) {
                console.log(`❌ [GOMERCH] No QR data available!`);
                return {
                    success: false,
                    method: 'GOMERCH',
                    error: 'Tidak ada data QRIS dari GoMerch.'
                };
            }

            return {
                success: true,
                method: 'GOMERCH',
                transaction_id: data.transaction_id || data.order_id || `GOM-${Date.now()}`,
                order_id: data.order_id || `GOM-${Date.now()}`,
                amount: uniqueAmount,
                amount_original: cleanAmount,
                random_add: uniqueNumber,
                expiry_time: expiryTime,
                image_data: imageData,
                qr_url: data.qr_url,
                qr_string: qrString,
                merchant: 'GoMerch',
                created_at: createdTime,
                display: {
                    harga: uniqueAmount,
                    kode_unik: uniqueNumber,
                    total: uniqueAmount,
                }
            };
        }

        throw new Error(response.message || 'Gagal generate QRIS GoMerch');

    } catch (error) {
        console.error('❌ [GOMERCH] Error:', error.message);
        if (error.response) {
            console.error('📊 Status:', error.response.status);
            console.error('📊 Data:', JSON.stringify(error.response.data, null, 2));
        }
        return { 
            success: false, 
            method: 'GOMERCH', 
            error: error.message 
        };
    }
};

// ============================
// CEK STATUS GOMERCH
// ============================

const cekStatus = async (transactionId) => {
    try {
        if (!GOMERCH_CONFIG.ENABLED) {
            throw new Error("GoMerch dinonaktifkan di config");
        }

        if (!state.accessToken || !state.merchantId) {
            throw new Error("Access token atau merchant ID kosong");
        }

        console.log(`🔍 [GOMERCH] Checking status for ${transactionId}...`);

        const body = {
            access_token: state.accessToken,
            merchant_id: state.merchantId,
            ...getTodayRange()
        };

        try {
            const response = await apiPost('/gomerch/api/mutasi', body);

            console.log(`📊 [GOMERCH] Response:`, JSON.stringify(response, null, 2));

            if (response.success) {
                const transactions = response.data?.transactions || [];

                // 🔥 CARI TRANSAKSI YANG COCOK
                const match = transactions.find(t => {
                    const orderId = t.order_id || '';
                    const trxId = t.transaction_id || '';
                    return orderId.includes(transactionId) || trxId === transactionId;
                });

                if (match) {
                    const isSettled = match.transaction_status === 'SETTLEMENT' ||
                                     match.transaction_status === 'success' ||
                                     match.transaction_status === 'paid';

                    console.log(`📊 [GOMERCH] Status: ${match.transaction_status}`);

                    if (isSettled) {
                        console.log(`✅ [GOMERCH] Payment found!`);
                    }

                    return {
                        success: true,
                        status: match.transaction_status || 'pending',
                        method: 'GOMERCH',
                        brand: 'GOMERCH',
                        transaction: match,
                        matched: isSettled,
                        order_id: match.order_id,
                        amount: match.gross_amount || 0,
                        transaction_time: match.transaction_time
                    };
                }

                console.log(`📊 [GOMERCH] No matching transaction found`);
                return {
                    success: true,
                    status: 'pending',
                    method: 'GOMERCH',
                    matched: false,
                    message: 'Transaksi belum ditemukan'
                };
            }

            return {
                success: false,
                status: 'pending',
                method: 'GOMERCH',
                matched: false,
                error: response.message || 'Unknown error'
            };

        } catch (error) {
            // 🔥 ERROR HANDLING SUDAH DI API POST
            throw error;
        }

    } catch (error) {
        console.error('❌ [GOMERCH] Error:', error.message);
        return {
            success: false,
            status: 'pending',
            method: 'GOMERCH',
            matched: false,
            error: error.message
        };
    }
};

// ============================
// CEK STATUS DENGAN RETRY
// ============================

const cekStatusWithRetry = async (transactionId, maxRetry = 5) => {
    let lastError = null;

    for (let i = 0; i < maxRetry; i++) {
        console.log(`🔄 [GOMERCH] Cek status attempt ${i + 1}/${maxRetry}`);

        const result = await cekStatus(transactionId);

        if (result.success && result.matched) {
            return result;
        }

        if (result.status === 'settlement' || result.status === 'success' || result.status === 'paid') {
            result.matched = true;
            return result;
        }

        if (!result.success && i < maxRetry - 1) {
            const waitTime = 3000 * (i + 1);
            console.log(`⏳ [GOMERCH] Retry dalam ${waitTime}ms...`);
            await delay(waitTime);
        }

        lastError = result.error;
    }

    return {
        success: false,
        status: 'error',
        error: lastError || 'Max retry exceeded',
        method: 'GOMERCH'
    };
};

// ============================
// CEK MUTASI (UNTUK ADMIN)
// ============================

const getMutasi = async (startTime = null, endTime = null) => {
    try {
        if (!GOMERCH_CONFIG.ENABLED) {
            throw new Error("GoMerch dinonaktifkan di config");
        }

        if (!state.accessToken || !state.merchantId) {
            throw new Error("Access token atau merchant ID kosong");
        }

        const { start, end } = getTodayRange();
        const body = {
            access_token: state.accessToken,
            merchant_id: state.merchantId,
            start_time: startTime || start,
            end_time: endTime || end,
        };

        const response = await apiPost('/gomerch/api/mutasi', body);
        return response;

    } catch (error) {
        console.error('❌ [GOMERCH] Get mutasi error:', error.message);
        return { success: false, error: error.message };
    }
};

// ============================
// FORMAT RUPIAH
// ============================

const formatRupiah = (angka) => {
    if (!angka && angka !== 0) return '0';
    return new Intl.NumberFormat('id-ID').format(angka);
};

// ============================
// EXPORT
// ============================

module.exports = {
    generateQRIS,
    cekStatus,
    cekStatusWithRetry,
    getMutasi,
    refreshToken,
    formatRupiah,
    state
};