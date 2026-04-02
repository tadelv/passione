# Screensaver Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new screensaver modes (Last Shot Recap, Ambient Glow) alongside the existing flip clock.

**Architecture:** All three modes live in ScreensaverPage.vue, selected by `screensaverType` setting. Last Shot fetches data via the existing REST client. Ambient Glow is pure CSS animations. ScreensaverTab gets updated type options with descriptions.

**Tech Stack:** Vue 3, CSS keyframes, uPlot (via HistoryShotGraph component), REST API

---

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/pages/ScreensaverPage.vue` | Modify | Add lastShot and ambientGlow template sections, styles, data fetching |
| `src/components/settings/ScreensaverTab.vue` | Modify | Add new type options with descriptions |
| `src/composables/useSettings.js` | Modify | Update screensaverType comment |

---

### Task 1: Update ScreensaverTab with new type options and descriptions

**Files:**
- Modify: `src/components/settings/ScreensaverTab.vue`
- Modify: `src/composables/useSettings.js`

- [ ] **Step 1: Update the TYPES array in ScreensaverTab.vue**

In `src/components/settings/ScreensaverTab.vue`, replace the TYPES array (lines 7-10):

```javascript
const TYPES = [
  { value: 'disabled', label: 'Disabled', desc: 'Screen goes black' },
  { value: 'flipClock', label: 'Flip Clock', desc: 'Classic flip clock display' },
  { value: 'lastShot', label: 'Last Shot', desc: 'Stats and graph from your last espresso' },
  { value: 'ambientGlow', label: 'Ambient Glow', desc: 'Slow-drifting colors' },
]
```

- [ ] **Step 2: Update the type selector template to show descriptions**

Replace the segment group in the template (lines 22-32) with a vertical list of options, each showing label and description:

```html
        <div class="ss-tab__field">
          <label class="ss-tab__label">Type</label>
          <div class="ss-tab__type-list">
            <button
              v-for="t in TYPES"
              :key="t.value"
              class="ss-tab__type-option"
              :class="{ 'ss-tab__type-option--active': settings.screensaverType === t.value }"
              @click="settings.screensaverType = t.value"
            >
              <span class="ss-tab__type-name">{{ t.label }}</span>
              <span class="ss-tab__type-desc">{{ t.desc }}</span>
            </button>
          </div>
        </div>
```

- [ ] **Step 3: Add CSS for the type list**

Add these styles to the `<style scoped>` section, replacing the `.ss-tab__seg-group` and `.ss-tab__seg` rules:

```css
.ss-tab__type-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ss-tab__type-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.ss-tab__type-option--active {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.ss-tab__type-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.ss-tab__type-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.ss-tab__type-option--active .ss-tab__type-desc {
  color: var(--color-text);
  opacity: 0.8;
}
```

Remove the old `.ss-tab__seg-group` and `.ss-tab__seg` / `.ss-tab__seg--active` CSS rules since they're no longer used.

- [ ] **Step 4: Update useSettings.js comment**

In `src/composables/useSettings.js`, find the `screensaverType` line in defaults and update the comment:

```javascript
  screensaverType: 'flipClock',    // 'disabled', 'flipClock', 'lastShot', 'ambientGlow'
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/ScreensaverTab.vue src/composables/useSettings.js
git commit -m "feat: add Last Shot and Ambient Glow screensaver type options

Update screensaver settings with four type options, each showing
a label and description. Flip clock sub-settings still only show
when flip clock is selected."
```

---

### Task 2: Add Ambient Glow screensaver mode to ScreensaverPage

**Files:**
- Modify: `src/pages/ScreensaverPage.vue`

- [ ] **Step 1: Add the Ambient Glow template section**

In `src/pages/ScreensaverPage.vue`, find the comment `<!-- Black Screen Mode -->` (line 97-98). Replace:

```html
    <!-- Black Screen Mode (disabled type or fallback) -->
    <div v-else class="screensaver__black" />
```

with:

```html
    <!-- Ambient Glow Mode -->
    <div v-else-if="ssType === 'ambientGlow'" class="screensaver__glow">
      <div class="screensaver__blob screensaver__blob--green" />
      <div class="screensaver__blob screensaver__blob--blue" />
      <div class="screensaver__blob screensaver__blob--red" />
      <div class="screensaver__blob screensaver__blob--brown" />
      <div class="screensaver__blob screensaver__blob--green2" />
      <div class="screensaver__particle screensaver__particle--1" />
      <div class="screensaver__particle screensaver__particle--2" />
      <div class="screensaver__particle screensaver__particle--3" />
      <div class="screensaver__particle screensaver__particle--4" />
      <div class="screensaver__particle screensaver__particle--5" />
      <div class="screensaver__particle screensaver__particle--6" />
      <span class="screensaver__glow-clock">{{ hours }}:{{ minutes }}</span>
    </div>

    <!-- Black Screen Mode (disabled type or fallback) -->
    <div v-else class="screensaver__black" />
```

- [ ] **Step 2: Add the Ambient Glow CSS**

Add these styles to the `<style scoped>` section, before the `/* Black screen mode */` comment:

```css
/* Ambient Glow */
.screensaver__glow {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.screensaver__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(50px);
  will-change: transform;
}

.screensaver__blob--green {
  width: 220px;
  height: 220px;
  background: radial-gradient(circle, rgba(24, 195, 126, 0.15), transparent 70%);
  top: 15%;
  left: 10%;
  animation: drift1 45s ease-in-out infinite;
}

.screensaver__blob--blue {
  width: 260px;
  height: 260px;
  background: radial-gradient(circle, rgba(78, 133, 244, 0.12), transparent 70%);
  top: 40%;
  left: 55%;
  animation: drift2 55s ease-in-out infinite;
}

.screensaver__blob--red {
  width: 200px;
  height: 200px;
  background: radial-gradient(circle, rgba(233, 69, 96, 0.13), transparent 70%);
  top: 60%;
  left: 25%;
  animation: drift3 50s ease-in-out infinite;
}

.screensaver__blob--brown {
  width: 180px;
  height: 180px;
  background: radial-gradient(circle, rgba(162, 105, 61, 0.14), transparent 70%);
  top: 20%;
  left: 65%;
  animation: drift4 40s ease-in-out infinite;
}

.screensaver__blob--green2 {
  width: 190px;
  height: 190px;
  background: radial-gradient(circle, rgba(24, 195, 126, 0.1), transparent 70%);
  top: 70%;
  left: 70%;
  animation: drift1 60s ease-in-out infinite reverse;
}

@keyframes drift1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(60px, -40px) scale(1.1); }
  50% { transform: translate(-30px, 50px) scale(0.95); }
  75% { transform: translate(40px, 20px) scale(1.05); }
}

@keyframes drift2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(-50px, 30px) scale(1.08); }
  50% { transform: translate(40px, -60px) scale(0.92); }
  75% { transform: translate(-20px, -30px) scale(1.04); }
}

@keyframes drift3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(70px, -20px) scale(1.12); }
  66% { transform: translate(-40px, 40px) scale(0.9); }
}

@keyframes drift4 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(-60px, 50px) scale(1.06); }
  66% { transform: translate(30px, -40px) scale(0.96); }
}

/* Particles */
.screensaver__particle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  will-change: transform;
}

.screensaver__particle--1 {
  width: 3px; height: 3px; top: 25%; left: 35%;
  animation: float1 30s linear infinite;
}
.screensaver__particle--2 {
  width: 2px; height: 2px; top: 55%; left: 70%;
  opacity: 0.3;
  animation: float2 25s linear infinite;
}
.screensaver__particle--3 {
  width: 4px; height: 4px; top: 40%; left: 15%;
  opacity: 0.15;
  animation: float1 35s linear infinite reverse;
}
.screensaver__particle--4 {
  width: 2px; height: 2px; top: 70%; left: 50%;
  opacity: 0.25;
  animation: float2 28s linear infinite reverse;
}
.screensaver__particle--5 {
  width: 3px; height: 3px; top: 15%; left: 80%;
  opacity: 0.2;
  animation: float1 32s linear infinite;
}
.screensaver__particle--6 {
  width: 2px; height: 2px; top: 80%; left: 30%;
  opacity: 0.18;
  animation: float2 22s linear infinite;
}

@keyframes float1 {
  0% { transform: translate(0, 0); }
  25% { transform: translate(40px, -60px); }
  50% { transform: translate(-20px, -30px); }
  75% { transform: translate(30px, 40px); }
  100% { transform: translate(0, 0); }
}

@keyframes float2 {
  0% { transform: translate(0, 0); }
  25% { transform: translate(-30px, 50px); }
  50% { transform: translate(50px, 20px); }
  75% { transform: translate(-40px, -30px); }
  100% { transform: translate(0, 0); }
}

.screensaver__glow-clock {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 14px;
  color: rgba(255, 255, 255, 0.1);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ScreensaverPage.vue
git commit -m "feat: add Ambient Glow screensaver mode

CSS-only ambient screensaver with slow-drifting color blobs using
the chart palette (pressure green, flow blue, accent red, weight
brown). Six floating particles and a subtle clock at the bottom."
```

---

### Task 3: Add Last Shot Recap screensaver mode

**Files:**
- Modify: `src/pages/ScreensaverPage.vue`

- [ ] **Step 1: Add imports and data fetching**

In `src/pages/ScreensaverPage.vue`, update the script section. Add these imports at the top (after the existing ones):

```javascript
import HistoryShotGraph from '../components/HistoryShotGraph.vue'
import { getLatestShot, getShot } from '../api/rest.js'
import { normalizeShot } from '../composables/useShotNormalize'
```

Add a `lastShotData` ref and fetch function after the existing clock logic:

```javascript
// Last Shot data
const lastShotData = ref(null)
const lastShotInfo = computed(() => {
  const raw = lastShotData.value
  if (!raw) return null
  const s = normalizeShot(raw)
  const w = s.workflow ?? {}

  const profile = w.profile?.title ?? w.name ?? null
  const coffee = [s.coffeeRoaster, s.coffeeName].filter(Boolean).join(' — ') || null
  const doseIn = s.doseIn ? Number(s.doseIn).toFixed(1) : null
  const doseOut = s.doseOut ? Number(s.doseOut).toFixed(1) : null
  const ratio = (s.doseIn && s.doseOut) ? (s.doseOut / s.doseIn).toFixed(1) : null
  const duration = s.duration ? Number(s.duration).toFixed(1) : null

  return { profile, coffee, doseIn, doseOut, ratio, duration }
})

async function fetchLastShot() {
  try {
    const summary = await getLatestShot()
    if (summary?.id) {
      lastShotData.value = await getShot(summary.id)
    }
  } catch {
    lastShotData.value = null
  }
}
```

Update the `onMounted` to also fetch the last shot when in lastShot mode:

```javascript
onMounted(() => {
  updateClock()
  clockTimer = setInterval(updateClock, 1000)
  display?.dim()
  if (ssType.value === 'lastShot') {
    fetchLastShot()
  }
})
```

- [ ] **Step 2: Add the Last Shot template section**

Insert this between the Flip Clock and Ambient Glow template sections (after the flip clock closing `</div>` at the end of the v-if block, before the ambient glow v-else-if):

```html
    <!-- Last Shot Recap Mode -->
    <div v-else-if="ssType === 'lastShot'" class="screensaver__last-shot">
      <template v-if="lastShotInfo">
        <div class="screensaver__shot-graph">
          <HistoryShotGraph :shot="lastShotData" />
        </div>
        <div class="screensaver__shot-stats">
          <span v-if="lastShotInfo.duration" class="screensaver__shot-time">{{ lastShotInfo.duration }}s</span>
          <span v-if="lastShotInfo.doseIn && lastShotInfo.doseOut" class="screensaver__shot-dose">
            {{ lastShotInfo.doseIn }}g &rarr; {{ lastShotInfo.doseOut }}g
          </span>
          <span v-if="lastShotInfo.ratio" class="screensaver__shot-ratio">1:{{ lastShotInfo.ratio }}</span>
        </div>
        <div v-if="lastShotInfo.profile" class="screensaver__shot-profile">{{ lastShotInfo.profile }}</div>
        <div v-if="lastShotInfo.coffee" class="screensaver__shot-coffee">{{ lastShotInfo.coffee }}</div>
      </template>
      <div v-else class="screensaver__shot-empty">No shots yet</div>
      <span class="screensaver__shot-clock">{{ hours }}:{{ minutes }}</span>
    </div>
```

- [ ] **Step 3: Add the Last Shot CSS**

Add these styles before the `/* Ambient Glow */` comment:

```css
/* Last Shot Recap */
.screensaver__last-shot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  opacity: 0;
  animation: fadeIn 2s ease forwards;
}

@keyframes fadeIn {
  to { opacity: 1; }
}

.screensaver__shot-graph {
  width: min(80vw, 500px);
  height: 160px;
  opacity: 0.6;
}

.screensaver__shot-stats {
  display: flex;
  align-items: baseline;
  gap: 20px;
}

.screensaver__shot-time {
  font-size: 36px;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.9);
}

.screensaver__shot-dose {
  font-size: 18px;
  color: #a2693d;
  opacity: 0.7;
}

.screensaver__shot-ratio {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.3);
}

.screensaver__shot-profile {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.25);
  letter-spacing: 1px;
}

.screensaver__shot-coffee {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.15);
  letter-spacing: 0.5px;
}

.screensaver__shot-empty {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.2);
}

.screensaver__shot-clock {
  position: absolute;
  top: 16px;
  right: 20px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.15);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ScreensaverPage.vue
git commit -m "feat: add Last Shot Recap screensaver mode

Shows mini shot graph, key stats (duration, dose, yield, ratio),
profile name, and coffee info from the most recent espresso.
Fades in gently over 2 seconds. Subtle clock in top-right corner."
```
