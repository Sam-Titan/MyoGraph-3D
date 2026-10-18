/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PostHog project key (public by design). Analytics is off when unset. */
  readonly VITE_POSTHOG_KEY?: string
  /** `https://us.i.posthog.com` (default) or `https://eu.i.posthog.com`. */
  readonly VITE_POSTHOG_HOST?: string
  /** Comma-separated live hostnames allowed to send analytics. */
  readonly VITE_POSTHOG_DOMAINS?: string
}
