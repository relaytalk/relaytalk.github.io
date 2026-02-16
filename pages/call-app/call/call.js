// call.js - COMPLETE WITH TAB MANAGEMENT AND UI FIXES

import { initializeSupabase } from '../utils/supabase.js';
import { getRelayTalkUser } from '../utils/userSync.js';
import DailyIframe from 'https://esm.sh/@daily-co/daily-js@0.52.0';

let supabase = null;
let currentUser = null;
let callFrame = null;
let callId = null;
let callStatus = 'pending';
let heartbeatInterval = null;

// Tab Management
const TAB_ID = Math.random().toString(36).substring(7);
const CALL_TABS_KEY = 'call_app_active_tabs';

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const isIncoming = urlParams.get('incoming') === 'true';
const roomName = urlParams.get('room');
const friendId = urlParams.get('friendId');
const friendName = urlParams.get('friendName');
const callerId = urlParams.get('callerId');
const callIdParam = urlParams.get('callId');

// Create UI elements if they don't exist
function createUI() {
    // Create container if it doesn't exist
    if (!document.getElementById('callContainer')) {
        const container = document.createElement('div');
        container.id = 'callContainer';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #1a1a1a;
            z-index: 1000;
        `;
        document.body.appendChild(container);
    }

    // Create status element if it doesn't exist
    if (!document.getElementById('callStatus')) {
        const statusEl = document.createElement('div');
        statusEl.id = 'callStatus';
        statusEl.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-size: 18px;
            text-align: center;
            z-index: 1001;
            background: rgba(0,0,0,0.7);
            padding: 20px 40px;
            border-radius: 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
        `;
        statusEl.innerHTML = `
            <div class="spinner" style="
                width: 40px;
                height: 40px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #007acc;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            "></div>
            <div>Initializing call...</div>
        `;
        document.body.appendChild(statusEl);
    }

    // Add spinner animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

// Update status display
function updateStatusDisplay(message, details) {
    const statusEl = document.getElementById('callStatus');
    if (statusEl) {
        const spinner = statusEl.querySelector('.spinner');
        if (spinner) {
            if (message === 'connected' || message === 'active') {
                spinner.style.display = 'none';
                statusEl.innerHTML = `
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#4CAF50"/>
                    </svg>
                    <div style="color: #4CAF50; margin-top: 8px;">Connected</div>
                `;
            } else {
                statusEl.innerHTML = `
                    <div class="spinner" style="
                        width: 40px;
                        height: 40px;
                        border: 3px solid #f3f3f3;
                        border-top: 3px solid #007acc;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    "></div>
                    <div style="margin-top: 8px;">${details || message}</div>
                `;
            }
        } else {
            statusEl.innerHTML = details || message;
        }
    }
}

// Hide status display
function hideStatusDisplay() {
    const statusEl = document.getElementById('callStatus');
    if (statusEl) {
        statusEl.style.display = 'none';
    }
}

// Generate a room name if not provided
function getOrCreateRoomName() {
    if (roomName) return roomName;
    
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `vpaas-magic-cookie-16664d50d3a04e79a2876de86dcc38e4/CallApp-${timestamp}-${random}`;
}

// Register this tab
function registerTab() {
    try {
        const activeTabs = JSON.parse(sessionStorage.getItem(CALL_TABS_KEY) || '{}');
        const currentCallId = callIdParam || 'new-call';
        
        if (activeTabs[currentCallId] && activeTabs[currentCallId] !== TAB_ID) {
            console.log('⚠️ Another tab already active for this call, closing...');
            alert('Call is already open in another tab. This tab will close.');
            window.close();
            return false;
        }
        
        activeTabs[currentCallId] = TAB_ID;
        sessionStorage.setItem(CALL_TABS_KEY, JSON.stringify(activeTabs));
        return true;
    } catch (e) {
        console.log('Tab registration error:', e);
        return true;
    }
}

// Remove tab registration
function unregisterTab() {
    try {
        const activeTabs = JSON.parse(sessionStorage.getItem(CALL_TABS_KEY) || '{}');
        const currentCallId = callId || callIdParam || 'new-call';
        delete activeTabs[currentCallId];
        sessionStorage.setItem(CALL_TABS_KEY, JSON.stringify(activeTabs));
    } catch (e) {
        console.log('Tab unregistration error:', e);
    }
}

async function initCall() {
    console.log('📞 Initializing call...');

    try {
        // Create UI first
        createUI();
        updateStatusDisplay('initializing', 'Initializing call...');

        if (!registerTab()) return;

        const user = getRelayTalkUser();
        if (!user) {
            showError('Please login first');
            return;
        }
        console.log('✅ Got user:', user.email);
        currentUser = user;

        supabase = await initializeSupabase();
        console.log('✅ Supabase connected');

        const finalRoomName = getOrCreateRoomName();
        console.log('🎯 Using room:', finalRoomName);

        callId = callIdParam;
        
        if (!callId && !isIncoming) {
            await createOutgoingCall(user, finalRoomName);
        }

        await joinDailyRoom(finalRoomName);
        startHeartbeat();

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('storage', handleStorageEvent);

    } catch (error) {
        console.error('❌ Call init error:', error);
        showError('Failed to initialize call: ' + error.message);
    }
}

function handleStorageEvent(e) {
    if (e.key === CALL_TABS_KEY) {
        const tabs = JSON.parse(e.newValue || '{}');
        const currentCallId = callId || callIdParam || 'new-call';
        
        if (tabs[currentCallId] && tabs[currentCallId] !== TAB_ID) {
            console.log('⚠️ Another tab opened this call, closing...');
            alert('Call was opened in another tab. This tab will close.');
            endCall(true);
        }
    }
}

async function createOutgoingCall(user, room) {
    try {
        console.log('🎯 Creating call record with room:', room);
        updateStatusDisplay('calling', `Calling ${friendName}...`);
        
        if (!room) throw new Error('Room name is required');
        if (!friendId) throw new Error('Friend ID is required');

        // Check if there's an existing pending call
        const { data: existingCalls } = await supabase
            .from('calls')
            .select('id, status, created_at')
            .eq('caller_id', user.id)
            .eq('callee_id', friendId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1);

        const callData = {
            room_name: room,
            caller_id: user.id,
            callee_id: friendId,
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        // If there's an existing call, update it
        if (existingCalls && existingCalls.length > 0) {
            const existingCall = existingCalls[0];
            console.log('📞 Found existing pending call:', existingCall);
            
            const { error: updateError } = await supabase
                .from('calls')
                .update(callData)
                .eq('id', existingCall.id);

            if (updateError) throw updateError;
            
            callId = existingCall.id;
            return;
        }

        // Create new call
        console.log('📝 Inserting new call');
        const { data: call, error } = await supabase
            .from('calls')
            .insert([callData])
            .select()
            .single();

        if (error) throw error;

        callId = call.id;
        console.log('✅ Call created with ID:', callId);

    } catch (error) {
        console.error('❌ Failed to create call:', error);
        throw error;
    }
}

async function joinDailyRoom(room) {
    try {
        if (!room) throw new Error('Room name is required');

        updateStatusDisplay('joining', 'Joining call...');

        // Create Daily iframe
        callFrame = DailyIframe.createFrame({
            showLeaveButton: false,
            showFullscreenButton: true,
            showParticipantsBar: true,
            iframeStyle: {
                position: 'fixed',
                width: '100%',
                height: '100%',
                top: '0',
                left: '0',
                border: '0',
                zIndex: '1000'
            }
        });

        // Add custom hangup button after iframe is created
        setTimeout(() => addCustomHangupButton(), 1000);

        const roomUrl = `https://${room}`;
        console.log('🔗 Joining room:', roomUrl);

        await callFrame.join({
            url: roomUrl,
            showLeaveButton: false,
            userName: currentUser?.username || 'User'
        });

        console.log('✅ Joined Daily room');
        
        // Hide status after successful join
        setTimeout(() => hideStatusDisplay(), 2000);

        callFrame.on('participant-joined', handleParticipantJoined);
        callFrame.on('participant-left', handleParticipantLeft);
        callFrame.on('error', handleCallError);

        if (isIncoming) {
            await updateCallStatusInDB('active');
        }

    } catch (error) {
        console.error('❌ Failed to join Daily room:', error);
        throw error;
    }
}

function addCustomHangupButton() {
    // Remove existing button if any
    const existingBtn = document.getElementById('custom-hangup-btn');
    if (existingBtn) existingBtn.remove();

    const hangupBtn = document.createElement('button');
    hangupBtn.id = 'custom-hangup-btn';
    hangupBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-3-9h6v2H9v-2z" fill="white"/>
        </svg>
        <span>End Call</span>
    `;
    
    hangupBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #dc2626;
        color: white;
        border: none;
        border-radius: 50px;
        padding: 12px 24px;
        font-size: 16px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        z-index: 1002;
        box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
        transition: all 0.2s;
    `;

    hangupBtn.addEventListener('mouseenter', () => {
        hangupBtn.style.background = '#b91c1c';
        hangupBtn.style.transform = 'translateX(-50%) scale(1.05)';
    });

    hangupBtn.addEventListener('mouseleave', () => {
        hangupBtn.style.background = '#dc2626';
        hangupBtn.style.transform = 'translateX(-50%) scale(1)';
    });

    hangupBtn.addEventListener('click', () => endCall(false));

    document.body.appendChild(hangupBtn);
}

async function endCall(silent = false) {
    console.log('🔴 Ending call...');

    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }

    if (!silent && callId && supabase) {
        await updateCallStatusInDB('completed');
    }

    if (callFrame) {
        try {
            await callFrame.leave();
            callFrame.destroy();
        } catch (e) {
            console.log('Error leaving call:', e);
        }
    }

    unregisterTab();
    window.close();
    
    setTimeout(() => {
        window.location.href = '../friends/index.html';
    }, 500);
}

function handleBeforeUnload(event) {
    unregisterTab();
    
    if (callId && supabase && callStatus !== 'completed') {
        const status = callStatus === 'active' ? 'completed' : 'missed';
        updateCallStatusInDB(status);
    }
}

async function updateCallStatusInDB(status) {
    try {
        if (!callId || !supabase) return;

        const updateData = { 
            status,
            updated_at: new Date().toISOString()
        };
        
        if (status === 'active') {
            updateData.started_at = new Date().toISOString();
        } else if (['completed', 'missed', 'rejected'].includes(status)) {
            updateData.ended_at = new Date().toISOString();
        }

        const { error } = await supabase
            .from('calls')
            .update(updateData)
            .eq('id', callId);

        if (error) throw error;

        callStatus = status;
        console.log(`✅ Call status updated to: ${status}`);

    } catch (error) {
        console.error('❌ Failed to update call status:', error);
    }
}

function startHeartbeat() {
    heartbeatInterval = setInterval(async () => {
        if (callId && supabase && callStatus === 'active') {
            await supabase
                .from('calls')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', callId);
        }
    }, 10000);
}

function handleParticipantJoined(event) {
    console.log('👤 Participant joined:', event);
    
    if (!isIncoming && callStatus === 'pending') {
        updateCallStatusInDB('active');
    }

    updateStatusDisplay('connected', 'Connected');
    setTimeout(() => hideStatusDisplay(), 2000);
}

function handleParticipantLeft(event) {
    console.log('👤 Participant left:', event);
    
    if (callFrame && callFrame.participantCount() < 2) {
        updateStatusDisplay('waiting', 'Waiting for other participant...');
        setTimeout(() => {
            endCall(false);
        }, 3000);
    }
}

function handleCallError(error) {
    console.error('❌ Call error:', error);
    showError('Call failed: ' + error.message);
    endCall(false);
}

function showError(message) {
    // Remove any existing error
    const existingError = document.getElementById('callError');
    if (existingError) existingError.remove();

    const errorEl = document.createElement('div');
    errorEl.id = 'callError';
    errorEl.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 24px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        text-align: center;
        z-index: 2000;
        max-width: 90%;
        width: 400px;
    `;
    errorEl.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom: 16px;">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#dc2626"/>
        </svg>
        <h3 style="margin-bottom: 8px; color: #1e293b;">Call Failed</h3>
        <p style="color: #64748b; margin-bottom: 20px; word-break: break-word;">${message}</p>
        <button onclick="window.location.href='../friends/index.html'" style="background: #007acc; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; width: 100%;">
            Return to Friends
        </button>
    `;
    document.body.appendChild(errorEl);
}

// Initialize call
initCall();
