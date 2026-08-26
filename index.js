import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.text({ type: "*/*" }));

// -------------------------------
// CORS (required for browser loader)
// -------------------------------
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

let browser, page;
let queue = [];

// -------------------------------
// Launch Chromium (stable flags)
// -------------------------------
async function startBrowser() {
    console.log("[BRIDGE] Launching Chromium...");

    browser = await puppeteer.launch({
        headless: "new",
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-software-rasterizer",

            // ⭐ REQUIRED: allows WS binary frames in headless Chrome
            "--disable-web-security",

            // ⭐ REQUIRED: prevents Chrome from isolating WS origins
            "--disable-site-isolation-trials",
            "--disable-features=IsolateOrigins,site-per-process",

            // ⭐ Prevents WebRTC from interfering with WS
            "--disable-webrtc"
        ]
    });

    console.log("[BRIDGE] Chromium launched");

    page = await browser.newPage();
    console.log("[BRIDGE] New page created");

    // Chrome → Node packet bridge
    await page.exposeFunction("bridgeRecv", (msgArray) => {
        const arr = Uint8Array.from(msgArray);

        let bin = "";
        for (let i = 0; i < arr.length; i++) {
            bin += String.fromCharCode(arr[i]);
        }
        const b64 = Buffer.from(bin, "binary").toString("base64");

        queue.push(b64);
        console.log("[BRIDGE] Packet from server | bytes:", arr.length);
    });

    // -------------------------------
    // Open WebSocket inside Chrome
    // -------------------------------
    await page.evaluate(() => {
        console.log("[CHROME] Opening WebSocket to wss://eaglercraft.cc ...");

        const ws = new WebSocket("wss://eaglercraft.cc", "eaglercraftX");
        ws.binaryType = "arraybuffer";
        window.ws = ws;

        ws.onopen = () => {
            console.log("[CHROME] WS connected");
        };

        ws.onmessage = (ev) => {
            const arr = new Uint8Array(ev.data);
            console.log("[CHROME] Incoming from server | bytes:", arr.length);
            window.bridgeRecv([...arr]);
        };

        ws.onclose = (ev) => {
            console.log("[CHROME] WS closed | code:", ev.code);
        };

        ws.onerror = (err) => {
            console.log("[CHROME] WS error:", err);
        };
    });

    console.log("[BRIDGE] Chrome WebSocket tunnel ready");
}

startBrowser().catch(err => {
    console.error("[BRIDGE] Failed to start browser:", err);
});

// -------------------------------
// /send  (browser → server)
// body: base64-encoded packet
// -------------------------------
app.post("/send", async (req, res) => {
    try {
        const raw = Buffer.from(req.body, "base64");
        const arr = new Uint8Array(raw);

        console.log("[BRIDGE] /send packet | bytes:", arr.length);

        await page.evaluate((data) => {
            if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                window.ws.send(new Uint8Array(data));
            } else {
                console.log("[CHROME] WS not open, dropping packet");
            }
        }, [...arr]);

        res.send("ok");
    } catch (e) {
        console.log("[BRIDGE] ERROR in /send:", e);
        res.status(500).send("error");
    }
});

// -------------------------------
// /recv  (server → browser)
// returns: base64 string or ""
// -------------------------------
app.get("/recv", (req, res) => {
    if (queue.length > 0) {
        const msg = queue.shift();
        res.send(msg);
    } else {
        res.send("");
    }
});

// -------------------------------
// Start server
// -------------------------------
app.listen(3000, () => {
    console.log("[BRIDGE] Bridge running on port 3000");
});
