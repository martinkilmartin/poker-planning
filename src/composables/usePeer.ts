import { ref, watch } from 'vue';
import Peer, { type DataConnection } from 'peerjs';

export interface PeerState {
    peerId: string | null;
    isHost: boolean;
    connections: DataConnection[];
    error: string | null;
}

// Generate a short random room code (6 characters, alphanumeric)
const generateRoomCode = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0, O, 1, I
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

const peer = ref<Peer | null>(null);
const myPeerId = ref<string | null>(null);
const connections = ref<DataConnection[]>([]);
const error = ref<string | null>(null);
const isHost = ref(false);
const onDataReceived = ref<((data: any, senderId: string) => void) | null>(null);
const isPeerReady = ref(false);
const serverConnectionStatus = ref<'disconnected' | 'connecting' | 'connected'>('disconnected');
const currentServerMode = ref<'public' | 'local'>('public');

// Heartbeat tracking
const peerHealth = ref<Map<string, { lastSeen: number, status: 'online' | 'away' | 'offline' }>>(new Map());
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function usePeer() {

    // Initialize Peer
    const initializePeer = (id?: string, useLocalServer = false): Promise<string> => {
        return new Promise((resolve, reject) => {
            if (peer.value) {
                peer.value.destroy();
                connections.value = [];
                isPeerReady.value = false;
                serverConnectionStatus.value = 'disconnected';
            }

            const newPeerId = id || generateRoomCode(); // Use short code instead of UUID
            myPeerId.value = newPeerId;
            serverConnectionStatus.value = 'connecting';
            currentServerMode.value = useLocalServer ? 'local' : 'public';

            const config = useLocalServer ? {
                host: '127.0.0.1',
                port: 9000,
                path: '/',
                key: 'peerjs',
                secure: false,
                debug: 2,
            } : {
                host: '0.peerjs.com',
                port: 443,
                path: '/',
                secure: true,
                debug: 2,
                pingInterval: 5000,
            };


            const p = new Peer(newPeerId, config);

            let resolved = false;

            // Set a timeout to prevent hanging forever
            const timeout = setTimeout(() => {
                if (!resolved) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);

            p.on('open', (id) => {
                console.log('My peer ID is: ' + id);
                resolved = true;
                clearTimeout(timeout);
                isPeerReady.value = true;
                serverConnectionStatus.value = 'connected';
                error.value = null;
                resolve(id);
            });

            p.on('disconnected', () => {
                console.log('Disconnected from signaling server');
                serverConnectionStatus.value = 'disconnected';
                isPeerReady.value = false;
                // Don't auto-reconnect, user must click button
            });

            p.on('close', () => {
                console.log('Peer destroyed');
                serverConnectionStatus.value = 'disconnected';
                isPeerReady.value = false;
            });

            p.on('connection', (conn) => {
                console.log('Incoming connection from:', conn.peer);
                setupConnection(conn);
            });

            p.on('error', (err: any) => {
                console.error('Peer error:', err);
                clearTimeout(timeout);

                // Detailed error messages for users
                let userMessage = '';

                if (err.type === 'peer-unavailable') {
                    userMessage = '❌ Room not found.\n\n' +
                        'The room may have closed or the Room ID is incorrect.\n' +
                        'Please check the code and try again.';
                } else if (err.type === 'network') {
                    userMessage = '🌐 Network Connection Problem\n\n' +
                        'Cannot connect to the signaling server.\n\n' +
                        '🔍 Common causes:\n' +
                        '• Corporate VPN blocking WebRTC traffic\n' +
                        '• Firewall blocking required ports\n' +
                        '• No internet connection\n\n' +
                        '💡 Try:\n' +
                        '1. Disconnect from VPN and retry\n' +
                        '2. Check "Use Local Server (Dev)" if on same network\n' +
                        '3. Check your internet connection';
                } else if (err.type === 'server-error') {
                    userMessage = '🔌 Server Connection Failed\n\n' +
                        'Cannot reach the PeerJS server.\n\n' +
                        '💡 Try:\n' +
                        '• Use "Local Server (Dev)" option\n' +
                        '• Check your network connection\n' +
                        '• Server may be temporarily down';
                } else if (err.type === 'socket-error' || err.message?.includes('WebSocket')) {
                    userMessage = '🔒 WebSocket Connection Blocked\n\n' +
                        'Your network is blocking the connection.\n\n' +
                        '🔍 This usually means:\n' +
                        '• VPN is active (most common)\n' +
                        '• Corporate firewall blocking ports\n' +
                        '• Network proxy interfering\n\n' +
                        '💡 Solutions:\n' +
                        '1. Disconnect VPN and try again\n' +
                        '2. Use "Local Server (Dev)" if everyone is on the same network\n' +
                        '3. Contact IT to whitelist *.peerjs.com';
                } else if (err.type === 'disconnected') {
                    userMessage = '📡 Connection Lost\n\n' +
                        'Lost connection to signaling server.\n\n' +
                        '💡 Click the "Reconnect" button to try again.';
                } else {
                    userMessage = `⚠️ Connection Error\n\n${err.message || 'Unknown error'}\n\n` +
                        '💡 If on VPN, try disconnecting and refreshing the page.';
                }

                error.value = userMessage;

                // Reject if it's a fatal initialization error
                if (serverConnectionStatus.value === 'connecting' && !resolved) {
                    resolved = true;
                    reject(err);
                }
            });

            peer.value = p;
        });
    };

    const connectToPeer = (targetId: string) => {
        if (!peer.value) {
            initializePeer();
        }

        if (isPeerReady.value) {
            _connect(targetId);
        } else {
            const unwatch = watch(isPeerReady, (ready) => {
                if (ready) {
                    _connect(targetId);
                    unwatch();
                }
            });
        }
    };

    const _connect = (targetId: string) => {
        if (!peer.value) return;
        console.log('Connecting to peer:', targetId);
        const conn = peer.value.connect(targetId, {
            reliable: true
        });
        setupConnection(conn);
    };

    const setupConnection = (conn: DataConnection) => {
        conn.on('open', () => {
            console.log('Connection established with:', conn.peer);
            // Add to connections list if not already there
            if (!connections.value.find(c => c.peer === conn.peer)) {
                connections.value.push(conn);
            }
        });

        conn.on('data', (data) => {
            console.log('Received data:', data);
            // We will expose a callback or event bus for data handling
            // For now just log
            handleData(data, conn.peer);
        });

        conn.on('close', () => {
            console.log('Connection closed:', conn.peer);
            connections.value = connections.value.filter(c => c.peer !== conn.peer);
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
        });
    };

    // Data handling callback

    const handleData = (data: any, senderId: string) => {
        if (onDataReceived.value) {
            onDataReceived.value(data, senderId);
        }
    };

    const sendMessage = (data: any, targetId?: string) => {
        if (targetId) {
            const conn = connections.value.find(c => c.peer === targetId);
            if (conn && conn.open) {
                conn.send(data);
            }
        } else {
            // Broadcast
            connections.value.forEach(conn => {
                if (conn.open) {
                    conn.send(data);
                }
            });
        }
    };

    const reconnect = () => {
        if (peer.value && peer.value.disconnected) {
            console.log('Attempting to reconnect...');
            serverConnectionStatus.value = 'connecting';
            peer.value.reconnect();
        }
    };

    // Heartbeat/Ping system
    const startHeartbeat = () => {
        // Stop existing interval
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }

        // Send PING every 10 seconds
        heartbeatInterval = setInterval(() => {
            connections.value.forEach(conn => {
                if (conn.open) {
                    conn.send({ type: 'PING', timestamp: Date.now() });
                }
            });

            // Update status based on last seen
            const now = Date.now();
            peerHealth.value.forEach((health) => {
                const timeSinceLastSeen = now - health.lastSeen;

                if (timeSinceLastSeen > 30000) {
                    health.status = 'offline';
                } else if (timeSinceLastSeen > 15000) {
                    health.status = 'away';
                } else {
                    health.status = 'online';
                }
            });
        }, 10000);
    };

    const stopHeartbeat = () => {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
    };

    const updatePeerHealth = (peerId: string, status: 'online' | 'away' | 'offline' = 'online') => {
        peerHealth.value.set(peerId, {
            lastSeen: Date.now(),
            status
        });
    };

    const getPeerStatus = (peerId: string): 'online' | 'away' | 'offline' => {
        const health = peerHealth.value.get(peerId);
        if (!health) return 'offline';

        const timeSinceLastSeen = Date.now() - health.lastSeen;
        if (timeSinceLastSeen > 30000) return 'offline';
        if (timeSinceLastSeen > 15000) return 'away';
        return 'online';
    };

    return {
        peer,
        myPeerId,
        connections,
        error,
        initializePeer,
        connectToPeer,
        sendMessage,
        onDataReceived,
        isHost,
        serverConnectionStatus,
        currentServerMode,
        reconnect,
        startHeartbeat,
        stopHeartbeat,
        updatePeerHealth,
        getPeerStatus,
        peerHealth
    };
}
