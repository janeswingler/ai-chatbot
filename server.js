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

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const Interaction = require('./models/Interaction');
const Note = require('./models/Note');
const Quiz = require('./models/Quiz');
const QuizResponse = require('./models/QuizResponse');
const StudySession = require('./models/StudySession');
const retrievalService = require('./services/retrievalService');
retrievalService.initialize().catch(err => console.error('Failed to initialize retrieval service:', err));
const EventLog = require('./models/EventLog');
const PracticeAttempt = require('./models/PracticeAttempt');
const TopicPlanEvent = require('./models/TopicPlanEvent');
const Document = require('./models/Document');
const documentProcessor = require("./services/documentProcessor");
const embeddingService = require("./services/embeddingService");


const SURVEY_URLS = {
  demographics: 'https://usfca.qualtrics.com/jfe/form/SV_80rjL7xUR9J6RFk',

  'pre-task': 'https://usfca.qualtrics.com/jfe/form/SV_6wXtobIQoynMpam',

  'post-task': 'https://usfca.qualtrics.com/jfe/form/SV_0lzQIDTOazS5K2a',
};

app.post('/redirect-to-survey', (req, res) => {
  const { participantID, systemID, surveyType = 'demographics' } = req.body;

  const baseUrl = SURVEY_URLS[surveyType];

  if (!baseUrl || baseUrl.startsWith('PLACEHOLDER')) {
    return res.status(400).send(
      `Survey URL for "${surveyType}" is not configured yet. ` +
      `Open server.js and replace the placeholder in SURVEY_URLS.`
    );
  }

  // Start with known fields
  let surveyUrl = `${baseUrl}?participantID=${encodeURIComponent(participantID)}`;
  if (systemID) surveyUrl += `&systemID=${encodeURIComponent(systemID)}`;

  // Append any extra embedded fields provided in the request body (e.g. completed, quizSubmitted, timeSpent, tabSwitchCount, quizId)
  const extras = Object.assign({}, req.body);
  delete extras.participantID;
  delete extras.systemID;
  delete extras.surveyType;
  Object.keys(extras).forEach(k => {
    const v = extras[k];
    if (v !== undefined && v !== null && String(v) !== '') {
      surveyUrl += `&${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
    }
  });

  res.send(surveyUrl);
});

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
  const { participantID, systemID, sessionID, eventType, elementName, eventProps, clientTs, page, uiVersion } = req.body;
  try {
    const event = new EventLog({
      participantID,
      systemID: systemID || null,
      sessionID: sessionID || null,
      eventType,
      elementName,
      eventProps: eventProps || null,
      clientTs: clientTs ? new Date(clientTs) : undefined,
      page: page || null,
      uiVersion: uiVersion || null
    });
    await event.save();
    res.status(200).send('Event logged successfully');
  } catch (error) {
    console.error('Error logging event:', error.message);
    res.status(500).send('Server Error');
  }
});

app.post('/practice-event', async (req, res) => {
  try {
    const payload = req.body;
    if (payload && payload.attempt && payload.attempt.participantID) {
      const a = payload.attempt;
      function parseDateLike(v) {
        if (!v) return undefined;
        const n = Number(v);
        if (!Number.isNaN(n)) {
          const d = new Date(n);
          return isNaN(d.getTime()) ? undefined : d;
        }
        const d2 = new Date(v);
        return isNaN(d2.getTime()) ? undefined : d2;
      }

      const startedAtDate = parseDateLike(a.startedAt);
      const computedLatency = startedAtDate ? (Date.now() - startedAtDate.getTime()) : undefined;

      const attempt = new PracticeAttempt({
        participantID: a.participantID,
        systemID: a.systemID || null,
        sessionID: a.sessionID || null,
        practiceId: a.practiceId || null,
        topic: a.topic || null,
        problemHash: a.problemHash || null,
        stepIndex: typeof a.stepIndex === 'number' ? a.stepIndex : null,
        stepInstruction: a.stepInstruction || null,
        expectedAnswer: a.expectedAnswer || null,
        studentAnswerRaw: a.studentAnswerRaw || null,
        isCorrect: !!a.isCorrect,
        actionType: a.actionType || 'submit',
        startedAt: startedAtDate,
        submittedAt: a.submittedAt ? parseDateLike(a.submittedAt) : new Date(),
        latencyMs: typeof computedLatency === 'number' && Number.isFinite(computedLatency) ? computedLatency : (typeof a.latencyMs === 'number' ? a.latencyMs : undefined),
        meta: a.meta || null
      });
      await attempt.save();
      return res.json({ ok: true });
    }
    if (Array.isArray(payload.attempts)) {
      function parseDateLike(v) {
        if (!v) return undefined;
        const n = Number(v);
        if (!Number.isNaN(n)) {
          const d = new Date(n);
          return isNaN(d.getTime()) ? undefined : d;
        }
        const d2 = new Date(v);
        return isNaN(d2.getTime()) ? undefined : d2;
      }

      await PracticeAttempt.insertMany(payload.attempts.map(a => {
        const startedAtDate = parseDateLike(a.startedAt);
        const computedLatency = startedAtDate ? (Date.now() - startedAtDate.getTime()) : undefined;
        return {
          participantID: a.participantID,
          systemID: a.systemID || null,
          sessionID: a.sessionID || null,
          practiceId: a.practiceId || null,
          topic: a.topic || null,
          problemHash: a.problemHash || null,
          stepIndex: typeof a.stepIndex === 'number' ? a.stepIndex : null,
          stepInstruction: a.stepInstruction || null,
          expectedAnswer: a.expectedAnswer || null,
          studentAnswerRaw: a.studentAnswerRaw || null,
          isCorrect: !!a.isCorrect,
          actionType: a.actionType || 'submit',
          startedAt: startedAtDate,
          submittedAt: a.submittedAt ? parseDateLike(a.submittedAt) : new Date(),
          latencyMs: typeof computedLatency === 'number' && Number.isFinite(computedLatency) ? computedLatency : (typeof a.latencyMs === 'number' ? a.latencyMs : undefined),
          meta: a.meta || null
        };
      }));
      return res.json({ ok: true, count: payload.attempts.length });
    }
    res.status(400).json({ error: 'No attempt payload provided' });
  } catch (err) {
    console.error('practice-event error:', err?.message || err);
    try { console.error('practice-event payload:', JSON.stringify(req.body)); } catch(e) {}
    console.error(err?.stack || err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/topic-event', async (req, res) => {
  try {
    const { participantID, systemID, sessionID, topicId, topicName, eventName, oldValue, newValue, meta } = req.body;
    if (!participantID || !eventName) return res.status(400).json({ error: 'Missing fields' });
    const ev = new TopicPlanEvent({ participantID, systemID: systemID || null, sessionID: sessionID || null, topicId: topicId || null, topicName: topicName || null, eventName, oldValue: oldValue || null, newValue: newValue || null, meta: meta || null });
    await ev.save();
    res.json({ ok: true });
  } catch (err) {
    console.error('topic-event error:', err?.message || err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Diagnostic telemetry status endpoint (admin/debug)
app.get('/telemetry-status', async (req, res) => {
  try {
    const [evCount, paCount, tpCount, ssCount, intCount, noteCount] = await Promise.all([
      EventLog.countDocuments(),
      PracticeAttempt.countDocuments(),
      TopicPlanEvent.countDocuments(),
      StudySession.countDocuments(),
      Interaction.countDocuments(),
      Note.countDocuments()
    ]);

    const latest = {
      eventLog: await EventLog.findOne().sort({ timestamp: -1 }).lean().exec(),
      practiceAttempt: await PracticeAttempt.findOne().sort({ createdAt: -1 }).lean().exec(),
      topicPlanEvent: await TopicPlanEvent.findOne().sort({ timestamp: -1 }).lean().exec(),
      studySession: await StudySession.findOne().sort({ startedAt: -1 }).lean().exec()
    };

    res.json({ counts: { eventlogs: evCount, practiceattempts: paCount, topicplanevents: tpCount, studysessions: ssCount, interactions: intCount, notes: noteCount }, latest });
  } catch (err) {
    console.error('telemetry-status error:', err);
    res.status(500).json({ error: err.message });
  }
});

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
    const history = interactions.reverse();
    res.json({ history });
  } catch (error) {
    console.error('Error fetching conversation history:', error.message);
    res.status(500).send('Server Error');
  }
});

app.post('/chat', async (req, res) => {
  try {
    const { history = [], input: userInput, message, participantID, systemID, sessionID, retrievalMethod } = req.body;
    const userMessage = userInput || message;

    if (!participantID) {
      return res.status(400).send('Participant ID is required');
    }

    const chunks = await retrievalService.retrieve(userMessage, {
      method: retrievalMethod || 'semantic',
      topK: 3
    });

    const scores = chunks.map(c => c.score || 0);
    const confidence = {
      topScore: scores.length > 0 ? Math.max(...scores) : 0,
      avgScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      chunkCount: chunks.length
    };

    const conciseDirective = `Keep responses concise: aim for roughly 120 words or fewer, prioritize the most important point first, and always finish your final sentence. Your reply is hard-capped at 200 tokens, so plan the full answer to fit within that budget rather than trailing off.`;

    const systemPrompt = chunks.length > 0
      ? `You are a helpful assistant. ${conciseDirective} Use the following retrieved context to answer the user's question. Base your answer on this evidence.\n\nContext:\n${chunks.map((c, i) => `[${i + 1}] ${c.chunkText}`).join('\n\n')}`
      : `You are a helpful assistant. ${conciseDirective} No relevant documents were found; answer from general knowledge.`;

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
      max_tokens: 200,
    });

    const botResponse = chatResponse.choices[0].message.content.trim();

    const interaction = new Interaction({
      participantID,
      systemID: systemID || null,
      sessionID: sessionID || null,
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

// Document upload endpoint removed — uploads are not permitted.

app.get("/documents", async (req, res) => {
    const docs = await Document.find({})
    .select("_id filename processingStatus processedAt")
    .sort({ processedAt: -1 });
    res.json(docs);
});

app.post('/notes', async (req, res) => {
  try {
    const { participantID, systemID, sessionID, title, content, topic, isFormula, messageRef, isHighlight } = req.body;
    if (!participantID || !content) return res.status(400).json({ error: 'Missing fields' });
    const note = new Note({
      participantID,
      systemID: systemID || null,
      sessionID: sessionID || null,
      title: (title || 'Untitled').trim() || 'Untitled',
      content,
      topic: topic || null,
      isFormula: !!isFormula,
      messageRef: messageRef || null,
      isHighlight: !!isHighlight
    });
    await note.save();
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/notes/:participantID', async (req, res) => {
  try {
    const notes = await Note.find({ participantID: req.params.participantID }).sort({ createdAt: 1 });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/notes/:id', async (req, res) => {
  try {
    const { title, content, isFormula } = req.body;
    if (!content || !String(content).trim()) return res.status(400).json({ error: 'Content is required' });
    const updated = await Note.findByIdAndUpdate(
      req.params.id,
      { title: (title || 'Untitled').trim() || 'Untitled', content: String(content).trim(), isFormula: !!isFormula },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Note not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/notes/:id', async (req, res) => {
  try {
    await Note.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/submit-quiz', async (req, res) => {
  const { participantID, systemID, sessionID, answers, tabSwitchCount, tabSwitches, timeSpent, startedAt, completedAt } = req.body;

  try {
    console.log('Quiz submission received - Answers:', JSON.stringify(answers));
    
    const quizStartedAt = startedAt ? new Date(startedAt) : new Date();
    const quizSubmittedAt = completedAt ? new Date(completedAt) : new Date();

    const quiz = new Quiz({
      participantID,
      systemID,
      sessionID: sessionID || null,
      answers,
      tabSwitchCount,
      tabSwitches,
      startedAt: quizStartedAt,
      completedAt: quizSubmittedAt,
      timeSpent
    });

    await quiz.save();

    const responses = Object.keys(answers || {})
      .map(key => {
        const match = /^q(\d+)$/i.exec(key);
        if (!match) return null;
        return {
          questionNumber: Number(match[1]),
          response: String(answers[key] ?? ''),
          timestamp: quizSubmittedAt
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.questionNumber - b.questionNumber);

    console.log('Transformed responses:', JSON.stringify(responses));

    await QuizResponse.create({
      participantID,
      systemID,
      sessionID: sessionID || null,
      quizId: quiz._id,
      responses,
      createdAt: quizSubmittedAt
    });

    res.status(200).json({ success: true, message: 'Quiz submitted successfully', quizId: quiz._id });
  } catch (error) {
    console.error('Error submitting quiz:', error);
    res.status(500).json({ error: 'Failed to submit quiz' });
  }
});

// GET quiz responses for a participant
app.get('/quiz-responses', async (req, res) => {
  try {
    const { participantID, sessionID } = req.query;
    const query = {};
    if (participantID) query.participantID = participantID;
    if (sessionID) query.sessionID = sessionID;
    
    const quizResponses = await QuizResponse.find(query).populate('quizId');
    res.status(200).json(quizResponses);
  } catch (error) {
    console.error('Error retrieving quiz responses:', error);
    res.status(500).json({ error: 'Failed to retrieve quiz responses' });
  }
});

app.post('/study-session/start', async (req, res) => {
  try {
    const { participantID, systemID, sessionID, startedAt } = req.body;
    if (!participantID || !sessionID) return res.status(400).json({ error: 'Missing fields' });

    const existing = await StudySession.findOne({ sessionID });
    const startTime = startedAt ? new Date(startedAt) : new Date();

    if (existing) {
      if (!existing.startedAt || existing.startedAt > startTime) existing.startedAt = startTime;
      existing.participantID = participantID;
      existing.systemID = systemID || existing.systemID || null;
      await existing.save();
      return res.json(existing);
    }

    const studySession = await StudySession.create({
      participantID,
      systemID: systemID || null,
      sessionID,
      startedAt: startTime
    });

    res.json(studySession);
  } catch (error) {
    console.error('Study session start error:', error);
    res.status(500).json({ error: 'Failed to start study session' });
  }
});

app.post('/study-session/end', async (req, res) => {
  try {
    const { sessionID, endedAt } = req.body;
    if (!sessionID) return res.status(400).json({ error: 'Missing sessionID' });

    const session = await StudySession.findOne({ sessionID });
    if (!session) return res.status(404).json({ error: 'Study session not found' });

    const endTime = endedAt ? new Date(endedAt) : new Date();
    session.endedAt = endTime;
    session.durationSec = Math.max(0, Math.round((endTime - session.startedAt) / 1000));
    session.met20MinMinimum = session.durationSec >= 20 * 60;
    await session.save();

    // Compute lightweight session summary metrics for analysis
    try {
      const [chatTurns, practiceSubmissions, notesCount, eventsCount, topicEventsCount] = await Promise.all([
        Interaction.countDocuments({ sessionID }),
        PracticeAttempt.countDocuments({ sessionID }),
        Note.countDocuments({ sessionID }),
        EventLog.countDocuments({ sessionID }),
        TopicPlanEvent.countDocuments({ sessionID })
      ]);

      session.summary = {
        totalChatTurns: chatTurns,
        totalPracticeSubmissions: practiceSubmissions,
        totalNotesCreated: notesCount,
        totalEvents: eventsCount,
        totalTopicEvents: topicEventsCount
      };
      await session.save();
    } catch (err) {
      console.error('Failed to compute session summary:', err?.message || err);
    }

    res.json(session);
  } catch (error) {
    console.error('Study session end error:', error);
    res.status(500).json({ error: 'Failed to end study session' });
  }
});

app.listen(PORT, () => {
  console.log('Server is running on port ' + PORT);
});