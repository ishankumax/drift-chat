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
    
    // For random rooms, add to waiting_rooms list (LPUSH for atomic LPOP later)
    if (mode === 'random') {
      await redis.lpush('waiting_rooms', roomId);
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
    // BUG FIX: Use LPOP for atomic room assignment - prevents race conditions
    // LPOP is atomic: only ONE caller gets the room, no duplicates
    const roomId = await redis.lpop('waiting_rooms');
    
    if (!roomId) {
      console.log('[ROOMS] No waiting rooms in queue');
      return null;
    }

    // Verify room still exists and has exactly 1 peer
    const roomData = await redis.hgetall(`room:${roomId}`);
    if (!roomData || !roomData.roomCode) {
      console.log(`[ROOMS] Room ${roomId} no longer exists after LPOP`);
      return null;
    }

    let peers = [];
    try {
      peers = JSON.parse(roomData.peers || '[]');
    } catch (e) {
      peers = [];
    }

    // Verify room has exactly 1 peer and is in waiting state
    if (peers.length === 1 && roomData.mode === 'random' && roomData.status === 'waiting') {
      console.log(`[ROOMS] ✅ Found valid waiting room ${roomId} with 1 peer (LPOP atomic)`);
      return { roomId, roomCode: roomData.roomCode };
    }

    // Room doesn't meet criteria - put it back for other callers
    if (peers.length === 1 && roomData.mode === 'random') {
      console.log(`[ROOMS] Room ${roomId} has 1 peer but wrong status, returning to queue`);
      await redis.lpush('waiting_rooms', roomId);
    } else if (peers.length === 0 && roomData.mode === 'random') {
      console.log(`[ROOMS] Room ${roomId} has 0 peers, returning to queue`);
      await redis.lpush('waiting_rooms', roomId);
    } else {
      console.log(`[ROOMS] Room ${roomId} doesn't match waiting criteria (peers=${peers.length}, mode=${roomData.mode})`);
    }

    console.log('[ROOMS] No valid waiting rooms found, will create new room');
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
      // Don't need to remove from waiting_rooms - it's a list, not a set
      console.log(`[ROOMS] ✅ Deleted empty room ${roomId}`);
    } else if (roomData.mode === 'random' && peers.length === 1) {
      await redis.lpush('waiting_rooms', roomId);
      console.log(`[ROOMS] ✅ Room ${roomId} back to waiting (1 peer left)`);
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
