// Session storage utilities for user persistence

interface UserSession {
  userId: string;
  name: string;
  currentRoom: string | null;
  timestamp: number;
}

const SESSION_KEY = 'poker-planning-session';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export const saveUserSession = (userId: string, name: string, roomId: string) => {
  const session: UserSession = {
    userId,
    name,
    currentRoom: roomId,
    timestamp: Date.now(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const getUserSession = (): UserSession | null => {
  const data = localStorage.getItem(SESSION_KEY);
  if (!data) return null;

  try {
    const session: UserSession = JSON.parse(data);
    // Check if session expired
    if (Date.now() - session.timestamp > SESSION_DURATION) {
      clearUserSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
};

export const updateSessionRoom = (roomId: string | null) => {
  const session = getUserSession();
  if (session) {
    session.currentRoom = roomId;
    session.timestamp = Date.now();
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
};

export const clearUserSession = () => {
  localStorage.removeItem(SESSION_KEY);
};

export const generateUserId = (): string => {
  return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
