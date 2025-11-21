import { vi } from 'vitest'

export class MockDataConnection {
    peer: string
    open: boolean = false
    private eventHandlers: Map<string, Function[]> = new Map()

    constructor(peerId: string) {
        this.peer = peerId
        // Simulate connection opening after a delay
        setTimeout(() => {
            this.open = true
            this.emit('open')
        }, 10)
    }

    on(event: string, handler: Function) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, [])
        }
        this.eventHandlers.get(event)!.push(handler)
    }

    send(data: any) {
        // Simulate sending data
    }

    close() {
        this.open = false
        this.emit('close')
    }

    emit(event: string, ...args: any[]) {
        const handlers = this.eventHandlers.get(event) || []
        handlers.forEach(handler => handler(...args))
    }

    // Simulate receiving data
    receiveData(data: any) {
        this.emit('data', data)
    }
}

export class MockPeer {
    id: string
    disconnected: boolean = false
    destroyed: boolean = false
    private eventHandlers: Map<string, Function[]> = new Map()

    constructor(id?: string, config?: any) {
        this.id = id || 'MOCK-' + Math.random().toString(36).substr(2, 6).toUpperCase()

        // Simulate peer initialization
        setTimeout(() => {
            this.emit('open', this.id)
        }, 10)
    }

    on(event: string, handler: Function) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, [])
        }
        this.eventHandlers.get(event)!.push(handler)
    }

    connect(peerId: string, options?: any): MockDataConnection {
        const connection = new MockDataConnection(peerId)
        return connection
    }

    disconnect() {
        this.disconnected = true
        this.emit('disconnected')
    }

    reconnect() {
        this.disconnected = false
        setTimeout(() => {
            this.emit('open', this.id)
        }, 10)
    }

    destroy() {
        this.destroyed = true
        this.disconnected = true
        this.emit('close')
    }

    emit(event: string, ...args: any[]) {
        const handlers = this.eventHandlers.get(event) || []
        handlers.forEach(handler => handler(...args))
    }

    // Simulate incoming connection
    receiveConnection(connection: MockDataConnection) {
        this.emit('connection', connection)
    }
}

// Mock the peerjs module
export const createMockPeerJS = () => {
    return {
        default: MockPeer,
        Peer: MockPeer
    }
}

// Helper to mock PeerJS in tests
export const mockPeerJS = () => {
    vi.mock('peerjs', () => createMockPeerJS())
}
