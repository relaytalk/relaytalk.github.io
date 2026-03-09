// friends.js - COMPLETE FIXED VERSION WITH PROPER CALL HANDLING
import { initializeSupabase as initMainSupabase } from '../../../utils/supabase.js';
import { 
    syncUserToDatabase, 
    getUserFriends,
    updateUserStatus,
    searchAllUsers,
    sendFriendRequest
} from '../../call-app/utils/userSync.js';
import { initCallListener } from '../../call-app/utils/callListener.js';

let mainSupabase = null;
let currentUser = null;
let authUser = null;
let allFriends = [];
let filteredFriends = [];
let callListenerInitialized = false;
let incomingCallData = null;
let incomingCallTimeout = null; // For auto-reject after 30s
let outgoingCallTimeout = null; // For auto-cancel after 30s
let audioContext = null;
let oscillator = null;
let gainNode = null;
let ringtoneInterval = null;
let missedCallCount = 0;
let loadingSteps = [
    'Connecting to server...',
    'Loading your profile...',
    'Finding your friends...',
    'Setting up calls...',
    'Almost ready...'
];
let currentStep = 0;

// Update loading text
function updateLoadingText(text) {
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) {
        loadingText.textContent = text;
    }
}

// Cycle through loading messages
function startLoadingAnimation() {
    updateLoadingText(loadingSteps[0]);
    
    const interval = setInterval(() => {
        currentStep = (currentStep + 1) % loadingSteps.length;
        updateLoadingText(loadingSteps[currentStep]);
    }, 2000);
    
    return interval;
}

// Initialize
async function initFriendsPage() {
    console.log('🚀 Loading friends with call features...');
    
    // Start loading animation
    const loadingInterval = startLoadingAnimation();

    try {
        // Initialize MAIN Supabase (this uses WORKER URL)
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
        await Promise.all([
            loadFriends(),
            checkMissedCalls()
        ]);

        // Initialize call listener (uses mainSupabase)
        updateLoadingText('Setting up calls...');
        if (!callListenerInitialized && currentUser && currentUser.id) {
            console.log('📞 Initializing call listener...');
            
            initCallListener(mainSupabase, currentUser, {
                onIncomingCall: (callData) => {
                    console.log('📞🔥 INCOMING CALL:', callData);
                    
                    if (!callData || !callData.callerId) return;
                    
                    if (callData.calleeId === currentUser.id) {
                        // Check if we're already showing a notification for this caller
                        const existingNotification = document.getElementById('incomingCallNotification');
                        const existingCallerId = existingNotification?.getAttribute('data-caller-id');
                        
                        // If it's the same caller, don't show duplicate
                        if (existingNotification && existingCallerId === callData.callerId) {
                            console.log('⏭️ Already showing notification for this caller');
                            return;
                        }
                        
                        // If it's a different caller, remove old notification
                        if (existingNotification) {
                            existingNotification.remove();
                            stopRingtone();
                            if (incomingCallTimeout) clearTimeout(incomingCallTimeout);
                        }
                        
                        incomingCallData = callData;
                        showIncomingCallNotification(callData);
                        
                        // Auto-reject after 30 seconds if not answered
                        incomingCallTimeout = setTimeout(() => {
                            console.log('⏰ Incoming call timed out after 30s');
                            if (incomingCallData && incomingCallData.callId) {
                                rejectCall(incomingCallData.callId, true); // true = timeout
                            }
                        }, 30000);
                        
                        // Check missed calls again after incoming call
                        setTimeout(() => checkMissedCalls(), 2000);
                    }
                }
            });
            
            callListenerInitialized = true;
        }

        // Status updates (set after everything loads)
        updateLoadingText('Almost ready...');
        setTimeout(() => {
            setInterval(() => {
                if (currentUser && currentUser.id && mainSupabase) {
                    updateUserStatus(mainSupabase, currentUser.id, 'online');
                }
            }, 30000);
        }, 1000);

        // Check missed calls periodically
        setInterval(() => {
            checkMissedCalls();
        }, 10000);

        // Hide loading
        setTimeout(() => {
            clearInterval(loadingInterval);
            const loader = document.getElementById('loadingIndicator');
            if (loader) loader.classList.add('hidden');
        }, 500);

    } catch (error) {
        console.error('❌ Init error:', error);
        clearInterval(loadingInterval);
        showError('Failed to load friends: ' + error.message);
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

// Update missed call badge on history icon
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

// Render friends list - REMOVED ADD FRIENDS BUTTON
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

// START CALL - FIXED WITH TIMEOUT AND PROPER URL
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
        // Stay on friends page, don't redirect
    }, 30000);
    
    // CORRECT URL for outgoing calls - points to call-app/call
    const callUrl = `../../call-app/call/index.html?friendId=${friendId}&friendName=${encodeURIComponent(friendName)}`;
    window.open(callUrl, '_blank');
};

// Show incoming call notification
function showIncomingCallNotification(callData) {
    // Remove any existing notification
    const existing = document.getElementById('incomingCallNotification');
    if (existing) {
        existing.remove();
        if (incomingCallTimeout) clearTimeout(incomingCallTimeout);
    }

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

    // Auto-reject after 30 seconds (already set in initCallListener, but ensure it's set)
    if (incomingCallTimeout) clearTimeout(incomingCallTimeout);
    incomingCallTimeout = setTimeout(() => {
        console.log('⏰ Auto-rejecting call after 30s timeout');
        if (document.getElementById('incomingCallNotification')) {
            rejectCall(callData.callId, true); // true = timeout
        }
    }, 30000);
}

// Play incoming ringtone
function playIncomingRingtone() {
    const audio = document.getElementById('incomingRingtone');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Audio play failed:', e));
    } else {
        playWebAudioRingtone();
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
    
    // Clear any timeouts
    if (incomingCallTimeout) {
        clearTimeout(incomingCallTimeout);
        incomingCallTimeout = null;
    }
    if (outgoingCallTimeout) {
        clearTimeout(outgoingCallTimeout);
        outgoingCallTimeout = null;
    }
    
    if (ringtoneInterval) {
        clearInterval(ringtoneInterval);
        ringtoneInterval = null;
    }
    if (oscillator) {
        try {
            oscillator.stop();
            oscillator.disconnect();
        } catch (e) {}
        oscillator = null;
    }
    if (audioContext) {
        try {
            audioContext.close();
        } catch (e) {}
        audioContext = null;
    }
}

// Web Audio fallback
function playWebAudioRingtone() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        oscillator = audioContext.createOscillator();
        gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.value = 440;
        gainNode.gain.value = 0.5;
        oscillator.start();
        
        let isOn = true;
        ringtoneInterval = setInterval(() => {
            if (!audioContext) return;
            gainNode.gain.value = isOn ? 0.5 : 0;
            isOn = !isOn;
        }, 500);
        
    } catch (e) {
        console.log('Ringtone not supported:', e);
    }
}

// Accept call - FIXED CORRECT URL
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

    // CORRECT URL - points to call-app/call, NOT home/friends/call
    const url = `../../call-app/call/index.html?incoming=true&room=${incomingCallData.room}&callerId=${incomingCallData.callerId}&callId=${incomingCallData.callId}`;
    console.log('✅ Accepting call, redirecting to:', url);
    
    window.open(url, '_blank');
};

// Reject call - FIXED TO REDIRECT TO FRIENDS PAGE
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
    if (isTimeout) {
        showToast('info', 'Call timed out');
    } else {
        showToast('info', 'Call rejected');
    }
    
    // STAY ON FRIENDS PAGE - don't redirect anywhere
    // Just ensure we're on the friends page
    const currentPath = window.location.pathname;
    if (!currentPath.includes('friends')) {
        window.location.href = '../friends/index.html';
    }
};

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

// Show empty state - REMOVED ADD FRIENDS BUTTON
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

// Open chat
window.openChat = function(friendId, friendName) {
    sessionStorage.setItem('currentChatFriend', JSON.stringify({
        id: friendId,
        username: friendName
    }));
    window.location.href = `../../chats/index.html?friendId=${friendId}`;
};

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

// Navigation
window.goToHome = () => window.location.href = '../../home/index.html';

// REMOVED openSearch function - no more add friends button

window.closeModal = () => {
    document.getElementById('searchModal').style.display = 'none';
    document.getElementById('userSearchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
};

window.logout = async () => {
    if (mainSupabase) await mainSupabase.auth.signOut();
    window.location.href = '../../../pages/login/index.html';
};

// Preload critical resources
function preloadResources() {
    // Preconnect to important domains
    const preconnects = [
        'https://relaytalk-proxy.lusterchat.workers.dev',
        'https://cdnjs.cloudflare.com'
    ];
    
    preconnects.forEach(domain => {
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = domain;
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
    });
    
    // Preload fonts
    const fonts = [
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
        'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2'
    ];
    
    fonts.forEach(font => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'font';
        link.href = font;
        link.type = 'font/woff2';
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
    });
}

// Start
preloadResources();
document.addEventListener('DOMContentLoaded', initFriendsPage);
