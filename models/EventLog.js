const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const EventLogSchema = new Schema({
    participantID: { type: String },
    systemID: { type: String },
    sessionID: { type: String },
    eventType: { type: String }, // Type of event (click, hover, focus)
    elementName: { type: String }, // Name of the element (e.g., Send Button)
    eventProps: { type: Schema.Types.Mixed },
    clientTs: { type: Date },
    page: { type: String },
    uiVersion: { type: String },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('EventLog', EventLogSchema);