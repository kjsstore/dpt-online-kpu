// payment.js - HANYA AUTOGOPAY

const autogopay = require('./payment_autogopay.js');
const config = require('./config');

// ============================
// 🔥 KONFIGURASI
// ============================
const TOPUP_CONFIG = config.TOPUP || {};

// ============================
// 🔥 PILIH METODE PEMBAYARAN
// ============================

const getPaymentMethod = (method = 'AUTOGOPAY') => {
    return {
        name: 'AUTOGOPAY',
        generate: autogopay.generateQRIS,
        cek: autogopay.cekStatus,
        cekRetry: autogopay.cekStatusWithRetry
    };
};

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

        console.log(`💰 [PAYMENT] Generating QRIS for Rp${cleanAmount} via AUTOGOPAY`);
        console.log(`📝 [PAYMENT] Description: ${description || 'Sewa Bot KJS'}`);

        const result = await generateQRISWithMethod(cleanAmount, description, 'AUTOGOPAY');
        return result;

    } catch (error) {
        console.error('❌ [PAYMENT] Error:', error.message);
        return { success: false, error: error.message };
    }
};

// ============================
// 🔥 GENERATE QRIS SPECIFIC METHOD
// ============================

const generateQRISWithMethod = async (amount, description, method) => {
    try {
        const paymentMethod = getPaymentMethod(method);
        const result = await paymentMethod.generate(amount, description || 'Sewa Bot KJS');

        if (result.success) {
            console.log(`✅ [PAYMENT] ${method} success: ${result.transaction_id}`);
            return result;
        }

        return result;
    } catch (error) {
        console.error(`❌ [PAYMENT] ${method} error:`, error.message);
        return { success: false, error: error.message };
    }
};

// ============================
// 🔥 GENERATE QRIS AUTOGOPAY (EXPORT)
// ============================

const generateQRISAutogopay = async (amount, description = '') => {
    return generateQRISWithMethod(amount, description, 'AUTOGOPAY');
};

// ============================
// 🔥 CEK STATUS
// ============================

const cekStatusDual = async (transactionId, amount, method, startTime = null) => {
    console.log(`🔍 [PAYMENT] Checking: ${transactionId} via AUTOGOPAY`);

    try {
        const paymentMethod = getPaymentMethod('AUTOGOPAY');
        const result = await paymentMethod.cek(transactionId);

        if (result.success && result.matched) {
            console.log(`✅ [PAYMENT] Payment found via ${paymentMethod.name}!`);
        }

        return {
            ...result,
            method: paymentMethod.name,
            source: paymentMethod.name.toLowerCase()
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

// ============================
// 🔥 CEK STATUS AUTOGOPAY
// ============================

const cekStatusAutogopay = async (transactionId) => {
    return autogopay.cekStatus(transactionId);
};

// ============================
// 🔥 CEK STATUS DENGAN RETRY
// ============================

const cekStatusDualWithRetry = async (transactionId, amount, method, startTime = null, maxRetry = 3) => {
    let lastResult = null;

    for (let i = 0; i < maxRetry; i++) {
        console.log(`🔄 [PAYMENT] Check attempt ${i + 1}/${maxRetry} via AUTOGOPAY`);

        const result = await cekStatusDual(transactionId, amount, 'AUTOGOPAY', startTime);
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
    METHODS: {
        AUTOGOPAY: 'AUTOGOPAY'
    }
};