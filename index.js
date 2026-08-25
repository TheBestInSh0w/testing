import express from "express";
import WebSocket from "ws";

const app = express();
app.use(express.text({ type: "*/*" }));

let ws = null;
let queue = [];

// --- Connect to Eaglercraft ---
function connect() {
    ws = new WebSocket("wss://eaglercraft.cc", {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Origin": "https://eaglercraft.com",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Sec-WebSocket-Version": "13",
            "Sec-WebSocket-Extensions": "permessage-deflate"
        }
    });

    ws.binaryType = "arraybuffer";

    ws.on("open", () => {
        console.log("WS connected to Eaglercraft");

        // Minimal binary "hello" frame to keep connection alive
        const hello = Buffer.from([0x00]);
        ws.send(hello);
    });

    ws.on("message", (msg) => {
        const b64 = Buffer.from(msg).toString("base64");
        queue.push(b64);
    });

    ws.on("close", (code, reason) => {
        console.log(`WS closed (${code}) ${reason}`);
        setTimeout(connect, 1000);
    });

    ws.on("error", (err) => {
        console.log("WS error:", err.message);
    });
}

connect();

// --- Browser → send → Eaglercraft (base64 → binary) ---
app.post("/send", (req, res) => {
    try {
        const buf = Buffer.from(req.body, "base64");
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(buf);
        }
    } catch (e) {
        console.log("Send error:", e.message);
    }
    res.send("ok");
});

// --- Browser → recv → Eaglercraft (binary → base64) ---
app.get("/recv", (req, res) => {
    if (queue.length > 0) {
        res.send(queue.shift());
    } else {
        res.send("");
    }
});

app.listen(3000, () => console.log("Bridge running on port 3000"));
