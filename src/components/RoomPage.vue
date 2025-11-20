<script setup lang="ts">
import { useGame } from '../composables/useGame';
import { computed, ref, watch } from 'vue';

const { state, myPeerId, roomId, isHost, vote, reveal, hide, reset, serverConnectionStatus, currentServerMode, reconnect } = useGame();

const myVote = computed(() => {
  const me = state.players.find(p => p.id === myPeerId.value);
  return me?.vote;
});

const averageScore = computed(() => {
  const numericVotes = state.players
    .map(p => p.vote)
    .filter(v => v && !isNaN(Number(v)))
    .map(v => Number(v));
  
  if (numericVotes.length === 0) return 'N/A';
  
  const sum = numericVotes.reduce((a, b) => a + b, 0);
  const avg = sum / numericVotes.length;
  return avg.toFixed(1);
});

const votedCount = computed(() => state.players.filter(p => p.vote).length);
const totalPlayers = computed(() => state.players.length);

const playersWhoHaventVoted = computed(() => 
  state.players.filter(p => !p.vote)
);

const statusMessage = computed(() => {
  if (state.status === 'revealed') {
    return 'Votes Revealed';
  }
  
  if (votedCount.value === 0) {
    return 'Waiting for votes...';
  }
  
  if (votedCount.value === totalPlayers.value) {
    return 'All votes are in!';
  }
  
  return `${votedCount.value} of ${totalPlayers.value} have voted`;
});

const shouldCenterStatus = computed(() => 
  state.status === 'revealed' || votedCount.value === totalPlayers.value
);

const cards = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'];

const copyLink = () => {
    navigator.clipboard.writeText(roomId.value || '');
    alert('Room ID copied!');
};

const endSession = () => {
  if (confirm('Are you sure you want to end this session? All players will be disconnected.')) {
    window.location.reload();
  }
};

// Confetti effect
const showConfetti = ref(false);

watch(() => state.status, (newStatus, oldStatus) => {
  if (oldStatus === 'voting' && newStatus === 'revealed') {
    showConfetti.value = true;
    setTimeout(() => {
      showConfetti.value = false;
    }, 3000);
  }
});
</script>

<template>
  <div class="room-page">
    <header class="header glass-panel">
      <div class="room-info">
        <span class="label">Room ID:</span>
        <code @click="copyLink" class="room-id">{{ roomId }}</code>
        <div class="status-badge" :class="serverConnectionStatus">
            {{ serverConnectionStatus }} ({{ currentServerMode }})
        </div>
        <button 
            v-if="serverConnectionStatus === 'disconnected'" 
            class="btn btn-xs btn-warning"
            @click="reconnect"
        >
            Reconnect
        </button>
      </div>
      <div class="controls" v-if="isHost">
        <div class="primary-controls">
          <button class="btn btn-sm" @click="reveal" v-if="state.status === 'voting'">Reveal</button>
          <button class="btn btn-sm" @click="hide" v-if="state.status === 'revealed'">Hide</button>
          <button class="btn btn-sm btn-danger" @click="endSession">End Session</button>
        </div>
        <div class="secondary-controls">
          <button class="btn btn-sm btn-reset" @click="reset">Reset Votes</button>
        </div>
      </div>
    </header>

    <div class="status-bar glass-panel" :class="{ 'centered': shouldCenterStatus }">
      <div class="status-message" :class="{ 'flash': state.status === 'revealed' }">
        {{ statusMessage }}
      </div>
      <div class="voters-waiting" v-if="playersWhoHaventVoted.length > 0 && state.status === 'voting'">
        <span class="waiting-label">Waiting for:</span>
        <span 
          v-for="player in playersWhoHaventVoted" 
          :key="player.id"
          class="waiting-player"
          :class="{ 'ping': votedCount >= totalPlayers - 1 && votedCount > 0 }"
        >
          {{ player.name }}
        </span>
      </div>
    </div>

    <div class="confetti-container" v-if="showConfetti">
      <div class="confetti" v-for="i in 50" :key="i" :style="{ left: Math.random() * 100 + '%', animationDelay: Math.random() * 0.5 + 's' }">
        {{ ['🍁', '🏖️', '🏨', '✈️', '🌴', '🌊', '☀️', '🏝️'][Math.floor(Math.random() * 8)] }}
      </div>
    </div>

    <div v-if="state.status === 'revealed'" class="stats-bar glass-panel">
      <div class="stat">
        <span class="stat-label">Average:</span>
        <span class="stat-value">{{ averageScore }}</span>
      </div>
    </div>

    <main class="table-area">
      <div class="players-grid">
        <div 
          v-for="player in state.players" 
          :key="player.id"
          class="player-seat"
          :class="{ 'is-me': player.id === myPeerId }"
        >
          <div class="card-slot" :class="{ 'has-voted': player.vote, 'revealed': state.status === 'revealed' }">
            <div class="card-back" v-if="player.vote && state.status === 'voting'"></div>
            <div class="card-front" v-if="state.status === 'revealed' && player.vote">
              {{ player.vote }}
            </div>
            <div class="waiting" v-if="!player.vote">Thinking...</div>
          </div>
          <div class="player-name">{{ player.name }} <span v-if="player.isHost">(Host)</span></div>
        </div>
      </div>
    </main>

    <footer class="hand-area glass-panel">
      <div class="cards-scroll">
        <button 
          v-for="card in cards" 
          :key="card"
          class="poker-card"
          :class="{ 'selected': myVote === card }"
          @click="vote(card)"
        >
          {{ card }}
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.room-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 1rem;
  gap: 1rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-end;
}

.primary-controls,
.secondary-controls {
  display: flex;
  gap: 0.5rem;
}

.status-bar {
  padding: 0.75rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.status-bar.centered {
  justify-content: center;
}

.status-message {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
}

.status-message.flash {
  font-size: 1.5rem;
  animation: flash 0.5s ease-in-out 3;
}

@keyframes flash {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.2);
  }
}

.confetti-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1000;
  overflow: hidden;
}

.confetti {
  position: absolute;
  top: -20px;
  font-size: 2rem;
  animation: fall 7s linear forwards;
}

@keyframes fall {
  to {
    transform: translateY(100vh) rotate(360deg);
    opacity: 0;
  }
}

.voters-waiting {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.waiting-label {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.waiting-player {
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  font-size: 0.85rem;
  color: var(--text-color);
}

.waiting-player.ping {
  animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
  background: rgba(245, 158, 11, 0.3);
  border: 1px solid rgba(245, 158, 11, 0.6);
}

@keyframes ping {
  75%, 100% {
    transform: scale(1.1);
    opacity: 0.7;
  }
}

.stats-bar {
  padding: 1rem;
  display: flex;
  justify-content: center;
  gap: 2rem;
}

.stat {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.stat-label {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.stat-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--primary-color);
}

.room-id {
  background: rgba(0,0,0,0.3);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 0.5rem;
}

.table-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.players-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  justify-content: center;
  max-width: 800px;
}

.player-seat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.card-slot {
  width: 60px;
  height: 90px;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  color: var(--text-muted);
  transition: all 0.3s ease;
}

.card-slot.has-voted {
  border-style: solid;
  border-color: var(--primary-color);
  background: rgba(99, 102, 241, 0.1);
}

.card-back {
  width: 100%;
  height: 100%;
  background: var(--primary-color);
  border-radius: 6px;
}

.card-front {
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--text-color);
}

.hand-area {
  padding: 1rem;
  overflow-x: auto;
}

.cards-scroll {
  display: flex;
  gap: 1rem;
  justify-content: center;
  min-width: max-content;
}

.poker-card {
  width: 50px;
  height: 80px;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--text-color);
  transition: all 0.2s;
}

.poker-card:hover {
  transform: translateY(-10px);
  background: var(--surface-color-hover);
  border-color: var(--primary-color);
}

.poker-card.selected {
  background: var(--primary-color);
  transform: translateY(-15px);
  box-shadow: var(--shadow-lg);
}

.btn-sm {
  padding: 0.5rem 1rem;
  background: var(--surface-color);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin-left: 0.5rem;
}

.btn-sm:hover {
  background: var(--surface-color-hover);
}

.btn-danger {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.4);
}

.btn-danger:hover {
  background: rgba(239, 68, 68, 0.3);
}

.btn-reset {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  border-color: rgba(59, 130, 246, 0.4);
}

.btn-reset:hover {
  background: rgba(59, 130, 246, 0.3);
}

.status-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: bold;
    text-transform: uppercase;
    margin-left: 1rem;
    background: #334155;
    color: #94a3b8;
}

.status-badge.connected {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.4);
}

.status-badge.connecting {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.4);
}

.status-badge.disconnected {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.4);
}

.btn-xs {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    margin-left: 0.5rem;
}

.btn-warning {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.4);
}

.btn-warning:hover {
    background: rgba(245, 158, 11, 0.3);
}
</style>
