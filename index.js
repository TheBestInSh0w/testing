import express from "express";
import WebSocket from "ws";

const app = express();

// Accept raw text (base64)
app.use(express.text({ type: "*/*" }));

let ws = null;
let queue = [];

// --- Connect to Eaglercraft (no subprotocol needed) ---
function connect() {
    ws = new WebSocket("wss://eaglercraft.cc");

    ws.binaryType = "arraybuffer";

    ws.on("open", () => {
        console.log("WS connected to Eaglercraft");
    });

    ws.on("message", (msg) => {
        // msg is binary → convert to base64
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

// --- Browser → send → Eaglercraft ---
app.post("/send", (req, res) => {
    try {
        const b64 = req.body;
        const buf = Buffer.from(b64, "base64"); // convert base64 → binary

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(buf);
        }
    } catch (e) {
        console.log("Send error:", e.message);
    }

    res.send("ok");
});

// --- Browser → recv → Eaglercraft ---
app.get("/recv", (req, res) => {
    if (queue.length > 0) {
        res.send(queue.shift()); // send base64
    } else {
        res.send("");
    }
});

app.listen(3000, () => console.log("Bridge running on port 3000"));
