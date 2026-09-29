// ============================================================
// WEB-NIK.JS — Web cek NIK (satuan + massal) 1 server
// Port dari config.js → PORTS.WEB_NIK
// ============================================================

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require('multer');

const config = require("./config.js");
const PORT = process.env.WEB_NIK_PORT || config.PORTS?.WEB_NIK || 3007;
const OWNER_ID = String(config.BOT?.OWNER_ID || "").trim();

const cekSewa = require("./cek_sewa.js");
const freeQuota = require("./free_quota.js");
const webToken = require("./web_token.js");
const batchManager = require("./batch_manager.js");

const app = express();

// ============================
// HELPER: CEK OWNER
// ============================
function isOwner(userId) {
    return String(userId).trim() === OWNER_ID;
}

// ============================
// MIDDLEWARE
// ============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

// Static folder untuk UI
app.use(express.static(path.join(__dirname, "public-nik")));

// ============================
// MULTER (batch upload)
// ============================
const upload = multer({
    dest: batchManager.TEMP_DIR,
    limits: { fileSize: batchManager.MAX_FILE_SIZE }
});

// ============================
// API: AUTH TOKEN
// ============================
app.get("/api/auth/:token", (req, res) => {
    try {
        const token = String(req.params.token).trim();
        const tokenData = webToken.validateToken(token);

        if (!tokenData) {
            return res.json({
                success: false,
                reason: "INVALID_TOKEN",
                message: "❌ Token tidak valid atau sudah expired.\n\n📌 Buka ulang dari bot Telegram."
            });
        }

        const userId = tokenData.userId;
        const isOwnerUser = isOwner(userId);

        if (isOwnerUser) {
            return res.json({
                success: true,
                userId,
                isOwner: true,
                allowed: true,
                userInfo: {
                    username: "Owner",
                    status: "OWNER",
                    quota: null
                },
                message: "👑 Owner Mode - UNLIMITED"
            });
        }

        const sewaStatus = cekSewa.checkSewaStatus(userId);
        if (!sewaStatus.allowed) {
            return res.json({
                success: false,
                reason: sewaStatus.reason,
                message: sewaStatus.message
            });
        }

        const quota = freeQuota.getFreeQuota(userId);

        res.json({
            success: true,
            userId,
            isOwner: false,
            allowed: true,
            userInfo: {
                username: sewaStatus.info?.username || '-',
                status: "RESELLER",
                quota: quota,
                expired_date: sewaStatus.info?.expired_date || '-'
            },
            message: "✅ User Sewa Aktif"
        });

    } catch (err) {
        console.error("❌ /api/auth error:", err.message);
        res.json({
            success: false,
            reason: "SERVER_ERROR",
            message: "🔧 SERVER SEDANG MAINTENANCE"
        });
    }
});

// ============================
// API: NIK TO HP (SATUAN)
// ============================
app.post("/api/nik-to-hp", async (req, res) => {
    try {
        const { token, nik } = req.body;

        if (!token || !nik) {
            return res.json({ success: false, message: "❌ Token dan NIK harus diisi" });
        }

        const cleanNik = String(nik).trim();

        const tokenData = webToken.validateToken(token);
        if (!tokenData) {
            return res.json({
                success: false,
                reason: "INVALID_TOKEN",
                message: "❌ Token tidak valid atau sudah expired.\n\n📌 Buka ulang dari bot Telegram."
            });
        }

        const userId = tokenData.userId;
        const isOwnerUser = isOwner(userId);

        if (!isOwnerUser) {
            const sewaStatus = cekSewa.checkSewaStatus(userId);
            if (!sewaStatus.allowed) {
                return res.json({
                    success: false,
                    reason: sewaStatus.reason,
                    message: sewaStatus.message
                });
            }
        }

        let quota = null;
        if (!isOwnerUser) {
            quota = freeQuota.getFreeQuota(userId);
            if (quota.remaining <= 0) {
                return res.json({
                    success: false,
                    reason: "QUOTA_HABIS",
                    message: `❌ Free harian habis (${quota.used}/${quota.max}).\n\n📌 Coba lagi besok.`,
                    quota
                });
            }
        }

        if (!/^\d{16}$/.test(cleanNik)) {
            return res.json({
                success: false,
                message: "❌ NIK harus 16 digit angka\n📝 Contoh: 3328044510990008"
            });
        }

        let nikModule;
        try {
            nikModule = require("./nik_web.js");
        } catch (e) {
            return res.json({
                success: false,
                reason: "SERVER_ERROR",
                message: "🔧 SERVER SEDANG MAINTENANCE"
            });
        }

        const result = await nikModule.cekNikDenganAPI(cleanNik);

        if (!result.success || !result.data || result.data.length === 0) {
            const errorMsg = result.message || '';
            const isNotFound = errorMsg.includes('No results found') ||
                              errorMsg.includes('not found') ||
                              errorMsg.includes('tidak ditemukan') ||
                              errorMsg.includes('No data found') ||
                              errorMsg.includes('No phone numbers found');

            if (isNotFound) {
                return res.json({
                    success: false,
                    reason: "NOT_FOUND",
                    message: "📌 PENCARIAN NOMOR GA DITEMUKAN\n📌 DATABASE KOSONG",
                    quota
                });
            }

            return res.json({
                success: false,
                reason: "SERVER_ERROR",
                message: "🔧 SERVER SEDANG MAINTENANCE"
            });
        }

        if (!isOwnerUser) {
            freeQuota.useFreeQuota(userId);
            quota = freeQuota.getFreeQuota(userId);
        }

        const formatted = nikModule.formatHasilData(result.data, cleanNik);

        res.json({
            success: true,
            nik: cleanNik,
            data: result.data,
            sources: result.sources || [],
            formatted,
            quota,
            isOwner: isOwnerUser,
            message: isOwnerUser ? "👑 Owner Mode - UNLIMITED" : "✅ BERHASIL"
        });

    } catch (err) {
        console.error("❌ /api/nik-to-hp error:", err.message);
        res.json({
            success: false,
            reason: "SERVER_ERROR",
            message: "🔧 SERVER SEDANG MAINTENANCE"
        });
    }
});

// ============================
// API: BATCH (MASSAL)
// ============================

// Kuota batch
app.get("/api/batch/quota/:userId", (req, res) => {
    res.json({ success: true, quota: batchManager.getBatchQuota(req.params.userId) });
});

// Start batch
app.post('/api/batch/start', upload.single('file'), async (req, res) => {
    try {
        const token = String(req.body.token || '').trim();
        if (!token) return res.json({ success: false, message: '❌ Token tidak valid' });
        if (!req.file) return res.json({ success: false, message: '❌ File tidak ditemukan' });

        const tokenData = webToken.validateToken(token);
        if (!tokenData) {
            try { fs.unlinkSync(req.file.path); } catch {}
            return res.json({
                success: false,
                reason: 'INVALID_TOKEN',
                message: '❌ Token expired. Buka ulang dari bot Telegram.'
            });
        }

        const userId = tokenData.userId;
        const isOwnerUser = isOwner(userId);

        if (!isOwnerUser) {
            const sewaStatus = cekSewa.checkSewaStatus(userId);
            if (!sewaStatus.allowed) {
                try { fs.unlinkSync(req.file.path); } catch {}
                return res.json({
                    success: false,
                    reason: sewaStatus.reason,
                    message: sewaStatus.message
                });
            }
        }

        const quotaBefore = batchManager.getBatchQuota(userId);

        // Rename file temp sesuai ekstensi asli (opsional, untuk keamanan)
const originalName = String(req.body.filename || req.file.originalname || '');
const originalExt = path.extname(originalName).toLowerCase();
console.log(`📁 [BATCH] Upload: ${originalName} | ext: "${originalExt}" | path: ${req.file.path}`);

if (originalExt && !req.file.path.toLowerCase().endsWith(originalExt)) {
    const newPath = req.file.path + originalExt;
    try {
        fs.renameSync(req.file.path, newPath);
        req.file.path = newPath;
        console.log(`✅ [BATCH] Renamed: ${newPath}`);
    } catch (e) {
        console.error(`⚠️ [BATCH] Gagal rename: ${e.message}`);
    }
}

let nikList;
try {
    nikList = batchManager.extractNikFromFile(req.file.path);
} catch (e) {
    try { fs.unlinkSync(req.file.path); } catch {}
    console.error(`❌ [BATCH] Extract error: ${e.message}`);
    return res.json({ success: false, message: '❌ ' + e.message });
}
        try { fs.unlinkSync(req.file.path); } catch {}

        if (nikList.length === 0) {
            return res.json({ success: false, message: '❌ Tidak ada NIK 16 digit ditemukan di file' });
        }
        if (nikList.length > batchManager.MAX_NIK_PER_BATCH) {
            return res.json({
                success: false,
                message: `❌ Maksimal ${batchManager.MAX_NIK_PER_BATCH} NIK per batch. File kamu: ${nikList.length} NIK`
            });
        }

        if (!isOwnerUser && quotaBefore.remaining <= 0) {
            return res.json({
                success: false,
                reason: 'QUOTA_HABIS',
                message: `❌ Kuota harian habis (${quotaBefore.used}/${quotaBefore.max}). Reset besok.`,
                quota: quotaBefore
            });
        }

        let finalList = nikList;
        let truncated = false;
        if (!isOwnerUser && nikList.length > quotaBefore.remaining) {
            finalList = nikList.slice(0, quotaBefore.remaining);
            truncated = true;
        }

        const job = batchManager.createJob({ userId, nikList: finalList, isOwnerUser });
        batchManager.runBatchJob(job.jobId);

        res.json({
            success: true,
            jobId: job.jobId,
            total: finalList.length,
            truncated,
            originalTotal: nikList.length,
            quota: quotaBefore,
            message: '✅ Job dimulai'
        });

    } catch (err) {
        console.error('❌ /api/batch/start error:', err);
        res.json({ success: false, message: '❌ Server error: ' + err.message });
    }
});

// SSE stream
app.get('/api/batch/stream/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = batchManager.getJob(jobId);

    if (!job) {
        res.status(404).json({ success: false, message: 'Job tidak ditemukan' });
        return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    res.write(`event: init\ndata: ${JSON.stringify({
        jobId,
        total: job.nikList.length,
        status: job.status,
        sukses: job.sukses,
        gagal: job.gagal
    })}\n\n`);

    batchManager.sseRegister(jobId, res);

    const hb = setInterval(() => {
        try { res.write(': ping\n\n'); } catch {}
    }, 15000);

    req.on('close', () => {
        clearInterval(hb);
        batchManager.sseUnregister(jobId, res);
    });
});

// Download hasil
app.get('/api/batch/download/:jobId', (req, res) => {
    const job = batchManager.getJob(req.params.jobId);
    if (!job || !job.outputPath || !fs.existsSync(job.outputPath)) {
        return res.status(404).json({ success: false, message: 'File hasil tidak ditemukan' });
    }
    res.download(job.outputPath, 'hasil_cek_nik.xlsx');
});

// Cancel
app.post('/api/batch/cancel/:jobId', (req, res) => {
    const { userId } = req.body;
    const ok = batchManager.cancelJob(req.params.jobId, userId);
    res.json({ success: ok });
});

// ============================
// 404
// ============================
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint tidak ditemukan' });
});

// ============================
// START
// ============================
app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Web NIK jalan di port ${PORT}`);
    console.log(`🌐 Dashboard: http://localhost:${PORT}`);
    console.log(`👑 Owner ID: ${OWNER_ID}`);
    console.log(`📁 Token file: ${path.join(__dirname, 'web_tokens.json')}`);
    console.log(`📁 Quota batch: ${path.join(__dirname, 'batch_quota.json')}`);
});