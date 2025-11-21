<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useGame } from '../composables/useGame';
import { getCurrentRoomFromURL, saveUserName, getSavedUserName, getRoomState } from '../utils/router';

const { createRoom, joinRoom, rejoinRoom, error } = useGame();

const name = ref('');
const roomId = ref('');
const mode = ref<'menu' | 'join'>('menu');
const isLoading = ref(false);
const useLocalServer = ref(false);
const customRoomCode = ref('');

// On mount, check for rejoin scenario
onMounted(async () => {
  // Priority 1: Check for existing room state in localStorage (refresh scenario)
  const roomState = getRoomState();
  
  if (roomState) {
    // User was in a room and refreshed - auto-rejoin
    console.log('Detected refresh, attempting to rejoin room:', roomState.roomId);
    name.value = roomState.myName;
    isLoading.value = true;
    
    // Add timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.error('Rejoin timed out');
      isLoading.value = false;
    }, 10000);
    
    try {
      await rejoinRoom(roomState.roomId, roomState.myName, roomState.isHost, useLocalServer.value);
      // Rejoin successful
      clearTimeout(timeoutId);
      // Give a moment for state to update before clearing loading
      setTimeout(() => {
        isLoading.value = false;
      }, 500);
    } catch (e) {
      console.error('Auto-rejoin failed:', e);
      clearTimeout(timeoutId);
      isLoading.value = false;
      // Clear stale room state
      const savedUserName = getSavedUserName();
      if (savedUserName) {
        name.value = savedUserName;
      }
    }
    return;
  }

  // Priority 2: Check for room ID in URL (shared link scenario)
  const roomIdFromURL = getCurrentRoomFromURL();
  const savedName = getSavedUserName();

  if (roomIdFromURL) {
    // Room ID in URL - prepare to join
    roomId.value = roomIdFromURL;
    mode.value = 'join';

    if (savedName) {
      // Auto-join if we have saved name
      name.value = savedName;
      isLoading.value = true;
      try {
        await joinRoom(roomIdFromURL, savedName, useLocalServer.value);
        // Give a moment for state to update
        setTimeout(() => {
          isLoading.value = false;
        }, 500);
      } catch (e) {
        console.error('Auto-join failed:', e);
        isLoading.value = false;
      }
    }
  } else if (savedName) {
    // Priority 3: Just pre-fill saved name
    name.value = savedName;
  }
});

const handleCreate = async () => {
  if (!name.value) return;
  isLoading.value = true;
  try {
    saveUserName(name.value); // Save name for future sessions
    const roomCode = customRoomCode.value.trim().toUpperCase() || undefined;
    await createRoom(name.value, useLocalServer.value, roomCode);
  } catch (e) {
    console.error(e);
    isLoading.value = false;
  }
};

const handleJoin = async () => {
  if (!name.value || !roomId.value) return;
  isLoading.value = true;
  try {
    saveUserName(name.value); // Save name for future sessions
    await joinRoom(roomId.value, name.value, useLocalServer.value);
  } catch (e) {
    console.error(e);
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="landing-page">
    <div class="glass-panel card">
      <h1 class="title">Poker Planning</h1>
      
      <div class="input-group">
        <label>Your Name</label>
        <input 
          v-model="name" 
          type="text" 
          placeholder="Enter your name"
          maxlength="15"
        />
      </div>

      <div v-if="mode === 'menu'">
        <div class="input-group">
          <label>Custom Room Code (optional)</label>
          <input 
            v-model="customRoomCode" 
            type="text" 
            placeholder="e.g., MYROOM (6 chars)" 
            maxlength="6"
            @input="customRoomCode = customRoomCode.toUpperCase()"
          />
        </div>
        <div class="actions">
          <button 
            class="btn btn-primary" 
            :disabled="!name || isLoading"
            @click="handleCreate"
          >
            {{ isLoading ? 'Creating...' : 'Create New Room' }}
          </button>
          
          <button 
            class="btn btn-secondary" 
            :disabled="!name"
            @click="mode = 'join'"
          >
            Join Existing Room
          </button>
        </div>
      </div>

      <div v-else class="join-form">
        <div class="input-group">
          <label>Room ID</label>
          <input 
            v-model="roomId" 
            type="text" 
            placeholder="Paste Room ID"
            @input="roomId = roomId.toUpperCase()"
          />
        </div>
        
        <div class="actions">
          <button 
            class="btn btn-primary" 
            :disabled="!name || !roomId || isLoading"
            @click="handleJoin"
          >
            {{ isLoading ? 'Joining...' : 'Join Room' }}
          </button>
          
          <button 
            class="btn btn-text" 
            @click="mode = 'menu'"
          >
            Back
          </button>
        </div>
      </div>

      <div class="dev-options">
        <label class="checkbox-label">
          <input type="checkbox" v-model="useLocalServer">
          <span>Use Local Server (Dev)</span>
        </label>
        <p class="help-text">
          ⚙️ For development or if the public server is blocked (VPN/firewall).<br>
          Requires running: <code>npm run dev:server</code>
        </p>
      </div>

      <div v-if="error" class="error-alert">
        <div class="error-content">{{ error }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.error-alert {
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-md);
  max-width: 100%;
}

.error-content {
  color: #fca5a5;
  font-size: 0.875rem;
  line-height: 1.6;
  white-space: pre-line;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.dev-options {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.help-text {
  font-size: 0.75rem;
  color: var(--text-muted);
  opacity: 0.8;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-muted);
  cursor: pointer;
}

.checkbox-label input {
  width: auto;
}

.landing-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 1rem;
}

.card {
  width: 100%;
  max-width: 400px;
  padding: 2.5rem;
  text-align: center;
}

.title {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 2rem;
  background: linear-gradient(to right, var(--primary-color), var(--accent-color));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.input-group {
  margin-bottom: 1.5rem;
  text-align: left;
}

.input-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-muted);
}

input {
  width: 100%;
  padding: 0.75rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.2);
  color: var(--text-color);
  font-size: 1rem;
  transition: border-color 0.2s;
}

input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-color);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
}

.btn-text {
  color: var(--text-muted);
  font-size: 0.875rem;
}

.btn-text:hover {
  color: var(--text-color);
}
</style>
