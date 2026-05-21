import { useState, useCallback, useEffect } from 'react';
import { shareLocation, removeLocation } from '../lib/api';

export function useLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [watchId, setWatchId] = useState(null);
  const [permissionRequested, setPermissionRequested] = useState(false);

  // Request location permission on initial website load
  useEffect(() => {
    const requestInitialPermission = async () => {
      if (!navigator.geolocation) {
        console.warn('Geolocation is not supported by your browser');
        setPermissionRequested(true);
        return;
      }

      // Request location permission when user first visits
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          setLocation({ latitude, longitude, accuracy });
          setPermissionRequested(true);
        },
        (err) => {
          const errorMessages = {
            1: 'Location permission denied',
            2: 'Location is unavailable',
            3: 'Location request timed out'
          };
          console.warn(errorMessages[err.code] || err.message);
          setPermissionRequested(true);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    };

    // Only request once per session
    if (!permissionRequested) {
      requestInitialPermission();
    }
  }, [permissionRequested]);

  // Check if geolocation is available and already sharing
  useEffect(() => {
    const checkSharingStatus = async () => {
      try {
        const token = sessionStorage.getItem('drift_token');
        if (token) {
          const decoded = JSON.parse(atob(token.split('.')[1]));
          // Check localStorage to see if user was sharing before
          const wasSharingKey = `location:sharing:${decoded.ghostId}`;
          if (localStorage.getItem(wasSharingKey) === 'true') {
            setIsSharing(true);
          }
        }
      } catch (err) {
        console.error('Error checking sharing status:', err);
      }
    };

    checkSharingStatus();
  }, []);

  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return null;
    }

    setIsLoading(true);
    setError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          setLocation({ latitude, longitude, accuracy });
          setIsLoading(false);
          resolve({ latitude, longitude, accuracy });
        },
        (err) => {
          const errorMessages = {
            1: 'Location permission denied. Please enable location access in your browser settings.',
            2: 'Location is unavailable. Please check your device settings.',
            3: 'Location request timed out. Please try again.'
          };
          const errorMsg = errorMessages[err.code] || err.message;
          setError(errorMsg);
          setIsLoading(false);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  }, []);

  const startSharing = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Use already-captured location if available, otherwise request new one
      let position = location;
      if (!position) {
        position = await requestLocation();
        if (!position) {
          setIsLoading(false);
          return false;
        }
      }

      // Share location with server
      await shareLocation(position.latitude, position.longitude, position.accuracy);
      
      // Store sharing status
      const token = sessionStorage.getItem('drift_token');
      if (token) {
        const decoded = JSON.parse(atob(token.split('.')[1]));
        const wasSharingKey = `location:sharing:${decoded.ghostId}`;
        localStorage.setItem(wasSharingKey, 'true');
      }

      setIsSharing(true);
      setIsLoading(false);

      // Watch position for continuous updates (every 10 seconds)
      if (navigator.geolocation) {
        const id = navigator.geolocation.watchPosition(
          async (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            setLocation({ latitude, longitude, accuracy });
            
            try {
              await shareLocation(latitude, longitude, accuracy);
            } catch (err) {
              console.error('Error updating location:', err);
            }
          },
          (err) => {
            console.error('Error watching position:', err);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 5000
          }
        );
        setWatchId(id);
      }

      return true;
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
      return false;
    }
  }, [requestLocation]);

  const stopSharing = useCallback(async () => {
    try {
      // Stop watching position
      if (watchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
        setWatchId(null);
      }

      // Remove location from server
      await removeLocation();

      // Remove sharing status
      const token = sessionStorage.getItem('drift_token');
      if (token) {
        const decoded = JSON.parse(atob(token.split('.')[1]));
        const wasSharingKey = `location:sharing:${decoded.ghostId}`;
        localStorage.removeItem(wasSharingKey);
      }

      setIsSharing(false);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, [watchId]);

  return {
    location,
    error,
    isLoading,
    isSharing,
    requestLocation,
    startSharing,
    stopSharing
  };
}
