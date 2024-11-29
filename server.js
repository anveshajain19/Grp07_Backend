const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
const ACTIONS = require("../Frontend/src/Actions");

const app = express();
const server = http.createServer(app);

// Dynamic CORS origin based on environment
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === "production"
            ? process.env.FRONTEND_URL // Use Render's frontend URL in production
            : "http://localhost:3000", // Use localhost during development
        methods: ["GET", "POST"],
    },
});

const userSocketMap = {};

// Utility function to get all connected clients in a room
function getAllConnectedClients(roomId) {
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId) => {
        return {
            socketId,
            username: userSocketMap[socketId],
        };
    });
}

// Socket.io connection handler
io.on("connection", (socket) => {
    console.log("Socket connected:", socket.id);

    // Handle JOIN event
    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);

        const clients = getAllConnectedClients(roomId);

        // Notify all clients in the room (excluding the sender)
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });

        console.log(`${username} joined room ${roomId}`);
    });

    // Handle CODE_CHANGE event
    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.to(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    // Handle SYNC_CODE event
    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    // Handle disconnection
    socket.on("disconnecting", () => {
        const rooms = [...socket.rooms];

        rooms.forEach((roomId) => {
            socket.to(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });

        console.log(`User ${userSocketMap[socket.id]} disconnected.`);
        delete userSocketMap[socket.id];
    });

    socket.on("error", (error) => {
        console.error(`Socket error: ${error.message}`);
    });
});

// Serve React frontend in production
if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(__dirname, "public"))); // Serve the build folder

    // Handle all unknown routes by serving React's index.html
    app.get("*", (req, res) => {
        res.sendFile(path.join(__dirname, "public", "index.html"));
    });
}

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
