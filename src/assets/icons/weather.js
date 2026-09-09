/**
 * Weather condition SVGs for the `weather` home widget.
 *
 * Five coarse condition classes; the composable maps WMO codes onto these
 * keys (unknown/null codes use the neutral 'cloudy' mark). Stroke-based
 * line icons using currentColor so they inherit the active text color and
 * theme — no external image loading.
 */

const ATTRS = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"'

export const weatherIcons = {
  clear: `<svg ${ATTRS}><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/></svg>`,

  partlyCloudy: `<svg ${ATTRS}><circle cx="6.5" cy="7.5" r="3"/><path d="M6.5 1.5v1.5M1.2 4.8l1.1 1.1M1.2 10.2l1.1-1.1"/><path d="M17.5 19H9.5a4.5 4.5 0 0 1-.35-8.99A6 6 0 0 1 20.5 10.6 3.5 3.5 0 0 1 17.5 19Z"/></svg>`,

  cloudy: `<svg ${ATTRS}><path d="M17.5 19H9a6.5 6.5 0 0 1-.55-12.98A7.5 7.5 0 0 1 22.5 10.6 3.5 3.5 0 0 1 17.5 19Z"/></svg>`,

  rain: `<svg ${ATTRS}><path d="M17.5 17H9a6.5 6.5 0 0 1-.55-12.98A7.5 7.5 0 0 1 22.5 8.6 3.5 3.5 0 0 1 17.5 17Z"/><path d="M8.5 15.5v3M12.5 15.5v3M16.5 15.5v3"/></svg>`,

  snow: `<svg ${ATTRS}><path d="M17.5 17H9a6.5 6.5 0 0 1-.55-12.98A7.5 7.5 0 0 1 22.5 8.6 3.5 3.5 0 0 1 17.5 17Z"/><path d="M8 17.5h.01M12 18.5h.01M16 17.5h.01M10 20.5h.01M14 20.5h.01"/></svg>`,
}
