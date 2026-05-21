import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useLocation } from '../hooks/useLocation';
import { getActiveLocations } from '../lib/api';
import { IdentityContext } from '../lib/identity';
import { MapPin, Share2, StopCircle, ArrowLeft, Globe } from 'lucide-react';
import MascotCharacter from '../components/MascotCharacter';

// Color scheme
const COLORS = {
  orange: "#F4600C",
  cream: "#F5F0E8",
  dark: "#1A1A0F",
  yellow: "#F5D000"
};

const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#A9D08E',
  '#FFC0CB', '#87CEEB', '#DDA0DD', '#FFB347', '#90EE90',
  '#FF69B4', '#20B2AA', '#FFD700', '#FF7F50', '#6495ED'
];

// Fix leaflet default icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom marker icon - now shows username instead of ID
const createUserIcon = (avatarId, userName, isCurrentUser = false) => {
  const color = AVATAR_COLORS[(avatarId - 1) % AVATAR_COLORS.length];
  // Get first letter(s) of username for the marker
  const initials = userName.substring(0, 2).toUpperCase();

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: ${isCurrentUser ? '48px' : '40px'};
        height: ${isCurrentUser ? '48px' : '40px'};
        border-radius: 50%;
        border: ${isCurrentUser ? '4px solid #F4600C' : '3px solid rgba(255,255,255,0.9)'};
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${isCurrentUser ? '14px' : '11px'};
        font-family: Arial, sans-serif;
        text-align: center;
        padding: 2px;
      ">
        ${initials}
      </div>
    `,
    iconSize: [isCurrentUser ? 48 : 40, isCurrentUser ? 48 : 40],
    className: isCurrentUser ? 'marker-current' : 'marker-other'
  });
};

// Map center controller
function MapCenterController({ position, zoom = 13 }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo([position.latitude, position.longitude], zoom, {
        duration: 1.5,
        easeLinearity: 0.25
      });
    }
  }, [position, zoom, map]);
  return null;
}

// Navbar Component
function Navbar({ onBack }) {
  const navigate = useNavigate();
  const { ghostName, avatarId } = useContext(IdentityContext);

  const getAvatarColor = (id) => {
    return AVATAR_COLORS[(id - 1) % AVATAR_COLORS.length];
  };

  return (
    <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-black/80 shadow-lg">
      <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
        {/* Left: Logo + Back Button */}
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/10 rounded-lg transition text-[#F5F0E8]"
            title="Back to home"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="font-['Anton'] text-[20px] uppercase tracking-wide text-[#F5F0E8]">
            drift
          </div>
        </div>

        {/* Center: Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          <button
            onClick={() => navigate('/')}
            className="text-[#F5F0E8] text-sm uppercase tracking-widest font-semibold hover:text-[#F4600C] transition-colors"
          >
            Home
          </button>
          <button
            className="text-[#F5F0E8] text-sm uppercase tracking-widest font-semibold text-[#F4600C]"
          >
            Location Map
          </button>
        </nav>

        {/* Right: Profile Badge */}
        {ghostName && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10">
            <div
              className="w-6 h-6 rounded-full flex-shrink-0"
              style={{ backgroundColor: getAvatarColor(avatarId) }}
            />
            <span className="text-sm font-medium text-[#F5F0E8] truncate max-w-[120px]">
              {ghostName}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

// Main Map Page
export function Map() {
  const navigate = useNavigate();
  const identity = useContext(IdentityContext);
  const {
    location,
    isSharing,
    startSharing,
    stopSharing,
    error,
    isLoading
  } = useLocation();

  const [allLocations, setAllLocations] = useState([]);
  const [mapType, setMapType] = useState('india');
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);

  // Fetch active locations
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        setIsLoadingLocations(true);
        const response = await getActiveLocations();
        setAllLocations(response.locations || []);
        setLastUpdateTime(new Date());
      } catch (err) {
        console.error('Error fetching locations:', err);
      } finally {
        setIsLoadingLocations(false);
      }
    };

    fetchLocations();
    const interval = setInterval(fetchLocations, 5000);
    return () => clearInterval(interval);
  }, []);

  const getMapView = () => {
    if (mapType === 'india') {
      // Correct Indian boundaries: center around [22, 82] with zoom 5
      // This properly shows North (Himalayas ~35°N) to South (Kanyakumari ~8°N)
      // and West (Gujarat ~68°E) to East (Arunachal Pradesh ~97°E)
      return { center: [22, 82], zoom: 5 };
    } else {
      if (location) {
        return { center: [location.latitude, location.longitude], zoom: 3 };
      }
      return { center: [20, 0], zoom: 2 };
    }
  };

  const mapView = getMapView();

  return (
    <div className="w-full min-h-screen" style={{ backgroundColor: COLORS.dark }}>
      <Navbar onBack={() => navigate('/')} />

      {/* Top Spacer for Navbar */}
      <div className="h-20 shrink-0" />

      {/* Hero Section */}
      <section className="relative w-full py-16 px-6 md:px-10 overflow-hidden" style={{ backgroundColor: COLORS.orange }}>
        <div className="max-w-[1400px] mx-auto text-center">
          <h1 className="font-['Anton'] text-[clamp(40px,8vw,80px)] text-[#1A1A0F] uppercase leading-[1] mb-4">
            Location Sharing
          </h1>
          <p className="text-[#1A1A0F]/80 text-lg md:text-xl max-w-2xl mx-auto">
            Connect with drift users worldwide and see where the community is gathering
          </p>
        </div>
      </section>

      {/* Main Content Section */}
      <section className="w-full py-12 px-6 md:px-10" style={{ backgroundColor: COLORS.dark }}>
        <div className="max-w-[1400px] mx-auto">
          {/* Map Container with Border */}
          <div className="relative w-full rounded-lg overflow-hidden mb-12" style={{ 
            height: '600px',
            border: '3px solid ' + COLORS.orange,
            boxShadow: `0 0 0 1px ${COLORS.cream}20, inset 0 0 0 1px ${COLORS.cream}10`
          }}>
            <MapContainer
              center={mapView.center}
              zoom={mapView.zoom}
              style={{ width: '100%', height: '100%' }}
              className="map-container"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Current user location */}
              {location && isSharing && (
                <>
                  <Marker
                    position={[location.latitude, location.longitude]}
                    icon={createUserIcon(identity.avatarId, identity.ghostName, true)}
                  >
                    <Popup>
                      <div className="text-sm font-semibold p-2">
                        <p className="font-bold text-blue-600">{identity.ghostName} (You)</p>
                        <p className="text-gray-600">Lat: {location.latitude.toFixed(4)}</p>
                        <p className="text-gray-600">Lon: {location.longitude.toFixed(4)}</p>
                        <p className="text-gray-500 text-xs">Accuracy: ±{Math.round(location.accuracy)}m</p>
                      </div>
                    </Popup>
                  </Marker>
                  <MapCenterController position={location} zoom={mapType === 'india' ? 8 : 13} />
                </>
              )}

              {/* Other users' locations */}
              {allLocations.map((loc) => (
                <Marker
                  key={loc.ghostId}
                  position={[loc.latitude, loc.longitude]}
                  icon={createUserIcon(loc.avatarId, loc.ghostName, loc.ghostId === identity.ghostId)}
                >
                  <Popup>
                    <div className="text-sm font-semibold p-2">
                      <p className={`font-bold ${loc.ghostId === identity.ghostId ? 'text-blue-600' : 'text-purple-600'}`}>
                        {loc.ghostName}
                        {loc.ghostId === identity.ghostId && ' (You)'}
                      </p>
                      <p className="text-gray-600">Lat: {loc.latitude.toFixed(4)}</p>
                      <p className="text-gray-600">Lon: {loc.longitude.toFixed(4)}</p>
                      <p className="text-gray-500 text-xs">Accuracy: ±{Math.round(loc.accuracy)}m</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Scroll to Find Peers Headline */}
          <div className="text-center mb-10">
            <h2 className="font-['Anton'] text-2xl md:text-3xl text-[#F5F0E8] uppercase tracking-wide mb-2">
              Scroll to Find Your Peers
            </h2>
            <p className="text-[#F5F0E8]/60 text-base">
              Explore where drift community members are connecting from
            </p>
          </div>

          {/* Controls Grid with Mascot */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-12">
            {/* Left Column: Sharing Control */}
            <div className="lg:col-span-2">
              <div className="h-full rounded-lg p-8" style={{
                backgroundColor: COLORS.cream + '05',
                border: '2px solid ' + COLORS.cream + '20',
                backdropFilter: 'blur(8px)'
              }}>
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 rounded-md" style={{ backgroundColor: COLORS.orange }}>
                    <MapPin className="w-5 h-5 text-[#1A1A0F]" />
                  </div>
                  <h2 className="font-['Anton'] text-[#F5F0E8] text-xl uppercase tracking-wide">Location Control</h2>
                </div>

                {error && (
                  <div className="bg-red-500/20 border border-red-500/50 rounded-lg px-4 py-3 text-red-200 text-sm mb-6">
                    Error: {error}
                  </div>
                )}

                <div className="space-y-3 mb-8">
                  <div className="flex justify-between items-center p-4 rounded-lg" style={{
                    backgroundColor: COLORS.cream + '08',
                    border: '1px solid ' + COLORS.cream + '15'
                  }}>
                    <span className="text-[#F5F0E8]/70 font-semibold text-sm">Active Users Online</span>
                    <span className="font-['Anton'] text-3xl text-[#F4600C]">
                      {allLocations.length}
                    </span>
                  </div>

                  <div className="flex justify-between items-center p-4 rounded-lg" style={{
                    backgroundColor: COLORS.cream + '08',
                    border: '1px solid ' + COLORS.cream + '15'
                  }}>
                    <span className="text-[#F5F0E8]/70 font-semibold text-sm">Your Sharing Status</span>
                    <span className={`font-bold text-sm tracking-wide ${isSharing ? 'text-green-400' : 'text-gray-400'}`}>
                      {isSharing ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                </div>

                {!isSharing ? (
                  <button
                    onClick={startSharing}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 text-[#F5F0E8] px-6 py-3 rounded-lg font-['Anton'] text-sm uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: COLORS.orange,
                      color: '#1A1A0F'
                    }}
                  >
                    <Share2 className="w-4 h-4" />
                    {isLoading ? 'Requesting Location' : 'Start Sharing Location'}
                  </button>
                ) : (
                  <button
                    onClick={stopSharing}
                    className="w-full flex items-center justify-center gap-2 text-white px-6 py-3 rounded-lg font-['Anton'] text-sm uppercase tracking-widest transition-all"
                    style={{ backgroundColor: '#DC2626' }}
                  >
                    <StopCircle className="w-4 h-4" />
                    Stop Sharing
                  </button>
                )}
              </div>
            </div>

            {/* Right Column: Map Type Selector + Mascot */}
            <div className="lg:col-span-2 space-y-6">
              {/* Map View Selector Card */}
              <div className="rounded-lg p-6" style={{
                backgroundColor: COLORS.cream + '05',
                border: '2px solid ' + COLORS.cream + '20',
                backdropFilter: 'blur(8px)'
              }}>
                <div className="flex items-center gap-2 mb-6">
                  <Globe className="w-5 h-5" style={{ color: COLORS.orange }} />
                  <h3 className="font-['Anton'] text-[#F5F0E8] text-lg uppercase tracking-wide">Map View</h3>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setMapType('india')}
                    className={`flex-1 px-4 py-3 rounded-lg font-['Anton'] text-xs uppercase tracking-wider transition-all ${
                      mapType === 'india'
                        ? 'text-[#1A1A0F] shadow-lg'
                        : 'bg-transparent text-[#F5F0E8]/70 hover:text-[#F5F0E8]'
                    }`}
                    style={mapType === 'india' ? { backgroundColor: COLORS.orange } : { border: '1px solid ' + COLORS.cream + '20' }}
                  >
                    India
                  </button>
                  <button
                    onClick={() => setMapType('world')}
                    className={`flex-1 px-4 py-3 rounded-lg font-['Anton'] text-xs uppercase tracking-wider transition-all ${
                      mapType === 'world'
                        ? 'text-[#1A1A0F] shadow-lg'
                        : 'bg-transparent text-[#F5F0E8]/70 hover:text-[#F5F0E8]'
                    }`}
                    style={mapType === 'world' ? { backgroundColor: COLORS.orange } : { border: '1px solid ' + COLORS.cream + '20' }}
                  >
                    World
                  </button>
                </div>

                <div className="mt-6 pt-6" style={{ borderTop: '1px solid ' + COLORS.cream + '15' }}>
                  <p className="text-[#F5F0E8]/50 text-xs font-semibold mb-2 uppercase tracking-wide">Last Updated</p>
                  <p className="text-[#F5F0E8] font-medium">
                    {lastUpdateTime ? lastUpdateTime.toLocaleTimeString() : 'Loading'}
                  </p>
                </div>
              </div>

              {/* Mascot Card */}
              <div className="rounded-lg p-6 flex flex-col items-center justify-center" style={{
                backgroundColor: COLORS.cream + '05',
                border: '2px solid ' + COLORS.cream + '20',
                backdropFilter: 'blur(8px)',
                minHeight: '280px'
              }}>
                <div className="mb-4">
                  <MascotCharacter size={120} />
                </div>
                <h3 className="font-['Anton'] text-[#F5F0E8] text-lg uppercase tracking-wide text-center mb-2">
                  Happy Drifting
                </h3>
                <p className="text-[#F5F0E8]/60 text-sm text-center">
                  Connect with peers from around the world anonymously
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Info Section */}
      <section className="w-full py-12 px-6 md:px-10" style={{ backgroundColor: COLORS.orange }}>
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-6 rounded-lg" style={{ backgroundColor: '#1A1A0F20' }}>
              <h3 className="font-['Anton'] text-3xl text-[#1A1A0F] mb-2 uppercase">Privacy First</h3>
              <p className="text-[#1A1A0F]/70 text-sm">Locations auto-expire in 30 minutes</p>
            </div>
            <div className="text-center p-6 rounded-lg" style={{ backgroundColor: '#1A1A0F20' }}>
              <h3 className="font-['Anton'] text-3xl text-[#1A1A0F] mb-2 uppercase">Real-Time Updates</h3>
              <p className="text-[#1A1A0F]/70 text-sm">Live data refreshes every 5 seconds</p>
            </div>
            <div className="text-center p-6 rounded-lg" style={{ backgroundColor: '#1A1A0F20' }}>
              <h3 className="font-['Anton'] text-3xl text-[#1A1A0F] mb-2 uppercase">Fully Anonymous</h3>
              <p className="text-[#1A1A0F]/70 text-sm">No personal tracking or data logging</p>
            </div>
          </div>
        </div>
      </section>

      {/* Map CSS */}
      <style>{`
        .map-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        .custom-marker {
          filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.3));
        }

        .leaflet-popup-content {
          margin: 0;
          font-size: 12px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .leaflet-popup-content-wrapper {
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          background: white;
        }

        .leaflet-popup-tip {
          background: white;
        }

        .leaflet-container {
          background: #0a0a0f;
        }

        .leaflet-control-zoom {
          border: none !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
          overflow: hidden !important;
        }

        .leaflet-control-zoom-in,
        .leaflet-control-zoom-out {
          background-color: #ffffff !important;
          border-bottom: 1px solid #ddd !important;
          color: #333 !important;
          font-weight: bold !important;
          width: 40px !important;
          height: 40px !important;
          line-height: 40px !important;
        }

        .leaflet-control-zoom-in:hover,
        .leaflet-control-zoom-out:hover {
          background-color: #f5f5f5 !important;
        }

        .leaflet-control-attribution {
          background: rgba(255, 255, 255, 0.8) !important;
          font-size: 10px !important;
          border-radius: 8px !important;
        }
      `}</style>
    </div>
  );
}
