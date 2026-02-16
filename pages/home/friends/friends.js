// friends.js - COMPLETE WITH FIXED URL AND MODERN NOTIFICATION

import { initializeSupabase as initMainSupabase } from '../../../utils/supabase.js';
import { initializeSupabase as initCallAppSupabase } from '../../call-app/utils/supabase.js';
import { 
    syncUserToDatabase, 
    getUserFriends,
    updateUserStatus,
    searchAllUsers,
    sendFriendRequest
} from '../../call-app/utils/userSync.js';
import { initCallListener } from '../../call-app/utils/callListener.js';

let mainSupabase = null;
let callAppSupabase = null;
let currentUser = null;
let authUser = null;
let allFriends = [];
let filteredFriends = [];
let callListenerInitialized = false;
let incomingCallData = null;
let audioContext = null;
let oscillator = null;
let gainNode = null;
let ringtoneInterval = null;
let missedCallCount = 0;

// Initialize
async function initFriendsPage() {
    console.log('🚀 Loading friends with call features...');

    try {
        // Initialize MAIN Supabase
        mainSupabase = await initMainSupabase();
        
        // Initialize CALL-APP Supabase
        callAppSupabase = await initCallAppSupabase();

        if (!mainSupabase || !mainSupabase.auth) {
            throw new Error('Main Supabase not initialized');
        }

        // Get session
        const { data: { session }, error } = await mainSupabase.auth.getSession();

        if (error) throw error;

        if (!session) {
            window.location.href = '../../../pages/login/index.html';
            return;
        }

        authUser = session.user;
        console.log('✅ MAIN Auth user:', authUser.email);

        // Sync to CALL-APP database
        currentUser = await syncUserToDatabase(callAppSupabase, {
            id: authUser.id,
            email: authUser.email,
            username: authUser.user_metadata?.username || authUser.email.split('@')[0],
            avatar_url: authUser.user_metadata?.avatar_url || null
        });

        if (!currentUser || !currentUser.id) {
            throw new Error('Failed to sync user to call-app database');
        }

        // Load friends
        await loadFriends();

        // Check for missed calls
        await checkMissedCalls();

        // Initialize call listener
        if (!callListenerInitialized && currentUser && currentUser.id) {
            console.log('📞 Initializing call listener...');
            
            initCallListener(callAppSupabase, currentUser, {
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
                        }
                        
                        incomingCallData = callData;
                        showIncomingCallNotification(callData);
                        
                        // Check missed calls again after incoming call
                        setTimeout(() => checkMissedCalls(), 2000);
                    }
                }
            });
            
            callListenerInitialized = true;
        }

        // Status updates
        setInterval(() => {
            if (currentUser && currentUser.id && callAppSupabase) {
                updateUserStatus(callAppSupabase, currentUser.id, 'online');
            }
        }, 30000);

        // Check missed calls periodically
        setInterval(() => {
            checkMissedCalls();
        }, 10000);

        // Hide loading
        const loader = document.getElementById('loadingIndicator');
        if (loader) loader.classList.add('hidden');

    } catch (error) {
        console.error('❌ Init error:', error);
        showError('Failed to load friends: ' + error.message);
    }
}

// Check for missed calls
async function checkMissedCalls() {
    try {
        if (!callAppSupabase || !currentUser) return;

        const { data: calls, error } = await callAppSupabase
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
        
        // Get real-time status from CALL-APP DB
        if (callAppSupabase && friendIds.length > 0) {
            try {
                const { data: callAppProfiles } = await callAppSupabase
                    .from('profiles')
                    .select('id, status, last_seen')
                    .in('id', friendIds);
                
                if (callAppProfiles) {
                    allFriends = allFriends.map(friend => {
                        const callAppFriend = callAppProfiles.find(cf => cf.id === friend.id);
                        if (callAppFriend) {
                            return {
                                ...friend,
                                status: callAppFriend.status,
                                last_seen: callAppFriend.last_seen
                            };
                        }
                        return friend;
                    });
                }
            } catch (e) {
                console.log('Could not fetch CALL-APP status');
            }
        }
        
        filteredFriends = [...allFriends];
        renderFriendsList();

    } catch (error) {
        console.error('❌ Load error:', error);
        showEmptyState();
    }
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
                        ? `<img src="${friend.avatar_url}" alt="${friend.username}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
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

// START CALL - OPEN IN NEW TAB WITH CORRECT URL
window.startCall = function(friendId, friendName) {
    const friend = allFriends.find(f => f.id === friendId);
    if (!friend || friend.status !== 'online') {
        showToast('error', `${friendName} is offline`);
        return;
    }
    
    console.log(`📞 Starting call to ${friendName}`);
    
    // Play outgoing ringtone
    playOutgoingRingtone();
    
    // CORRECT URL for outgoing calls
    const callUrl = `../../call-app/call/index.html?friendId=${friendId}&friendName=${encodeURIComponent(friendName)}`;
    window.open(callUrl, '_blank');
};

// Show incoming call notification - MODERN STYLE
function showIncomingCallNotification(callData) {
    // Remove any existing notification
    const existing = document.getElementById('incomingCallNotification');
    if (existing) existing.remove();

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
                    ? `<img src="${caller.avatar_url}" alt="${caller.username}">`
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
                <button class="incoming-call-btn decline" onclick="rejectCall('${callData.callId}')">
                    <i class="fas fa-phone-slash"></i>
                </button>
                <button class="incoming-call-btn accept" onclick="acceptCall()">
                    <i class="fas fa-phone"></i>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(notification);
    playIncomingRingtone();

    // Auto-hide after 30 seconds
    setTimeout(() => {
        if (document.getElementById('incomingCallNotification')) {
            rejectCall(callData.callId);
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
window.acceptCall = function() {
    if (!incomingCallData) return;
    
    stopRingtone();
    
    const notification = document.getElementById('incomingCallNotification');
    if (notification) notification.remove();

    if (callAppSupabase && incomingCallData.callerId) {
        callAppSupabase
            .from('calls')
            .update({ 
                status: 'missed',
                ended_at: new Date().toISOString(),
                seen: true
            })
            .eq('caller_id', incomingCallData.callerId)
            .eq('callee_id', currentUser.id)
            .eq('status', 'pending')
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

// Reject call
window.rejectCall = async function(callId) {
    stopRingtone();
    
    const notification = document.getElementById('incomingCallNotification');
    if (notification) notification.remove();

    const callToReject = callId || incomingCallData?.callId;
    
    if (callToReject && callAppSupabase) {
        try {
            await callAppSupabase
                .from('calls')
                .update({ 
                    status: 'rejected',
                    ended_at: new Date().toISOString(),
                    seen: true
                })
                .eq('id', callToReject);
            console.log('Call rejected');
            await checkMissedCalls();
            
        } catch (error) {
            console.error('Error rejecting call:', error);
        }
    }
    
    incomingCallData = null;
    showToast('info', 'Call rejected');
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

// Show empty state
function showEmptyState() {
    const container = document.getElementById('friendsList');
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">👥</div>
            <h3>No friends yet</h3>
            <p>Add friends to start calling</p>
            <button class="add-friends-btn" onclick="openSearch()">
                <i class="fas fa-user-plus"></i> Add Friends
            </button>
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

// Search users
window.searchUsers = async function() {
    if (!mainSupabase || !authUser) return;

    const input = document.getElementById('userSearchInput');
    const container = document.getElementById('searchResults');
    if (!input || !container) return;

    const term = input.value.toLowerCase().trim();

    if (!term || term.length < 2) {
        container.innerHTML = `<div class="empty-search"><i class="fas fa-search"></i><p>Type at least 2 characters</p></div>`;
        return;
    }

    try {
        const { data: friends } = await mainSupabase
            .from('friends')
            .select('friend_id')
            .eq('user_id', authUser.id);

        const friendIds = friends?.map(f => f.friend_id) || [];

        const { data: pending } = await mainSupabase
            .from('friend_requests')
            .select('receiver_id')
            .eq('sender_id', authUser.id)
            .eq('status', 'pending');

        const pendingIds = pending?.map(r => r.receiver_id) || [];

        const { data: users } = await mainSupabase
            .from('profiles')
            .select('id, username, avatar_url')
            .neq('id', authUser.id)
            .ilike('username', `%${term}%`)
            .limit(20);

        if (!users || users.length === 0) {
            container.innerHTML = `<div class="empty-search"><i class="fas fa-user-slash"></i><p>No users found</p></div>`;
            return;
        }

        let html = '';
        users.forEach(user => {
            const isFriend = friendIds.includes(user.id);
            const isPending = pendingIds.includes(user.id);
            const initial = user.username?.charAt(0).toUpperCase() || '?';

            html += `
                <div class="search-result-item">
                    <div class="search-result-avatar" style="background: linear-gradient(45deg, #007acc, #00b4d8);">
                        ${user.avatar_url 
                            ? `<img src="${user.avatar_url}" alt="${user.username}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
                            : `<span style="color:white; font-size:1.2rem; font-weight:600;">${initial}</span>`
                        }
                    </div>
                    <div class="search-result-info">
                        <div class="search-result-name">${user.username}</div>
                        <div class="search-result-username">@${user.username}</div>
                    </div>
                    ${isFriend 
                        ? '<button class="add-friend-btn added" disabled>✓ Friends</button>'
                        : isPending
                        ? '<button class="add-friend-btn added" disabled>⏳ Sent</button>'
                        : `<button class="add-friend-btn" onclick="sendFriendRequest('${user.id}', '${user.username}', this)">+ Add</button>`
                    }
                </div>
            `;
        });

        container.innerHTML = html;

    } catch (error) {
        console.error('Search error:', error);
        container.innerHTML = `<div class="empty-search"><i class="fas fa-exclamation-triangle"></i><p>Error searching</p></div>`;
    }
};

// Send friend request
window.sendFriendRequest = async function(userId, username, btn) {
    try {
        btn.disabled = true;
        btn.textContent = 'Sending...';

        const { error } = await mainSupabase
            .from('friend_requests')
            .insert({
                sender_id: authUser.id,
                receiver_id: userId,
                status: 'pending',
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        btn.textContent = '✓ Sent';
        btn.classList.add('added');
        showToast('success', `Request sent to ${username}`);

    } catch (error) {
        console.error('Request error:', error);
        btn.disabled = false;
        btn.textContent = '+ Add';
        showToast('error', 'Failed to send request');
    }
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
window.openSearch = () => {
    document.getElementById('searchModal').style.display = 'flex';
    setTimeout(() => document.getElementById('userSearchInput')?.focus(), 100);
};
window.closeModal = () => {
    document.getElementById('searchModal').style.display = 'none';
    document.getElementById('userSearchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
};
window.logout = async () => {
    if (mainSupabase) await mainSupabase.auth.signOut();
    window.location.href = '../../../pages/login/index.html';
};

// Start
document.addEventListener('DOMContentLoaded', initFriendsPage);
