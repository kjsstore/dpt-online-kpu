const a = require('./payment_autogopay');
console.log('Methods:', Object.keys(a));
a.generateQRIS(10000, 'Test Topup').then(r => {
    console.log('Success:', r.success);
    console.log('Error:', r.error);
    console.log('Transaction ID:', r.transaction_id);
    console.log('Has Image:', !!r.image_data);
}).catch(e => console.log('Exception:', e.message));
