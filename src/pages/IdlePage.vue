<script setup>
import { ref, computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import ActionButton from '../components/ActionButton.vue'
import CircularGauge from '../components/CircularGauge.vue'
import ConnectionIndicator from '../components/ConnectionIndicator.vue'
import { setMachineState } from '../api/rest.js'

const router = useRouter()

// Injected from App.vue (populated by real composables)
const machineState = inject('machineState', ref('idle'))
const machineConnected = inject('machineConnected', ref(false))
const scaleConnected = inject('scaleConnected', ref(false))
const temperature = inject('temperature', ref(0))
const targetTemperature = inject('targetTemperature', ref(0))
const pressure = inject('pressure', ref(0))
const waterLevel = inject('waterLevel', ref(0))
const profileName = inject('profileName', ref(''))

const isReady = computed(() =>
  machineState.value === 'idle' || machineState.value === 'ready'
)

async function startEspresso() {
  await setMachineState('espresso').catch(() => {})
  router.push('/espresso')
}

async function startSteam() {
  await setMachineState('steam').catch(() => {})
  router.push('/steam')
}

async function startHotWater() {
  await setMachineState('hotWater').catch(() => {})
  router.push('/hotwater')
}

async function startFlush() {
  await setMachineState('flush').catch(() => {})
  router.push('/flush')
}
</script>

<template>
  <div class="idle-page">
    <!-- Top info section -->
    <div class="idle-page__top">
      <div class="idle-page__top-left">
        <CircularGauge
          :value="temperature"
          :min="0"
          :max="110"
          unit="&deg;C"
          label="Group"
          color="var(--color-temperature)"
          :size="120"
        />
      </div>
      <div class="idle-page__top-right">
        <div class="idle-page__connection">
          <ConnectionIndicator :connected="machineConnected" :size="12" />
          <span class="idle-page__connection-label">
            {{ machineConnected ? 'Online' : 'Offline' }}
          </span>
        </div>
        <div v-if="scaleConnected" class="idle-page__scale-status">
          <ConnectionIndicator :connected="scaleConnected" :size="8" />
          <span class="idle-page__scale-label">Scale</span>
        </div>
        <div class="idle-page__water">
          <div class="idle-page__water-bar">
            <div
              class="idle-page__water-fill"
              :style="{ height: waterLevel + '%' }"
            />
          </div>
          <span class="idle-page__water-label">{{ waterLevel }}%</span>
        </div>
      </div>
    </div>

    <!-- Center action buttons -->
    <div class="idle-page__center">
      <div v-if="profileName" class="idle-page__profile">
        {{ profileName }}
      </div>

      <div class="idle-page__actions">
        <ActionButton
          icon="&#9749;"
          label="Espresso"
          :disabled="!isReady"
          @click="startEspresso"
        />
        <ActionButton
          icon="&#9752;"
          label="Steam"
          color="var(--color-accent)"
          :disabled="!isReady"
          @click="startSteam"
        />
        <ActionButton
          icon="&#128167;"
          label="Hot Water"
          color="var(--color-flow)"
          :disabled="!isReady"
          @click="startHotWater"
        />
        <ActionButton
          icon="&#127754;"
          label="Flush"
          color="var(--color-success)"
          :disabled="!isReady"
          @click="startFlush"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.idle-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--margin-standard);
}

.idle-page__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.idle-page__top-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-large);
}

.idle-page__top-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-medium);
}

.idle-page__connection {
  display: flex;
  align-items: center;
  gap: 6px;
}

.idle-page__connection-label {
  font-size: var(--font-value);
  font-weight: bold;
}

.idle-page__scale-status {
  display: flex;
  align-items: center;
  gap: 4px;
}

.idle-page__scale-label {
  font-size: var(--font-label);
  color: var(--color-text-secondary);
}

.idle-page__water {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.idle-page__water-bar {
  width: 24px;
  height: 48px;
  border-radius: 4px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.idle-page__water-fill {
  width: 100%;
  background: var(--color-flow);
  border-radius: 0 0 3px 3px;
  transition: height 0.3s ease;
}

.idle-page__water-label {
  font-size: var(--font-caption);
  color: var(--color-text-secondary);
}

.idle-page__center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-large);
}

.idle-page__profile {
  font-size: var(--font-title);
  font-weight: bold;
  color: var(--color-text);
  text-align: center;
  max-width: 80%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.idle-page__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-medium);
}
</style>
