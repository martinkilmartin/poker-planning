// Mock PeerJS module
import { vi } from 'vitest'

export class MockDataConnection {
    peer: string
    open: boolean = false
    private eventHandlers: Map<string, Function[]> = new Map()

    constructor(peerId: string) {
        this.peer = peerId
        setTimeout(() => {
            this.open = true
            this.emit('open')
        }, 0)
    }

    on(event: string, handler: Function) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, [])
        }
        this.eventHandlers.get(event)!.push(handler)
    }

    send = vi.fn()
    close = vi.fn()

    emit(event: string, ...args: any[]) {
        const handlers = this.eventHandlers.get(event) || []
        handlers.forEach(handler => handler(...args))
    }
}

export class MockPeer {
    id: string
    disconnected: boolean = false
    destroyed: boolean = false
    private eventHandlers: Map<string, Function[]> = new Map()

    constructor(id?: string) {
        this.id = id || 'MOCK' + Math.random().toString(36).substr(2, 6).toUpperCase()
        // Immediately emit open to simulate successful connection
        setTimeout(() => this.emit('open', this.id), 0)
    }

    on(event: string, handler: Function) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, [])
        }
        this.eventHandlers.get(event)!.push(handler)
    }

    connect(peerId: string): MockDataConnection {
        return new MockDataConnection(peerId)
    }

    disconnect = vi.fn(() => { this.disconnected = true })
    reconnect = vi.fn(() => { this.disconnected = false })
    destroy = vi.fn(() => { this.destroyed = true })

    emit(event: string, ...args: any[]) {
        const handlers = this.eventHandlers.get(event) || []
        handlers.forEach(handler => handler(...args))
    }
}

export default MockPeer
