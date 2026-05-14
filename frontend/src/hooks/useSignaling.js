// WebSocket signaling hook with proper lifecycle management
import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL;

export function useSignaling(token, onMessage) {
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const tokenRef = useRef(token);
  const onMessageRef = useRef(onMessage);
  const isCleaningUpRef = useRef(false);
  const [connectionState, setConnectionState] = useState('disconnected');

  // Keep refs in sync
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const setupHeartbeat = useCallback((ws) => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
    }
    
    heartbeatTimerRef.current = setInterval(() => {
      if (ws && ws.readyState === 1) {
        try {
          console.log('[WS] Sending heartbeat');
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch (err) {
          console.error('[WS] Heartbeat error:', err.message);
        }
      }
    }, 30000);
  }, []);

  const connect = useCallback(() => {
    // Skip if already connected
    if (wsRef.current && wsRef.current.readyState <= 1) {
      console.log('[WS] Connection exists, state:', wsRef.current.readyState);
      return;
    }

    // Skip if cleaning up
    if (isCleaningUpRef.current) {
      console.log('[WS] Skipping connect - cleanup in progress');
      return;
    }

    // Skip if no token
    if (!tokenRef.current) {
      console.log('[WS] No token yet');
      return;
    }

    console.log('[WS] Connecting...');

    try {
      const wsUrl = `${WS_URL}/ws?token=${encodeURIComponent(tokenRef.current)}`;
      console.log('[WS] URL:', wsUrl.substring(0, 50) + '...');
      
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] ✓ Open');
        setConnectionState('connected');
        reconnectAttemptsRef.current = 0;
        setupHeartbeat(ws);
      };

      ws.onmessage = (event) => {
        try {
          console.log('[WS] Received raw message:', event.data.substring(0, 100));
          const message = JSON.parse(event.data);
          console.log('[WS] ✓ Parsed message type:', message.type);
          
          if (message.type === 'pong') {
            console.log('[WS] Received pong');
            return;
          }
          
          console.log('[WS] Forwarding to onMessage callback:', message.type);
          if (onMessageRef.current) {
            onMessageRef.current(message);
          } else {
            console.warn('[WS] No onMessage callback set');
          }
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('[WS] Closed, code:', event.code);
        setConnectionState('disconnected');
        wsRef.current = null;
        
        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }
        
        if (isCleaningUpRef.current) {
          return;
        }

        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        console.log('[WS] Reconnect in', delay, 'ms');
        
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      };

      ws.onerror = (event) => {
        console.error('[WS] Error:', event.message || event);
        setConnectionState('error');
        
        if (!isCleaningUpRef.current) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectAttemptsRef.current++;
          
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[WS] Create error:', err.message);
      setConnectionState('error');
      
      if (!isCleaningUpRef.current) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    }
  }, [setupHeartbeat]);

  // Connect when token available
  useEffect(() => {
    if (tokenRef.current && !wsRef.current) {
      console.log('[WS] Token ready, connecting');
      connect();
    }
  }, [token, connect]);

  // Cleanup
  useEffect(() => {
    return () => {
      console.log('[WS] Cleanup');
      isCleaningUpRef.current = true;
      
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  // Send function
  const send = useCallback((message) => {
    if (!wsRef.current) {
      console.warn('[WS] No connection, cannot send');
      return;
    }

    if (wsRef.current.readyState !== 1) {
      console.warn('[WS] Not ready (state:', wsRef.current.readyState + '), cannot send:', message.type);
      return;
    }

    try {
      console.log('[WS] Sending:', message.type);
      wsRef.current.send(JSON.stringify(message));
    } catch (err) {
      console.error('[WS] Send error:', err.message);
    }
  }, []);

  return {
    send,
    connectionState
  };
}
