// home/script.js - Home page controller

import { auth } from '../../utils/auth.js'

console.log("✨ Relay Home Page Loaded");

// ============================================
// IMMEDIATE REDIRECT CHECK
// ============================================
(function() {
    try {
        let hasSession = false;
        const localToken = localStorage.getItem('supabase.auth.token');
        const sessionToken = sessionStorage.getItem('supabase.auth.token');
        hasSession = !!(localToken || sessionToken);

        if (!hasSession) {
            try {
                const persistedSession = localStorage.getItem('supabase.auth.token');
                if (persistedSession && persistedSession.includes('access_token')) {
                    hasSession = true;
                }
            } catch (e) {}
        }

        if (!hasSession) {
            console.log('🚫 No session - redirecting to root');
            window.location.replace('/');
            return;
        }
    } catch (e) {
        console.log('Session check error:', e);
        window.location.replace('/');
    }
})();

// ============================================
// TOAST SYSTEM
// ============================================
class ToastNotification {
    constructor() {
        this.container = document.getElementById('toastContainer');
        if (!this.container) this.createToastContainer();
    }

    createToastContainer() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        this.container.id = 'toastContainer';
        document.body.prepend(this.container);
    }

    show(options) {
        const { title = '', message = '', type = 'info', duration = 5000 } = options;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let icon = '💬';
        switch(type) {
            case 'success': icon = '✨'; break;
            case 'error': icon = '❌'; break;
            case 'warning': icon = '⚠️'; break;
            case 'info': icon = '💬'; break;
        }

        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-content">
                <div class="toast-title">
                    ${title}
                    <span class="toast-time">${time}</span>
                </div>
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        this.container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);

        if (duration > 0) {
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
        return toast;
    }

    success(title, message = '', duration = 5000) { return this.show({ title, message, type: 'success', duration }); }
    error(title, message = '', duration = 7000) { return this.show({ title, message, type: 'error', duration }); }
    warning(title, message = '', duration = 6000) { return this.show({ title, message, type: 'warning', duration }); }
    info(title, message = '', duration = 4000) { return this.show({ title, message, type: 'info', duration }); }
}

const toast = new ToastNotification();
window.showToast = toast.show.bind(toast);
window.showSuccess = toast.success.bind(toast);
window.showError = toast.error.bind(toast);
window.showWarning = toast.warning.bind(toast);
window.showInfo = toast.info.bind(toast);

// ============================================
// GLOBALS
// ============================================
let currentUser = null;
let currentProfile = null;
let currentNotifTab = 'main';
let friendsRealtimeChannel = null;

// ===== CHANGED: local dismissal / read tracking =====
let locallyDismissedRequestIds = new Set();
let locallyReadCallIds = new Set();

const SEEN_STORAGE_KEY = 'relaytalk_seen_notifications';
const SEEN_CALLS_KEY = 'relaytalk_seen_calls';

function getSeenIds(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) {
        return new Set();
    }
}

function addSeenIds(key, ids) {
    try {
        const set = getSeenIds(key);
        ids.forEach(id => set.add(id));
        const arr = Array.from(set).slice(-200);
        localStorage.setItem(key, JSON.stringify(arr));
    } catch (e) {}
}

// Load previously-seen IDs into the local Sets on page load
(function hydrateLocalSeen() {
    try {
        getSeenIds(SEEN_STORAGE_KEY).forEach(id => locallyDismissedRequestIds.add(String(id)));
        getSeenIds(SEEN_CALLS_KEY).forEach(id => locallyReadCallIds.add(String(id)));
    } catch (e) {}
})();

// ============================================
// SUPABASE WAIT
// ============================================
async function waitForSupabase() {
    console.log('⏳ Waiting for Supabase...');
    if (window.supabase) {
        console.log('✅ Supabase already loaded');
        return true;
    }

    try {
        await import('../../utils/supabase.js');
        let attempts = 0;
        while (!window.supabase && attempts < 25) {
            await new Promise(resolve => setTimeout(resolve, 200));
            attempts++;
        }
        return !!window.supabase;
    } catch (error) {
        console.error('❌ Error loading Supabase:', error);
        return false;
    }
}

// ============================================
// INIT
// ============================================
async function initHomePage() {
    console.log('🏠 Initializing home page...');

    try {
        const { success, user } = await auth.getCurrentUser();
        if (!success || !user) {
            try {
                const sessionStr = localStorage.getItem('supabase.auth.token');
                if (sessionStr) {
                    const session = JSON.parse(sessionStr);
                    currentUser = {
                        id: session?.user?.id,
                        email: session?.user?.email,
                        user_metadata: session?.user?.user_metadata || {}
                    };
                }
            } catch (e) {}

            if (!currentUser) {
                window.location.replace('/');
                return;
            }
        } else {
            currentUser = user;
        }
    } catch (error) {
        try {
            const sessionStr = localStorage.getItem('supabase.auth.token');
            if (sessionStr) {
                const session = JSON.parse(sessionStr);
                currentUser = {
                    id: session?.user?.id,
                    email: session?.user?.email,
                    user_metadata: session?.user?.user_metadata || {}
                };
            } else {
                window.location.replace('/');
                return;
            }
        } catch (e) {
            window.location.replace('/');
            return;
        }
    }

    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) loadingIndicator.style.display = 'flex';

    try {
        const supabaseReady = await waitForSupabase();
        if (!supabaseReady) {
            toast.error("Connection Error", "Cannot connect to server.");
            if (loadingIndicator) {
                loadingIndicator.classList.add('hidden');
                setTimeout(() => { loadingIndicator.style.display = 'none'; }, 400);
            }
            return;
        }

        if (loadingIndicator) {
            loadingIndicator.classList.add('hidden');
            setTimeout(() => { loadingIndicator.style.display = 'none'; }, 400);
        }

        await loadUserProfile();
        updateWelcomeMessage();
        await loadFriends();
        await updateNotificationsBadge();
        await updateCallsTabBadge();
        setupEventListeners();
        setupFriendsRealtime();

        console.log('✅ Home page initialized successfully');
    } catch (error) {
        console.error('❌ Init failed:', error);
        if (loadingIndicator) {
            loadingIndicator.classList.add('hidden');
            setTimeout(() => { loadingIndicator.style.display = 'none'; }, 400);
        }
        toast.error("Initialization Error", "Failed to load page.");
    }
}

// ============================================
// REALTIME
// ============================================
function setupFriendsRealtime() {
    if (!currentUser || !window.supabase) return;

    if (friendsRealtimeChannel) {
        window.supabase.removeChannel(friendsRealtimeChannel);
        friendsRealtimeChannel = null;
    }

    console.log('📡 Setting up realtime friends for user:', currentUser.id);

    friendsRealtimeChannel = window.supabase
        .channel(`home-friends:${currentUser.id}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'friends',
            filter: `user_id=eq.${currentUser.id}`
        }, () => {
            console.log('🟢 Realtime: new friend added!');
            loadFriends();
            toast.info("New Friend!", "Someone just accepted your friend request");
        })
        .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'friends',
            filter: `user_id=eq.${currentUser.id}`
        }, () => {
            console.log('🔴 Realtime: friend removed');
            loadFriends();
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'friend_requests',
            filter: `receiver_id=eq.${currentUser.id}`
        }, () => {
            updateNotificationsBadge();
            updateCallsTabBadge();
        })
        // ===== CHANGED: also react to friend request updates =====
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'friend_requests',
            filter: `receiver_id=eq.${currentUser.id}`
        }, () => {
            if (currentNotifTab === 'main') loadNotifications();
            updateNotificationsBadge();
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'calls',
            filter: `callee_id=eq.${currentUser.id}`
        }, () => {
            updateCallsTabBadge();
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'calls',
            filter: `callee_id=eq.${currentUser.id}`
        }, () => {
            updateCallsTabBadge();
        })
        .subscribe((status) => {
            console.log('📡 Realtime friends status:', status);
        });
}

// ============================================
// LOAD USER PROFILE
// ============================================
async function loadUserProfile() {
    try {
        if (!currentUser || !window.supabase) {
            currentProfile = {
                username: currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || 'User'
            };
            return;
        }

        const { data: profile } = await window.supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (profile) {
            currentProfile = profile;
        } else {
            currentProfile = {
                username: currentUser.user_metadata?.username || currentUser.email?.split('@')[0] || 'User'
            };
        }
    } catch (error) {
        currentProfile = {
            username: currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || 'User'
        };
    }
}

function updateWelcomeMessage() {
    if (!currentProfile) return;

    const nameEl = document.getElementById('welcomeTitle');
    const smallEl = document.getElementById('greetingSmall');

    const hour = new Date().getHours();
    let greeting = 'Hello';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';
    else if (hour < 21) greeting = 'Good evening';
    else greeting = 'Good night';

    if (smallEl) smallEl.textContent = greeting;
    if (nameEl) nameEl.textContent = currentProfile.username || 'Friend';
}

// ============================================
// AVATAR HTML
// ============================================
function buildAvatarHTML(profile) {
    const username = (profile && profile.username) ? profile.username : '?';
    const firstLetter = username.charAt(0).toUpperCase();
    const avatarUrl = profile && profile.avatar_url ? profile.avatar_url : '';

    if (avatarUrl) {
        return `<img src="${escapeAttr(avatarUrl)}" alt="${escapeAttr(username)}">`;
    }
    return `<span>${escapeHtml(firstLetter)}</span>`;
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

// ============================================
// LOAD FRIENDS
// ============================================
async function loadFriends() {
    if (!currentUser || !window.supabase) {
        showEmptyFriends();
        return;
    }

    const container = document.getElementById('friendsList');
    if (!container) return;

    try {
        const { data: friends, error } = await window.supabase
            .from('friends')
            .select('friend_id')
            .eq('user_id', currentUser.id);

        if (error || !friends || friends.length === 0) {
            showEmptyFriends();
            return;
        }

        const friendIds = friends.map(f => f.friend_id);
        const { data: profiles } = await window.supabase
            .from('profiles')
            .select('id, username, avatar_url, status, last_seen')
            .in('id', friendIds);

        let html = '';

        if (profiles && profiles.length > 0) {
            profiles.forEach(profile => {
                const isOnline = profile.status === 'online';
                const lastSeen = profile.last_seen ? new Date(profile.last_seen) : new Date();
                const timeAgo = getTimeAgo(lastSeen);

                html += `
                    <div class="friend-item" onclick="openChat('${profile.id}', '${escapeAttr(profile.username || 'Friend')}')">
                        <div class="friend-avatar">
                            ${buildAvatarHTML(profile)}
                            <span class="friend-status-dot ${isOnline ? 'online' : 'offline'}"></span>
                        </div>
                        <div class="friend-info">
                            <div class="friend-name">${escapeHtml(profile.username || 'Unknown')}</div>
                            <div class="friend-status ${isOnline ? 'online' : ''}">
                                ${isOnline ? 'Online' : 'Last seen ' + timeAgo}
                            </div>
                        </div>
                    </div>
                `;
            });
        } else {
            showEmptyFriends();
            return;
        }

        container.innerHTML = html;
    } catch (error) {
        console.error('Load friends error:', error);
        showEmptyFriends();
    }
}

function showEmptyFriends() {
    const container = document.getElementById('friendsList');
    if (!container) return;
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">
                <i class="fas fa-user-friends"></i>
            </div>
            <h3 class="empty-title">No friends yet</h3>
            <p class="empty-desc">Search for friends to start chatting</p>
            <button class="empty-cta" onclick="openSearch()">
                <i class="fas fa-search"></i> Find Friends
            </button>
        </div>
    `;
}

function getTimeAgo(date) {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function openChat(friendId, friendUsername = 'Friend') {
    sessionStorage.setItem('currentChatFriend', JSON.stringify({
        id: friendId,
        username: friendUsername
    }));
    window.location.href = `../chats/index.html?friendId=${friendId}`;
}

// ============================================
// SEARCH
// ============================================
async function loadSearchResults() {
    const container = document.getElementById('searchResults');
    const searchInput = document.getElementById('searchInput');
    if (!container) return;

    try {
        if (!currentUser || !window.supabase) {
            container.innerHTML = `<div class="empty-state"><p>Cannot search right now</p></div>`;
            return;
        }

        const { data: allUsers, error } = await window.supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .neq('id', currentUser.id)
            .limit(50);

        if (error || !allUsers || allUsers.length === 0) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-users"></i></div><p>No other users found</p></div>`;
            return;
        }

        await displaySearchResults(allUsers);

        if (searchInput) {
            searchInput.oninput = async function() {
                const searchTerm = this.value.toLowerCase().trim();
                if (searchTerm === '') {
                    await displaySearchResults(allUsers);
                    return;
                }
                const filtered = allUsers.filter(u =>
                    (u.username || '').toLowerCase().includes(searchTerm) ||
                    (u.full_name && u.full_name.toLowerCase().includes(searchTerm))
                );
                await displaySearchResults(filtered);
            };
            searchInput.focus();
        }
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><p>Search failed</p></div>`;
    }
}

async function displaySearchResults(users) {
    const container = document.getElementById('searchResults');
    if (!container) return;

    if (!users || users.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fas fa-search"></i></div><p>No users found</p></div>`;
        return;
    }

    try {
        const { data: friends } = await window.supabase
            .from('friends')
            .select('friend_id')
            .eq('user_id', currentUser.id);

        const friendIds = friends?.map(f => f.friend_id) || [];

        const { data: pendingRequests } = await window.supabase
            .from('friend_requests')
            .select('receiver_id')
            .eq('sender_id', currentUser.id)
            .eq('status', 'pending');

        const pendingIds = pendingRequests?.map(r => r.receiver_id) || [];

        let html = '';
        users.forEach(user => {
            const isFriend = friendIds.includes(user.id);
            const requestSent = pendingIds.includes(user.id);

            html += `
                <div class="search-result">
                    <div class="search-avatar">
                        ${buildAvatarHTML(user)}
                    </div>
                    <div class="search-info">
                        <div class="search-name">${escapeHtml(user.username || 'Unknown')}</div>
                        <div class="search-username">${escapeHtml(user.full_name || '')}</div>
                    </div>
                    ${isFriend ? `
                        <button class="send-request-btn sent" disabled>Friend</button>
                    ` : requestSent ? `
                        <button class="send-request-btn sent" disabled>Sent</button>
                    ` : `
                        <button class="send-request-btn" onclick="sendFriendRequest('${user.id}', '${escapeAttr(user.username || 'User')}', this)">Add</button>
                    `}
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('Display results error:', error);
    }
}

async function sendFriendRequest(toUserId, toUsername, button) {
    if (button) {
        button.textContent = 'Sending...';
        button.disabled = true;
    }

    try {
        const { error } = await window.supabase
            .from('friend_requests')
            .insert({
                sender_id: currentUser.id,
                receiver_id: toUserId,
                status: 'pending',
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        await loadSearchResults();
        await updateNotificationsBadge();
        toast.success("Request Sent", `Your request has been sent to ${toUsername}!`);

        if (button) {
            button.textContent = 'Sent';
            button.disabled = true;
            button.classList.add('sent');
        }
    } catch (error) {
        toast.error("Request Failed", "Please check your connection");
        if (button) {
            button.textContent = 'Add';
            button.disabled = false;
        }
    }
}

// ============================================
// NOTIFICATIONS
// ============================================
async function loadNotifications() {
    const container = document.getElementById('notificationsList');
    if (!container) return;

    try {
        if (!currentUser || !window.supabase) {
            showEmptyNotifications(container);
            return;
        }

        const { data: notifications, error } = await window.supabase
            .from('friend_requests')
            .select('id, sender_id, created_at')
            .eq('receiver_id', currentUser.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        // ===== CHANGED: filter out locally-dismissed IDs =====
        const visible = (notifications || []).filter(n => !locallyDismissedRequestIds.has(String(n.id)));

        if (error || visible.length === 0) {
            showEmptyNotifications(container);
            return;
        }

        const senderIds = visible.map(n => n.sender_id);
        const { data: profiles } = await window.supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', senderIds);

        const profileMap = {};
        if (profiles) profiles.forEach(p => profileMap[p.id] = p);

        let html = '';
        visible.forEach(notification => {
            const timeAgo = getTimeAgo(notification.created_at);
            const sender = profileMap[notification.sender_id] || { username: 'Unknown' };
            const senderName = sender.username;

            html += `
                <div class="notification-item" data-request-id="${notification.id}">
                    <div class="notification-avatar">
                        ${buildAvatarHTML(sender)}
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
// CALL HISTORY — with tags for missed/unseen
// ============================================
async function loadCallHistory() {
    const container = document.getElementById('callHistoryList');
    if (!container) return;

    try {
        if (!currentUser || !window.supabase) {
            container.innerHTML = `<div class="empty-state"><p>Cannot load call history</p></div>`;
            return;
        }

        const { data: calls, error } = await window.supabase
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
            const { data: profiles } = await window.supabase
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

            // ===== CHANGED: add tags for missed/unseen calls =====
            const callIdStr = String(call.id);
            const isUnseen = !isOutgoing && isMissed && !locallyReadCallIds.has(callIdStr) && call.seen !== true;
            let tagHTML = '';
            if (isUnseen) {
                tagHTML = `<span class="call-tag tag-new">New</span>`;
            } else if (isMissed) {
                tagHTML = `<span class="call-tag tag-missed">Missed</span>`;
            }

            html += `
                <div class="call-history-item ${isUnseen ? 'has-tag' : ''}">
                    <div class="call-history-avatar">
                        ${buildAvatarHTML(otherUser)}
                    </div>
                    <div class="call-history-info">
                        <div class="call-history-name ${isMissed ? 'missed' : ''}">
                            ${escapeHtml(otherUser.username || 'Unknown')}
                            ${tagHTML}
                        </div>
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

        // ===== CHANGED: mark calls as read now that user has opened the tab =====
        calls.forEach(c => locallyReadCallIds.add(String(c.id)));

        const seenIds = calls.map(c => String(c.id)).filter(Boolean);
        if (seenIds.length > 0) {
            addSeenIds(SEEN_CALLS_KEY, seenIds);
        }
        await updateCallsTabBadge();
    } catch (error) {
        console.error('Call history error:', error);
        container.innerHTML = `<div class="empty-state"><p>Could not load call history</p></div>`;
    }
}

// ============================================
// TAB SWITCHER
// ============================================
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
        loadCallHistory().then(() => updateCallsTabBadge());
    }
};

// ============================================
// ACCEPT / DECLINE — with immediate removal
// ============================================
async function acceptFriendRequest(requestId, senderId, senderName = 'User', button = null) {
    if (button) {
        button.innerHTML = '...';
        button.disabled = true;
    }

    // ===== CHANGED: dismiss + remove from DOM immediately =====
    locallyDismissedRequestIds.add(String(requestId));
    addSeenIds(SEEN_STORAGE_KEY, [String(requestId)]);

    const itemEl = document.querySelector(`.notification-item[data-request-id="${requestId}"]`);
    if (itemEl) {
        itemEl.classList.add('removing');
        setTimeout(() => itemEl.remove(), 280);
    }

    try {
        const { error: updateError } = await window.supabase
            .from('friend_requests')
            .update({ status: 'accepted' })
            .eq('id', requestId);

        if (updateError) throw updateError;

        await window.supabase.from('friends').insert({
            user_id: currentUser.id,
            friend_id: senderId,
            created_at: new Date().toISOString()
        });

        await window.supabase.from('friends').insert({
            user_id: senderId,
            friend_id: currentUser.id,
            created_at: new Date().toISOString()
        });

        toast.success("New Friend!", `You are now connected with ${senderName}!`);

        setTimeout(() => {
            loadNotifications();
            loadFriends();
            updateNotificationsBadge();
        }, 320);
    } catch (error) {
        console.error('Accept error:', error);
        toast.error("Connection Failed", "Could not accept friend request");
        locallyDismissedRequestIds.delete(String(requestId));
        loadNotifications();
    }
}

async function declineFriendRequest(requestId, button = null) {
    if (button) {
        button.innerHTML = '...';
        button.disabled = true;
    }

    // ===== CHANGED: dismiss + remove from DOM immediately =====
    locallyDismissedRequestIds.add(String(requestId));
    addSeenIds(SEEN_STORAGE_KEY, [String(requestId)]);

    const itemEl = document.querySelector(`.notification-item[data-request-id="${requestId}"]`);
    if (itemEl) {
        itemEl.classList.add('removing');
        setTimeout(() => itemEl.remove(), 280);
    }

    try {
        const { error } = await window.supabase
            .from('friend_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);

        if (error) throw error;

        toast.info("Request Declined", "Friend request has been declined");

        setTimeout(() => {
            loadNotifications();
            updateNotificationsBadge();
        }, 320);
    } catch (error) {
        locallyDismissedRequestIds.delete(String(requestId));
        loadNotifications();
    }
}

// ============================================
// BADGES
// ============================================
async function updateNotificationsBadge() {
    try {
        if (!currentUser || !window.supabase) {
            hideNotificationBadge();
            return;
        }

        const { data: notifications } = await window.supabase
            .from('friend_requests')
            .select('id')
            .eq('receiver_id', currentUser.id)
            .eq('status', 'pending');

        const unreadCount = (notifications || [])
            .filter(n => !locallyDismissedRequestIds.has(String(n.id))).length;

        const badge = document.getElementById('notificationBadge');
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        const navBadge = document.getElementById('navNotificationBadge');
        if (navBadge) {
            if (unreadCount > 0) {
                navBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                navBadge.style.display = 'flex';
            } else {
                navBadge.style.display = 'none';
            }
        }

        const mainTabBadge = document.getElementById('mainTabBadge');
        if (mainTabBadge) {
            if (unreadCount > 0) {
                mainTabBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                mainTabBadge.style.display = 'inline-flex';
            } else {
                mainTabBadge.style.display = 'none';
            }
        }
    } catch (error) {
        hideNotificationBadge();
    }
}

async function updateCallsTabBadge() {
    try {
        if (!currentUser || !window.supabase) return;

        const { data: calls } = await window.supabase
            .from('calls')
            .select('id, status, seen')
            .or(`receiver_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`)
            .in('status', ['missed', 'rejected'])
            .order('created_at', { ascending: false })
            .limit(50);

        const unseenCount = (calls || []).filter(c => {
            if (c.seen === true) return false;
            return !locallyReadCallIds.has(String(c.id));
        }).length;

        const badge = document.getElementById('callsTabBadge');
        if (badge) {
            if (unseenCount > 0) {
                badge.textContent = unseenCount > 9 ? '9+' : String(unseenCount);
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }

        const notifBadge = document.getElementById('notificationBadge');
        if (notifBadge) {
            const { data: fr } = await window.supabase
                .from('friend_requests')
                .select('id')
                .eq('receiver_id', currentUser.id)
                .eq('status', 'pending');

            const frUnread = (fr || []).filter(r => !locallyDismissedRequestIds.has(String(r.id))).length;
            const total = frUnread + unseenCount;

            if (total > 0) {
                notifBadge.textContent = total > 9 ? '9+' : total;
                notifBadge.style.display = 'flex';
            } else {
                notifBadge.style.display = 'none';
            }
        }
    } catch (e) {
        console.warn('updateCallsTabBadge error:', e);
    }
}

function hideNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) badge.style.display = 'none';
    const navBadge = document.getElementById('navNotificationBadge');
    if (navBadge) navBadge.style.display = 'none';
}

// ============================================
// SETUP / NAV
// ============================================
function setupEventListeners() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await auth.signOut();
                localStorage.clear();
                sessionStorage.clear();
                window.location.href = '/';
            } catch (error) {
                toast.error("Logout Failed", "Please try again");
            }
        });
    }
}

window.logout = async function() {
    try {
        if (window.supabase) await window.supabase.auth.signOut();
        localStorage.clear();
        sessionStorage.clear();
        document.cookie.split(";").forEach(function(c) {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });
        window.location.href = '/';
    } catch (error) {
        window.location.href = '/';
    }
};

function goToHome() {
    window.location.href = '/pages/home/index.html';
}

function openSettings() {
    toast.info("Coming Soon", "Settings page is under development! Stay tuned");
}

function viewFriendsPage() {
    window.location.href = 'friends/index.html';
}

window.openSearch = function() {
    const modal = document.getElementById('searchModal');
    if (modal) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('visible'));
        loadSearchResults();
    }
};

window.openNotifications = function() {
    const modal = document.getElementById('notificationsModal');
    if (modal) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('visible'));
        switchNotifTab('main');
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

window.openChat = openChat;
window.sendFriendRequest = sendFriendRequest;
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;
window.goToHome = goToHome;
window.openSettings = openSettings;
window.viewFriendsPage = viewFriendsPage;
window.logout = window.logout;

window.addEventListener('beforeunload', () => {
    if (friendsRealtimeChannel && window.supabase) {
        window.supabase.removeChannel(friendsRealtimeChannel);
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomePage);
} else {
    initHomePage();
}