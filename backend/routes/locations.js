const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// POST /api/locations/share - Share user location
router.post('/share', async (req, res) => {
  try {
    const { latitude, longitude, accuracy } = req.body;
    const { ghostId, ghostName, avatarId } = req.user;

    // Validate coordinates
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude and longitude required' });
    }

    // Validate ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Invalid coordinates' });
    }

    // Store location in Redis with 30 minute TTL
    const locationKey = `location:${ghostId}`;
    const locationData = {
      ghostId,
      ghostName,
      avatarId,
      latitude: String(latitude),
      longitude: String(longitude),
      accuracy: String(accuracy || 0),
      timestamp: String(Math.floor(Date.now() / 1000))
    };

    // Store in hash
    await req.redis.hset(locationKey, locationData);
    
    // Set expiration to 30 minutes
    await req.redis.expire(locationKey, 1800);

    // Also add to active locations set
    await req.redis.sadd('locations:active', ghostId);

    res.json({
      success: true,
      message: 'Location shared',
      locationId: locationKey
    });
  } catch (err) {
    console.error('[LOCATIONS] Error sharing location:', err);
    res.status(500).json({ error: 'Failed to share location' });
  }
});

// GET /api/locations/active - Get all active user locations
router.get('/active', async (req, res) => {
  try {
    const activeUsers = await req.redis.smembers('locations:active');

    if (!activeUsers || activeUsers.length === 0) {
      return res.json({ locations: [] });
    }

    // Get location data for each active user
    const locations = [];

    for (const ghostId of activeUsers) {
      const locationKey = `location:${ghostId}`;
      const locationData = await req.redis.hgetall(locationKey);

      // If location data exists, add to results
      if (locationData && locationData.latitude && locationData.longitude) {
        locations.push({
          ghostId: locationData.ghostId,
          ghostName: locationData.ghostName,
          avatarId: parseInt(locationData.avatarId),
          latitude: parseFloat(locationData.latitude),
          longitude: parseFloat(locationData.longitude),
          accuracy: parseInt(locationData.accuracy) || 0,
          timestamp: parseInt(locationData.timestamp) || 0
        });
      }
    }

    // Clean up expired entries from active set
    const validActiveUsers = locations.map(l => l.ghostId);
    const expiredUsers = activeUsers.filter(u => !validActiveUsers.includes(u));
    
    if (expiredUsers.length > 0) {
      await req.redis.srem('locations:active', ...expiredUsers);
    }

    res.json({ locations });
  } catch (err) {
    console.error('[LOCATIONS] Error getting active locations:', err);
    res.status(500).json({ error: 'Failed to get locations' });
  }
});

// DELETE /api/locations/:ghostId - Remove location
router.delete('/:ghostId', async (req, res) => {
  try {
    const { ghostId } = req.params;
    const userGhostId = req.user.ghostId;

    // Users can only delete their own location
    if (ghostId !== userGhostId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const locationKey = `location:${ghostId}`;
    await req.redis.del(locationKey);
    await req.redis.srem('locations:active', ghostId);

    res.json({ success: true, message: 'Location removed' });
  } catch (err) {
    console.error('[LOCATIONS] Error removing location:', err);
    res.status(500).json({ error: 'Failed to remove location' });
  }
});

// GET /api/locations/user/:ghostId - Get specific user location (for live updates)
router.get('/user/:ghostId', async (req, res) => {
  try {
    const { ghostId } = req.params;
    const locationKey = `location:${ghostId}`;
    const locationData = await req.redis.hgetall(locationKey);

    if (!locationData || !locationData.latitude) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({
      ghostId: locationData.ghostId,
      ghostName: locationData.ghostName,
      avatarId: parseInt(locationData.avatarId),
      latitude: parseFloat(locationData.latitude),
      longitude: parseFloat(locationData.longitude),
      accuracy: parseInt(locationData.accuracy) || 0,
      timestamp: parseInt(locationData.timestamp) || 0
    });
  } catch (err) {
    console.error('[LOCATIONS] Error getting user location:', err);
    res.status(500).json({ error: 'Failed to get location' });
  }
});

module.exports = router;
