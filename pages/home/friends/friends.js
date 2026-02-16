// friends.js - USING BOTH SUPABASE INSTANCES (Main for auth/friends, Call-app for calls)

import { initializeSupabase as initMainSupabase } from '../../../utils/supabase.js';
import { initializeSupabase as initCallAppSupabase } from '../../call-app/utils/supabase.js';
import { 
    syncUserToDatabase, 
    getUserFriends,
    updateUserStatus 
} from '../../call-app/utils/userSync.js';
import { initCallListener } from '../../call-app/utils/callListener.js';

let mainSupabase = null;      // For auth and friends (your main app)
let callAppSupabase = null;   // For calls (the special Daily.co Supabase)
let currentUser = null;       // Call-app user (from call-app DB)
let authUser = null;          // Main app user (from auth)
let allFriends = [];
let filteredFriends = [];
let callListenerInitialized = false;
let incomingCallData = null;
let audioContext = null;
let oscillator = null;
let gainNode = null;
let ringtoneInterval = null;

// Initialize with both Supabase instances
async function initFriendsPage() {
    console.log('🚀 Loading friends with call features (dual Supabase mode)...');

    try {
        // Initialize MAIN Supabase (for auth and friends)
        console.log('📡 Initializing MAIN Supabase...');
        mainSupabase = await initMainSupabase();
        
        // Initialize CALL-APP Supabase (for calls)
        console.log('📞 Initializing CALL-APP Supabase...');
        callAppSupabase = await initCallAppSupabase();

        if (!mainSupabase || !mainSupabase.auth) {
            throw new Error('Main Supabase not initialized');
        }

        if (!callAppSupabase) {
            throw new Error('Call-app Supabase not initialized');
        }

        // Get session from MAIN Supabase
        const { data: { session }, error } = await mainSupabase.auth.getSession();

        if (error) throw error;

        if (!session) {
            console.log('🚫 No session, redirecting to login...');
            window.location.href = '../../../pages/login/index.html';
            return;
        }

        authUser = session.user;
        console.log('✅ MAIN Auth user:', authUser.email);
        console.log('✅ MAIN User ID:', authUser.id);

        // Sync user to CALL-APP database (this creates user in call-app DB with same ID)
        console.log('🔄 Syncing user to CALL-APP database...');
        currentUser = await syncUserToDatabase(callAppSupabase, {
            id: authUser.id,
            email: authUser.email,
            username: authUser.user_metadata?.username || authUser.email.split('@')[0],
            avatar_url: authUser.user_metadata?.avatar_url || null
        });
        console.log('✅ CALL-APP user synced:', currentUser);

        if (!currentUser || !currentUser.id) {
            throw new Error('Failed to sync user to call-app database');
        }

        console.log('✅ CALL-APP User ID:', currentUser.id);

        // Load friends from MAIN Supabase
        await loadFriends();

        // Initialize call listener with CALL-APP Supabase
        if (!callListenerInitialized && currentUser && currentUser.id) {
            console.log('📞 Initializing call listener with CALL-APP Supabase for user:', currentUser.id);
            
            // Make sure we pass the correct user object
            const callListenerUser = {
                id: currentUser.id,
                username: currentUser.username || authUser.email.split('@')[0]
            };
            
            // Initialize listener with callback
            initCallListener(callAppSupabase, callListenerUser, {
                onIncomingCall: (callData) => {
                    console.log('📞🔥 INCOMING CALL RECEIVED:', callData);
                    
                    if (!callData || !callData.callerId) {
                        console.error('❌ Invalid call data:', callData);
                        return;
                    }
                    
                    // Check if this call is for the current user
                    if (callData.calleeId === currentUser.id) {
                        console.log('✅ This call is for me! Showing modal...');
                        incomingCallData = callData;
                        showIncomingCallModal(callData);
                    } else {
                        console.log('⏭️ Call not for me (me:', currentUser.id, 'callee:', callData.calleeId, ')');
                    }
                }
            });
            
            callListenerInitialized = true;
            console.log('✅ Call listener initialized successfully with CALL-APP Supabase');
        } else {
            console.log('⚠️ Call listener NOT initialized - missing user or already initialized');
        }

        // Update status periodically in CALL-APP database
        setInterval(() => {
            if (currentUser && currentUser.id && callAppSupabase) {
                updateUserStatus(callAppSupabase, currentUser.id, 'online');
                console.log('🟢 Updated online status in CALL-APP DB');
            }
        }, 30000);

        // Hide loading indicator
        const loader = document.getElementById('loadingIndicator');
        if (loader) loader.classList.add('hidden');

        console.log('✅ Friends page ready with call features!');

    } catch (error) {
        console.error('❌ Init error:', error);
        showError('Failed to load friends: ' + error.message);
    }
}

// Load friends from MAIN Supabase
async function loadFriends() {
    try {
        if (!authUser || !mainSupabase) {
            console.log('⏳ Waiting for auth user or main Supabase...');
            return;
        }

        console.log('🔍 Loading friends for user:', authUser.id);
        
        // Get friend IDs from MAIN Supabase
        const { data: friendsData, error: friendsError } = await mainSupabase
            .from('friends')
            .select('friend_id')
            .eq('user_id', authUser.id);

        if (friendsError) throw friendsError;

        if (!friendsData || friendsData.length === 0) {
            console.log('📭 No friends found in MAIN DB');
            allFriends = [];
            filteredFriends = [];
            renderFriendsList();
            return;
        }

        const friendIds = friendsData.map(f => f.friend_id);
        console.log('👥 Friend IDs:', friendIds);
        
        // Get friend profiles from MAIN Supabase
        const { data: profiles, error: profilesError } = await mainSupabase
            .from('profiles')
            .select('id, username, avatar_url, status, last_seen')
            .in('id', friendIds)
            .order('username');

        if (profilesError) throw profilesError;

        // For online status, we need to check CALL-APP DB
        // But for now, we'll use MAIN DB status
        allFriends = profiles || [];
        
        // Try to get real-time status from CALL-APP DB
        if (callAppSupabase && friendIds.length > 0) {
            try {
                const { data: callAppProfiles } = await callAppSupabase
                    .from('profiles')
                    .select('id, status, last_seen')
                    .in('id', friendIds);
                
                if (callAppProfiles) {
                    // Merge CALL-APP status into MAIN profiles
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
                console.log('Could not fetch CALL-APP status:', e);
            }
        }
        
        filteredFriends = [...allFriends];
        console.log(`✅ Loaded ${allFriends.length} friends`);
        renderFriendsList();

    } catch (error) {
        console.error('❌ Load error:', error);
        showEmptyState();
    }
}

// Render friends list WITH CALL BUTTONS
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

// START CALL - with correct URL
window.startCall = function(friendId, friendName) {
    // Check if friend is online
    const friend = allFriends.find(f => f.id === friendId);
    if (!friend || friend.status !== 'online') {
        showToast('error', `${friendName} is offline`);
        return;
    }
    
    console.log(`📞 Starting call to ${friendName} (${friendId})`);
    // CORRECT URL: /pages/call-app/call/index.html
    window.location.href = `../../call-app/call/index.html?friendId=${friendId}&friendName=${encodeURIComponent(friendName)}`;
};

// Show incoming call modal
function showIncomingCallModal(callData) {
    const modal = document.getElementById('incomingCallModal');
    if (!modal) return;
    
    const callerNameEl = document.getElementById('callerName');
    const callerInitialEl = document.getElementById('callerInitial');
    
    // Find caller in friends list
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
    
    // CORRECT URL for incoming call
    const url = `../../call-app/call/index.html?incoming=true&room=${incomingCallData.room}&callerId=${incomingCallData.callerId}&callId=${incomingCallData.callId}`;
    console.log('✅ Accepting call, redirecting to:', url);
    window.location.href = url;
};

// Reject call
window.rejectCall = function() {
    stopRingtone();
    document.getElementById('incomingCallModal').style.display = 'none';
    
    // TODO: Add API call to reject call in call-app DB
    console.log('❌ Call rejected:', incomingCallData?.callId);
    
    // You could call an API to update call status
    if (incomingCallData?.callId && callAppSupabase) {
        callAppSupabase
            .from('calls')
            .update({ status: 'rejected' })
            .eq('id', incomingCallData.callId)
            .then(() => console.log('Call marked as rejected'));
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

// Search users to add as friends (using MAIN Supabase)
window.searchUsers = async function() {
    if (!mainSupabase || !authUser) return;

    const input = document.getElementById('userSearchInput');
    const container = document.getElementById('searchResults');
    if (!input || !container) return;

    const term = input.value.toLowerCase().trim();

    if (!term || term.length < 2) {
        container.innerHTML = `<div class="empty-search"><i class="fas fa-search"></i><p>Type at least 2 characters to search</p></div>`;
        return;
    }

    try {
        // Get existing friends
        const { data: friends } = await mainSupabase
            .from('friends')
            .select('friend_id')
            .eq('user_id', authUser.id);

        const friendIds = friends?.map(f => f.friend_id) || [];

        // Get pending requests
        const { data: pending } = await mainSupabase
            .from('friend_requests')
            .select('receiver_id')
            .eq('sender_id', authUser.id)
            .eq('status', 'pending');

        const pendingIds = pending?.map(r => r.receiver_id) || [];

        // Search users
        const { data: users, error } = await mainSupabase
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
        container.innerHTML = `<div class="empty-search"><i class="fas fa-exclamation-triangle"></i><p>Error searching users</p></div>`;
    }
};

// Send friend request (in MAIN Supabase)
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
        showToast('success', `Friend request sent to ${username}`);

    } catch (error) {
        console.error('Request error:', error);
        btn.disabled = false;
        btn.textContent = '+ Add';
        showToast('error', 'Failed to send request');
    }
};

// Toast notification
function showToast(type, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
    
    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Navigation
window.goToHome = () => window.location.href = '../../home/index.html';

window.openSearch = () => {
    const modal = document.getElementById('searchModal');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => document.getElementById('userSearchInput')?.focus(), 100);
    }
};

window.closeModal = () => {
    document.getElementById('searchModal').style.display = 'none';
    document.getElementById('userSearchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
};

window.logout = async () => {
    if (mainSupabase) await mainSupabase.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    
    document.cookie.split(";").forEach(function(c) {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    
    window.location.href = '../../../pages/login/index.html';
};

// Start the app
document.addEventListener('DOMContentLoaded', initFriendsPage);
