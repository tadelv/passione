/**
 * Pure reducer for /ws/v1/scale/snapshot frames.
 *
 * Decaid keeps the scale channel open across scale connect/disconnect
 * cycles and emits its own `connected` / `disconnected` status frames.
 * This turns one frame plus the previous state into the next state.
 *
 * Kept free of Vue/WebSocket imports so it is trivially unit-testable.
 */

export function reduceScaleFrame(state, data) {
  if (typeof data?.status === 'string') {
    if (data.status === 'connected') {
      return { ...state, isConnected: true }
    }
    // Any non-"connected" status clears connection state and stale readings.
    return { ...state, isConnected: false, weight: 0, flowRate: 0, batteryLevel: null }
  }

  if (typeof data?.weight !== 'number') return state

  return {
    ...state,
    isConnected: true,
    timestamp: data.timestamp ?? state.timestamp,
    weight: data.weight,
    flowRate: Math.max(0, data.weightFlow ?? 0),
    batteryLevel: data.battery ?? null,
  }
}
