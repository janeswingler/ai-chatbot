const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const QuizSchema = new Schema({
  participantID: String,
  systemID: String,
  sessionID: String,
  answers: {
    q1: String,
    q2: String,
    q3: String,
    q4: String,
    q5: String,
    q6: String,
  },
  tabSwitchCount: { type: Number, default: 0 },
  tabSwitches: [{ timestamp: String, action: String }],
  completedAt: { type: Date, default: Date.now },
  startedAt: Date,
  timeSpent: Number, // in seconds
});

module.exports = mongoose.model('Quiz', QuizSchema);
