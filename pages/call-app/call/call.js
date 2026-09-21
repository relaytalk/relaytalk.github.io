// /pages/call-app/call/call.js — call app (with in-app incoming screen)

import { initializeSupabase } from '../utils/supabase.js'
import { getRelayTalkUser, syncUserToDatabase } from '../utils/userSync.js'

let supabase
let currentUser
let currentCall
let jitsiIframe
let callRoom
let isVideoOn = false

// Incoming call state (page-level)
let pendingIncoming = null   // { callId, room, callerId, callerName, callerAvatar }

// Tab Management
const TAB_ID = Math.random().toString(36).substring(7)
const CALL_TABS_KEY = 'call_app_active_tabs'

const JAAS_APP_ID = 'vpaas-magic-cookie-16664d50d3a04e79a2876de86dcc38e4'
const JAAS_DOMAIN = '8x8.vc'

const DEFAULT_RETURN = '/pages/home/friends/index.html'

window.__callPageActive = true

// ============================================================
// RETURN URL
// ============================================================
function getReturnUrl() {
    try {
        const params = new URLSearchParams(window.location.search)
        const fromQuery = params.get('returnTo')
        if (fromQuery) return fromQuery
        const fromStorage = sessionStorage.getItem('callReturnTo')
        if (fromStorage) return fromStorage
    } catch (e) {}
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
            alert('Call is already open in another tab. This tab will close.')
            window.location.href = getReturnUrl()
            return false
        }
        activeTabs[callId] = TAB_ID
        sessionStorage.setItem(CALL_TABS_KEY, JSON.stringify(activeTabs))
        return true
    } catch (e) {
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
    } catch (e) {}
}

// ============================================================
// IN-APP INCOMING UI (created dynamically)
// ============================================================
function showInAppIncomingScreen(info) {
    const prev = document.getElementById('relayIncomingOverlay')
    if (prev) prev.remove()

    const overlay = document.createElement('div')
    overlay.id = 'relayIncomingOverlay'
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: radial-gradient(circle at 50% 35%, #0a2540 0%, #000 70%);
        display: flex; align-items: center; justify-content: center;
        animation: relayFadeIn 0.25s ease-out;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `

    const initial = (info.callerName || '?').charAt(0).toUpperCase()
    const avatarHtml = info.callerAvatar
        ? `<img src="${info.callerAvatar}" alt="" style="width:110px;height:110px;border-radius:50%;object-fit:cover;border:3px solid #f5b342;display:block;">`
        : `<div style="width:110px;height:110px;border-radius:50%;background:#f5b342;display:flex;align-items:center;justify-content:center;font-size:48px;font-weight:600;color:#0a2540;">${initial}</div>`

    overlay.innerHTML = `
        <style>
            @keyframes relayFadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes relayPulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.06) } }
            #relayIncomingOverlay .ri-actions { display: flex; gap: 40px; justify-content: center; margin-top: 50px; }
            #relayIncomingOverlay .ri-btn {
                width: 76px; height: 76px; border-radius: 50%; border: none;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; font-size: 28px; color: #fff;
                transition: transform 0.2s ease, background 0.2s ease;
                box-shadow: 0 10px 26px rgba(0,0,0,0.45);
            }
            #relayIncomingOverlay .ri-decline { background: #dc3545; }
            #relayIncomingOverlay .ri-decline:hover { background: #c82333; }
            #relayIncomingOverlay .ri-accept { background: #28a745; animation: relayPulse 1.6s infinite; }
            #relayIncomingOverlay .ri-accept:hover { background: #218838; }
            #relayIncomingOverlay .ri-btn:active { transform: scale(0.94); }
        </style>

        <div style="text-align:center;padding:20px;max-width:420px;width:100%;">
            <div style="margin-bottom:24px;display:flex;justify-content:center;">
                ${avatarHtml}
            </div>
            <h2 style="font-size:28px;color:#fff;margin-bottom:8px;font-weight:500;">
                ${info.callerName || 'Incoming Call'}
            </h2>
            <p style="color:#aab;font-size:15px;margin-bottom:0;">
                Incoming call · RelayTalk
            </p>
            <div class="ri-actions">
                <button class="ri-btn ri-decline" id="relayDeclineBtn" aria-label="Decline">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8 10a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.574 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                </button>
                <button class="ri-btn ri-accept" id="relayAcceptBtn" aria-label="Accept">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8 10a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.574 2.81.7A2 2 0 0 1 22 16.92z"></path>
                    </svg>
                </button>
            </div>
        </div>
    `

    document.body.appendChild(overlay)

    document.getElementById('relayAcceptBtn').onclick = () => handleIncomingAccept()
    document.getElementById('relayDeclineBtn').onclick = () => handleIncomingDecline()

    // Ring tone via Web Audio
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (Ctx) {
            const ctx = new Ctx()
            const beep = () => {
                const osc = ctx.createOscillator()
                const gain = ctx.createGain()
                osc.type = 'sine'
                osc.frequency.value = 480
                gain.gain.value = 0.0001
                osc.connect(gain); gain.connect(ctx.destination)
                const t = ctx.currentTime
                gain.gain.exponentialRampToValueAtTime(0.15, t + 0.05)
                gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
                osc.start(t); osc.stop(t + 0.6)
            }
            beep()
            overlay.__ringTimer = setInterval(beep, 1400)
            overlay.__ringCtx = ctx
        }
    } catch (e) {}
}

function stopInAppRinging() {
    const overlay = document.getElementById('relayIncomingOverlay')
    if (!overlay) return
    if (overlay.__ringTimer) clearInterval(overlay.__ringTimer)
    if (overlay.__ringCtx) try { overlay.__ringCtx.close() } catch (e) {}
}

function hideInAppIncomingScreen() {
    stopInAppRinging()
    const overlay = document.getElementById('relayIncomingOverlay')
    if (overlay) overlay.remove()
}

// ============================================================
// INIT
// ============================================================
async function initCall() {
    const returnUrl = getReturnUrl()
    window.__callReturnUrl = returnUrl

    if (!registerTab()) return

    try {
        const relayUser = getRelayTalkUser()
        if (!relayUser) {
            showError('Please login to RelayTalk first')
            return
        }

        supabase = await initializeSupabase()
        currentUser = await syncUserToDatabase(supabase, relayUser)

        const params = new URLSearchParams(window.location.search)
        const friendId = params.get('friendId')
        const friendName = params.get('friendName')
        const incoming = params.get('incoming')
        const roomName = params.get('room')
        const callerId = params.get('callerId')
        const callId = params.get('callId')
        const callerName = params.get('callerName')
        const callerAvatar = params.get('callerAvatar')

        window.addEventListener('storage', handleStorageEvent)
        window.addEventListener('beforeunload', handleBeforeUnload)

        if (incoming === 'true' && roomName && callId) {
            pendingIncoming = { callId, room: roomName, callerId, callerName, callerAvatar }
            document.getElementById('loadingScreen').style.display = 'none'
            showInAppIncomingScreen({
                callId, room: roomName, callerId,
                callerName: callerName || 'Someone',
                callerAvatar: callerAvatar || ''
            })
        } else if (friendId) {
            await startOutgoingCall(friendId, friendName)
        } else {
            document.getElementById('loadingText').textContent = 'Ready'
            setTimeout(() => {
                const ls = document.getElementById('loadingScreen')
                if (ls) ls.style.display = 'none'
            }, 400)
        }
    } catch (error) {
        console.error('Init error:', error)
        showError('Failed to initialize call')
    }
}

function handleStorageEvent(e) {
    if (e.key === CALL_TABS_KEY) {
        const tabs = JSON.parse(e.newValue || '{}')
        const params = new URLSearchParams(window.location.search)
        const callId = params.get('callId') || 'new-call'
        if (tabs[callId] && tabs[callId] !== TAB_ID) {
            endCall(true)
        }
    }
}

function handleBeforeUnload() {
    window.__callPageActive = false
    unregisterTab()
}

// ============================================================
// ROOM CREATION
// ============================================================
async function createCallRoom() {
    const uniqueRoomName = `CallApp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    const fullRoomName = `${JAAS_APP_ID}/${uniqueRoomName}`
    return {
        name: fullRoomName,
        url: `https://${JAAS_DOMAIN}/${fullRoomName}`,
        id: uniqueRoomName
    }
}

// ============================================================
// OUTGOING CALL
// ============================================================
async function startOutgoingCall(friendId, friendName) {
    try {
        document.getElementById('loadingText').textContent = `Calling ${friendName}...`
        callRoom = await createCallRoom()

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

        const { data: call, error } = await supabase
            .from('calls')
            .insert([callData])
            .select()
            .single()

        if (error) throw new Error('Database error: ' + error.message)

        currentCall = call
        document.getElementById('loadingText').textContent = `Waiting for ${friendName} to answer...`
        setupCallListener(call.id)
    } catch (error) {
        console.error('Call error:', error)
        showError('Failed to start call: ' + error.message)
    }
}

// ============================================================
// IN-APP ACCEPT / DECLINE
// ============================================================
async function handleIncomingAccept() {
    if (!pendingIncoming) return
    stopInAppRinging()

    const info = pendingIncoming
    pendingIncoming = null

    try {
        currentCall = { id: info.callId, room_name: info.room }

        await supabase
            .from('calls')
            .update({ status: 'active', answered_at: new Date().toISOString(), seen: true })
            .eq('id', info.callId)

        hideInAppIncomingScreen()

        document.getElementById('loadingScreen').style.display = 'flex'
        document.getElementById('loadingText').textContent = 'Connecting...'

        await joinCall(info.room)
    } catch (e) {
        console.error('Accept error:', e)
        showError('Failed to accept call')
    }
}

async function handleIncomingDecline() {
    const info = pendingIncoming
    pendingIncoming = null

    hideInAppIncomingScreen()

    try {
        if (info && supabase) {
            await supabase
                .from('calls')
                .update({ status: 'rejected', ended_at: new Date().toISOString(), seen: true })
                .eq('id', info.callId)
        }
    } catch (e) {
        console.warn('Decline update failed:', e)
    }

    unregisterTab()
    window.location.href = window.__callReturnUrl || getReturnUrl()
}

// ============================================================
// CALL STATUS LISTENER (outgoing only)
// ============================================================
function setupCallListener(callId) {
    supabase
        .channel(`call-${callId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'calls',
            filter: `id=eq.${callId}`
        }, (payload) => {
            const status = payload.new.status
            if (status === 'active') {
                const loadingText = document.getElementById('loadingText')
                if (loadingText) loadingText.textContent = 'Connecting...'
                joinCall(payload.new.room_name)
            } else if (status === 'rejected') {
                showCallEnded('Call was rejected')
            } else if (status === 'cancelled') {
                showCallEnded('Call was cancelled')
            } else if (status === 'ended') {
                showCallEnded('Call ended')
            }
        })
        .subscribe()
}

// ============================================================
// JOIN JITSI
// ============================================================
async function joinCall(roomName) {
    try {
        document.getElementById('loadingScreen').style.display = 'flex'
        document.getElementById('loadingText').textContent = 'Connecting...'

        const container = document.getElementById('dailyContainer')
        container.innerHTML = ''

        const wrapper = document.createElement('div')
        wrapper.style.cssText = 'width:100%;height:100%;position:relative;overflow:hidden;background:#000'

        const iframe = document.createElement('iframe')
        iframe.allow = 'microphone; camera; autoplay; display-capture; fullscreen'
        iframe.sandbox = 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals'
        iframe.style.cssText = 'width:100%;height:100%;border:none;background:#000'
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
            userInfo: { displayName: currentUser.username }
        }

        const configParam = encodeURIComponent(JSON.stringify(config))
        iframe.src = `${baseUrl}#config=${configParam}`

        wrapper.appendChild(iframe)
        container.appendChild(wrapper)
        jitsiIframe = iframe

        const style = document.createElement('style')
        style.textContent = `
            .prejoin-screen, .welcome-page, .join-dialog,
            [class*="toolbar"], [class*="Toolbar"],
            [class*="watermark"], [class*="Watermark"] { display: none !important; }
            video { object-fit: cover !important; width: 100% !important; height: 100% !important; }
        `
        wrapper.appendChild(style)

        iframe.onload = function() {
            const joinInterval = setInterval(() => {
                try {
                    const iframeDoc = iframe.contentWindow.document
                    const selectors = [
                        '[data-testid="prejoin.joinButton"]',
                        '.prejoin-input-area button',
                        '.join-button'
                    ]
                    for (const selector of selectors) {
                        const btn = iframeDoc.querySelector(selector)
                        if (btn) { btn.click(); clearInterval(joinInterval); break }
                    }
                } catch(e) {}
            }, 1000)
            setTimeout(() => clearInterval(joinInterval), 10000)
        }

        setTimeout(() => {
            document.getElementById('loadingScreen').style.display = 'none'
            addHangButton()
        }, 3000)
    } catch (error) {
        console.error('Join error:', error)
        showError('Failed to join call: ' + error.message)
    }
}

// ============================================================
// HANG UP BUTTON
// ============================================================
function addHangButton() {
    const existing = document.getElementById('hangUpBtn')
    if (existing) existing.remove()

    const hangBtn = document.createElement('button')
    hangBtn.id = 'hangUpBtn'
    hangBtn.className = 'hang-up-btn'
    hangBtn.setAttribute('aria-label', 'Hang up')
    hangBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8 10a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.574 2.81.7A2 2 0 0 1 22 16.92z"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
    `
    hangBtn.onclick = hangUp
    document.body.appendChild(hangBtn)
}

window.hangUp = async function() {
    const hangBtn = document.getElementById('hangUpBtn')
    if (hangBtn) { hangBtn.style.transform = 'scale(0.9)'; hangBtn.style.opacity = '0.7' }
    setTimeout(() => endCall(false), 150)
}

window.endCall = async function(silent = false) {
    if (currentCall && supabase && !silent) {
        await supabase
            .from('calls')
            .update({ status: 'ended', ended_at: new Date().toISOString() })
            .eq('id', currentCall.id)
    }
    unregisterTab()
    window.location.href = window.__callReturnUrl || getReturnUrl()
}

// ============================================================
// CONTROLS
// ============================================================
window.toggleVideo = function() {
    const btn = document.getElementById('videoBtn')
    isVideoOn = !isVideoOn
    if (isVideoOn) {
        btn.innerHTML = '<i class="fas fa-video"></i>'
        btn.style.background = '#007acc'; btn.style.color = 'white'
    } else {
        btn.innerHTML = '<i class="fas fa-video-slash"></i>'
        btn.style.background = '#f1f5f9'; btn.style.color = '#007acc'
    }
    if (jitsiIframe) try {
        jitsiIframe.contentWindow.postMessage({ type: 'setVideoMuted', muted: !isVideoOn }, '*')
    } catch(e) {}
}

window.toggleMute = function() {
    const btn = document.getElementById('muteBtn')
    btn.classList.toggle('muted')
    btn.innerHTML = btn.classList.contains('muted')
        ? '<i class="fas fa-microphone-slash"></i>'
        : '<i class="fas fa-microphone"></i>'
    if (jitsiIframe) try {
        jitsiIframe.contentWindow.postMessage({ type: 'muteAudio', muted: btn.classList.contains('muted') }, '*')
    } catch(e) {}
}

window.toggleSpeaker = function() {
    const btn = document.getElementById('speakerBtn')
    btn.classList.toggle('speaker-off')
    btn.innerHTML = btn.classList.contains('speaker-off')
        ? '<i class="fas fa-volume-mute"></i>'
        : '<i class="fas fa-volume-up"></i>'
}

window.cancelCall = async function() {
    if (currentCall && supabase) {
        await supabase
            .from('calls')
            .update({ status: 'cancelled', ended_at: new Date().toISOString() })
            .eq('id', currentCall.id)
    }
    unregisterTab()
    window.location.href = window.__callReturnUrl || getReturnUrl()
}

// ============================================================
// ENDED / ERROR
// ============================================================
function showCallEnded(message) {
    document.getElementById('loadingScreen').style.display = 'flex'
    document.getElementById('loadingText').textContent = message
    setTimeout(() => {
        window.location.href = window.__callReturnUrl || getReturnUrl()
    }, 2000)
}

function showError(message) {
    document.getElementById('loadingScreen').style.display = 'none'
    document.getElementById('errorScreen').style.display = 'flex'
    document.getElementById('errorMessage').textContent = message
}

// ============================================================
// LIVE INCOMING CALL EVENT (dispatched by native-init.js when the
// app is already on this page and a new call arrives)
// ============================================================
window.addEventListener('relay:incoming-call', (e) => {
    const data = e.detail || {}
    console.log('[call] relay:incoming-call event:', data)

    if (!data.room || !data.callId) return
    if (pendingIncoming || currentCall) return

    pendingIncoming = {
        callId: data.callId,
        room: data.room,
        callerId: data.callerId,
        callerName: data.callerName,
        callerAvatar: data.callerAvatar
    }

    const ls = document.getElementById('loadingScreen')
    if (ls) ls.style.display = 'none'

    showInAppIncomingScreen({
        callId: data.callId,
        room: data.room,
        callerId: data.callerId,
        callerName: data.callerName || 'Someone',
        callerAvatar: data.callerAvatar || ''
    })
})

initCall()