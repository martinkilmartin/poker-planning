export interface Player {
  id: string; // PeerJS connection ID (changes on reconnect)
  userId: string; // Stable user ID (UUID, persists across reconnects)
  name: string;
  vote: string | null; // null means not voted yet
  isHost: boolean;
  connectionStatus?: 'online' | 'away' | 'offline';
}

export type GameStatus = 'voting' | 'revealed';

export interface GameState {
  players: Player[];
  status: 'voting' | 'revealed';
  autoReveal: boolean;
  autoRevealDuration: number;
  countdownStartTime: number | null;
}

// Network Packet Types
export type PacketType =
  | 'JOIN'
  | 'WELCOME'
  | 'UPDATE_STATE'
  | 'VOTE'
  | 'REVEAL'
  | 'HIDE'
  | 'RESET'
  | 'HOST_TRANSFER'
  | 'REJOIN'
  | 'PING'
  | 'PONG'
  | 'HOST_CLAIM'
  | 'UPDATE_SETTINGS';

export interface Packet {
  type: PacketType;
  payload?: any;
}

export interface JoinPayload {
  name: string;
}

export interface RejoinPayload {
  userId: string;
  name: string;
}

export interface HostTransferPayload {
  newHostId: string;
}

export interface VotePayload {
  vote: string;
}

export interface UpdateStatePayload {
  players: Player[];
  status: GameStatus;
}
