// Friends Page Script - WITH ABSOLUTE PATHS
import { auth } from '/app/utils/auth.js'
import { supabase } from '/app/utils/supabase.js'

console.log("✨ Friends Page Loaded");

// ==================== ABSOLUTE PATHS CONFIGURATION ====================
const PATHS = {
    // Absolute paths from root
    HOME: '/app/pages/home/index.html',
    LOGIN: '/app/pages/login/index.html',  
    SIGNUP: '/app/pages/auth/index.html',
    CHATS: '/app/pages/chats/index.html',
    FRIENDS: '/app/pages/home/friends/index.html'
};
// ==================== END PATHS CONFIG ====================

// Current user
let currentUser = null;
let currentProfile = null;
let allFriends = [];

// Toast Notification System
class ToastNotification {
    constructor() {
        this.container = document.getElementById('toastContainer');
        if (!this.container) {
            this.createToastContainer();
        }
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

    success(title, message = '') {
        return this.show({ title, message, type: 'success' });
    }

    error(title, message = '') {
        return this.show({ title, message, type: 'error' });
    }

    info(title, message = '') {
        return this.show({ title, message, type: 'info' });
    }
}

const toast = new ToastNotification();

// Initialize friends page
async function initFriendsPage() {
    console.log("Initializing friends page...");
    console.log("Using absolute paths:", PATHS);

    // Set up loading timeout safety
    const loadingTimeout = setTimeout(() => {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
            console.log("Safety timeout: Hid loading indicator");
        }
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

        // Load friends
        await loadFriendsList();

        // Set up search
        setupSearch();

        // Hide loading
        clearTimeout(loadingTimeout);
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }

    } catch (error) {
        console.error("Init error:", error);
        clearTimeout(loadingTimeout);
        toast.error("Error", "Failed to load page");

        // Hide loading on error
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
}

// Show login prompt
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

    // Hide loading
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
}

// ==================== NAVIGATION USING ABSOLUTE PATHS ====================

function goToLogin() {
    window.location.href = PATHS.LOGIN;
}

function goToSignup() {
    window.location.href = PATHS.SIGNUP;
}

function goToHome() {
    window.location.href = PATHS.HOME;
}

function goToFriends() {
    window.location.href = PATHS.FRIENDS;
}

// Load friends list
async function loadFriendsList(searchTerm = '') {
    if (!currentUser) return;

    const container = document.getElementById('friendsContainer');  
    if (!container) return;  

    try {  
        // Show loading skeleton
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
            .select('id, username, status, last_seen, avatar_url')  
            .in('id', friendIds);  

        if (profilesError) throw profilesError;  

        // Get unread message counts
        const unreadCounts = await getUnreadMessageCounts(friendIds);

        // Store all friends for search filtering
        allFriends = profiles.map(profile => ({
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

// Show loading skeleton
function showLoadingSkeleton(container) {
    let html = '';
    for (let i = 0; i < 8; i++) {
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

// Get unread message counts
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

// Update friends stats
function updateFriendsStats(friends) {
    const totalFriends = document.getElementById('totalFriends');
    const onlineFriends = document.getElementById('onlineFriends');

    if (totalFriends) totalFriends.textContent = friends.length;
    if (onlineFriends) {
        const onlineCount = friends.filter(f => f.status === 'online').length;
        onlineFriends.textContent = onlineCount;
    }
}

// Display friends in CLEAN style
function displayFriendsCleanStyle(friends, container) {
    // Sort: online first, then by unread count, then by name
    friends.sort((a, b) => {
        // Online first
        if (a.status === 'online' && b.status !== 'online') return -1;
        if (a.status !== 'online' && b.status === 'online') return 1;

        // More unread messages first
        if (a.unreadCount > b.unreadCount) return -1;
        if (a.unreadCount < b.unreadCount) return 1;

        // Alphabetical
        return a.username.localeCompare(b.username);
    });

    let html = '';  
    friends.forEach(friend => {  
        const isOnline = friend.status === 'online';  
        const lastSeen = friend.last_seen ? new Date(friend.last_seen) : new Date();  
        const timeAgo = getTimeAgo(lastSeen);  

        // Get ONLY FIRST LETTER (uppercase)
        const firstLetter = friend.username ? friend.username.charAt(0).toUpperCase() : '?';  

        // Simple avatar color (all same color)
        const avatarColor = '#667eea';

        html += `  
            <div class="friend-item-clean" onclick="openChat('${friend.id}', '${friend.username}')">  
                <div class="friend-avatar-clean" style="background: ${avatarColor};">  
                    ${firstLetter}
                    <span class="status-indicator-clean ${isOnline ? 'online' : 'offline'}"></span>
                </div>  
                <div class="friend-info-clean">  
                    <div class="friend-name-status">  
                        <div class="friend-name-clean">${friend.username}</div>  
                        <div class="friend-status-clean">  
                            ${isOnline ? 'Online' : 'Last seen ' + timeAgo}  
                        </div>  
                    </div>  
                    ${friend.unreadCount > 0 ? `  
                        <div class="unread-badge-clean">  
                            ${friend.unreadCount > 9 ? '9+' : friend.unreadCount}  
                        </div>  
                    ` : ''}  
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
            <p class="empty-desc">Add friends to start chatting</p>  
            <button class="search-btn" onclick="openSearchModal()" style="margin-top: 20px;">  
                <i class="fas fa-search"></i> Find Friends  
            </button>  
        </div>  
    `;
}

function showErrorState(container, errorMessage) {
    container.innerHTML = `  
        <div class="empty-state">  
            <div class="empty-icon">⚠️</div>  
            <h3 class="empty-title">Connection Error</h3>  
            <p class="empty-desc">${errorMessage || 'Could not load friends'}</p>  
            <button class="search-btn" onclick="loadFriendsList()" style="margin-top: 20px;">
                <i class="fas fa-sync"></i> Try Again
            </button>
        </div>  
    `;
}

// Get time ago string
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
    return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Set up search functionality
function setupSearch() {
    const searchInput = document.getElementById('searchFriendsInput');
    if (!searchInput) return;

    let searchTimeout;

    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        const searchTerm = this.value.trim();

        searchTimeout = setTimeout(() => {
            loadFriendsList(searchTerm);
        }, 300);
    });
}

// Open chat with friend
async function openChat(friendId, friendUsername = 'Friend') {
    console.log("Opening chat with:", friendId);

    // Mark messages as read when opening chat
    await markMessagesAsRead(friendId);

    // Store friend info
    sessionStorage.setItem('currentChatFriend', JSON.stringify({  
        id: friendId,  
        username: friendUsername  
    }));  

    // Use absolute path
    window.location.href = `${PATHS.CHATS}?friendId=${friendId}`;
}

// Mark messages as read
async function markMessagesAsRead(friendId) {
    try {
        await supabase
            .from('messages')
            .update({ read: true })
            .eq('receiver_id', currentUser.id)
            .eq('sender_id', friendId)
            .eq('read', false);

        // Update unread count locally
        const friend = allFriends.find(f => f.id === friendId);
        if (friend) {
            friend.unreadCount = 0;
            displayFriendsCleanStyle(allFriends, document.getElementById('friendsContainer'));
        }
    } catch (error) {
        console.log("Could not mark messages as read:", error.message);
    }
}

// Search modal functions
function openSearchModal() {
    const modal = document.getElementById('searchModal');
    if (modal) {
        modal.style.display = 'flex';
        loadSearchResults();
    }
}

function openNotifications() {
    const modal = document.getElementById('notificationsModal');
    if (modal) {
        modal.style.display = 'flex';
        loadNotifications();
    }
}

function closeModal() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.style.display = 'none';
    });
}

async function loadSearchResults() {
    try {
        if (!currentUser) return;

        const container = document.getElementById('searchResults');
        if (!container) return;

        // Get all users except current user
        const { data: users, error } = await supabase
            .from('profiles')
            .select('id, username')
            .neq('id', currentUser.id)
            .limit(20);

        if (error) throw error;

        if (!users || users.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 30px 20px;">
                    <div class="empty-icon">👥</div>
                    <p>No users found</p>
                </div>
            `;
            return;
        }

        // Display users
        let html = '';
        users.forEach(user => {
            const firstLetter = user.username.charAt(0).toUpperCase();
            html += `
                <div class="search-result">
                    <div class="search-avatar" style="background: #667eea;">${firstLetter}</div>
                    <div class="search-info">
                        <div class="search-name">${user.username}</div>
                    </div>
                    <button class="send-request-btn" onclick="sendFriendRequest('${user.id}', '${user.username}', this)">
                        Add Friend
                    </button>
                </div>
            `;
        });

        container.innerHTML = html;

    } catch (error) {
        console.error("Search error:", error);
        toast.error("Search", "Could not load users");
    }
}

async function sendFriendRequest(toUserId, toUsername, button) {
    if (!currentUser) return;

    button.textContent = 'Sending...';
    button.disabled = true;

    try {
        const { error } = await supabase
            .from('friend_requests')
            .insert({
                sender_id: currentUser.id,
                receiver_id: toUserId,
                status: 'pending'
            });

        if (error) throw error;

        button.textContent = '✓ Sent';
        button.classList.add('sent');
        toast.success("Request Sent", `Friend request sent to ${toUsername}`);

    } catch (error) {
        console.error("Send request error:", error);
        button.textContent = 'Add Friend';
        button.disabled = false;
        toast.error("Error", "Could not send request");
    }
}

async function loadNotifications() {
    const container = document.getElementById('notificationsList');
    if (!container || !currentUser) return;

    try {
        const { data: requests, error } = await supabase
            .from('friend_requests')
            .select('id, sender_id, created_at')
            .eq('receiver_id', currentUser.id)
            .eq('status', 'pending');

        if (error) throw error;

        if (!requests || requests.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 40px 20px;">
                    <div class="empty-icon">🔔</div>
                    <p>No notifications</p>
                </div>
            `;
            return;
        }
        // Get sender usernames
          // Get sender usernames
        const senderIds = requests.map(r => r.sender_id);
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', senderIds);

        const profileMap = {};
        if (profiles) {
            profiles.forEach(p => profileMap[p.id] = p.username);
        }

        html += `  
    <div class="notification-item">  
        <div class="notification-avatar" style="background: #667eea;">${firstLetter}</div>
        <div class="notification-content">  
            <div class="notification-text">  
                <div class="notification-title">${senderName} wants to be friends</div>  
                <div class="notification-time">${timeAgo}</div>  
            </div>  
            <div class="notification-actions">  
                <button class="accept-btn" onclick="window.acceptFriendRequest('${notification.id}', '${notification.sender_id}', '${senderName}', this)">  
                    Accept  
                </button>  
                <button class="decline-btn" onclick="window.declineFriendRequest('${notification.id}', this)">  
                    Decline  
                </button>  
            </div>  
        </div>  
    </div>  
`;

        container.innerHTML = html;

    } catch (error) {
        console.error("Notifications error:", error);
        container.innerHTML = `
            <div class="empty-state" style="padding: 40px 20px;">
                <div class="empty-icon">⚠️</div>
                <p>Error loading notifications</p>
            </div>
        `;
    }
}

async function acceptRequest(requestId, senderId, button) {
    button.textContent = 'Accepting...';
    button.disabled = true;

    try {
        // Update request status
        await supabase
            .from('friend_requests')
            .update({ status: 'accepted' })
            .eq('id', requestId);

        // Add to friends table
        await supabase
            .from('friends')
            .insert([
                { user_id: currentUser.id, friend_id: senderId },
                { user_id: senderId, friend_id: currentUser.id }
            ]);

        button.textContent = '✓ Accepted';
        toast.success("Friend Added", "You are now friends!");

        // Reload friends list
        setTimeout(() => {
            loadFriendsList();
            loadNotifications();
        }, 1000);

    } catch (error) {
        console.error("Accept error:", error);
        button.textContent = 'Accept';
        button.disabled = false;
        toast.error("Error", "Could not accept request");
    }
}

async function declineRequest(requestId, button) {
    button.textContent = 'Declining...';
    button.disabled = true;

    try {
        await supabase
            .from('friend_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);

        button.textContent = '✗ Declined';
        toast.info("Request Declined", "Friend request declined");

        setTimeout(() => loadNotifications(), 500);

    } catch (error) {
        console.error("Decline error:", error);
        button.textContent = 'Decline';
        button.disabled = false;
        toast.error("Error", "Could not decline request");
    }
}

// ==================== GLOBAL FUNCTIONS ====================

window.goToHome = goToHome;
window.goToFriends = goToFriends;
window.goToLogin = goToLogin;
window.goToSignup = goToSignup;
window.openSearchModal = openSearchModal;
window.openNotifications = openNotifications;
window.closeModal = closeModal;
window.openChat = openChat;
window.sendFriendRequest = sendFriendRequest;
window.acceptRequest = acceptRequest;
window.declineRequest = declineRequest;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initFriendsPage);
