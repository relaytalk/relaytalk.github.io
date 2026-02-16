// friends.js - UPDATED with new tab and correct URLs

import { initializeSupabase as initMainSupabase } from '../../../utils/supabase.js';
import { initializeSupabase as initCallAppSupabase } from '../../call-app/utils/supabase.js';
import { 
    syncUserToDatabase, 
    getUserFriends,
    updateUserStatus 
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

        // Initialize call listener
        if (!callListenerInitialized && currentUser && currentUser.id) {
            console.log('📞 Initializing call listener...');
            
            initCallListener(callAppSupabase, currentUser, {
                onIncomingCall: (callData) => {
                    console.log('📞🔥 INCOMING CALL:', callData);
                    
                    if (!callData || !callData.callerId) return;
                    
                    if (callData.calleeId === currentUser.id) {
                        incomingCallData = callData;
                        showIncomingCallNotification(callData); // Using new SVG notification
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

        // Hide loading
        const loader = document.getElementById('loadingIndicator');
        if (loader) loader.classList.add('hidden');

    } catch (error) {
        console.error('❌ Init error:', error);
        showError('Failed to load friends: ' + error.message);
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
                        ? `<img src="${friend.avatar_url}" alt="${friend.username}">`
                        : `<span>${initial}</span>`
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
                <button class="call-btn" onclick="event.stopPropagation(); startCall('${friend.id}', '${friend.username}')" ${!online ? 'disabled' : ''}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 15.5c-1.2 0-2.4-.2-3.6-.6-.3-.1-.7 0-1 .2l-2.2 2.2c-2.8-1.4-5.1-3.8-6.5-6.5l2.2-2.2c.2-.2.3-.6.2-1-.4-1.1-.6-2.3-.6-3.6 0-.6-.4-1-1-1H4c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3.5c0-.6-.4-1-1-1z" fill="white"/>
                    </svg>
                </button>
            </div>
        `;
    });

    container.innerHTML = html;
}

// START CALL - OPEN IN NEW TAB
window.startCall = function(friendId, friendName) {
    const friend = allFriends.find(f => f.id === friendId);
    if (!friend || friend.status !== 'online') {
        showToast('error', `${friendName} is offline`);
        return;
    }
    
    console.log(`📞 Starting call to ${friendName}`);
    
    // OPEN IN NEW TAB
    const callUrl = `../../call-app/call/index.html?friendId=${friendId}&friendName=${encodeURIComponent(friendName)}`;
    window.open(callUrl, '_blank');
};

// Show incoming call notification with SVG
function showIncomingCallNotification(callData) {
    // Remove any existing notification
    const existing = document.getElementById('incomingCallNotification');
    if (existing) existing.remove();

    const caller = allFriends.find(f => f.id === callData.callerId) || { username: 'Unknown Caller' };
    
    const notification = document.createElement('div');
    notification.id = 'incomingCallNotification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 10px 25px rgba(0,122,204,0.2);
        width: 320px;
        padding: 20px;
        border-left: 4px solid #007acc;
        z-index: 9999;
        animation: slideInRight 0.3s ease;
    `;

    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
            <div style="width: 50px; height: 50px; background: linear-gradient(45deg, #007acc, #00b4d8); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20px;">
                ${caller.username.charAt(0).toUpperCase()}
            </div>
            <div style="flex: 1;">
                <div style="font-weight: 600; color: #1e293b; margin-bottom: 4px;">${caller.username}</div>
                <div style="color: #007acc; font-size: 14px; display: flex; align-items: center; gap: 4px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 15.5c-1.2 0-2.4-.2-3.6-.6-.3-.1-.7 0-1 .2l-2.2 2.2c-2.8-1.4-5.1-3.8-6.5-6.5l2.2-2.2c.2-.2.3-.6.2-1-.4-1.1-.6-2.3-.6-3.6 0-.6-.4-1-1-1H4c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3.5c0-.6-.4-1-1-1z" fill="#007acc"/>
                    </svg>
                    Incoming call...
                </div>
            </div>
        </div>
        <div style="display: flex; gap: 10px;">
            <button onclick="rejectCall()" style="flex: 1; background: #fee2e2; color: #dc2626; border: none; padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" fill="#dc2626"/>
                </svg>
                Decline
            </button>
            <button onclick="acceptCall()" style="flex: 1; background: #007acc; color: white; border: none; padding: 10px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 15.5c-1.2 0-2.4-.2-3.6-.6-.3-.1-.7 0-1 .2l-2.2 2.2c-2.8-1.4-5.1-3.8-6.5-6.5l2.2-2.2c.2-.2.3-.6.2-1-.4-1.1-.6-2.3-.6-3.6 0-.6-.4-1-1-1H4c-.6 0-1 .4-1 1 0 9.4 7.6 17 17 17 .6 0 1-.4 1-1v-3.5c0-.6-.4-1-1-1z" fill="white"/>
                </svg>
                Accept
            </button>
        </div>
    `;

    document.body.appendChild(notification);

    // Play ringtone
    playRingtone();

    // Auto-hide after 30 seconds
    setTimeout(() => {
        if (document.getElementById('incomingCallNotification')) {
            rejectCall();
        }
    }, 30000);
}

// Accept call - FIXED URL
window.acceptCall = function() {
    if (!incomingCallData) return;
    
    stopRingtone();
    
    // Remove notification
    const notification = document.getElementById('incomingCallNotification');
    if (notification) notification.remove();

    // CORRECT URL
    const url = `../../call-app/call/index.html?incoming=true&room=${incomingCallData.room}&callerId=${incomingCallData.callerId}&callId=${incomingCallData.callId}`;
    console.log('✅ Accepting call, redirecting to:', url);
    
    // Open in new tab
    window.open(url, '_blank');
};

// Reject call
window.rejectCall = async function() {
    stopRingtone();
    
    const notification = document.getElementById('incomingCallNotification');
    if (notification) notification.remove();

    if (incomingCallData?.callId && callAppSupabase) {
        try {
            await callAppSupabase
                .from('calls')
                .update({ 
                    status: 'rejected',
                    ended_at: new Date().toISOString()
                })
                .eq('id', incomingCallData.callId);
            console.log('Call rejected');
        } catch (error) {
            console.error('Error rejecting call:', error);
        }
    }
    
    incomingCallData = null;
    showToast('info', 'Call rejected');
};

// Play ringtone
function playRingtone() {
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

// Stop ringtone
function stopRingtone() {
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
    document.getElementById('clearSearch').style.display = term ? 'flex' : 'none';

    filteredFriends = term 
        ? allFriends.filter(f => f.username?.toLowerCase().includes(term))
        : [...allFriends];

    renderFriendsList();
};

// Clear search
window.clearSearch = function() {
    document.getElementById('searchInput').value = '';
    window.searchFriends();
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
                            ? `<img src="${user.avatar_url}" alt="${user.username}">`
                            : `<span>${initial}</span>`
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
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            ${type === 'success' 
                ? '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#22c55e"/>'
                : type === 'error'
                ? '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#ef4444"/>'
                : '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#007acc"/>'
            }
        </svg>
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

// Start
document.addEventListener('DOMContentLoaded', initFriendsPage);
