<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import LandingPage from './components/LandingPage.vue';
import RoomPage from './components/RoomPage.vue';
import { useGame } from './composables/useGame';
import { getCurrentRoomFromURL, onUrlChange } from './utils/router';

const { state, roomId } = useGame();

const inRoom = computed(() => roomId.value !== null);

// Auto-join room from URL on mount
onMounted(() => {
  const roomIdFromURL = getCurrentRoomFromURL();
  if (roomIdFromURL && !inRoom.value) {
    // Room in URL but not connected - show landing page with room ID pre-filled
    // The LandingPage will handle the actual join
    console.log('Room ID in URL:', roomIdFromURL);
  }
});

// Watch for URL changes (browser back/forward)
let removeUrlListener: (() => void) | undefined;
onMounted(() => {
  removeUrlListener = onUrlChange(() => {
    const roomIdFromURL = getCurrentRoomFromURL();
    if (!roomIdFromURL && inRoom.value) {
      // URL cleared but still in room - user navigated back
      // Could handle cleanup here if needed
    }
  });
});

onUnmounted(() => {
  if (removeUrlListener) {
    removeUrlListener();
  }
});
</script>

<template>
  <div class="app-container">
    <Transition name="fade" mode="out-in">
      <LandingPage v-if="!inRoom" />
      <RoomPage v-else />
    </Transition>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  width: 100%;
}
</style>
