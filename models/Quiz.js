const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const QuizSchema = new Schema({
  participantID: String,
  systemID: String,
  answers: {
    q1: Number,
    q2: Number,
    q3: Number,
    q4: Number,
    q5: Number,
    q6: Number,
  },
  tabSwitchCount: { type: Number, default: 0 },
  tabSwitches: [{ timestamp: String, action: String }],
  completedAt: { type: Date, default: Date.now },
  startedAt: Date,
  timeSpent: Number, // in seconds
});

module.exports = mongoose.model('Quiz', QuizSchema);
