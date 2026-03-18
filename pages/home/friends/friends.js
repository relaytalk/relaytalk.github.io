// friends.js - COMPLETE FIXED VERSION WITH PROPER CHANNEL HANDLING
import { initializeSupabase as initMainSupabase } from '../../../utils/supabase.js';
import { 
    syncUserToDatabase, 
    getUserFriends,
    updateUserStatus,
    searchAllUsers,
    sendFriendRequest
} from '../../call-app/utils/userSync.js';

let mainSupabase = null;
let currentUser = null;
let authUser = null;
let allFriends = [];
let filteredFriends = [];
let callListenerInitialized = false;
let incomingCallData = null;
let incomingCallTimeout = null;
let outgoingCallTimeout = null;
let missedCallCount = 0;
let realtimeChannel = null; // Track channel for cleanup
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Initialize
async function initFriendsPage() {
    console.log('🚀 Loading friends with call features...');

    try {
        // Initialize MAIN Supabase
        updateLoadingText('Connecting to server...');
        mainSupabase = await initMainSupabase();

        if (!mainSupabase || !mainSupabase.auth) {
            throw new Error('Main Supabase not initialized');
        }

        // Get session
        updateLoadingText('Verifying login...');
        const { data: { session }, error } = await mainSupabase.auth.getSession();

        if (error) throw error;

        if (!session) {
            window.location.href = '../../../pages/login/index.html';
            return;
        }

        authUser = session.user;
        console.log('✅ MAIN Auth user:', authUser.email);

        // Sync user to database
        currentUser = await syncUserToDatabase(mainSupabase, {
            id: authUser.id,
            email: authUser.email,
            username: authUser.user_metadata?.username || authUser.email.split('@')[0],
            avatar_url: authUser.user_metadata?.avatar_url || null
        });

        if (!currentUser || !currentUser.id) {
            throw new Error('Failed to sync user to database');
        }

        // Load friends
        updateLoadingText('Finding your friends...');
        await loadFriends();
        
        // Check missed calls
        await checkMissedCalls();

        // Initialize call listener with proper error handling
        updateLoadingText('Setting up calls...');
        if (!callListenerInitialized && currentUser && currentUser.id) {
            console.log('📞 Initializing call listener with proper channel handling...');
            
            await initializeCallListener();

            callListenerInitialized = true;
        }

        // Set up periodic status updates
        startStatusUpdates();

        // Set up periodic missed call checks
        setInterval(() => {
            checkMissedCalls();
        }, 10000);

        // Hide loading
        setTimeout(() => {
            const loader = document.getElementById('loadingIndicator');
            if (loader) loader.classList.add('hidden');
        }, 500);

    } catch (error) {
        console.error('❌ Init error:', error);
        showError('Failed to load friends: ' + error.message);
    }
}

// Initialize call listener with proper channel management
async function initializeCallListener() {
    try {
        // Clean up any existing channel
        if (realtimeChannel) {
            await mainSupabase.removeChannel(realtimeChannel);
        }

        console.log('📡 Setting up realtime channel for user:', currentUser.id);

        // Create a new channel with proper configuration
        realtimeChannel = mainSupabase
            .channel(`calls:callee_id=eq.${currentUser.id}`, {
                config: {
                    broadcast: { self: true },
                    presence: { key: currentUser.id }
                }
            })
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'calls',
                    filter: `callee_id=eq.${currentUser.id}`
                },
                (payload) => {
                    console.log('📞 New call detected:', payload);
                    handleIncomingCall(payload.new);
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
                    console.log('📞 Call updated:', payload);
                    // Handle call updates if needed
                }
            )
            .subscribe((status) => {
                console.log('📡 Realtime channel status:', status);
                
                if (status === 'SUBSCRIBED') {
                    console.log('✅ Successfully subscribed to calls channel');
                    reconnectAttempts = 0; // Reset reconnect attempts on success
                    
                    // Show success toast once
                    if (reconnectAttempts === 0) {
                        showToast('success', 'Ready to receive calls');
                    }
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('❌ Channel error - attempting reconnect...');
                    
                    // Attempt to reconnect with exponential backoff
                    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        reconnectAttempts++;
                        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                        
                        console.log(`⏰ Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
                        
                        setTimeout(() => {
                            initializeCallListener();
                        }, delay);
                    } else {
                        console.error('❌ Max reconnect attempts reached');
                        showToast('error', 'Unable to establish call connection. Please refresh the page.');
                    }
                }
            });

    } catch (error) {
        console.error('❌ Error initializing call listener:', error);
        
        // Retry on error
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            setTimeout(() => initializeCallListener(), 5000);
        }
    }
}

// Handle incoming call
function handleIncomingCall(callData) {
    console.log('📞🔥 INCOMING CALL:', callData);

    if (!callData || !callData.caller_id) return;

    // Only process if this call is for the current user and is ringing
    if (callData.callee_id === currentUser.id && callData.status === 'ringing') {
        // Check if we're already showing a notification for this caller
        const existingNotification = document.getElementById('incomingCallNotification');
        const existingCallerId = existingNotification?.getAttribute('data-caller-id');

        // If it's the same caller, don't show duplicate
        if (existingNotification && existingCallerId === callData.caller_id) {
            console.log('⏭️ Already showing notification for this caller');
            return;
        }

        // If it's a different caller, remove old notification
        if (existingNotification) {
            existingNotification.remove();
            stopRingtone();
            if (incomingCallTimeout) clearTimeout(incomingCallTimeout);
        }

        incomingCallData = {
            callId: callData.id,
            callerId: callData.caller_id,
            room: callData.room_name,
            status: callData.status
        };
        
        showIncomingCallNotification(incomingCallData);

        // Auto-reject after 30 seconds if not answered
        incomingCallTimeout = setTimeout(() => {
            console.log('⏰ Incoming call timed out after 30s');
            if (incomingCallData && incomingCallData.callId) {
                rejectCall(incomingCallData.callId, true);
            }
        }, 30000);

        // Check missed calls after incoming call
        setTimeout(() => checkMissedCalls(), 2000);
    }
}

// Show incoming call notification
function showIncomingCallNotification(callData) {
    // Remove any existing notification
    const existing = document.getElementById('incomingCallNotification');
    if (existing) {
        existing.remove();
        if (incomingCallTimeout) clearTimeout(incomingCallTimeout);
    }

    // Get caller info from friends list
    const caller = allFriends.find(f => f.id === callData.callerId) || { username: 'Unknown Caller' };

    const notification = document.createElement('div');
    notification.id = 'incomingCallNotification';
    notification.className = 'incoming-call-notification';
    notification.setAttribute('data-caller-id', callData.callerId);
    notification.setAttribute('data-call-id', callData.callId);
    notification.innerHTML = `
        <div class="incoming-call-content">
            <div class="incoming-call-avatar">
                ${caller.avatar_url 
                    ? `<img src="${caller.avatar_url}" alt="${caller.username}" loading="lazy">`
                    : caller.username.charAt(0).toUpperCase()
                }
            </div>
            <div class="incoming-call-info">
                <div class="incoming-call-name">${caller.username}</div>
                <div class="incoming-call-status">
                    <span class="pulsing-dot"></span>
                    <span>Incoming call...</span>
                </div>
            </div>
            <div class="incoming-call-actions">
                <button class="incoming-call-btn decline" onclick="rejectCall('${callData.callId}', false, event)">
                    <i class="fas fa-phone-slash"></i>
                </button>
                <button class="incoming-call-btn accept" onclick="acceptCall(event)">
                    <i class="fas fa-phone"></i>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(notification);
    playIncomingRingtone();
}

// Accept call
window.acceptCall = function(event) {
    if (event) event.stopPropagation();

    if (!incomingCallData) return;

    stopRingtone();

    const notification = document.getElementById('incomingCallNotification');
    if (notification) notification.remove();

    // Clear timeout
    if (incomingCallTimeout) {
        clearTimeout(incomingCallTimeout);
        incomingCallTimeout = null;
    }

    // Mark any other pending calls from same caller as missed
    if (mainSupabase && incomingCallData.callerId) {
        mainSupabase
            .from('calls')
            .update({ 
                status: 'missed',
                ended_at: new Date().toISOString(),
                seen: true
            })
            .eq('caller_id', incomingCallData.callerId)
            .eq('callee_id', currentUser.id)
            .eq('status', 'ringing')
            .neq('id', incomingCallData.callId)
            .then(() => {
                console.log('Cleaned up duplicate calls');
                checkMissedCalls();
            });
    }

    // Open call window
    const url = `../../call-app/call/index.html?incoming=true&room=${incomingCallData.room}&callerId=${incomingCallData.callerId}&callId=${incomingCallData.callId}`;
    console.log('✅ Accepting call, redirecting to:', url);

    window.open(url, '_blank');
};

// Reject call
window.rejectCall = async function(callId, isTimeout = false, event) {
    if (event) event.stopPropagation();

    stopRingtone();

    const notification = document.getElementById('incomingCallNotification');
    if (notification) notification.remove();

    // Clear timeout
    if (incomingCallTimeout) {
        clearTimeout(incomingCallTimeout);
        incomingCallTimeout = null;
    }

    const callToReject = callId || incomingCallData?.callId;
    const callerId = incomingCallData?.callerId;

    if (callToReject && mainSupabase) {
        try {
            // Update call status to 'rejected'
            await mainSupabase
                .from('calls')
                .update({ 
                    status: 'rejected',
                    ended_at: new Date().toISOString(),
                    seen: true
                })
                .eq('id', callToReject);

            console.log(isTimeout ? 'Call timed out' : 'Call rejected');

            // If there was a caller and it's not a timeout, mark their call as missed
            if (!isTimeout && callerId) {
                await mainSupabase
                    .from('calls')
                    .update({ 
                        status: 'missed',
                        seen: true
                    })
                    .eq('caller_id', callerId)
                    .eq('callee_id', currentUser.id)
                    .eq('status', 'ringing')
                    .neq('id', callToReject);
            }

            await checkMissedCalls();

        } catch (error) {
            console.error('Error rejecting call:', error);
        }
    }

    incomingCallData = null;

    // Show appropriate message
    showToast('info', isTimeout ? 'Call timed out' : 'Call rejected');
};

// Start a call
window.startCall = function(friendId, friendName) {
    const friend = allFriends.find(f => f.id === friendId);
    if (!friend || friend.status !== 'online') {
        showToast('error', `${friendName} is offline`);
        return;
    }

    console.log(`📞 Starting call to ${friendName}`);

    // Play outgoing ringtone
    playOutgoingRingtone();

    // Clear any existing timeout
    if (outgoingCallTimeout) clearTimeout(outgoingCallTimeout);

    // Set timeout to auto-cancel after 30 seconds
    outgoingCallTimeout = setTimeout(() => {
        console.log('⏰ Outgoing call timed out after 30s');
        stopRingtone();
        showToast('info', 'Call timed out - no answer');
    }, 30000);

    // Open call window
    const callUrl = `../../call-app/call/index.html?friendId=${friendId}&friendName=${encodeURIComponent(friendName)}`;
    window.open(callUrl, '_blank');
};

// Load friends
async function loadFriends() {
    try {
        if (!authUser || !mainSupabase) return;

        const { data: friendsData } = await mainSupabase
            .from('friends')
            .select('friend_id')
            .eq('user_id', authUser.id);

        if (!friendsData || friendsData.length === 0) {
            allFriends = [];
            filteredFriends = [];
            renderFriendsList();
            return;
        }

        const friendIds = friendsData.map(f => f.friend_id);

        const { data: profiles } = await mainSupabase
            .from('profiles')
            .select('id, username, avatar_url, status, last_seen')
            .in('id', friendIds)
            .order('username');

        allFriends = profiles || [];

        filteredFriends = [...allFriends];
        renderFriendsList();

    } catch (error) {
        console.error('❌ Load error:', error);
        showEmptyState();
    }
}

// Check for missed calls
async function checkMissedCalls() {
    try {
        if (!mainSupabase || !currentUser) return;

        const { data: calls, error } = await mainSupabase
            .from('calls')
            .select('id')
            .eq('receiver_id', currentUser.id)
            .in('status', ['missed', 'ringing'])
            .eq('seen', false);

        if (error) {
            console.error('Error checking missed calls:', error);
            return;
        }

        missedCallCount = calls?.length || 0;
        updateMissedCallBadge();

    } catch (error) {
        console.error('Error checking missed calls:', error);
    }
}

// Update missed call badge
function updateMissedCallBadge() {
    const badge = document.getElementById('missedCallBadge');
    if (!badge) return;

    if (missedCallCount > 0) {
        badge.textContent = missedCallCount > 9 ? '9+' : missedCallCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// Start periodic status updates
function startStatusUpdates() {
    // Update status immediately
    if (currentUser && currentUser.id && mainSupabase) {
        updateUserStatus(mainSupabase, currentUser.id, 'online');
    }

    // Then update every 30 seconds
    setInterval(() => {
        if (currentUser && currentUser.id && mainSupabase) {
            updateUserStatus(mainSupabase, currentUser.id, 'online');
        }
    }, 30000);

    // Set offline status on page unload
    window.addEventListener('beforeunload', () => {
        if (currentUser && currentUser.id && mainSupabase) {
            updateUserStatus(mainSupabase, currentUser.id, 'offline');
        }
    });
}

// Render friends list
function renderFriendsList() {
    const container = document.getElementById('friendsList');
    if (!container) return;

    if (!filteredFriends || filteredFriends.length === 0) {
        showEmptyState();
        return;
    }

    let html = '';

    filteredFriends.forEach(friend => {
        const initial = friend.username ? friend.username.charAt(0).toUpperCase() : '?';
        const online = friend.status === 'online';
        const lastSeen = friend.last_seen ? formatLastSeen(friend.last_seen) : 'Never';

        html += `
            <div class="friend-item" data-friend-id="${friend.id}">
                <div class="friend-avatar" style="background: linear-gradient(45deg, #007acc, #00b4d8); position: relative;">
                    ${friend.avatar_url 
                        ? `<img src="${friend.avatar_url}" alt="${friend.username}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" loading="lazy">`
                        : `<span style="color:white; font-size:1.3rem; font-weight:600;">${initial}</span>`
                    }
                    <span class="status-indicator-clean ${online ? 'online' : 'offline'}"></span>
                </div>
                <div class="friend-info-clean" onclick="openChat('${friend.id}', '${friend.username}')">
                    <div class="friend-name-status">
                        <div class="friend-name-clean">${friend.username || 'User'}</div>
                        <div class="friend-status-clean">
                            ${online ? '🟢 Online' : `⚪ Last seen ${lastSeen}`}
                        </div>
                    </div>
                </div>
                <button class="call-btn" onclick="event.stopPropagation(); startCall('${friend.id}', '${friend.username}')" ${!online ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                    <i class="fas fa-phone"></i>
                </button>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Show empty state
function showEmptyState() {
    const container = document.getElementById('friendsList');
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">👥</div>
            <h3>No friends yet</h3>
            <p>Add friends from the home page to start calling</p>
        </div>
    `;
}

// Show error
function showError(message) {
    const container = document.getElementById('friendsList');
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">❌</div>
            <h3>Error</h3>
            <p>${message}</p>
            <button class="add-friends-btn" onclick="location.reload()">
                <i class="fas fa-redo"></i> Try Again
            </button>
        </div>
    `;
}

// Format last seen
function formatLastSeen(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now - time) / 60000);

    if (diff < 1) return 'just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    if (diff < 10080) return `${Math.floor(diff / 1440)}d ago`;
    return time.toLocaleDateString();
}

// Search friends
window.searchFriends = function() {
    const input = document.getElementById('searchInput');
    if (!input) return;

    const term = input.value.toLowerCase().trim();
    const clearBtn = document.getElementById('clearSearch');
    if (clearBtn) clearBtn.style.display = term ? 'flex' : 'none';

    filteredFriends = term 
        ? allFriends.filter(f => f.username?.toLowerCase().includes(term))
        : [...allFriends];

    renderFriendsList();
};

// Clear search
window.clearSearch = function() {
    document.getElementById('searchInput').value = '';
    document.getElementById('clearSearch').style.display = 'none';
    filteredFriends = [...allFriends];
    renderFriendsList();
};

// Open chat
window.openChat = function(friendId, friendName) {
    sessionStorage.setItem('currentChatFriend', JSON.stringify({
        id: friendId,
        username: friendName
    }));
    window.location.href = `../../chats/index.html?friendId=${friendId}`;
};

// Navigation
window.goToHome = () => window.location.href = '../../home/index.html';

// Update loading text
function updateLoadingText(text) {
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) {
        loadingText.textContent = text;
    }
}

// Toast
function showToast(type, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Play incoming ringtone
function playIncomingRingtone() {
    const audio = document.getElementById('incomingRingtone');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Audio play failed:', e));
    }
}

// Play outgoing ringtone
function playOutgoingRingtone() {
    const audio = document.getElementById('outgoingRingtone');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Audio play failed:', e));
    }
}

// Stop all ringtones
function stopRingtone() {
    const incomingAudio = document.getElementById('incomingRingtone');
    const outgoingAudio = document.getElementById('outgoingRingtone');

    if (incomingAudio) {
        incomingAudio.pause();
        incomingAudio.currentTime = 0;
    }

    if (outgoingAudio) {
        outgoingAudio.pause();
        outgoingAudio.currentTime = 0;
    }

    if (incomingCallTimeout) {
        clearTimeout(incomingCallTimeout);
        incomingCallTimeout = null;
    }
    if (outgoingCallTimeout) {
        clearTimeout(outgoingCallTimeout);
        outgoingCallTimeout = null;
    }
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (realtimeChannel) {
        mainSupabase?.removeChannel(realtimeChannel);
    }
    stopRingtone();
});

// Start
document.addEventListener('DOMContentLoaded', initFriendsPage);