// call.js - COMPLETE UPDATED FILE

import { initializeSupabase } from '../utils/supabase.js';
import { getRelayTalkUser } from '../utils/userSync.js';
import DailyIframe from 'https://esm.sh/@daily-co/daily-js@0.52.0';

let supabase = null;
let currentUser = null;
let callFrame = null;
let callId = null;
let callStatus = 'pending';
let heartbeatInterval = null;

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const isIncoming = urlParams.get('incoming') === 'true';
const roomName = urlParams.get('room');
const friendId = urlParams.get('friendId');
const friendName = urlParams.get('friendName');
const callerId = urlParams.get('callerId');
const callIdParam = urlParams.get('callId');

async function initCall() {
    console.log('📞 Initializing call...');

    try {
        // Get user from RelayTalk
        const user = getRelayTalkUser();
        if (!user) {
            showError('Please login first');
            return;
        }
        console.log('✅ Got user:', user.email);

        // Initialize Supabase
        supabase = await initializeSupabase();
        console.log('✅ Supabase connected');

        // Get call ID from URL or create new
        callId = callIdParam;
        
        if (!callId && !isIncoming) {
            // Outgoing call - create call record
            await createOutgoingCall(user, roomName);
        }

        // Join the Daily room
        await joinDailyRoom();

        // Set up call status heartbeat
        startHeartbeat();

        // Set up beforeunload handler
        window.addEventListener('beforeunload', handleBeforeUnload);

    } catch (error) {
        console.error('❌ Call init error:', error);
        showError('Failed to initialize call: ' + error.message);
    }
}

async function createOutgoingCall(user, room) {
    try {
        console.log('🎯 Creating call record...');
        
        const { data: call, error } = await supabase
            .from('calls')
            .insert([{
                room_name: room,
                caller_id: user.id,
                callee_id: friendId,
                status: 'pending',
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;

        callId = call.id;
        console.log('✅ Call created:', call);

        // Show calling status
        updateCallStatus('calling', `Calling ${friendName}...`);

    } catch (error) {
        console.error('❌ Failed to create call:', error);
        throw error;
    }
}

async function joinDailyRoom() {
    try {
        // Create Daily iframe
        callFrame = DailyIframe.createFrame({
            showLeaveButton: false, // Hide default leave button (we'll use custom)
            showFullscreenButton: true,
            showParticipantsBar: true,
            iframeStyle: {
                position: 'fixed',
                width: '100%',
                height: 'calc(100% - 80px)',
                top: '0',
                left: '0',
                border: '0'
            }
        });

        // Add custom hangup button
        addCustomHangupButton();

        // Join the room
        await callFrame.join({
            url: `https://${roomName}`,
            showLeaveButton: false,
            userName: currentUser?.username || 'User'
        });

        console.log('✅ Joined Daily room');

        // Listen for participant events
        callFrame.on('participant-joined', handleParticipantJoined);
        callFrame.on('participant-left', handleParticipantLeft);
        callFrame.on('error', handleCallError);

        // If this is an incoming call, update status to active when answered
        if (isIncoming) {
            await updateCallStatus('active');
        }

    } catch (error) {
        console.error('❌ Failed to join Daily room:', error);
        throw error;
    }
}

function addCustomHangupButton() {
    // Create custom hangup button
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
        z-index: 1000;
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

    hangupBtn.addEventListener('click', endCall);

    document.body.appendChild(hangupBtn);
}

async function endCall() {
    console.log('🔴 Ending call...');

    // Stop heartbeat
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }

    // Update call status in database
    if (callId && supabase) {
        await updateCallStatus('completed');
    }

    // Leave Daily room
    if (callFrame) {
        try {
            await callFrame.leave();
            callFrame.destroy();
        } catch (e) {
            console.log('Error leaving call:', e);
        }
    }

    // Close this tab/window
    window.close();
    
    // Fallback: if window.close is blocked, redirect to friends page
    setTimeout(() => {
        window.location.href = '../friends/index.html';
    }, 500);
}

function handleBeforeUnload(event) {
    // Update call status when user closes tab/window
    if (callId && supabase && callStatus !== 'completed') {
        updateCallStatus('missed');
    }
}

async function updateCallStatus(status) {
    try {
        if (!callId || !supabase) return;

        const updateData = { status };
        
        // Add timestamps based on status
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
    // Update status every 10 seconds to keep call active
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
    
    // Update call status to active if it's the callee joining
    if (!isIncoming && callStatus === 'pending') {
        updateCallStatus('active');
    }

    updateCallStatus('connected', 'Connected');
}

function handleParticipantLeft(event) {
    console.log('👤 Participant left:', event);
    
    // If less than 2 participants, end call after delay
    if (callFrame.participantCount() < 2) {
        setTimeout(() => {
            endCall();
        }, 3000);
    }
}

function handleCallError(error) {
    console.error('❌ Call error:', error);
    showError('Call failed: ' + error.message);
    endCall();
}

function updateCallStatus(message, details) {
    const statusEl = document.getElementById('callStatus');
    if (statusEl) {
        statusEl.textContent = details || message;
    }
}

function showError(message) {
    const container = document.getElementById('errorContainer') || document.body;
    const errorEl = document.createElement('div');
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
    `;
    errorEl.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-bottom: 16px;">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#dc2626"/>
        </svg>
        <h3 style="margin-bottom: 8px; color: #1e293b;">Call Failed</h3>
        <p style="color: #64748b; margin-bottom: 20px;">${message}</p>
        <button onclick="window.location.href='../friends/index.html'" style="background: #007acc; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer;">
            Return to Friends
        </button>
    `;
    container.appendChild(errorEl);
}

// Initialize call
initCall();
