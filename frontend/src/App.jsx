import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { IdentityProvider } from './lib/identity.jsx';
import { Landing } from './pages/Landing';
import { Room } from './pages/Room';
import { FriendChat } from './pages/FriendChat';
import { Map } from './pages/Map';

export default function App() {
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


