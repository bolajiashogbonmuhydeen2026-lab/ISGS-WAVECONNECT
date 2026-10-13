const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// In-memory data store for persistent messages
const publicLobbyMessages = []; // Stores Public Live Lobby messages
const directMessages = {};      // Stores DMs keyed by phone number: { "08012345678": [msg1, msg2] }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // 1. REGISTER USER WITH THEIR PHONE NUMBER
    socket.on('register_user', (phoneNumber) => {
        if (!phoneNumber) return;
        // Clean phone number format
        const cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
        socket.phoneNumber = cleanPhone;
        socket.join(cleanPhone); // Join a private room for this phone number

        // Send all past DMs stored for this specific phone number when they log in/open site
        if (directMessages[cleanPhone]) {
            socket.emit('load_my_dms', directMessages[cleanPhone]);
        }
    });

    // 2. LIVE LOBBY: LOAD PAST PUBLIC MESSAGES
    // Automatically send chat history when a user enters the Live Lobby
    socket.emit('load_public_chat_history', publicLobbyMessages);

    // 3. LIVE LOBBY: BROADCAST NEW MESSAGE TO EVERYONE
    socket.on('send_public_message', (data) => {
        const msgObject = {
            id: 'pub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            senderPhone: data.senderPhone || 'Anonymous',
            senderName: data.senderName || 'Student',
            text: data.text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        publicLobbyMessages.push(msgObject);
        // Broadcast to ALL connected clients immediately
        io.emit('new_public_message', msgObject);
    });

    // 4. LIVE LOBBY: DELETE MESSAGE FOR EVERYONE
    socket.on('delete_public_message', ({ messageId, senderPhone }) => {
        const index = publicLobbyMessages.findIndex(m => m.id === messageId);
        if (index !== -1) {
            // Verify ownership
            if (publicLobbyMessages[index].senderPhone === senderPhone) {
                publicLobbyMessages.splice(index, 1);
                io.emit('public_message_deleted', messageId);
            }
        }
    });

    // 5. DIRECT MESSAGING (SEND TO SPECIFIC PHONE NUMBER)
    socket.on('send_direct_message', ({ targetPhone, senderPhone, text }) => {
        if (!targetPhone || !text) return;

        const cleanTarget = targetPhone.trim().replace(/\s+/g, '');
        const cleanSender = senderPhone.trim().replace(/\s+/g, '');

        const dmObject = {
            id: 'dm_' + Date.now(),
            senderPhone: cleanSender,
            targetPhone: cleanTarget,
            text: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        // Store DM for target recipient
        if (!directMessages[cleanTarget]) {
            directMessages[cleanTarget] = [];
        }
        directMessages[cleanTarget].push(dmObject);

        // Send to target user if they are online right now
        io.to(cleanTarget).emit('receive_direct_message', dmObject);

        // Confirm delivery back to sender
        socket.emit('dm_sent_confirmation', dmObject);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`ISGS WaveConnect Server running on port ${PORT}`));
          // Connect to Socket.io Server
const socket = io();

// Ensure user has a registered phone number in local storage
let myPhoneNumber = localStorage.getItem('isgs_user_phone');
if (!myPhoneNumber) {
    myPhoneNumber = prompt("Enter your phone number to start using ISGS WaveConnect:") || "08000000000";
    localStorage.setItem('isgs_user_phone', myPhoneNumber);
}

// Register phone number on connection
socket.emit('register_user', myPhoneNumber);

/* ==========================================================
   1. PUBLIC LIVE LOBBY FUNCTIONALITY
   ========================================================== */

// Container where live lobby messages appear
const lobbyContainer = document.getElementById('global-messages') || document.getElementById('status-feed');

// Load full chat history when opening the site
socket.on('load_public_chat_history', (messages) => {
    if (!lobbyContainer) return;
    lobbyContainer.innerHTML = '';
    messages.forEach(renderPublicMessage);
});

// Listen for incoming live lobby messages from other users
socket.on('new_public_message', (msg) => {
    renderPublicMessage(msg);
});

// Listen for message deletion
socket.on('public_message_deleted', (messageId) => {
    const elem = document.getElementById(messageId);
    if (elem) elem.remove();
});

// Function to render public lobby message with delete button for owner
function renderPublicMessage(msg) {
    if (!lobbyContainer) return;

    const isMe = msg.senderPhone === myPhoneNumber;
    const msgDiv = document.createElement('div');
    msgDiv.id = msg.id;
    msgDiv.className = `p-3 my-2 rounded-lg text-white ${isMe ? 'bg-emerald-800 ml-auto max-w-[80%]' : 'bg-slate-800 mr-auto max-w-[80%]'}`;

    msgDiv.innerHTML = `
        <div class="flex justify-between items-center text-xs text-slate-300 mb-1">
            <span class="font-bold text-amber-300">${msg.senderName} (${msg.senderPhone})</span>
            <span>${msg.timestamp}</span>
        </div>
        <p class="text-sm">${escapeHtml(msg.text)}</p>
        ${isMe ? `<button onclick="deleteLobbyMsg('${msg.id}')" class="text-red-400 text-xs mt-1 underline">Delete</button>` : ''}
    `;

    lobbyContainer.appendChild(msgDiv);
    lobbyContainer.scrollTop = lobbyContainer.scrollHeight;
}

// Function to send a Public Live Lobby message
function sendPublicLobbyMessage(textInputId) {
    const input = document.getElementById(textInputId);
    const text = input.value.trim();
    if (!text) return;

    socket.emit('send_public_message', {
        senderPhone: myPhoneNumber,
        senderName: localStorage.getItem('isgs_user_name') || 'Student',
        text: text
    });

    input.value = '';
}

// Delete message helper
function deleteLobbyMsg(messageId) {
    if (confirm("Delete this message for everyone?")) {
        socket.emit('delete_public_message', { messageId, senderPhone: myPhoneNumber });
    }
}


/* ==========================================================
   2. DIRECT MESSAGE (DM BY PHONE NUMBER) FUNCTIONALITY
   ========================================================== */

// Load existing DMs sent to this phone number
socket.on('load_my_dms', (dms) => {
    dms.forEach(dm => {
        showToast(`📬 DM from ${dm.senderPhone}: "${dm.text}"`);
    });
});

// Receive live DM when someone sends to your phone number
socket.on('receive_direct_message', (dm) => {
    showToast(`📩 New DM from ${dm.senderPhone}: ${dm.text}`);
    // If you have a specific DM display box, append it here
});

// Trigger function for the "Send DM" button in your UI
function sendDirectMessageToPhone(targetPhoneInputId, messageTextInputId) {
    const targetPhone = document.getElementById(targetPhoneInputId)?.value;
    const text = document.getElementById(messageTextInputId)?.value || "Hello from ISGS WaveConnect!";

    if (!targetPhone) {
        alert("Please enter a valid phone number!");
        return;
    }

    socket.emit('send_direct_message', {
        targetPhone: targetPhone,
        senderPhone: myPhoneNumber,
        text: text
    });

    showToast(`Direct message sent to ${targetPhone}`);
}

// Helper to escape HTML characters
function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }
                               
