const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ResponseItemSchema = new Schema({
  questionNumber: { type: Number, required: true },
  response: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const QuizResponseSchema = new Schema({
  participantID: { type: String, required: true },
  systemID: String,
  sessionID: String,
  quizId: { type: Schema.Types.ObjectId, ref: 'Quiz' },
  responses: { type: [ResponseItemSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('QuizResponse', QuizResponseSchema);
