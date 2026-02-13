/**
 * Composable for AI-powered shot analysis and dialing recommendations.
 *
 * Supports multi-turn conversations with various AI providers:
 * OpenAI, Anthropic, Gemini, OpenRouter, Ollama.
 *
 * Usage:
 *   const { analyze, messages, loading, error, sendFollowUp, clearConversation } = useAIAnalysis()
 */

import { ref, inject } from 'vue'

const SHOT_ANALYSIS_SYSTEM_PROMPT =
  'You are an expert espresso extraction analyst. Analyze the following shot data and provide specific, actionable feedback on extraction quality, dial-in suggestions, and any issues you notice.'

const DIALING_SYSTEM_PROMPT =
  'You are an expert espresso barista and dialing assistant. Based on the recent shot history below, provide specific recommendations for the next shot. Focus on: grind size adjustments, dose changes, yield targets, temperature adjustments, and profile modifications.'

/**
 * Format a single shot's data into a concise text summary for the AI prompt.
 */
function formatShotData(shot) {
  const profileName = shot.profileName ?? shot.profile?.title ?? 'Unknown'
  const doseIn = shot.dose ?? shot.doseIn ?? null
  const doseOut = shot.output ?? shot.doseOut ?? shot.yield ?? null
  const ratioVal = doseIn && doseOut && doseIn > 0 ? (doseOut / doseIn).toFixed(1) : null
  const dur = shot.duration ?? null
  const durationStr = dur != null ? `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')}` : 'N/A'

  // Extract key data points from shot measurements
  let avgPressure = null
  let avgFlow = null
  let avgTemp = null
  let peakPressure = null
  let peakFlow = null

  const data = shot.data ?? shot.measurements ?? null
  if (data) {
    // Handle various shot data formats
    let pressures = []
    let flows = []
    let temps = []

    if (Array.isArray(data)) {
      // Flat array of measurement objects
      for (const d of data) {
        if (d.pressure != null) pressures.push(d.pressure)
        if (d.flow != null) flows.push(d.flow)
        if (d.mixTemperature != null) temps.push(d.mixTemperature)
        if (d.temperature != null) temps.push(d.temperature)
      }
    } else if (data.machine) {
      // Nested format with machine/scale sub-objects
      const m = data.machine
      if (Array.isArray(m)) {
        for (const d of m) {
          if (d.pressure != null) pressures.push(d.pressure)
          if (d.flow != null) flows.push(d.flow)
          if (d.mixTemperature != null) temps.push(d.mixTemperature)
        }
      }
    }

    if (pressures.length) {
      avgPressure = (pressures.reduce((a, b) => a + b, 0) / pressures.length).toFixed(1)
      peakPressure = Math.max(...pressures).toFixed(1)
    }
    if (flows.length) {
      avgFlow = (flows.reduce((a, b) => a + b, 0) / flows.length).toFixed(1)
      peakFlow = Math.max(...flows).toFixed(1)
    }
    if (temps.length) {
      avgTemp = (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)
    }
  }

  const lines = [
    `Profile: ${profileName}`,
    `Dose: ${doseIn != null ? doseIn + 'g' : 'N/A'} in / ${doseOut != null ? doseOut + 'g' : 'N/A'} out`,
    `Ratio: ${ratioVal ? '1:' + ratioVal : 'N/A'}`,
    `Duration: ${durationStr}`,
  ]

  if (avgPressure) lines.push(`Avg pressure: ${avgPressure} bar, Peak: ${peakPressure} bar`)
  if (avgFlow) lines.push(`Avg flow: ${avgFlow} mL/s, Peak: ${peakFlow} mL/s`)
  if (avgTemp) lines.push(`Avg temperature: ${avgTemp} C`)

  if (shot.beanBrand || shot.beanType) {
    lines.push(`Bean: ${[shot.beanBrand, shot.beanType].filter(Boolean).join(' ')}`)
  }
  if (shot.grinderModel || shot.grinder) {
    const grinder = shot.grinderModel || shot.grinder
    lines.push(`Grinder: ${grinder}${shot.grinderSetting ? ' @ ' + shot.grinderSetting : ''}`)
  }
  if (shot.enjoyment || shot.rating) {
    lines.push(`Rating: ${shot.enjoyment ?? shot.rating}%`)
  }
  if (shot.notes) {
    lines.push(`Notes: ${shot.notes}`)
  }

  return lines.join('\n')
}

/**
 * Format multiple shots for the dialing assistant prompt.
 */
function formatRecentShots(shots) {
  if (!shots || !shots.length) return 'No recent shots available.'
  return shots.map((shot, i) => {
    const ts = shot.timestamp ?? shot.date
    const dateStr = ts ? new Date(ts).toLocaleString() : 'Unknown date'
    return `--- Shot ${i + 1} (${dateStr}) ---\n${formatShotData(shot)}`
  }).join('\n\n')
}

/**
 * Build the request for a specific AI provider.
 */
function buildRequest(provider, apiKey, model, baseUrl, messages) {
  switch (provider) {
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages,
          max_tokens: 2048,
        }),
      }

    case 'anthropic': {
      // Anthropic requires system prompt separate from messages
      const systemMsg = messages.find(m => m.role === 'system')
      const chatMsgs = messages.filter(m => m.role !== 'system')
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: systemMsg?.content ?? '',
          messages: chatMsgs,
        }),
      }
    }

    case 'gemini': {
      // Convert messages to Gemini format
      const contents = []
      for (const msg of messages) {
        if (msg.role === 'system') {
          // Gemini treats system as a user message at the start
          contents.push({ role: 'user', parts: [{ text: msg.content }] })
          contents.push({ role: 'model', parts: [{ text: 'Understood. I will analyze the espresso data.' }] })
        } else {
          contents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
          })
        }
      }
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: 2048 },
        }),
      }
    }

    case 'openrouter':
      return {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'anthropic/claude-sonnet-4',
          messages,
          max_tokens: 2048,
        }),
      }

    case 'ollama':
      return {
        url: `${baseUrl || 'http://localhost:11434'}/api/chat`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'llama3.2',
          messages,
          stream: false,
        }),
      }

    default:
      return null
  }
}

/**
 * Extract the assistant response text from the provider-specific response shape.
 */
function extractResponse(provider, data) {
  switch (provider) {
    case 'openai':
    case 'openrouter':
      return data.choices?.[0]?.message?.content ?? ''

    case 'anthropic':
      return data.content?.[0]?.text ?? ''

    case 'gemini':
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    case 'ollama':
      return data.message?.content ?? ''

    default:
      return ''
  }
}

/**
 * Create an AI analysis composable instance.
 *
 * @param {object} options
 * @param {string} [options.systemPrompt] - Override the default system prompt
 */
export function useAIAnalysis(options = {}) {
  const settingsInstance = inject('settings', null)
  const settings = settingsInstance?.settings

  const messages = ref([])
  const loading = ref(false)
  const error = ref(null)

  const systemPrompt = options.systemPrompt ?? SHOT_ANALYSIS_SYSTEM_PROMPT

  function getConfig() {
    if (!settings) {
      return { provider: null, apiKey: '', model: '', baseUrl: '' }
    }
    return {
      provider: settings.aiProvider || 'anthropic',
      apiKey: settings.aiApiKey || '',
      model: settings.aiModel || '',
      baseUrl: settings.aiBaseUrl || '',
    }
  }

  function validateConfig(config) {
    if (!config.provider) return 'No AI provider configured. Go to Settings > AI to set up.'
    if (config.provider === 'ollama') {
      if (!config.baseUrl) return 'Ollama base URL not configured. Go to Settings > AI.'
    } else {
      if (!config.apiKey) return 'API key not configured. Go to Settings > AI to add your key.'
    }
    return null
  }

  /**
   * Send the current messages array to the configured AI provider.
   */
  async function sendMessages() {
    const config = getConfig()
    const configError = validateConfig(config)
    if (configError) {
      error.value = configError
      return
    }

    loading.value = true
    error.value = null

    try {
      const req = buildRequest(
        config.provider,
        config.apiKey,
        config.model,
        config.baseUrl,
        messages.value
      )

      if (!req) {
        error.value = `Unsupported provider: ${config.provider}`
        loading.value = false
        return
      }

      const resp = await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: req.body,
      })

      if (!resp.ok) {
        const data = await resp.json().catch(() => null)
        const msg = data?.error?.message || data?.error || `HTTP ${resp.status}`
        error.value = `AI request failed: ${msg}`
        loading.value = false
        return
      }

      const data = await resp.json()
      const text = extractResponse(config.provider, data)

      if (!text) {
        error.value = 'AI returned an empty response.'
        loading.value = false
        return
      }

      messages.value = [...messages.value, { role: 'assistant', content: text }]
    } catch (e) {
      error.value = `Connection error: ${e.message}`
    }

    loading.value = false
  }

  /**
   * Analyze a single shot's data. Starts a new conversation.
   */
  async function analyze(shotData) {
    const formatted = formatShotData(shotData)
    messages.value = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Here is the shot data:\n\n${formatted}\n\nPlease analyze this shot.` },
    ]
    await sendMessages()
  }

  /**
   * Analyze multiple recent shots for dialing recommendations. Starts a new conversation.
   */
  async function analyzeMultiple(shots) {
    const formatted = formatRecentShots(shots)
    messages.value = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Here are my recent shots:\n\n${formatted}\n\nPlease provide dialing recommendations for my next shot.` },
    ]
    await sendMessages()
  }

  /**
   * Send a follow-up message in the current conversation.
   */
  async function sendFollowUp(text) {
    if (!text.trim()) return
    messages.value = [...messages.value, { role: 'user', content: text }]
    await sendMessages()
  }

  /**
   * Clear the conversation state.
   */
  function clearConversation() {
    messages.value = []
    error.value = null
    loading.value = false
  }

  return {
    analyze,
    analyzeMultiple,
    messages,
    loading,
    error,
    sendFollowUp,
    clearConversation,
  }
}

// Export prompt constants for external use
export { SHOT_ANALYSIS_SYSTEM_PROMPT, DIALING_SYSTEM_PROMPT }
