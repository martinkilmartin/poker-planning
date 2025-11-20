<script setup lang="ts">
import { computed } from 'vue';
import { useGame } from './composables/useGame';
import LandingPage from './components/LandingPage.vue';
import RoomPage from './components/RoomPage.vue';

const { myPeerId, state } = useGame();

const isConnected = computed(() => !!myPeerId.value && state.players.length > 0);
</script>

<template>
  <div class="app-container">
    <Transition name="fade" mode="out-in">
      <LandingPage v-if="!isConnected" />
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
