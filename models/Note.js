const mongoose = require('mongoose');

const NoteSchema = new mongoose.Schema({
  participantID: { type: String, required: true },
  systemID: { type: String, default: null },
  sessionID: { type: String, default: null },
  title: { type: String, default: 'Untitled' },
  content: { type: String, required: true },
  topic: { type: String, default: null },
  isFormula: { type: Boolean, default: false },
  messageRef: { type: String, default: null },
  isHighlight: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Note', NoteSchema);
