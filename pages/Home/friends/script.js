// /app/pages/home/friends/script.js - COMPLETE FIXED VERSION
import { auth } from '/app/utils/auth.js';
import { supabase } from '/app/utils/supabase.js';
import presenceTracker from '/app/utils/presence.js';

console.log("✨ Friends Page Loaded");

// ==================== PATHS CONFIG ====================
const PATHS = {
    HOME: '/app/pages/home/index.html',
    LOGIN: '/app/pages/login/index.html',  
    SIGNUP: '/app/pages/auth/index.html',
    CHATS: '/app/pages/chats/index.html',
    FRIENDS: '/app/pages/home/friends/index.html'
};

// ==================== GLOBAL VARIABLES ====================
let currentUser = null;
let allFriends = [];
let callService = null;
let presenceChannel = null;

// ==================== TOAST SYSTEM ====================
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
        const { title = '', message = '', type = 'info', duration = 4000 } = options;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = type === 'success' ? '✨' : type === 'error' ? '❌' : '💬';

        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
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

    success(title, message = '') { return this.show({ title, message, type: 'success' }); }
    error(title, message = '') { return this.show({ title, message, type: 'error' }); }
    info(title, message = '') { return this.show({ title, message, type: 'info' }); }
}

const toast = new ToastNotification();

// ==================== PAGE INITIALIZATION ====================
async function initFriendsPage() {
    console.log("🚀 Initializing friends page...");

    const loadingTimeout = setTimeout(() => {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }, 8000);

    try {
        const { success, user } = await auth.getCurrentUser();  
        if (!success || !user) {  
            clearTimeout(loadingTimeout);
            showLoginPrompt();
            return;  
        }  

        currentUser = user;  
        console.log("✅ Authenticated as:", currentUser.email);  

        // Start presence tracking
        await presenceTracker.start(currentUser.id);

        // Load friends
        await loadFriendsList();

        // Setup search
        setupSearch();

        // Setup presence listener
        setupFriendPresenceListener();

        // Hide loading
        clearTimeout(loadingTimeout);
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) loadingIndicator.style.display = 'none';

    } catch (error) {
        console.error("❌ Init error:", error);
        clearTimeout(loadingTimeout);
        toast.error("Error", "Failed to load page");
        
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
}

// ==================== PRESENCE FUNCTIONS ====================
function setupFriendPresenceListener() {
    if (!currentUser || !allFriends.length) return;
    
    const friendIds = allFriends.map(f => f.id).join(',');
    if (!friendIds) return;
    
    presenceChannel = supabase
        .channel(`friends-presence-${currentUser.id}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'user_presence',
                filter: `user_id=in.(${friendIds})`
            },
            (payload) => {
                const friend = allFriends.find(f => f.id === payload.new.user_id);
                if (friend) {
                    friend.is_online = payload.new.is_online;
                    friend.last_seen = payload.new.last_seen;
                    updateFriendOnlineStatus(friend.id, payload.new.is_online);
                }
            }
        )
        .subscribe((status) => {
            console.log(`📡 Friend presence channel: ${status}`);
        });
}

function updateFriendOnlineStatus(friendId, isOnline) {
    const friendItems = document.querySelectorAll('.friend-item-clean');
    
    friendItems.forEach(item => {
        const avatar = item.querySelector('.friend-avatar-clean');
        const userId = avatar?.dataset?.userId;
        
        if (userId === friendId) {
            const statusIndicator = item.querySelector('.status-indicator-clean');
            const statusText = item.querySelector('.friend-status-clean');
            const callButton = item.querySelector('.call-button');
            
            if (statusIndicator) {
                statusIndicator.className = `status-indicator-clean ${isOnline ? 'online' : 'offline'}`;
            }
            
            if (statusText) {
                statusText.textContent = isOnline ? 'Online' : getTimeAgo(new Date());
            }
            
            if (callButton) {
                callButton.classList.toggle('offline', !isOnline);
                callButton.disabled = !isOnline;
                callButton.title = isOnline ? 'Call friend' : 'Friend is offline';
            }
        }
    });
}

// ==================== NAVIGATION ====================
window.goToLogin = () => window.location.href = PATHS.LOGIN;
window.goToSignup = () => window.location.href = PATHS.SIGNUP;
window.goToHome = () => window.location.href = PATHS.HOME;
window.goToFriends = () => window.location.href = PATHS.FRIENDS;

function showLoginPrompt() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    mainContent.innerHTML = `
        <div class="login-prompt">
            <div class="login-icon">🔒</div>
            <h2 class="login-title">Login Required</h2>
            <p class="login-subtitle">Please login to view your friends and messages</p>
            <div class="login-buttons">
                <button class="login-btn" onclick="goToLogin()">
                    <i class="fas fa-sign-in-alt"></i> Login
                </button>
                <button class="signup-btn" onclick="goToSignup()">
                    <i class="fas fa-user-plus"></i> Sign Up
                </button>
            </div>
        </div>
    `;
}

// ==================== CHAT FUNCTIONS ====================
window.openChat = async (friendId, friendUsername) => {
    console.log("💬 Opening chat with:", friendUsername);
    
    // Store in session storage
    sessionStorage.setItem('currentChatFriend', JSON.stringify({
        id: friendId,
        username: friendUsername
    }));
    
    // Navigate to chats page
    window.location.href = PATHS.CHATS;
};

async function markMessagesAsRead(friendId) {
    if (!currentUser) return;
    
    try {
        await supabase
            .from('messages')
            .update({ read: true })
            .eq('sender_id', friendId)
            .eq('receiver_id', currentUser.id)
            .eq('read', false);
    } catch (error) {
        console.log("Note: Could not mark messages as read", error.message);
    }
}

// ==================== CALL FUNCTIONS ====================
window.startCall = async (friendId, friendUsername, event) => {
    if (event) event.stopPropagation();
    
    console.log("📞 Starting call with:", friendUsername);
    
    try {
        // Initialize call service
        if (!callService) {
            const module = await import('/app/utils/callService.js');
            callService = module.default;
            await callService.initialize(currentUser.id);
        }
        
        // Setup callbacks
        callService.setOnCallStateChange((state) => {
            console.log("Call state:", state);
        });
        
        callService.setOnRemoteStream((stream) => {
            console.log("Remote stream received:", stream);
        });
        
        // Start the call
        await callService.initiateCall(friendId, 'voice');
        
        toast.success("Call Started", `Calling ${friendUsername}...`);
        
    } catch (error) {
        console.error("❌ Call failed:", error);
        toast.error("Call Failed", error.message || "Could not start call");
    }
};

// ==================== FRIEND LIST FUNCTIONS ====================
async function loadFriendsList(searchTerm = '') {
    if (!currentUser) return;

    const container = document.getElementById('friendsContainer');  
    if (!container) return;  

    try {  
        showLoadingSkeleton(container);

        // Get friend IDs  
        const { data: friends, error } = await supabase  
            .from('friends')  
            .select('friend_id')  
            .eq('user_id', currentUser.id);  

        if (error) throw error;  

        if (!friends || friends.length === 0) {  
            showEmptyFriends(container);  
            allFriends = [];
            return;  
        }  

        // Get profiles for each friend  
        const friendIds = friends.map(f => f.friend_id);  
        const { data: profiles, error: profilesError } = await supabase  
            .from('profiles')  
            .select('id, username, avatar_url')  
            .in('id', friendIds);  

        if (profilesError) throw profilesError;  

        // Get presence data for each friend
        const presencePromises = profiles.map(async (profile) => {
            const status = await presenceTracker.checkOnlineStatus(profile.id);
            return { 
                ...profile, 
                is_online: status.online,
                last_seen: status.lastSeen 
            };
        });
        
        const profilesWithPresence = await Promise.all(presencePromises);

        // Get unread message counts
        const unreadCounts = await getUnreadMessageCounts(friendIds);

        // Store all friends for search filtering
        allFriends = profilesWithPresence.map(profile => ({
            ...profile,
            unreadCount: unreadCounts[profile.id] || 0
        }));

        // Filter by search term
        let filteredFriends = allFriends;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredFriends = allFriends.filter(friend => 
                friend.username.toLowerCase().includes(term)
            );
        }

        // Update stats
        updateFriendsStats(filteredFriends);

        // Display friends
        if (filteredFriends.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h3 class="empty-title">No Friends Found</h3>
                    <p class="empty-desc">Try a different search term</p>
                </div>
            `;
            return;
        }

        displayFriendsCleanStyle(filteredFriends, container);

    } catch (error) {  
        console.error("Error loading friends:", error);  
        showErrorState(container, error.message);  
    }
}

function showLoadingSkeleton(container) {
    let html = '';
    for (let i = 0; i < 6; i++) {
        html += `
            <div class="friend-skeleton">
                <div class="skeleton-avatar"></div>
                <div class="skeleton-info">
                    <div class="skeleton-name"></div>
                    <div class="skeleton-status"></div>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

async function getUnreadMessageCounts(friendIds) {
    const unreadCounts = {};

    try {
        const { data: unreadMessages, error } = await supabase
            .from('messages')
            .select('sender_id')
            .eq('receiver_id', currentUser.id)
            .in('sender_id', friendIds)
            .eq('read', false);

        if (!error && unreadMessages) {
            unreadMessages.forEach(msg => {
                unreadCounts[msg.sender_id] = (unreadCounts[msg.sender_id] || 0) + 1;
            });
        }
    } catch (error) {
        console.log("Note: Could not load unread counts", error.message);
    }

    return unreadCounts;
}

function updateFriendsStats(friends) {
    const totalFriends = document.getElementById('totalFriends');
    const onlineFriends = document.getElementById('onlineFriends');

    if (totalFriends) totalFriends.textContent = friends.length;
    if (onlineFriends) {
        const onlineCount = friends.filter(f => f.is_online).length;
        onlineFriends.textContent = onlineCount;
    }
}

function displayFriendsCleanStyle(friends, container) {
    // Sort: online first, then by unread count, then by name
    friends.sort((a, b) => {
        if (a.is_online && !b.is_online) return -1;
        if (!a.is_online && b.is_online) return 1;
        if (a.unreadCount > b.unreadCount) return -1;
        if (a.unreadCount < b.unreadCount) return 1;
        return a.username.localeCompare(b.username);
    });

    let html = '';  
    friends.forEach(friend => {  
        const isOnline = friend.is_online || false;  
        const firstLetter = friend.username ? friend.username.charAt(0).toUpperCase() : '?';  
        const avatarColor = '#667eea';

        const phoneIconSVG = `<svg class="phone-icon" viewBox="0 0 24 24" width="20" height="20">
            <path fill="white" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
        </svg>`;

        html += `  
            <div class="friend-item-clean" onclick="openChat('${friend.id}', '${friend.username}')">  
                <div class="friend-avatar-clean" style="background: ${avatarColor};" data-user-id="${friend.id}">  
                    ${firstLetter}
                    <span class="status-indicator-clean ${isOnline ? 'online' : 'offline'}"></span>
                </div>  
                <div class="friend-info-clean">  
                    <div class="friend-name-status">  
                        <div class="friend-name-clean">${friend.username}</div>  
                        <div class="friend-status-clean">  
                            ${isOnline ? 'Online' : getTimeAgo(new Date(friend.last_seen || new Date()))}  
                        </div>  
                    </div>  
                    <div class="friend-actions" style="display: flex; align-items: center; gap: 10px;">
                        ${friend.unreadCount > 0 ? `  
                            <div class="unread-badge-clean">  
                                ${friend.unreadCount > 9 ? '9+' : friend.unreadCount}  
                            </div>  
                        ` : ''}
                        <button class="call-button ${isOnline ? '' : 'offline'}" 
                                onclick="startCall('${friend.id}', '${friend.username}', event)"
                                ${!isOnline ? 'disabled' : ''}
                                title="${isOnline ? 'Call ' + friend.username : 'Friend is offline'}">
                            ${phoneIconSVG}
                        </button>
                    </div>
                </div>  
            </div>  
        `;  
    });  

    container.innerHTML = html;  
}

function showEmptyFriends(container) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">👥</div>
            <h3 class="empty-title">No Friends Yet</h3>
            <p class="empty-desc">Add friends to start chatting!</p>
        </div>
    `;
}

function showErrorState(container, errorMsg) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <h3 class="empty-title">Error Loading Friends</h3>
            <p class="empty-desc">${errorMsg}</p>
            <button onclick="loadFriendsList()" style="margin-top: 15px; padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 10px;">Retry</button>
        </div>
    `;
}

// ==================== UTILITY FUNCTIONS ====================
function getTimeAgo(date) {
    if (!date) return 'Never';
    
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function setupSearch() {
    const searchInput = document.getElementById('searchFriendsInput');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        loadFriendsList(e.target.value);
    });
}

// ==================== CLEANUP ====================
window.addEventListener('beforeunload', async () => {
    if (currentUser) {
        await presenceTracker.stop();
    }
    
    if (presenceChannel) {
        supabase.removeChannel(presenceChannel);
    }
});

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', initFriendsPage);