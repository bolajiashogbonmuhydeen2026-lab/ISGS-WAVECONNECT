/* ==========================================================
   PART 1: SERVER SETUP, IMPORTS & CONNECTION HANDLING
   ========================================================== */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Serve static frontend files from the root directory
app.use(express.static(path.join(__dirname, '.')));

// Persistent In-Memory Data Storage
let publicMessages = []; // Live Lobby chat history
let directMessages = {}; // Stored by phone number: { "0808...": [ {id, senderPhone, text, timestamp} ] }
let connectedUsers = {}; // socket.id -> phone number

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Register user by phone number & send history
    socket.on('register_user', (phone) => {
        if (!phone) return;
        connectedUsers[socket.id] = phone;
        socket.join(phone); // Join a private room for direct messaging

        // Load Live Lobby public chat history
        socket.emit('load_public_chat_history', publicMessages);

        // Load stored Direct Messages for this user
        if (directMessages[phone]) {
            socket.emit('load_my_dms', directMessages[phone]);
        }
    });

    // Handle incoming Live Lobby message
    socket.on('send_public_message', (data) => {
        const messageObj = {
            id: 'pub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            senderPhone: data.senderPhone,
            senderName: data.senderName || 'Student',
            text: data.text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        publicMessages.push(messageObj);
        if (publicMessages.length > 100) publicMessages.shift(); // Keep last 100

        io.emit('new_public_message', messageObj);
    });

    // Delete Live Lobby message
    socket.on('delete_public_message', (messageId) => {
        publicMessages = publicMessages.filter(msg => msg.id !== messageId);
        io.emit('public_message_deleted', messageId);
    });
       /* ==========================================================
   PART 2: DIRECT MESSAGING, DELETIONS & SERVER LISTENER
   ========================================================== */
    // Handle Direct Message sending
    socket.on('send_direct_message', (data) => {
        const { targetPhone, senderPhone, text } = data;
        if (!targetPhone || !text) return;

        const dmObj = {
            id: 'dm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            senderPhone: senderPhone,
            targetPhone: targetPhone,
            text: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        if (!directMessages[targetPhone]) {
            directMessages[targetPhone] = [];
        }
        directMessages[targetPhone].push(dmObj);

        // Deliver live to recipient if online
        io.to(targetPhone).emit('receive_direct_message', dmObj);
        socket.emit('dm_sent_success', dmObj);
    });

    // Delete Direct Message
    socket.on('delete_direct_message', ({ messageId, phoneNum }) => {
        if (directMessages[phoneNum]) {
            directMessages[phoneNum] = directMessages[phoneNum].filter(m => m.id !== messageId);
            socket.emit('load_my_dms', directMessages[phoneNum]);
        }
    });

    socket.on('disconnect', () => {
        delete connectedUsers[socket.id];
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`ISGS WaveConnect server running smoothly on port ${PORT}`);
});
