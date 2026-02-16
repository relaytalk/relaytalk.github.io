// friends.js - WITH FULL CALL FUNCTIONALITY (FIXED listener)

import { initializeSupabase, supabase as supabaseClient } from '../../../utils/supabase.js';
import { 
    syncUserToDatabase, 
    getUserFriends,
    updateUserStatus 
} from '../../call-app/utils/userSync.js';
import { initCallListener } from '../../call-app/utils/callListener.js';

let supabase = null;
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

// Initialize with Supabase wait
async function initFriendsPage() {
    console.log('Loading friends with call features...');

    try {
        supabase = await initializeSupabase();

        if (!supabase || !supabase.auth) {
            throw new Error('Supabase not initialized');
        }

        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (!session) {
            window.location.href = '../../../pages/login/index.html';
            return;
        }

        authUser = session.user;
        console.log('✅ Auth user:', authUser.email);

        // STEP 1: Sync user to call-app database
        console.log('🔄 Syncing user to call-app database...');
        currentUser = await syncUserToDatabase(supabase, authUser);
        console.log('✅ Call-app user synced:', currentUser);

        if (!currentUser || !currentUser.id) {
            throw new Error('Failed to sync user to call-app database');
        }

        // STEP 2: Load friends
        await loadFriends();

        // STEP 3: Initialize call listener with the CORRECT user
        if (!callListenerInitialized && currentUser && currentUser.id) {
            console.log('📞 Initializing call listener for user:', currentUser.id);
            
            // Create user object for call listener
            const callListenerUser = {
                id: currentUser.id,
                username: currentUser.username || authUser.email.split('@')[0]
            };
            
            // Initialize listener with callback
            initCallListener(supabase, callListenerUser, {
                onIncomingCall: (callData) => {
                    console.log('📞🔥 INCOMING CALL RECEIVED:', callData);
                    
                    if (!callData || !callData.callerId) {
                        console.error('Invalid call data:', callData);
                        return;
                    }
                    
                    // Check if this call is for the current user
                    if (callData.calleeId === currentUser.id) {
                        console.log('✅ This call is for me!');
                        incomingCallData = callData;
                        showIncomingCallModal(callData);
                    } else {
                        console.log('⏭️ Call not for me, ignoring');
                    }
                }
            });
            
            callListenerInitialized = true;
            console.log('✅ Call listener initialized successfully');
        }

        // STEP 4: Update status periodically
        setInterval(() => {
            if (currentUser && currentUser.id) {
                updateUserStatus(supabase, currentUser.id, 'online');
            }
        }, 30000);

        const loader = document.getElementById('loadingIndicator');
        if (loader) loader.classList.add('hidden');

    } catch (error) {
        console.error('Init error:', error);
        showError('Failed to load friends: ' + error.message);
    }
}

// Load friends
async function loadFriends() {
    try {
        if (!currentUser || !currentUser.id || !supabase) {
            console.log('Waiting for user...');
            return;
        }

        console.log('Loading friends for user:', currentUser.id);
        const friends = await getUserFriends(supabase, currentUser.id);
        
        allFriends = friends || [];
        filteredFriends = [...allFriends];
        console.log(`✅ Loaded ${allFriends.length} friends`);
        renderFriendsList();

    } catch (error) {
        console.error('Load error:', error);
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
                <div class="friend-info-clean" style="flex: 1; cursor: pointer;" onclick="openChat('${friend.id}', '${friend.username}')">
                    <div class="friend-name-status">
                        <div class="friend-name-clean">${friend.username || 'User'}</div>
                        <div class="friend-status-clean">
                            ${online ? 'Online' : `Last seen ${lastSeen}`}
                        </div>
                    </div>
                </div>
                <button class="call-btn" onclick="event.stopPropagation(); startCall('${friend.id}', '${friend.username}')">
                    <i class="fas fa-phone"></i>
                </button>
            </div>
        `;
    });

    container.innerHTML = html;
}

// START CALL
window.startCall = function(friendId, friendName) {
    const friend = allFriends.find(f => f.id === friendId);
    if (!friend || friend.status !== 'online') {
        showToast('error', `${friendName} is offline`);
        return;
    }
    
    console.log(`📞 Starting call to ${friendName} (${friendId})`);
    window.location.href = `../../call-app/call/index.html?friendId=${friendId}&friendName=${encodeURIComponent(friendName)}`;
};

// Show incoming call modal
function showIncomingCallModal(callData) {
    const modal = document.getElementById('incomingCallModal');
    if (!modal) return;
    
    const callerNameEl = document.getElementById('callerName');
    const callerInitialEl = document.getElementById('callerInitial');
    
    const caller = allFriends.find(f => f.id === callData.callerId) || { username: 'Unknown Caller' };
    
    callerNameEl.textContent = caller.username;
    callerInitialEl.textContent = caller.username.charAt(0).toUpperCase();
    
    modal.style.display = 'flex';
    playRingtone();
    
    console.log('📲 Showing incoming call modal for:', caller.username);
}

// Accept call
window.acceptCall = function() {
    if (!incomingCallData) return;
    
    stopRingtone();
    document.getElementById('incomingCallModal').style.display = 'none';
    
    const url = `../../call-app/call/index.html?incoming=true&room=${incomingCallData.room}&callerId=${incomingCallData.callerId}&callId=${incomingCallData.callId}`;
    console.log('✅ Accepting call, redirecting to:', url);
    window.location.href = url;
};

// Reject call
window.rejectCall = function() {
    stopRingtone();
    document.getElementById('incomingCallModal').style.display = 'none';
    
    // TODO: Add API call to reject call
    console.log('❌ Call rejected:', incomingCallData?.callId);
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
            if (!audioContext) {
                clearInterval(ringtoneInterval);
                return;
            }
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
    const clearBtn = document.getElementById('clearSearch');
    if (!input) return;

    const term = input.value.toLowerCase().trim();

    if (clearBtn) clearBtn.style.display = term ? 'flex' : 'none';

    filteredFriends = term 
        ? allFriends.filter(f => f.username?.toLowerCase().includes(term))
        : [...allFriends];

    renderFriendsList();
};

// Clear search
window.clearSearch = function() {
    const input = document.getElementById('searchInput');
    if (input) {
        input.value = '';
        window.searchFriends();
    }
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
    if (!supabase || !authUser) return;

    const input = document.getElementById('userSearchInput');
    const container = document.getElementById('searchResults');
    if (!input || !container) return;

    const term = input.value.toLowerCase().trim();

    if (!term) {
        container.innerHTML = `<div class="empty-search"><i class="fas fa-search"></i><p>Search for friends to add</p></div>`;
        return;
    }

    try {
        const { data: friends } = await supabase
            .from('friends')
            .select('friend_id')
            .eq('user_id', authUser.id);

        const friendIds = friends?.map(f => f.friend_id) || [];

        const { data: pending } = await supabase
            .from('friend_requests')
            .select('receiver_id')
            .eq('sender_id', authUser.id)
            .eq('status', 'pending');

        const pendingIds = pending?.map(r => r.receiver_id) || [];

        const { data: users, error } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .neq('id', authUser.id)
            .ilike('username', `%${term}%`)
            .limit(20);

        if (error) throw error;

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
                    <div class="search-result-avatar">
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
        container.innerHTML = `<div class="empty-search"><i class="fas fa-exclamation-triangle"></i><p>Error searching users</p></div>`;
    }
};

// Send friend request
window.sendFriendRequest = async function(userId, username, btn) {
    try {
        btn.disabled = true;
        btn.textContent = 'Sending...';

        const { error } = await supabase
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
        showToast('success', `Friend request sent to ${username}`);

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
};
window.logout = async () => {
    if (supabase) await supabase.auth.signOut();
    window.location.href = '../../../pages/login/index.html';
};

// Start
document.addEventListener('DOMContentLoaded', initFriendsPage);