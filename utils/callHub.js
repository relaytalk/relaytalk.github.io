// utils/callHub.js
// Universal in-app notification listener:
//   • Incoming calls   (existing)
//   • New messages     (new)
//   • New reactions    (new)
// Plus outgoing-call launcher and presence.
// Import once per page with:
//   <script type="module" src="/utils/callHub.js"></script>

import { initializeSupabase } from './supabase.js'

const CALL_APP_PATH = '/pages/call-app/call/index.html'
const CHAT_APP_PATH = '/pages/chats/index.html'
const MISSED_CALL_POLL_MS = 15000
const DEFAULT_RETURN = '/pages/home/friends/index.html'
const PRESENCE_HEARTBEAT_MS = 30000

const CALL_BANNER_TIMEOUT_MS = 30000
const MESSAGE_BANNER_TIMEOUT_MS = 5000
const REACTION_BANNER_TIMEOUT_MS = 5000

const SWIPE_DISMISS_PX = 80

let supabase = null
let currentUser = null

let callChannel = null
let messageChannel = null
let reactionChannel = null

let incomingCallData = null
let incomingCallTimeout = null

let messageBannerTimeout = null
let reactionBannerTimeout = null

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
// PRESENCE
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
    } catch (e) {}
}

function startPresence() {
    if (presenceStarted || !currentUser) return
    presenceStarted = true

    setPresenceStatus('online')

    presenceTimer = setInterval(() => {
        setPresenceStatus('online')
    }, PRESENCE_HEARTBEAT_MS)

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

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            setPresenceStatus('online')
        } else {
            setPresenceStatus('offline')
        }
    })

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

        startPresence()

        setupRingtone()
        setupCallChannel()
        setupMessageChannel()
        setupReactionChannel()
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
// MESSAGE CHANNEL
// ============================================================
function setupMessageChannel() {
    if (!supabase || !currentUser) return

    if (messageChannel) {
        supabase.removeChannel(messageChannel)
        messageChannel = null
    }

    messageChannel = supabase
        .channel(`msgHub:${currentUser.id}`)
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'direct_messages',
            filter: `receiver_id=eq.${currentUser.id}`
        }, (payload) => {
            handleIncomingMessage(payload.new)
        })
        .subscribe()
}

async function handleIncomingMessage(row) {
    if (!row || !row.sender_id) return
    if (row.sender_id === currentUser.id) return
    if (isOnChatPageWith(row.sender_id)) return
    if (bannerVisible) return

    const sender = await getProfile(row.sender_id)
    if (!sender) return

    const preview = buildMessagePreview(row)
    if (!preview) return

    showMessageBanner({
        senderId: row.sender_id,
        senderName: sender.username || 'Someone',
        senderAvatar: sender.avatar_url || null,
        preview,
        isImage: !!row.image_url
    })
}

function isOnChatPageWith(friendId) {
    try {
        if (!window.location.pathname.includes('/pages/chats/')) return false
        const params = new URLSearchParams(window.location.search)
        return params.get('friendId') === friendId
    } catch (e) {
        return false
    }
}

function buildMessagePreview(row) {
    const text = (row.content || '').trim()
    if (row.image_url && !text) return '📷 Photo'
    if (row.image_url && text) return '📷 ' + text
    if (!text) return 'New message'
    return text.length > 80 ? text.slice(0, 77) + '…' : text
}

// ============================================================
// REACTION CHANNEL — fixed with logging
// ============================================================
function setupReactionChannel() {
    if (!supabase || !currentUser) return

    if (reactionChannel) {
        supabase.removeChannel(reactionChannel)
        reactionChannel = null
    }

    console.log('📞 [callHub] Subscribing to message_reactions INSERTs')

    reactionChannel = supabase
        .channel(`reactHub:${currentUser.id}`)
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'message_reactions'
        }, (payload) => {
            console.log('📞 [callHub] message_reactions INSERT received:', payload.new)
            handleIncomingReaction(payload.new)
        })
        .subscribe((status) => {
            console.log('📞 [callHub] reaction channel status:', status)
        })
}

async function handleIncomingReaction(row) {
    try {
        if (!row || !row.message_id) return
        if (row.user_id === currentUser.id) {
            console.log('📞 [callHub] Ignoring own reaction')
            return
        }

        // Look up the message
        const { data: msg, error } = await supabase
            .from('direct_messages')
            .select('id, sender_id, receiver_id, content, image_url')
            .eq('id', row.message_id)
            .maybeSingle()

        if (error) {
            console.warn('📞 [callHub] Failed to look up message:', error.message)
            return
        }
        if (!msg) {
            console.log('📞 [callHub] No message found for id:', row.message_id)
            return
        }

        console.log('📞 [callHub] Message found. sender_id:', msg.sender_id, 'me:', currentUser.id)

        // Only show if the reacted message belongs to us AND we're not the reactor
        if (msg.sender_id !== currentUser.id) {
            console.log('📞 [callHub] Not our message — skipping')
            return
        }

        // Skip if we're already chatting with the reactor
        if (isOnChatPageWith(row.user_id)) {
            console.log('📞 [callHub] Already on chat with reactor — skipping')
            return
        }

        if (bannerVisible) {
            console.log('📞 [callHub] A call banner is active — skipping')
            return
        }

        const reactor = await getProfile(row.user_id)
        if (!reactor) {
            console.log('📞 [callHub] Could not load reactor profile')
            return
        }

        const preview = buildReactionPreview(msg)

        console.log('📞 [callHub] Showing reaction banner from', reactor.username)
        showReactionBanner({
            reactorId: row.user_id,
            reactorName: reactor.username || 'Someone',
            reactorAvatar: reactor.avatar_url || null,
            emoji: row.emoji || '❤️',
            preview
        })
    } catch (e) {
        console.warn('📞 [callHub] handleIncomingReaction error:', e)
    }
}

function buildReactionPreview(msg) {
    const text = (msg.content || '').trim()
    if (text) return text.length > 60 ? text.slice(0, 57) + '…' : text
    if (msg.image_url) return 'your photo'
    return 'your message'
}

// ============================================================
// SHARED PROFILE LOOKUP
// ============================================================
const profileCache = new Map()

async function getProfile(userId) {
    if (!userId || !supabase) return null
    if (profileCache.has(userId)) return profileCache.get(userId)

    try {
        const { data } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', userId)
            .maybeSingle()

        const result = data || null
        if (result) profileCache.set(userId, result)
        return result
    } catch {
        return null
    }
}

// ============================================================
// SWIPE-TO-DISMISS HELPER
// ============================================================
function attachSwipeDismiss(banner, onDismiss) {
    if (!banner) return

    let startX = 0
    let startY = 0
    let currentX = 0
    let dragging = false
    let decided = false

    function reset() {
        dragging = false
        decided = false
        currentX = 0
        banner.style.transition = ''
        banner.style.transform = 'translateX(-50%)'
        banner.style.opacity = '1'
    }

    function onDown(clientX, clientY) {
        // Don't start a swipe if user touched a button
        if (document.activeElement && document.activeElement !== document.body) {
            try { document.activeElement.blur() } catch (e) {}
        }
        startX = clientX
        startY = clientY
        dragging = true
        decided = false
        currentX = 0
        banner.style.transition = 'none'
    }

    function onMove(clientX, clientY) {
        if (!dragging) return

        const dx = clientX - startX
        const dy = clientY - startY

        // Decide direction once: if vertical is dominant, cancel swipe
        if (!decided) {
            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
            decided = true
            if (Math.abs(dy) > Math.abs(dx)) {
                // Vertical gesture — cancel
                dragging = false
                reset()
                return
            }
        }

        currentX = dx
        const opacity = Math.max(0.3, 1 - Math.abs(dx) / 240)
        banner.style.transform = `translateX(calc(-50% + ${dx}px))`
        banner.style.opacity = String(opacity)
    }

    function onUp() {
        if (!dragging) return
        dragging = false

        if (Math.abs(currentX) > SWIPE_DISMISS_PX) {
            // Fly out in the direction of the swipe
            const exitX = currentX > 0 ? 300 : -300
            banner.style.transition = 'transform 0.22s ease, opacity 0.22s ease'
            banner.style.transform = `translateX(calc(-50% + ${exitX}px))`
            banner.style.opacity = '0'
            setTimeout(() => {
                if (banner.parentNode) banner.remove()
                if (typeof onDismiss === 'function') onDismiss()
            }, 220)
        } else {
            // Snap back
            banner.style.transition = 'transform 0.2s ease, opacity 0.2s ease'
            banner.style.transform = 'translateX(-50%)'
            banner.style.opacity = '1'
            currentX = 0
        }
    }

    // Touch
    banner.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return
        onDown(e.touches[0].clientX, e.touches[0].clientY)
    }, { passive: true })

    banner.addEventListener('touchmove', (e) => {
        if (!dragging) return
        if (e.touches.length !== 1) return
        onMove(e.touches[0].clientX, e.touches[0].clientY)
        if (e.cancelable) e.preventDefault()
    }, { passive: false })

    banner.addEventListener('touchend', onUp)
    banner.addEventListener('touchcancel', onUp)

    // Mouse (desktop)
    banner.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return
        onDown(e.clientX, e.clientY)
    })

    window.addEventListener('mousemove', (e) => {
        if (!dragging) return
        onMove(e.clientX, e.clientY)
    })

    window.addEventListener('mouseup', () => {
        if (dragging) onUp()
    })
}

// ============================================================
// INCOMING CALL BANNER
// ============================================================
async function handleIncomingCall(callRow) {
    if (!callRow || !callRow.caller_id) return
    if (callRow.callee_id !== currentUser.id) return
    if (callRow.status !== 'ringing') return
    if (window.location.pathname.includes('/call-app/call/')) return

    const existingBanner = document.getElementById('callHubBanner')
    if (existingBanner && existingBanner.dataset.callId === String(callRow.id)) return

    const caller = await getProfile(callRow.caller_id)

    incomingCallData = {
        callId: callRow.id,
        callerId: callRow.caller_id,
        callerName: caller?.username || 'Unknown',
        callerAvatar: caller?.avatar_url || null,
        room: callRow.room_name
    }

    showBanner(incomingCallData)
    playRingtone()

    incomingCallTimeout = setTimeout(() => {
        const bannerEl = document.getElementById('callHubBanner')
        if (bannerEl) markAsMissed(bannerEl.dataset.callId)
        dismissBanner()
    }, CALL_BANNER_TIMEOUT_MS)
}

function showBanner(call) {
    clearAnyNotificationBanner()

    bannerVisible = true
    const initial = (call.callerName || '?').charAt(0).toUpperCase()

    const banner = document.createElement('div')
    banner.id = 'callHubBanner'
    banner.dataset.kind = 'call'
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
                <span>Incoming call…</span>
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

    // Attach swipe-to-dismiss
    attachSwipeDismiss(banner, () => {
        stopRingtone()
        if (incomingCallTimeout) {
            clearTimeout(incomingCallTimeout)
            incomingCallTimeout = null
        }
        const callId = banner.dataset.callId
        if (callId) markAsMissed(callId)
        bannerVisible = false
        incomingCallData = null
    })
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
        el.style.transform = 'translateX(-50%) translateY(-20px)'
        setTimeout(() => el.remove(), 180)
    }
    incomingCallData = null
}

// ============================================================
// MESSAGE BANNER
// ============================================================
function showMessageBanner(data) {
    clearAnyNotificationBanner()

    const initial = (data.senderName || '?').charAt(0).toUpperCase()

    const banner = document.createElement('div')
    banner.id = 'callHubBanner'
    banner.className = 'callHub-kind-message'
    banner.dataset.kind = 'message'
    banner.dataset.senderId = String(data.senderId)
    banner.dataset.senderName = data.senderName || ''

    banner.innerHTML = `
        <div class="callHub-avatar">
            ${data.senderAvatar ? `<img src="${data.senderAvatar}" alt="">` : `<span>${initial}</span>`}
        </div>
        <div class="callHub-info">
            <div class="callHub-name">${escapeHtml(data.senderName)}</div>
            <div class="callHub-sub callHub-sub-message">
                ${escapeHtml(data.preview)}
            </div>
        </div>
    `

    let swipeJustHappened = false

    banner.addEventListener('click', (e) => {
        if (swipeJustHappened) {
            swipeJustHappened = false
            return
        }
        e.preventDefault()
        openChatWith(data.senderId, data.senderName)
    })

    document.body.appendChild(banner)
    injectBannerStyles()

    bannerVisible = false
    messageBannerTimeout = setTimeout(() => {
        dismissNotificationBanner(banner)
    }, MESSAGE_BANNER_TIMEOUT_MS)

    attachSwipeDismiss(banner, () => {
        if (messageBannerTimeout) {
            clearTimeout(messageBannerTimeout)
            messageBannerTimeout = null
        }
    })
}

function openChatWith(friendId, friendName) {
    if (!friendId) return
    try {
        sessionStorage.setItem('currentChatFriend', JSON.stringify({
            id: friendId,
            username: friendName || 'Friend'
        }))
    } catch (e) {}

    const url = `${CHAT_APP_PATH}?friendId=${encodeURIComponent(friendId)}`
    window.location.href = url
}

// ============================================================
// REACTION BANNER
// ============================================================
function showReactionBanner(data) {
    clearAnyNotificationBanner()

    const initial = (data.reactorName || '?').charAt(0).toUpperCase()

    const banner = document.createElement('div')
    banner.id = 'callHubBanner'
    banner.className = 'callHub-kind-reaction'
    banner.dataset.kind = 'reaction'
    banner.dataset.reactorId = String(data.reactorId)
    banner.dataset.reactorName = data.reactorName || ''

    banner.innerHTML = `
        <div class="callHub-avatar">
            ${data.reactorAvatar ? `<img src="${data.reactorAvatar}" alt="">` : `<span>${initial}</span>`}
            <span class="callHub-emoji-badge">${escapeHtml(data.emoji || '❤️')}</span>
        </div>
        <div class="callHub-info">
            <div class="callHub-name">${escapeHtml(data.reactorName)} reacted ${escapeHtml(data.emoji || '')}</div>
            <div class="callHub-sub callHub-sub-reaction">
                ${escapeHtml(data.preview)}
            </div>
        </div>
    `

    let swipeJustHappened = false

    banner.addEventListener('click', (e) => {
        if (swipeJustHappened) {
            swipeJustHappened = false
            return
        }
        e.preventDefault()
        openChatWith(data.reactorId, data.reactorName)
    })

    document.body.appendChild(banner)
    injectBannerStyles()

    bannerVisible = false
    reactionBannerTimeout = setTimeout(() => {
        dismissNotificationBanner(banner)
    }, REACTION_BANNER_TIMEOUT_MS)

    attachSwipeDismiss(banner, () => {
        if (reactionBannerTimeout) {
            clearTimeout(reactionBannerTimeout)
            reactionBannerTimeout = null
        }
    })
}

function dismissNotificationBanner(el) {
    if (!el || !el.parentNode) return
    el.style.opacity = '0'
    el.style.transform = 'translateX(-50%) translateY(-20px)'
    setTimeout(() => el.remove(), 180)
    messageBannerTimeout = null
    reactionBannerTimeout = null
}

function clearAnyNotificationBanner() {
    if (messageBannerTimeout) {
        clearTimeout(messageBannerTimeout)
        messageBannerTimeout = null
    }
    if (reactionBannerTimeout) {
        clearTimeout(reactionBannerTimeout)
        reactionBannerTimeout = null
    }
    const el = document.getElementById('callHubBanner')
    if (el && el.dataset.kind !== 'call') {
        el.remove()
    }
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

// ============================================================
// BANNER STYLES
// ============================================================
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
            cursor: default;
            touch-action: pan-y;
        }

        #callHubBanner.callHub-kind-message,
        #callHubBanner.callHub-kind-reaction {
            cursor: pointer;
        }

        #callHubBanner.callHub-kind-message:hover,
        #callHubBanner.callHub-kind-reaction:hover {
            box-shadow: 0 16px 48px rgba(10, 37, 64, 0.22), 0 2px 6px rgba(10, 37, 64, 0.08);
        }

        @keyframes callHubSlideDown {
            from { opacity: 0; transform: translateX(-50%) translateY(-30px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        .callHub-avatar {
            position: relative;
            width: 48px;
            height: 48px;
            min-width: 48px;
            min-height: 48px;
            border-radius: 50%;
            background: linear-gradient(135deg, #007acc, #00b4d8);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: visible;
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
            border-radius: 50%;
        }

        .callHub-emoji-badge {
            position: absolute;
            right: -4px;
            bottom: -4px;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: #ffffff;
            border: 2px solid #e6ecf3;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            line-height: 1;
            box-shadow: 0 2px 6px rgba(10, 37, 64, 0.15);
            z-index: 2;
        }

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

        .callHub-sub-message,
        .callHub-sub-reaction {
            display: block;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
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

        .callHub-decline { background: #d93025; }

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

            .callHub-emoji-badge {
                width: 20px;
                height: 20px;
                font-size: 0.7rem;
            }

            .callHub-name { font-size: 0.94rem; }
            .callHub-sub  { font-size: 0.76rem; }

            .callHub-btn { width: 42px; height: 42px; }
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
    if (messageChannel && supabase) supabase.removeChannel(messageChannel)
    if (reactionChannel && supabase) supabase.removeChannel(reactionChannel)
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