import { v4 as uuidv4 } from 'uuid';

const USER_ID_KEY = 'poker-planning-user-id';

/**
 * Get or create a stable user ID that persists across browser sessions
 */
export const getOrCreateUserId = (): string => {
  try {
    let userId = localStorage.getItem(USER_ID_KEY);
    if (!userId) {
      userId = uuidv4();
      localStorage.setItem(USER_ID_KEY, userId);
    }
    return userId;
  } catch (error) {
    console.error('Failed to get/create user ID:', error);
    // Fallback to temp ID if localStorage fails
    return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
};
