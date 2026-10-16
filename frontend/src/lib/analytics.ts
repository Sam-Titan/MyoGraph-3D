/**
 * Cookieless, patient-data-free visitor analytics (PostHog, lazy-loaded).
 *
 * A no-op unless VITE_POSTHOG_KEY is set, this is a production build and the hostname is listed in
 * VITE_POSTHOG_DOMAINS. Only the events below are ever sent, with allow-listed properties: never a
 * field value, probability or free text. Autocapture is off because it records clicked text such as
 * form choices, which is patient data.
 */
import type { CaptureResult, PostHogConfig } from 'posthog-js'

export type AnalyticsEvent =
  | 'preset_loaded'
  | 'target_selected'
  | 'tab_viewed'
  | 'form_edited'
  | 'summary_requested'
  | 'view_toggled'

/** Allowed property keys per event; anything else is dropped before sending. */
const ALLOWED_PROPS: Record<AnalyticsEvent, readonly string[]> = {
  preset_loaded: ['preset', 'source'],
  target_selected: ['target', 'source'],
  tab_viewed: ['tab'],
  form_edited: [],
  summary_requested: [],
  view_toggled: ['control'],
}

const MAX_VALUE_LENGTH = 64
const DEFAULT_HOST = 'https://us.i.posthog.com'

export type AnalyticsData = Record<string, string | number | boolean>

/** Keep only allow-listed, short, primitive properties. */
export function sanitizeProps(
  event: AnalyticsEvent,
  data?: Record<string, unknown>,
): AnalyticsData {
  const allowed = ALLOWED_PROPS[event] ?? []
  const out: AnalyticsData = {}
  for (const [key, value] of Object.entries(data ?? {})) {
    if (!allowed.includes(key)) continue
    if (typeof value === 'string' && value.length <= MAX_VALUE_LENGTH) out[key] = value
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = value
  }
  return out
}

export interface GateInput {
  key: string | undefined
  isProd: boolean
  hostname: string
  /** Comma-separated live hostnames. */
  domains: string | undefined
}

export function analyticsEnabled({ key, isProd, hostname, domains }: GateInput): boolean {
  if (!key || !isProd || !domains) return false
  const allowed = domains
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  return allowed.includes(hostname.toLowerCase())
}

const URL_KEYS = new Set(['$current_url', '$referrer', '$pathname'])
const URL_KEY_PREFIX = /^\$(initial|prev)_/

/** Drop `?query` and `#hash` from URLs and paths (Phase 18 share links put values in the hash). */
export function stripUrl(value: string): string {
  const cut = value.search(/[?#]/)
  return cut === -1 ? value : value.slice(0, cut)
}

function looksLikeUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('/')
}

function scrubProps(props: Record<string, unknown> | undefined): void {
  if (!props) return
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== 'string') continue
    if (URL_KEYS.has(key) || (URL_KEY_PREFIX.test(key) && looksLikeUrl(value))) {
      props[key] = stripUrl(value)
    }
  }
}

/** PostHog `before_send`: strip query and hash from every URL-like property. */
export function scrubEvent(event: CaptureResult): CaptureResult {
  scrubProps(event.properties)
  scrubProps(event.$set)
  scrubProps(event.$set_once)
  return event
}

/** The privacy-safe init config. Exported so a test can pin every flag. */
export function buildConfig(host: string | undefined): Partial<PostHogConfig> {
  return {
    api_host: host || DEFAULT_HOST,
    cookieless_mode: 'always',
    person_profiles: 'never',
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    disable_surveys: true,
    respect_dnt: true,
    before_send: scrubEvent,
  }
}

interface Client {
  capture: (event: string, props?: Record<string, unknown>) => unknown
}

let client: Client | null = null
let formEditedSent = false

/** Test hook: install a fake client and reset the once-per-session flag. */
export function _setClientForTest(c: Client | null): void {
  client = c
  formEditedSent = false
}

/** Send one allow-listed event. Silent when analytics is off or blocked. */
export function track(event: AnalyticsEvent, data?: Record<string, unknown>): void {
  if (!client) return
  if (event === 'form_edited') {
    if (formEditedSent) return
    formEditedSent = true
  }
  try {
    client.capture(event, sanitizeProps(event, data))
  } catch {
    // An ad blocker or network failure must never affect the app.
  }
}

/** Load PostHog after first paint, only when the gate passes. */
export function initAnalytics(): void {
  const env = import.meta.env
  const enabled = analyticsEnabled({
    key: env.VITE_POSTHOG_KEY,
    isProd: env.PROD,
    hostname: window.location.hostname,
    domains: env.VITE_POSTHOG_DOMAINS,
  })
  if (!enabled || !env.VITE_POSTHOG_KEY) return
  const key = env.VITE_POSTHOG_KEY
  const host = env.VITE_POSTHOG_HOST
  const start = () => {
    void import('posthog-js')
      .then(({ default: posthog }) => {
        posthog.init(key, buildConfig(host))
        client = posthog
      })
      .catch(() => {
        // Blocked or offline: analytics stays a no-op.
      })
  }
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 3000 })
  else setTimeout(start, 1500)
}
