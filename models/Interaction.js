const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const InteractionSchema = new Schema({
    participantID: String,
    userInput: String, // Store the user's message
    botResponse: String, // Store the bot's response
    timestamp: { type: Date, default: Date.now } // Log the time of interaction
});

module.exports = mongoose.model('Interaction', InteractionSchema);