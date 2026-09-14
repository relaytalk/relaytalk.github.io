// utils/callHub.js
// Universal incoming-call listener + outgoing-call launcher.
// Provides:
//   window.startCall(friendId, friendName)
//   window.callHubReady

import { initializeSupabase } from './supabase.js'

const CALL_APP_PATH = '/pages/call-app/call/index.html'
const MISSED_CALL_POLL_MS = 15000
const DEFAULT_RETURN = '/pages/home/friends/index.html'

let supabase = null
let currentUser = null
let callChannel = null
let incomingCallData = null
let incomingCallTimeout = null
let missedCallPollTimer = null
let ringtonePlayer = null
let ringtoneInterval = null
let bannerVisible = false
let reconnectAttempts = 0
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
            console.log('📞 [callHub] No session — user not logged in, skipping')
            return
        }

        currentUser = session.user
        console.log('📞 [callHub] Ready for user:', currentUser.email)

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
        console.warn('📞 [callHub] Ringtone unavailable:', e)
        ringtonePlayer = { play() {}, stop() {} }
    }
}

function playRingtone() { ringtonePlayer?.play?.() }
function stopRingtone() { ringtonePlayer?.stop?.() }

// ============================================================
// REALTIME CHANNEL
// ============================================================
function setupCallChannel() {
    if (!supabase || !currentUser) return

    if (callChannel) {
        supabase.removeChannel(callChannel)
        callChannel = null
    }

    console.log('📞 [callHub] Subscribing to calls channel for', currentUser.id)

    callChannel = supabase
        .channel(`callHub:${currentUser.id}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'calls',
                filter: `callee_id=eq.${currentUser.id}`
            },
            (payload) => {
                console.log('📞 [callHub] New call INSERT:', payload.new)
                if (payload.new.status === 'ringing') {
                    handleIncomingCall(payload.new)
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'calls',
                filter: `callee_id=eq.${currentUser.id}`
            },
            (payload) => {
                const status = payload.new.status
                console.log('📞 [callHub] Call updated:', status)

                if (status === 'cancelled' || status === 'ended' || status === 'missed') {
                    const bannerEl = document.getElementById('callHubBanner')
                    if (bannerEl && bannerEl.dataset.callId === String(payload.new.id)) {
                        dismissBanner()
                    }
                }
            }
        )
        .subscribe((status) => {
            console.log('📞 [callHub] Channel status:', status)
            if (status === 'SUBSCRIBED') {
                reconnectAttempts = 0
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++
                    const delay = Math.min(2000 * reconnectAttempts, 15000)
                    console.log(`📞 [callHub] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
                    setTimeout(setupCallChannel, delay)
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
    if (existingBanner && existingBanner.dataset.callId === String(callRow.id)) {
        console.log('📞 [callHub] Banner already showing for this call')
        return
    }

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
        console.log('📞 [callHub] Call timed out')
        const bannerEl = document.getElementById('callHubBanner')
        if (bannerEl) {
            markAsMissed(bannerEl.dataset.callId)
        }
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
            ${call.callerAvatar
                ? `<img src="${call.callerAvatar}" alt="">`
                : `<span>${initial}</span>`}
        </div>
        <div class="callHub-info">
            <div class="callHub-name">${escapeHtml(call.callerName)}</div>
            <div class="callHub-sub">
                <span class="callHub-pulse"></span>
                <span>Incoming call...</span>
            </div>
        </div>
        <div class="callHub-actions">
            <button type="button" class="callHub-btn callHub-decline" data-action="decline" aria-label="Decline">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="white" style="pointer-events:none;">
                    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.7l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
                </svg>
            </button>
            <button type="button" class="callHub-btn callHub-accept" data-action="accept" aria-label="Accept">
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
        console.log('📞 [callHub] Button pressed:', action)

        const bannerEl = document.getElementById('callHubBanner')
        if (!bannerEl) {
            console.warn('📞 [callHub] Banner already gone')
            return
        }

        const callData = {
            callId: bannerEl.dataset.callId,
            callerId: bannerEl.dataset.callerId,
            room: bannerEl.dataset.room,
            callerName: bannerEl.dataset.callerName
        }

        console.log('📞 [callHub] Call data from banner:', callData)

        if (!callData.callId || !callData.room) {
            console.warn('📞 [callHub] Banner has no call data — ignoring')
            return
        }

        if (action === 'accept') {
            acceptIncoming(callData)
        } else if (action === 'decline') {
            rejectIncoming(callData)
        }
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
    console.log('📞 [callHub] acceptIncoming called with:', callData)

    if (!callData || !callData.callId) {
        console.warn('📞 [callHub] No call data — ignoring accept')
        return
    }

    // Remember where we are so call page can return here
    const returnTo = rememberReturnUrl()
    console.log('📞 [callHub] Return URL saved:', returnTo)

    bannerVisible = false
    stopRingtone()
    if (incomingCallTimeout) {
        clearTimeout(incomingCallTimeout)
        incomingCallTimeout = null
    }
    const el = document.getElementById('callHubBanner')
    if (el) el.remove()
    incomingCallData = null

    try {
        await supabase
            .from('calls')
            .update({
                status: 'active',
                answered_at: new Date().toISOString(),
                seen: true
            })
            .eq('id', callData.callId)
        console.log('📞 [callHub] Marked call active')
    } catch (e) {
        console.warn('📞 [callHub] Failed to mark active:', e)
    }

    const url = `${CALL_APP_PATH}?incoming=true&room=${encodeURIComponent(callData.room)}&callerId=${callData.callerId}&callId=${callData.callId}&returnTo=${encodeURIComponent(returnTo)}`
    console.log('📞 [callHub] Opening call page:', url)
    window.location.href = url
}

async function rejectIncoming(callData) {
    console.log('📞 [callHub] rejectIncoming called with:', callData)

    if (!callData || !callData.callId) {
        console.warn('📞 [callHub] No call data — ignoring reject')
        return
    }

    bannerVisible = false
    stopRingtone()
    if (incomingCallTimeout) {
        clearTimeout(incomingCallTimeout)
        incomingCallTimeout = null
    }
    const el = document.getElementById('callHubBanner')
    if (el) el.remove()
    incomingCallData = null

    try {
        await supabase
            .from('calls')
            .update({
                status: 'rejected',
                ended_at: new Date().toISOString(),
                seen: true
            })
            .eq('id', callData.callId)
        console.log('📞 [callHub] Marked call rejected')
    } catch (e) {
        console.warn('📞 [callHub] Failed to mark rejected:', e)
    }
}

async function markAsMissed(callId) {
    if (!callId) return
    try {
        await supabase
            .from('calls')
            .update({
                status: 'missed',
                ended_at: new Date().toISOString(),
                seen: false
            })
            .eq('id', callId)
    } catch (e) {}
}

// ============================================================
// OUTGOING CALL
// ============================================================
window.startCall = function (friendId, friendName) {
    if (!friendId) return

    console.log(`📞 [callHub] Starting call to ${friendName || friendId}`)

    const returnTo = rememberReturnUrl()
    console.log('📞 [callHub] Return URL saved:', returnTo)

    const url = `${CALL_APP_PATH}?friendId=${friendId}&friendName=${encodeURIComponent(friendName || '')}&returnTo=${encodeURIComponent(returnTo)}`

    const popup = window.open(url, '_blank', 'width=500,height=700')

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        console.warn('📞 [callHub] Popup blocked, navigating in same tab')
        window.location.href = url
    }
}

// ============================================================
// MISSED CALLS BADGE
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
        #callHubBanner {
            position: fixed;
            top: 14px;
            left: 50%;
            transform: translateX(-50%);
            width: min(92%, 380px);
            background: rgba(20, 20, 30, 0.96);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 18px;
            padding: 14px 16px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.4);
            z-index: 2147483647 !important;
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            transition: opacity 0.18s ease, transform 0.18s ease;
            animation: callHubSlideDown 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2);
            pointer-events: auto !important;
            user-select: none;
        }

        @keyframes callHubSlideDown {
            from { opacity: 0; transform: translate(-50%, -30px); }
            to   { opacity: 1; transform: translate(-50%, 0); }
        }

        .callHub-avatar {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: linear-gradient(45deg, #007acc, #00b4d8);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            color: white;
            font-weight: 700;
            font-size: 20px;
            flex-shrink: 0;
        }

        .callHub-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .callHub-info {
            flex: 1;
            min-width: 0;
        }

        .callHub-name {
            color: white;
            font-weight: 600;
            font-size: 15px;
            margin-bottom: 3px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .callHub-sub {
            display: flex;
            align-items: center;
            gap: 6px;
            color: rgba(255,255,255,0.7);
            font-size: 12.5px;
        }

        .callHub-pulse {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #22c55e;
            box-shadow: 0 0 0 0 rgba(34,197,94,0.7);
            animation: callHubPulse 1.6s infinite;
        }

        @keyframes callHubPulse {
            0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.7); }
            70%  { box-shadow: 0 0 0 12px rgba(34,197,94,0); }
            100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }

        .callHub-actions {
            display: flex;
            gap: 8px;
            flex-shrink: 0;
            position: relative;
            z-index: 10;
            pointer-events: auto !important;
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
            transition: transform 0.15s ease, background 0.2s ease;
            box-shadow: 0 4px 14px rgba(0,0,0,0.25);
            pointer-events: auto !important;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
            position: relative;
            z-index: 10;
        }

        .callHub-btn:hover { transform: scale(1.06); }
        .callHub-btn:active { transform: scale(0.94); }

        .callHub-accept {
            background: #22c55e;
            animation: callHubRing 1.6s infinite;
        }

        .callHub-decline { background: #ef4444; }

        @keyframes callHubRing {
            0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
            70%  { box-shadow: 0 0 0 14px rgba(34,197,94,0); }
            100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }

        .callHub-btn svg {
            pointer-events: none !important;
        }
    `
    document.head.appendChild(style)
}

// ============================================================
// CLEANUP
// ============================================================
window.addEventListener('beforeunload', () => {
    stopRingtone()
    if (callChannel && supabase) {
        supabase.removeChannel(callChannel)
    }
    if (missedCallPollTimer) {
        clearInterval(missedCallPollTimer)
    }
})

// ============================================================
// AUTO-START
// ============================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCallHub)
} else {
    initCallHub()
}
