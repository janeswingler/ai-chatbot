// Includes Express.js
require('dotenv').config();
const mongoose = require("mongoose");
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));


const { OpenAI } = require("openai");
const bodyParser = require("body-parser");
const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Creates an Express application
const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Parse incoming JSON payloads from fetch requests
app.use(express.json());

// Serve everything in /public using an absolute path
app.use(express.static(path.join(__dirname, 'public')));

const Interaction = require('./models/Interaction');

app.post('/submit-prompt', async (req, res) => {
  try {
    const userInput = req.body.message;
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: userInput }],
    });
    const botResponse = chatResponse.choices[0].message.content.trim();
    const interaction = new Interaction({
      userInput: userInput,
      botResponse: botResponse,
    });
    res.json({ response: botResponse });
    await interaction.save();
  } catch (err) {
    res.status(500).json({ response: 'Error: ' + err.message });
  }
});

const EventLog = require('./models/EventLog'); // Import EventLog model

app.post('/log-event', async (req, res) => {
  const { participantID, eventType, elementName, timestamp } = req.body;
  try {
    // Log the event to MongoDB
    const event = new EventLog({ participantID, eventType, elementName, timestamp });
    await event.save();
    res.status(200).send('Event logged successfully');
  } catch (error) {
    console.error('Error logging event:', error.message);
    res.status(500).send('Server Error');
  }
});

// Send the main chat UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handles incoming chat messages
app.post('/chat', async (req, res) => {
  try {
    const { message, participantID } = req.body;
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{role: 'user', content: message}],
      max_tokens: 100,
    });
    const botResponse = chatResponse.choices[0].message.content.trim();
    const interaction = new Interaction({
      participantID: participantID,
      userInput: message,
      botResponse: botResponse,
    });
    res.json({response: botResponse});
    await interaction.save();
  } catch (err) {
    res.status(500).json({response: 'Error: ' + err.message});
  }
});

app.post('/history', async (req, res) => {
  try {
    const { participantID } = req.body;
    const interactions = await Interaction.find({ participantID }).sort({ timestamp: 1 });
    res.json({ history: interactions });
  } catch (err) {
    res.status(500).json({ history: [] });
  }
});

// Starts server on port 3000
app.listen(PORT, () => {
  console.log('Server is running on port ' + PORT);
});