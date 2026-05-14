const express = require('express');
const router = express.Router();
const roomsService = require('../services/rooms');

router.post('/join', async (req, res) => {
  try {
    const ghostId = req.user.ghostId;
    const ghostName = req.user.ghostName;
    const { mode, roomCode } = req.body;

    if (!mode || (mode !== 'random' && mode !== 'group')) {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    console.log(`[API] Join request: ${ghostName} (${ghostId}), mode: ${mode}`);

    let roomId, roomCodeResult, peers;

    if (mode === 'random') {
      // Find waiting room or create new one
      const waitingRoom = await roomsService.findWaitingRoom(req.redis);
      
      if (waitingRoom) {
        console.log(`[API] Joining existing room: ${waitingRoom.roomId}`);
        roomId = waitingRoom.roomId;
        roomCodeResult = waitingRoom.roomCode;
        peers = []; // Don't return peers yet - WebSocket join-room will handle it
      } else {
        const newRoom = await roomsService.createRoom(req.redis, 'random');
        console.log(`[API] Created new room: ${newRoom.roomId}`);
        roomId = newRoom.roomId;
        roomCodeResult = newRoom.roomCode;
        peers = []; // Don't return peers yet - WebSocket join-room will handle it
      }
      
      // CRITICAL: Don't add peer here - let WebSocket join-room handle peer management
      // This prevents race conditions between REST and WebSocket layers
      console.log(`[API] Room ${roomId} ready for WebSocket join (peers managed via WebSocket)`);
    } else if (mode === 'group') {
      if (roomCode) {
        // Join existing room by code
        roomId = await roomsService.getRoomByCode(req.redis, roomCode);
        if (!roomId) {
          return res.status(404).json({ error: 'Room not found' });
        }
        const joinResult = await roomsService.joinRoom(req.redis, roomId, ghostId);
        if (!joinResult) {
          return res.status(404).json({ error: 'Room not found' });
        }
        roomCodeResult = roomCode;
        peers = joinResult.peers;
      } else {
        // Create new room
        const newRoom = await roomsService.createRoom(req.redis, 'group');
        roomId = newRoom.roomId;
        roomCodeResult = newRoom.roomCode;
        const joinResult = await roomsService.joinRoom(req.redis, roomId, ghostId);
        peers = joinResult.peers;
      }
    }

    res.json({
      roomId,
      roomCode: roomCodeResult,
      peers
    });
  } catch (err) {
    console.error('[ROOMS] Error in /join:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const roomData = await req.redis.hgetall(`room:${roomId}`);

    if (!roomData || !roomData.roomCode) {
      return res.status(404).json({ error: 'Room not found' });
    }

    let peers = [];
    try {
      peers = JSON.parse(roomData.peers || '[]');
    } catch (e) {
      peers = [];
    }

    res.json({
      roomId,
      roomCode: roomData.roomCode,
      peers,
      status: roomData.status
    });
  } catch (err) {
    console.error('[ROOMS] Error in GET /:roomId:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
