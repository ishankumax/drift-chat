const API_URL = import.meta.env.VITE_API_URL;

export async function getAuthHeader() {
  // Use sessionStorage for per-tab token (not shared across tabs like localStorage)
  const token = sessionStorage.getItem('drift_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function joinRoom(mode, roomCode = null) {
  const headers = await getAuthHeader();
  
  const body = { mode };
  if (roomCode) body.roomCode = roomCode;

  const response = await fetch(`${API_URL}/api/rooms/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error('Failed to join room');
  }

  return response.json();
}

export async function getRoom(roomId) {
  const headers = await getAuthHeader();

  const response = await fetch(`${API_URL}/api/rooms/${roomId}`, {
    headers
  });

  if (!response.ok) {
    throw new Error('Failed to get room');
  }

  return response.json();
}

export async function getFriendChat(chatId) {
  const headers = await getAuthHeader();

  const response = await fetch(`${API_URL}/api/friends/${chatId}`, {
    headers
  });

  if (!response.ok) {
    throw new Error('Failed to get friend chat');
  }

  return response.json();
}

export async function getFriendChatMessages(chatId) {
  const headers = await getAuthHeader();

  const response = await fetch(`${API_URL}/api/friends/${chatId}/messages`, {
    headers
  });

  if (!response.ok) {
    throw new Error('Failed to get messages');
  }

  return response.json();
}

export async function postFriendChatMessage(chatId, text) {
  const headers = await getAuthHeader();

  const response = await fetch(`${API_URL}/api/friends/${chatId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    throw new Error('Failed to post message');
  }

  return response.json();
}

// Location APIs
export async function shareLocation(latitude, longitude, accuracy = 0) {
  const headers = await getAuthHeader();

  const response = await fetch(`${API_URL}/api/locations/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify({ latitude, longitude, accuracy })
  });

  if (!response.ok) {
    throw new Error('Failed to share location');
  }

  return response.json();
}

export async function getActiveLocations() {
  const headers = await getAuthHeader();

  const response = await fetch(`${API_URL}/api/locations/active`, {
    headers
  });

  if (!response.ok) {
    throw new Error('Failed to get locations');
  }

  return response.json();
}

export async function removeLocation() {
  const headers = await getAuthHeader();
  const token = sessionStorage.getItem('drift_token');
  
  // Decode token to get ghostId
  const decoded = JSON.parse(atob(token.split('.')[1]));
  const ghostId = decoded.ghostId;

  const response = await fetch(`${API_URL}/api/locations/${ghostId}`, {
    method: 'DELETE',
    headers
  });

  if (!response.ok) {
    throw new Error('Failed to remove location');
  }

  return response.json();
}

export async function getUserLocation(ghostId) {
  const headers = await getAuthHeader();

  const response = await fetch(`${API_URL}/api/locations/user/${ghostId}`, {
    headers
  });

  if (!response.ok) {
    throw new Error('Failed to get user location');
  }

  return response.json();
}
