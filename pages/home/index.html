// home/script.js - COMPLETE WITH REALTIME FRIENDS

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
            <div class="toast-progress">
                <div class="toast-progress-bar"></div>
            </div>
        `;

        this.container.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);

        if (duration > 0) {
            setTimeout(() => {
                toast.classList.remove('show');
                toast.classList.add('hide');
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
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            return;
        }

        if (loadingIndicator) loadingIndicator.style.display = 'none';

        await loadUserProfile();
        updateWelcomeMessage();
        await loadFriends();
        await updateNotificationsBadge();
        await updateCallsTabBadge();
        setupEventListeners();

        // 🔥 Set up realtime friends listener
        setupFriendsRealtime();

        console.log('✅ Home page initialized successfully');

        setTimeout(() => {
            if (currentProfile) {
                toast.success("Welcome back!", `Good to see you, ${currentProfile.username}! 👋`);
            }
        }, 800);

    } catch (error) {
        console.error('❌ Init failed:', error);
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        toast.error("Initialization Error", "Failed to load page.");
    }
}

// ============================================
// REALTIME FRIENDS LISTENER
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
        }, (payload) => {
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
    const el = document.getElementById('welcomeTitle');
    if (el) el.textContent = `Welcome, ${currentProfile.username}!`;
}

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
        let onlineCount = 0;

        if (profiles && profiles.length > 0) {
            profiles.forEach(profile => {
                const isOnline = profile.status === 'online';
                if (isOnline) onlineCount++;
                const lastSeen = profile.last_seen ? new Date(profile.last_seen) : new Date();
                const timeAgo = getTimeAgo(lastSeen);
                const firstLetter = profile.username ? profile.username.charAt(0).toUpperCase() : '?';

                html += `
                    <div class="friend-card" onclick="openChat('${profile.id}', '${profile.username}')">
                        <div class="friend-avatar" style="background: linear-gradient(45deg, #007acc, #00b4d8);">
                            ${profile.avatar_url
                                ? `<img src="${profile.avatar_url}" alt="${profile.username}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
                                : `<span style="color:white; font-size:1.3rem; font-weight:600;">${firstLetter}</span>`
                            }
                        </div>
                        <div class="friend-info">
                            <div class="friend-name">${profile.username || 'Unknown User'}</div>
                            <div class="friend-status">
                                <span class="status-dot ${isOnline ? '' : 'offline'}"></span>
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

        const onlineCounter = document.getElementById('onlineCounter');
        if (onlineCounter) onlineCounter.textContent = `${onlineCount} Online`;

    } catch (error) {
        showEmptyFriends();
    }
}

function showEmptyFriends() {
    const container = document.getElementById('friendsList');
    if (!container) return;
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">👥</div>
            <h3 class="empty-title">No Friends Yet</h3>
            <p class="empty-desc">Start by searching for friends to connect with</p>
            <button class="search-btn" onclick="openSearch()" style="margin-top: 20px;">
                <i class="fas fa-search"></i> Find Friends
            </button>
        </div>
    `;
    const onlineCounter = document.getElementById('onlineCounter');
    if (onlineCounter) onlineCounter.textContent = '0 Online';
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
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Cannot search right now</p></div>`;
            return;
        }

        const { data: allUsers, error } = await window.supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .neq('id', currentUser.id)
            .limit(50);

        if (error || !allUsers || allUsers.length === 0) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>No other users found</p></div>`;
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
                    u.username.toLowerCase().includes(searchTerm) ||
                    (u.full_name && u.full_name.toLowerCase().includes(searchTerm))
                );
                await displaySearchResults(filtered);
            };
            searchInput.focus();
        }
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Search failed</p></div>`;
    }
}

async function displaySearchResults(users) {
    const container = document.getElementById('searchResults');
    if (!container) return;

    if (!users || users.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>No users found</p></div>`;
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
            const firstLetter = user.username.charAt(0).toUpperCase();

            html += `
                <div class="search-result">
                    <div class="search-avatar" style="background: linear-gradient(45deg, #007acc, #00b4d8);">
                        ${user.avatar_url
                            ? `<img src="${user.avatar_url}" alt="${user.username}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
                            : `<span style="color:white; font-size:1.1rem; font-weight:600;">${firstLetter}</span>`
                        }
                    </div>
                    <div class="search-info">
                        <div class="search-name">${user.username}</div>
                        <div class="search-username">${user.full_name || ''}</div>
                    </div>
                    ${isFriend ? `
                        <button class="send-request-btn sent" disabled>✓ Friend</button>
                    ` : requestSent ? `
                        <button class="send-request-btn sent" disabled>✓ Sent</button>
                    ` : `
                        <button class="send-request-btn" onclick="sendFriendRequest('${user.id}', '${user.username}', this)">Add Friend</button>
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
            button.textContent = '✓ Sent';
            button.disabled = true;
            button.classList.add('sent');
        }
    } catch (error) {
        toast.error("Request Failed", "Please check your connection");
        if (button) {
            button.textContent = 'Add Friend';
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

        if (error || !notifications || notifications.length === 0) {
            showEmptyNotifications(container);
            return;
        }

        const senderIds = notifications.map(n => n.sender_id);
        const { data: profiles } = await window.supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', senderIds);

        const profileMap = {};
        if (profiles) profiles.forEach(p => profileMap[p.id] = p);

        let html = '';
        notifications.forEach(notification => {
            const timeAgo = getTimeAgo(notification.created_at);
            const sender = profileMap[notification.sender_id] || { username: 'Unknown User' };
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
// CALL HISTORY
// ============================================
async function loadCallHistory() {
    const container = document.getElementById('callHistoryList');
    if (!container) return;

    try {
        if (!currentUser || !window.supabase) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">📞</div><p>Cannot load call history</p></div>`;
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
                    <div class="empty-icon">📞</div>
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
            const otherUserId = isOutgoing ? call.receiver_id : call.caller_id;
            const otherUser = profileMap[otherUserId] || { username: 'Unknown' };

            let statusClass = 'status-missed';
            let statusText = 'Missed';
            let statusIcon = 'fa-phone-slash';

            if (call.status === 'active' || call.status === 'ended') {
                statusClass = 'status-answered';
                statusText = 'Answered';
                statusIcon = 'fa-phone';
            } else if (call.status === 'rejected') {
                statusClass = 'status-rejected';
                statusText = 'Rejected';
                statusIcon = 'fa-phone-slash';
            } else if (call.status === 'cancelled') {
                statusClass = 'status-cancelled';
                statusText = isOutgoing ? 'Cancelled' : 'Missed';
                statusIcon = 'fa-phone-slash';
            } else if (call.status === 'ringing') {
                statusClass = 'status-ringing';
                statusText = isOutgoing ? 'No answer' : 'Missed';
                statusIcon = 'fa-phone-slash';
            }

            const time = new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const initial = otherUser.username ? otherUser.username.charAt(0).toUpperCase() : '?';

            html += `
                <div class="call-history-item ${statusClass}">
                    <div class="call-history-avatar">
                        ${otherUser.avatar_url
                            ? `<img src="${otherUser.avatar_url}" alt="${otherUser.username}">`
                            : `<span>${initial}</span>`
                        }
                    </div>
                    <div class="call-history-info">
                        <div class="call-history-name">${otherUser.username}</div>
                        <div class="call-history-meta">
                            <i class="fas ${isOutgoing ? 'fa-arrow-up' : 'fa-arrow-down'}" style="font-size:0.75rem;color:#64748b;"></i>
                            <span>${isOutgoing ? 'Outgoing' : 'Incoming'}</span>
                            <span class="dot">•</span>
                            <span>${time}</span>
                        </div>
                    </div>
                    <div class="call-history-status ${statusClass}">
                        <i class="fas ${statusIcon}"></i>
                        <span>${statusText}</span>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Could not load call history</p></div>`;
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
        loadCallHistory();
        updateCallsTabBadge();
    }
};

// ============================================
// ACCEPT / DECLINE
// ============================================
async function acceptFriendRequest(requestId, senderId, senderName = 'User', button = null) {
    if (button) {
        button.textContent = '...';
        button.disabled = true;
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

        await loadNotifications();
        await loadFriends();
        await updateNotificationsBadge();

        toast.success("New Friend!", `You are now connected with ${senderName}! 🎉`);

        if (button) {
            button.textContent = '✓ Accepted';
            button.style.background = 'rgba(40, 167, 69, 0.3)';
        }
    } catch (error) {
        toast.error("Connection Failed", "Could not accept friend request");
        if (button) {
            button.textContent = '✓';
            button.disabled = false;
        }
    }
}

async function declineFriendRequest(requestId, button = null) {
    if (button) {
        button.textContent = '...';
        button.disabled = true;
    }

    try {
        const { error } = await window.supabase
            .from('friend_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);

        if (error) throw error;

        await loadNotifications();
        await updateNotificationsBadge();

        toast.info("Request Declined", "Friend request has been declined");

        if (button) {
            button.textContent = '✗ Declined';
            button.style.background = 'rgba(220, 53, 69, 0.3)';
        }
    } catch (error) {
        if (button) {
            button.textContent = '✗';
            button.disabled = false;
        }
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

        const unreadCount = notifications?.length || 0;
        updateBadgeDisplay(unreadCount);

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

        const { count } = await window.supabase
            .from('calls')
            .select('*', { count: 'exact', head: true })
            .or(`receiver_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`)
            .eq('seen', false)
            .in('status', ['missed', 'rejected']);

        const badge = document.getElementById('callsTabBadge');
        if (badge) {
            if (count && count > 0) {
                badge.textContent = count > 9 ? '9+' : String(count);
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }

        // Combined bottom-nav badge
        const notifBadge = document.getElementById('notificationBadge');
        if (notifBadge) {
            const { data: fr } = await window.supabase
                .from('friend_requests')
                .select('id')
                .eq('receiver_id', currentUser.id)
                .eq('status', 'pending');

            const total = (fr?.length || 0) + (count || 0);
            if (total > 0) {
                notifBadge.textContent = total > 9 ? '9+' : total;
                notifBadge.style.display = 'block';
            } else {
                notifBadge.style.display = 'none';
            }
        }
    } catch (e) {}
}

function updateBadgeDisplay(count) {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = 'block';
    }
}

function hideNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) badge.style.display = 'none';
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
    toast.info("Coming Soon", "Settings page is under development! Stay tuned ✨");
}

function viewFriendsPage() {
    window.location.href = 'friends/index.html';
}

window.openSearch = function() {
    const modal = document.getElementById('searchModal');
    if (modal) {
        modal.style.display = 'flex';
        loadSearchResults();
    }
};

window.openNotifications = function() {
    const modal = document.getElementById('notificationsModal');
    if (modal) {
        modal.style.display = 'flex';
        switchNotifTab('main');
        updateCallsTabBadge();
    }
};

window.closeModal = function() {
    const searchModal = document.getElementById('searchModal');
    const notificationsModal = document.getElementById('notificationsModal');
    if (searchModal) searchModal.style.display = 'none';
    if (notificationsModal) notificationsModal.style.display = 'none';
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

document.addEventListener('DOMContentLoaded', initHomePage);
