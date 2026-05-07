const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TopicPlanEventSchema = new Schema({
  participantID: { type: String, required: true },
  systemID: { type: String },
  sessionID: { type: String },
  topicId: { type: String },
  topicName: { type: String },
  eventName: { type: String },
  oldValue: { type: Schema.Types.Mixed },
  newValue: { type: Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now },
  meta: { type: Schema.Types.Mixed }
});

module.exports = mongoose.model('TopicPlanEvent', TopicPlanEventSchema);
