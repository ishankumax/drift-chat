import React, { useState, useEffect, useRef } from 'react';
import { X, Camera, Mic, Volume2 } from 'lucide-react';
import { enumerateDevices } from '../lib/webrtc';

export function SettingsModal({ isOpen, onClose, onCameraChange, onAudioChange, localStream }) {
  const [cameras, setCameras] = useState([]);
  const [microphones, setMicrophones] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMicrophone, setSelectedMicrophone] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');
  const previewVideoRef = useRef(null);

  useEffect(() => {
    const loadDevices = async () => {
      const devices = await enumerateDevices();
      setCameras(devices.videoinput);
      setMicrophones(devices.audioinput);
      setSpeakers(devices.audiooutput);

      // Auto-detect currently used sources from the localStream
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        const audioTrack = localStream.getAudioTracks()[0];

        if (videoTrack) {
          const settings = videoTrack.getSettings();
          if (settings.deviceId) setSelectedCamera(settings.deviceId);
        }

        if (audioTrack) {
          const settings = audioTrack.getSettings();
          if (settings.deviceId) setSelectedMicrophone(settings.deviceId);
        }
      }
    };

    if (isOpen) {
      loadDevices();
    }
  }, [isOpen, localStream]);

  useEffect(() => {
    if (previewVideoRef.current && localStream) {
      previewVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isOpen]);

  const handleCameraChange = (deviceId) => {
    if (!deviceId) return;
    setSelectedCamera(deviceId);
    if (typeof onCameraChange === 'function') onCameraChange(deviceId);
  };

  const handleMicChange = (deviceId) => {
    if (!deviceId) return;
    setSelectedMicrophone(deviceId);
    if (typeof onAudioChange === 'function') onAudioChange(deviceId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#1A1A0F]/90 backdrop-blur-md flex items-center justify-center z-[100] animate-in fade-in duration-300">
      <div className="bg-[#1A1A0F] border border-white/10 rounded-[2rem] p-8 w-full max-w-md shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-anton text-3xl uppercase tracking-wider text-[#F5F0E8]">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          {/* Camera Section */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#F4600C]">
              <Camera className="w-4 h-4" />
              Camera Source
            </label>
            <div className="relative">
              <select
                value={selectedCamera}
                onChange={(e) => handleCameraChange(e.target.value)}
                className="w-full bg-white/5 border border-white/10 text-[#F5F0E8] rounded-2xl px-4 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#F4600C]/50 transition-all appearance-none"
              >
                <option value="" className="bg-[#1A1A0F]">Select camera...</option>
                {cameras.map(cam => (
                  <option key={cam.deviceId} value={cam.deviceId} className="bg-[#1A1A0F]">
                    {cam.label || `Camera ${cameras.indexOf(cam) + 1}`}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/40">
                <Volume2 className="w-4 h-4 rotate-90" />
              </div>
            </div>
          </div>

          {/* Microphone Section */}
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#F4600C]">
              <Mic className="w-4 h-4" />
              Audio Input
            </label>
            <select
              value={selectedMicrophone}
              onChange={(e) => handleMicChange(e.target.value)}
              className="w-full bg-white/5 border border-white/10 text-[#F5F0E8] rounded-2xl px-4 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#F4600C]/50 transition-all appearance-none"
            >
              <option value="" className="bg-[#1A1A0F]">Select microphone...</option>
              {microphones.map(mic => (
                <option key={mic.deviceId} value={mic.deviceId} className="bg-[#1A1A0F]">
                  {mic.label || `Microphone ${microphones.indexOf(mic) + 1}`}
                </option>
              ))}
            </select>
          </div>

          {/* Preview Section */}
          {localStream && (
            <div className="space-y-3">
              <label className="text-xs font-black uppercase tracking-[0.2em] text-[#F4600C]">
                Live Preview
              </label>
              <div className="w-full aspect-video bg-black/40 rounded-2xl overflow-hidden border border-white/5 shadow-inner">
                <video
                  ref={previewVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full mt-8 bg-[#F4600C] hover:bg-[#ff7a2e] text-[#1A1A0F] px-6 py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg hover:shadow-[#F4600C]/20 hover:-translate-y-0.5 active:translate-y-0"
        >
          Save & Done
        </button>
      </div>
    </div>
  );
}
