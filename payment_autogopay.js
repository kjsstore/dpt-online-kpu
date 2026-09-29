// payment_autogopay.js - AUTOGOPAY DENGAN QR CODE GENERATOR

const axios = require('axios');
const config = require('./config');
const qr = require('qrcode');

const AUTOGOPAY_CONFIG = config.AUTOGOPAY || {};

// ============================
// 🔥 HELPER: PARSE AMOUNT
// ============================
const parseAmount = (amount) => {
    if (typeof amount === 'number') return Math.floor(amount);
    if (typeof amount === 'string') {
        const cleaned = amount.replace(/[^0-9]/g, '');
        return parseInt(cleaned) || 0;
    }
    return parseInt(amount) || 0;
};

// ============================
// 🔥 GENERATE QRIS AUTOGOPAY
// ============================
const generateQRIS = async (amount, description = '') => {
    try {
        const cleanAmount = parseAmount(amount);

        if (cleanAmount <= 0) {
            console.error(`❌ [AUTOGOPAY] Invalid amount: ${amount} (type: ${typeof amount})`);
            return {
                success: false,
                method: 'AUTOGOPAY',
                error: `Invalid amount: ${amount}. Harus berupa angka positif.`
            };
        }

        console.log(`💰 [AUTOGOPAY] Generating QRIS for Rp${cleanAmount}`);
        console.log(`📝 [AUTOGOPAY] Description: ${description || 'Sewa Bot KJS'}`);

        if (!AUTOGOPAY_CONFIG.ENABLED) {
            throw new Error('AutoGoPay dinonaktifkan di config');
        }

        const payload = {
            amount: cleanAmount,
            description: description || 'Sewa Bot KJS'
        };

        console.log(`📤 [AUTOGOPAY] Payload:`, JSON.stringify(payload));

        const response = await axios.post(
            `${AUTOGOPAY_CONFIG.API_URL}/qris/generate`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${AUTOGOPAY_CONFIG.API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: AUTOGOPAY_CONFIG.TIMEOUT || 30000
            }
        );

        console.log(`📊 [AUTOGOPAY] Response status: ${response.status}`);

        if (!response.data?.success) {
            throw new Error(response.data?.message || 'Gagal generate QRIS AutoGoPay');
        }

        const data = response.data.data;
        const createdTime = Date.now();

        console.log(`✅ [AUTOGOPAY] QRIS Generated! ID: ${data.transaction_id}`);

        // 🔥 GENERATE QR IMAGE
        let imageData = null;

        // Prioritas 1: generate dari qr_string
        if (data.qr_string) {
            console.log(`🔄 [AUTOGOPAY] Generating QR from qr_string...`);
            try {
                const qrBuffer = await qr.toBuffer(data.qr_string, {
                    type: 'png',
                    width: 400,
                    margin: 2
                });
                imageData = `data:image/png;base64,${qrBuffer.toString('base64')}`;
                console.log(`✅ [AUTOGOPAY] QR generated from qr_string`);
            } catch (qrError) {
                console.log(`❌ [AUTOGOPAY] QR generation failed:`, qrError.message);
            }
        }

        // Prioritas 2: fetch dari qr_url
        if (!imageData && data.qr_url) {
            console.log(`🔄 [AUTOGOPAY] Fetching from qr_url...`);
            try {
                const imgResponse = await axios.get(data.qr_url, {
                    responseType: 'arraybuffer',
                    timeout: 10000
                });
                const base64Data = Buffer.from(imgResponse.data, 'binary').toString('base64');
                imageData = `data:image/png;base64,${base64Data}`;
                console.log(`✅ [AUTOGOPAY] QR fetched from qr_url`);
            } catch (fetchError) {
                console.log(`❌ [AUTOGOPAY] Failed fetch qr_url:`, fetchError.message);
            }
        }

        if (!imageData) {
            console.log(`❌ [AUTOGOPAY] No QR data available!`);
            return {
                success: false,
                method: 'AUTOGOPAY',
                error: 'Tidak ada data QRIS dari AutoGoPay.'
            };
        }

        const finalAmount = Number(data.amount) || cleanAmount;

        return {
            success: true,
            method: 'AUTOGOPAY',
            transaction_id: data.transaction_id,
            order_id: data.order_id,
            amount: finalAmount,
            amount_original: finalAmount,
            random_add: 0,
            expiry_time: data.expiry_time
                ? new Date(data.expiry_time).getTime()
                : Date.now() + (15 * 60 * 1000),
            image_data: imageData,
            qr_string: data.qr_string,
            qr_url: data.qr_url,
            merchant: data.merchant || 'AutoGoPay',
            created_at: createdTime,
            display: {
                harga: finalAmount,
                kode_unik: 0,
                total: finalAmount
            }
        };

    } catch (error) {
        console.error('❌ [AUTOGOPAY] Error:', error.message);
        if (error.response) {
            console.error('📊 Status:', error.response.status);
            console.error('📊 Data:', JSON.stringify(error.response.data, null, 2));
        }
        return { success: false, method: 'AUTOGOPAY', error: error.message };
    }
};

// ============================
// 🔥 CEK STATUS AUTOGOPAY
// ============================
const cekStatus = async (transactionId) => {
    try {
        if (!AUTOGOPAY_CONFIG.ENABLED) {
            throw new Error('AutoGoPay dinonaktifkan di config');
        }

        if (!transactionId) {
            return {
                success: false,
                status: 'pending',
                method: 'AUTOGOPAY',
                matched: false,
                error: 'transactionId kosong'
            };
        }

        console.log(`🔍 [AUTOGOPAY] Checking status for ${transactionId}...`);

        const response = await axios.post(
            `${AUTOGOPAY_CONFIG.API_URL}/qris/status`,
            { transaction_id: transactionId },
            {
                headers: {
                    'Authorization': `Bearer ${AUTOGOPAY_CONFIG.API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: AUTOGOPAY_CONFIG.TIMEOUT || 10000
            }
        );

        console.log(`📊 [AUTOGOPAY] Response:`, JSON.stringify(response.data));

        if (!response.data?.success) {
            return {
                success: false,
                status: 'pending',
                method: 'AUTOGOPAY',
                matched: false,
                error: response.data?.message || 'Unknown error'
            };
        }

        const status = response.data.data?.transaction_status || 'pending';
        const isSettlement = ['settlement', 'success', 'paid'].includes(status);

        console.log(`📊 [AUTOGOPAY] Status: ${status}`);

        if (isSettlement) {
            console.log(`✅ [AUTOGOPAY] Payment found!`);
        }

        return {
            success: true,
            status,
            method: 'AUTOGOPAY',
            brand: 'AUTOGOPAY',
            transaction: response.data.data,
            matched: isSettlement
        };

    } catch (error) {
        console.error('❌ [AUTOGOPAY] Error:', error.message);
        return {
            success: false,
            status: 'pending',
            method: 'AUTOGOPAY',
            matched: false,
            error: error.message
        };
    }
};

// ============================
// 🔥 CEK STATUS DENGAN RETRY
// ============================
const cekStatusWithRetry = async (transactionId, maxRetry = 5) => {
    let lastError = null;

    for (let i = 0; i < maxRetry; i++) {
        console.log(`🔄 [AUTOGOPAY] Cek status attempt ${i + 1}/${maxRetry}`);

        const result = await cekStatus(transactionId);

        if (result.success && result.matched) {
            return result;
        }

        if (['settlement', 'success', 'paid'].includes(result.status)) {
            result.matched = true;
            result.success = true;
            return result;
        }

        lastError = result.error || lastError;

        if (i < maxRetry - 1) {
            const waitTime = 3000 * (i + 1);
            console.log(`⏳ [AUTOGOPAY] Retry dalam ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }

    return {
        success: false,
        status: 'error',
        error: lastError || 'Max retry exceeded',
        method: 'AUTOGOPAY',
        matched: false
    };
};

module.exports = {
    generateQRIS,
    cekStatus,
    cekStatusWithRetry,
};