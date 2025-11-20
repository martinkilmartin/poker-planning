// Simple query parameter-based routing for room navigation
export const navigateToRoom = (roomId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomId.toUpperCase());
    window.history.pushState({}, '', url.toString());
};

export const navigateToHome = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.pushState({}, '', url.toString());
};

export const getCurrentRoomFromURL = (): string | null => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    return room ? room.toUpperCase() : null;
};

export const onUrlChange = (callback: () => void) => {
    window.addEventListener('popstate', callback);
    return () => window.removeEventListener('popstate', callback);
};

// localStorage helpers for user name persistence
const USER_NAME_KEY = 'poker-planning-user-name';

export const saveUserName = (name: string): void => {
    try {
        localStorage.setItem(USER_NAME_KEY, name);
    } catch (e) {
        console.error('Failed to save user name:', e);
    }
};

export const getSavedUserName = (): string | null => {
    try {
        return localStorage.getItem(USER_NAME_KEY);
    } catch (e) {
        console.error('Failed to get saved user name:', e);
        return null;
    }
};

export const clearSavedUserName = (): void => {
    try {
        localStorage.removeItem(USER_NAME_KEY);
    } catch (e) {
        console.error('Failed to clear saved user name:', e);
    }
};
