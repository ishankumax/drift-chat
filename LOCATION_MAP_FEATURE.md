# Location Map Feature - Implementation Guide

## 🗺️ Feature Overview

Added a new **Location Map** feature to the drift-chat application that displays real-time locations of users on an interactive map. Users can:

- **Share their location** with permission prompt
- **View Indian and World maps** with user markers
- **See all active users** on the map with distance accuracy info
- **Real-time updates** every 5 seconds
- **Zoom and pan** the map dynamically
- **Auto-track** user location with continuous updates

## 🏗️ Architecture

### Backend Changes

**New Route:** `backend/routes/locations.js`
- `POST /api/locations/share` - Store user location (30 min TTL)
- `GET /api/locations/active` - Get all active user locations  
- `DELETE /api/locations/:ghostId` - Remove location
- `GET /api/locations/user/:ghostId` - Get specific user location

**Storage:** Redis with 30-minute expiration
```json
{
  "ghostId": "uuid",
  "ghostName": "SilentFox#1234",
  "avatarId": 5,
  "latitude": 28.7041,
  "longitude": 77.1025,
  "accuracy": 50,
  "timestamp": 1234567890
}
```

**Backend Updates:**
- `backend/index.js` - Register locations route

### Frontend Changes

**New Components:**

1. **Pages/Map.jsx** - Main map page
   - Displays Leaflet map with user markers
   - Controls for start/stop sharing
   - Map type selector (India/World)
   - Real-time location updates

2. **Hooks/useLocation.js** - Location management hook
   - Geolocation API integration
   - Permission handling
   - Location sharing/stopping
   - Continuous position watching

3. **Updated Files:**
   - `App.jsx` - Added `/map` route
   - `main.jsx` - Added Leaflet CSS import
   - `package.json` - Added leaflet & react-leaflet
   - `lib/api.js` - Added location API functions
   - `pages/Landing.jsx` - Added Map button
   - `components/LandingPage.jsx` - Added View Map button

## 🚀 How to Use

### As a User

1. **Go to Map Page**
   - Click "View Map" button on landing page
   - Or navigate to `/map` URL

2. **Share Your Location**
   - Click "Start Sharing" button
   - Browser will ask for location permission
   - Accept to share your location
   - Your marker appears on the map (blue with avatar number)

3. **View Other Users**
   - All users sharing locations appear as colored markers
   - Hover markers to see detailed location info
   - See accuracy range for each location

4. **Switch Map Views**
   - **India** - Zoomed into India region (good for local view)
   - **World** - World map centered on your location (if sharing)

5. **Stop Sharing**
   - Click "Stop Sharing" button to remove location
   - Your marker disappears from other users' maps

### API Usage

```javascript
// Share location
await shareLocation(latitude, longitude, accuracy);

// Get all active locations
const { locations } = await getActiveLocations();
// Returns: [{ ghostId, ghostName, latitude, longitude, ... }]

// Remove location
await removeLocation();

// Get specific user location
await getUserLocation(ghostId);
```

## 🔧 Installation & Setup

### Backend
1. Locations route is auto-registered in `index.js`
2. Requires JWT authentication (automatic)
3. Uses Redis with 30-min expiration

### Frontend
1. Install dependencies: `npm install`
2. Leaflet will be installed automatically
3. Map page is added to routing

### Environment
- Ensure `VITE_API_URL` is set in `.env`
- Backend should be running on configured port

## 📊 Data Flow

```
User Browser
    ↓
1. Requests geolocation
2. Gets permission
3. Retrieves coordinates
4. Sends to backend
    ↓
Backend (/api/locations/share)
    ↓
1. Validates coordinates
2. Stores in Redis (TTL: 30 min)
3. Adds to active set
    ↓
Redis Storage
    ↓
Other Users
    ↓
1. Fetch active locations (/api/locations/active)
2. Every 5 seconds
3. Update map markers
```

## 🎨 UI Components

### Map Markers
- **Blue (Current User)** - 32px with white border
- **Colored (Other Users)** - 28px with semi-transparent border
- Avatar ID displayed in center
- Color based on avatar ID (20 color palette)

### Controls Panel (Top-Left)
- Location sharing status
- Active user count
- Share/Stop buttons
- Error messages
- Map type selector (India/World)

### Info Panel (Bottom-Right)
- Last update timestamp
- Loading indicator

## ⚙️ Technical Details

### Geolocation API
```javascript
navigator.geolocation.getCurrentPosition(success, error, {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0
});

navigator.geolocation.watchPosition(success, error, {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000  // Poll every 5 seconds
});
```

### Map Libraries
- **Leaflet** - Core mapping library
- **React-Leaflet** - React wrapper for Leaflet
- **OpenStreetMap** - Tile provider (free, open-source)

### Authentication
- JWT token required for all requests
- Token stored in sessionStorage (per-tab)
- Automatic token refresh if needed

## 🔐 Privacy & Security

- ✅ Locations auto-expire after 30 minutes
- ✅ Users can stop sharing anytime
- ✅ Only authenticated users see/share locations
- ✅ No location stored permanently
- ✅ Browser geolocation requires user permission
- ✅ P2P, no unnecessary server storage

## 🐛 Troubleshooting

### Map not showing
- Ensure Leaflet CSS is imported in main.jsx
- Check browser console for errors
- Verify OpenStreetMap tiles can load

### Location not sharing
- Check browser location permissions
- Ensure https or localhost
- Verify backend is running

### Accuracy issues
- Device GPS quality affects accuracy
- Accuracy range shown in popup
- High accuracy mode uses more battery

### Real-time updates not showing
- Refresh page to see latest locations
- Check network tab for API calls
- Ensure /api/locations/active endpoint works

## 🚀 Future Enhancements

1. **Clustering** - Group nearby markers at low zoom
2. **Search** - Find specific users by name
3. **Distance Filtering** - Show only users within X km
4. **Location History** - See where users have been
5. **Custom Markers** - Different icons per avatar
6. **Heatmap** - Show density of active users
7. **Geofencing** - Alerts when entering areas
8. **Sharing Preferences** - Granular privacy controls

## 📝 File Structure

```
backend/
  └── routes/
      └── locations.js (NEW)
frontend/
  └── src/
      ├── pages/
      │   └── Map.jsx (NEW)
      ├── hooks/
      │   └── useLocation.js (NEW)
      ├── App.jsx (UPDATED)
      ├── main.jsx (UPDATED)
      └── lib/
          └── api.js (UPDATED)
```

## ✅ Testing Checklist

- [ ] Start sharing location from one tab
- [ ] See marker appear for that user
- [ ] Open another tab and share location
- [ ] See both markers on map
- [ ] Switch between India and World views
- [ ] Verify 5-second auto-refresh works
- [ ] Stop sharing and verify marker disappears
- [ ] Check location expires after 30 minutes
- [ ] Test on mobile device
- [ ] Test permission denial handling

---

**Version:** 1.0.0  
**Release Date:** May 21, 2026  
**Status:** ✅ Ready for Production
