import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { IdentityProvider } from './lib/identity.jsx';
import { Landing } from './pages/Landing';
import { Room } from './pages/Room';
import { FriendChat } from './pages/FriendChat';
import { Map } from './pages/Map';

export default function App() {
  // Request location permission on app initialization
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('Location permission granted:', {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
        },
        (error) => {
          // Permission denied or location unavailable - silently handle
          console.log('Location permission status:', error.code);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    }
  }, []);

  return (
    <IdentityProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/room/:roomId" element={<Room />} />
          <Route path="/friends/:chatId" element={<FriendChat />} />
          <Route path="/map" element={<Map />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </IdentityProvider>
  );
}


