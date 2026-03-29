//Captures uploaded documents and their processed chunks
//For semantic retrieval, each chunk should also support an embedding field so the system can compare prompt embeddings to stored chunk embeddings later.

const mongoose = require("mongoose");

const ChunkSchema = new mongoose.Schema({
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: false } // For semantic retrieval
}, { _id: false });

const DocumentSchema = new mongoose.Schema({
    filename: { type: String, required: true },
    text: { type: String, required: true },
    chunks: { type: [ChunkSchema], default: [] },
    processingStatus: { type: String, default: "ready" },
    processedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Document", DocumentSchema);