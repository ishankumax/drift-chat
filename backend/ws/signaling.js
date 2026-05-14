const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const abuse = require('../services/abuse');

function initSignaling(server, redis) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  // Maps to track connections and room membership
  const connections = new Map(); // ghostId -> WebSocket
  const roomMembers = new Map(); // roomId -> Set of ghostIds

  // Heartbeat timer
  const heartbeatInterval = setInterval(() => {
    connections.forEach((ws, ghostId) => {
      if (ws.isAlive === false) {
        ws.terminate();
        connections.delete(ghostId);
        return;
      }
      ws.isAlive = false;
      ws.ping(() => {});
    });
  }, 30000);

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    console.log(`[WS] New connection attempt, total connections: ${connections.size}`);

    if (!token) {
      ws.close(4401, 'Unauthorized: No token provided');
      return;
    }

    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      ws.close(4401, 'Unauthorized: Invalid token');
      return;
    }

    const ghostId = decodedToken.ghostId;
    const ghostName = decodedToken.ghostName;
    const avatarId = decodedToken.avatarId;

    // TODO: Ban check disabled for development - re-enable when ban system is tested
    // const isBanned = await abuse.isBanned(redis, ghostId);
    // if (isBanned) {
    //   ws.close(4403, 'Forbidden: Banned');
    //   return;
    // }

    ws.ghostId = ghostId;
    ws.ghostName = ghostName;
    ws.avatarId = avatarId;
    ws.isAlive = true;

    connections.set(ghostId, ws);
    console.log(`[WS] ✓ Connected: ${ghostName} (${ghostId})`);
    console.log(`[WS] Total active connections: ${connections.size}`);
    console.log(`[WS] Active connection IDs: ${Array.from(connections.keys()).join(', ')}`);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        console.log(`[WS] Message from ${ghostName} (${ghostId}): TYPE=${message.type}, DATA=`, message);
        handleMessage(message, ws, redis, connections, roomMembers, ghostId, ghostName, avatarId);
      } catch (err) {
        console.error('[WS] Message parse error:', err.message);
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Disconnected: ${ghostName} (${ghostId})`);
      connections.delete(ghostId);
      console.log(`[WS] Active connections after disconnect: ${connections.size}`);

      // BUG FIX 8 & 9: Properly broadcast peer-left to all peers in all rooms and clean up Redis
      roomMembers.forEach((members, roomId) => {
        if (members.has(ghostId)) {
          members.delete(ghostId);
          console.log(`[WS] Removed ${ghostId} from room ${roomId}`);
          
          // Broadcast peer-left to remaining peers
          members.forEach(peerId => {
            const peerWs = connections.get(peerId);
            if (peerWs && peerWs.readyState === 1) {
              peerWs.send(JSON.stringify({
                type: 'peer-left',
                peerId: ghostId
              }));
              console.log(`[WS] Sent peer-left for ${ghostId} to ${peerId}`);
            }
          });

          // BUG FIX 9: Clean up Redis too
          redis.hgetall(`room:${roomId}`).then(roomData => {
            if (roomData && roomData.peers) {
              let peers = JSON.parse(roomData.peers || '[]');
              peers = peers.filter(p => p !== ghostId);
              redis.hset(`room:${roomId}`, 'peers', JSON.stringify(peers)).catch(err => {
                console.error('[WS] Error updating Redis on disconnect:', err.message);
              });
            }
          }).catch(err => {
            console.error('[WS] Error querying room in Redis:', err.message);
          });

          // Clean up empty rooms
          if (members.size === 0) {
            roomMembers.delete(roomId);
            redis.del(`room:${roomId}`).catch(err => {
              console.error('[WS] Error deleting room from Redis:', err.message);
            });
            redis.srem('waiting_rooms', roomId).catch(err => {
              console.error('[WS] Error removing from waiting_rooms:', err.message);
            });
            console.log(`[WS] Deleted empty room ${roomId}`);
          }
        }
      });
    });

    ws.on('error', (err) => {
      console.error('[WS] Connection error:', err.message || err);
    });
  });

  // Log WebSocket server errors
  wss.on('error', (err) => {
    console.error('[WSS] Server error:', err);
  });

  async function handleMessage(message, ws, redis, connections, roomMembers, ghostId, ghostName, avatarId) {
    const { type } = message;

    switch (type) {
      case 'join-room':
        await handleJoinRoom(message, ws, redis, connections, roomMembers, ghostId, ghostName, avatarId);
        break;
      case 'leave-room':
        await handleLeaveRoom(message, ws, redis, connections, roomMembers, ghostId);
        break;
      case 'offer':
        handleRelay(message, connections, roomMembers, ghostId);
        break;
      case 'answer':
        handleRelay(message, connections, roomMembers, ghostId);
        break;
      case 'ice-candidate':
        handleRelay(message, connections, roomMembers, ghostId);
        break;
      case 'chat-message':
        await handleChatMessage(message, ws, redis, connections, roomMembers, ghostId, ghostName);
        break;
      case 'report':
        await handleReport(message, redis, connections, roomMembers, ghostId);
        break;
      case 'friend-request':
        handleRelay(message, connections, roomMembers, ghostId, ghostName, avatarId);
        break;
      case 'friend-accept':
        await handleFriendAccept(message, redis, connections, ghostId, ghostName, avatarId);
        break;
      case 'typing':
        handleRelay(message, connections, roomMembers, ghostId);
        break;
      case 'ping':
        // BUG FIX 7: Handle heartbeat ping - send pong back
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
        break;
      default:
        console.log('[WS] Unknown message type:', type);
    }
  }

  async function handleJoinRoom(message, ws, redis, connections, roomMembers, ghostId, ghostName, avatarId) {
    const { roomId } = message;
    if (!roomId) return;

    console.log(`[WS] handleJoinRoom: ${ghostName} (${ghostId}) joining room ${roomId}`);

    // BUG FIX 9: Load room peers from Redis (REST API integration)
    // Check if room exists in Redis (was created via REST API)
    let redisPeers = [];
    try {
      console.log(`[WS] Querying Redis for room:${roomId}...`);
      const roomData = await redis.hgetall(`room:${roomId}`);
      console.log(`[WS] Redis query result:`, JSON.stringify(roomData));
      
      if (roomData && Object.keys(roomData).length > 0) {
        console.log(`[WS] Room found in Redis. Peers field:`, roomData.peers);
        if (roomData.peers) {
          redisPeers = JSON.parse(roomData.peers || '[]');
          console.log(`[WS] ✓ Loaded room from Redis with peers: ${JSON.stringify(redisPeers)}`);
        }
      } else {
        console.log(`[WS] Room NOT found in Redis or empty`);
      }
    } catch (err) {
      console.error('[WS] Error loading room from Redis:', err.message, err.stack);
    }

    // Initialize room members set if needed
    if (!roomMembers.has(roomId)) {
      console.log(`[WS] Creating new room set for ${roomId}`);
      roomMembers.set(roomId, new Set());
      
      // BUG FIX 9: Add Redis peers to in-memory tracking
      redisPeers.forEach(peerId => {
        roomMembers.get(roomId).add(peerId);
      });
    }

    const room = roomMembers.get(roomId);
    const wasEmpty = room.size === 0;
    
    // Add current peer to room
    room.add(ghostId);
    
    // BUG FIX 9: Also update Redis with current peer
    redisPeers.push(ghostId);
    try {
      await redis.hset(`room:${roomId}`, 'peers', JSON.stringify(Array.from(new Set(redisPeers))));
      console.log(`[WS] ✓ Updated Redis peers for room ${roomId}`);
    } catch (err) {
      console.error('[WS] Error updating Redis peers:', err.message);
    }

    console.log(`[WS] Room ${roomId} now has ${room.size} members: ${Array.from(room).join(', ')}`);

    // Send current peers to joining client
    const peers = Array.from(room)
      .filter(pid => pid !== ghostId)
      .map(pid => {
        const peerWs = connections.get(pid);
        if (peerWs) {
          return {
            ghostId: pid,
            ghostName: peerWs.ghostName,
            avatarId: peerWs.avatarId
          };
        }
        return null;
      })
      .filter(Boolean);

    console.log(`[WS] Sending room-joined to ${ghostName}: ${peers.length} peers - ${JSON.stringify(peers)}`);
    ws.send(JSON.stringify({
      type: 'room-joined',
      peers
    }));
    console.log(`[WS] ✓ room-joined sent to ${ghostName}`);

    // Broadcast to other peers
    console.log(`[WS] Broadcasting peer-joined to existing ${room.size - 1} members`);
    room.forEach(peerId => {
      if (peerId !== ghostId) {
        const peerWs = connections.get(peerId);
        console.log(`[WS] Checking peer ${peerId}: has WS? ${!!peerWs}, ready? ${peerWs?.readyState === 1}`);
        if (peerWs && peerWs.readyState === 1) {
          console.log(`[WS] ✓ Sending peer-joined to ${peerId} for new peer ${ghostName}`);
          peerWs.send(JSON.stringify({
            type: 'peer-joined',
            peerId: ghostId,
            ghostName,
            avatarId
          }));
        } else {
          console.log(`[WS] ✗ Cannot send to ${peerId}: WS=${!!peerWs}, readyState=${peerWs?.readyState}`);
        }
      }
    });
  }

  async function handleLeaveRoom(message, ws, redis, connections, roomMembers, ghostId) {
    const { roomId } = message;
    if (!roomId || !roomMembers.has(roomId)) return;

    const room = roomMembers.get(roomId);
    room.delete(ghostId);

    // BUG FIX 9: Also update Redis when peer leaves
    try {
      const roomData = await redis.hgetall(`room:${roomId}`);
      if (roomData && roomData.peers) {
        let peers = JSON.parse(roomData.peers || '[]');
        peers = peers.filter(p => p !== ghostId);
        await redis.hset(`room:${roomId}`, 'peers', JSON.stringify(peers));
        console.log(`[WS] ✓ Updated Redis after peer left: ${ghostId}`);
      }
    } catch (err) {
      console.error('[WS] Error updating Redis on leave:', err.message);
    }

    // Broadcast to remaining peers
    room.forEach(peerId => {
      const peerWs = connections.get(peerId);
      if (peerWs && peerWs.readyState === 1) {
        peerWs.send(JSON.stringify({
          type: 'peer-left',
          peerId: ghostId
        }));
      }
    });

    if (room.size === 0) {
      roomMembers.delete(roomId);
      // BUG FIX 9: Mark room as deleted in Redis too
      try {
        await redis.del(`room:${roomId}`);
        await redis.srem('waiting_rooms', roomId);
        console.log(`[WS] ✓ Cleaned up empty room in Redis: ${roomId}`);
      } catch (err) {
        console.error('[WS] Error cleaning up room in Redis:', err.message);
      }
    }
  }

  // BUG FIX 7: Add relay guards - check target exists and is in same room
  function handleRelay(message, connections, roomMembers, ghostId, ghostName = null, avatarId = null) {
    const { targetPeerId, type } = message;
    if (!targetPeerId) return;

    const targetWs = connections.get(targetPeerId);
    
    // Check if target exists
    if (!targetWs) {
      console.warn(`[WS] Relay failed: target ${targetPeerId} not connected (from ${ghostId}, type: ${type})`);
      return;
    }

    // Check if WebSocket is open
    if (targetWs.readyState !== 1) {
      console.warn(`[WS] Relay failed: target ${targetPeerId} WebSocket not open (state: ${targetWs.readyState}, from ${ghostId}, type: ${type})`);
      return;
    }

    // For SDP and ICE messages, verify both peers are in the same room
    if (['offer', 'answer', 'ice-candidate'].includes(type)) {
      let inSameRoom = false;
      for (const [roomId, members] of roomMembers) {
        if (members.has(ghostId) && members.has(targetPeerId)) {
          inSameRoom = true;
          break;
        }
      }
      
      if (!inSameRoom) {
        console.warn(`[WS] Relay blocked: ${ghostId} and ${targetPeerId} not in same room (type: ${type})`);
        return;
      }
    }

    console.log(`[WS] Relaying ${type} from ${ghostId} to ${targetPeerId}`);
    const relayMessage = {
      ...message,
      fromPeerId: ghostId
    };
    if (ghostName) relayMessage.ghostName = ghostName;
    if (avatarId) relayMessage.avatarId = avatarId;
    targetWs.send(JSON.stringify(relayMessage));
  }

  async function handleChatMessage(message, ws, redis, connections, roomMembers, ghostId, ghostName) {
    let { roomId, text } = message;
    if (!roomId || !text) return;

    // Sanitize text: strip HTML
    text = text.replace(/<[^>]*>/g, '').substring(0, 500);

    if (!roomMembers.has(roomId)) return;
    const room = roomMembers.get(roomId);

    const chatMessage = {
      type: 'chat-message',
      fromPeerId: ghostId,
      ghostName,
      text,
      timestamp: Date.now()
    };

    // Broadcast to OTHER peers only (not sender)
    room.forEach(peerId => {
      if (peerId !== ghostId) {  // Exclude sender to prevent echo
        const peerWs = connections.get(peerId);
        if (peerWs && peerWs.readyState === 1) {
          peerWs.send(JSON.stringify(chatMessage));
        }
      }
    });
  }

  async function handleReport(message, redis, connections, roomMembers, ghostId) {
    const { targetPeerId, reason, roomId } = message;
    if (!targetPeerId || !reason) return;

    console.log(`[ABUSE] Report: ${ghostId} → ${targetPeerId} for "${reason}"`);
    
    // Find the room ID if not provided
    let actualRoomId = roomId;
    if (!actualRoomId) {
      roomMembers.forEach((members, rId) => {
        if (members.has(ghostId) && members.has(targetPeerId)) {
          actualRoomId = rId;
        }
      });
    }

    if (actualRoomId) {
      await abuse.receiveReport(redis, ghostId, targetPeerId, actualRoomId, reason, {
        roomMembers,
        connections
      });
    }
  }

  async function handleFriendAccept(message, redis, connections, ghostId, ghostName, avatarId) {
    const { targetPeerId, partnerGhostName, partnerAvatarId } = message;
    if (!targetPeerId) return;

    const { v4: uuidv4 } = require('uuid');
    const sharedChatId = uuidv4();

    const expiresAt = Date.now() + 3 * 24 * 60 * 60 * 1000; // 72 hours
    const friendship = {
      peer1: ghostId,
      peer2: targetPeerId,
      expiresAt
    };

    try {
      await redis.set(
        `friendship:${sharedChatId}`,
        JSON.stringify(friendship),
        'EX',
        3 * 24 * 60 * 60 // 72 hours
      );

      const acceptMessage = {
        type: 'friend-accepted',
        sharedChatId,
        partnerGhostName,
        partnerAvatarId
      };

      // Send to both peers
      const targetWs = connections.get(targetPeerId);
      if (targetWs && targetWs.readyState === 1) {
        acceptMessage.partnerGhostName = ghostName;
        acceptMessage.partnerAvatarId = avatarId;
        targetWs.send(JSON.stringify(acceptMessage));
      }

      const myWs = connections.get(ghostId);
      if (myWs && myWs.readyState === 1) {
        acceptMessage.partnerGhostName = partnerGhostName;
        acceptMessage.partnerAvatarId = partnerAvatarId;
        myWs.send(JSON.stringify(acceptMessage));
      }
    } catch (err) {
      console.error('[WS] Error accepting friend request:', err.message);
    }
  }

  return {
    connections,
    roomMembers
  };
}

module.exports = {
  initSignaling
};
