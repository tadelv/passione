<script setup>
import { ref, reactive, inject, computed } from 'vue'

const beans = inject('beans', ref([]))
const beansApi = inject('beansApi', null)
const toast = inject('toast', null)

const showArchived = ref(false)
const expandedBeanId = ref(null)
const creatingBean = ref(false)
const batchesByBean = reactive({})

// Bean form defaults
const emptyBean = () => ({ roaster: '', name: '', country: '', processing: '', variety: '', altitudeMin: '', altitudeMax: '' })
const newBean = reactive(emptyBean())

// Batch form state per bean
const addingBatchForBean = ref(null)
const emptyBatch = () => ({ roastDate: '', roastLevel: '', weight: '', price: '', currency: 'EUR' })
const newBatch = reactive(emptyBatch())

// Editing
const editingBeanId = ref(null)
const editBean = reactive(emptyBean())
const editingBatchId = ref(null)
const editBatch = reactive(emptyBatch())

const filteredBeans = computed(() => {
  if (showArchived.value) return beans.value
  return beans.value.filter(b => !b.archived)
})

// ---------- Bean CRUD ----------

function startCreateBean() {
  Object.assign(newBean, emptyBean())
  creatingBean.value = true
}

function cancelCreateBean() {
  creatingBean.value = false
}

async function saveNewBean() {
  if (!newBean.roaster?.trim() || !newBean.name?.trim()) return
  try {
    const payload = {
      roaster: newBean.roaster.trim(),
      name: newBean.name.trim(),
      country: newBean.country.trim() || undefined,
      processing: newBean.processing.trim() || undefined,
      variety: newBean.variety.trim() || undefined,
    }
    const altMin = newBean.altitudeMin ? Number(newBean.altitudeMin) : null
    const altMax = newBean.altitudeMax ? Number(newBean.altitudeMax) : null
    if (altMin != null || altMax != null) {
      payload.altitude = [altMin ?? altMax, altMax ?? altMin]
    }
    await beansApi.create(payload)
    creatingBean.value = false
    toast?.({ message: 'Bean created', type: 'success' })
  } catch (e) {
    toast?.({ message: `Failed to create bean: ${e.message}`, type: 'error' })
  }
}

async function toggleBean(bean) {
  if (expandedBeanId.value === bean.id) {
    expandedBeanId.value = null
    editingBeanId.value = null
    return
  }
  expandedBeanId.value = bean.id
  editingBeanId.value = bean.id
  Object.assign(editBean, {
    roaster: bean.roaster || '',
    name: bean.name || '',
    country: bean.country || '',
    processing: bean.processing || '',
    variety: bean.variety || '',
    altitudeMin: bean.altitude?.[0] ?? '',
    altitudeMax: bean.altitude?.[1] ?? '',
  })
  // Load batches
  if (!batchesByBean[bean.id]) {
    try {
      const batches = await beansApi.getBatches(bean.id)
      batchesByBean[bean.id] = batches
    } catch {
      batchesByBean[bean.id] = []
    }
  }
}

async function saveEditBean(bean) {
  try {
    const payload = {
      roaster: editBean.roaster.trim(),
      name: editBean.name.trim(),
      country: editBean.country.trim() || undefined,
      processing: editBean.processing.trim() || undefined,
      variety: editBean.variety.trim() || undefined,
    }
    const altMin = editBean.altitudeMin ? Number(editBean.altitudeMin) : null
    const altMax = editBean.altitudeMax ? Number(editBean.altitudeMax) : null
    if (altMin != null || altMax != null) {
      payload.altitude = [altMin ?? altMax, altMax ?? altMin]
    }
    await beansApi.update(bean.id, payload)
    toast?.({ message: 'Bean updated', type: 'success' })
  } catch (e) {
    toast?.({ message: `Failed to update bean: ${e.message}`, type: 'error' })
  }
}

async function deleteBean(bean) {
  if (!window.confirm(`Delete "${bean.roaster} ${bean.name}" and all its batches?`)) return
  try {
    await beansApi.remove(bean.id)
    if (expandedBeanId.value === bean.id) expandedBeanId.value = null
    delete batchesByBean[bean.id]
    toast?.({ message: 'Bean deleted', type: 'success' })
  } catch (e) {
    toast?.({ message: `Failed to delete bean: ${e.message}`, type: 'error' })
  }
}

// ---------- Batch CRUD ----------

function daysSinceRoast(roastDate) {
  if (!roastDate) return null
  const diff = Date.now() - new Date(roastDate).getTime()
  return Math.floor(diff / 86400000)
}

function startAddBatch(beanId) {
  Object.assign(newBatch, emptyBatch())
  addingBatchForBean.value = beanId
}

function cancelAddBatch() {
  addingBatchForBean.value = null
}

async function saveNewBatch(beanId) {
  try {
    const payload = {
      roastDate: newBatch.roastDate || undefined,
      roastLevel: newBatch.roastLevel.trim() || undefined,
      weight: newBatch.weight ? Number(newBatch.weight) : undefined,
      price: newBatch.price ? Number(newBatch.price) : undefined,
      currency: newBatch.currency.trim() || 'EUR',
    }
    const created = await beansApi.createBatch(beanId, payload)
    if (!batchesByBean[beanId]) batchesByBean[beanId] = []
    batchesByBean[beanId].push(created)
    addingBatchForBean.value = null
    toast?.({ message: 'Batch added', type: 'success' })
  } catch (e) {
    toast?.({ message: `Failed to create batch: ${e.message}`, type: 'error' })
  }
}

function startEditBatch(batch) {
  editingBatchId.value = batch.id
  Object.assign(editBatch, {
    roastDate: batch.roastDate || '',
    roastLevel: batch.roastLevel || '',
    weight: batch.weight ?? '',
    price: batch.price ?? '',
    currency: batch.currency || 'EUR',
  })
}

function cancelEditBatch() {
  editingBatchId.value = null
}

async function saveEditBatchItem(beanId, batch) {
  try {
    const payload = {
      roastDate: editBatch.roastDate || undefined,
      roastLevel: editBatch.roastLevel.trim() || undefined,
      weight: editBatch.weight ? Number(editBatch.weight) : undefined,
      price: editBatch.price ? Number(editBatch.price) : undefined,
      currency: editBatch.currency.trim() || 'EUR',
    }
    const updated = await beansApi.updateBatch(batch.id, payload)
    const list = batchesByBean[beanId]
    if (list) {
      const idx = list.findIndex(b => b.id === batch.id)
      if (idx !== -1) list[idx] = updated ?? { ...batch, ...payload }
    }
    editingBatchId.value = null
    toast?.({ message: 'Batch updated', type: 'success' })
  } catch (e) {
    toast?.({ message: `Failed to update batch: ${e.message}`, type: 'error' })
  }
}

async function deleteBatch(beanId, batch) {
  if (!window.confirm('Delete this batch?')) return
  try {
    await beansApi.removeBatch(batch.id)
    const list = batchesByBean[beanId]
    if (list) {
      batchesByBean[beanId] = list.filter(b => b.id !== batch.id)
    }
    toast?.({ message: 'Batch deleted', type: 'success' })
  } catch (e) {
    toast?.({ message: `Failed to delete batch: ${e.message}`, type: 'error' })
  }
}
</script>

<template>
  <div class="beans-tab">
    <!-- Header -->
    <div class="beans-tab__header">
      <h3 class="beans-tab__title">Coffee Beans</h3>
      <div class="beans-tab__header-actions">
        <label class="beans-tab__checkbox-label">
          <input type="checkbox" v-model="showArchived" />
          Show archived
        </label>
        <button class="beans-tab__add-btn" @click="startCreateBean">Add Bean</button>
      </div>
    </div>

    <!-- Create bean form -->
    <div v-if="creatingBean" class="beans-tab__form beans-tab__form--create">
      <h4 class="beans-tab__form-title">New Bean</h4>
      <div class="beans-tab__form-grid">
        <div class="beans-tab__field">
          <label class="beans-tab__label">Roaster *</label>
          <input class="beans-tab__input" v-model="newBean.roaster" placeholder="Roaster name" />
        </div>
        <div class="beans-tab__field">
          <label class="beans-tab__label">Name *</label>
          <input class="beans-tab__input" v-model="newBean.name" placeholder="Bean name" />
        </div>
        <div class="beans-tab__field">
          <label class="beans-tab__label">Country</label>
          <input class="beans-tab__input" v-model="newBean.country" placeholder="Origin country" />
        </div>
        <div class="beans-tab__field">
          <label class="beans-tab__label">Processing</label>
          <input class="beans-tab__input" v-model="newBean.processing" placeholder="e.g. Washed, Natural" />
        </div>
        <div class="beans-tab__field beans-tab__field--full">
          <label class="beans-tab__label">Variety</label>
          <input class="beans-tab__input" v-model="newBean.variety" placeholder="Comma-separated varieties" />
        </div>
        <div class="beans-tab__field">
          <label class="beans-tab__label">Altitude min (masl)</label>
          <input class="beans-tab__input" type="number" v-model="newBean.altitudeMin" placeholder="e.g. 1100" />
        </div>
        <div class="beans-tab__field">
          <label class="beans-tab__label">Altitude max (masl)</label>
          <input class="beans-tab__input" type="number" v-model="newBean.altitudeMax" placeholder="e.g. 1300" />
        </div>
      </div>
      <div class="beans-tab__form-actions">
        <button class="beans-tab__btn beans-tab__btn--save" @click="saveNewBean">Save</button>
        <button class="beans-tab__btn beans-tab__btn--cancel" @click="cancelCreateBean">Cancel</button>
      </div>
    </div>

    <!-- Bean list -->
    <div v-if="filteredBeans.length === 0" class="beans-tab__empty">
      No beans found. Add one to get started.
    </div>

    <div v-else class="beans-tab__list">
      <div
        v-for="bean in filteredBeans"
        :key="bean.id"
        class="beans-tab__bean"
        :class="{ 'beans-tab__bean--expanded': expandedBeanId === bean.id }"
      >
        <!-- Bean row -->
        <div class="beans-tab__bean-row" @click="toggleBean(bean)">
          <div class="beans-tab__bean-info">
            <span class="beans-tab__bean-roaster">{{ bean.roaster }}</span>
            <span class="beans-tab__bean-name">{{ bean.name }}</span>
          </div>
          <span class="beans-tab__expand-icon">{{ expandedBeanId === bean.id ? '\u25B2' : '\u25BC' }}</span>
        </div>

        <!-- Expanded content -->
        <div v-if="expandedBeanId === bean.id" class="beans-tab__bean-detail">
          <!-- Edit bean form -->
          <div class="beans-tab__form">
            <div class="beans-tab__form-grid">
              <div class="beans-tab__field">
                <label class="beans-tab__label">Roaster</label>
                <input class="beans-tab__input" v-model="editBean.roaster" />
              </div>
              <div class="beans-tab__field">
                <label class="beans-tab__label">Name</label>
                <input class="beans-tab__input" v-model="editBean.name" />
              </div>
              <div class="beans-tab__field">
                <label class="beans-tab__label">Country</label>
                <input class="beans-tab__input" v-model="editBean.country" />
              </div>
              <div class="beans-tab__field">
                <label class="beans-tab__label">Processing</label>
                <input class="beans-tab__input" v-model="editBean.processing" />
              </div>
              <div class="beans-tab__field beans-tab__field--full">
                <label class="beans-tab__label">Variety</label>
                <input class="beans-tab__input" v-model="editBean.variety" />
              </div>
              <div class="beans-tab__field">
                <label class="beans-tab__label">Altitude min (masl)</label>
                <input class="beans-tab__input" type="number" v-model="editBean.altitudeMin" />
              </div>
              <div class="beans-tab__field">
                <label class="beans-tab__label">Altitude max (masl)</label>
                <input class="beans-tab__input" type="number" v-model="editBean.altitudeMax" />
              </div>
            </div>
            <div class="beans-tab__form-actions">
              <button class="beans-tab__btn beans-tab__btn--save" @click="saveEditBean(bean)">Save</button>
              <button class="beans-tab__btn beans-tab__btn--danger" @click="deleteBean(bean)">Delete Bean</button>
            </div>
          </div>

          <!-- Batches -->
          <div class="beans-tab__batches">
            <div class="beans-tab__batches-header">
              <h4 class="beans-tab__batches-title">Batches</h4>
              <button class="beans-tab__btn beans-tab__btn--small" @click.stop="startAddBatch(bean.id)">Add Batch</button>
            </div>

            <!-- Add batch form -->
            <div v-if="addingBatchForBean === bean.id" class="beans-tab__form beans-tab__form--batch">
              <div class="beans-tab__form-grid">
                <div class="beans-tab__field">
                  <label class="beans-tab__label">Roast Date</label>
                  <input class="beans-tab__input" type="date" v-model="newBatch.roastDate" />
                </div>
                <div class="beans-tab__field">
                  <label class="beans-tab__label">Roast Level</label>
                  <input class="beans-tab__input" v-model="newBatch.roastLevel" placeholder="e.g. Light, Medium" />
                </div>
                <div class="beans-tab__field">
                  <label class="beans-tab__label">Weight (g)</label>
                  <input class="beans-tab__input" type="number" v-model="newBatch.weight" placeholder="250" />
                </div>
                <div class="beans-tab__field">
                  <label class="beans-tab__label">Price</label>
                  <input class="beans-tab__input" type="number" v-model="newBatch.price" step="0.01" placeholder="0.00" />
                </div>
                <div class="beans-tab__field">
                  <label class="beans-tab__label">Currency</label>
                  <input class="beans-tab__input" v-model="newBatch.currency" placeholder="EUR" />
                </div>
              </div>
              <div class="beans-tab__form-actions">
                <button class="beans-tab__btn beans-tab__btn--save" @click="saveNewBatch(bean.id)">Save</button>
                <button class="beans-tab__btn beans-tab__btn--cancel" @click="cancelAddBatch">Cancel</button>
              </div>
            </div>

            <!-- Batch list -->
            <div v-if="!batchesByBean[bean.id]?.length && addingBatchForBean !== bean.id" class="beans-tab__empty beans-tab__empty--small">
              No batches yet.
            </div>
            <div v-for="batch in (batchesByBean[bean.id] || [])" :key="batch.id" class="beans-tab__batch">
              <template v-if="editingBatchId === batch.id">
                <!-- Edit batch inline -->
                <div class="beans-tab__form beans-tab__form--batch-edit">
                  <div class="beans-tab__form-grid">
                    <div class="beans-tab__field">
                      <label class="beans-tab__label">Roast Date</label>
                      <input class="beans-tab__input" type="date" v-model="editBatch.roastDate" />
                    </div>
                    <div class="beans-tab__field">
                      <label class="beans-tab__label">Roast Level</label>
                      <input class="beans-tab__input" v-model="editBatch.roastLevel" />
                    </div>
                    <div class="beans-tab__field">
                      <label class="beans-tab__label">Weight (g)</label>
                      <input class="beans-tab__input" type="number" v-model="editBatch.weight" />
                    </div>
                    <div class="beans-tab__field">
                      <label class="beans-tab__label">Price</label>
                      <input class="beans-tab__input" type="number" v-model="editBatch.price" step="0.01" />
                    </div>
                    <div class="beans-tab__field">
                      <label class="beans-tab__label">Currency</label>
                      <input class="beans-tab__input" v-model="editBatch.currency" />
                    </div>
                  </div>
                  <div class="beans-tab__form-actions">
                    <button class="beans-tab__btn beans-tab__btn--save" @click="saveEditBatchItem(bean.id, batch)">Save</button>
                    <button class="beans-tab__btn beans-tab__btn--cancel" @click="cancelEditBatch">Cancel</button>
                    <button class="beans-tab__btn beans-tab__btn--danger" @click="deleteBatch(bean.id, batch)">Delete</button>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="beans-tab__batch-row" @click="startEditBatch(batch)">
                  <div class="beans-tab__batch-info">
                    <span class="beans-tab__batch-date">{{ batch.roastDate || 'No date' }}</span>
                    <span v-if="daysSinceRoast(batch.roastDate) != null" class="beans-tab__batch-age">
                      {{ daysSinceRoast(batch.roastDate) }}d ago
                    </span>
                    <span v-if="batch.weight" class="beans-tab__batch-weight">{{ batch.weight }}g</span>
                    <span v-if="batch.frozen" class="beans-tab__batch-frozen">Frozen</span>
                  </div>
                  <div class="beans-tab__batch-actions">
                    <button class="beans-tab__btn beans-tab__btn--icon" @click.stop="deleteBatch(bean.id, batch)">&#x2715;</button>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.beans-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.beans-tab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.beans-tab__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
}

.beans-tab__header-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.beans-tab__checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.beans-tab__add-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: var(--color-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.beans-tab__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.beans-tab__bean {
  background: var(--color-surface);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.beans-tab__bean--expanded {
  border-color: var(--color-primary);
}

.beans-tab__bean-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.beans-tab__bean-row:active {
  opacity: 0.7;
}

.beans-tab__bean-info {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.beans-tab__bean-roaster {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.beans-tab__bean-name {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.beans-tab__expand-icon {
  font-size: 10px;
  color: var(--color-text-secondary);
}

.beans-tab__bean-detail {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-top: 1px solid var(--color-border);
}

/* Forms */
.beans-tab__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
}

.beans-tab__form--create {
  background: var(--color-surface);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  padding: 16px;
}

.beans-tab__form--batch {
  padding: 12px;
  background: var(--color-background);
  border-radius: 8px;
}

.beans-tab__form--batch-edit {
  padding: 8px 0;
}

.beans-tab__form-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.beans-tab__form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.beans-tab__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.beans-tab__field--full {
  grid-column: 1 / -1;
}

.beans-tab__label {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.beans-tab__input {
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
}

.beans-tab__form-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* Buttons */
.beans-tab__btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.beans-tab__btn:active {
  opacity: 0.7;
}

.beans-tab__btn--save {
  background: var(--color-primary);
  color: var(--color-text);
  border-color: var(--color-primary);
}

.beans-tab__btn--cancel {
  background: var(--color-surface);
  color: var(--color-text-secondary);
}

.beans-tab__btn--danger {
  background: var(--color-danger);
  color: var(--color-text);
  border-color: var(--color-danger);
}

.beans-tab__btn--small {
  padding: 4px 12px;
  font-size: 12px;
}

.beans-tab__btn--icon {
  padding: 4px 8px;
  font-size: 12px;
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
}

.beans-tab__btn--icon:hover {
  color: var(--color-danger);
}

/* Batches */
.beans-tab__batches {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.beans-tab__batches-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

.beans-tab__batches-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.beans-tab__batch {
  background: var(--color-background);
  border-radius: 8px;
  overflow: hidden;
}

.beans-tab__batch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.beans-tab__batch-row:active {
  opacity: 0.7;
}

.beans-tab__batch-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.beans-tab__batch-date {
  font-size: 14px;
  color: var(--color-text);
  font-weight: 500;
}

.beans-tab__batch-age {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.beans-tab__batch-weight {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.beans-tab__batch-frozen {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary);
  padding: 2px 8px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--color-primary) 15%, transparent);
}

.beans-tab__batch-actions {
  display: flex;
  gap: 4px;
}

.beans-tab__empty {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.beans-tab__empty--small {
  padding: 12px;
  font-size: 13px;
}
</style>
