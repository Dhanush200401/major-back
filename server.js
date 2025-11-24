




// // server.js
// const express = require("express");
// const mongoose = require("mongoose");
// const dotenv = require("dotenv");
// const cors = require("cors");
// const http = require("http");
// const jwt = require("jsonwebtoken");
// const { Server } = require("socket.io");
// const cookieParser = require("cookie-parser");
// const cookie = require("cookie");

// dotenv.config();
// const app = express();

// // Middleware
// app.use(
//   cors({
//     origin: [
//       "http://localhost:3000",
//       "https://major-project-frontend-cyan.vercel.app",
//     ],
//     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//     credentials: true,
//   })
// );
// // required so browser includes cookies
// app.use((req, res, next) => {
//   res.header("Access-Control-Allow-Credentials", "true");
//   next();
// });

// app.use(express.json({ limit: "20mb" }));
// app.use(express.urlencoded({ extended: true, limit: "20mb" }));
// app.use(cookieParser());

// // Models
// const User = require("./models/User");

// // --------------------------
// // MONGO connection
// // --------------------------
// mongoose.connect(process.env.MONGO_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// })
// .then(() => console.log("MongoDB Connected"))
// .catch((err) => console.error("❌ MongoDB Error:", err.message));

// // create HTTP + socket.io server BEFORE mounting routes that need io
// const server = http.createServer(app);
// const io = new Server(server, {
//   cors: { origin: "http://localhost:3000", methods: ["GET", "POST"], credentials: true },
// });

// // give other modules (routes) access to io by requiring a factory (see fileRoutes below)
// const fileRoutes = require("./routes/fileRoutes")(io);
// const authRoutes = require("./routes/auth");
// const roomRoutes = require("./routes/roomRoutes");

// // mount routes
// app.use("/api/files", fileRoutes);
// app.use("/api/auth", authRoutes);
// app.use("/api/rooms", roomRoutes);

// // --------------------------
// // Simple user list endpoint
// // --------------------------
// app.get("/api/users", async (req, res) => {
//   try {
//     const users = await User.find({}).select("-password");
//     res.json(users);
//   } catch (err) {
//     console.error("GET /api/users error:", err);
//     res.status(500).json({ error: "Server error" });
//   }
// });

// // avatar update endpoint (unchanged from your original)
// app.put("/api/avatar", async (req, res) => {
//   try {
//     const token = req.headers.authorization || req.cookies?.jwt_token;
//     if (!token) return res.status(401).json({ error_msg: "No token provided" });

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const { avatar } = req.body;
//     if (!avatar) return res.status(400).json({ error_msg: "Avatar is required" });

//     const user = await User.findByIdAndUpdate(decoded.id, { avatar }, { new: true }).select("-password");
//     if (!user) return res.status(404).json({ error_msg: "User not found" });

//     res.json({ success: true, avatar: user.avatar });
//   } catch (err) {
//     console.error("PUT /api/avatar error:", err);
//     res.status(500).json({ error_msg: "Server error" });
//   }
// });

// // --------------------------
// // SOCKET.IO: rooms + events
// // --------------------------
// const rooms = {}; // roomId -> { userId -> meta }
// const getRoomUsers = (roomId) => Object.values(rooms[roomId] || {});

// // --- ZONE STORAGE ---
// // userZones: userId -> zoneName (string or null)
// // socketIdMap: userId -> socket.id
// const userZones = {};
// const socketIdMap = {};
// global.userZones = userZones;
// global.socketIdMap = socketIdMap;

// io.use((socket, next) => {
//   try {
//     let token = socket.handshake.auth?.token;
//     if (!token) {
//       const cookieHeader = socket.handshake.headers?.cookie;
//       if (cookieHeader) {
//         const parsed = cookie.parse(cookieHeader || "");
//         if (parsed?.jwt_token) token = parsed.jwt_token;
//       }
//     }
//     if (!token) return next(new Error("Auth error: token missing"));

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     socket.userId = decoded.id;
//     next();
//   } catch (err) {
//     console.log("Socket auth failed:", err.message);
//     next(new Error("Auth error: invalid token"));
//   }
// });

// io.on("connection", (socket) => {
//   console.log("Socket connected:", socket.id, "userId:", socket.userId);

//   // map userId -> socket.id
//   if (socket.userId) socketIdMap[socket.userId] = socket.id;

//   // --- join room ---
//   socket.on("joinRoom", async ({ roomId, avatar }) => {
//     try {
//       socket.roomId = roomId;
//       const user = await User.findById(socket.userId).select("name avatar");
//       if (!user) return;

//       socket.join(roomId);
//       if (!rooms[roomId]) rooms[roomId] = {};

//       rooms[roomId][socket.userId] = {
//         userId: socket.userId,
//         username: user.name,
//         avatar: avatar?.avatar || user.avatar,
//         x: 100, y: 100,
//         socketId: socket.id
//       };

//       socket.emit("currentPositions", rooms[roomId]);
//       socket.to(roomId).emit("userJoined", rooms[roomId][socket.userId]);
//       io.to(roomId).emit("onlineUsers", getRoomUsers(roomId));
//       console.log("User joined room:", socket.userId, "room:", roomId);
//     } catch (err) {
//       console.error("joinRoom error:", err);
//     }
//   });

//   socket.on("move", ({ roomId, x, y }) => {
//     if (rooms[roomId] && rooms[roomId][socket.userId]) {
//       rooms[roomId][socket.userId].x = x;
//       rooms[roomId][socket.userId].y = y;
//       socket.to(roomId).emit("userMoved", { userId: socket.userId, x, y });
//     }
//   });

//   socket.on("video-toggle", ({ enabled }) => {
//     const roomId = socket.roomId;
//     if (!roomId) return;
//     socket.to(roomId).emit("video-toggle", { userId: socket.userId, enabled });
//   });

//   // ------------------------------
//   // ZONE handling
//   // ------------------------------
//   socket.on("enterZone", ({ zone }) => {
//     try {
//       console.log("ENTER ZONE FROM USER:", socket.userId, "ZONE:", zone);
//       if (!socket.userId) return;
//       if (!zone) return;
//       userZones[socket.userId] = zone;

//       // recompute members in the same zone within the same room
//       const members = Object.entries(userZones)
//         .filter(([uid, z]) => z === zone)
//         .map(([uid]) => {
//           const meta = rooms[socket.roomId]?.[uid] || null;
//           return meta ? { userId: uid, username: meta.username, avatar: meta.avatar, x: meta.x, y: meta.y, socketId: meta.socketId } : { userId: uid };
//         });

//       // notify members in this zone (send same array)
//       members.forEach(m => {
//         const sid = socketIdMap[m.userId];
//         if (sid) io.to(sid).emit("zoneUsers", members);
//       });
//     } catch (err) {
//       console.warn("enterZone error:", err);
//     }
//   });

//   socket.on("leaveZone", () => {
//     try {
//       if (!socket.userId) return;
//       const prevZone = userZones[socket.userId];
//       delete userZones[socket.userId];

//       if (!prevZone) return;

//       // notify remaining members in prevZone
//       const remaining = Object.entries(userZones)
//         .filter(([uid, z]) => z === prevZone)
//         .map(([uid]) => {
//           const meta = rooms[socket.roomId]?.[uid] || null;
//           return meta ? { userId: uid, username: meta.username, avatar: meta.avatar, x: meta.x, y: meta.y, socketId: meta.socketId } : { userId: uid };
//         });

//       remaining.forEach(m => {
//         const sid = socketIdMap[m.userId];
//         if (sid) io.to(sid).emit("zoneUsers", remaining);
//       });
//     } catch (err) {
//       console.warn("leaveZone error:", err);
//     }
//   });

//   // ------------------------------
//   // Chat routing: only to same zone
//   // ------------------------------
//   socket.on("chat", ({ message }) => {
//     try {
//       const userId = socket.userId;
//       const zone = userZones[userId];
//       if (!zone) {
//         // user not in any zone -> ignore send
//         console.warn("User attempted to send chat while not in any zone:", userId);
//         return;
//       }

//       // attempt to get sender name from rooms map
//       const senderMeta = rooms[socket.roomId]?.[userId];
//       const fromName = senderMeta?.username || "User";

//       // Build payload once
//       const payload = {
//         from: userId,
//         fromName,
//         message,
//         zone
//       };

//       // Send message to every user currently mapped to the same zone
//       for (const [uid, z] of Object.entries(userZones)) {
//         if (z === zone) {
//           const sid = socketIdMap[uid];
//           if (sid) {
//             io.to(sid).emit("chat", payload);
//           }
//         }
//       }
//     } catch (err) {
//       console.error("chat handler error:", err);
//     }
//   });

//   // ------------------------------
//   // Signaling (improved) - route to a specific user's socket id
//   // ------------------------------
//   socket.on("signal", (msg = {}) => {
//     try {
//       const to = msg.to;
//       if (!to) return;
//       const targetSocketId = socketIdMap[to];
//       if (!targetSocketId) return;

//       // Optional: enforce zone-level signaling (sender and receiver must be in same zone)
//       const senderZone = userZones[socket.userId];
//       const targetZone = userZones[to];
//       if (senderZone && targetZone && senderZone !== targetZone) {
//         console.warn("Blocked signal between different zones:", { from: socket.userId, to, senderZone, targetZone });
//         return;
//       }

//       io.to(targetSocketId).emit("signal", { ...msg, from: socket.userId });
//     } catch (err) {
//       console.error("signal err:", err);
//     }
//   });

//   // ------------------------------
//   // Cleanup on disconnect
//   // ------------------------------
//   socket.on("disconnecting", () => {
//     const joinedRooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
//     joinedRooms.forEach((roomId) => {
//       if (rooms[roomId] && rooms[roomId][socket.userId]) {
//         delete rooms[roomId][socket.userId];
//         io.to(roomId).emit("userLeft", { userId: socket.userId });
//         io.to(roomId).emit("onlineUsers", Object.values(rooms[roomId]));
//       }
//     });

//     // remove user from zone mapping & socket map & notify zone members if needed
//     try {
//       const prevZone = userZones[socket.userId];
//       delete userZones[socket.userId];
//       delete socketIdMap[socket.userId];

//       if (prevZone) {
//         const remaining = Object.entries(userZones)
//           .filter(([uid, z]) => z === prevZone)
//           .map(([uid]) => {
//             const meta = rooms[socket.roomId]?.[uid] || null;
//             return meta ? { userId: uid, username: meta.username, avatar: meta.avatar, x: meta.x, y: meta.y, socketId: meta.socketId } : { userId: uid };
//           });
//         remaining.forEach(m => {
//           const sid = socketIdMap[m.userId];
//           if (sid) io.to(sid).emit("zoneUsers", remaining);
//         });
//       }
//     } catch (err) {
//       console.warn("disconnect cleanup error", err);
//     }

//     console.log("Disconnected:", socket.userId);
//   });
// });

// // start server
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

















// server.js
const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const cookieParser = require("cookie-parser");
const cookie = require("cookie");

dotenv.config();
const app = express();

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://major-project-frontend-cyan.vercel.app",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
// required so browser includes cookies
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(cookieParser());

// Models
const User = require("./models/User");

// --------------------------
// MONGO connection
// --------------------------
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("MongoDB Connected"))
.catch((err) => console.error("❌ MongoDB Error:", err.message));

// create HTTP + socket.io server BEFORE mounting routes that need io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:3000", methods: ["GET", "POST"], credentials: true },
});

// give other modules (routes) access to io by requiring a factory (see fileRoutes below)
const fileRoutes = require("./routes/fileRoutes")(io);
const authRoutes = require("./routes/auth");
const roomRoutes = require("./routes/roomRoutes");

// mount routes
app.use("/api/files", fileRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/rooms", roomRoutes);

// --------------------------
// Simple user list endpoint
// --------------------------
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({}).select("-password");
    res.json(users);
  } catch (err) {
    console.error("GET /api/users error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// avatar update endpoint (unchanged from your original)
app.put("/api/avatar", async (req, res) => {
  try {
    const token = req.headers.authorization || req.cookies?.jwt_token;
    if (!token) return res.status(401).json({ error_msg: "No token provided" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { avatar } = req.body;
    if (!avatar) return res.status(400).json({ error_msg: "Avatar is required" });

    const user = await User.findByIdAndUpdate(decoded.id, { avatar }, { new: true }).select("-password");
    if (!user) return res.status(404).json({ error_msg: "User not found" });

    res.json({ success: true, avatar: user.avatar });
  } catch (err) {
    console.error("PUT /api/avatar error:", err);
    res.status(500).json({ error_msg: "Server error" });
  }
});

// --------------------------
// SOCKET.IO: rooms + events
// --------------------------
const rooms = {}; // roomId -> { userId -> meta }
const getRoomUsers = (roomId) => Object.values(rooms[roomId] || {});

// --- ZONE STORAGE ---
// userZones: userId -> zoneName (string or null)
// socketIdMap: userId -> socket.id
const userZones = {};
const socketIdMap = {};
global.userZones = userZones;
global.socketIdMap = socketIdMap;

io.use((socket, next) => {
  try {
    let token = socket.handshake.auth?.token;
    if (!token) {
      const cookieHeader = socket.handshake.headers?.cookie;
      if (cookieHeader) {
        const parsed = cookie.parse(cookieHeader || "");
        if (parsed?.jwt_token) token = parsed.jwt_token;
      }
    }
    if (!token) return next(new Error("Auth error: token missing"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    console.log("Socket auth failed:", err.message);
    next(new Error("Auth error: invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id, "userId:", socket.userId);

  // map userId -> socket.id
  if (socket.userId) socketIdMap[socket.userId] = socket.id;

  // --- join room ---
  socket.on("joinRoom", async ({ roomId, avatar }) => {
    try {
      socket.roomId = roomId;
      const user = await User.findById(socket.userId).select("name avatar");
      if (!user) return;

      socket.join(roomId);
      if (!rooms[roomId]) rooms[roomId] = {};

      rooms[roomId][socket.userId] = {
        userId: socket.userId,
        username: user.name,
        avatar: avatar?.avatar || user.avatar,
        x: 100, y: 100,
        socketId: socket.id
      };

      socket.emit("currentPositions", rooms[roomId]);
      socket.to(roomId).emit("userJoined", rooms[roomId][socket.userId]);
      io.to(roomId).emit("onlineUsers", getRoomUsers(roomId));
      console.log("User joined room:", socket.userId, "room:", roomId);
    } catch (err) {
      console.error("joinRoom error:", err);
    }
  });

  socket.on("move", ({ roomId, x, y }) => {
    if (rooms[roomId] && rooms[roomId][socket.userId]) {
      rooms[roomId][socket.userId].x = x;
      rooms[roomId][socket.userId].y = y;
      socket.to(roomId).emit("userMoved", { userId: socket.userId, x, y });
    }
  });

  socket.on("video-toggle", ({ enabled }) => {
    const roomId = socket.roomId;
    if (!roomId) return;
    socket.to(roomId).emit("video-toggle", { userId: socket.userId, enabled });
  });

  // ------------------------------
  // ZONE handling
  // ------------------------------
// ------------------------------
// ZONE handling (updated)
// ------------------------------
socket.on("enterZone", ({ zone }) => {
  try {
    if (!socket.userId) return;
    if (!zone) return;
    const prev = userZones[socket.userId];
    // If zone didn't change, ignore (dedupe)
    if (prev === zone) {
      console.debug("enterZone ignored (same zone):", socket.userId, zone);
      return;
    }
    userZones[socket.userId] = zone;

    // recompute members in the same zone within the same room
    const members = Object.entries(userZones)
      .filter(([uid, z]) => z === zone)
      .map(([uid]) => {
        const meta = rooms[socket.roomId]?.[uid] || null;
        return meta ? { userId: uid, username: meta.username, avatar: meta.avatar, x: meta.x, y: meta.y, socketId: meta.socketId } : { userId: uid };
      });

    // notify members in this zone (send same array)
    members.forEach(m => {
      const sid = socketIdMap[m.userId];
      if (sid) io.to(sid).emit("zoneUsers", members);
    });
  } catch (err) {
    console.warn("enterZone error:", err);
  }
});


  socket.on("leaveZone", () => {
    try {
      if (!socket.userId) return;
      const prevZone = userZones[socket.userId];
      delete userZones[socket.userId];

      if (!prevZone) return;

      // notify remaining members in prevZone
      const remaining = Object.entries(userZones)
        .filter(([uid, z]) => z === prevZone)
        .map(([uid]) => {
          const meta = rooms[socket.roomId]?.[uid] || null;
          return meta ? { userId: uid, username: meta.username, avatar: meta.avatar, x: meta.x, y: meta.y, socketId: meta.socketId } : { userId: uid };
        });

      remaining.forEach(m => {
        const sid = socketIdMap[m.userId];
        if (sid) io.to(sid).emit("zoneUsers", remaining);
      });
    } catch (err) {
      console.warn("leaveZone error:", err);
    }
  });

  // ------------------------------
  // Chat routing: only to same zone
  // ------------------------------
// ------------------------------
// Chat routing: only to same zone (skip sender to avoid duplicates)
// ------------------------------
socket.on("chat", ({ message }) => {
  try {
    const userId = socket.userId;
    const zone = userZones[userId];
    if (!zone) {
      console.warn("User attempted to send chat while not in any zone:", userId);
      return;
    }

    const senderMeta = rooms[socket.roomId]?.[userId];
    const fromName = senderMeta?.username || "User";

    const payload = {
      from: userId,
      fromName,
      message,
      zone
    };

    // send to every user currently mapped to the same zone, but skip the sender
    for (const [uid, z] of Object.entries(userZones)) {
      if (z === zone && uid !== userId) { // <-- skip sender
        const sid = socketIdMap[uid];
        if (sid) {
          io.to(sid).emit("chat", payload);
        }
      }
    }

    // Optionally you can log it
    console.debug("chat broadcasted from", userId, "zone", zone);
  } catch (err) {
    console.error("chat handler error:", err);
  }
});


  // ------------------------------
  // Signaling (improved) - route to a specific user's socket id
  // ------------------------------
  socket.on("signal", (msg = {}) => {
    try {
      const to = msg.to;
      if (!to) return;
      const targetSocketId = socketIdMap[to];
      if (!targetSocketId) return;

      // Optional: enforce zone-level signaling (sender and receiver must be in same zone)
      const senderZone = userZones[socket.userId];
      const targetZone = userZones[to];
      if (senderZone && targetZone && senderZone !== targetZone) {
        console.warn("Blocked signal between different zones:", { from: socket.userId, to, senderZone, targetZone });
        return;
      }

      io.to(targetSocketId).emit("signal", { ...msg, from: socket.userId });
    } catch (err) {
      console.error("signal err:", err);
    }
  });

  // ------------------------------
  // Cleanup on disconnect
  // ------------------------------
  socket.on("disconnecting", () => {
    const joinedRooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    joinedRooms.forEach((roomId) => {
      if (rooms[roomId] && rooms[roomId][socket.userId]) {
        delete rooms[roomId][socket.userId];
        io.to(roomId).emit("userLeft", { userId: socket.userId });
        io.to(roomId).emit("onlineUsers", Object.values(rooms[roomId]));
      }
    });

    // remove user from zone mapping & socket map & notify zone members if needed
    try {
      const prevZone = userZones[socket.userId];
      delete userZones[socket.userId];
      delete socketIdMap[socket.userId];

      if (prevZone) {
        const remaining = Object.entries(userZones)
          .filter(([uid, z]) => z === prevZone)
          .map(([uid]) => {
            const meta = rooms[socket.roomId]?.[uid] || null;
            return meta ? { userId: uid, username: meta.username, avatar: meta.avatar, x: meta.x, y: meta.y, socketId: meta.socketId } : { userId: uid };
          });
        remaining.forEach(m => {
          const sid = socketIdMap[m.userId];
          if (sid) io.to(sid).emit("zoneUsers", remaining);
        });
      }
    } catch (err) {
      console.warn("disconnect cleanup error", err);
    }

    console.log("Disconnected:", socket.userId);
  });
});

// start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
