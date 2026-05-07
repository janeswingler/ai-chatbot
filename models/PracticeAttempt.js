const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PracticeAttemptSchema = new Schema({
  participantID: { type: String, required: true },
  systemID: { type: String },
  sessionID: { type: String },
  practiceId: { type: String },
  topic: { type: String },
  problemHash: { type: String },
  stepIndex: { type: Number },
  stepInstruction: { type: String },
  expectedAnswer: { type: String },
  studentAnswerRaw: { type: String },
  isCorrect: { type: Boolean },
  retryCount: { type: Number, default: 0 },
  actionType: { type: String },
  startedAt: { type: Date },
  submittedAt: { type: Date, default: Date.now },
  latencyMs: { type: Number },
  meta: { type: Schema.Types.Mixed }
}, { timestamps: true });

module.exports = mongoose.model('PracticeAttempt', PracticeAttemptSchema);
