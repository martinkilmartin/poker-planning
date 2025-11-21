// Simple query parameter-based routing for room navigation
export const navigateToRoom = (roomId: string) => {
  const url = new URL(globalThis.location.href);
  url.searchParams.set('room', roomId.toUpperCase());
  globalThis.history.pushState({}, '', url.toString());
};

export const navigateToHome = () => {
  const url = new URL(globalThis.location.href);
  url.searchParams.delete('room');
  globalThis.history.pushState({}, '', url.toString());
};

export const getCurrentRoomFromURL = (): string | null => {
  const params = new URLSearchParams(globalThis.location.search);
  const room = params.get('room');
  return room ? room.toUpperCase() : null;
};

export const onUrlChange = (callback: () => void) => {
  globalThis.addEventListener('popstate', callback);
  return () => globalThis.removeEventListener('popstate', callback);
};

// localStorage helpers for user name persistence
const USER_NAME_KEY = 'poker-planning-user-name';

export const saveUserName = (name: string): void => {
  try {
    localStorage.setItem(USER_NAME_KEY, name);
  } catch (error) {
    console.error('Failed to save user name:', error);
  }
};

export const getSavedUserName = (): string | null => {
  try {
    return localStorage.getItem(USER_NAME_KEY);
  } catch (error) {
    console.error('Failed to get saved user name:', error);
    return null;
  }
};

export const clearSavedUserName = (): void => {
  try {
    localStorage.removeItem(USER_NAME_KEY);
  } catch (error) {
    console.error('Failed to clear saved user name:', error);
  }
};

// Room state persistence for refresh/rejoin
const ROOM_STATE_KEY = 'poker-planning-room-state';

export interface RoomState {
  roomId: string;
  isHost: boolean;
  myName: string;
  myPeerId: string; // PeerJS connection ID (changes on reconnect)
  userId: string; // Stable user ID (persists across reconnects)
  autoReveal: boolean;
  autoRevealDuration: number;
  countdownStartTime: number | null;
}

export const saveRoomState = (
  roomId: string,
  isHost: boolean,
  myName: string,
  myPeerId: string,
  userId: string,
  autoReveal: boolean = true,
  autoRevealDuration: number = 10,
  countdownStartTime: number | null = null
): void => {
  try {
    const state: RoomState = {
      roomId,
      isHost,
      myName,
      myPeerId,
      userId,
      autoReveal,
      autoRevealDuration,
      countdownStartTime,
    };
    localStorage.setItem(ROOM_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save room state:', error);
  }
};

export const getRoomState = (): RoomState | null => {
  try {
    const state = localStorage.getItem(ROOM_STATE_KEY);
    return state ? JSON.parse(state) : null;
  } catch (error) {
    console.error('Failed to get room state:', error);
    return null;
  }
};

export const clearRoomState = (): void => {
  try {
    localStorage.removeItem(ROOM_STATE_KEY);
  } catch (error) {
    console.error('Failed to clear room state:', error);
  }
};
