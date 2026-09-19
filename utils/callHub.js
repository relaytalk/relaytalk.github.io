// utils/callHub.js

// utils/callHub.js
// Universal incoming-call listener + outgoing-call launcher + presence.
// Import once per page with:
//   <script type="module" src="/utils/callHub.js"></script>

import { initializeSupabase } from './supabase.js'

const CALL_APP_PATH = '/pages/call-app/call/index.html'
const MISSED_CALL_POLL_MS = 15000
const DEFAULT_RETURN = '/pages/home/friends/index.html'
const PRESENCE_HEARTBEAT_MS = 30000

let supabase = null
let currentUser = null
let callChannel = null
let incomingCallData = null
let incomingCallTimeout = null
let missedCallPollTimer = null
let presenceTimer = null
let ringtonePlayer = null
let ringtoneInterval = null
let bannerVisible = false
let reconnectAttempts = 0
let presenceStarted = false
const MAX_RECONNECT_ATTEMPTS = 6

window.callHubReady = false

// ============================================================
// RETURN-URL HELPER
// ============================================================
function getCurrentPageUrl() {
    try {
        const path = window.location.pathname + window.location.search
        return path || DEFAULT_RETURN
    } catch (e) {
        return DEFAULT_RETURN
    }
}

function rememberReturnUrl() {
    const url = getCurrentPageUrl()
    try {
        sessionStorage.setItem('callReturnTo', url)
    } catch (e) {}
    return url
}

// ============================================================
// PRESENCE — online / offline / heartbeat
// ============================================================
async function setPresenceStatus(status) {
    if (!supabase || !currentUser) return
    try {
        await supabase
            .from('profiles')
            .update({
                status,
                last_seen: new Date().toISOString()
            })
            .eq('id', currentUser.id)
    } catch (e) {
        // silent
    }
}

function startPresence() {
    if (presenceStarted || !currentUser) return
    presenceStarted = true

    // Mark online immediately
    setPresenceStatus('online')

    // Heartbeat
    presenceTimer = setInterval(() => {
        setPresenceStatus('online')
    }, PRESENCE_HEARTBEAT_MS)

    // Tab close → offline
    window.addEventListener('beforeunload', () => {
        try {
            if (presenceTimer) clearInterval(presenceTimer)
            if (supabase && currentUser) {
                supabase
                    .from('profiles')
                    .update({
                        status: 'offline',
                        last_seen: new Date().toISOString()
                    })
                    .eq('id', currentUser.id)
                    .then(() => {})
                    .catch(() => {})
            }
        } catch (e) {}
    })

    // Visibility change → on/off
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            setPresenceStatus('online')
        } else {
            setPresenceStatus('offline')
        }
    })

    // Mobile: pagehide is more reliable than beforeunload
    window.addEventListener('pagehide', () => {
        setPresenceStatus('offline')
    })

    window.addEventListener('pageshow', () => {
        setPresenceStatus('online')
    })
}

// ============================================================
// INIT
// ============================================================
async function initCallHub() {
    console.log('📞 [callHub] Initializing...')

    try {
        supabase = await initializeSupabase()

        if (!supabase || !supabase.auth) {
            console.warn('📞 [callHub] Supabase not ready, retrying in 2s...')
            setTimeout(initCallHub, 2000)
            return
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
            console.log('📞 [callHub] No session — skipping')
            return
        }

        currentUser = session.user
        console.log('📞 [callHub] Ready for user:', currentUser.email)

        // Start presence first so online status is set immediately
        startPresence()

        setupRingtone()
        setupCallChannel()
        checkMissedCalls()
        startMissedCallPolling()

        window.callHubReady = true
    } catch (error) {
        console.error('📞 [callHub] Init error:', error)
    }
}

// ============================================================
// RINGTONE
// ============================================================
function setupRingtone() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext
        if (!AudioContext) throw new Error('No AudioContext')

        const ctx = new AudioContext()

        ringtonePlayer = {
            play() {
                if (ringtoneInterval) return
                if (ctx.state === 'suspended') ctx.resume()

                const beep = () => {
                    const osc = ctx.createOscillator()
                    const gain = ctx.createGain()
                    osc.type = 'sine'
                    osc.frequency.value = 587.33
                    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
                    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05)
                    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
                    osc.connect(gain)
                    gain.connect(ctx.destination)
                    osc.start()
                    osc.stop(ctx.currentTime + 0.45)
                }

                beep()
                ringtoneInterval = setInterval(() => {
                    beep()
                    setTimeout(beep, 500)
                }, 2000)
            },
            stop() {
                if (ringtoneInterval) {
                    clearInterval(ringtoneInterval)
                    ringtoneInterval = null
                }
            }
        }
    } catch (e) {
        ringtonePlayer = { play() {}, stop() {} }
    }
}

function playRingtone() { ringtonePlayer?.play?.() }
function stopRingtone() { ringtonePlayer?.stop?.() }

// ============================================================
// CALL CHANNEL
// ============================================================
function setupCallChannel() {
    if (!supabase || !currentUser) return

    if (callChannel) {
        supabase.removeChannel(callChannel)
        callChannel = null
    }

    callChannel = supabase
        .channel(`callHub:${currentUser.id}`)
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'calls',
            filter: `callee_id=eq.${currentUser.id}`
        }, (payload) => {
            if (payload.new.status === 'ringing') {
                handleIncomingCall(payload.new)
            }
        })
        .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'calls',
            filter: `callee_id=eq.${currentUser.id}`
        }, (payload) => {
            const status = payload.new.status
            if (status === 'cancelled' || status === 'ended' || status === 'missed') {
                const bannerEl = document.getElementById('callHubBanner')
                if (bannerEl && bannerEl.dataset.callId === String(payload.new.id)) {
                    dismissBanner()
                }
            }
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                reconnectAttempts = 0
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++
                    setTimeout(setupCallChannel, Math.min(2000 * reconnectAttempts, 15000))
                }
            }
        })
}

// ============================================================
// INCOMING CALL
// ============================================================
async function handleIncomingCall(callRow) {
    if (!callRow || !callRow.caller_id) return
    if (callRow.callee_id !== currentUser.id) return
    if (callRow.status !== 'ringing') return
    if (window.location.pathname.includes('/call-app/call/')) return

    const existingBanner = document.getElementById('callHubBanner')
    if (existingBanner && existingBanner.dataset.callId === String(callRow.id)) return

    const caller = await getCallerProfile(callRow.caller_id)

    incomingCallData = {
        callId: callRow.id,
        callerId: callRow.caller_id,
        callerName: caller.username || 'Unknown',
        callerAvatar: caller.avatar_url || null,
        room: callRow.room_name
    }

    showBanner(incomingCallData)
    playRingtone()

    incomingCallTimeout = setTimeout(() => {
        const bannerEl = document.getElementById('callHubBanner')
        if (bannerEl) markAsMissed(bannerEl.dataset.callId)
        dismissBanner()
    }, 30000)
}

async function getCallerProfile(callerId) {
    try {
        const { data } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', callerId)
            .maybeSingle()
        return data || {}
    } catch {
        return {}
    }
}

// ============================================================
// BANNER UI
// ============================================================
function showBanner(call) {
    const old = document.getElementById('callHubBanner')
    if (old) old.remove()

    bannerVisible = true
    const initial = (call.callerName || '?').charAt(0).toUpperCase()

    const banner = document.createElement('div')
    banner.id = 'callHubBanner'
    banner.dataset.callId = String(call.callId)
    banner.dataset.callerId = call.callerId
    banner.dataset.room = call.room
    banner.dataset.callerName = call.callerName || ''

    banner.innerHTML = `
        <div class="callHub-avatar">
            ${call.callerAvatar ? `<img src="${call.callerAvatar}" alt="">` : `<span>${initial}</span>`}
        </div>
        <div class="callHub-info">
            <div class="callHub-name">${escapeHtml(call.callerName)}</div>
            <div class="callHub-sub">
                <span class="callHub-pulse"></span>
                <span>Incoming call...</span>
            </div>
        </div>
        <div class="callHub-actions">
            <button type="button" class="callHub-btn callHub-decline" data-action="decline">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="white" style="pointer-events:none;">
                    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                </svg>
            </button>
            <button type="button" class="callHub-btn callHub-accept" data-action="accept">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="white" style="pointer-events:none;">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                </svg>
            </button>
        </div>
    `

    document.body.appendChild(banner)
    injectBannerStyles()

    const btnContainer = banner.querySelector('.callHub-actions')

    const onPress = (e) => {
        const target = e.target.closest('button[data-action]')
        if (!target) return
        e.preventDefault()
        e.stopPropagation()

        const action = target.getAttribute('data-action')
        const bannerEl = document.getElementById('callHubBanner')
        if (!bannerEl) return

        const callData = {
            callId: bannerEl.dataset.callId,
            callerId: bannerEl.dataset.callerId,
            room: bannerEl.dataset.room,
            callerName: bannerEl.dataset.callerName
        }

        if (!callData.callId || !callData.room) return

        if (action === 'accept') acceptIncoming(callData)
        else if (action === 'decline') rejectIncoming(callData)
    }

    btnContainer.addEventListener('click', onPress)
    btnContainer.addEventListener('touchend', onPress, { passive: false })
}

function dismissBanner() {
    bannerVisible = false
    stopRingtone()
    if (incomingCallTimeout) {
        clearTimeout(incomingCallTimeout)
        incomingCallTimeout = null
    }
    const el = document.getElementById('callHubBanner')
    if (el) {
        el.style.opacity = '0'
        el.style.transform = 'translateY(-20px)'
        setTimeout(() => el.remove(), 180)
    }
    incomingCallData = null
}

// ============================================================
// ACCEPT / REJECT
// ============================================================
async function acceptIncoming(callData) {
    if (!callData || !callData.callId) return

    const returnTo = rememberReturnUrl()

    bannerVisible = false
    stopRingtone()
    if (incomingCallTimeout) { clearTimeout(incomingCallTimeout); incomingCallTimeout = null }
    const el = document.getElementById('callHubBanner')
    if (el) el.remove()
    incomingCallData = null

    try {
        await supabase
            .from('calls')
            .update({ status: 'active', answered_at: new Date().toISOString(), seen: true })
            .eq('id', callData.callId)
    } catch (e) {}

    const url = `${CALL_APP_PATH}?incoming=true&room=${encodeURIComponent(callData.room)}&callerId=${callData.callerId}&callId=${callData.callId}&returnTo=${encodeURIComponent(returnTo)}`
    window.location.href = url
}

async function rejectIncoming(callData) {
    if (!callData || !callData.callId) return

    bannerVisible = false
    stopRingtone()
    if (incomingCallTimeout) { clearTimeout(incomingCallTimeout); incomingCallTimeout = null }
    const el = document.getElementById('callHubBanner')
    if (el) el.remove()
    incomingCallData = null

    try {
        await supabase
            .from('calls')
            .update({ status: 'rejected', ended_at: new Date().toISOString(), seen: true })
            .eq('id', callData.callId)
    } catch (e) {}
}

async function markAsMissed(callId) {
    if (!callId) return
    try {
        await supabase
            .from('calls')
            .update({ status: 'missed', ended_at: new Date().toISOString(), seen: false })
            .eq('id', callId)
    } catch (e) {}
}

// ============================================================
// OUTGOING CALL
// ============================================================
window.startCall = function (friendId, friendName) {
    if (!friendId) return
    const returnTo = rememberReturnUrl()
    const url = `${CALL_APP_PATH}?friendId=${friendId}&friendName=${encodeURIComponent(friendName || '')}&returnTo=${encodeURIComponent(returnTo)}`
    const popup = window.open(url, '_blank', 'width=500,height=700')
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = url
    }
}

// ============================================================
// MISSED CALLS
// ============================================================
async function checkMissedCalls() {
    if (!supabase || !currentUser) return
    try {
        const { count } = await supabase
            .from('calls')
            .select('*', { count: 'exact', head: true })
            .eq('callee_id', currentUser.id)
            .eq('seen', false)
            .in('status', ['missed', 'rejected'])

        const badge = document.getElementById('missedCallBadge')
        if (badge) {
            if (count && count > 0) {
                badge.textContent = count > 9 ? '9+' : String(count)
                badge.style.display = 'flex'
            } else {
                badge.style.display = 'none'
            }
        }
    } catch (e) {}
}

function startMissedCallPolling() {
    if (missedCallPollTimer) clearInterval(missedCallPollTimer)
    missedCallPollTimer = setInterval(checkMissedCalls, MISSED_CALL_POLL_MS)
}

// ============================================================
// UTILITIES
// ============================================================
function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
}

function injectBannerStyles() {
    if (document.getElementById('callHubStyles')) return

    const style = document.createElement('style')
    style.id = 'callHubStyles'
    style.textContent = `
        /* ============================================================ */
        /* RelayTalk — Incoming call banner                             */
        /* ============================================================ */

        #callHubBanner {
            position: fixed;
            top: 14px;
            left: 50%;
            transform: translateX(-50%);
            width: min(92%, 400px);
            background: rgba(255, 255, 255, 0.96);
            backdrop-filter: saturate(180%) blur(16px);
            -webkit-backdrop-filter: saturate(180%) blur(16px);
            border: 1px solid #e6ecf3;
            border-radius: 22px;
            padding: 14px 16px;
            box-shadow: 0 12px 40px rgba(10, 37, 64, 0.18), 0 2px 6px rgba(10, 37, 64, 0.06);
            z-index: 2147483647 !important;
            display: flex;
            align-items: center;
            gap: 12px;
            transition: opacity 0.18s ease, transform 0.18s ease;
            animation: callHubSlideDown 0.3s cubic-bezier(0.22, 1, 0.36, 1);
            pointer-events: auto !important;
            user-select: none;
            font-family: 'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }

        @keyframes callHubSlideDown {
            from { opacity: 0; transform: translate(-50%, -30px); }
            to   { opacity: 1; transform: translate(-50%, 0); }
        }

        /* Avatar */
        .callHub-avatar {
            width: 48px;
            height: 48px;
            min-width: 48px;
            min-height: 48px;
            border-radius: 50%;
            background: linear-gradient(135deg, #007acc, #00b4d8);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            color: #ffffff;
            font-weight: 500;
            font-size: 1.15rem;
            flex-shrink: 0;
            text-transform: uppercase;
            box-shadow: 0 4px 12px rgba(0, 122, 204, 0.22);
        }

        .callHub-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            display: block;
        }

        /* Info */
        .callHub-info { flex: 1; min-width: 0; }

        .callHub-name {
            color: #0a2540;
            font-weight: 500;
            font-size: 0.98rem;
            letter-spacing: -0.01em;
            margin-bottom: 3px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .callHub-sub {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #5f6368;
            font-size: 0.8rem;
        }

        .callHub-pulse {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #1e8e3e;
            box-shadow: 0 0 0 0 rgba(30, 142, 62, 0.55);
            animation: callHubPulse 1.6s infinite;
            flex-shrink: 0;
        }

        @keyframes callHubPulse {
            0%   { box-shadow: 0 0 0 0 rgba(30, 142, 62, 0.55); }
            70%  { box-shadow: 0 0 0 12px rgba(30, 142, 62, 0); }
            100% { box-shadow: 0 0 0 0 rgba(30, 142, 62, 0); }
        }

        /* Actions */
        .callHub-actions {
            display: flex;
            gap: 8px;
            flex-shrink: 0;
            position: relative;
            z-index: 10;
        }

        .callHub-btn {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
                        background 0.2s cubic-bezier(0.22, 1, 0.36, 1),
                        box-shadow 0.2s cubic-bezier(0.22, 1, 0.36, 1);
            box-shadow: 0 4px 14px rgba(10, 37, 64, 0.18);
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
        }

        .callHub-btn:hover { transform: scale(1.06); }
        .callHub-btn:active { transform: scale(0.94); }

        .callHub-accept {
            background: #1e8e3e;
            animation: callHubRing 1.6s infinite;
        }

        .callHub-accept:hover {
            background: #1a7d37;
            box-shadow: 0 6px 18px rgba(30, 142, 62, 0.35);
        }

        .callHub-decline {
            background: #d93025;
        }

        .callHub-decline:hover {
            background: #b9251c;
            box-shadow: 0 6px 18px rgba(217, 48, 37, 0.35);
        }

        @keyframes callHubRing {
            0%   { box-shadow: 0 0 0 0 rgba(30, 142, 62, 0.55); }
            70%  { box-shadow: 0 0 0 14px rgba(30, 142, 62, 0); }
            100% { box-shadow: 0 0 0 0 rgba(30, 142, 62, 0); }
        }

        .callHub-btn svg { pointer-events: none !important; }

        /* Responsive */
        @media (max-width: 480px) {
            #callHubBanner {
                top: 10px;
                width: calc(100% - 20px);
                padding: 12px 14px;
                border-radius: 20px;
                gap: 10px;
            }

            .callHub-avatar {
                width: 44px;
                height: 44px;
                min-width: 44px;
                min-height: 44px;
                font-size: 1.05rem;
            }

            .callHub-name { font-size: 0.94rem; }
            .callHub-sub  { font-size: 0.76rem; }

            .callHub-btn {
                width: 42px;
                height: 42px;
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #callHubBanner,
            .callHub-pulse,
            .callHub-accept {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
            }
        }
    `
    document.head.appendChild(style)
}

// ============================================================
// CLEANUP
// ============================================================
window.addEventListener('beforeunload', () => {
    stopRingtone()
    if (callChannel && supabase) supabase.removeChannel(callChannel)
    if (missedCallPollTimer) clearInterval(missedCallPollTimer)
    if (presenceTimer) clearInterval(presenceTimer)
})

// ============================================================
// AUTO-START
// ============================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCallHub)
} else {
    initCallHub()
}