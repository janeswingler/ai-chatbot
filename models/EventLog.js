const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const EventLogSchema = new Schema({
    participantID: String,
    eventType: String, // Type of event (click, hover, focus)
    elementName: String, // Name of the element (e.g., Send Button)
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('EventLog', EventLogSchema);