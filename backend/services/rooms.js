const { v4: uuidv4 } = require('uuid');

const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateRoomCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_CHARS.charAt(Math.floor(Math.random() * ROOM_CODE_CHARS.length));
  }
  return code;
}

async function createRoom(redis, mode) {
  const roomId = uuidv4();
  const roomCode = generateRoomCode();
  
  const roomData = {
    roomCode,
    mode,
    peers: JSON.stringify([]),
    status: 'waiting',
    createdAt: Date.now()
  };

  try {
    await redis.hset(`room:${roomId}`, roomData);
    await redis.expire(`room:${roomId}`, 7200); // 2 hours
    
    await redis.set(`roomcode:${roomCode}`, roomId);
    await redis.expire(`roomcode:${roomCode}`, 7200);
    
    // For random rooms, add to waiting_rooms set so they can be found quickly
    if (mode === 'random') {
      await redis.sadd('waiting_rooms', roomId);
      await redis.expire('waiting_rooms', 7200);
    }
    
    console.log(`[ROOMS] Created new ${mode} room: ${roomId} (code: ${roomCode})`);
    return { roomId, roomCode };
  } catch (err) {
    console.error('[ROOMS] Error creating room:', err.message);
    throw err;
  }
}

async function joinRoom(redis, roomId, ghostId) {
  try {
    const roomData = await redis.hgetall(`room:${roomId}`);
    if (!roomData || !roomData.roomCode) {
      return null;
    }

    let peers = [];
    try {
      peers = JSON.parse(roomData.peers || '[]');
    } catch (e) {
      peers = [];
    }

    console.log(`[ROOMS] joinRoom: roomId=${roomId}, ghostId=${ghostId}, current peers=${JSON.stringify(peers)}`);

    const mode = roomData.mode || 'random';
    const maxPeers = mode === 'random' ? 2 : 999; // 2 for 1-on-1, unlimited for groups

    if (!peers.includes(ghostId) && peers.length < maxPeers) {
      peers.push(ghostId);
      await redis.hset(`room:${roomId}`, 'peers', JSON.stringify(peers));
      console.log(`[ROOMS] ✅ Added ${ghostId} to room ${roomId}, peers now: ${JSON.stringify(peers)}`);
    } else if (peers.includes(ghostId)) {
      console.log(`[ROOMS] ⚠️ ${ghostId} already in room`);
    } else {
      console.log(`[ROOMS] ⚠️ Room full (max ${maxPeers})`);
    }

    console.log(`[ROOMS] Returning peers: ${JSON.stringify(peers)}`);
    return {
      roomId,
      roomCode: roomData.roomCode,
      peers
    };
  } catch (err) {
    console.error('[ROOMS] Error joining room:', err.message);
    throw err;
  }
}

async function findWaitingRoom(redis) {
  try {
    // Use a more direct approach: maintain a "waiting_rooms" set in Redis
    // This is more efficient and reliable than scanning all room keys
    const waitingRoomIds = await redis.smembers('waiting_rooms');
    
    for (const roomId of waitingRoomIds) {
      const roomData = await redis.hgetall(`room:${roomId}`);
      if (roomData && roomData.roomCode && roomData.status === 'waiting' && roomData.mode === 'random') {
        let peers = [];
        try {
          peers = JSON.parse(roomData.peers || '[]');
        } catch (e) {
          peers = [];
        }
        
        // Found a room with exactly 1 peer waiting
        if (peers.length === 1) {
          // Try to atomically remove from waiting_rooms set
          const removed = await redis.srem('waiting_rooms', roomId);
          if (removed) {
            console.log(`[ROOMS] Found waiting room ${roomId} with ${peers.length} peer(s)`);
            return { roomId, roomCode: roomData.roomCode };
          }
        }
      }
    }
    
    console.log('[ROOMS] No waiting rooms found, will create new room');
    return null;
  } catch (err) {
    console.error('[ROOMS] Error finding waiting room:', err.message);
    return null;
  }
}

async function leaveRoom(redis, roomId, ghostId) {
  try {
    const roomData = await redis.hgetall(`room:${roomId}`);
    if (!roomData || !roomData.roomCode) {
      return;
    }

    let peers = [];
    try {
      peers = JSON.parse(roomData.peers || '[]');
    } catch (e) {
      peers = [];
    }

    peers = peers.filter(p => p !== ghostId);
    await redis.hset(`room:${roomId}`, 'peers', JSON.stringify(peers));

    if (peers.length === 0) {
      await redis.del(`room:${roomId}`);
      await redis.del(`roomcode:${roomData.roomCode}`);
      await redis.srem('waiting_rooms', roomId);
    } else if (roomData.mode === 'random' && peers.length === 1) {
      await redis.sadd('waiting_rooms', roomId);
    }
  } catch (err) {
    console.error('[ROOMS] Error leaving room:', err.message);
  }
}

async function getRoomPeers(redis, roomId) {
  try {
    const roomData = await redis.hgetall(`room:${roomId}`);
    if (!roomData || !roomData.roomCode) {
      return [];
    }

    try {
      return JSON.parse(roomData.peers || '[]');
    } catch (e) {
      return [];
    }
  } catch (err) {
    console.error('[ROOMS] Error getting room peers:', err.message);
    return [];
  }
}

async function getRoomByCode(redis, roomCode) {
  try {
    const roomId = await redis.get(`roomcode:${roomCode}`);
    return roomId;
  } catch (err) {
    console.error('[ROOMS] Error getting room by code:', err.message);
    return null;
  }
}

async function setRoomStatus(redis, roomId, status) {
  try {
    await redis.hset(`room:${roomId}`, 'status', status);
  } catch (err) {
    console.error('[ROOMS] Error setting room status:', err.message);
  }
}

module.exports = {
  createRoom,
  joinRoom,
  findWaitingRoom,
  leaveRoom,
  getRoomPeers,
  getRoomByCode,
  setRoomStatus
};
