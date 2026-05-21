require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const jwt = require('jsonwebtoken');

const { initSignaling } = require('./ws/signaling');
const identityRoutes = require('./routes/identity');
const roomsRoutes = require('./routes/rooms');
const friendsRoutes = require('./routes/friends');
const locationsRoutes = require('./routes/locations');

const app = express();

// Try to use real Redis, fall back to in-memory mock if not available
let redis;
let usesMock = false;

// Check environment variable for forcing mock
if (process.env.USE_REDIS_MOCK === 'true') {
  console.log('[REDIS] Forcing in-memory mock');
  usesMock = true;
  const InMemoryRedis = require('./lib/redis-mock');
  redis = new InMemoryRedis();
} else {
  // Try to use real Redis, but be quick about falling back to mock
  try {
    const Redis = require('ioredis');
    redis = new Redis({
      host: process.env.REDIS_URL?.split('//')[1]?.split(':')[0] || 'localhost',
      port: process.env.REDIS_URL?.split(':')[2]?.split('/')[0] || 6379,
      retryStrategy: () => null, // Disable auto-retry
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      enableOfflineQueue: false,
      connectTimeout: 1000
    });
    
    // Don't wait for connection - use mock if connection fails
    redis.on('error', (err) => {
      if (!usesMock) {
        console.log('[REDIS] Real Redis unavailable, switching to in-memory mock');
        usesMock = true;
        const InMemoryRedis = require('./lib/redis-mock');
        redis = new InMemoryRedis();
      }
    });
  } catch (err) {
    console.log('[REDIS] Using in-memory mock instead of ioredis');
    usesMock = true;
    const InMemoryRedis = require('./lib/redis-mock');
    redis = new InMemoryRedis();
  }
}

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

console.log('[REDIS] Redis client initialized', usesMock ? '(in-memory mock)' : '(will try to connect to real Redis)');


// Make redis available in routes
app.use((req, res, next) => {
  req.redis = redis;
  next();
});

// JWT verification middleware
function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// Routes
app.use('/api/identity', identityRoutes);
app.use('/api/rooms', requireAuth, roomsRoutes);
app.use('/api/friends', requireAuth, friendsRoutes);
app.use('/api/locations', requireAuth, locationsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket signaling
const signalingModule = initSignaling(server, redis);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[SERVER] HTTP server closed');
    redis.quit(() => {
      console.log('[SERVER] Redis connection closed');
      process.exit(0);
    });
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[SERVER] Drift Chat backend listening on port ${PORT}`);
});
