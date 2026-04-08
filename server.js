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
const retrievalService = require('./services/retrievalService');
retrievalService.initialize().catch(err => console.error('Failed to initialize retrieval service:', err)); // Initialize TF-IDF index 
const EventLog = require('./models/EventLog'); // Import EventLog model
const Document = require('./models/Document'); // Import Document model
const multer = require("multer");
const documentProcessor = require("./services/documentProcessor");
const embeddingService = require("./services/embeddingService");
const upload = multer({ dest: "uploads/" }); // Save uploaded files so documentProcessor.js can read them


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

// POST route to fetch conversation history by participantID
app.post('/history', async (req, res) => {
  const { participantID, limit } = req.body;
  if (!participantID) {
    return res.status(400).send('Participant ID is required');
  }
  try {
    const n = parseInt(limit) || 5;
    const interactions = await Interaction.find({ participantID })
      .sort({ timestamp: -1 })
      .limit(n);
    // Reverse so they're in chronological order for display
    const history = interactions.reverse();
    res.json({ history });
  } catch (error) {
    console.error('Error fetching conversation history:', error.message);
    res.status(500).send('Server Error');
  }
});

// Handles incoming chat messages
app.post('/chat', async (req, res) => {
  try {
    const { history = [], input: userInput, message, participantID, systemID, retrievalMethod } = req.body;
    // Support both old `message` field and new `input` field
    const userMessage = userInput || message;

    if (!participantID) {
      return res.status(400).send('Participant ID is required');
    }

    // Retrieve relevant chunks
    const chunks = await retrievalService.retrieve(userMessage, {
      method: retrievalMethod || 'semantic',
      topK: 3
    });

    // Compute confidence metrics
    const scores = chunks.map(c => c.score || 0);
    const confidence = {
      topScore: scores.length > 0 ? Math.max(...scores) : 0,
      avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      chunkCount: chunks.length
    };

    // Build RAG prompt
    const systemPrompt = chunks.length > 0
      ? `You are a helpful assistant. Use the following retrieved context to answer the user's question. Base your answer on this evidence.\n\nContext:\n${chunks.map((c, i) => `[${i + 1}] ${c.chunkText}`).join('\n\n')}`
      : `You are a helpful assistant. No relevant documents were found; answer from general knowledge.`;

    // Build message array: system prompt + conversation history + new user message
    const safeHistory = Array.isArray(history)
      ? history
          .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
          .map(m => ({ role: m.role, content: String(m.content ?? '') }))
      : [];

    const messages = [
      { role: 'system', content: systemPrompt },
      ...safeHistory,
      { role: 'user', content: userMessage }
    ];

    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1000,
    });

    const botResponse = chatResponse.choices[0].message.content.trim();

    // Save full interaction with retrieval metadata
    const interaction = new Interaction({
      participantID,
      userInput: userMessage,
      botResponse,
      retrievalMethod: retrievalMethod || 'semantic',
      retrievedChunks: chunks.map(c => ({
        documentId: c.documentId,
        documentName: c.documentName,
        chunkIndex: c.chunkIndex,
        chunkText: c.chunkText,
        score: c.score
      })),
      confidence
    });

    res.json({
    response: botResponse,
    retrievedChunks: interaction.retrievedChunks,
    confidence: interaction.confidence,
    retrievalMethod: interaction.retrievalMethod
    });
    await interaction.save();

  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ response: 'Error: ' + err.message });
  }
});

// File upload handling
app.post("/upload-document", upload.single("document") , async (req, res) => {
    if (! req.file ) {
    return res.status(400).json({ error: "No file uploaded" });
    }
    try {
      const processed = await documentProcessor.processDocument(req.file); // Extract text + chunks from the file
      const chunksWithEmbeddings = await embeddingService.generateEmbeddings(processed.chunks); // Generate embeddings for the chunks
        await Document.create({
            filename: req.file.originalname,
            text: processed.fullText,
            chunks: chunksWithEmbeddings.map((chunkObj) => ({
                chunkIndex: chunkObj.chunkIndex,
                text: chunkObj.text,
                embedding: chunkObj.embedding || [] // Store embedding if available
            })),
            processingStatus: "completed"
        });
        // Rebuild TF-IDF index so new doc is immediately searchable
        await retrievalService.rebuildIndex();
        res.json({
            status: "ok",
            filename: req.file.originalname,
            chunkCount: chunksWithEmbeddings.length
        });
        console.log(`Processed document: ${req.file.originalname}, chunks: ${chunksWithEmbeddings.length}`);
    } catch (error) {
        console.error("Error processing document:", error);
        res.status(500).json({ error: "Failed to process document" });
    }
});

// route that allows the frontend to display what documents exist with processing status
app.get("/documents", async (req, res) => {
    const docs = await Document.find({})
    .select("_id filename processingStatus processedAt")
    .sort({ processedAt: -1 });
    res.json(docs);
});

// Starts server on port 3000
app.listen(PORT, () => {
  console.log('Server is running on port ' + PORT);
});