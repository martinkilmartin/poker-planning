import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import Toast from '../Toast.vue';

describe('Toast.vue', () => {
  it('should show toast when show prop is true', () => {
    const wrapper = mount(Toast, {
      props: {
        message: 'Test message',
        show: true,
      },
    });

    expect(wrapper.find('.toast').exists()).toBe(true);
    expect(wrapper.text()).toContain('Test message');
  });

  it('should not show toast when show prop is false', () => {
    const wrapper = mount(Toast, {
      props: {
        message: 'Test message',
        show: false,
      },
    });

    expect(wrapper.find('.toast').exists()).toBe(false);
  });
});
