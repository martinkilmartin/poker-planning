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
// isServer: True if I am the PeerJS server (Room Creator). Handles networking/broadcasting.
const isServer = ref(false);

// Module-level access to sendMessage for intervals
let globalSendMessage: ((data: any, targetId?: string) => void) | null = null;

const broadcastStateGlobal = () => {
  if (globalSendMessage) {
    globalSendMessage({
      type: 'UPDATE_STATE',
      payload: {
        players: state.players,
        status: state.status,
        autoReveal: state.autoReveal,
        autoRevealDuration: state.autoRevealDuration,
        countdownStartTime: state.countdownStartTime,
      },
    });
  }
};

const revealGlobal = () => {
  state.status = 'revealed';
  state.countdownStartTime = null;
  broadcastStateGlobal();
  if (globalSendMessage) {
    globalSendMessage({ type: 'REVEAL' });
  }
};

// Auto-reveal check interval
setInterval(() => {
  // Only Server runs the auto-reveal timer logic
  if (isServer.value && state.autoReveal && state.countdownStartTime && state.status === 'voting') {
    const elapsed = (Date.now() - state.countdownStartTime) / 1000;
    if (elapsed >= state.autoRevealDuration) {
      revealGlobal();
    }
  }
}, 1000);

// State Heartbeat: Broadcast full state periodically to ensure sync
setInterval(() => {
  if (isServer.value) {
    broadcastStateGlobal();
  }
}, 5000);

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

  // Initialize global sendMessage for intervals
  if (!globalSendMessage) {
    globalSendMessage = sendMessage;
  }

  const myUserId = getOrCreateUserId(); // Get stable user ID
  const myPlayer = computed(() => state.players.find(p => p.userId === myUserId));

  // isAdmin: True if I am the current Game Host (Logical Host). Handles UI/Game actions.
  const isAdmin = computed(() => myPlayer.value?.isHost ?? false);

  // Host Logic
  const createRoom = async (name: string, useLocalServer = false, customCode?: string) => {
    const id = await initializePeer(customCode, useLocalServer); // Wait for connection
    isServer.value = true; // I am the server
    isHost.value = true; // I am also the initial admin (for UI compatibility, though we should prefer isAdmin)
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
    saveRoomState(id, true, name, myPeerId.value!, myUserId, true, true, 10, null, myUserId);

    // Navigate to room URL
    navigateToRoom(id);
  };

  // Client Logic
  const joinRoom = async (hostRoomId: string, name: string, useLocalServer = false) => {
    await initializePeer(undefined, useLocalServer); // Wait for connection
    roomId.value = hostRoomId; // Store the room ID (host's ID)
    connectToPeer(hostRoomId);

    // Wait for connection to establish, then send JOIN packet
    // Use polling to ensure connection is open (more robust than setTimeout)
    const checkInterval = setInterval(() => {
      const hostConn = connections.value.find(c => c.peer === hostRoomId && c.open);
      if (hostConn) {
        clearInterval(checkInterval);
        sendMessage(
          {
            type: 'JOIN',
            payload: { name, userId: myUserId },
          },
          hostRoomId
        );
      }
    }, 100);

    // Navigate to room URL
    navigateToRoom(hostRoomId);

    // Save room state for refresh/rejoin
    saveRoomState(hostRoomId, false, name, myPeerId.value!, myUserId, false);
  };

  // Rejoin existing room after refresh
  const rejoinRoom = async (
    savedRoomId: string,
    savedName: string,
    wasHost: boolean,
    savedPeerId: string,
    savedUserId: string, // Stable user ID!
    savedIsOwner: boolean, // Added: Check if user is the room creator
    savedHostUserId: string | null, // Added: Restore host identity
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

    // If user is the owner (creator), they MUST rejoin as host to restore the room
    // regardless of whether they transferred host privileges temporarily.
    if (savedIsOwner || wasHost) {
      // Rejoin as host - reinitialize with same room ID (peer ID)
      await initializePeer(savedRoomId, useLocalServer);
      isServer.value = true; // I am the server (owner)
      isHost.value = savedHostUserId ? savedHostUserId === savedUserId : wasHost; // Restore admin status
      roomId.value = savedRoomId;

      // Re-add self to players list
      state.players = [
        {
          id: myPeerId.value!,
          userId: savedUserId,
          name: savedName,
          vote: null,
          isHost: savedHostUserId ? savedHostUserId === savedUserId : true, // Use saved host ID if available, else default to true (legacy)
          connectionStatus: 'online',
        },
      ];

      navigateToRoom(savedRoomId);
    } else {
      // Rejoin as client - use a new peer ID but SAME user ID
      await initializePeer(undefined, useLocalServer); // New peer connection
      isServer.value = false;
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
        if (isServer.value) {
          handleJoin(senderId, packet.payload.name, packet.payload.userId);
        }
        break;
      }
      case 'REJOIN': {
        if (isServer.value) {
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
        // Server receives vote, updates state, and broadcasts
        if (isServer.value) {
          handleVote(senderId, packet.payload.vote);
        }
        break;
      }
      case 'REVEAL': {
        state.status = 'revealed';
        if (isServer.value) broadcastState(); // Re-broadcast if server
        break;
      }
      case 'HIDE': {
        state.status = 'voting';
        if (isServer.value) broadcastState(); // Re-broadcast if server
        break;
      }
      case 'RESET': {
        state.status = 'voting';
        for (const p of state.players) p.vote = null;
        if (isServer.value) broadcastState(); // Re-broadcast if server
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
        if (isServer.value) broadcastState(); // Re-broadcast if server
        break;
      }
    }
  };

  // Host Handlers
  const handleJoin = (id: string, name: string, userId: string) => {
    if (!isServer.value) return; // Only server handles joins
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
    // Update local isHost flag (for UI)
    isHost.value = myPeerId.value === payload.newHostId;

    // Save state
    if (roomId.value && myPlayer.value) {
      // If we are claiming host, we might be the owner or not.
      // Ideally we track isOwner in state, but for now let's assume if we claim host we are "logical host".
      // But wait, isOwner is about "Technical Host" (room creator).
      // If we claim host, we don't become the room creator.
      // We need to know if we are the owner.
      // We can store isOwner in local state or infer it.
      // Since we don't have isOwner in local state variable, let's read it from existing localStorage or default to false?
      // Better: Add isOwner to useGame state or just read from localStorage.
      const savedState = localStorage.getItem('poker-planning-room-state');
      const isOwner = savedState ? JSON.parse(savedState).isOwner : false;

      // Find new host to get their userId
      const newHost = state.players.find(p => p.id === payload.newHostId);

      saveRoomState(
        roomId.value,
        true,
        myPlayer.value.name,
        myPeerId.value!,
        myUserId,
        isOwner,
        state.autoReveal,
        state.autoRevealDuration,
        state.countdownStartTime,
        newHost ? newHost.userId : null
      );
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
    if (!isAdmin.value) return; // Only admin can transfer

    const targetPlayer = state.players.find(p => p.userId === targetUserId);
    if (targetPlayer) {
      // Update local state
      for (const p of state.players) {
        p.isHost = p.userId === targetUserId;
      }
      isHost.value = myUserId === targetUserId;

      // Broadcast to all players (if server) or send packet (if admin client)
      if (isServer.value) {
        broadcastState();
        sendMessage({
          type: 'HOST_TRANSFER',
          payload: { newHostId: targetPlayer.id } as HostTransferPayload,
        });
      } else {
        // If I am Admin but not Server, I must tell Server to broadcast?
        // Actually, HOST_TRANSFER packet is handled by everyone.
        // But I can only send to Server.
        // Server receives HOST_TRANSFER? No, it's not in the switch case!
        // We need to add HOST_TRANSFER to switch case for Server to re-broadcast?
        // Existing handler: handleHostTransfer updates state.
        // If Server receives it, it updates state.
        // We should ensure Server re-broadcasts it.
        sendMessage({
          type: 'HOST_TRANSFER',
          payload: { newHostId: targetPlayer.id } as HostTransferPayload,
        });
      }

      console.log('Host transferred to:', targetPlayer.name);

      // If we transferred to someone else, we are no longer host
      if (myUserId !== targetUserId) {
        // Save state as non-host
        if (roomId.value && myPlayer.value) {
          // Preserve isOwner status
          const savedState = localStorage.getItem('poker-planning-room-state');
          const isOwner = savedState ? JSON.parse(savedState).isOwner : false;
          saveRoomState(
            roomId.value,
            false,
            myPlayer.value.name,
            myPeerId.value!,
            myUserId,
            isOwner,
            state.autoReveal,
            state.autoRevealDuration,
            state.countdownStartTime,
            targetUserId // The target user ID is the new host ID
          );
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
    if (roomId.value && myPlayer.value) {
      const savedState = localStorage.getItem('poker-planning-room-state');
      const isOwner = savedState ? JSON.parse(savedState).isOwner : false;

      const currentHost = state.players.find(p => p.isHost);
      const hostUserId = currentHost ? currentHost.userId : isHost.value ? myUserId : null;

      if (isHost.value) {
        saveRoomState(
          roomId.value,
          true,
          myPlayer.value.name,
          myPeerId.value!,
          myUserId,
          isOwner,
          state.autoReveal,
          state.autoRevealDuration,
          state.countdownStartTime,
          hostUserId
        );
      } else if (!isHost.value && wasHost) {
        // Was host, now demoted
        saveRoomState(
          roomId.value,
          false,
          myPlayer.value.name,
          myPeerId.value!,
          myUserId,
          isOwner,
          state.autoReveal,
          state.autoRevealDuration,
          state.countdownStartTime,
          hostUserId
        );
      }
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
    if (isAdmin.value) {
      state.status = 'revealed';
      state.countdownStartTime = null; // Clear countdown

      if (isServer.value) {
        broadcastState();
        sendMessage({ type: 'REVEAL' });
      } else {
        sendMessage({ type: 'REVEAL' });
      }
    }
  };

  const hide = () => {
    if (isAdmin.value) {
      state.status = 'voting';

      if (isServer.value) {
        broadcastState();
        sendMessage({ type: 'HIDE' });
      } else {
        sendMessage({ type: 'HIDE' });
      }
    }
  };

  const reset = () => {
    if (isAdmin.value) {
      state.status = 'voting';
      state.countdownStartTime = null; // Clear countdown
      for (const p of state.players) p.vote = null;

      if (isServer.value) {
        broadcastState();
        sendMessage({ type: 'RESET' });
      } else {
        sendMessage({ type: 'RESET' });
      }
    }
  };

  const updateSettings = (autoReveal: boolean, duration: number) => {
    if (isAdmin.value) {
      state.autoReveal = autoReveal;
      state.autoRevealDuration = duration;
      state.countdownStartTime = null; // Reset countdown on settings change

      sendMessage({
        type: 'UPDATE_SETTINGS',
        payload: { autoReveal, autoRevealDuration: duration },
      });

      if (isServer.value) {
        broadcastState();
      }
    }
  };

  return {
    state,
    myPeerId,
    roomId,
    isHost: isAdmin, // Expose isAdmin as isHost for UI compatibility
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
    myUserId, // Added
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
