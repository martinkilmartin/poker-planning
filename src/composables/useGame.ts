
import { reactive, computed, ref } from 'vue';
import { usePeer } from './usePeer';
import type { GameState, Packet } from '../types';
import { navigateToRoom } from '../utils/router';

const state = reactive<GameState>({
    players: [],
    status: 'voting'
});

const roomId = ref<string | null>(null);

export function useGame() {
    const {
        myPeerId,
        connections,
        initializePeer,
        connectToPeer,
        sendMessage,
        onDataReceived,
        isHost,
        error,
        serverConnectionStatus,
        currentServerMode,
        reconnect
    } = usePeer();

    const myPlayer = computed(() => state.players.find(p => p.id === myPeerId.value));

    // Host Logic
    const createRoom = async (name: string, useLocalServer = false, customCode?: string) => {
        const id = await initializePeer(customCode, useLocalServer); // Wait for connection
        isHost.value = true;
        roomId.value = id; // Store the room ID

        // Add self to players
        state.players.push({
            id: myPeerId.value!,
            name,
            vote: null,
            isHost: true
        });

        // Navigate to room URL
        navigateToRoom(id);
    };

    // Client Logic
    const joinRoom = async (hostRoomId: string, name: string, useLocalServer = false) => {
        await initializePeer(undefined, useLocalServer); // Wait for connection
        roomId.value = hostRoomId; // Store the room ID (host's ID)
        connectToPeer(hostRoomId);

        // We need to wait for connection to open before sending JOIN?
        // usePeer handles connection setup.
        // We can listen for 'open' on the connection in usePeer, but here we just want to send JOIN once connected.
        // A simple way is to retry or wait. 
        // Better: usePeer could expose a "onConnectionOpen" callback for specific connection?
        // Or we just wait a bit.
        // Actually, `connectToPeer` in `usePeer` sets up the connection.
        // We need to hook into when that specific connection is open to send the JOIN packet.
        // Let's modify `usePeer` slightly later if needed, or just use a timeout/interval for MVP.
        // For now, let's assume we can send it after a short delay or when the connection emits open.
        // Since `usePeer` doesn't expose the connection object return directly in the current implementation (it returns void),
        // we might need to improve `usePeer`.

        // Let's improve `usePeer` to return the connection or a promise.
        // But for now, let's rely on the fact that `connections` array is reactive.

        // Wait for connection to host
        const checkInterval = setInterval(() => {
            const hostConn = connections.value.find(c => c.peer === hostRoomId && c.open);
            if (hostConn) {
                clearInterval(checkInterval);
                sendMessage({
                    type: 'JOIN',
                    payload: { name }
                }, hostRoomId);
            }
        }, 100);

        // Navigate to room URL
        navigateToRoom(hostRoomId);
    };

    // Handle incoming data
    onDataReceived.value = (data: any, senderId: string) => {
        const packet = data as Packet;

        switch (packet.type) {
            case 'JOIN':
                if (isHost.value) {
                    handleJoin(senderId, packet.payload.name);
                }
                break;
            case 'WELCOME':
                handleWelcome(packet.payload);
                break;
            case 'UPDATE_STATE':
                handleUpdateState(packet.payload);
                break;
            case 'VOTE':
                if (isHost.value) {
                    handleVote(senderId, packet.payload.vote);
                }
                break;
            case 'REVEAL':
                state.status = 'revealed';
                break;
            case 'HIDE':
                state.status = 'voting';
                break;
            case 'RESET':
                state.status = 'voting';
                state.players.forEach(p => p.vote = null);
                break;
        }
    };

    // Host Handlers
    const handleJoin = (id: string, name: string) => {
        // Check if already exists
        if (!state.players.find(p => p.id === id)) {
            state.players.push({
                id,
                name,
                vote: null,
                isHost: false
            });
            broadcastState();

            // Send Welcome to new player
            sendMessage({
                type: 'WELCOME',
                payload: { players: state.players, status: state.status }
            }, id);
        }
    };

    const handleVote = (id: string, vote: string) => {
        const player = state.players.find(p => p.id === id);
        if (player) {
            player.vote = vote;
            broadcastState();
        }
    };

    const broadcastState = () => {
        sendMessage({
            type: 'UPDATE_STATE',
            payload: { players: state.players, status: state.status }
        });
    };

    // Client Handlers
    const handleWelcome = (payload: any) => {
        state.players = payload.players;
        state.status = payload.status;
    };

    const handleUpdateState = (payload: any) => {
        state.players = payload.players;
        state.status = payload.status;
    };

    // Actions
    const vote = (value: string) => {
        if (myPlayer.value) {
            myPlayer.value.vote = value; // Optimistic update

            if (!isHost.value) {
                // Find host? We don't explicitly store host ID, but we can infer or store it.
                // Actually, for clients, they only connect to Host.
                // So we can send to all connections (which is just the host).
                sendMessage({
                    type: 'VOTE',
                    payload: { vote: value }
                });
            } else {
                broadcastState();
            }
        }
    };

    const reveal = () => {
        if (isHost.value) {
            state.status = 'revealed';
            broadcastState();
            sendMessage({ type: 'REVEAL' });
        }
    };

    const hide = () => {
        if (isHost.value) {
            state.status = 'voting';
            broadcastState();
            sendMessage({ type: 'HIDE' });
        }
    };

    const reset = () => {
        if (isHost.value) {
            state.status = 'voting';
            state.players.forEach(p => p.vote = null);
            broadcastState(); // Or send RESET packet
            sendMessage({ type: 'RESET' });
        }
    };

    return {
        state,
        myPeerId,
        roomId,
        isHost,
        createRoom,
        joinRoom,
        vote,
        reveal,
        hide,
        reset,
        myPlayer,
        error,
        serverConnectionStatus,
        currentServerMode,
        reconnect
    };
}
