import React, { useState } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  MonitorUp, 
  MessageSquare, 
  SkipForward, 
  Flag, 
  Settings, 
  PhoneOff 
} from 'lucide-react';

function IconButton({ icon: Icon, label, onClick, isActive, isRed, isDisabled }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={onClick}
        disabled={isDisabled}
        className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-110 active:scale-95 ${
          isDisabled
            ? 'opacity-50 cursor-not-allowed bg-[#F5F0E8]/5 text-[#F5F0E8]/50'
            : isRed
            ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-900/40'
            : isActive
            ? 'bg-[#F4600C] text-[#1A1A0F] shadow-orange-900/50'
            : 'bg-[#2A2A1F]/60 hover:bg-[#3A3A2F] text-[#F5F0E8] border border-[#F5F0E8]/10'
        }`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Icon className="w-6 h-6" strokeWidth={2.5} />
      </button>

      {showTooltip && (
        <div className="absolute bottom-full mb-4 left-1/2 transform -translate-x-1/2 bg-[#1A1A0F] text-[#F5F0E8] text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg whitespace-nowrap pointer-events-none border border-[#F4600C]/30 shadow-2xl z-[60]">
          {label}
        </div>
      )}
    </div>
  );
}

export function ControlBar({
  isMuted,
  onToggleMute,
  isCameraOff,
  onToggleCamera,
  isScreenSharing,
  onStartScreenShare,
  onStopScreenShare,
  onToggleChat,
  unreadCount,
  onNextStranger,
  onReport,
  onSettings,
  onHangup
}) {
  return (
    <div className="flex items-center justify-center gap-5 px-8 py-4 bg-[#1A1A0F]/40 backdrop-blur-xl border border-white/5 rounded-3xl shadow-2xl">
      <IconButton 
        icon={isMuted ? MicOff : Mic} 
        label={isMuted ? 'Unmute' : 'Mute'} 
        onClick={onToggleMute} 
        isActive={!isMuted} 
      />
      <IconButton 
        icon={isCameraOff ? VideoOff : Video} 
        label={isCameraOff ? 'Turn on camera' : 'Turn off camera'} 
        onClick={onToggleCamera} 
        isActive={!isCameraOff} 
      />
      <IconButton 
        icon={MonitorUp} 
        label={isScreenSharing ? 'Stop sharing' : 'Share screen'} 
        onClick={isScreenSharing ? onStopScreenShare : onStartScreenShare} 
        isActive={isScreenSharing} 
      />
      
      <div className="relative">
        <IconButton icon={MessageSquare} label="Chat" onClick={onToggleChat} />
        {unreadCount > 0 && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#F4600C] rounded-full flex items-center justify-center text-[10px] text-[#1A1A0F] font-black shadow-lg animate-bounce">
            {unreadCount > 9 ? '9+' : unreadCount}
          </div>
        )}
      </div>

      <div className="w-px h-8 bg-white/10 mx-2" />

      <IconButton icon={SkipForward} label="Next stranger" onClick={onNextStranger} />
      <IconButton icon={Flag} label="Report" onClick={onReport} />
      <IconButton icon={Settings} label="Settings" onClick={onSettings} />
      <IconButton icon={PhoneOff} label="Hang up" onClick={onHangup} isRed />
    </div>
  );
}
