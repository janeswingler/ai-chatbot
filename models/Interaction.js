const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// const InteractionSchema = new Schema({
//     participantID: String,
//     userInput: String, // Store the user's message
//     botResponse: String, // Store the bot's response
//     timestamp: { type: Date, default: Date.now } // Log the time of interaction
// });

const RetrievedChunkSchema = new Schema({
    documentId: Schema.Types.ObjectId,
    documentName: String,
    chunkIndex: Number,
    chunkText: String,
    score: Number
}, { _id: false });

const InteractionSchema = new Schema({
    participantID: String,
    userInput: String,
    botResponse: String,
    retrievalMethod: { type: String, enum: ['semantic', 'tfidf'], default: 'semantic' },
    retrievedChunks: { type: [RetrievedChunkSchema], default: [] },
    confidence: {
        topScore: Number,       // score of the best chunk
        avgScore: Number,       // average score across retrieved chunks
        chunkCount: Number      // how many chunks were retrieved
    },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Interaction', InteractionSchema);