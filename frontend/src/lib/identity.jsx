import React, { createContext, useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';

export const IdentityContext = createContext();

export function IdentityProvider({ children }) {
  const [identity, setIdentity] = useState({
    ghostId: null,
    ghostName: null,
    avatarId: null,
    token: null,
    isLoaded: false
  });

  useEffect(() => {
    const initializeIdentity = async () => {
      try {
        // FOR ANONYMOUS CHAT: Each tab/window should have its own unique identity
        // DO NOT reuse stored token - always generate fresh identity
        // (Comment: In production, could use sessionStorage instead of localStorage for per-tab persistence)
        
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/identity/init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
          // IMPORTANT: NOT sending Authorization header - forces fresh identity generation
        });

        if (!response.ok) {
          throw new Error('Failed to initialize identity');
        }

        const data = await response.json();

        // Store token in sessionStorage (per-tab) instead of localStorage (shared across tabs)
        sessionStorage.setItem('drift_token', data.token);

        setIdentity({
          ghostId: data.ghostId,
          ghostName: data.ghostName,
          avatarId: data.avatarId,
          token: data.token,
          isLoaded: true
        });
        
        console.log('[Identity] ✓ Generated fresh identity:', data.ghostName, data.ghostId);
      } catch (err) {
        console.error('Identity initialization error:', err);
        setIdentity(prev => ({ ...prev, isLoaded: true }));
      }
    };

    initializeIdentity();
  }, []);

  const value = {
    ...identity
  };

  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  );
}
