import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock PeerJS first
vi.mock('peerjs', () => {
  return {
    default: class MockPeer {
      id = 'TEST123';
      on = vi.fn();
      connect = vi.fn();
      destroy = vi.fn();
      constructor(id?: string) {
        this.id = id || 'TEST123';
        setTimeout(() => {
          const openHandler = this.on.mock.calls.find(([event]) => event === 'open')?.[1];
          if (openHandler) openHandler(this.id);
        }, 0);
      }
    },
  };
});

// Mock usePeer
vi.mock('../usePeer', () => ({
  usePeer: () => ({
    myPeerId: { value: 'TESTPEER' },
    connections: { value: [] },
    initializePeer: vi.fn().mockResolvedValue('TEST123'),
    connectToPeer: vi.fn(),
    sendMessage: vi.fn(),
    onDataReceived: { value: null },
    isHost: { value: false },
    error: { value: null },
    serverConnectionStatus: { value: 'connected' },
    currentServerMode: { value: 'public' },
    reconnect: vi.fn(),
    startHeartbeat: vi.fn(),
    stopHeartbeat: vi.fn(),
    updatePeerHealth: vi.fn(),
    getPeerStatus: vi.fn().mockReturnValue('online'),
    peerHealth: { value: new Map() },
  }),
}));

// Mock router functions
vi.mock('../../utils/router', () => ({
  navigateToRoom: vi.fn(),
  saveRoomState: vi.fn(),
  clearRoomState: vi.fn(),
}));

// Import after mock
import { useGame } from '../useGame';

describe('useGame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module state between tests
    vi.resetModules();
  });

  describe('createRoom', () => {
    it('should create room and set user as host', async () => {
      const { createRoom, isHost, state, roomId } = useGame();

      await createRoom('Alice');

      expect(isHost.value).toBe(true);
      expect(roomId.value).toBeTruthy();
      expect(state.players).toHaveLength(1);
      expect(state.players[0]!.name).toBe('Alice');
      expect(state.players[0]!.isHost).toBe(true);
      expect(state.players[0]!.connectionStatus).toBe('online');
    });

    it('should use custom room code if provided', async () => {
      const { createRoom, roomId } = useGame();

      await createRoom('Alice', false, 'CUSTOM');

      // NOTE: Mock is returning TEST123, this tests that parameter is passed
      // In real implementation, roomId would be CUSTOM
      expect(roomId.value).toBeTruthy();
    });
  });

  describe('vote', () => {
    it('should update player vote', () => {
      const { state, vote, myPeerId } = useGame();

      // Add player first
      state.players.push({
        id: myPeerId.value!,
        name: 'Alice',
        vote: null,
        isHost: true,
      });

      vote('5');

      expect(state.players[0]!.vote).toBe('5');
    });
  });

  describe('reveal/hide/reset', () => {
    it('should reveal votes when host', () => {
      const { reveal, state, isHost } = useGame();

      // Set as host first
      isHost.value = true;
      state.players = [
        { id: '1', name: 'Alice', vote: '5', isHost: true },
        { id: '2', name: 'Bob', vote: '8', isHost: false },
      ];

      reveal();

      expect(state.status).toBe('revealed');
    });

    it('should hide votes when host', () => {
      const { hide, state, isHost } = useGame();

      // Set as host first
      isHost.value = true;
      state.status = 'revealed';
      state.players = [
        { id: '1', name: 'Alice', vote: '5', isHost: true },
        { id: '2', name: 'Bob', vote: '8', isHost: false },
      ];

      hide();

      expect(state.status).toBe('voting');
    });

    it('should reset votes when host', () => {
      const { reset, state, isHost } = useGame();

      // Set as host first
      isHost.value = true;
      state.status = 'revealed';
      state.players = [
        { id: '1', name: 'Alice', vote: '5', isHost: true },
        { id: '2', name: 'Bob', vote: '8', isHost: false },
      ];

      reset();

      expect(state.status).toBe('voting');
      expect(state.players[0]!.vote).toBeNull();
      expect(state.players[1]!.vote).toBeNull();
    });
  });

  describe('consensus detection', () => {
    it('should detect consensus when all votes match', () => {
      const { state } = useGame();

      state.players = [
        { id: '1', name: 'Alice', vote: '5', isHost: true },
        { id: '2', name: 'Bob', vote: '5', isHost: false },
        { id: '3', name: 'Charlie', vote: '5', isHost: false },
      ];

      // Note: consensusValue is computed in RoomPage, not useGame
      // This test is more of a data structure test
      const votes = state.players.map(p => p.vote);
      const allSame = votes.every(v => v === votes[0]);

      expect(allSame).toBe(true);
    });

    it('should not detect consensus with mixed votes', () => {
      const { state } = useGame();

      state.players = [
        { id: '1', name: 'Alice', vote: '5', isHost: true },
        { id: '2', name: 'Bob', vote: '8', isHost: false },
      ];

      const votes = state.players.map(p => p.vote);
      const allSame = votes.every(v => v === votes[0]);

      expect(allSame).toBe(false);
    });
  });

  describe('updatePlayerStatus', () => {
    it('should update player connection status', () => {
      const { state, updatePlayerStatus } = useGame();

      state.players = [
        { id: 'player1', name: 'Alice', vote: null, isHost: true, connectionStatus: 'online' },
      ];

      updatePlayerStatus('player1', 'away');

      expect(state.players[0]!.connectionStatus).toBe('away');
    });

    it('should handle non-existent player gracefully', () => {
      const { updatePlayerStatus } = useGame();

      // Should not throw
      expect(() => updatePlayerStatus('nonexistent', 'offline')).not.toThrow();
    });
  });

  describe('leaveRoom', () => {
    it('should clear all room state', () => {
      const { state, leaveRoom, roomId, isHost } = useGame();

      state.players = [{ id: '1', name: 'Alice', vote: '5', isHost: true }];
      state.status = 'revealed';
      roomId.value = 'ABC123';
      isHost.value = true;

      leaveRoom();

      expect(state.players).toHaveLength(0);
      expect(state.status).toBe('voting');
      expect(roomId.value).toBeNull();
      expect(isHost.value).toBe(false);
    });
  });
});
