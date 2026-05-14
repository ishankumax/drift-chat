import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useIdentity } from '../hooks/useIdentity';
import { useSignaling } from '../hooks/useSignaling';
import { useWebRTC } from '../hooks/useWebRTC';
import { joinRoom } from '../lib/api';
import { VideoTile } from '../components/VideoTile';
import { ChatPanel } from '../components/ChatPanel';
import { ControlBar } from '../components/ControlBar';
import { ActivePeersBar } from '../components/ActivePeersBar';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { SettingsModal } from '../components/SettingsModal';
import { ReportModal } from '../components/ReportModal';
import { GhostIdentityBadge } from '../components/GhostIdentityBadge';

const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#A9D08E',
  '#FFC0CB', '#87CEEB', '#DDA0DD', '#FFB347', '#90EE90',
  '#FF69B4', '#20B2AA', '#FFD700', '#FF7F50', '#6495ED'
];

export function Room() {
  // Context/hooks
  const { roomId: routeRoomId } = useParams();
  const navigate = useNavigate();
  const { token, ghostId, ghostName, avatarId, isLoaded } = useIdentity();
  
  // Refs - MUST BE FIRST (before hooks that use them)
  const signalingRef = useRef(null);
  const roomModeRef = useRef('random');
  const waitingVideoRef = useRef(null);
  const streamInitializedRef = useRef(false);
  const joinRoomSentRef = useRef(false); // Guard to send join-room only once

  // State
  const [roomId, setRoomId] = useState(routeRoomId || null);
  const [roomCode, setRoomCode] = useState(null);
  const [peers, setPeers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatVisible, setChatVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [roomKilledOverlay, setRoomKilledOverlay] = useState(false);
  const [nextStrangerCountdown, setNextStrangerCountdown] = useState(null);
  const [loading, setLoading] = useState(!routeRoomId);

  // Call WebRTC hook with signalingRef (now signalingRef is declared)
  const webRTC = useWebRTC(signalingRef);

  // Callbacks - ALL THIRD (must come before effects that use them)
  const handleNextStranger = useCallback(async () => {
    webRTC.hangUp();
    try {
      const result = await joinRoom('random');
      setRoomId(result.roomId);
      setRoomCode(result.roomCode);
      setPeers(result.peers || []);
      navigate(`/room/${result.roomId}`);
    } catch (err) {
      console.error('Error joining new room:', err);
      navigate('/');
    }
  }, [webRTC, navigate]);

  const handleHangup = useCallback(() => {
    webRTC.hangUp();
    if (roomId && signalingRef.current?.send) {
      signalingRef.current.send({ type: 'leave-room', roomId });
    }
    navigate('/');
  }, [webRTC, roomId, navigate]);

  const handleReport = useCallback((reportData) => {
    if (signalingRef.current?.send && reportTarget) {
      signalingRef.current.send({
        type: 'report',
        targetPeerId: reportTarget,
        reason: reportData.reason,
        roomId
      });
    }
    setReportOpen(false);
  }, [reportTarget, roomId]);

  const handleSignalingMessage = useCallback((message) => {
    console.log('[Room] Received signaling message:', message.type, message);
    switch (message.type) {
      case 'room-joined':
        console.log('[Room] ✓ HANDLING room-joined message');
        // Deduplicate peers list from server
        const uniquePeers = Array.from(new Map((message.peers || []).map(p => [p.ghostId, p])).values());
        setPeers(uniquePeers);
        console.log('[Room] Room joined with peers:', uniquePeers.map(p => p.ghostId));
        uniquePeers.forEach(peer => {
          // BUG FIX 4: Deterministic initiator - peer with SMALLER ghostId initiates
          const isInitiator = ghostId < peer.ghostId;
          console.log('[Room] Peer connection initiator rule: myGhostId=', ghostId, 'theirGhostId=', peer.ghostId, 'isInitiator=', isInitiator);
          if (webRTC && signalingRef.current) {
            webRTC.createPeerConnection(peer.ghostId, isInitiator);
          }
        });
        break;

      case 'peer-joined':
        setPeers(prev => {
          // Check if peer already exists to avoid duplicates
          const exists = prev.some(p => p.ghostId === message.peerId);
          if (exists) {
            console.log('[Room] Peer already in list, skipping duplicate:', message.peerId);
            return prev;
          }
          return [...prev, {
            ghostId: message.peerId,
            ghostName: message.ghostName,
            avatarId: message.avatarId
          }];
        });
        
        // BUG FIX 4: Deterministic initiator - peer with SMALLER ghostId initiates
        const isInitiator = ghostId < message.peerId;
        console.log('[Room] Peer-joined initiator rule: myGhostId=', ghostId, 'theirGhostId=', message.peerId, 'isInitiator=', isInitiator);
        if (webRTC && signalingRef.current) {
          webRTC.createPeerConnection(message.peerId, isInitiator);
        }
        break;

      case 'peer-left':
        setPeers(prev => prev.filter(p => p.ghostId !== message.peerId));
        webRTC.handlePeerLeft(message.peerId);
        break;

      case 'offer':
        webRTC.handleOffer(message.fromPeerId, message.sdp);
        break;

      case 'answer':
        webRTC.handleAnswer(message.fromPeerId, message.sdp);
        break;

      case 'ice-candidate':
        webRTC.handleIceCandidate(message.fromPeerId, message.candidate);
        break;

      case 'chat-message':
        setChatMessages(prev => [...prev, {
          text: message.text,
          local: false,
          fromPeerId: message.fromPeerId,
          ghostName: message.ghostName,
          timestamp: Date.now()
        }]);
        if (message.fromPeerId !== ghostId) {
          setUnreadCount(prev => prev + 1);
        }
        break;

      case 'room-killed':
        setRoomKilledOverlay(true);
        setTimeout(() => navigate('/'), 3000);
        break;

      case 'typing':
        break;

      default:
        break;
    }
  }, [ghostId, webRTC, navigate]);

  // Signaling hook
  const { send: signalingsSend, connectionState } = useSignaling(token, handleSignalingMessage);
  
  // Update signaling ref only when send function changes
  useEffect(() => {
    signalingRef.current = { send: signalingsSend };
  }, [signalingsSend]);

  // Effects - ALL FOURTH
  useEffect(() => {
    // Guard MUST be synchronous and checked FIRST
    if (streamInitializedRef.current) {
      console.log('[Room] Stream already initialized, skipping');
      return;
    }
    
    // Mark as initializing IMMEDIATELY to prevent race conditions
    streamInitializedRef.current = 'initializing';
    
    const initStream = async () => {
      console.log('[Room] Initializing local stream BEFORE room join');
      try {
        const stream = await webRTC.initializeLocalStream();
        if (!stream) {
          console.warn('[Room] Camera/microphone access denied - continuing without media stream (development mode)');
          streamInitializedRef.current = true; // Mark as initialized even if no stream
          // Continue without stream for development/testing
        } else {
          if (waitingVideoRef.current && peers.length === 0) {
            waitingVideoRef.current.srcObject = stream;
          }
          streamInitializedRef.current = true; // Mark as initialized
          console.log('[Room] Local stream initialization complete');
        }
      } catch (err) {
        console.error('[Room] Stream initialization error:', err);
        console.warn('[Room] Continuing without media stream (development mode)');
        streamInitializedRef.current = true; // Mark as initialized even if error
      }
    };
    
    if (isLoaded) {
      initStream();
    }
  }, [isLoaded, navigate, webRTC]);

  useEffect(() => {
    const joinRoomFn = async () => {
      if (!isLoaded || !token) {
        return;
      }

      if (!roomId && !routeRoomId) {
        try {
          const result = await joinRoom('random');
          setRoomId(result.roomId);
          setRoomCode(result.roomCode);
          roomModeRef.current = 'random';
          setPeers(result.peers || []);
          setLoading(false);
        } catch (err) {
          console.error('Error joining room:', err);
          navigate('/');
        }
      } else if (roomId) {
        setLoading(false);
      }
    };
    joinRoomFn();
  }, [roomId, routeRoomId, navigate, isLoaded, token]);

  useEffect(() => {
    console.log('[Room] Join-room effect check:', {
      roomId: roomId ? roomId.substring(0, 8) : 'NO',
      signalingsSend: signalingsSend ? 'YES' : 'NO',
      connectionState,
      alreadySent: joinRoomSentRef.current,
      shouldSend: roomId && signalingsSend && connectionState === 'connected' && !joinRoomSentRef.current
    });
    
    if (roomId && signalingsSend && connectionState === 'connected' && !joinRoomSentRef.current) {
      console.log('[Room] ✓ SENDING join-room message for roomId:', roomId);
      joinRoomSentRef.current = true; // Mark as sent immediately
      
      // Small delay to ensure connection is fully ready
      const timer = setTimeout(() => {
        signalingsSend({
          type: 'join-room',
          roomId
        });
        console.log('[Room] join-room message sent');
      }, 100);
      
      return () => clearTimeout(timer);
    } else {
      if (!roomId) console.log('[Room] ✗ No roomId yet');
      if (!signalingsSend) console.log('[Room] ✗ signalingsSend not ready');
      if (connectionState !== 'connected') console.log('[Room] ✗ connectionState not connected:', connectionState);
      if (joinRoomSentRef.current) console.log('[Room] ✗ join-room already sent');
    }
  }, [roomId, signalingsSend, connectionState]);

  useEffect(() => {
    if (roomModeRef.current === 'random' && peers.length === 0 && nextStrangerCountdown === null) {
      setNextStrangerCountdown(3);
    }
  }, [peers.length]);

  useEffect(() => {
    if (nextStrangerCountdown === null) return;

    if (nextStrangerCountdown === 0) {
      handleNextStranger();
      setNextStrangerCountdown(null);
      return;
    }

    const timer = setTimeout(() => {
      setNextStrangerCountdown(nextStrangerCountdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [nextStrangerCountdown, handleNextStranger]);

  // Layout calculation - supports 1-on-1 and group calls
  const remoteCount = peers.length;
  let gridCols = 1;
  let gridRows = 1;
  let videoGridClass = 'grid-cols-1';
  let isGroupCall = remoteCount > 1; // More than 1 remote = group call

  if (remoteCount === 0) {
    // Waiting for peer
    gridCols = 1;
    gridRows = 1;
  } else if (remoteCount === 1) {
    // 1-on-1 call: 2 cols (local + 1 remote)
    gridCols = 2;
    gridRows = 1;
    videoGridClass = 'grid-cols-2';
  } else if (remoteCount === 2) {
    // 1-on-1 with recorder/observer: 3 cols
    gridCols = 3;
    gridRows = 1;
    videoGridClass = 'grid-cols-3';
  } else if (remoteCount === 3) {
    // Group: 2x2 grid
    gridCols = 2;
    gridRows = 2;
    videoGridClass = 'grid-cols-2 grid-rows-2';
  } else if (remoteCount <= 6) {
    // Group: 3 cols x 2-3 rows
    gridCols = 3;
    gridRows = Math.ceil((remoteCount + 1) / 3); // +1 for local
    videoGridClass = 'grid-cols-3';
  } else {
    // Large group: 4 cols
    gridCols = 4;
    gridRows = Math.ceil((remoteCount + 1) / 4);
    videoGridClass = 'grid-cols-4';
  }

  if (loading) {
    return (
      <div className="w-full h-screen bg-[#1A1A0F] flex items-center justify-center">
        <p className="text-[#F5F0E8]/60 font-medium">Connecting...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-[#1A1A0F] flex flex-col overflow-hidden">
      
      {/* TOP BAR */}
      <div className="h-14 border-b border-[#F4600C]/20 px-6 flex items-center justify-between bg-[#1A1A0F]/50 backdrop-blur-sm">
        {/* Left: Back button */}
        <button
          onClick={handleHangup}
          className="flex items-center gap-2 text-[#F5F0E8] hover:text-[#F4600C] transition-colors"
        >
          <span className="text-xl">←</span>
        </button>

        {/* Center: Room code */}
        <div className="flex-1 text-center">
          {roomCode && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(`drift.app/room?code=${roomCode}`);
                alert('Link copied!');
              }}
              className="text-xs font-bold uppercase tracking-widest text-[#F5F0E8]/70 hover:text-[#F4600C] transition-colors"
              title="Click to copy room code"
            >
              Room • {roomCode}
            </button>
          )}
        </div>

        {/* Right: Status badges */}
        <div className="flex items-center gap-3">
          <div className="text-xs font-bold uppercase tracking-widest text-[#F5F0E8]/60">
            {remoteCount} {remoteCount === 1 ? 'person' : 'people'}
          </div>
          <div className={`w-2 h-2 rounded-full ${connectionState === 'connected' ? 'bg-green-400' : 'bg-yellow-400'}`} />
        </div>
      </div>

      {/* MAIN CONTENT: Layout adapts based on 1-on-1 or group */}
      <div className={`flex-1 flex overflow-hidden gap-0 ${isGroupCall ? 'flex-col' : ''}`}>
        
        {/* LEFT/TOP: Video Grid */}
        <div className={`${isGroupCall ? 'w-full' : 'flex-1'} overflow-hidden p-4 bg-[#1A1A0F] flex flex-col`}>
          {remoteCount === 0 ? (
            // Waiting state
            <div className="w-full h-full flex items-center justify-center">
              <div className="relative w-full max-w-md aspect-video rounded-2xl overflow-hidden ring-2 ring-[#F4600C]/30 bg-black">
                {webRTC.localStreamRef.current && (
                  <video
                    ref={waitingVideoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scaleX(-1)'
                    }}
                  />
                )}

                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-[#F5F0E8] font-bold mb-3 uppercase tracking-wider">Waiting for someone...</p>
                    <div className="flex justify-center gap-2">
                      {[0, 0.2, 0.4].map((delay, idx) => (
                        <div key={`bounce-${idx}`} className="w-2 h-2 bg-[#F4600C] rounded-full animate-bounce" style={{ animationDelay: `${delay}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Video grid with responsive layout - supports 1-on-1 and group calls
            <div
              className={`w-full h-full gap-3 grid ${videoGridClass}`}
            >
              {/* Local video */}
              {webRTC.localStreamRef.current && (
                <VideoTile
                  key={`local-${ghostId}`}
                  stream={webRTC.localStreamRef.current}
                  ghostName={ghostName}
                  avatarId={avatarId}
                  isMuted={webRTC.isMuted}
                  isLocal
                  isVideoOff={webRTC.isCameraOff}
                />
              )}

              {/* Remote videos */}
              {peers.filter(peer => peer && peer.ghostId).map(peer => (
                <VideoTile
                  key={`remote-${peer.ghostId}`}
                  stream={webRTC.remoteStreams.get(peer.ghostId)}
                  ghostName={peer.ghostName}
                  avatarId={peer.avatarId}
                  isMuted={false}
                  isLocal={false}
                  isVideoOff={false}
                  isAudioActive={webRTC.peerAudioActive.get(peer.ghostId) || false}
                />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Chat Panel - Only show for 1-on-1 calls */}
        {!isGroupCall && (
          <div className="w-80 border-l border-[#F4600C]/20 flex flex-col bg-[#0a0a0f]">
            <ChatPanel
              visible={true}
              onClose={() => setChatVisible(false)}
              remoteStreams={webRTC.remoteStreams}
              onSendMessage={(msg) => {
                if (signalingsSend && roomId && msg.type === 'chat-message') {
                  setChatMessages(prev => [...prev, { ...msg, local: true, timestamp: Date.now() }]);
                  signalingsSend({ ...msg, roomId });
                } else if (signalingsSend && roomId) {
                  signalingsSend({ ...msg, roomId });
                }
              }}
              typingPeers={[]}
              isPermanent={true}
              messages={chatMessages}
            />
          </div>
        )}
      </div>

      {/* BOTTOM: Control Bar */}
      <div className="h-24 border-t border-[#F4600C]/20 px-6 py-4 flex items-center justify-center gap-4 bg-[#1A1A0F]/50 backdrop-blur-sm">
        <ControlBar
          isMuted={webRTC.isMuted}
          onToggleMute={webRTC.toggleMute}
          isCameraOff={webRTC.isCameraOff}
          onToggleCamera={webRTC.toggleCamera}
          isScreenSharing={webRTC.isScreenSharing}
          onStartScreenShare={webRTC.startScreenShare}
          onStopScreenShare={webRTC.stopScreenShare}
          onToggleChat={() => {
            setChatVisible(!chatVisible);
            if (!chatVisible) setUnreadCount(0);
          }}
          unreadCount={unreadCount}
          onNextStranger={handleNextStranger}
          onReport={() => {
            if (peers.length > 0) {
              setReportTarget(peers[0].ghostId);
              setReportOpen(true);
            }
          }}
          onSettings={() => setSettingsOpen(true)}
          onHangup={handleHangup}
        />
      </div>

      {/* Room Killed Overlay */}
      {roomKilledOverlay && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="text-center px-6 py-12 bg-[#1A1A0F] rounded-2xl border border-[#F4600C]/30">
            <p className="text-xl font-bold text-[#F5F0E8] mb-4 uppercase tracking-wider">Room Closed</p>
            <p className="text-[#F5F0E8]/60 font-medium">This room has been terminated</p>
          </div>
        </div>
      )}

      {/* Next Stranger Countdown */}
      {nextStrangerCountdown !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="text-center px-8 py-12 bg-[#1A1A0F] rounded-2xl border border-[#F4600C]/30">
            <p className="text-lg font-bold text-[#F5F0E8] mb-4 uppercase tracking-wider">Person Left</p>
            <p className="text-[#F5F0E8]/60 font-medium mb-6">Finding next match in...</p>
            <div className="text-6xl font-bold text-[#F4600C] mb-8">{nextStrangerCountdown}</div>
            <button
              onClick={() => setNextStrangerCountdown(null)}
              className="px-6 py-2 bg-[#F4600C] hover:bg-[#E55100] text-[#1A1A0F] font-bold uppercase tracking-wider rounded-lg transition-all"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onCameraChange={webRTC.changeCamera}
        onAudioChange={webRTC.changeAudio}
        localStream={webRTC.localStreamRef.current}
      />

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetPeerId={reportTarget}
        onSubmit={handleReport}
      />
    </div>
  );
}
