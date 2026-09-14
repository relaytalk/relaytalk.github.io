// home/script.js - COMPLETE WITH CALL HISTORY IN NOTIFICATIONS

import { auth } from '../../utils/auth.js'

console.log("✨ Relay Home Page Loaded");

// ============================================
// IMMEDIATE REDIRECT CHECK - ONLY IF NOT LOGGED IN
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
// TOAST NOTIFICATION SYSTEM
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

    success(title, message = '', duration = 5000) {
        return this.show({ title, message, type: 'success', duration });
    }

    error(title, message = '', duration = 7000) {
        return this.show({ title, message, type: 'error', duration });
    }

    warning(title, message = '', duration = 6000) {
        return this.show({ title, message, type: 'warning', duration });
    }

    info(title, message = '', duration = 4000) {
        return this.show({ title, message, type: 'info', duration });
    }
}

const toast = new ToastNotification();

window.showToast = toast.show.bind(toast);
window.showSuccess = toast.success.bind(toast);
window.showError = toast.error.bind(toast);
window.showWarning = toast.warning.bind(toast);
window.showInfo = toast.info.bind(toast);

// ============================================
// GLOBAL VARIABLES
// ============================================
let currentUser = null;
let currentProfile = null;
let currentNotifTab = 'main'; // 'main' or 'calls'

// ============================================
// SUPABASE WAIT FUNCTION
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

        if (window.supabase) {
            console.log('✅ Supabase loaded successfully after', attempts, 'attempts');
            return true;
        } else {
            console.error('❌ Supabase failed to load after waiting');
            return false;
        }
    } catch (error) {
        console.error('❌ Error loading Supabase:', error);
        return false;
    }
}

// ============================================
// INITIALIZE HOME PAGE
// ============================================
async function initHomePage() {
    console.log('🏠 Initializing home page...');

    try {
        const { success, user } = await auth.getCurrentUser();

        if (!success || !user) {
            console.log('⚠️ Auth check failed, but session exists - continuing anyway');
            try {
                const sessionStr = localStorage.getItem('supabase.auth.token');
                if (sessionStr) {
                    const session = JSON.parse(sessionStr);
                    currentUser = {
                        id: session?.user?.id,
                        email: session?.user?.email,
                        user_metadata: session?.user?.user_metadata || {}
                    };
                    console.log('✅ Recovered user from localStorage');
                }
            } catch (e) {}

            if (!currentUser) {
                console.log('❌ No user data available - redirecting');
                window.location.replace('/');
                return;
            }
        } else {
            currentUser = user;
            console.log('✅ User authenticated:', currentUser.email);
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        try {
            const sessionStr = localStorage.getItem('supabase.auth.token');
            if (sessionStr) {
                const session = JSON.parse(sessionStr);
                currentUser = {
                    id: session?.user?.id,
                    email: session?.user?.email,
                    user_metadata: session?.user?.user_metadata || {}
                };
                console.log('✅ Recovered user from localStorage after error');
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
            toast.error("Connection Error", "Cannot connect to server. Please check your internet.");
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

        console.log('✅ Home page initialized successfully');

        setTimeout(() => {
            if (currentProfile) {
                toast.success("Welcome back!", `Good to see you, ${currentProfile.username}! 👋`);
            }
        }, 800);

    } catch (error) {
        console.error('❌ Home page initialization failed:', error);

        if (loadingIndicator) loadingIndicator.style.display = 'none';
        toast.error("Initialization Error", "Failed to load page. Please refresh.");
    }
}

// ============================================
// LOAD USER PROFILE
// ============================================
async function loadUserProfile() {
    try {
        if (!currentUser || !window.supabase) {
            currentProfile = {
                username: currentUser?.user_metadata?.username ||
                         currentUser?.email?.split('@')[0] || 'User',
                full_name: currentUser?.user_metadata?.full_name || 'User'
            };
            return;
        }

        console.log('Loading profile for user:', currentUser.id);

        const { data: profile, error } = await window.supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (error) {
            console.error('Profile load error:', error.message);
            throw error;
        }

        if (profile) {
            currentProfile = profile;
            console.log('✅ Profile loaded:', profile.username);
        } else {
            currentProfile = {
                username: currentUser.user_metadata?.username ||
                         currentUser.email?.split('@')[0] || 'User',
                full_name: currentUser.user_metadata?.full_name || 'User'
            };
            console.log('⚠️ No profile found, using default:', currentProfile.username);
        }
    } catch (error) {
        console.error('❌ Error loading profile:', error);
        currentProfile = {
            username: currentUser?.user_metadata?.username ||
                     currentUser?.email?.split('@')[0] || 'User',
            full_name: currentUser?.user_metadata?.full_name || 'User'
        };
    }
}

// ============================================
// UPDATE WELCOME MESSAGE
// ============================================
function updateWelcomeMessage() {
    if (!currentProfile) return;

    const welcomeElement = document.getElementById('welcomeTitle');
    if (welcomeElement) {
        welcomeElement.textContent = `Welcome, ${currentProfile.username}!`;
        console.log('Updated welcome message for:', currentProfile.username);
    }
}

// ============================================
// LOAD FRIENDS LIST
// ============================================
async function loadFriends() {
    if (!currentUser || !window.supabase) {
        console.log('Cannot load friends: No user or Supabase');
        showEmptyFriends();
        return;
    }

    const container = document.getElementById('friendsList');
    if (!container) {
        console.error('Friends list container not found!');
        return;
    }

    try {
        console.log('Loading friends for user:', currentUser.id);
        const { data: friends, error } = await window.supabase
            .from('friends')
            .select('friend_id')
            .eq('user_id', currentUser.id);

        if (error) {
            console.error('Friends load error:', error.message);
            showEmptyFriends();
            return;
        }

        console.log('Found', friends?.length || 0, 'friends');

        if (!friends || friends.length === 0) {
            showEmptyFriends();
            return;
        }

        const friendIds = friends.map(f => f.friend_id);
        const { data: profiles, error: profilesError } = await window.supabase
            .from('profiles')
            .select('id, username, avatar_url, status, last_seen')
            .in('id', friendIds);

        if (profilesError) {
            console.error('Profiles load error:', profilesError);
            showEmptyFriends();
            return;
        }

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
        if (onlineCounter) {
            onlineCounter.textContent = `${onlineCount} Online`;
        }

        console.log('✅ Friends list updated');
    } catch (error) {
        console.error('❌ Error loading friends:', error);
        showEmptyFriends();
    }
}

// ============================================
// SHOW EMPTY FRIENDS STATE
// ============================================
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

// ============================================
// GET TIME AGO STRING
// ============================================
function getTimeAgo(date) {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays/7)}w ago`;
    return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================
// OPEN CHAT
// ============================================
async function openChat(friendId, friendUsername = 'Friend') {
    console.log("Opening chat with:", friendId, friendUsername);
    const loadingToast = toast.info("Opening Chat", `Connecting with ${friendUsername}...`);

    sessionStorage.setItem('currentChatFriend', JSON.stringify({
        id: friendId,
        username: friendUsername
    }));

    setTimeout(() => {
        if (loadingToast && loadingToast.parentNode) loadingToast.remove();
    }, 500);

    window.location.href = `../chats/index.html?friendId=${friendId}`;
}

// ============================================
// SEARCH
// ============================================
async function loadSearchResults() {
    const container = document.getElementById('searchResults');
    const searchInput = document.getElementById('searchInput');

    if (!container) {
        console.error('Search results container not found!');
        return;
    }

    try {
        if (!currentUser || !window.supabase) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Cannot search right now</p></div>`;
            return;
        }

        console.log('Loading all users for search...');

        const { data: allUsers, error } = await window.supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .neq('id', currentUser.id)
            .limit(50);

        if (error) {
            console.error('Search error:', error);
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Error loading users</p></div>`;
            return;
        }

        if (!allUsers || allUsers.length === 0) {
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

                const filteredUsers = allUsers.filter(user =>
                    user.username.toLowerCase().includes(searchTerm) ||
                    (user.full_name && user.full_name.toLowerCase().includes(searchTerm))
                );
                await displaySearchResults(filteredUsers);
            };

            searchInput.focus();
        }
    } catch (error) {
        console.error('❌ Error in search:', error);
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Search failed</p></div>`;
        toast.error("Search Error", "Could not load users");
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

// ============================================
// SEND FRIEND REQUEST
// ============================================
async function sendFriendRequest(toUserId, toUsername, button) {
    if (!currentUser || !window.supabase) {
        toast.error("Error", "Cannot send request");
        return;
    }

    if (button) {
        button.textContent = 'Sending...';
        button.disabled = true;
    }

    try {
        const { data: existingRequest } = await window.supabase
            .from('friend_requests')
            .select('id')
            .eq('sender_id', currentUser.id)
            .eq('receiver_id', toUserId)
            .eq('status', 'pending')
            .maybeSingle();

        if (existingRequest) {
            toast.info("Already Sent", `You've already sent a friend request to ${toUsername}`);
            if (button) {
                button.textContent = '✓ Sent';
                setTimeout(() => button.disabled = false, 1000);
            }
            return;
        }

        const { error } = await window.supabase
            .from('friend_requests')
            .insert({
                sender_id: currentUser.id,
                receiver_id: toUserId,
                status: 'pending',
                created_at: new Date().toISOString()
            });

        if (error) {
            console.error("Error sending request:", error);
            toast.error("Request Failed", "Could not send friend request");
            if (button) {
                button.textContent = 'Add Friend';
                button.disabled = false;
            }
            return;
        }

        await loadSearchResults();
        await updateNotificationsBadge();

        toast.success("Request Sent", `Your request has been sent to ${toUsername}!`);

        if (button) {
            button.textContent = '✓ Sent';
            button.disabled = true;
            button.classList.add('sent');
        }
    } catch (error) {
        console.error("❌ Friend request error:", error);
        toast.error("Request Failed", "Please check your connection");
        if (button) {
            button.textContent = 'Add Friend';
            button.disabled = false;
        }
    }
}

// ============================================
// LOAD NOTIFICATIONS (Main tab - friend requests)
// ============================================
async function loadNotifications() {
    const container = document.getElementById('notificationsList');

    if (!container) {
        console.error("Notifications container not found!");
        return;
    }

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

        if (error) {
            console.error("Notifications error:", error.message);
            showEmptyNotifications(container);
            return;
        }

        if (!notifications || notifications.length === 0) {
            showEmptyNotifications(container);
            return;
        }

        const senderIds = notifications.map(n => n.sender_id);
        const { data: profiles } = await window.supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', senderIds);

        const profileMap = {};
        if (profiles) {
            profiles.forEach(p => profileMap[p.id] = p);
        }

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
    if (!container) {
        console.error("Call history container not found!");
        return;
    }

    try {
        if (!currentUser || !window.supabase) {
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">📞</div><p>Cannot load call history</p></div>`;
            return;
        }

        console.log('📞 Loading call history for user:', currentUser.id);

        const { data: calls, error } = await window.supabase
            .from('calls')
            .select('*')
            .or(`caller_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error("Call history error:", error.message);
            container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Could not load call history</p></div>`;
            return;
        }

        if (!calls || calls.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📞</div>
                    <h3 class="empty-title">No calls yet</h3>
                    <p class="empty-desc">Your call history will appear here</p>
                </div>
            `;
            return;
        }

        // Gather user IDs to fetch profiles
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

            if (profiles) {
                profiles.forEach(p => profileMap[p.id] = p);
            }
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

            const time = new Date(call.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });

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
        console.error("❌ Error loading call history:", error);
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Could not load call history</p></div>`;
    }
}

// ============================================
// NOTIFICATION TAB SWITCHER
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
// ACCEPT FRIEND REQUEST
// ============================================
async function acceptFriendRequest(requestId, senderId, senderName = 'User', button = null) {
    console.log("Accepting request:", requestId, "from:", senderId);

    if (!currentUser || !window.supabase) {
        toast.error("Error", "Cannot accept request");
        return;
    }

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

        await window.supabase
            .from('friends')
            .insert({
                user_id: currentUser.id,
                friend_id: senderId,
                created_at: new Date().toISOString()
            });

        await window.supabase
            .from('friends')
            .insert({
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
        console.error("❌ Error accepting friend request:", error);
        toast.error("Connection Failed", "Could not accept friend request");

        if (button) {
            button.textContent = '✓';
            button.disabled = false;
        }
    }
}

// ============================================
// DECLINE FRIEND REQUEST
// ============================================
async function declineFriendRequest(requestId, button = null) {
    if (!currentUser || !window.supabase) {
        toast.error("Error", "Cannot decline request");
        return;
    }

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
        console.error("❌ Error declining friend request:", error);
        toast.error("Action Failed", "Could not decline friend request");

        if (button) {
            button.textContent = '✗';
            button.disabled = false;
        }
    }
}

// ============================================
// UPDATE NOTIFICATIONS BADGE (Main - friend requests)
// ============================================
async function updateNotificationsBadge() {
    try {
        if (!currentUser || !window.supabase) {
            hideNotificationBadge();
            return;
        }

        const { data: notifications, error } = await window.supabase
            .from('friend_requests')
            .select('id')
            .eq('receiver_id', currentUser.id)
            .eq('status', 'pending');

        if (error) {
            hideNotificationBadge();
            return;
        }

        const unreadCount = notifications?.length || 0;
        updateBadgeDisplay(unreadCount);

        // Also update Main tab badge
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
        console.error('❌ Error loading notifications:', error);
        hideNotificationBadge();
    }
}

// ============================================
// UPDATE CALLS TAB BADGE (unseen missed calls)
// ============================================
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

        // Also update the main bottom-nav badge
        // Combined count: friend requests + unseen calls
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
    } catch (e) {
        // silent
    }
}

function updateBadgeDisplay(count) {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : count;
            badge.style.display = 'block';

            if (count === 1) {
                setTimeout(() => {
                    toast.info("New Notification", "You have a new friend request");
                }, 1000);
            }
        } else {
            // Don't hide yet - calls badge may still show. Handled by updateCallsTabBadge.
        }
    }
}

function hideNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) badge.style.display = 'none';
}

// ============================================
// SETUP EVENT LISTENERS
// ============================================
function setupEventListeners() {
    console.log("Setting up event listeners...");

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                const loadingToast = toast.info("Logging Out", "Please wait...");
                await auth.signOut();
                localStorage.clear();
                sessionStorage.clear();

                if (loadingToast && loadingToast.parentNode) loadingToast.remove();
                toast.success("Logged Out", "See you soon! 👋");

                setTimeout(() => window.location.href = '/', 1000);
            } catch (error) {
                console.error("Error logging out:", error);
                toast.error("Logout Failed", "Please try again");
            }
        });
    }

    console.log("✅ Event listeners setup complete");
}

// ============================================
// LOGOUT
// ============================================
window.logout = async function() {
    try {
        const loadingToast = toast.info("Logging Out", "Please wait...");

        if (window.supabase) {
            await window.supabase.auth.signOut();
        }

        localStorage.clear();
        sessionStorage.clear();

        document.cookie.split(";").forEach(function(c) {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });

        if (loadingToast && loadingToast.parentNode) loadingToast.remove();
        toast.success("Logged Out", "See you soon! 👋");

        setTimeout(() => {
            window.location.href = '/';
        }, 1000);
    } catch (error) {
        console.error("Error logging out:", error);
        toast.error("Logout Failed", "Please try again");
    }
};

// ============================================
// NAVIGATION
// ============================================
function goToHome() {
    window.location.href = '/pages/home/index.html';
}

function openSettings() {
    toast.info("Coming Soon", "Settings page is under development! Stay tuned ✨");
}

function viewFriendsPage() {
    window.location.href = 'friends/index.html';
}

// ============================================
// GLOBAL FUNCTIONS FOR HTML
// ============================================
window.openSearch = function() {
    console.log("Opening search modal");
    const modal = document.getElementById('searchModal');
    if (modal) {
        modal.style.display = 'flex';
        loadSearchResults();
    } else {
        console.error("Search modal not found!");
        toast.error("Search Unavailable", "The search feature is currently unavailable");
    }
};

window.openNotifications = function() {
    console.log("Opening notifications modal");
    const modal = document.getElementById('notificationsModal');
    if (modal) {
        modal.style.display = 'flex';
        // Reset to main tab by default
        switchNotifTab('main');
        updateCallsTabBadge();
    } else {
        console.error("Notifications modal not found!");
        toast.error("Notifications Unavailable", "Unable to load notifications");
    }
};

window.closeModal = function() {
    console.log("Closing modal");
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

// ============================================
// INITIALIZE
// ============================================
document.addEventListener('DOMContentLoaded', initHomePage);