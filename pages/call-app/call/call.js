// /pages/call-app/call/call.js - COMPLETE FINAL VERSION WITH BEAUTIFUL HANG BUTTON

import { initializeSupabase } from '/pages/call-app/utils/supabase.js'
import { getRelayTalkUser, syncUserToDatabase } from '/pages/call-app/utils/userSync.js'

let supabase
let currentUser
let currentCall
let jitsiIframe
let callRoom
let isVideoOn = false

// Tab Management
const TAB_ID = Math.random().toString(36).substring(7)
const CALL_TABS_KEY = 'call_app_active_tabs'

const JAAS_APP_ID = 'vpaas-magic-cookie-16664d50d3a04e79a2876de86dcc38e4'
const JAAS_DOMAIN = '8x8.vc'

// Register this tab
function registerTab() {
    try {
        const activeTabs = JSON.parse(sessionStorage.getItem(CALL_TABS_KEY) || '{}')
        const params = new URLSearchParams(window.location.search)
        const callId = params.get('callId') || 'new-call'

        if (activeTabs[callId] && activeTabs[callId] !== TAB_ID) {
            console.log('⚠️ Another tab already active for this call, closing...')
            alert('Call is already open in another tab. This tab will close.')
            window.close()
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

// Remove tab registration
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

async function initCall() {
    console.log('📞 Initializing call...')

    // Register tab first
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

        // Listen for storage events
        window.addEventListener('storage', handleStorageEvent)
        window.addEventListener('beforeunload', handleBeforeUnload)

        if (incoming === 'true' && roomName && callerId && callId) {
            await handleIncomingCall(roomName, callerId, callId)
        } else if (friendId) {
            await startOutgoingCall(friendId, friendName)
        } else {
            showError('No call information provided')
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

function handleBeforeUnload(event) {
    unregisterTab()
}

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

async function handleIncomingCall(roomName, callerId, callId) {
    try {
        console.log('📞 Handling incoming call:', { roomName, callerId, callId })
        document.getElementById('loadingText').textContent = 'Connecting...'

        currentCall = { id: callId, room_name: roomName }

        await supabase
            .from('calls')
            .update({ status: 'active', answered_at: new Date().toISOString() })
            .eq('id', callId)

        await joinCall(roomName)

    } catch (error) {
        console.error('❌ Incoming call error:', error)
        showError('Failed to accept call')
    }
}

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
                if (loadingText) {
                    loadingText.textContent = 'Connecting...'
                }
                joinCall(payload.new.room_name)
            } else if (payload.new.status === 'rejected') {
                showCallEnded('Call was rejected')
            } else if (payload.new.status === 'cancelled') {
                showCallEnded('Call was cancelled')
            }
        })
        .subscribe((status) => {
            console.log('Call listener subscription status:', status)
        })
}

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

        // Add CSS to hide any remaining Jitsi UI
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

        // AUTO-JOIN: Click join button repeatedly
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

        // Hide loading after delay and add hang button
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

// Add Beautiful Hang Button with SVG
function addHangButton() {
    // Remove any existing hang button
    const existingBtn = document.getElementById('hangUpBtn')
    if (existingBtn) existingBtn.remove()

    const hangBtn = document.createElement('button')
    hangBtn.id = 'hangUpBtn'
    hangBtn.className = 'hang-up-btn'
    hangBtn.setAttribute('aria-label', 'Hang up call')
    
    // SVG Phone Slash Icon (beautiful, no gradients)
    const svgIcon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8 10a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.574 2.81.7A2 2 0 0 1 22 16.92z"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
        <span>Hang Up</span>
    `
    
    hangBtn.innerHTML = svgIcon
    hangBtn.onclick = hangUp
    
    // Add to body
    document.body.appendChild(hangBtn)
}

// HANG UP FUNCTION - ENDS CALL AND CLOSES TAB WITH ANIMATION
window.hangUp = async function() {
    console.log('🔴 Hanging up call...')
    
    const hangBtn = document.getElementById('hangUpBtn')
    if (hangBtn) {
        // Add click animation
        hangBtn.style.transform = 'translateX(-50%) scale(0.9)'
        hangBtn.style.opacity = '0.7'
    }
    
    // Brief delay for animation
    setTimeout(async () => {
        await endCall(false)
    }, 150)
}

// End call
window.endCall = async function(silent = false) {
    console.log('Ending call...')

    if (currentCall && supabase && !silent) {
        await supabase
            .from('calls')
            .update({ status: 'ended', ended_at: new Date().toISOString() })
            .eq('id', currentCall.id)
    }

    unregisterTab()
    
    // Try to close the tab
    window.close()
    
    // Fallback if window.close() fails (browser restrictions)
    setTimeout(() => {
        window.location.href = '/pages/call-app/index.html'
    }, 500)
}

// Video toggle
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
            jitsiIframe.contentWindow.postMessage({
                type: 'setVideoMuted',
                muted: !isVideoOn
            }, '*')
        } catch(e) {}
    }
}

// Mute toggle
window.toggleMute = function() {
    const btn = document.getElementById('muteBtn')
    btn.classList.toggle('muted')
    btn.innerHTML = btn.classList.contains('muted') 
        ? '<i class="fas fa-microphone-slash"></i>' 
        : '<i class="fas fa-microphone"></i>'

    if (jitsiIframe) {
        try {
            jitsiIframe.contentWindow.postMessage({
                type: 'muteAudio',
                muted: btn.classList.contains('muted')
            }, '*')
        } catch(e) {}
    }
}

// Speaker toggle
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
    window.location.href = '/pages/call-app/index.html'
}

window.acceptCall = function() {}
window.declineCall = function() {}

function showCallEnded(message) {
    document.getElementById('loadingScreen').style.display = 'flex'
    document.getElementById('loadingText').textContent = message

    setTimeout(() => {
        window.location.href = '/pages/call-app/index.html'
    }, 2000)
}

function showError(message) {
    document.getElementById('loadingScreen').style.display = 'none'
    document.getElementById('errorScreen').style.display = 'flex'
    document.getElementById('errorMessage').textContent = message
}

initCall()