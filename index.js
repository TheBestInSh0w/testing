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
    await page.exposeFunction("bridgeRecv", (msg) => {
        const b64 = Buffer.from(msg).toString("base64");
        queue.push(b64);
        console.log("[BRIDGE] Packet received from Eaglercraft (Chrome WS) | bytes:", msg.byteLength, "| queue size:", queue.length);
    });

    // Open WebSocket inside Chrome
    await page.evaluate(() => {
        console.log("[BRIDGE] Opening WebSocket inside Chrome...");
        window.ws = new WebSocket("wss://eaglercraft.cc");
        window.ws.binaryType = "arraybuffer";

        window.ws.onopen = () => {
            console.log("[BRIDGE] Chrome WS connected to Eaglercraft");
        };

        window.ws.onmessage = (ev) => {
            console.log("[BRIDGE] Chrome WS incoming packet | bytes:", ev.data.byteLength);
            window.bridgeRecv(ev.data);
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
    console.log("[BRIDGE] /send hit | base64 length:", req.body.length);

    try {
        const buf = Buffer.from(req.body, "base64");
        console.log("[BRIDGE] Decoded /send packet | bytes:", buf.length);

        await page.evaluate((data) => {
            console.log("[BRIDGE] Sending packet from Node → Chrome WS | bytes:", data.length);
            window.ws.send(new Uint8Array(data));
        }, buf);

    } catch (e) {
        console.log("[BRIDGE] ERROR in /send:", e.message);
    }

    res.send("ok");
});

// --- Browser → recv → Eaglercraft ---
app.get("/recv", (req, res) => {
    console.log("[BRIDGE] /recv polled | queue size:", queue.length);

    if (queue.length > 0) {
        const msg = queue.shift();
        console.log("[BRIDGE] Delivering packet to client | base64 bytes:", msg.length, "| new queue size:", queue.length);
        res.send(msg);
    } else {
        res.send("");
    }
});

app.listen(3000, () => console.log("[BRIDGE] Bridge running on port 3000"));
