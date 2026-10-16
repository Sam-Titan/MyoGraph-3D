import type { CaptureResult } from 'posthog-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _setClientForTest,
  analyticsEnabled,
  buildConfig,
  sanitizeProps,
  scrubEvent,
  stripUrl,
  track,
} from './analytics'

const gate = { key: 'phc_x', isProd: true, hostname: 'app.example.com', domains: 'app.example.com' }

describe('analyticsEnabled', () => {
  it('is on only when key, production build and hostname all match', () => {
    expect(analyticsEnabled(gate)).toBe(true)
    expect(analyticsEnabled({ ...gate, domains: 'a.com, APP.example.com' })).toBe(true)
  })
  it.each([
    ['no key', { key: undefined }],
    ['dev build', { isProd: false }],
    ['other host', { hostname: 'deploy-preview-3--app.netlify.app' }],
    ['no domains', { domains: undefined }],
    ['empty domains', { domains: ' , ' }],
  ])('is off with %s', (_name, patch) => {
    expect(analyticsEnabled({ ...gate, ...patch })).toBe(false)
  })
})

describe('sanitizeProps', () => {
  it('keeps only allow-listed primitive properties', () => {
    expect(
      sanitizeProps('target_selected', { target: 'LAD', source: '3d', age: 61, note: 'x' }),
    ).toEqual({ target: 'LAD', source: '3d' })
  })
  it('drops everything for events that take no properties', () => {
    expect(sanitizeProps('form_edited', { age: 61, field: 'Typical angina' })).toEqual({})
  })
  it('drops objects and over-long strings', () => {
    expect(sanitizeProps('tab_viewed', { tab: { a: 1 } })).toEqual({})
    expect(sanitizeProps('tab_viewed', { tab: 'x'.repeat(200) })).toEqual({})
  })
})

describe('URL scrubbing', () => {
  it('stripUrl removes query and hash', () => {
    expect(stripUrl('https://a.com/p?x=1#h')).toBe('https://a.com/p')
    expect(stripUrl('https://a.com/#v=age:61')).toBe('https://a.com/')
    expect(stripUrl('/path?q=1')).toBe('/path')
    expect(stripUrl('https://a.com/p')).toBe('https://a.com/p')
  })

  it('scrubEvent cleans every URL-like property, including $initial_* and $prev_*', () => {
    const event = {
      uuid: '1',
      event: '$pageview',
      properties: {
        $current_url: 'https://a.com/?age=61#v=1',
        $referrer: 'https://www.linkedin.com/feed/?trk=1',
        $initial_referrer: 'https://t.co/abc?x=1',
        $initial_current_url: 'https://a.com/?s=1#h',
        $initial_pathname: '/x?y=1',
        $pathname: '/?z=1#h',
        $prev_pageview_pathname: '/a?b=1',
        $initial_browser: 'Chrome',
        $browser: 'Safari?',
        custom: 'https://keep.me/?q=1',
      },
      $set_once: { $initial_referrer: 'https://t.co/abc?x=1' },
    } as unknown as CaptureResult
    const { properties, $set_once } = scrubEvent(event)
    expect(properties.$current_url).toBe('https://a.com/')
    expect(properties.$referrer).toBe('https://www.linkedin.com/feed/')
    expect(properties.$initial_referrer).toBe('https://t.co/abc')
    expect(properties.$initial_current_url).toBe('https://a.com/')
    expect(properties.$initial_pathname).toBe('/x')
    expect(properties.$pathname).toBe('/')
    expect(properties.$prev_pageview_pathname).toBe('/a')
    expect(properties.$initial_browser).toBe('Chrome')
    expect(properties.$browser).toBe('Safari?')
    expect(properties.custom).toBe('https://keep.me/?q=1')
    expect($set_once?.$initial_referrer).toBe('https://t.co/abc')
  })
})

describe('buildConfig', () => {
  it('pins the privacy-safe settings', () => {
    const c = buildConfig(undefined)
    expect(c.api_host).toBe('https://us.i.posthog.com')
    expect(c.cookieless_mode).toBe('always')
    expect(c.person_profiles).toBe('never')
    expect(c.autocapture).toBe(false)
    expect(c.disable_session_recording).toBe(true)
    expect(c.respect_dnt).toBe(true)
    expect(c.capture_pageview).toBe(true)
    expect(c.before_send).toBe(scrubEvent)
    expect(buildConfig('https://eu.i.posthog.com').api_host).toBe('https://eu.i.posthog.com')
  })
})

describe('track', () => {
  const capture = vi.fn()
  beforeEach(() => {
    capture.mockReset()
    _setClientForTest({ capture })
  })

  it('is a no-op when analytics is not initialised', () => {
    _setClientForTest(null)
    expect(() => track('tab_viewed', { tab: 'about' })).not.toThrow()
    expect(capture).not.toHaveBeenCalled()
  })
  it('sends only allow-listed properties', () => {
    track('preset_loaded', { preset: 'p1', source: 'auto', age: 61 })
    expect(capture).toHaveBeenCalledWith('preset_loaded', { preset: 'p1', source: 'auto' })
  })
  it('sends form_edited once per session and never a value', () => {
    track('form_edited', { age: 61 })
    track('form_edited')
    expect(capture).toHaveBeenCalledTimes(1)
    expect(capture).toHaveBeenCalledWith('form_edited', {})
  })
  it('swallows client errors', () => {
    capture.mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => track('summary_requested')).not.toThrow()
  })
})
