import express from "express";
import WebSocket from "ws";

const app = express();
app.use(express.text({ type: "*/*" }));

let ws = null;
let queue = [];

// --- Connect to Eaglercraft with subprotocol flag ---
function connect() {
    // The "eaglercraftX" flag is required for proper handshake
    ws = new WebSocket("wss://eaglercraft.cc", "eaglercraftX");

    ws.on("open", () => console.log("WS connected"));

    ws.on("message", (msg) => {
        queue.push(msg);
    });

    ws.on("close", (code, reason) => {
        console.log(`WS closed (${code}) ${reason.toString()}`);
        console.log("Reconnecting...");
        setTimeout(connect, 1000);
    });

    ws.on("error", (err) => {
        console.log("WS error:", err.message);
    });
}

connect();

// --- Browser → send → Eaglercraft ---
app.post("/send", (req, res) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(req.body);
    }
    res.send("ok");
});

// --- Browser → recv → Eaglercraft messages ---
app.get("/recv", (req, res) => {
    if (queue.length > 0) {
        res.send(queue.shift());
    } else {
        res.send("");
    }
});

app.listen(3000, () => console.log("Bridge running on port 3000"));
