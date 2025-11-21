import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import App from '../../App.vue';

// Mock child components
vi.mock('../LandingPage.vue', () => ({
  default: {
    name: 'LandingPage',
    template: '<div class="landing-page">Landing</div>',
  },
}));

vi.mock('../RoomPage.vue', () => ({
  default: {
    name: 'RoomPage',
    template: '<div class="room-page">Room</div>',
  },
}));

// Mock router
vi.mock('../../utils/router', () => ({
  getCurrentRoomFromURL: vi.fn(() => null),
  onUrlChange: vi.fn(() => vi.fn()),
}));

// Mock useGame - not in room
vi.mock('../../composables/useGame', () => ({
  useGame: () => ({
    roomId: { value: null },
  }),
}));

describe('App.vue', () => {
  it('should render LandingPage when not in room', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          Transition: false,
        },
      },
    });

    expect(wrapper.html()).toContain('Landing');
  });
});
