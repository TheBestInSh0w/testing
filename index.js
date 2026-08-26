import express from "express";
import WebSocket from "ws";

const app = express();

// accept raw text (base64) from loader
app.use(express.text({ type: "*/*" }));

// -------------------------------
// CORS (for browser loader)
// -------------------------------
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

let ws;
let queue = [];

// -------------------------------
// Connect to wss://eaglercraft.cc
// -------------------------------
function connectWS() {
    console.log("[BRIDGE] Connecting to wss://eaglercraft.cc ...");

    ws = new WebSocket("wss://eaglercraft.cc", "eaglercraftX", {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                          "AppleWebKit/537.36 (KHTML, like Gecko) " +
                          "Chrome/124.0.0.0 Safari/537.36",
            "Origin": "https://eaglercraft.cc"
        }
    });

    ws.binaryType = "arraybuffer";

    ws.on("open", () => {
        console.log("[BRIDGE] WS connected to eaglercraft.cc");
    });

    ws.on("message", (data) => {
        const arr = data instanceof Buffer ? new Uint8Array(data) : new Uint8Array(data);

        let bin = "";
        for (let i = 0; i < arr.length; i++) {
            bin += String.fromCharCode(arr[i]);
        }
        const b64 = Buffer.from(bin, "binary").toString("base64");

        queue.push(b64);
        console.log("[BRIDGE] Packet from server | bytes:", arr.length);
    });

    ws.on("close", (code) => {
        console.log("[BRIDGE] WS closed | code:", code);
        // optional: auto-reconnect
        setTimeout(connectWS, 5000);
    });

    ws.on("error", (err) => {
        console.log("[BRIDGE] WS error:", err.message);
    });
}

connectWS();

// -------------------------------
// /send  (browser → server)
// body: base64-encoded packet
// -------------------------------
app.post("/send", (req, res) => {
    try {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.log("[BRIDGE] /send but WS not open");
            return res.status(503).send("ws_not_open");
        }

        const raw = Buffer.from(req.body, "base64");
        const arr = new Uint8Array(raw);

        console.log("[BRIDGE] /send packet | bytes:", arr.length);

        ws.send(arr);
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
