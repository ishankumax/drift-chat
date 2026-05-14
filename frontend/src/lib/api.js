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
