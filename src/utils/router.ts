// Simple hash-based routing for room navigation
export const navigateToRoom = (roomId: string) => {
    window.location.hash = `/room/${roomId.toUpperCase()}`;
};

export const navigateToHome = () => {
    window.location.hash = '/';
};

export const getCurrentRoomFromURL = (): string | null => {
    const hash = window.location.hash;
    // Match #/room/ROOMID
    const match = hash.match(/^#\/room\/([A-Z0-9]+)$/i);
    return match ? match[1].toUpperCase() : null;
};

export const onHashChange = (callback: () => void) => {
    window.addEventListener('hashchange', callback);
    return () => window.removeEventListener('hashchange', callback);
};
