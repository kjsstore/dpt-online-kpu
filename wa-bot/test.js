const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Membuka browser...');
  
  const b = await chromium.launch({ 
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'id-ID',
  });
  
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  
  const p = await ctx.newPage();
  
  console.log('🌐 Membuka KPU...');
  await p.goto('https://cekdptonline.kpu.go.id/', { 
    waitUntil: 'domcontentloaded', 
    timeout: 30000 
  });
  
  console.log('⏳ Tunggu 10 detik biar render...');
  await p.waitForTimeout(10000);
  
  const text = await p.evaluate(() => document.body.innerText);
  
  console.log('');
  console.log('========================================');
  console.log('📊 HASIL:');
  console.log('========================================');
  console.log('Panjang text:', text.length, 'karakter');
  console.log('');
  console.log('Isi halaman (500 char pertama):');
  console.log('---');
  console.log(text.substring(0, 500));
  console.log('---');
  console.log('');
  
  if (text.length > 100 && text.includes('Pemilih')) {
    console.log('✅✅✅ BERHASIL! Halaman KPU terbuka!');
    console.log('   Laptop kamu BISA akses KPU.');
  } else if (text.length === 0) {
    console.log('❌ GAGAL: Halaman kosong (KPU blok).');
  } else {
    console.log('⚠️ Hasil tidak jelas. Lihat screenshot.');
  }
  
  await p.screenshot({ path: 'hasil-kpu.png', fullPage: true });
  console.log('');
  console.log('📸 Screenshot disimpan: hasil-kpu.png');
  
  console.log('');
  console.log('Tutup browser dalam 30 detik...');
  await p.waitForTimeout(30000);
  
  await b.close();
  console.log('Selesai.');
})();