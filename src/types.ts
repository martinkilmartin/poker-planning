export interface Player {
    id: string;
    name: string;
    vote: string | null; // null means not voted yet
    isHost: boolean;
}

export type GameStatus = 'voting' | 'revealed';

export interface GameState {
    players: Player[];
    status: GameStatus;
}

// Network Packet Types
export type PacketType =
    | 'JOIN'
    | 'WELCOME'
    | 'UPDATE_STATE'
    | 'VOTE'
    | 'REVEAL'
    | 'HIDE'
    | 'RESET';

export interface Packet {
    type: PacketType;
    payload?: any;
}

export interface JoinPayload {
    name: string;
}

export interface VotePayload {
    vote: string;
}

export interface UpdateStatePayload {
    players: Player[];
    status: GameStatus;
}
