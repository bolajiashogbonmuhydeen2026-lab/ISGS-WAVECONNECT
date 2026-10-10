const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());

// Serve static frontend files (index.html)
app.use(express.static(path.join(__dirname)));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Register phone for direct alerts
  socket.on('register_user', (phoneNumber) => {
    if (phoneNumber) socket.join(phoneNumber);
  });

  // Global Live Lobby
  socket.on('join_global_room', () => {
    socket.join('wavethread_global_lobby');
  });

  socket.on('send_global_message', (data) => {
    io.to('wavethread_global_lobby').emit('receive_global_message', {
      sender: data.sender,
      text: data.text,
      timestamp: new Date()
    });
  });

  // Group Messaging
  socket.on('join_group_room', (groupId) => {
    socket.join(groupId);
  });

  socket.on('send_group_message', (data) => {
    const { groupId, sender, text, memberPhones } = data;
    io.to(groupId).emit('receive_group_message', { sender, text, timestamp: new Date() });

    if (Array.isArray(memberPhones)) {
      memberPhones.forEach((phone) => {
        if (phone !== sender) {
          io.to(phone).emit('receive_notification', {
            type: 'group',
            sender,
            text,
            message: `Group message from ${sender}`
          });
        }
      });
    }
  });

  // Direct DM Notifications
  socket.on('send_direct_message', (data) => {
    const { targetPhone, senderPhone, text } = data;
    io.to(targetPhone).emit('receive_direct_message', { sender: senderPhone, text });
    io.to(targetPhone).emit('receive_notification', {
      type: 'dm',
      sender: senderPhone,
      text,
      message: `New DM from ${senderPhone}: ${text}`
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`ISGS WaveConnect server running on port ${PORT}`);
});
        
