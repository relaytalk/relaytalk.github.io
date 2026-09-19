// friends.js - Friends page controller (design updated, backend unchanged)

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

    const loader = document.getElementById('loadingIndicator');

    const forceHideTimeout = setTimeout(() => {
        if (loader && !loader.classList.contains('hidden')) {
            console.warn('⏱️ Loading timeout reached — hiding loader');
            loader.classList.add('hidden');
            setTimeout(() => { loader.style.display = 'none'; }, 400);
        }
    }, 4000);

    const hideLoader = () => {
        clearTimeout(forceHideTimeout);
        if (loader && !loader.classList.contains('hidden')) {
            loader.classList.add('hidden');
            setTimeout(() => { loader.style.display = 'none'; }, 400);
        }
    };

    try {
        mainSupabase = await initMainSupabase();

        if (!mainSupabase || !mainSupabase.auth) {
            throw new Error('Main Supabase not initialized');
        }

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

        await loadFriends();
        await checkMissedCalls();
        await updateBadges();

        if (!callListenerInitialized && currentUser && currentUser.id) {
            await initializeCallListener();
            callListenerInitialized = true;
        }

        setupFriendRealtimeListener();

        setInterval(() => checkMissedCalls(), 10000);
        startStatusUpdates();

        hideLoader();

    } catch (error) {
        console.error('❌ Init error:', error);
        showError('Failed to load friends: ' + error.message);
        hideLoader();
    }
}

// ============================================
// REALTIME FRIENDS LISTENER
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
            event: 'INSERT', schema: 'public', table: 'friends',
            filter: `user_id=eq.${currentUser.id}`
        }, (payload) => {
            console.log('🟢 New friendship inserted:', payload.new);
            loadFriends();
        })
        .on('postgres_changes', {
            event: 'DELETE', schema: 'public', table: 'friends',
            filter: `user_id=eq.${currentUser.id}`
        }, () => {
            console.log('🔴 Friendship removed');
            loadFriends();
        })
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'friend_requests',
            filter: `receiver_id=eq.${currentUser.id}`
        }, () => {
            console.log('📩 New friend request received');
            updateBadges();
        })
        .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'friend_requests',
            filter: `receiver_id=eq.${currentUser.id}`
        }, () => {
            updateBadges();
        })
        .subscribe((status) => {
            console.log('📡 Friend listener status:', status);
        });
}

// ============================================
// CALL LISTENER
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
                event: 'INSERT', schema: 'public', table: 'calls',
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
        // callHub handles the UI
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
        const avatarSrc = friend.avatar_url || '';

        html += `
            <div class="friend-item" data-friend-id="${friend.id}">
                <div class="friend-avatar" onclick="event.stopPropagation(); openProfile('${friend.id}')">
                    ${avatarSrc
                        ? `<img src="${avatarSrc}" alt="${escapeHtml(friend.username || '')}" loading="lazy">`
                        : `<span>${escapeHtml(initial)}</span>`
                    }
                    <span class="status-indicator-clean ${online ? 'online' : 'offline'}"></span>
                </div>
                <div class="friend-info-clean" onclick="openProfile('${friend.id}')">
                    <div class="friend-name-status">
                        <div class="friend-name-clean">${escapeHtml(friend.username || 'User')}</div>
                        <div class="friend-status-clean ${online ? 'online' : ''}">
                            ${online ? 'Online' : `Last seen ${lastSeen}`}
                        </div>
                    </div>
                </div>
                <div class="friend-actions">
                    <button class="action-btn message-btn"
                            onclick="event.stopPropagation(); openChat('${friend.id}', '${escapeAttr(friend.username || 'Friend')}')"
                            aria-label="Message"
                            title="Message">
                        <i class="fas fa-comment-dots"></i>
                    </button>
                    <button class="action-btn call-btn"
                            onclick="event.stopPropagation(); startCall('${friend.id}', '${escapeAttr(friend.username || 'Friend')}')"
                            aria-label="Call"
                            title="Call">
                        <i class="fas fa-phone"></i>
                    </button>
                </div>
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
            <div class="empty-icon">
                <i class="fas fa-user-friends"></i>
            </div>
            <h3 class="empty-title">No friends yet</h3>
            <p class="empty-desc">Add friends from the home page to start chatting and calling</p>
        </div>
    `;
}

function showError(message) {
    const container = document.getElementById('friendsList');
    if (!container) return;

    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon" style="background: var(--danger-soft); color: var(--danger);">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <h3 class="empty-title">Something went wrong</h3>
            <p class="empty-desc">${escapeHtml(message)}</p>
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

// ============================================
// NAVIGATION — correct paths
// ============================================
window.openChat = function(friendId, friendName) {
    sessionStorage.setItem('currentChatFriend', JSON.stringify({
        id: friendId,
        username: friendName
    }));
    window.location.href = `../../chats/index.html?friendId=${friendId}`;
};

window.openProfile = function(userId) {
    if (!userId) return;
    window.location.href = `../profile/view.html?userId=${encodeURIComponent(userId)}`;
};

window.goToHome = () => window.location.href = '../index.html';

window.startCall = function(friendId, friendName) {
    if (!friendId) return;

    sessionStorage.setItem('currentCallTarget', JSON.stringify({
        id: friendId,
        username: friendName || 'Friend'
    }));

    window.location.href = `../../chats/index.html?friendId=${friendId}&call=1`;
};

// ============================================
// NOTIFICATIONS MODAL
// ============================================
window.openNotifications = function(event) {
    if (event) event.preventDefault();
    const modal = document.getElementById('notificationsModal');
    if (modal) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('visible'));
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
// LOAD NOTIFICATIONS
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
            const initial = senderName.charAt(0).toUpperCase();
            const avatarSrc = sender.avatar_url || '';

            html += `
                <div class="notification-item">
                    <div class="notification-avatar">
                        ${avatarSrc
                            ? `<img src="${avatarSrc}" alt="${escapeHtml(senderName)}">`
                            : `<span>${escapeHtml(initial)}</span>`
                        }
                    </div>
                    <div class="notification-content">
                        <div class="notification-text">
                            <strong>${escapeHtml(senderName)}</strong> wants to be friends
                            <span class="notification-time">${timeAgo}</span>
                        </div>
                    </div>
                    <div class="notification-actions">
                        <button class="btn-small btn-success" onclick="acceptFriendRequest('${notification.id}', '${notification.sender_id}', '${escapeAttr(senderName)}', this)" aria-label="Accept">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn-small btn-danger" onclick="declineFriendRequest('${notification.id}', this)" aria-label="Decline">
                            <i class="fas fa-times"></i>
                        </button>
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
            <div class="empty-icon">
                <i class="fas fa-bell-slash"></i>
            </div>
            <p class="empty-desc">No notifications yet</p>
        </div>
    `;
}

// ============================================
// LOAD CALL HISTORY — call button removed
// ============================================
async function loadCallHistory() {
    const container = document.getElementById('callHistoryList');
    if (!container) return;

    try {
        if (!currentUser || !mainSupabase) {
            container.innerHTML = `<div class="empty-state"><p>Cannot load call history</p></div>`;
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
                    <div class="empty-icon">
                        <i class="fas fa-phone-slash"></i>
                    </div>
                    <h3 class="empty-title">No calls yet</h3>
                    <p class="empty-desc">Your call history will appear here</p>
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
            const otherUserId = isOutgoing ? (call.receiver_id || call.callee_id) : (call.caller_id || call.callee_id);
            const otherUser = profileMap[otherUserId] || { username: 'Unknown' };

            let metaIcon = 'fa-arrow-down';
            let metaClass = 'meta-incoming';
            let metaText = 'Incoming';
            let isMissed = false;

            if (isOutgoing) {
                metaIcon = 'fa-arrow-up';
                metaClass = 'meta-outgoing';
                metaText = 'Outgoing';
            }

            if (call.status === 'missed' || call.status === 'cancelled' || call.status === 'rejected') {
                if (!isOutgoing || call.status === 'rejected') {
                    metaIcon = 'fa-phone-slash';
                    metaClass = 'meta-missed';
                    metaText = 'Missed';
                    isMissed = true;
                }
            } else if (call.status === 'ringing' && !isOutgoing) {
                metaIcon = 'fa-phone-slash';
                metaClass = 'meta-missed';
                metaText = 'Missed';
                isMissed = true;
            }

            const time = new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const initial = otherUser.username ? otherUser.username.charAt(0).toUpperCase() : '?';
            const avatarSrc = otherUser.avatar_url || '';

            html += `
                <div class="call-history-item">
                    <div class="call-history-avatar">
                        ${avatarSrc
                            ? `<img src="${avatarSrc}" alt="${escapeHtml(otherUser.username || '')}">`
                            : `<span>${escapeHtml(initial)}</span>`
                        }
                    </div>
                    <div class="call-history-info">
                        <div class="call-history-name ${isMissed ? 'missed' : ''}">${escapeHtml(otherUser.username || 'Unknown')}</div>
                        <div class="call-history-meta">
                            <i class="fas ${metaIcon} ${metaClass}"></i>
                            <span>${metaText}</span>
                            <span class="dot">•</span>
                            <span>${time}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error("❌ Error loading call history:", error);
        container.innerHTML = `<div class="empty-state"><p>Could not load call history</p></div>`;
    }
}

// ============================================
// BADGES
// ============================================
async function updateBadges() {
    try {
        if (!currentUser || !mainSupabase) return;

        const { data: friendReqs } = await mainSupabase
            .from('friend_requests')
            .select('id')
            .eq('receiver_id', currentUser.id)
            .eq('status', 'pending');

        const pendingCount = friendReqs?.length || 0;

        const { count: missedCount } = await mainSupabase
            .from('calls')
            .select('*', { count: 'exact', head: true })
            .eq('callee_id', currentUser.id)
            .eq('seen', false)
            .in('status', ['missed', 'rejected']);

        const notifBadge = document.getElementById('notificationBadge');
        const total = pendingCount + (missedCount || 0);
        if (notifBadge) {
            if (total > 0) {
                notifBadge.textContent = total > 9 ? '9+' : total;
                notifBadge.style.display = 'flex';
            } else {
                notifBadge.style.display = 'none';
            }
        }

        const mainTabBadge = document.getElementById('mainTabBadge');
        if (mainTabBadge) {
            if (pendingCount > 0) {
                mainTabBadge.textContent = pendingCount > 9 ? '9+' : pendingCount;
                mainTabBadge.style.display = 'inline-flex';
            } else {
                mainTabBadge.style.display = 'none';
            }
        }

        const callsTabBadge = document.getElementById('callsTabBadge');
        if (callsTabBadge) {
            if (missedCount && missedCount > 0) {
                callsTabBadge.textContent = missedCount > 9 ? '9+' : missedCount;
                callsTabBadge.style.display = 'inline-flex';
            } else {
                callsTabBadge.style.display = 'none';
            }
        }
    } catch (e) {
        // silent
    }
}

async function checkMissedCalls() {
    try {
        if (!mainSupabase || !currentUser) return;

        const { count } = await mainSupabase
            .from('calls')
            .select('*', { count: 'exact', head: true })
            .eq('callee_id', currentUser.id)
            .eq('seen', false)
            .in('status', ['missed', 'rejected']);

        missedCallCount = count || 0;
        updateBadges();
    } catch (error) {
        console.error('Error checking missed calls:', error);
    }
}

// ============================================
// ACCEPT / DECLINE FRIEND REQUEST
// ============================================
window.acceptFriendRequest = async function(requestId, senderId, senderName, button) {
    if (button) {
        button.innerHTML = '...';
        button.disabled = true;
    }

    try {
        await mainSupabase
            .from('friend_requests')
            .update({ status: 'accepted', updated_at: new Date().toISOString() })
            .eq('id', requestId);

        await mainSupabase.from('friends').insert({
            user_id: currentUser.id,
            friend_id: senderId,
            created_at: new Date().toISOString()
        });

        await mainSupabase.from('friends').insert({
            user_id: senderId,
            friend_id: currentUser.id,
            created_at: new Date().toISOString()
        });

        showToast('success', `You are now friends with ${senderName}!`);

        await loadFriends();
        await loadNotifications();
        await updateBadges();

    } catch (error) {
        console.error('Accept error:', error);
        showToast('error', 'Could not accept request');
        if (button) {
            button.innerHTML = '<i class="fas fa-check"></i>';
            button.disabled = false;
        }
    }
};

window.declineFriendRequest = async function(requestId, button) {
    if (button) {
        button.innerHTML = '...';
        button.disabled = true;
    }

    try {
        await mainSupabase
            .from('friend_requests')
            .update({ status: 'rejected', updated_at: new Date().toISOString() })
            .eq('id', requestId);

        showToast('info', 'Request declined');

        await loadNotifications();
        await updateBadges();

    } catch (error) {
        console.error('Decline error:', error);
        if (button) {
            button.innerHTML = '<i class="fas fa-times"></i>';
            button.disabled = false;
        }
    }
};

// ============================================
// HELPERS
// ============================================
function timeAgoShort(dateStr) {
    const now = new Date();
    const past = new Date(dateStr);
    const diffMins = Math.floor((now - past) / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return past.toLocaleDateString();
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(str) { return escapeHtml(str); }

function updateLoadingText(text) {
    const el = document.querySelector('.loading-label');
    if (el) el.textContent = text;
}

function showToast(type, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function startStatusUpdates() {
    if (currentUser && currentUser.id && mainSupabase) {
        updateUserStatus(mainSupabase, currentUser.id, 'online');
    }
    setInterval(() => {
        if (currentUser && currentUser.id && mainSupabase) {
            updateUserStatus(mainSupabase, currentUser.id, 'online');
        }
    }, 30000);

    window.addEventListener('beforeunload', () => {
        if (currentUser && currentUser.id && mainSupabase) {
            updateUserStatus(mainSupabase, currentUser.id, 'offline');
        }
    });
}

// ============================================
// LEGACY: search users (kept for compat)
// ============================================
window.openSearch = () => {
    const modal = document.getElementById('searchModal');
    if (modal) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('visible'));
        setTimeout(() => document.getElementById('userSearchInput')?.focus(), 100);
    }
};

window.searchUsers = async function() {
    if (!mainSupabase || !currentUser) return;
    const input = document.getElementById('userSearchInput');
    const container = document.getElementById('searchResults');
    if (!input || !container) return;

    const term = input.value.toLowerCase().trim();
    if (!term) {
        container.innerHTML = `<div class="empty-search"><i class="fas fa-search"></i><p>Search for users</p></div>`;
        return;
    }

    try {
        const { data: friends } = await mainSupabase
            .from('friends')
            .select('friend_id')
            .eq('user_id', currentUser.id);

        const friendIds = friends?.map(f => f.friend_id) || [];

        const { data: pending } = await mainSupabase
            .from('friend_requests')
            .select('receiver_id')
            .eq('sender_id', currentUser.id)
            .eq('status', 'pending');

        const pendingIds = pending?.map(r => r.receiver_id) || [];

        const { data: users, error } = await mainSupabase
            .from('profiles')
            .select('id, username, avatar_url')
            .neq('id', currentUser.id)
            .ilike('username', `%${term}%`)
            .limit(20);

        if (error || !users || users.length === 0) {
            container.innerHTML = `<div class="empty-search"><i class="fas fa-user-slash"></i><p>No users found</p></div>`;
            return;
        }

        let html = '';
        users.forEach(user => {
            const isFriend = friendIds.includes(user.id);
            const isPending = pendingIds.includes(user.id);
            const initial = user.username?.charAt(0).toUpperCase() || '?';
            const avatarSrc = user.avatar_url || '';

            html += `
                <div class="search-result-item">
                    <div class="search-result-avatar">
                        ${avatarSrc
                            ? `<img src="${avatarSrc}" alt="${escapeHtml(user.username || '')}">`
                            : `<span>${escapeHtml(initial)}</span>`
                        }
                    </div>
                    <div class="search-result-info">
                        <div class="search-result-name">${escapeHtml(user.username || '')}</div>
                        <div class="search-result-username">@${escapeHtml(user.username || '')}</div>
                    </div>
                    ${isFriend
                        ? '<button class="add-friend-btn added" disabled>Friend</button>'
                        : isPending
                        ? '<button class="add-friend-btn added" disabled>Sent</button>'
                        : `<button class="add-friend-btn" onclick="sendFriendRequest('${user.id}', '${escapeAttr(user.username || 'User')}', this)">Add</button>`
                    }
                </div>
            `;
        });

        container.innerHTML = html;

    } catch (error) {
        console.error('Search error:', error);
    }
};

window.sendFriendRequest = async function(userId, username, btn) {
    try {
        btn.disabled = true;
        btn.textContent = 'Sending...';

        const { error } = await mainSupabase
            .from('friend_requests')
            .insert({
                sender_id: currentUser.id,
                receiver_id: userId,
                status: 'pending',
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        btn.textContent = 'Sent';
        btn.classList.add('added');
        showToast('success', `Friend request sent to ${username}`);
    } catch (error) {
        console.error('Request error:', error);
        btn.disabled = false;
        btn.textContent = 'Add';
        showToast('error', 'Failed to send request');
    }
};

window.closeModal = function() {
    const searchModal = document.getElementById('searchModal');
    const notificationsModal = document.getElementById('notificationsModal');

    [searchModal, notificationsModal].forEach(m => {
        if (!m) return;
        m.classList.remove('visible');
        setTimeout(() => { m.style.display = 'none'; }, 200);
    });
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

// ============================================
// CLEANUP
// ============================================
window.addEventListener('beforeunload', () => {
    if (realtimeChannel) mainSupabase?.removeChannel(realtimeChannel);
    if (friendRealtimeChannel) mainSupabase?.removeChannel(friendRealtimeChannel);
});

document.addEventListener('DOMContentLoaded', initFriendsPage);