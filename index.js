import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.text({ type: "*/*" }));

let browser, page;
let queue = [];

// --- Start Chrome inside Railway ---
async function startBrowser() {
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

    page = await browser.newPage();

    // Open WS inside the browser context
    await page.exposeFunction("bridgeRecv", (msg) => {
        queue.push(Buffer.from(msg).toString("base64"));
    });

    await page.evaluate(() => {
        window.ws = new WebSocket("wss://eaglercraft.cc");
        window.ws.binaryType = "arraybuffer";

        window.ws.onopen = () => {
            console.log("Browser WS connected");
        };

        window.ws.onmessage = (ev) => {
            window.bridgeRecv(ev.data);
        };

        window.ws.onclose = () => {
            console.log("Browser WS closed");
        };

        window.ws.onerror = (err) => {
            console.log("Browser WS error", err);
        };
    });

    console.log("Chrome WebSocket tunnel ready");
}

startBrowser();

// --- Browser → send → Eaglercraft ---
app.post("/send", async (req, res) => {
    const buf = Buffer.from(req.body, "base64");

    await page.evaluate((data) => {
        window.ws.send(new Uint8Array(data));
    }, buf);

    res.send("ok");
});

// --- Browser → recv → Eaglercraft ---
app.get("/recv", (req, res) => {
    if (queue.length > 0) {
        res.send(queue.shift());
    } else {
        res.send("");
    }
});

app.listen(3000, () => console.log("Bridge running on port 3000"));
