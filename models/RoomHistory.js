const mongoose = require("mongoose");

const RoomHistorySchema = new mongoose.Schema({
  roomId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  lastJoined: { type: Date, default: Date.now }
});

module.exports = mongoose.model("RoomHistory", RoomHistorySchema);
