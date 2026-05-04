const mongoose = require('mongoose');

const StudySessionSchema = new mongoose.Schema({
  participantID: { type: String, required: true },
  systemID: { type: String, default: null },
  sessionID: { type: String, required: true, unique: true },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  durationSec: { type: Number, default: 0 },
  met20MinMinimum: { type: Boolean, default: false }
});

module.exports = mongoose.model('StudySession', StudySessionSchema);