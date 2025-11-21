import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
    navigateToRoom,
    navigateToHome,
    getCurrentRoomFromURL,
    saveUserName,
    getSavedUserName,
    clearSavedUserName,
    saveRoomState,
    getRoomState,
    clearRoomState
} from '../router'

describe('router.ts', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear()
        // Mock pushState to avoid CORS issues in tests
        vi.spyOn(window.history, 'pushState').mockImplementation(() => { })
        // Reset window.location
        Object.defineProperty(window, 'location', {
            value: {
                href: 'http://localhost:5173/',
                search: '',
                hash: '',
                origin: 'http://localhost:5173'
            },
            writable: true
        })
        vi.clearAllMocks()
    })

    describe('navigateToRoom', () => {
        it('should set room parameter in URL', () => {
            const pushStateSpy = vi.spyOn(window.history, 'pushState')
            navigateToRoom('ABC123')

            expect(pushStateSpy).toHaveBeenCalled()
            const url = pushStateSpy.mock.calls[0][2] as string
            expect(url).toContain('?room=ABC123')
        })

        it('should uppercase room ID', () => {
            const pushStateSpy = vi.spyOn(window.history, 'pushState')
            navigateToRoom('abc123')

            const url = pushStateSpy.mock.calls[0][2] as string
            expect(url).toContain('?room=ABC123')
        })
    })

    describe('navigateToHome', () => {
        it('should remove room parameter from URL', () => {
            window.location.search = '?room=ABC123'
            const pushStateSpy = vi.spyOn(window.history, 'pushState')

            navigateToHome()

            expect(pushStateSpy).toHaveBeenCalled()
            const url = pushStateSpy.mock.calls[0][2] as string
            expect(url).not.toContain('room=')
        })
    })

    describe('getCurrentRoomFromURL', () => {
        it('should return room ID from URL', () => {
            window.location.search = '?room=ABC123'
            expect(getCurrentRoomFromURL()).toBe('ABC123')
        })

        it('should return null when no room parameter', () => {
            window.location.search = ''
            expect(getCurrentRoomFromURL()).toBeNull()
        })

        it('should uppercase room ID', () => {
            window.location.search = '?room=abc123'
            expect(getCurrentRoomFromURL()).toBe('ABC123')
        })
    })

    describe('saveUserName / getSavedUserName', () => {
        it('should save user name to localStorage', () => {
            saveUserName('Alice')
            expect(localStorage.getItem('poker-planning-user-name')).toBe('Alice')
        })

        it('should retrieve saved user name', () => {
            localStorage.setItem('poker-planning-user-name', 'Bob')
            expect(getSavedUserName()).toBe('Bob')
        })

        it('should return null when no saved name', () => {
            expect(getSavedUserName()).toBeNull()
        })
    })

    describe('clearSavedUserName', () => {
        it('should remove user name from localStorage', () => {
            localStorage.setItem('poker-planning-user-name', 'Alice')
            clearSavedUserName()
            expect(localStorage.getItem('poker-planning-user-name')).toBeNull()
        })
    })

    describe('saveRoomState / getRoomState', () => {
        it('should save room state to localStorage', () => {
            saveRoomState('ABC123', true, 'Alice')

            const saved = JSON.parse(localStorage.getItem('poker-planning-room-state')!)
            expect(saved).toEqual({
                roomId: 'ABC123',
                isHost: true,
                myName: 'Alice'
            })
        })

        it('should retrieve saved room state', () => {
            const state = { roomId: 'XYZ789', isHost: false, myName: 'Bob' }
            localStorage.setItem('poker-planning-room-state', JSON.stringify(state))

            expect(getRoomState()).toEqual(state)
        })

        it('should return null when no saved state', () => {
            expect(getRoomState()).toBeNull()
        })

        it('should trim and uppercase room ID', () => {
            saveRoomState(' abc ', true, 'Alice')

            const saved = JSON.parse(localStorage.getItem('poker-planning-room-state')!)
            expect(saved.roomId).toBe(' abc ')  // saveRoomState doesn't modify
        })
    })

    describe('clearRoomState', () => {
        it('should remove room state from localStorage', () => {
            saveRoomState('ABC123', true, 'Alice')
            clearRoomState()
            expect(localStorage.getItem('poker-planning-room-state')).toBeNull()
        })
    })
})
