import { useState, useRef, useCallback, useEffect } from 'react';

export function useWebRTC(signalingRef) {
  const localStreamRef = useRef(null);
  const streamInitializingRef = useRef(false); // Prevent concurrent initialization attempts
  const peerConnectionsRef = useRef(new Map());
  const screenShareTrackRef = useRef(null);
  const audioAnalysersRef = useRef(new Map()); // Track audio activity
  
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [peerAudioActive, setPeerAudioActive] = useState(new Map()); // Which peers have active audio
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const iceCandidateQueues = useRef({});
  const isNegotiatingRef = useRef({});
  // Cached ICE servers fetched from Metered REST API.
  // Metered issues time-limited credentials — fetching at runtime ensures they're always fresh.
  // Falls back to static STUN + freeturn.net if fetch fails or env vars aren’t set.
  const iceServersRef = useRef(null);

  // Fetch Metered TURN credentials once on mount.
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_METERED_API_URL;
    const apiKey = import.meta.env.VITE_METERED_API_KEY;
    if (!apiUrl || !apiKey) return;

    fetch(`${apiUrl}?apiKey=${apiKey}`)
      .then(r => r.json())
      .then(servers => {
        iceServersRef.current = servers;
        console.log('[WebRTC] ✅ Fetched', servers.length, 'ICE servers from Metered:', servers.map(s => s.urls).flat());
      })
      .catch(err => {
        console.error('[WebRTC] Failed to fetch Metered ICE servers, falling back to static config:', err.message);
      });
  }, []);

  // Get ICE servers from environment or defaults
  // Critical: Support multiple TURN servers and transports for college WiFi compatibility
  const getIceServers = useCallback(() => {
    if (iceServersRef.current) {
      console.log('[WebRTC] Using dynamic Metered ICE servers');
      return iceServersRef.current;
    }

    const servers = [
      // Google STUN servers
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // freeturn.net — stable free TURN relay, works cross-network
      // These replace openrelay.metered.ca which changed its public credentials.
      {
        urls: 'turn:freeturn.net:3478',
        username: 'free',
        credential: 'free'
      },
      {
        urls: 'turns:freeturn.net:5349',
        username: 'free',
        credential: 'free'
      }
    ];

    // Add custom STUN if provided
    if (import.meta.env.VITE_STUN_URL) {
      servers.unshift({ urls: import.meta.env.VITE_STUN_URL });
      console.log('[WebRTC] Added custom STUN:', import.meta.env.VITE_STUN_URL);
    }

    if (import.meta.env.VITE_TURN_URL) {
      const turnUrl = import.meta.env.VITE_TURN_URL;
      const username = import.meta.env.VITE_TURN_USERNAME;
      const credential = import.meta.env.VITE_TURN_CREDENTIAL;

      let host = turnUrl;
      if (turnUrl.startsWith('turn:')) host = turnUrl.substring(5);
      else if (turnUrl.startsWith('turns:')) host = turnUrl.substring(6);

      const [hostOnly, port] = host.includes(':') ? host.split(':') : [host, '443'];

      // Skip if VITE_TURN_URL is still the placeholder value.
      // Attempting to connect to a non-existent domain wastes ICE budget and
      // makes connectivity checks time-out faster.
      const PLACEHOLDER = 'your-deployed-api-domain.com';
      if (hostOnly === PLACEHOLDER) {
        console.warn('[WebRTC] ⚠️ VITE_TURN_URL is still the placeholder (your-deployed-api-domain.com) — skipping.');
        console.warn('[WebRTC] Set VITE_TURN_URL to a real TURN server (e.g. Metered.ca or freeturn.net) to enable reliable cross-network calls.');
      } else if (username && credential) {
        servers.push({
          urls: [
            `turn:${hostOnly}:3478?transport=udp`,
            `turn:${hostOnly}:80?transport=tcp`,
            `turns:${hostOnly}:${port}?transport=tcp`
          ],
          username,
          credential
        });
        console.log('[WebRTC] ✅ Added authenticated TURN:', { hostOnly, ports: ['3478', '80', port] });
      } else {
        console.warn('[WebRTC] ⚠️ TURN URL provided but NO credentials — skipping (browser requires auth for turn: URLs).');
      }
    }

    console.log('[WebRTC] ICE server config:', {
      totalServers: servers.length,
      stun: servers.filter(s => !s.username).length,
      turn: servers.filter(s => s.username).length
    });

    return servers;
  }, []);

  // Drain queued ICE candidates after remote description is set
  const drainIceCandidates = useCallback(async (peerId) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (!pc || !iceCandidateQueues.current[peerId]) return;

    const queue = iceCandidateQueues.current[peerId];
    console.log(`[WebRTC] Draining ${queue.length} queued ICE candidates for ${peerId}`);

    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('[WebRTC] Added queued ICE candidate from', peerId);
      } catch (err) {
        console.error('[WebRTC] Error adding queued ICE candidate:', err.message);
      }
    }
    iceCandidateQueues.current[peerId] = [];
  }, []);

  // BUG FIX 1,2,3,5: Complete rewrite of createPeerConnection
  const createPeerConnection = useCallback((peerId, isInitiator) => {
    if (peerConnectionsRef.current.has(peerId)) {
      console.log('[WebRTC] Peer connection already exists for:', peerId);
      return peerConnectionsRef.current.get(peerId);
    }

    console.log('[WebRTC] Creating peer connection for', peerId, ', initiator:', isInitiator);

    try {
      const iceServers = getIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      console.log('[WebRTC] ✅ RTCPeerConnection created successfully for', peerId);

    // Initialize negotiating flag for this peer
    isNegotiatingRef.current[peerId] = false;

    // SET ALL EVENT HANDLERS IMMEDIATELY (before addTrack or createOffer)
    // BUG FIX 5: ontrack with proper setRemoteStreams update
    pc.ontrack = (event) => {
      console.log('[WebRTC] 🟢 ontrack fired for', peerId, ':', event.track.kind);
      console.log('[WebRTC] Track details:', {
        kind: event.track.kind,
        enabled: event.track.enabled,
        readyState: event.track.readyState,
        label: event.track.label,
        streamCount: event.streams.length
      });

      const stream = event.streams[0];
      if (!stream) {
        console.log('[WebRTC] No stream in ontrack event, creating new MediaStream');
        const newStream = new MediaStream([event.track]);
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.set(peerId, newStream);
          return next;
        });
        console.log('[WebRTC] ✅ Created new MediaStream for', peerId);
        return;
      }

      event.track.enabled = true;
      console.log('[WebRTC] ✅ Setting remote stream for', peerId, 'with', event.track.kind, '- stream has', stream.getTracks().length, 'total tracks');

      setRemoteStreams(prev => {
        const next = new Map(prev);
        const existing = next.get(peerId);
        if (existing && existing !== stream) {
          if (!existing.getTracks().find(t => t.kind === event.track.kind)) {
            existing.addTrack(event.track);
            console.log('[WebRTC] Added track to existing stream for', peerId);
          }
          next.set(peerId, existing);
        } else {
          next.set(peerId, stream);
        }
        return next;
      });

      // Monitor audio activity
      if (event.track.kind === 'audio') {
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const analyser = audioContext.createAnalyser();
          const source = audioContext.createMediaStreamSource(stream);
          source.connect(analyser);
          analyser.fftSize = 256;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const checkAudio = setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            const isActive = average > 30;
            setPeerAudioActive(prev => {
              const next = new Map(prev);
              next.set(peerId, isActive);
              return next;
            });
          }, 100);

          audioAnalysersRef.current.set(peerId, { analyser, interval: checkAudio, audioContext });
        } catch (err) {
          console.error('[WebRTC] Error setting up audio analyser:', err);
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] ICE candidate generated for', peerId);
        if (signalingRef?.current?.send) {
          signalingRef.current.send({
            type: 'ice-candidate',
            targetPeerId: peerId,
            candidate: event.candidate
          });
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state for', peerId, ':', pc.iceConnectionState);

      if (pc.iceConnectionState === 'failed') {
        console.error('[WebRTC] ❌ ICE connection FAILED for', peerId);
        // Attempt ICE restart — this re-gathers candidates and re-tries connectivity
        // checks without re-doing the full offer/answer. Helps when the first TURN
        // allocation fails transiently (e.g. server busy, transient network issue).
        console.warn('[WebRTC] Attempting ICE restart for', peerId);
        try {
          pc.restartIce();
        } catch (err) {
          console.error('[WebRTC] ICE restart error:', err.message);
        }
      } else if (pc.iceConnectionState === 'connected') {
        console.log('[WebRTC] ✓ ICE connection ESTABLISHED for', peerId);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state for', peerId, ':', pc.connectionState);
      
      if (pc.connectionState === 'failed') {
        console.error('[WebRTC] ❌ Peer connection FAILED for', peerId);
      } else if (pc.connectionState === 'connected') {
        console.log('[WebRTC] ✓ Peer connection ESTABLISHED for', peerId);
      }
    };

    // BUG FIX 2: onnegotiationneeded with re-entrancy guard
    pc.onnegotiationneeded = async () => {
      if (isNegotiatingRef.current[peerId]) {
        console.log('[WebRTC] Negotiation already in progress for', peerId, ', skipping');
        return;
      }

      if (!isInitiator) {
        console.log('[WebRTC] Not initiator for', peerId, ', skipping onnegotiationneeded');
        return;
      }

      if (pc.signalingState !== 'stable') {
        console.log('[WebRTC] Signaling state not stable for', peerId, ':', pc.signalingState);
        return;
      }

      isNegotiatingRef.current[peerId] = true;
      try {
        console.log('[WebRTC] Creating offer for', peerId);
        const offer = await pc.createOffer();

        if (pc.signalingState !== 'stable') {
          console.log('[WebRTC] Signaling state changed, aborting offer for', peerId);
          return;
        }

        await pc.setLocalDescription(offer);
        console.log('[WebRTC] Offer sent to', peerId);

        if (signalingRef?.current?.send) {
          signalingRef.current.send({
            type: 'offer',
            targetPeerId: peerId,
            sdp: pc.localDescription
          });
        }
      } catch (err) {
        console.error('[WebRTC] Error in onnegotiationneeded for', peerId, ':', err.message);
      } finally {
        isNegotiatingRef.current[peerId] = false;
      }
    };

    // BUG FIX 1: Add local tracks BEFORE createOffer is ever called
    console.log('[WebRTC] 🔍 Checking for local stream to add tracks... localStreamRef.current exists?', !!localStreamRef.current);
    
    if (localStreamRef.current && localStreamRef.current.getTracks) {
      try {
        const tracks = localStreamRef.current.getTracks();
        console.log('[WebRTC] 🟢 Found', tracks.length, 'local tracks to add for peer', peerId);
        
        if (tracks.length > 0) {
          tracks.forEach((track, idx) => {
            try {
              pc.addTrack(track, localStreamRef.current);
              console.log(`[WebRTC] ✅ Track ${idx + 1}/${tracks.length} added to PC:`, { 
                peerId, 
                kind: track.kind, 
                enabled: track.enabled,
                label: track.label,
                readyState: track.readyState
              });
            } catch (addErr) {
              console.error(`[WebRTC] ❌ Failed to add track ${idx + 1}:`, addErr.message);
            }
          });
          console.log('[WebRTC] ✓ All', tracks.length, 'local tracks added successfully for', peerId);
        } else {
          console.warn('[WebRTC] ⚠️ Local stream exists but has 0 tracks for', peerId);
        }
      } catch (tracksErr) {
        console.error('[WebRTC] ❌ Error getting tracks from local stream:', tracksErr.message);
      }
    } else {
      console.error('[WebRTC] ❌ CRITICAL: Local stream is NULL/invalid when creating peer connection for', peerId);
      console.error('[WebRTC] localStreamRef.current =', localStreamRef.current);
      console.error('[WebRTC] This will cause asymmetric streaming - tracks will not be sent to remote peer!');
    }

    // Store peer connection BEFORE onnegotiationneeded fires
    peerConnectionsRef.current.set(peerId, pc);
    console.log('[WebRTC] Peer connection stored for', peerId);

    // Drain ICE candidates that arrived before this peer connection was created.
    // These were queued by handleIceCandidate when pc didn't exist yet.
    // Note: remote description is still not set here, so drainIceCandidates
    // will queue them internally again until setRemoteDescription is called.
    if (iceCandidateQueues.current[peerId]?.length > 0) {
      console.log('[WebRTC] Found', iceCandidateQueues.current[peerId].length, 'pre-creation ICE candidates for', peerId, '- they will drain after remote description is set');
    }

    // BUG FIX: If initiator but no tracks (dev mode), manually create offer
    // onnegotiationneeded won't fire without tracks, so we need to trigger manually
    if (isInitiator && !localStreamRef.current) {
      console.log('[WebRTC] Initiator with no local stream - scheduling manual offer for', peerId);
      
      // Increase delay from 50ms to 500ms to give peer connection time to settle
      // and account for potential network delays
      setTimeout(async () => {
        try {
          if (pc.signalingState !== 'stable') {
            console.log('[WebRTC] Signaling state not stable for', peerId, ':', pc.signalingState);
            return;
          }

          console.log('[WebRTC] Creating manual offer for', peerId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          console.log('[WebRTC] Sending manual offer for', peerId);
          if (signalingRef?.current?.send) {
            signalingRef.current.send({
              type: 'offer',
              targetPeerId: peerId,
              sdp: pc.localDescription
            });
          }
        } catch (err) {
          console.error('[WebRTC] Error creating manual offer for', peerId, ':', err.message);
        }
      }, 500);  // Increased from 50ms to 500ms
    }

    return pc;
    } catch (err) {
      console.error('[WebRTC] ❌ CRITICAL ERROR creating peer connection for', peerId, ':', err.name, err.message);
      console.error('[WebRTC] Full error:', err);
      if (err.name === 'InvalidAccessError') {
        console.error('[WebRTC] This is usually caused by invalid ICE server configuration');
        console.error('[WebRTC] Check TURN URL, username, and credential configuration');
      }
      throw err; // Re-throw so caller knows creation failed
    }
  }, [getIceServers, signalingRef]);

  // BUG FIX 3: Queue ICE candidates if remote description not set
  const handleIceCandidate = useCallback(async (fromPeerId, candidate) => {
    const pc = peerConnectionsRef.current.get(fromPeerId);
    if (!pc) {
      // Peer connection doesn't exist yet — queue the candidate.
      // This happens when the remote sends ICE immediately after the offer
      // but our createPeerConnection hasn't run yet (offer handling is async).
      // Previously this dropped the candidate silently, breaking ICE negotiation.
      console.log('[WebRTC] No peer connection yet for', fromPeerId, '- queuing ICE candidate for pre-creation');
      if (!iceCandidateQueues.current[fromPeerId]) {
        iceCandidateQueues.current[fromPeerId] = [];
      }
      iceCandidateQueues.current[fromPeerId].push(candidate);
      return;
    }

    console.log('[WebRTC] ICE candidate received from', fromPeerId);

    // BUG FIX 3: Queue if remote description not yet set
    if (!pc.remoteDescription || !pc.remoteDescription.type) {
      console.log('[WebRTC] Remote description not set yet for', fromPeerId, ', queuing ICE candidate');
      if (!iceCandidateQueues.current[fromPeerId]) {
        iceCandidateQueues.current[fromPeerId] = [];
      }
      iceCandidateQueues.current[fromPeerId].push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('[WebRTC] ICE candidate added from', fromPeerId);
    } catch (err) {
      console.error('[WebRTC] Error adding ICE candidate from', fromPeerId, ':', err.message);
    }
  }, []);

  const handleOffer = useCallback(async (fromPeerId, sdp) => {
    console.log('[WebRTC] Received offer from', fromPeerId);

    // CRITICAL FIX: Wait for local stream to be initialized before creating peer connection
    // If stream is null, the responder won't have any tracks to send, causing asymmetric streaming
    let attempts = 0;
    while (!localStreamRef.current && attempts < 100) {
      console.log('[WebRTC] ⏳ Waiting for local stream before handling offer from', fromPeerId, '(attempt', attempts + 1, ')');
      await new Promise(r => setTimeout(r, 100));
      attempts++;
    }

    if (!localStreamRef.current) {
      console.warn('[WebRTC] ⚠️ Local stream still not available after 10s, creating peer connection anyway');
    } else {
      console.log('[WebRTC] ✓ Local stream ready, now handling offer from', fromPeerId);
    }

    let pc = peerConnectionsRef.current.get(fromPeerId);
    if (!pc) {
      console.log('[WebRTC] Creating peer connection for', fromPeerId, 'to handle offer');
      pc = createPeerConnection(fromPeerId, false);
    }

    if (!pc) {
      console.error('[WebRTC] Could not create/get peer connection for', fromPeerId);
      return;
    }

    const validStates = ['stable', 'have-local-offer'];
    if (!validStates.includes(pc.signalingState)) {
      console.warn('[WebRTC] Invalid state for handling offer from', fromPeerId, ':', pc.signalingState);
      return;
    }

    try {
      console.log('[WebRTC] Setting remote description (offer) for', fromPeerId);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // BUG FIX 3: Drain any queued ICE candidates
      await drainIceCandidates(fromPeerId);

      console.log('[WebRTC] Creating answer for', fromPeerId);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      console.log('[WebRTC] Answer sent to', fromPeerId);
      if (signalingRef?.current?.send) {
        signalingRef.current.send({
          type: 'answer',
          targetPeerId: fromPeerId,
          sdp: pc.localDescription
        });
      }
    } catch (err) {
      console.error('[WebRTC] Error handling offer from', fromPeerId, ':', err.message);
    }
  }, [createPeerConnection, drainIceCandidates, signalingRef]);

  const handleAnswer = useCallback(async (fromPeerId, sdp) => {
    console.log('[WebRTC] Received answer from', fromPeerId);

    const pc = peerConnectionsRef.current.get(fromPeerId);
    if (!pc) {
      console.warn('[WebRTC] Received answer for unknown peer:', fromPeerId);
      return;
    }

    if (pc.signalingState !== 'have-local-offer') {
      console.warn('[WebRTC] Invalid state for handling answer from', fromPeerId, ':', pc.signalingState);
      return;
    }

    try {
      console.log('[WebRTC] Setting remote description (answer) for', fromPeerId);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // BUG FIX 3: Drain any queued ICE candidates
      await drainIceCandidates(fromPeerId);

      console.log('[WebRTC] Remote description set for', fromPeerId);
    } catch (err) {
      console.error('[WebRTC] Error handling answer from', fromPeerId, ':', err.message);
    }
  }, [drainIceCandidates]);

  // BUG FIX 8: Proper cleanup on peer left
  const handlePeerLeft = useCallback((peerId) => {
    console.log('[WebRTC] Peer left:', peerId);

    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onnegotiationneeded = null;
      pc.oniceconnectionstatechange = null;
      pc.onconnectionstatechange = null;
      pc.close();
      peerConnectionsRef.current.delete(peerId);
      console.log('[WebRTC] Closed and removed peer connection:', peerId);
    }

    // Clean up audio analyser
    const analyserData = audioAnalysersRef.current.get(peerId);
    if (analyserData) {
      clearInterval(analyserData.interval);
      analyserData.audioContext.close();
      audioAnalysersRef.current.delete(peerId);
    }

    // Clean up queued ICE candidates
    delete iceCandidateQueues.current[peerId];
    delete isNegotiatingRef.current[peerId];

    setRemoteStreams(prev => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });

    setPeerAudioActive(prev => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  const initializeLocalStream = useCallback(async () => {
    // Prevent concurrent initialization attempts
    if (streamInitializingRef.current) {
      console.log('[WebRTC] Stream initialization already in progress, waiting...');
      // Wait for existing initialization to complete
      let attempts = 0;
      while (streamInitializingRef.current && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
      if (localStreamRef.current) {
        return localStreamRef.current;
      }
    }

    // Guard: Don't reinitialize if already initialized with LIVE tracks.
    // Must check readyState — hangUp() stops tracks but does NOT null the ref,
    // so getTracks().length > 0 alone would return a dead stream.
    if (localStreamRef.current && localStreamRef.current.getTracks().length > 0) {
      const allLive = localStreamRef.current.getTracks().every(t => t.readyState === 'live');
      if (allLive) {
        console.log('[WebRTC] Local stream already initialized, reusing');
        return localStreamRef.current;
      }
      // Tracks are ended (hangUp was called) — null the ref and re-initialize
      console.log('[WebRTC] Local stream tracks are ended, re-initializing...');
      localStreamRef.current = null;
    }

    streamInitializingRef.current = true;
    try {
      console.log('[WebRTC] Starting getUserMedia...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 }
      });

      stream.getTracks().forEach(track => {
        track.enabled = true;
        console.log('[WebRTC] Local track initialized:', {
          kind: track.kind,
          enabled: track.enabled,
          label: track.label,
          readyState: track.readyState
        });
      });

      localStreamRef.current = stream;
      console.log('[WebRTC] Local stream ready with', stream.getTracks().length, 'tracks');
      
      // Add track end listener to detect disconnection
      stream.getTracks().forEach(track => {
        track.onended = () => {
          console.log('[WebRTC] Track ended:', track.kind);
        };
      });
      
      return stream;
    } catch (err) {
      console.error('[WebRTC] Error initializing local stream:', err.name, err.message);
      
      // Provide more specific error handling
      if (err.name === 'NotFoundError') {
        console.error('[WebRTC] NotFoundError: Device not found. Possible causes:');
        console.error('  - Device in use by another application/tab');
        console.error('  - Device disconnected');
        console.error('  - Device disabled in system settings');
      } else if (err.name === 'NotAllowedError') {
        console.error('[WebRTC] Permission denied for media devices');
      } else if (err.name === 'NotReadableError') {
        console.error('[WebRTC] Device already in use by another process');
      }
      
      return null;
    } finally {
      streamInitializingRef.current = false;
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return isMuted;

    const audioTracks = localStreamRef.current.getAudioTracks();
    const newMutedState = !isMuted;
    audioTracks.forEach(track => {
      track.enabled = !newMutedState;
    });
    setIsMuted(newMutedState);
    return newMutedState;
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return isCameraOff;

    const videoTracks = localStreamRef.current.getVideoTracks();
    const newCameraOffState = !isCameraOff;
    videoTracks.forEach(track => {
      track.enabled = !newCameraOffState;
    });
    setIsCameraOff(newCameraOffState);
    return newCameraOffState;
  }, [isCameraOff]);

  const startScreenShare = useCallback(async () => {
    try {
      console.log('[WebRTC] Starting screen share');
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenVideoTrack = screenStream.getVideoTracks()[0];

      if (!screenVideoTrack) {
        console.error('[WebRTC] No video track from screen share');
        return;
      }

      const originalVideoTrack = localStreamRef.current?.getVideoTracks()[0];

      // Replace track in all peer connections
      for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(screenVideoTrack);
          console.log('[WebRTC] Screen share track sent to', peerId);
        }
      }

      screenShareTrackRef.current = screenVideoTrack;
      screenVideoTrack.onended = async () => {
        console.log('[WebRTC] Screen share ended');
        if (originalVideoTrack) {
          for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
              await sender.replaceTrack(originalVideoTrack);
            }
          }
        }
        screenShareTrackRef.current = null;
        setIsScreenSharing(false);
      };

      setIsScreenSharing(true);
    } catch (err) {
      console.error('[WebRTC] Error starting screen share:', err);
    }
  }, []);

  const stopScreenShare = useCallback(async () => {
    if (screenShareTrackRef.current) {
      console.log('[WebRTC] Stopping screen share');
      screenShareTrackRef.current.stop();
      const originalVideoTrack = localStreamRef.current?.getVideoTracks()[0];

      if (originalVideoTrack && !isCameraOff) {
        for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(originalVideoTrack);
          }
        }
      }

      screenShareTrackRef.current = null;
      setIsScreenSharing(false);
    }
  }, [isCameraOff]);

  const changeCamera = useCallback(async (deviceId) => {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
      const newVideoTrack = newStream.getVideoTracks()[0];

      if (!newVideoTrack) return;

      // Remove old video tracks from local stream
      const oldVideoTracks = localStreamRef.current?.getVideoTracks() || [];
      oldVideoTracks.forEach(track => track.stop());

      // Add new video track to local stream
      if (localStreamRef.current) {
        oldVideoTracks.forEach(track => localStreamRef.current.removeTrack(track));
        localStreamRef.current.addTrack(newVideoTrack);
      }

      // Replace video track in all peer connections
      for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
        }
      }
    } catch (err) {
      console.error('[WebRTC] Error changing camera:', err);
    }
  }, []);

  const changeAudio = useCallback(async (deviceId) => {
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      const newAudioTrack = newStream.getAudioTracks()[0];

      if (!newAudioTrack) return;

      // Remove old audio tracks
      const oldAudioTracks = localStreamRef.current?.getAudioTracks() || [];
      oldAudioTracks.forEach(track => track.stop());

      // Add new audio track
      if (localStreamRef.current) {
        oldAudioTracks.forEach(track => localStreamRef.current.removeTrack(track));
        localStreamRef.current.addTrack(newAudioTrack);
      }

      // Replace audio track in all peer connections
      for (const [peerId, pc] of peerConnectionsRef.current.entries()) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) {
          await sender.replaceTrack(newAudioTrack);
        }
      }
    } catch (err) {
      console.error('[WebRTC] Error changing audio:', err);
    }
  }, []);

  // BUG FIX 8: Proper hangup cleanup
  const hangUp = useCallback(() => {
    console.log('[WebRTC] Hanging up, closing all connections');

    // Close all peer connections with cleanup
    peerConnectionsRef.current.forEach((pc, peerId) => {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onnegotiationneeded = null;
      pc.oniceconnectionstatechange = null;
      pc.onconnectionstatechange = null;
      pc.close();
    });
    peerConnectionsRef.current.clear();

    // Stop all local tracks and NULL the ref.
    // CRITICAL: Must null localStreamRef after stopping tracks.
    // If we keep the ref, initializeLocalStream's guard (getTracks().length > 0)
    // returns the dead stream — tracks are stopped but the array is still populated.
    // Nulling forces a fresh getUserMedia on the next initializeLocalStream call.
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log('[WebRTC] Stopping track:', track.kind);
        track.stop();
      });
      localStreamRef.current = null;
    }

    // Clear audio analysers
    audioAnalysersRef.current.forEach(data => {
      clearInterval(data.interval);
      data.audioContext.close();
    });
    audioAnalysersRef.current.clear();

    // Clear state
    setRemoteStreams(new Map());
    setPeerAudioActive(new Map());
    setIsMuted(false);
    setIsCameraOff(false);
    setIsScreenSharing(false);
    iceCandidateQueues.current = {};
    isNegotiatingRef.current = {};

    // Reset initialization flag to allow reinitialization if needed
    streamInitializingRef.current = false;

    console.log('[WebRTC] Hangup complete');
  }, []);

  return {
    localStreamRef,
    remoteStreams,
    peerAudioActive,
    isMuted,
    isCameraOff,
    isScreenSharing,
    initializeLocalStream,
    createPeerConnection,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    handlePeerLeft,
    toggleMute,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    changeCamera,   // was defined but never returned — caused TypeError in SettingsModal
    changeAudio,    // same
    hangUp,
  };
}
