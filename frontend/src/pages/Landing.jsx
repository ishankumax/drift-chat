import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LandingPage from '../components/LandingPage';
import { joinRoom } from '../lib/api';
import { GhostIdentityBadge } from '../components/GhostIdentityBadge';

export function Landing() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [roomLink, setRoomLink] = useState(null);

  const handleStartDrifting = async () => {
    setIsLoading(true);
    try {
      const result = await joinRoom('random');
      navigate(`/room/${result.roomId}`);
    } catch (err) {
      console.error('Error joining room:', err);
      alert('Failed to join room');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    setIsLoading(true);
    try {
      const result = await joinRoom('group');
      setRoomLink(`${window.location.origin}/room/${result.roomId}?code=${result.roomCode}`);
      setShowRoomModal(true);
    } catch (err) {
      console.error('Error creating room:', err);
      alert('Failed to create room');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewMap = () => {
    navigate('/map');
  };

  return (
    <div className="relative w-full">
      <GhostIdentityBadge />
      
      {/* Landing page component with button handlers */}
      <LandingPage 
        onStartDrifting={handleStartDrifting}
        onCreateRoom={handleCreateRoom}
        onViewMap={handleViewMap}
        isLoading={isLoading}
      />

      {/* Modal overlay for room creation */}
      {showRoomModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#0a0a0f] border border-white/10 rounded-xl p-8 w-96">
            <h2 className="text-xl font-semibold text-white mb-4">Room Created</h2>
            <p className="text-white/70 mb-6">Share this link with others:</p>
            
            <div className="bg-white/5 border border-white/20 rounded-lg p-4 mb-6">
              <input
                type="text"
                value={roomLink}
                readOnly
                className="w-full bg-transparent text-white text-sm outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(roomLink);
                  alert('Link copied!');
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition"
              >
                Copy Link
              </button>
              <button
                onClick={() => {
                  const roomId = roomLink.split('/room/')[1].split('?')[0];
                  navigate(`/room/${roomId}`);
                }}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium transition"
              >
                Enter Room
              </button>
            </div>

            <button
              onClick={() => setShowRoomModal(false)}
              className="w-full mt-3 text-white/60 hover:text-white text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* CTA Buttons injected into Hero section via LandingPage overlay */}
    </div>
  );
}
