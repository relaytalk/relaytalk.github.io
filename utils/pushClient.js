// utils/pushClient.js
// Client-side Web Push subscription manager.
// Registers the service worker itself (no separate sw-manager required).

import { initializeSupabase } from './supabase.js'

// ⚠️ Your VAPID public key
const VAPID_PUBLIC_KEY = 'BJvYkb3poqpv8xqDhYxhgzTomReEe4fsxiEdJsb8dwN-j7GNPmfcBXLcOvmIJOcvcAAtvzNfy1rEb_7mY63281w'

let supabase = null
let currentUser = null
let swRegistration = null
let swRegisterPromise = null

// ============================================================
// HELPERS
// ============================================================
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
}

// Figure out the correct path to /service-worker.js based on current page depth
function resolveServiceWorkerPath() {
    // We want the SW to be at the site root so it can control the whole app.
    // Files:
    //   /service-worker.js
    // Pages can be at:
    //   /                          → 'service-worker.js'
    //   /pages/home/               → '/service-worker.js'
    //   /pages/home/profiles/      → '/service-worker.js'
    // Using an absolute path '/' is cleanest on Vercel + GH Pages.
    return '/service-worker.js'
}

// ============================================================
// REGISTER SERVICE WORKER (idempotent)
// ============================================================
async function ensureServiceWorker() {
    if (!('serviceWorker' in navigator)) return null
    if (swRegistration) return swRegistration
    if (swRegisterPromise) return swRegisterPromise

    swRegisterPromise = (async () => {
        try {
            const swPath = resolveServiceWorkerPath()
            console.log('📬 [push] Registering service worker at:', swPath)

            // Check if already registered
            const existing = await navigator.serviceWorker.getRegistration(swPath)
            if (existing) {
                console.log('📬 [push] SW already registered')
                swRegistration = existing
                return existing
            }

            const reg = await navigator.serviceWorker.register(swPath, { scope: '/' })
            console.log('📬 [push] SW registered, scope:', reg.scope)
            swRegistration = reg
            return reg
        } catch (err) {
            console.error('📬 [push] SW registration failed:', err.message)
            return null
        }
    })()

    return swRegisterPromise
}

// Wait until the SW is fully active (Chrome needs this before subscribing)
async function waitForActiveWorker(reg) {
    if (reg.active) return reg.active

    console.log('📬 [push] Waiting for SW to activate...')

    return new Promise((resolve) => {
        const worker = reg.installing || reg.waiting

        if (!worker) {
            const timeout = setTimeout(() => resolve(reg.active), 5000)
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                clearTimeout(timeout)
                resolve(reg.active)
            }, { once: true })
            return
        }

        if (worker.state === 'activated') {
            resolve(worker)
            return
        }

        worker.addEventListener('statechange', () => {
            if (worker.state === 'activated') resolve(worker)
        })

        setTimeout(() => resolve(reg.active), 8000)
    })
}

async function getReadyRegistration() {
    const reg = await ensureServiceWorker()
    if (!reg) return null

    if (!reg.active) {
        await waitForActiveWorker(reg)
    }

    return reg
}

// ============================================================
// INIT
// ============================================================
export async function initPushClient() {
    console.log('📬 [push] Initializing...')

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('📬 [push] Push not supported in this browser')
        return { success: false, reason: 'unsupported' }
    }

    // Register the SW as early as possible, regardless of auth
    await ensureServiceWorker()

    try {
        supabase = await initializeSupabase()
        if (!supabase?.auth) return { success: false, reason: 'no supabase' }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
            console.log('📬 [push] No session, skipping')
            return { success: false, reason: 'no session' }
        }

        currentUser = session.user
        console.log('📬 [push] User:', currentUser.email)

        if (Notification.permission === 'granted') {
            console.log('📬 [push] Permission already granted, ensuring subscription...')
            await subscribeCurrentDevice()
        }

        return { success: true }
    } catch (error) {
        console.error('📬 [push] Init error:', error)
        return { success: false, reason: error.message }
    }
}

// ============================================================
// PERMISSION + SUBSCRIBE
// ============================================================
export async function requestPushPermission() {
    console.log('📬 [push] Requesting permission...')

    if (!('Notification' in window)) {
        alert('Notifications are not supported in this browser')
        return { success: false, reason: 'unsupported' }
    }

    // Make sure SW is up before we ask for permission
    await ensureServiceWorker()

    const perm = await Notification.requestPermission()
    console.log('📬 [push] Permission result:', perm)

    if (perm !== 'granted') {
        return { success: false, reason: 'denied' }
    }

    return await subscribeCurrentDevice()
}

async function subscribeCurrentDevice() {
    try {
        const reg = await getReadyRegistration()
        if (!reg) {
            console.warn('📬 [push] No service worker registration')
            return { success: false, reason: 'no service worker' }
        }

        console.log('📬 [push] SW state:', reg.active ? 'active' : (reg.installing ? 'installing' : 'waiting'))

        let subscription = await reg.pushManager.getSubscription()

        if (!subscription) {
            console.log('📬 [push] Creating new subscription...')
            try {
                subscription = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                })
                console.log('📬 [push] Subscription created:', subscription.endpoint.slice(0, 55) + '...')
            } catch (subErr) {
                console.error('📬 [push] pushManager.subscribe failed:', subErr.name, '-', subErr.message)

                let reason = subErr.name || 'unknown'
                if (subErr.name === 'NotAllowedError') reason = 'permission denied'
                if (subErr.name === 'AbortError') reason = 'service worker not ready'
                if (subErr.name === 'InvalidStateError') reason = 'browser state invalid'

                return { success: false, reason }
            }
        } else {
            console.log('📬 [push] Reusing existing subscription:', subscription.endpoint.slice(0, 55) + '...')
        }

        await saveSubscriptionToDb(subscription)
        return { success: true }
    } catch (error) {
        console.error('📬 [push] Subscribe failed:', error)
        return { success: false, reason: error.message }
    }
}

async function saveSubscriptionToDb(subscription) {
    if (!supabase || !currentUser) return

    const json = subscription.toJSON()
    const payload = {
        user_id: currentUser.id,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString()
    }

    if (!payload.endpoint || !payload.p256dh || !payload.auth) {
        console.warn('📬 [push] Incomplete subscription, skipping save')
        return
    }

    const { error } = await supabase
        .from('push_subscriptions')
        .upsert(payload, { onConflict: 'endpoint' })

    if (error) {
        console.error('📬 [push] Failed to save subscription:', error.message)
    } else {
        console.log('📬 [push] Subscription saved to DB')
    }
}

// ============================================================
// UNSUBSCRIBE
// ============================================================
export async function unsubscribePush() {
    try {
        const reg = await ensureServiceWorker()
        if (!reg) return
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
            const endpoint = sub.endpoint
            await sub.unsubscribe()
            if (supabase) {
                await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
            }
            console.log('📬 [push] Unsubscribed')
        }
    } catch (e) {
        console.warn('📬 [push] Unsubscribe error:', e)
    }
}

// ============================================================
// AUTO-INIT
// ============================================================
if (typeof window !== 'undefined') {
    window.relaytalkPush = {
        init: initPushClient,
        request: requestPushPermission,
        unsubscribe: unsubscribePush
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initPushClient())
    } else {
        initPushClient()
    }
}
