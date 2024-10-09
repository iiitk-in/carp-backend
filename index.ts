import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log(__dirname);
console.log("hello");
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const ADMIN_PASSWORD = "password";
let currentQuestion;
type ResponseType = {
  qid: number;
  choiceNo: number;
  timestamp: Date;
  uuid: string;
};
const responses: ResponseType[] = [];
const participants: Record<string, string>[] = [];

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use(cors());
// Routes
app.get("/admin", (req, res) => {
  console.log(__dirname);
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/quiz", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "quiz.html"));
});

// take username and return uuid
app.use(express.json());
app.post("/register", (req, res) => {
  const data = req.body;

  if (!data.name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  const name = data.name;
  const uuid = crypto.randomUUID();

  participants.push({ name, uuid });
  console.log("New participant:", { name, uuid });
  res.json({ uuid });
});

// Log everyone out
app.post("/forceLogout", (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  participants.length = 0;
  //send a message to all clients to logout
  io.emit("forceLogout");
  console.log("All participants logged out");
  res.json({ success: true });
});

io.on("connection", (socket) => {
  console.log("New client connected");

  // Send the latest question to the new user
  if (currentQuestion) {
    socket.emit("mcq", currentQuestion);
  } else {
    socket.emit("waiting", "Waiting for the next question...");
  }

  // Handle MCQ messages from admins
  socket.on("mcq", (data, callback) => {
    if (data.password !== ADMIN_PASSWORD) {
      callback({ error: "Unauthorized" });
      return;
    }

    const { qid, question, choices } = data;
    if (!qid || !question || !choices || choices.length < 2) {
      callback({ error: "Invalid question" });
      return;
    }
    currentQuestion = { qid, question, choices };

    // Broadcast the question to all clients except the sender
    socket.broadcast.emit("mcq", currentQuestion);

    callback({ success: true });
  });

  socket.on("adminMessage", (data, callback) => {
    if (data.password !== ADMIN_PASSWORD) {
      callback({ error: "Unauthorized" });
      return;
    }

    // Broadcast the message to all clients except the sender
    socket.broadcast.emit("msg", { message: data.message });

    callback({ success: true });
  });

  // Handle responses from users
  socket.on("response", (data) => {
    const { qid, choiceNo, uuid } = data;
    if (!qid || !choiceNo || !uuid) {
      console.log("Invalid response", data);
      return;
    }
    if (!participants.find((p) => p.uuid === uuid)) {
      console.log("Unauthorized response", data);
      return;
    }
    responses.push({ qid, choiceNo, timestamp: new Date(), uuid });
    console.log("New response:", { qid, choiceNo });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
