<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  message: string;
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

// Auto-dismiss after 3 seconds
watch(() => props.show, (newShow) => {
  if (newShow) {
    setTimeout(() => {
      emit('close');
    }, 3000);
  }
});
</script>

<template>
  <Transition name="toast">
    <div v-if="show" class="toast-container">
      <div class="toast glass-panel">
        <span class="toast-icon">✓</span>
        <span class="toast-message">{{ message }}</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
}

.toast {
  padding: 1rem 1.5rem;
  background: rgba(16, 185, 129, 0.95);
  border: 1px solid rgba(16, 185, 129, 0.6);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(10px);
}

.toast-icon {
  font-size: 1.5rem;
  color: white;
}

.toast-message {
  color: white;
  font-weight: 600;
  font-size: 0.95rem;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}
</style>
