// ============================================================
// 📁 function/payment.js - PAYMENT WRAPPER
// 🔥 VERSION 1.0 - WRAPPER UNTUK AUTOGOPAY
// ============================================================

const autogopay = require('./payment_autogopay.js');
const config = require('../config');

// ============================
// 🔥 KONFIGURASI
// ============================
const TOPUP_CONFIG = config.TOPUP || {};

// ============================
// 🔥 GENERATE QRIS
// ============================
const generateQRIS = async (amount, description = '') => {
    try {
        const cleanAmount = parseInt(amount) || 0;
        if (cleanAmount <= 0) {
            console.error(`❌ [PAYMENT] Invalid amount: ${amount}`);
            return { success: false, error: `Invalid amount: ${amount}` };
        }
        
        console.log(`💰 [PAYMENT] Generating QRIS for Rp${cleanAmount}`);
        console.log(`📝 [PAYMENT] Description: ${description || 'Sewa Bot KJS'}`);
        
        const result = await autogopay.generateQRIS(cleanAmount, description || 'Sewa Bot KJS');
        
        if (result.success) {
            console.log(`✅ [PAYMENT] AutoGopay success: ${result.transaction_id}`);
            return result;
        }
        
        return result;
    } catch (error) {
        console.error('❌ [PAYMENT] Error:', error.message);
        return { success: false, error: error.message };
    }
};

const generateQRISAutogopay = async (amount, description = '') => {
    const cleanAmount = parseInt(amount) || 0;
    if (cleanAmount <= 0) {
        return { success: false, error: `Invalid amount: ${amount}` };
    }
    return autogopay.generateQRIS(cleanAmount, description);
};

// ============================
// 🔥 CEK STATUS
// ============================
const cekStatusDual = async (transactionId, amount, method, startTime = null) => {
    console.log(`🔍 [PAYMENT] Checking: ${transactionId}`);
    
    try {
        const result = await autogopay.cekStatus(transactionId);
        
        if (result.success && result.matched) {
            console.log(`✅ [PAYMENT] Payment found!`);
        }
        
        return {
            ...result,
            method: 'AUTOGOPAY',
            source: 'autogopay'
        };
    } catch (err) {
        console.error('❌ [PAYMENT] Error:', err.message);
        return {
            success: false,
            status: 'error',
            error: err.message,
            method: 'AUTOGOPAY'
        };
    }
};

const cekStatusAutogopay = async (transactionId) => {
    return autogopay.cekStatus(transactionId);
};

// ============================
// 🔥 CEK STATUS DENGAN RETRY
// ============================
const cekStatusDualWithRetry = async (transactionId, amount, method, startTime = null, maxRetry = 3) => {
    let lastResult = null;
    
    for (let i = 0; i < maxRetry; i++) {
        console.log(`🔄 [PAYMENT] Check attempt ${i + 1}/${maxRetry}`);
        
        const result = await cekStatusDual(transactionId, amount, method, startTime);
        lastResult = result;
        
        if (result.success && result.matched) {
            return result;
        }
        
        if (i < maxRetry - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    return lastResult || {
        success: false,
        status: 'error',
        error: 'Max retry exceeded',
        method: 'AUTOGOPAY'
    };
};

// ============================
// 🔥 GET STATUS
// ============================
const getStatus = () => ({
    autogopay: {
        available: true,
        source: 'payment_autogopay'
    },
    environment: process.env.NODE_ENV || 'development'
});

// ============================
// 🔥 EXPORT
// ============================
module.exports = {
    generateQRIS,
    generateQRISAutogopay,
    cekStatusDual,
    cekStatusAutogopay,
    cekStatusDualWithRetry,
    getStatus,
};