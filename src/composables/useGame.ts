import { reactive, computed, ref } from 'vue';
import { usePeer } from './usePeer';
import type { GameState, Packet, HostTransferPayload } from '../types';
import { navigateToRoom, saveRoomState, clearRoomState } from '../utils/router';

const state = reactive<GameState>({
  players: [],
  status: 'voting',
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
    reconnect,
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
      isHost: true,
      connectionStatus: 'online',
    });

    // Save room state for refresh/rejoin
    saveRoomState(id, true, name);

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
        sendMessage(
          {
            type: 'JOIN',
            payload: { name },
          },
          hostRoomId
        );
      }
    }, 100);

    // Navigate to room URL
    navigateToRoom(hostRoomId);

    // Save room state for refresh/rejoin
    saveRoomState(hostRoomId, false, name);
  };

  // Rejoin existing room after refresh
  const rejoinRoom = async (
    savedRoomId: string,
    savedName: string,
    wasHost: boolean,
    useLocalServer = false
  ) => {
    console.log('Rejoining room:', savedRoomId, 'as', savedName, wasHost ? '(host)' : '(client)');

    if (wasHost) {
      // Rejoin as host - reinitialize with same room ID
      await initializePeer(savedRoomId, useLocalServer);
      isHost.value = true;
      roomId.value = savedRoomId;

      // Re-add self to players list
      state.players = [
        {
          id: myPeerId.value!,
          name: savedName,
          vote: null,
          isHost: true,
          connectionStatus: 'online',
        },
      ];

      navigateToRoom(savedRoomId);
    } else {
      // Rejoin as client
      await initializePeer(undefined, useLocalServer);
      roomId.value = savedRoomId;
      connectToPeer(savedRoomId);

      // Wait for connection then send REJOIN
      const checkInterval = setInterval(() => {
        const hostConn = connections.value.find(c => c.peer === savedRoomId && c.open);
        if (hostConn) {
          clearInterval(checkInterval);
          sendMessage(
            {
              type: 'REJOIN',
              payload: { userId: myPeerId.value, name: savedName },
            },
            savedRoomId
          );
        }
      }, 100);

      navigateToRoom(savedRoomId);
    }
  };

  // Handle incoming data
  onDataReceived.value = (data: any, senderId: string) => {
    const packet = data as Packet;

    switch (packet.type) {
      case 'JOIN': {
        if (isHost.value) {
          handleJoin(senderId, packet.payload.name);
        }
        break;
      }
      case 'REJOIN': {
        if (isHost.value) {
          handleRejoin(senderId, packet.payload.name);
        }
        break;
      }
      case 'WELCOME': {
        handleWelcome(packet.payload);
        break;
      }
      case 'UPDATE_STATE': {
        handleUpdateState(packet.payload);
        break;
      }
      case 'VOTE': {
        if (isHost.value) {
          handleVote(senderId, packet.payload.vote);
        }
        break;
      }
      case 'REVEAL': {
        state.status = 'revealed';
        break;
      }
      case 'HIDE': {
        state.status = 'voting';
        break;
      }
      case 'RESET': {
        state.status = 'voting';
        for (const p of state.players) p.vote = null;
        break;
      }
      case 'HOST_TRANSFER': {
        handleHostTransfer(packet.payload as HostTransferPayload);
        break;
      }
      case 'HOST_CLAIM': {
        handleHostClaim(senderId);
        break;
      }
      case 'PING': {
        // Respond to ping
        sendMessage({ type: 'PONG', payload: { timestamp: Date.now() } }, senderId);
        break;
      }
      case 'PONG': {
        // Heartbeat response received
        updatePlayerStatus(senderId, 'online');
        break;
      }
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
        isHost: false,
      });
      broadcastState();

      // Send Welcome to new player
      sendMessage(
        {
          type: 'WELCOME',
          payload: { players: state.players, status: state.status },
        },
        id
      );
    }
  };

  const handleRejoin = (id: string, name: string) => {
    console.log('Player rejoining:', name, id);
    // Check if player already exists (reconnecting)
    const existingPlayer = state.players.find(p => p.id === id);

    if (existingPlayer) {
      // Reconnect existing player
      existingPlayer.connectionStatus = 'online';
    } else {
      // Add as new player
      state.players.push({
        id,
        name,
        vote: null,
        isHost: false,
        connectionStatus: 'online',
      });
    }

    broadcastState();

    // Send current state to rejoining player
    sendMessage(
      {
        type: 'WELCOME',
        payload: { players: state.players, status: state.status },
      },
      id
    );
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
      payload: { players: state.players, status: state.status },
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

  const handleHostTransfer = (payload: HostTransferPayload) => {
    console.log('Host transferred to:', payload.newHostId);
    // Update host status for all players
    for (const p of state.players) {
      p.isHost = p.id === payload.newHostId;
    }
    // Update local isHost flag and save state
    isHost.value = myPeerId.value === payload.newHostId;
    if (isHost.value && roomId.value && myPlayer.value) {
      saveRoomState(roomId.value, true, myPlayer.value.name);
    }
  };

  const transferHost = () => {
    // Find next player to become host (first non-host player)
    const nextHost = state.players.find(p => !p.isHost);
    if (nextHost) {
      // Update local state
      for (const p of state.players) {
        p.isHost = p.id === nextHost.id;
      }
      isHost.value = myPeerId.value === nextHost.id;

      // Broadcast to all players
      sendMessage({
        type: 'HOST_TRANSFER',
        payload: { newHostId: nextHost.id } as HostTransferPayload,
      });

      console.log('Host transferred to:', nextHost.name);
    }
  };

  const handleHostClaim = (newHostId: string) => {
    console.log('Host claim from:', newHostId);
    // Update all players' host status
    for (const p of state.players) {
      p.isHost = p.id === newHostId;
    }

    // Update local isHost flag
    const wasHost = isHost.value;
    isHost.value = myPeerId.value === newHostId;

    // Update room state
    if (isHost.value && roomId.value && myPlayer.value) {
      saveRoomState(roomId.value, true, myPlayer.value.name);
    } else if (!isHost.value && wasHost && roomId.value && myPlayer.value) {
      // Was host, now demoted
      saveRoomState(roomId.value, false, myPlayer.value.name);
    }
  };

  const updatePlayerStatus = (playerId: string, status: 'online' | 'away' | 'offline') => {
    const player = state.players.find(p => p.id === playerId);
    if (player) {
      player.connectionStatus = status;
    }
  };

  const leaveRoom = () => {
    clearRoomState();
    state.players = [];
    state.status = 'voting';
    roomId.value = null;
    isHost.value = false;
  };

  // Actions
  const vote = (value: string) => {
    if (myPlayer.value) {
      myPlayer.value.vote = value; // Optimistic update

      if (isHost.value) {
        broadcastState();
      } else {
        // Find host? We don't explicitly store host ID, but we can infer or store it.
        // Actually, for clients, they only connect to Host.
        // So we can send to all connections (which is just the host).
        sendMessage({
          type: 'VOTE',
          payload: { vote: value },
        });
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
      for (const p of state.players) p.vote = null;
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
    rejoinRoom,
    vote,
    reveal,
    hide,
    reset,
    myPlayer,
    error,
    serverConnectionStatus,
    currentServerMode,
    reconnect,
    transferHost,
    broadcastState,
    leaveRoom,
    updatePlayerStatus,
  };
}

// Setup player disconnect detection
export function setupPlayerDisconnectDetection() {
  const { transferHost } = useGame();
  const { connections } = usePeer();

  // Watch for connection closures
  for (const conn of connections.value) {
    conn.on('close', () => {
      console.log('Player disconnected:', conn.peer);
      const game = useGame();
      const disconnectedPlayer = game.state.players.find(p => p.id === conn.peer);

      if (disconnectedPlayer?.isHost) {
        console.log('Host disconnected, transferring host...');
        // Remove disconnected player
        game.state.players = game.state.players.filter(p => p.id !== conn.peer);
        // Transfer host to next player
        transferHost();
      } else if (disconnectedPlayer) {
        // Remove regular player
        game.state.players = game.state.players.filter(p => p.id !== conn.peer);
        game.broadcastState?.();
      }
    });
  }
}
