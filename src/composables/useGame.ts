import { reactive, computed, ref } from 'vue';
import { usePeer } from './usePeer';
import type { GameState, Packet, HostTransferPayload } from '../types';
import { navigateToRoom, saveRoomState, clearRoomState } from '../utils/router';
import { getOrCreateUserId } from '../utils/userId';

const state = reactive<GameState>({
  players: [],
  status: 'voting',
  autoReveal: true,
  autoRevealDuration: 10,
  countdownStartTime: null,
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

  const myUserId = getOrCreateUserId(); // Get stable user ID
  const myPlayer = computed(() => state.players.find(p => p.userId === myUserId));

  // Host Logic
  const createRoom = async (name: string, useLocalServer = false, customCode?: string) => {
    const id = await initializePeer(customCode, useLocalServer); // Wait for connection
    isHost.value = true;
    roomId.value = id; // Store the room ID

    // Add self to players
    state.players.push({
      id: myPeerId.value!,
      userId: myUserId,
      name,
      vote: null,
      isHost: true,
      connectionStatus: 'online',
    });

    // Save room state for refresh/rejoin
    saveRoomState(id, true, name, myPeerId.value!, myUserId);

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
    // Wait a moment for connection to establish, then send JOIN packet
    setTimeout(() => {
      const hostConn = connections.value.find(c => c.peer === hostRoomId && c.open);
      if (hostConn) {
        sendMessage(
          {
            type: 'JOIN',
            payload: { name, userId: myUserId },
          },
          hostRoomId
        );
      } else {
        console.error('Failed to connect to host');
      }
    }, 100);

    // Navigate to room URL
    navigateToRoom(hostRoomId);

    // Save room state for refresh/rejoin
    saveRoomState(hostRoomId, false, name, myPeerId.value!, myUserId);
  };

  // Rejoin existing room after refresh
  const rejoinRoom = async (
    savedRoomId: string,
    savedName: string,
    wasHost: boolean,
    savedPeerId: string,
    savedUserId: string, // Stable user ID!
    useLocalServer = false
  ) => {
    console.log(
      'Rejoining room:',
      savedRoomId,
      'as',
      savedName,
      wasHost ? '(host)' : '(client)',
      'with peer ID:',
      savedPeerId
    );

    if (wasHost) {
      // Rejoin as host - reinitialize with same room ID (peer ID)
      await initializePeer(savedRoomId, useLocalServer);
      isHost.value = true;
      roomId.value = savedRoomId;

      // Re-add self to players list
      state.players = [
        {
          id: myPeerId.value!,
          userId: savedUserId,
          name: savedName,
          vote: null,
          isHost: true,
          connectionStatus: 'online',
        },
      ];

      navigateToRoom(savedRoomId);
    } else {
      // Rejoin as client - use a new peer ID but SAME user ID
      await initializePeer(undefined, useLocalServer); // New peer connection
      isHost.value = false;
      roomId.value = savedRoomId;

      // Connect to host
      connectToPeer(savedRoomId);

      // Send REJOIN packet to let host know we're back
      // Wait for connection then send REJOIN
      const checkInterval = setInterval(() => {
        const hostConn = connections.value.find(c => c.peer === savedRoomId && c.open);
        if (hostConn) {
          clearInterval(checkInterval);
          sendMessage(
            {
              type: 'REJOIN',
              payload: { userId: savedUserId, name: savedName },
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
          handleJoin(senderId, packet.payload.name, packet.payload.userId);
        }
        break;
      }
      case 'REJOIN': {
        if (isHost.value) {
          handleRejoin(senderId, packet.payload.userId, packet.payload.name);
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
      case 'UPDATE_SETTINGS': {
        handleUpdateSettings(packet.payload);
        break;
      }
    }
  };

  // Auto-reveal check interval
  setInterval(() => {
    if (isHost.value && state.autoReveal && state.countdownStartTime && state.status === 'voting') {
      const elapsed = (Date.now() - state.countdownStartTime) / 1000;
      if (elapsed >= state.autoRevealDuration) {
        reveal();
      }
    }
  }, 1000);

  // Host Handlers
  const handleJoin = (id: string, name: string, userId: string) => {
    // Check if already exists by userId (not peer ID)
    if (!state.players.find(p => p.userId === userId)) {
      state.players.push({
        id,
        userId,
        name,
        vote: null,
        isHost: false,
        connectionStatus: 'online',
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

  const handleRejoin = (id: string, userId: string, name: string) => {
    console.log('Player rejoining:', name, 'userId:', userId, 'peerId:', id);
    // Find by stable userId (NOT peer ID, which changes on reconnect)
    const existingPlayer = state.players.find(p => p.userId === userId);

    if (existingPlayer) {
      // Update connection details for existing player
      existingPlayer.id = id; // Update to new peer ID
      existingPlayer.connectionStatus = 'online';
      console.log('  -> Reconnected existing player');
    } else {
      // Add as new player (first time joining)
      state.players.push({
        id,
        userId,
        name,
        vote: null,
        isHost: false,
        connectionStatus: 'online',
      });
      console.log('  -> Added as new player');
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
      checkCountdownTrigger();
      broadcastState();
    }
  };

  const checkCountdownTrigger = () => {
    if (!state.autoReveal) return;

    const totalPlayers = state.players.length;
    const votedPlayers = state.players.filter(p => p.vote).length;
    const remaining = totalPlayers - votedPlayers;

    if (remaining === 1 && !state.countdownStartTime) {
      // Start countdown
      state.countdownStartTime = Date.now();
    } else if (remaining === 0) {
      // Everyone voted, clear countdown (reveal will happen naturally or manually)
      state.countdownStartTime = null;
    }
  };

  const broadcastState = () => {
    sendMessage({
      type: 'UPDATE_STATE',
      payload: {
        players: state.players,
        status: state.status,
        autoReveal: state.autoReveal,
        autoRevealDuration: state.autoRevealDuration,
        countdownStartTime: state.countdownStartTime,
      },
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
    // Sync settings if provided (for backward compatibility)
    if (payload.autoReveal !== undefined) state.autoReveal = payload.autoReveal;
    if (payload.autoRevealDuration !== undefined)
      state.autoRevealDuration = payload.autoRevealDuration;
    if (payload.countdownStartTime !== undefined)
      state.countdownStartTime = payload.countdownStartTime;
  };

  const handleUpdateSettings = (payload: any) => {
    state.autoReveal = payload.autoReveal;
    state.autoRevealDuration = payload.autoRevealDuration;
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
      saveRoomState(roomId.value, true, myPlayer.value.name, myPeerId.value!, myUserId);
    }
  };

  const transferHost = () => {
    // Find next player to become host (first non-host player)
    const nextHost = state.players.find(p => !p.isHost);
    if (nextHost) {
      transferHostTo(nextHost.userId);
    }
  };

  const transferHostTo = (targetUserId: string) => {
    if (!isHost.value) return;

    const targetPlayer = state.players.find(p => p.userId === targetUserId);
    if (targetPlayer) {
      // Update local state
      for (const p of state.players) {
        p.isHost = p.userId === targetUserId;
      }
      isHost.value = myUserId === targetUserId;

      // Broadcast to all players
      sendMessage({
        type: 'HOST_TRANSFER',
        payload: { newHostId: targetPlayer.id } as HostTransferPayload,
      });

      console.log('Host transferred to:', targetPlayer.name);

      // If we transferred to someone else, we are no longer host
      if (myUserId !== targetUserId) {
        // Save state as non-host
        if (roomId.value && myPlayer.value) {
          saveRoomState(roomId.value, false, myPlayer.value.name, myPeerId.value!, myUserId);
        }
      }
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
      saveRoomState(roomId.value, true, myPlayer.value.name, myPeerId.value!, myUserId);
    } else if (!isHost.value && wasHost && roomId.value && myPlayer.value) {
      // Was host, now demoted
      saveRoomState(roomId.value, false, myPlayer.value.name, myPeerId.value!, myUserId);
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
      state.countdownStartTime = null; // Clear countdown
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
      state.countdownStartTime = null; // Clear countdown
      for (const p of state.players) p.vote = null;
      broadcastState(); // Or send RESET packet
      sendMessage({ type: 'RESET' });
    }
  };

  const updateSettings = (autoReveal: boolean, duration: number) => {
    if (isHost.value) {
      state.autoReveal = autoReveal;
      state.autoRevealDuration = duration;
      state.countdownStartTime = null; // Reset countdown on settings change

      sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: { autoReveal, autoRevealDuration: duration },
      });
      broadcastState();
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
    updateSettings,
    transferHostTo,
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
