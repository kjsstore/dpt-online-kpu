// ============================================================
// 📁 function/payment_autogopay.js - AUTOGOPAY QRIS
// 🔥 VERSION 1.0 - QR CODE GENERATOR
// ============================================================

const axios = require('axios');
const config = require('../config');
const qr = require('qrcode');

const AUTOGOPAY_CONFIG = config.AUTOGOPAY || {};

// ============================
// GENERATE QRIS AUTOGOPAY
// ============================
const generateQRIS = async (amount, description = '') => {
    try {
        // 🔥🔥🔥 VALIDASI AMOUNT - PASTIKAN ANGKA
        let cleanAmount = 0;
        
        // 🔥 CEK TIPE DATA
        if (typeof amount === 'number') {
            cleanAmount = amount;
        } else if (typeof amount === 'string') {
            // Hapus semua karakter non-digit
            const cleaned = amount.replace(/[^0-9]/g, '');
            cleanAmount = parseInt(cleaned) || 0;
        } else {
            cleanAmount = parseInt(amount) || 0;
        }
        
        // 🔥 CEK APAKAH AMOUNT VALID
        if (cleanAmount <= 0) {
            console.error(`❌ [AUTOGOPAY] Invalid amount: ${amount} (type: ${typeof amount})`);
            console.error(`📝 [AUTOGOPAY] Description: ${description}`);
            return { 
                success: false, 
                method: 'AUTOGOPAY', 
                error: `Invalid amount: ${amount}. Harus berupa angka positif.` 
            };
        }
        
        console.log(`💰 [AUTOGOPAY] Generating QRIS for Rp${cleanAmount}`);
        console.log(`📝 [AUTOGOPAY] Description: ${description || 'Sewa Bot KJS'}`);
        
        if (!AUTOGOPAY_CONFIG.ENABLED) {
            throw new Error("AutoGoPay dinonaktifkan di config");
        }
        
        // 🔥 PAYLOAD DENGAN AMOUNT ANGKA
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
        console.log(`📊 [AUTOGOPAY] Response data:`, JSON.stringify(response.data, null, 2));
        
        if (response.data?.success) {
            const data = response.data.data;
            const createdTime = Date.now();
            
            console.log(`✅ [AUTOGOPAY] QRIS Generated! ID: ${data.transaction_id}`);
            
            let imageData = null;
            
            if (data.qr_string) {
                console.log(`🔄 [AUTOGOPAY] Generating QR code from qr_string...`);
                try {
                    const qrBuffer = await qr.toBuffer(data.qr_string, { 
                        type: 'png', 
                        width: 400,
                        margin: 2
                    });
                    imageData = `data:image/png;base64,${qrBuffer.toString('base64')}`;
                    console.log(`✅ [AUTOGOPAY] QR code generated!`);
                } catch (qrError) {
                    console.log(`❌ [AUTOGOPAY] QR generation failed:`, qrError.message);
                }
            }
            
            if (!imageData && data.qr_url) {
                console.log(`🔄 [AUTOGOPAY] Trying to fetch from qr_url...`);
                try {
                    const imgResponse = await axios.get(data.qr_url, {
                        responseType: 'arraybuffer',
                        timeout: 10000
                    });
                    const base64Data = Buffer.from(imgResponse.data, 'binary').toString('base64');
                    imageData = `data:image/png;base64,${base64Data}`;
                    console.log(`✅ [AUTOGOPAY] QR code fetched from qr_url!`);
                } catch (fetchError) {
                    console.log(`❌ [AUTOGOPAY] Failed to fetch from qr_url:`, fetchError.message);
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
            
            return {
                success: true,
                method: 'AUTOGOPAY',
                transaction_id: data.transaction_id,
                order_id: data.order_id,
                amount: data.amount || cleanAmount,
                amount_original: data.amount || cleanAmount,
                random_add: 0,
                expiry_time: data.expiry_time ? new Date(data.expiry_time).getTime() : Date.now() + (15 * 60 * 1000),
                image_data: imageData,
                qr_string: data.qr_string,
                qr_url: data.qr_url,
                merchant: data.merchant || 'AutoGoPay',
                created_at: createdTime,
                display: {
                    harga: data.amount || cleanAmount,
                    kode_unik: 0,
                    total: data.amount || cleanAmount,
                }
            };
        }
        throw new Error(response.data?.message || 'Gagal generate QRIS AutoGoPay');
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
// CEK STATUS AUTOGOPAY
// ============================
const cekStatus = async (transactionId) => {
    try {
        if (!AUTOGOPAY_CONFIG.ENABLED) {
            throw new Error("AutoGoPay dinonaktifkan di config");
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
        
        console.log(`📊 [AUTOGOPAY] Response:`, JSON.stringify(response.data, null, 2));
        
        if (response.data?.success) {
            const status = response.data.data?.transaction_status || 'pending';
            const isSettlement = status === 'settlement' || status === 'success' || status === 'paid';
            
            console.log(`📊 [AUTOGOPAY] Status: ${status}`);
            
            if (isSettlement) {
                console.log(`✅ [AUTOGOPAY] Payment found!`);
            }
            
            return {
                success: true,
                status: status,
                method: 'AUTOGOPAY',
                brand: 'AUTOGOPAY',
                transaction: response.data.data,
                matched: isSettlement,
            };
        }
        return { 
            success: false, 
            status: 'pending', 
            method: 'AUTOGOPAY',
            matched: false,
            error: response.data?.message || 'Unknown error'
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
// CEK STATUS DENGAN RETRY
// ============================
const cekStatusWithRetry = async (transactionId, maxRetry = 5) => {
    let lastError = null;
    
    for (let i = 0; i < maxRetry; i++) {
        console.log(`🔄 [AUTOGOPAY] Cek status attempt ${i + 1}/${maxRetry}`);
        
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
            console.log(`⏳ [AUTOGOPAY] Retry dalam ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        lastError = result.error;
    }
    
    return { 
        success: false, 
        status: 'error', 
        error: lastError || 'Max retry exceeded',
        method: 'AUTOGOPAY' 
    };
};

module.exports = {
    generateQRIS,
    cekStatus,
    cekStatusWithRetry,
};