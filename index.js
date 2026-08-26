import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.text({ type: "*/*" }));

let browser, page;
let queue = [];

// --- Start Chrome inside Railway ---
async function startBrowser() {
    console.log("[BRIDGE] Launching Chromium...");

    browser = await puppeteer.launch({
        headless: "new",
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-software-rasterizer"
        ]
    });

    console.log("[BRIDGE] Chromium launched");

    page = await browser.newPage();
    console.log("[BRIDGE] New page created");

    // Expose function so Chrome can push packets to Node
    await page.exposeFunction("bridgeRecv", (msgArray) => {
        const arr = Uint8Array.from(msgArray);

        let bin = "";
        for (let i = 0; i < arr.length; i++) {
            bin += String.fromCharCode(arr[i]);
        }
        const b64 = Buffer.from(bin, "binary").toString("base64");

        queue.push(b64);
        console.log("[BRIDGE] Packet received from Chrome | bytes:", arr.length);
    });

    // Open WebSocket inside Chrome WITH REQUIRED PROTOCOL
    await page.evaluate(() => {
        console.log("[BRIDGE] Opening WebSocket inside Chrome...");

        // ⭐ REQUIRED FOR EAGLERCRAFT 1.12.2 ⭐
        window.ws = new WebSocket("wss://eaglercraft.cc", "eaglercraftX");

        window.ws.binaryType = "arraybuffer";

        window.ws.onopen = () => {
            console.log("[BRIDGE] Chrome WS connected to Eaglercraft");
        };

        window.ws.onmessage = (ev) => {
            const arr = new Uint8Array(ev.data);
            window.bridgeRecv([...arr]);  // Puppeteer-safe serialization
        };

        window.ws.onclose = (ev) => {
            console.log("[BRIDGE] Chrome WS closed | code:", ev.code);
        };

        window.ws.onerror = (err) => {
            console.log("[BRIDGE] Chrome WS error:", err);
        };
    });

    console.log("[BRIDGE] Chrome WebSocket tunnel ready");
}

startBrowser();

// --- Browser → send → Eaglercraft ---
app.post("/send", async (req, res) => {
    try {
        const raw = Buffer.from(req.body, "base64");
        const arr = new Uint8Array(raw);

        console.log("[BRIDGE] /send packet | bytes:", arr.length);

        await page.evaluate((data) => {
            window.ws.send(new Uint8Array(data));
        }, [...arr]); // Puppeteer-safe
    } catch (e) {
        console.log("[BRIDGE] ERROR in /send:", e.message);
    }

    res.send("ok");
});

// --- Browser → recv → Eaglercraft ---
app.get("/recv", (req, res) => {
    if (queue.length > 0) {
        const msg = queue.shift();
        res.send(msg);
    } else {
        res.send("");
    }
});

app.listen(3000, () => console.log("[BRIDGE] Bridge running on port 3000"));
