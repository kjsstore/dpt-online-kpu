// ============================================================
// IP_HELPER.JS - Auto-detect IP public VPS
// ============================================================

const https = require("https");

// ============================
// DETECT IP PUBLIC (multi-API fallback)
// ============================
function detectPublicIP() {
    const apis = [
        { url: "https://api.ipify.org?format=json", field: "ip" },
        { url: "https://api.my-ip.io/ip.json", field: "ip" },
        { url: "https://ipapi.co/json/", field: "ip" },
        { url: "https://api.ip.sb/geoip", field: "ip" },
        { url: "https://ifconfig.me/all.json", field: "ip_addr" }
    ];

    return new Promise((resolve) => {
        let idx = 0;

        const tryNext = () => {
            if (idx >= apis.length) {
                resolve(null);
                return;
            }

            const api = apis[idx++];

            const req = https.get(api.url, { timeout: 6000 }, (res) => {
                let raw = "";
                res.on("data", (chunk) => raw += chunk);
                res.on("end", () => {
                    try {
                        const data = JSON.parse(raw);
                        const ip = data[api.field];
                        if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
                            resolve(ip);
                        } else {
                            tryNext();
                        }
                    } catch {
                        tryNext();
                    }
                });
            });

            req.on("timeout", () => {
                req.destroy();
                tryNext();
            });

            req.on("error", () => tryNext());
        };

        tryNext();
    });
}

// ============================
// GET WEB URL (auto-detect + port)
// ============================
async function getWebURL(port = 3006, path = '/') {
    const ip = await detectPublicIP();
    if (!ip) return null;
    return `http://${ip}:${port}${path}`;
}

module.exports = {
    detectPublicIP,
    getWebURL
};