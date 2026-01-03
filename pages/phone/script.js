// /app/pages/phone/script.js - COMPLETE UPDATED VERSION

import { auth } from '/app/utils/auth.js';
import { supabase } from '/app/utils/supabase.js';
import callService from '/app/utils/callService.js';

console.log("📞 Phone Page Loaded");

// Current user
let currentUser = null;
let callHistory = [];
let quickContacts = [];
let currentIncomingCall = null;

// Initialize phone page
async function initPhonePage() {
    console.log("Initializing phone page...");

    try {
        const { success, user } = await auth.getCurrentUser();  

        if (!success || !user) {  
            window.location.href = '/app/pages/login/index.html';
            return;  
        }  

        currentUser = user;  
        console.log("✅ Authenticated as:", currentUser.email);  

        // Initialize call service
        await initializeCallService();

        // Load data
        await loadCallHistory();
        await loadQuickContacts();

        // Hide loading
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }

        // Setup real-time for incoming calls
        setupIncomingCallListener();

    } catch (error) {
        console.error("Init error:", error);
        // Hide loading on error
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
}

// ==================== CALL SERVICE INTEGRATION ====================

// Initialize call service
async function initializeCallService() {
    try {
        await callService.initialize(currentUser.id);
        
        // Set up call service callbacks
        callService.setOnCallStateChange((state) => {
            handleCallStateChange(state);
        });
        
        callService.setOnRemoteStream((stream) => {
            handleRemoteStream(stream);
        });
        
        callService.setOnCallQualityUpdate((stats) => {
            updateCallQuality(stats);
        });
        
        callService.setOnCallEvent((event, data) => {
            handleCallEvent(event, data);
        });
        
        console.log("✅ Call service initialized");
        
    } catch (error) {
        console.error("❌ Failed to initialize call service:", error);
    }
}

// Call state change handler
function handleCallStateChange(state) {
    console.log("📞 Call state changed to:", state);
    
    // You can update UI based on call state
    switch(state) {
        case 'ringing':
            // Show ringing UI
            break;
        case 'connecting':
            // Show connecting UI
            break;
        case 'active':
            // Show active call UI
            break;
        case 'ending':
            // Show ending UI
            break;
        case 'idle':
            // Return to normal UI
            break;
    }
}

// Remote stream handler
function handleRemoteStream(stream) {
    console.log("🎵 Remote stream received");
    
    // Set remote stream to audio/video element
    const remoteAudio = document.getElementById('remote-audio');
    const remoteVideo = document.getElementById('remote-video');
    
    if (remoteAudio) {
        remoteAudio.srcObject = stream;
        remoteAudio.play().catch(e => console.log("Audio play error:", e));
    }
    
    if (remoteVideo && stream.getVideoTracks().length > 0) {
        remoteVideo.srcObject = stream;
        remoteVideo.play().catch(e => console.log("Video play error:", e));
    }
}

// Call quality update
function updateCallQuality(stats) {
    console.log("📊 Call quality:", stats);
    
    // Update UI with call quality
    const qualityElement = document.getElementById('callQuality');
    if (qualityElement) {
        qualityElement.innerHTML = `
            <span class="quality-dot ${stats.overallQuality}"></span>
            <span>${stats.overallQuality.toUpperCase()}</span>
        `;
    }
}

// Call event handler
function handleCallEvent(event, data) {
    console.log("📨 Call event:", event, data);
    
    switch(event) {
        case 'remote_mute_toggled':
            // Update UI for remote mute
            console.log("Remote user", data.muted ? "muted" : "unmuted");
            break;
            
        case 'remote_video_toggled':
            // Update UI for remote video
            console.log("Remote video", data.videoEnabled ? "enabled" : "disabled");
            break;
            
        case 'call_duration_update':
            // Update call timer
            updateCallTimer(data.duration);
            break;
    }
}

// Handle outgoing call
async function handleOutgoingCall(friendId, friendName, callType) {
    try {
        const call = await callService.initiateCall(friendId, callType);
        
        if (call) {
            // Navigate to call page
            window.location.href = `call.html?type=outgoing&callId=${call.id}&contactId=${friendId}&name=${encodeURIComponent(friendName)}&callType=${callType}`;
        }
        
    } catch (error) {
        console.error("❌ Failed to start call:", error);
        showToast('error', 'Call Failed', 'Could not start the call');
    }
}

// Handle incoming call
async function handleIncomingCall(call) {
    currentIncomingCall = call;
    
    // Get caller info
    const { data: caller } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', call.caller_id)
        .single();
    
    const callerName = caller?.username || 'Unknown';
    
    // Show incoming call UI
    const incomingCallScreen = document.getElementById('incomingCallScreen');
    if (incomingCallScreen) {
        incomingCallScreen.style.display = 'flex';
        document.getElementById('incomingName').textContent = callerName;
        document.getElementById('incomingAvatar').textContent = callerName.charAt(0).toUpperCase();
    }
    
    // Also show browser notification
    if (Notification.permission === 'granted') {
        new Notification('📞 Incoming Call', {
            body: `${callerName} is calling you`,
            icon: '/app/relay.png',
            requireInteraction: true,
            actions: [
                { action: 'answer', title: 'Answer' },
                { action: 'decline', title: 'Decline' }
            ]
        });
    }
    
    // Show toast
    showToast('info', 'Incoming Call', `${callerName} is calling`);
}

// Answer incoming call
async function answerCall() {
    if (!currentIncomingCall) return;
    
    try {
        const call = await callService.answerCall(currentIncomingCall.id);
        
        if (call) {
            // Navigate to call page
            const { data: caller } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', call.caller_id)
                .single();
            
            const callerName = caller?.username || 'Unknown';
            
            window.location.href = `call.html?type=incoming&callId=${call.id}&contactId=${call.caller_id}&name=${encodeURIComponent(callerName)}&callType=${call.call_type}`;
        }
        
    } catch (error) {
        console.error("❌ Failed to answer call:", error);
        showToast('error', 'Call Failed', 'Could not answer the call');
    }
}

// Reject incoming call
async function rejectCall() {
    if (!currentIncomingCall) return;
    
    try {
        await callService.rejectCall(currentIncomingCall.id);
        currentIncomingCall = null;
        
        // Hide incoming call UI
        const incomingCallScreen = document.getElementById('incomingCallScreen');
        if (incomingCallScreen) {
            incomingCallScreen.style.display = 'none';
        }
        
    } catch (error) {
        console.error("❌ Failed to reject call:", error);
    }
}

// Update call timer
function updateCallTimer(duration) {
    const timerElement = document.getElementById('callTimer');
    if (timerElement) {
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// ==================== PHONE PAGE FUNCTIONS ====================

// Load call history
async function loadCallHistory() {
    if (!currentUser) return;

    try {
        const { data: calls, error } = await supabase
            .from('calls')
            .select('*')
            .or(`caller_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
            .order('initiated_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        callHistory = calls || [];

        // Display calls
        displayCallHistory();

    } catch (error) {
        console.error("Error loading call history:", error);
        showToast('error', 'Error', 'Could not load call history');
    }
}

// Display call history
function displayCallHistory() {
    const container = document.getElementById('callsList');
    if (!container) return;

    if (callHistory.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📞</div>
                <h3>No Call History</h3>
                <p>Start making calls to see them here</p>
            </div>
        `;
        return;
    }

    let html = '';
    callHistory.forEach(call => {
        const isOutgoing = call.caller_id === currentUser.id;
        const isMissed = call.status === 'missed';
        const isIncoming = !isOutgoing && !isMissed;

        // Get contact info
        const otherUserId = isOutgoing ? call.receiver_id : call.caller_id;
        const contactName = call.metadata?.contactName || 'User';
        const firstLetter = contactName.charAt(0).toUpperCase();

        // Call type and icon
        const callType = isOutgoing ? 'Outgoing' : isIncoming ? 'Incoming' : 'Missed';
        const callIcon = isOutgoing ? 'fas fa-phone-alt' : 
                        isMissed ? 'fas fa-phone-slash' : 'fas fa-phone';
        const callClass = isMissed ? 'call-missed' : 
                         isOutgoing ? 'call-outgoing' : 'call-incoming';

        // Format time
        const callTime = new Date(call.initiated_at);
        const timeString = callTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateString = callTime.toLocaleDateString();

        // Format duration
        const duration = call.duration ? formatDuration(call.duration) : '--:--';

        // Call type badge
        const callTypeBadge = call.call_type === 'video' ? 
            '<span class="call-type-badge" style="background: #667eea; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; margin-left: 5px;">VIDEO</span>' : '';

        html += `
            <div class="call-item ${callClass}" onclick="openCallDetails('${call.id}')">
                <div class="call-avatar" style="background: ${getColorFromLetter(firstLetter)}">
                    ${firstLetter}
                </div>
                <div class="call-info">
                    <div class="call-name">
                        <span>${contactName} ${callTypeBadge}</span>
                        <span class="call-type-icon"><i class="${callIcon}"></i></span>
                    </div>
                    <div class="call-details">
                        <span>${dateString} ${timeString}</span>
                        <span>${duration}</span>
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Load quick contacts (recently contacted friends)
async function loadQuickContacts() {
    if (!currentUser) return;

    try {
        // Get friends who you've recently called or messaged
        const { data: friends, error } = await supabase
            .from('profiles')
            .select('id, username, status')
            .in('id', await getRecentContactIds())
            .limit(12);

        if (error) throw error;

        quickContacts = friends || [];
        displayQuickContacts();

    } catch (error) {
        console.error("Error loading contacts:", error);
    }
}

// Get recent contact IDs from calls and messages
async function getRecentContactIds() {
    if (!currentUser) return [];

    try {
        // Get from calls
        const { data: recentCalls } = await supabase
            .from('calls')
            .select('caller_id, receiver_id')
            .or(`caller_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
            .order('initiated_at', { ascending: false })
            .limit(20);

        // Get from messages
        const { data: recentMessages } = await supabase
            .from('messages')
            .select('sender_id, receiver_id')
            .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false })
            .limit(20);

        // Extract unique contact IDs
        const contactIds = new Set();

        if (recentCalls) {
            recentCalls.forEach(call => {
                const otherId = call.caller_id === currentUser.id ? call.receiver_id : call.caller_id;
                contactIds.add(otherId);
            });
        }

        if (recentMessages) {
            recentMessages.forEach(msg => {
                const otherId = msg.sender_id === currentUser.id ? msg.receiver_id : msg.sender_id;
                contactIds.add(otherId);
            });
        }

        return Array.from(contactIds);

    } catch (error) {
        console.error("Error getting recent contacts:", error);
        return [];
    }
}

// Display quick contacts
function displayQuickContacts() {
    const container = document.getElementById('quickContacts');
    if (!container) return;

    if (quickContacts.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <div class="empty-icon">👥</div>
                <p>No recent contacts</p>
            </div>
        `;
        return;
    }

    let html = '';
    quickContacts.forEach(contact => {
        const firstLetter = contact.username.charAt(0).toUpperCase();
        const isOnline = contact.status === 'online';

        html += `
            <div class="contact-card" onclick="openCallModal('${contact.id}', '${contact.username}')">
                <div class="contact-avatar" style="background: ${getColorFromLetter(firstLetter)}">
                    ${firstLetter}
                </div>
                <div class="contact-name">${contact.username}</div>
                <div class="contact-status">
                    <i class="fas fa-circle" style="color: ${isOnline ? '#4CAF50' : '#757575'}; font-size: 0.6rem;"></i>
                    ${isOnline ? 'Online' : 'Offline'}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Open call modal
function openCallModal(contactId, contactName) {
    const modal = document.getElementById('callModal');
    if (!modal) return;

    // Set modal content
    document.getElementById('callModalName').textContent = contactName;
    document.getElementById('callModalAvatar').textContent = contactName.charAt(0).toUpperCase();
    document.getElementById('callModalStatus').textContent = 'Ready to call';

    // Store contact info in modal for call initiation
    modal.dataset.contactId = contactId;
    modal.dataset.contactName = contactName;

    // Show modal
    modal.style.display = 'flex';
}

// Close call modal
function closeCallModal() {
    const modal = document.getElementById('callModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Start voice call
function startVoiceCall() {
    const modal = document.getElementById('callModal');
    if (!modal) return;

    const contactId = modal.dataset.contactId;
    const contactName = modal.dataset.contactName;

    closeCallModal();
    handleOutgoingCall(contactId, contactName, 'voice');
}

// Start video call
function startVideoCall() {
    const modal = document.getElementById('callModal');
    if (!modal) return;

    const contactId = modal.dataset.contactId;
    const contactName = modal.dataset.contactName;

    closeCallModal();
    handleOutgoingCall(contactId, contactName, 'video');
}

// Send message instead of calling
function sendMessageInstead() {
    const modal = document.getElementById('callModal');
    if (!modal) return;

    const contactId = modal.dataset.contactId;

    closeCallModal();

    // Navigate to chat
    window.location.href = `/app/pages/chats/index.html?friendId=${contactId}`;
}

// Setup incoming call listener
function setupIncomingCallListener() {
    if (!currentUser) return;

    // Listen for new calls where current user is receiver
    supabase
        .channel(`incoming-calls-${currentUser.id}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'calls',
                filter: `receiver_id=eq.${currentUser.id}`
            },
            async (payload) => {
                const call = payload.new;
                if (call.status === 'ringing') {
                    await handleIncomingCall(call);
                }
            }
        )
        .subscribe();
}

// Clear call history
async function clearCallHistory() {
    if (!currentUser || !confirm('Clear all call history?')) return;

    try {
        const { error } = await supabase
            .from('calls')
            .delete()
            .or(`caller_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`);

        if (error) throw error;

        callHistory = [];
        displayCallHistory();
        showToast('success', 'Cleared', 'Call history cleared');

    } catch (error) {
        console.error("Error clearing history:", error);
        showToast('error', 'Error', 'Could not clear history');
    }
}

// Open call details
function openCallDetails(callId) {
    // You can create a call details modal
    const call = callHistory.find(c => c.id === callId);
    if (call) {
        // Get contact name
        const otherUserId = call.caller_id === currentUser.id ? call.receiver_id : call.caller_id;
        const contactName = call.metadata?.contactName || 'User';
        
        const details = `
            Call Details:
            Contact: ${contactName}
            Type: ${call.call_type === 'video' ? 'Video Call' : 'Voice Call'}
            Status: ${call.status}
            Duration: ${formatDuration(call.duration)}
            Started: ${new Date(call.initiated_at).toLocaleString()}
            ${call.ended_at ? `Ended: ${new Date(call.ended_at).toLocaleString()}` : ''}
        `;
        
        alert(details);
    }
}

// ==================== UTILITY FUNCTIONS ====================

function formatDuration(seconds) {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getColorFromLetter(letter) {
    const colors = [
        '#667eea', '#764ba2', '#4CAF50', '#FF9500', 
        '#FF3B30', '#5856D6', '#007AFF', '#34C759'
    ];
    const index = letter.charCodeAt(0) % colors.length;
    return colors[index];
}

function showToast(type, title, message) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-icon">${type === 'success' ? '✅' : '⚠️'}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    document.getElementById('toastContainer').appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ==================== GLOBAL FUNCTIONS ====================

window.clearCallHistory = clearCallHistory;
window.loadQuickContacts = loadQuickContacts;
window.openCallModal = openCallModal;
window.closeCallModal = closeCallModal;
window.startVoiceCall = startVoiceCall;
window.startVideoCall = startVideoCall;
window.sendMessageInstead = sendMessageInstead;
window.openCallDetails = openCallDetails;
window.answerCall = answerCall;
window.rejectCall = rejectCall;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initPhonePage);