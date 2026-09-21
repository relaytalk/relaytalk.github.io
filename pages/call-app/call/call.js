// /pages/call-app/call/call.js — call app (with incoming call support)

import { initializeSupabase } from '../utils/supabase.js'
import { getRelayTalkUser, syncUserToDatabase } from '../utils/userSync.js'

let supabase
let currentUser
let currentCall
let jitsiIframe
let callRoom
let isVideoOn = false

// Incoming call state
let incomingCallRow = null
let incomingCallChannel = null

// Tab Management
const TAB_ID = Math.random().toString(36).substring(7)
const CALL_TABS_KEY = 'call_app_active_tabs'

const JAAS_APP_ID = 'vpaas-magic-cookie-16664d50d3a04e79a2876de86dcc38e4'
const JAAS_DOMAIN = '8x8.vc'

const DEFAULT_RETURN = '/pages/home/friends/index.html'

// ============================================================
// RETURN URL RESOLUTION
// ============================================================
function getReturnUrl() {
    try {
        const params = new URLSearchParams(window.location.search)
        const fromQuery = params.get('returnTo')
        if (fromQuery) {
            console.log('📞 [call] Return URL from query:', fromQuery)
            return fromQuery
        }

        const fromStorage = sessionStorage.getItem('callReturnTo')
        if (fromStorage) {
            console.log('📞 [call] Return URL from sessionStorage:', fromStorage)
            return fromStorage
        }
    } catch (e) {
        console.warn('📞 [call] Could not resolve return URL:', e)
    }

    console.log('📞 [call] Return URL fallback:', DEFAULT_RETURN)
    return DEFAULT_RETURN
}

// ============================================================
// TAB MANAGEMENT
// ============================================================
function registerTab() {
    try {
        const activeTabs = JSON.parse(sessionStorage.getItem(CALL_TABS_KEY) || '{}')
        const params = new URLSearchParams(window.location.search)
        const callId = params.get('callId') || 'new-call'

        if (activeTabs[callId] && activeTabs[callId] !== TAB_ID) {
            console.log('⚠️ Another tab already active for this call, closing...')
            alert('Call is already open in another tab. This tab will close.')
            window.location.href = getReturnUrl()
            return false
        }

        activeTabs[callId] = TAB_ID
        sessionStorage.setItem(CALL_TABS_KEY, JSON.stringify(activeTabs))
        return true
    } catch (e) {
        console.log('Tab registration error:', e)
        return true
    }
}

function unregisterTab() {
    try {
        const activeTabs = JSON.parse(sessionStorage.getItem(CALL_TABS_KEY) || '{}')
        const params = new URLSearchParams(window.location.search)
        const callId = params.get('callId') || 'new-call'
        delete activeTabs[callId]
        sessionStorage.setItem(CALL_TABS_KEY, JSON.stringify(activeTabs))
    } catch (e) {
        console.log('Tab unregistration error:', e)
    }
}

// ============================================================
// INIT
// ============================================================
async function initCall() {
    console.log('📞 Initializing call...')

    const returnUrl = getReturnUrl()
    console.log('📞 [call] Using return URL:', returnUrl)
    window.__callReturnUrl = returnUrl

    if (!registerTab()) return

    try {
        const relayUser = getRelayTalkUser()
        if (!relayUser) {
            showError('Please login to RelayTalk first')
            return
        }

        console.log('✅ Got user:', relayUser.email)

        supabase = await initializeSupabase()
        currentUser = await syncUserToDatabase(supabase, relayUser)

        const params = new URLSearchParams(window.location.search)
        const friendId = params.get('friendId')
        const friendName = params.get('friendName')
        const incoming = params.get('incoming')
        const roomName = params.get('room')
        const callerId = params.get('callerId')
        const callId = params.get('callId')

        console.log('📞 Call params:', { friendId, friendName, incoming, roomName, callerId, callId })

        window.addEventListener('storage', handleStorageEvent)
        window.addEventListener('beforeunload', handleBeforeUnload)

        if (incoming === 'true' && roomName && callerId && callId) {
            await handleIncomingCall(roomName, callerId, callId)
        } else if (friendId) {
            await startOutgoingCall(friendId, friendName)
            // Also start watching for incoming calls while idle on this page
            startIncomingCallWatcher()
        } else {
            // No explicit params — treat as idle call page, watch for incoming
            document.getElementById('loadingText').textContent = 'Ready'
            setTimeout(() => {
                const ls = document.getElementById('loadingScreen')
                if (ls) ls.style.display = 'none'
            }, 400)
            startIncomingCallWatcher()
        }
    } catch (error) {
        console.error('❌ Init error:', error)
        showError('Failed to initialize call')
    }
}

function handleStorageEvent(e) {
    if (e.key === CALL_TABS_KEY) {
        const tabs = JSON.parse(e.newValue || '{}')
        const params = new URLSearchParams(window.location.search)
        const callId = params.get('callId') || 'new-call'

        if (tabs[callId] && tabs[callId] !== TAB_ID) {
            console.log('⚠️ Another tab opened this call, closing...')
            alert('Call was opened in another tab. This tab will close.')
            endCall(true)
        }
    }
}

function handleBeforeUnload() {
    unregisterTab()
}

// ============================================================
// ROOM CREATION
// ============================================================
async function createCallRoom() {
    try {
        const uniqueRoomName = `CallApp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
        const fullRoomName = `${JAAS_APP_ID}/${uniqueRoomName}`

        console.log('🎯 Creating room:', fullRoomName)

        return {
            name: fullRoomName,
            url: `https://${JAAS_DOMAIN}/${fullRoomName}`,
            id: uniqueRoomName
        }
    } catch (error) {
        console.error('❌ Error creating room:', error)
        throw error
    }
}

// ============================================================
// OUTGOING CALL
// ============================================================
async function startOutgoingCall(friendId, friendName) {
    try {
        document.getElementById('loadingText').textContent = `Calling ${friendName}...`
        console.log('1️⃣ Starting outgoing call to:', friendId, friendName)

        callRoom = await createCallRoom()
        console.log('2️⃣ Room created:', callRoom)

        const callData = {
            caller_id: currentUser.id,
            receiver_id: friendId,
            callee_id: friendId,
            room_name: callRoom.name,
            room_url: callRoom.url,
            status: 'ringing',
            seen: false,
            created_at: new Date().toISOString()
        }

        console.log('3️⃣ Call data:', callData)

        const { data: call, error } = await supabase
            .from('calls')
            .insert([callData])
            .select()
            .single()

        if (error) {
            console.error('❌ Supabase error:', error)
            throw new Error('Database error: ' + error.message)
        }

        console.log('4️⃣ ✅ Call inserted:', call)

        currentCall = call
        document.getElementById('loadingText').textContent = `Waiting for ${friendName} to answer...`
        setupCallListener(call.id)
    } catch (error) {
        console.error('❌ Call error:', error)
        showError('Failed to start call: ' + error.message)
    }
}

// ============================================================
// INCOMING CALL — direct handoff (URL params)
// ============================================================
async function handleIncomingCall(roomName, callerId, callId) {
    try {
        console.log('📞 Handling incoming call (handoff):', { roomName, callerId, callId })
        document.getElementById('loadingText').textContent = 'Connecting...'

        currentCall = { id: callId, room_name: roomName }

        await supabase
            .from('calls')
            .update({ status: 'active', answered_at: new Date().toISOString(), seen: true })
            .eq('id', callId)

        await joinCall(roomName)
    } catch (error) {
        console.error('❌ Incoming call error:', error)
        showError('Failed to accept call')
    }
}

// ============================================================
// INCOMING CALL WATCHER (live, while on call page)
// ============================================================
function startIncomingCallWatcher() {
    if (incomingCallChannel) return

    console.log('👂 Watching for incoming calls for user:', currentUser.id)

    incomingCallChannel = supabase
        .channel(`incoming-calls-${currentUser.id}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'calls',
            filter: `receiver_id=eq.${currentUser.id}`
        }, (payload) => {
            const row = payload.new
            if (!row) return
            if (row.status !== 'ringing') return
            if (currentCall) return  // already in a call
            if (incomingCallRow) return // already showing one

            console.log('📥 Incoming call detected:', row)
            showIncomingCallUI(row)
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'calls',
            filter: `receiver_id=eq.${currentUser.id}`
        }, (payload) => {
            const row = payload.new
            if (!row || !incomingCallRow) return
            if (row.id !== incomingCallRow.id) return

            if (row.status === 'cancelled' || row.status === 'ended') {
                console.log('📴 Caller cancelled before we answered')
                hideIncomingCallUI()
            }
        })
        .subscribe((status) => {
            console.log('Incoming watcher status:', status)
        })
}

function showIncomingCallUI(callRow) {
    incomingCallRow = callRow

    // Try to render caller name / avatar
    const nameEl = document.getElementById('callerName')
    const avatarEl = document.getElementById('callerAvatar')

    // Show placeholder immediately
    if (nameEl) nameEl.textContent = 'Incoming Call'
    if (avatarEl) {
        avatarEl.innerHTML = '<i class="fas fa-user-circle"></i>'
    }

    // Play a simple ring using the Web Audio API (no asset needed)
    playRingTone()

    // Look up caller profile
    ;(async () => {
        try {
            const { data: prof } = await supabase
                .from('profiles')
                .select('username, full_name, avatar_url')
                .eq('id', callRow.caller_id)
                .maybeSingle()

            if (prof) {
                if (nameEl) nameEl.textContent = prof.full_name || prof.username || 'Incoming Call'
                if (avatarEl && prof.avatar_url) {
                    avatarEl.innerHTML = `<img src="${prof.avatar_url}" alt="">`
                }
            }
        } catch (e) {
            console.warn('Could not load caller profile:', e)
        }
    })()

    const screen = document.getElementById('incomingCallScreen')
    if (screen) screen.style.display = 'flex'
}

function hideIncomingCallUI() {
    stopRingTone()
    incomingCallRow = null
    const screen = document.getElementById('incomingCallScreen')
    if (screen) screen.style.display = 'none'
}

// Simple ring tone via Web Audio
let ringCtx = null
let ringTimer = null

function playRingTone() {
    try {
        stopRingTone()
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (!Ctx) return
        ringCtx = new Ctx()

        const beep = () => {
            if (!ringCtx) return
            const osc = ringCtx.createOscillator()
            const gain = ringCtx.createGain()
            osc.type = 'sine'
            osc.frequency.value = 480
            gain.gain.value = 0.0001
            osc.connect(gain)
            gain.connect(ringCtx.destination)
            const t = ringCtx.currentTime
            gain.gain.exponentialRampToValueAtTime(0.15, t + 0.05)
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
            osc.start(t)
            osc.stop(t + 0.6)
        }

        beep()
        ringTimer = setInterval(beep, 1400)
    } catch (e) {
        console.warn('Ring tone error:', e)
    }
}

function stopRingTone() {
    try {
        if (ringTimer) { clearInterval(ringTimer); ringTimer = null }
        if (ringCtx) { ringCtx.close(); ringCtx = null }
    } catch (e) {}
}

// ============================================================
// ACCEPT / DECLINE (called from the incoming UI)
// ============================================================
window.acceptCall = async function () {
    if (!incomingCallRow) return
    stopRingTone()

    const row = incomingCallRow
    incomingCallRow = null

    const screen = document.getElementById('incomingCallScreen')
    if (screen) screen.style.display = 'none'

    try {
        currentCall = { id: row.id, room_name: row.room_name }

        await supabase
            .from('calls')
            .update({ status: 'active', answered_at: new Date().toISOString(), seen: true })
            .eq('id', row.id)

        document.getElementById('loadingScreen').style.display = 'flex'
        document.getElementById('loadingText').textContent = 'Connecting...'

        await joinCall(row.room_name)
    } catch (e) {
        console.error('Accept error:', e)
        showError('Failed to accept call')
    }
}

window.declineCall = async function () {
    stopRingTone()

    const row = incomingCallRow
    incomingCallRow = null

    const screen = document.getElementById('incomingCallScreen')
    if (screen) screen.style.display = 'none'

    try {
        if (row) {
            await supabase
                .from('calls')
                .update({ status: 'rejected', ended_at: new Date().toISOString(), seen: true })
                .eq('id', row.id)
        }
    } catch (e) {
        console.warn('Decline error:', e)
    }
    // stay on page — user can receive another call
}

// ============================================================
// CALL STATUS LISTENER (for outgoing call we initiated)
// ============================================================
function setupCallListener(callId) {
    console.log('5️⃣ Setting up call listener for ID:', callId)

    supabase
        .channel(`call-${callId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'calls',
            filter: `id=eq.${callId}`
        }, (payload) => {
            console.log('📞 Call update received:', payload.new.status)

            if (payload.new.status === 'active') {
                const loadingText = document.getElementById('loadingText')
                if (loadingText) loadingText.textContent = 'Connecting...'
                joinCall(payload.new.room_name)
            } else if (payload.new.status === 'rejected') {
                showCallEnded('Call was rejected')
            } else if (payload.new.status === 'cancelled') {
                showCallEnded('Call was cancelled')
            } else if (payload.new.status === 'ended') {
                showCallEnded('Call ended')
            }
        })
        .subscribe((status) => {
            console.log('Call listener subscription status:', status)
        })
}

// ============================================================
// JOIN JITSI
// ============================================================
async function joinCall(roomName) {
    try {
        console.log('6️⃣ Joining Jitsi call room:', roomName)

        document.getElementById('loadingScreen').style.display = 'flex'
        document.getElementById('loadingText').textContent = 'Connecting...'

        const container = document.getElementById('dailyContainer')
        container.innerHTML = ''

        const wrapper = document.createElement('div')
        wrapper.style.width = '100%'
        wrapper.style.height = '100%'
        wrapper.style.position = 'relative'
        wrapper.style.overflow = 'hidden'
        wrapper.style.background = '#000'

        const iframe = document.createElement('iframe')
        iframe.allow = 'microphone; camera; autoplay; display-capture; fullscreen'
        iframe.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals'
        iframe.style.width = '100%'
        iframe.style.height = '100%'
        iframe.style.border = 'none'
        iframe.style.background = '#000'
        iframe.allowFullscreen = true

        const baseUrl = `https://${JAAS_DOMAIN}/${roomName}`
        const config = {
            configOverwrite: {
                prejoinPageEnabled: false,
                enableWelcomePage: false,
                startWithAudioMuted: false,
                startWithVideoMuted: true,
                disableChat: true,
                disableInviteFunctions: true,
                toolbarButtons: [],
                hideConferenceTimer: true,
                hideParticipantsStats: true,
                hideLogo: true,
                hideWatermark: true
            },
            interfaceConfigOverwrite: {
                TOOLBAR_BUTTONS: [],
                SHOW_JITSI_WATERMARK: false,
                SHOW_WATERMARK_FOR_GUESTS: false,
                VIDEO_LAYOUT_FIT: 'cover'
            },
            userInfo: {
                displayName: currentUser.username
            }
        }

        const configParam = encodeURIComponent(JSON.stringify(config))
        const url = `${baseUrl}#config=${configParam}`
        iframe.src = url
        console.log('8️⃣ Iframe URL:', url)

        wrapper.appendChild(iframe)
        container.appendChild(wrapper)
        jitsiIframe = iframe

        const style = document.createElement('style')
        style.textContent = `
            .prejoin-screen, .welcome-page, .join-dialog,
            [class*="toolbar"], [class*="Toolbar"],
            [class*="watermark"], [class*="Watermark"] {
                display: none !important;
            }
            video {
                object-fit: cover !important;
                width: 100% !important;
                height: 100% !important;
            }
        `
        wrapper.appendChild(style)

        iframe.onload = function() {
            console.log('Iframe loaded, auto-joining...')

            const joinInterval = setInterval(() => {
                try {
                    const iframeDoc = iframe.contentWindow.document

                    const joinSelectors = [
                        '[data-testid="prejoin.joinButton"]',
                        '.prejoin-input-area button',
                        '.join-button',
                        'button:contains("Join")'
                    ]

                    for (const selector of joinSelectors) {
                        const btn = iframeDoc.querySelector(selector)
                        if (btn) {
                            console.log('Clicking join button')
                            btn.click()
                            clearInterval(joinInterval)
                            break
                        }
                    }
                } catch(e) {}
            }, 1000)

            setTimeout(() => clearInterval(joinInterval), 10000)
        }

        setTimeout(() => {
            document.getElementById('loadingScreen').style.display = 'none'
            addHangButton()
        }, 3000)

        console.log('✅ Jitsi call connected!')
    } catch (error) {
        console.error('❌ Join error:', error)
        showError('Failed to join call: ' + error.message)
    }
}

// ============================================================
// HANG UP BUTTON
// ============================================================
function addHangButton() {
    const existingBtn = document.getElementById('hangUpBtn')
    if (existingBtn) existingBtn.remove()

    const hangBtn = document.createElement('button')
    hangBtn.id = 'hangUpBtn'
    hangBtn.className = 'hang-up-btn'
    hangBtn.setAttribute('aria-label', 'Hang up call')
    hangBtn.setAttribute('title', 'Hang up')

    const svgIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8 10a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.574 2.81.7A2 2 0 0 1 22 16.92z"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
    `

    hangBtn.innerHTML = svgIcon
    hangBtn.onclick = hangUp

    document.body.appendChild(hangBtn)
}

window.hangUp = async function() {
    console.log('🔴 Hanging up call...')

    const hangBtn = document.getElementById('hangUpBtn')
    if (hangBtn) {
        hangBtn.style.transform = 'scale(0.9)'
        hangBtn.style.opacity = '0.7'
    }

    setTimeout(async () => {
        await endCall(false)
    }, 150)
}

window.endCall = async function(silent = false) {
    console.log('Ending call...')

    if (currentCall && supabase && !silent) {
        await supabase
            .from('calls')
            .update({ status: 'ended', ended_at: new Date().toISOString() })
            .eq('id', currentCall.id)
    }

    unregisterTab()

    const returnUrl = window.__callReturnUrl || getReturnUrl()
    console.log('📞 [call] Redirecting to:', returnUrl)
    window.location.href = returnUrl
}

// ============================================================
// CONTROLS
// ============================================================
window.toggleVideo = function() {
    const btn = document.getElementById('videoBtn')
    isVideoOn = !isVideoOn

    if (isVideoOn) {
        btn.innerHTML = '<i class="fas fa-video"></i>'
        btn.style.background = '#007acc'
        btn.style.color = 'white'
    } else {
        btn.innerHTML = '<i class="fas fa-video-slash"></i>'
        btn.style.background = '#f1f5f9'
        btn.style.color = '#007acc'
    }

    if (jitsiIframe) {
        try {
            jitsiIframe.contentWindow.postMessage({ type: 'setVideoMuted', muted: !isVideoOn }, '*')
        } catch(e) {}
    }
}

window.toggleMute = function() {
    const btn = document.getElementById('muteBtn')
    btn.classList.toggle('muted')
    btn.innerHTML = btn.classList.contains('muted')
        ? '<i class="fas fa-microphone-slash"></i>'
        : '<i class="fas fa-microphone"></i>'

    if (jitsiIframe) {
        try {
            jitsiIframe.contentWindow.postMessage({ type: 'muteAudio', muted: btn.classList.contains('muted') }, '*')
        } catch(e) {}
    }
}

window.toggleSpeaker = function() {
    const btn = document.getElementById('speakerBtn')
    btn.classList.toggle('speaker-off')
    btn.innerHTML = btn.classList.contains('speaker-off')
        ? '<i class="fas fa-volume-mute"></i>'
        : '<i class="fas fa-volume-up"></i>'
}

window.cancelCall = async function() {
    if (currentCall) {
        await supabase
            .from('calls')
            .update({ status: 'cancelled', ended_at: new Date().toISOString() })
            .eq('id', currentCall.id)
    }

    unregisterTab()

    const returnUrl = window.__callReturnUrl || getReturnUrl()
    console.log('📞 [call] Cancelling → redirecting to:', returnUrl)
    window.location.href = returnUrl
}

// ============================================================
// ENDED / ERROR
// ============================================================
function showCallEnded(message) {
    document.getElementById('loadingScreen').style.display = 'flex'
    document.getElementById('loadingText').textContent = message

    setTimeout(() => {
        const returnUrl = window.__callReturnUrl || getReturnUrl()
        console.log('📞 [call] Call ended → redirecting to:', returnUrl)
        window.location.href = returnUrl
    }, 2000)
}

function showError(message) {
    document.getElementById('loadingScreen').style.display = 'none'
    document.getElementById('errorScreen').style.display = 'flex'
    document.getElementById('errorMessage').textContent = message
}

initCall()