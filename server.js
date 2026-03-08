// Includes Express.js
const express = require('express');
const path = require('path');

// Creates an Express application
const app = express();

// Parse incoming JSON payloads from fetch requests
app.use(express.json());

// Serve everything in /public using an absolute path
app.use(express.static(path.join(__dirname, 'public')));

// Send the main chat UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Handles incoming chat messages
app.post('/chat', (req, res) => {
  const { message, retrievalMethod } = req.body || {};

  console.log('Incoming chat message:', { message, retrievalMethod });

  res.json({
    message,
    response: 'Message Received!'
  });
});

// Starts server on port 3000
app.listen(3000, () => {
console.log('Server is running on port 3000');
});