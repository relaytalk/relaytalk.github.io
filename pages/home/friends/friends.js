// friends.js - Complete with Notifications modal + realtime friends updates

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
let missedCallCount = 0;
let realtimeChannel = null;
let reconnectAttempts = 0;
let currentNotifTab = 'main';
let friendRealtimeChannel = null;
const MAX_RECONNECT_ATTEMPTS = 5;

// ============================================
// INIT
// ============================================
async function initFriendsPage() {
    console.log('🚀 Loading friends...');

    try {
        updateLoadingText('Connecting to server...');
        mainSupabase = await initMainSupabase();

        if (!mainSupabase || !mainSupabase.auth) {
            throw new Error('Main Supabase not initialized');
        }

        updateLoadingText('Verifying login...');
        const { data: { session }, error } = await mainSupabase.auth.getSession();

        if (error) throw error;

        if (!session) {
            window.location.href = '../../../pages/login/index.html';
            return;
        }

        authUser = session.user;
        console.log('✅ MAIN Auth user:', authUser.email);

        currentUser = await syncUserToDatabase(mainSupabase, {
            id: authUser.id,
            email: authUser.email,
            username: authUser.user_metadata?.username || authUser.email.split('@')[0],
            avatar_url: authUser.user_metadata?.avatar_url || null
        });

        if (!currentUser || !currentUser.id) {
            throw new Error('Failed to sync user to database');
        }

        updateLoadingText('Finding your friends...');
        await loadFriends();

        await checkMissedCalls();
        await updateBadges();

        updateLoadingText('Setting up calls...');
        if (!callListenerInitialized && currentUser && currentUser.id) {
            await initializeCallListener();
            callListenerInitialized = true;
        }

        // 🔥 Realtime friends updates
        setupFriendRealtimeListener();

        // Periodic checks
        setInterval(() => checkMissedCalls(), 10000);
        startStatusUpdates();

        setTimeout(() => {
            const loader = document.getElementById('loadingIndicator');
            if (loader) loader.classList.add('hidden');
        }, 500);

    } catch (error) {
        console.error('❌ Init error:', error);
        showError('Failed to load friends: ' + error.message);
    }
}

// ============================================
// REALTIME FRIENDS + REQUESTS LISTENER
// ============================================
function setupFriendRealtimeListener() {
    if (friendRealtimeChannel) {
        mainSupabase.removeChannel(friendRealtimeChannel);
        friendRealtimeChannel = null;
    }

    console.log('📡 Setting up friend realtime listener');

    friendRealtimeChannel = mainSupabase
        .channel(`friends-realtime:${currentUser.id}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'friends',
            filter: `user_id=eq.${currentUser.id}`
        }, (payload) => {
            console.log('🟢 New friendship inserted:', payload.new);
            loadFriends();
        })
        .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'friends',
            filter: `user_id=eq.${currentUser.id}`
        }, (payload) => {
            console.log('🔴 Friendship removed');
            loadFriends();
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'friend_requests',
            filter: `receiver_id=eq.${currentUser.id}`
        }, (payload) => {
            console.log('📩 New friend request received');
            updateBadges();
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'friend_requests',
            filter: `receiver_id=eq.${currentUser.id}`
        }, (payload) => {
            updateBadges();
        })
        .subscribe((status) => {
            console.log('📡 Friend listener status:', status);
        });
}

// ============================================
// CALL LISTENER (incoming calls)
// ============================================
async function initializeCallListener() {
    try {
        if (realtimeChannel) {
            await mainSupabase.removeChannel(realtimeChannel);
        }

        console.log('📡 Setting up call channel for user:', currentUser.id);

        realtimeChannel = mainSupabase
            .channel(`calls:callee_id=eq.${currentUser.id}`, {
                config: {
                    broadcast: { self: true },
                    presence: { key: currentUser.id }
                }
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'calls',
                filter: `callee_id=eq.${currentUser.id}`
            }, (payload) => {
                console.log('📞 New call detected:', payload);
                handleIncomingCall(payload.new);
            })
            .subscribe((status) => {
                console.log('📡 Call channel status:', status);
                if (status === 'SUBSCRIBED') {
                    reconnectAttempts = 0;
                } else if (status === 'CHANNEL_ERROR') {
                    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        reconnectAttempts++;
                        setTimeout(() => initializeCallListener(), 5000);
                    }
                }
            });
    } catch (error) {
        console.error('❌ Error initializing call listener:', error);
    }
}

function handleIncomingCall(callData) {
    if (!callData || !callData.caller_id) return;
    if (callData.callee_id === currentUser.id && callData.status === 'ringing') {
        // callHub handles the UI now
    }
}

// ============================================
// FRIENDS LIST
// ============================================
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

// ============================================
// SEARCH FRIENDS
// ============================================
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

window.clearSearch = function() {
    document.getElementById('searchInput').value = '';
    document.getElementById('clearSearch').style.display = 'none';
    filteredFriends = [...allFriends];
    renderFriendsList();
};

window.openChat = function(friendId, friendName) {
    sessionStorage.setItem('currentChatFriend', JSON.stringify({
        id: friendId,
        username: friendName
    }));
    window.location.href = `../../chats/index.html?friendId=${friendId}`;
};

window.goToHome = () => window.location.href = '../../home/index.html';

// ============================================
// NOTIFICATIONS MODAL
// ============================================
window.openNotifications = function(event) {
    if (event) event.preventDefault();
    const modal = document.getElementById('notificationsModal');
    if (modal) {
        modal.style.display = 'flex';
        switchNotifTab('main');
        updateBadges();
    }
};

window.switchNotifTab = function(tab) {
    currentNotifTab = tab;

    const mainTab = document.getElementById('notifTabMain');
    const callsTab = document.getElementById('notifTabCalls');
    const mainContent = document.getElementById('notifMainContent');
    const callsContent = document.getElementById('notifCallsContent');

    if (tab === 'main') {
        mainTab.classList.add('active');
        callsTab.classList.remove('active');
        mainContent.classList.add('active');
        callsContent.classList.remove('active');
        loadNotifications();
    } else {
        callsTab.classList.add('active');
        mainTab.classList.remove('active');
        callsContent.classList.add('active');
        mainContent.classList.remove('active');
        loadCallHistory();
    }
};

// ============================================
// LOAD NOTIFICATIONS (Main tab)
// ============================================
async function loadNotifications() {
    const container = document.getElementById('notificationsList');
    if (!container) return;

    try {
        if (!currentUser || !mainSupabase) {
            showEmptyNotifications(container);
            return;
        }

        const { data: notifications, error } = await mainSupabase
            .from('friend_requests')
            .select('id, sender_id, created_at')
            .eq('receiver_id', currentUser.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error || !notifications || notifications.length === 0) {
            showEmptyNotifications(container);
            return;
        }

        const senderIds = notifications.map(n => n.sender_id);
        const { data: profiles } = await mainSupabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', senderIds);

        const profileMap = {};
        if (profiles) profiles.forEach(p => profileMap[p.id] = p);

        let html = '';
        notifications.forEach(notification => {
            const timeAgo = timeAgoShort(notification.created_at);
            const sender = profileMap[notification.sender_id] || { username: 'Unknown' };
            const senderName = sender.username;
            const firstLetter = senderName.charAt(0).toUpperCase();

            html += `
                <div class="notification-item">
                    <div class="notification-avatar" style="background: linear-gradient(45deg, #007acc, #00b4d8);">
                        ${sender.avatar_url
                            ? `<img src="${sender.avatar_url}" alt="${senderName}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
                            : `<span style="color:white; font-size:1rem; font-weight:600;">${firstLetter}</span>`
                        }
                    </div>
                    <div class="notification-content">
                        <strong>${senderName}</strong> wants to be friends
                        <small>${timeAgo}</small>
                    </div>
                    <div class="notification-actions">
                        <button class="btn-small btn-success" onclick="acceptFriendRequest('${notification.id}', '${notification.sender_id}', '${senderName}', this)">✓</button>
                        <button class="btn-small btn-danger" onclick="declineFriendRequest('${notification.id}', this)">✗</button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error("❌ Error loading notifications:", error);
        showEmptyNotifications(container);
    }
}

function showEmptyNotifications(container) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">🔔</div>
            <p>No notifications yet</p>
        </div>
    `;
}

// ============================================
// LOAD CALL HISTORY (Calls tab)
// ============================================
async function loadCallHistory() {
    const container = document.getElementById('callHistoryList');
    if (!container) return;

    try {
        if (!currentUser || !mainSupabase) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">📞</div><p>Cannot load call history</p></div>`;
            return;
        }

        const { data: calls, error } = await mainSupabase
            .from('calls')
            .select('*')
            .or(`caller_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error || !calls || calls.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📞</div>
                    <h3>No calls yet</h3>
                    <p>Your call history will appear here</p>
                </div>
            `;
            return;
        }

        const userIds = new Set();
        calls.forEach(call => {
            if (call.caller_id !== currentUser.id) userIds.add(call.caller_id);
            if (call.receiver_id !== currentUser.id) userIds.add(call.receiver_id);
            if (call.callee_id && call.callee_id !== currentUser.id) userIds.add(call.callee_id);
        });

        let profileMap = {};
        if (userIds.size > 0) {
            const { data: profiles } = await mainSupabase
                .from('profiles')
                .select('id, username, avatar_url')
                .in('id', [...userIds]);
            if (profiles) profiles.forEach(p => profileMap[p.id] = p);
        }

        let html = '';
        let lastDate = '';

        calls.forEach(call => {
            const callDate = new Date(call.created_at).toLocaleDateString();
            if (callDate !== lastDate) {
                lastDate = callDate;
                html += `<div class="call-history-date">${callDate}</div>`;
            }

            const isOutgoing = call.caller_id === currentUser.id;
            const otherUserId = isOut
