// ==========================================
// 🔥 EXCEL BUILDER — Keren dengan Style
// ==========================================

const ExcelJS = require('exceljs');

async function buildExcel(results, outputPath) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'KJS-BOT';
    wb.created = new Date();

    const ws = wb.addWorksheet('Hasil Cek DPT', {
        views: [{ state: 'frozen', ySplit: 1 }]
    });

    ws.columns = [
        { header: 'No', key: 'no', width: 5 },
        { header: 'NIK', key: 'nik', width: 20 },
        { header: 'Nama', key: 'nama', width: 25 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Provinsi', key: 'provinsi', width: 30 },
        { header: 'Kabupaten/Kota', key: 'kabupaten', width: 25 },
        { header: 'Kecamatan', key: 'kecamatan', width: 20 },
        { header: 'Kelurahan/Desa', key: 'kelurahan', width: 20 },
        { header: 'Wilayah', key: 'wilayah', width: 40 },
        { header: 'Tanggal Pengecekan', key: 'tanggal', width: 28 },
        { header: 'Validasi', key: 'validasi', width: 15 },
        { header: 'Status Cek', key: 'statusCek', width: 15 },
        { header: 'Error', key: 'error', width: 20 },
    ];

    // Header style
    const headerRow = ws.getRow(1);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' },
            bottom: { style: 'thin' }, right: { style: 'thin' }
        };
    });

    // Data
    results.forEach((r, idx) => {
        const d = r.data || {};
        let statusCek;
        if (r.status === 'success') statusCek = 'BERHASIL';
        else if (r.status === 'not_registered') statusCek = 'TIDAK TERDAFTAR';
        else if (r.status === 'otp_mismatch') statusCek = 'OTP SALAH';
else if (r.status === 'timeout') statusCek = 'TIMEOUT SERVER';
    else if (r.status === 'invalid_format') statusCek = 'NIK TIDAK VALID';
    else statusCek = 'GAGAL';

        ws.addRow({
            no: idx + 1,
            nik: r.nik || '-',
            nama: d.nama || '-',
            status: d.status || '-',
            provinsi: d.provinsi || '-',
            kabupaten: d.kabupaten || '-',
            kecamatan: d.kecamatan || '-',
            kelurahan: d.kelurahan || '-',
            wilayah: d.wilayah || '-',
            tanggal: d.tanggal || '-',
            validasi: d.validasi || '-',
            statusCek: statusCek,
            error: r.error || '-',
        });
    });

    // Style tiap baris
    ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.height = 20;
        row.eachCell((cell, colNumber) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'left' };

            if (colNumber === 2) {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.numFmt = '@';
            }

            if (colNumber === 1) {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            }

            // Status: hijau/merah
            if (colNumber === 4) {
                const val = String(cell.value || '').toUpperCase();
                if (val.includes('TERDAFTAR') && !val.includes('TIDAK')) {
                    cell.font = { color: { argb: 'FF008000' }, bold: true };
                } else if (val.includes('TIDAK TERDAFTAR')) {
                    cell.font = { color: { argb: 'FFCC0000' }, bold: true };
                }
            }

            // Status Cek: hijau/kuning/merah + background
            if (colNumber === 12) {
                const val = String(cell.value || '').toUpperCase();
                if (val === 'BERHASIL') {
                    cell.font = { color: { argb: 'FF008000' }, bold: true };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
                } else if (val === 'TIDAK TERDAFTAR') {
                    cell.font = { color: { argb: 'FFFF8C00' }, bold: true };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
                } else {
                    cell.font = { color: { argb: 'FFCC0000' }, bold: true };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4E4' } };
                }
            }

            // Validasi: hijau/merah
            if (colNumber === 11) {
                const val = String(cell.value || '').toUpperCase();
                if (val === 'DATA VALID') {
                    cell.font = { color: { argb: 'FF008000' }, bold: true };
                } else if (val.includes('TIDAK VALID')) {
                    cell.font = { color: { argb: 'FFCC0000' }, bold: true };
                }
            }
        });
    });

    ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 13 }
    };

    await wb.xlsx.writeFile(outputPath);
    console.log(`📊 [EXCEL] File tersimpan: ${outputPath}`);
    return outputPath;
}

module.exports = { buildExcel };