import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getExistingSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  unsubscribeFromPushOnLogout,
  urlBase64ToUint8Array,
} from '../utils/push'

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')
const originalPushManager = (window as any).PushManager
const originalNotification = (window as any).Notification

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalServiceWorker) {
    Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
  } else {
    delete (navigator as any).serviceWorker
  }
  ;(window as any).PushManager = originalPushManager
  ;(window as any).Notification = originalNotification
})

describe('urlBase64ToUint8Array', () => {
  it('decodes a standard base64url VAPID key into bytes', () => {
    // "hello" base64url-encoded, no padding
    const result = urlBase64ToUint8Array('aGVsbG8')
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111])
  })

  it('converts URL-safe characters (-, _) back to standard base64 (+, /)', () => {
    // bytes [0xfb, 0xff, 0xbf] -> standard base64 "+/+/" uses +, / which
    // become -, _ in base64url form
    const standard = btoa(String.fromCharCode(0xfb, 0xef, 0xbe))
    const urlSafe = standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const result = urlBase64ToUint8Array(urlSafe)
    expect(Array.from(result)).toEqual([0xfb, 0xef, 0xbe])
  })

  it('handles strings requiring padding', () => {
    // "hi" -> base64 "aGk=" -> base64url "aGk" (length 3, needs 1 padding char)
    const result = urlBase64ToUint8Array('aGk')
    expect(Array.from(result)).toEqual([104, 105])
  })
})

describe('isPushSupported', () => {
  it('returns false when serviceWorker is not available', () => {
    delete (navigator as any).serviceWorker
    ;(window as any).PushManager = function () {}
    ;(window as any).Notification = function () {}

    expect(isPushSupported()).toBe(false)
  })

  it('returns false when PushManager is not available', () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true })
    delete (window as any).PushManager
    ;(window as any).Notification = function () {}

    expect(isPushSupported()).toBe(false)
  })

  it('returns true when serviceWorker, PushManager, and Notification are all present', () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true })
    ;(window as any).PushManager = function () {}
    ;(window as any).Notification = function () {}

    expect(isPushSupported()).toBe(true)
  })
})

describe('getExistingSubscription', () => {
  it('returns null when push is not supported', async () => {
    delete (navigator as any).serviceWorker
    ;(window as any).PushManager = function () {}
    ;(window as any).Notification = function () {}

    await expect(getExistingSubscription()).resolves.toBeNull()
  })

  it('resolves the current subscription from the active registration', async () => {
    const mockSubscription = { endpoint: 'https://push.example.com/xyz' }
    const getSubscription = vi.fn().mockResolvedValue(mockSubscription)
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { getSubscription } }) },
      configurable: true,
    })
    ;(window as any).PushManager = function () {}
    ;(window as any).Notification = function () {}

    const result = await getExistingSubscription()
    expect(result).toBe(mockSubscription)
    expect(getSubscription).toHaveBeenCalledOnce()
  })
})

describe('subscribeToPush', () => {
  it('returns the existing subscription without calling subscribe again', async () => {
    const existing = { endpoint: 'https://push.example.com/existing' }
    const subscribe = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(existing), subscribe },
        }),
      },
      configurable: true,
    })

    const result = await subscribeToPush('BEz0123456789')
    expect(result).toBe(existing)
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('creates a new subscription with the VAPID key when none exists', async () => {
    const created = { endpoint: 'https://push.example.com/new' }
    const subscribe = vi.fn().mockResolvedValue(created)
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe },
        }),
      },
      configurable: true,
    })

    const result = await subscribeToPush('aGVsbG8')
    expect(result).toBe(created)
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      }),
    )
  })
})

describe('unsubscribeFromPush', () => {
  it('returns false when there is no existing subscription', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } }) },
      configurable: true,
    })
    ;(window as any).PushManager = function () {}
    ;(window as any).Notification = function () {}

    await expect(unsubscribeFromPush()).resolves.toBe(false)
  })

  it('unsubscribes the existing subscription', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true)
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({
          pushManager: { getSubscription: vi.fn().mockResolvedValue({ unsubscribe }) },
        }),
      },
      configurable: true,
    })
    ;(window as any).PushManager = function () {}
    ;(window as any).Notification = function () {}

    await expect(unsubscribeFromPush()).resolves.toBe(true)
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

describe('unsubscribeFromPushOnLogout', () => {
  it('does nothing when there is no auth token', () => {
    const fetchSpy = vi.spyOn(window, 'fetch' as any)
    unsubscribeFromPushOnLogout(undefined)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does nothing when push is not supported', () => {
    delete (navigator as any).serviceWorker
    const fetchSpy = vi.spyOn(window, 'fetch' as any)
    unsubscribeFromPushOnLogout('some-token')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('deletes the server-side subscription and unsubscribes the browser when a token and subscription exist', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true)
    const subscription = { endpoint: 'https://push.example.com/logout-target', unsubscribe }
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve({ pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) } }),
      },
      configurable: true,
    })
    ;(window as any).PushManager = function () {}
    ;(window as any).Notification = function () {}

    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    unsubscribeFromPushOnLogout('captured-token')

    // The cleanup runs as a fire-and-forget async IIFE; flush microtasks.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/push/subscribe'),
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer captured-token' }),
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }),
    )
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
