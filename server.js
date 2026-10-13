const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const publicLobbyMessages = []; 
const directMessages = {}; // Keyed by phone number

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('register_user', (phoneNumber) => {
        if (!phoneNumber) return;
        const cleanPhone = String(phoneNumber).trim().replace(/\s+/g, '');
        socket.phoneNumber = cleanPhone;
        socket.join(cleanPhone);

        if (directMessages[cleanPhone] && directMessages[cleanPhone].length > 0) {
            socket.emit('load_my_dms', directMessages[cleanPhone]);
        }
    });

    socket.emit('load_public_chat_history', publicLobbyMessages);

    // Public Live Lobby Message Handler
    socket.on('send_public_message', (data) => {
        if (!data || !data.text) return;

        const msgObject = {
            id: 'pub_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            senderPhone: String(data.senderPhone || 'Anonymous').trim(),
            senderName: String(data.senderName || 'Student').trim(),
            text: String(data.text).trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        publicLobbyMessages.push(msgObject);
        if (publicLobbyMessages.length > 150) publicLobbyMessages.shift();

        io.emit('new_public_message', msgObject);
    });

    // Delete Public Lobby Message (For Everyone)
    socket.on('delete_public_message', (messageId) => {
        const index = publicLobbyMessages.findIndex(m => m.id === messageId);
        if (index !== -1) {
            publicLobbyMessages.splice(index, 1);
            io.emit('public_message_deleted', messageId);
        }
    });

    // Direct Messaging Handler
    socket.on('send_direct_message', ({ targetPhone, senderPhone, text }) => {
        if (!targetPhone || !text) return;

        const cleanTarget = String(targetPhone).trim().replace(/\s+/g, '');
        const cleanSender = String(senderPhone || 'Anonymous').trim().replace(/\s+/g, '');
        const cleanText = String(text).trim();

        const dmObject = {
            id: 'dm_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            senderPhone: cleanSender,
            targetPhone: cleanTarget,
            text: cleanText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        if (!directMessages[cleanTarget]) directMessages[cleanTarget] = [];
        directMessages[cleanTarget].push(dmObject);

        if (!directMessages[cleanSender]) directMessages[cleanSender] = [];
        directMessages[cleanSender].push(dmObject);

        io.to(cleanTarget).emit('receive_direct_message', dmObject);
        socket.emit('dm_sent_confirmation', dmObject);
        socket.emit('load_my_dms', directMessages[cleanSender]);
        io.to(cleanTarget).emit('load_my_dms', directMessages[cleanTarget]);
    });

    // Delete Direct Message
    socket.on('delete_direct_message', ({ messageId, phoneNum }) => {
        const cleanPhone = String(phoneNum).trim().replace(/\s+/g, '');
        if (directMessages[cleanPhone]) {
            directMessages[cleanPhone] = directMessages[cleanPhone].filter(m => m.id !== messageId);
            socket.emit('load_my_dms', directMessages[cleanPhone]);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
      
