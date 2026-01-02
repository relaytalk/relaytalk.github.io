// Friends Page Script - WHATSAPP STYLE
import { auth } from '../../../utils/auth.js'
import { supabase } from '../../../utils/supabase.js'

console.log("✨ Friends Page Loaded");

// Current user
let currentUser = null;
let currentProfile = null;

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
        const { title = '', message = '', type = 'info', duration = 5000 } = options;
        
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
}

const toast = new ToastNotification();

// Initialize friends page
async function initFriendsPage() {
    console.log("Initializing friends page...");

    // Hide loading after 2 seconds max (safety net)
    setTimeout(() => {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator && loadingIndicator.style.display !== 'none') {
            loadingIndicator.style.display = 'none';
            console.log("⚠️ Forced loading stop");
        }
    }, 5000);

    try {
        const { success, user } = await auth.getCurrentUser();  

        if (!success || !user) {  
            // Show login prompt instead of redirecting
            showLoginPrompt();
            return;  
        }  

        currentUser = user;  
        console.log("✅ Authenticated as:", currentUser.email);  

        // Load friends
        await loadFriendsList();
        
        // Hide loading
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }

    } catch (error) {
        console.error("Init error:", error);
        toast.error("Error", "Failed to load page");
        
        // Hide loading on error
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
}

// Show login prompt (beautiful design)
function showLoginPrompt() {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;
    
    mainContent.innerHTML = `
        <div class="login-prompt" style="
            text-align: center;
            padding: 60px 20px;
            max-width: 400px;
            margin: 100px auto;
        ">
            <div style="
                font-size: 4rem;
                margin-bottom: 20px;
                opacity: 0.8;
            ">🔒</div>
            <h2 style="
                font-size: 1.8rem;
                margin-bottom: 15px;
                background: linear-gradient(45deg, #667eea, #764ba2);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            ">Login Required</h2>
            <p style="
                color: #a0a0c0;
                margin-bottom: 30px;
                line-height: 1.5;
            ">Please login to view your friends and messages</p>
            <div style="display: flex; flex-direction: column; gap: 15px; max-width: 250px; margin: 0 auto;">
                <button onclick="goToLogin()" style="
                    background: linear-gradient(45deg, #667eea, #764ba2);
                    color: white;
                    border: none;
                    padding: 15px 25px;
                    border-radius: 12px;
                    font-size: 1rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                " onmouseover="this.style.transform='translateY(-2px)'" 
                onmouseout="this.style.transform='translateY(0)'">
                    <i class="fas fa-sign-in-alt"></i> Login
                </button>
                <button onclick="goToSignup()" style="
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    padding: 15px 25px;
                    border-radius: 12px;
                    font-size: 1rem;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                " onmouseover="this.style.transform='translateY(-2px)'" 
                onmouseout="this.style.transform='translateY(0)'">
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

// CORRECT PATHS for login/signup
function goToLogin() {
    window.location.href = '../../../auth/index.html';  // Adjust based on your structure
}

function goToSignup() {
    window.location.href = '../../../auth/index.html?signup=true';  // Or your signup page
}

// Load friends list with WhatsApp style
async function loadFriendsList() {
    if (!currentUser) return;

    const container = document.getElementById('friendsContainer');  
    if (!container) return;  

    try {  
        // Get friend IDs  
        const { data: friends, error } = await supabase  
            .from('friends')  
            .select('friend_id')  
            .eq('user_id', currentUser.id);  

        if (error) throw error;  

        if (!friends || friends.length === 0) {  
            showEmptyFriends(container);  
            return;  
        }  

        // Get profiles for each friend  
        const friendIds = friends.map(f => f.friend_id);  
        const { data: profiles, error: profilesError } = await supabase  
            .from('profiles')  
            .select('id, username, status, last_seen')  
            .in('id', friendIds);  

        if (profilesError) throw profilesError;  

        // Get unread message counts for each friend
        const unreadCounts = await getUnreadMessageCounts(friendIds);

        // Update stats
        updateFriendsStats(profiles);

        // Display friends in WhatsApp style
        displayFriendsWhatsAppStyle(profiles, unreadCounts, container);

    } catch (error) {  
        console.error("Error loading friends:", error);  
        showEmptyFriends(container);  
    }
}

// Get unread message counts for each friend
async function getUnreadMessageCounts(friendIds) {
    const unreadCounts = {};
    
    try {
        // Assuming you have a messages table with a 'read' boolean field
        // This query counts unread messages from each friend
        for (const friendId of friendIds) {
            const { count, error } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('receiver_id', currentUser.id)
                .eq('sender_id', friendId)
                .eq('read', false);
            
            if (!error && count) {
                unreadCounts[friendId] = count;
            }
        }
    } catch (error) {
        console.log("Note: Could not load unread counts", error.message);
    }
    
    return unreadCounts;
}

// Update friends stats
function updateFriendsStats(profiles) {
    const totalFriends = document.getElementById('totalFriends');
    const onlineFriends = document.getElementById('onlineFriends');
    
    if (totalFriends) totalFriends.textContent = profiles.length;
    if (onlineFriends) {
        const onlineCount = profiles.filter(p => p.status === 'online').length;
        onlineFriends.textContent = onlineCount;
    }
}

// Display friends in WhatsApp style
function displayFriendsWhatsAppStyle(profiles, unreadCounts, container) {
    // Sort: online first, then by unread count, then by name
    profiles.sort((a, b) => {
        // Online first
        if (a.status === 'online' && b.status !== 'online') return -1;
        if (a.status !== 'online' && b.status === 'online') return 1;
        
        // More unread messages first
        const aUnread = unreadCounts[a.id] || 0;
        const bUnread = unreadCounts[b.id] || 0;
        if (aUnread > bUnread) return -1;
        if (aUnread < bUnread) return 1;
        
        // Alphabetical
        return a.username.localeCompare(b.username);
    });

    let html = '';  
    profiles.forEach(profile => {  
        const isOnline = profile.status === 'online';  
        const lastSeen = profile.last_seen ? new Date(profile.last_seen) : new Date();  
        const timeAgo = getTimeAgo(lastSeen);  
        const firstLetter = profile.username ? profile.username.charAt(0).toUpperCase() : '?';  
        const unreadCount = unreadCounts[profile.id] || 0;

        html += `  
            <div class="friend-item-whatsapp" onclick="openChat('${profile.id}', '${profile.username}')">  
                <div class="friend-avatar-whatsapp">  
                    <div class="friend-avatar-initial">${firstLetter}</div>  
                    <span class="status-indicator-whatsapp ${isOnline ? 'online' : 'offline'}"></span>
                </div>  
                <div class="friend-info-whatsapp">  
                    <div class="friend-name-status">  
                        <div class="friend-name-whatsapp">${profile.username}</div>  
                        <div class="friend-status-whatsapp">  
                            ${isOnline ? 'Online' : 'Last seen ' + timeAgo}  
                        </div>  
                    </div>  
                    ${unreadCount > 0 ? `  
                        <div class="unread-badge">  
                            ${unreadCount > 9 ? '9+' : unreadCount}  
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
            <button class="search-btn" onclick="openSearch()" style="margin-top: 20px;">  
                <i class="fas fa-search"></i> Find Friends  
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

// CORRECT PATH for chats page
async function openChat(friendId, friendUsername = 'Friend') {
    console.log("Opening chat with:", friendId);
    
    // Mark messages as read when opening chat
    await markMessagesAsRead(friendId);
    
    // Store friend info
    sessionStorage.setItem('currentChatFriend', JSON.stringify({  
        id: friendId,  
        username: friendUsername  
    }));  
    
    // CORRECT PATH to chats page
    window.location.href = '../chats/index.html?friendId=' + friendId;  // Adjust if needed
}

// Mark messages as read when opening chat
async function markMessagesAsRead(friendId) {
    try {
        await supabase
            .from('messages')
            .update({ read: true })
            .eq('receiver_id', currentUser.id)
            .eq('sender_id', friendId)
            .eq('read', false);
        
        // Reload friends list to update unread badges
        setTimeout(() => loadFriendsList(), 500);
    } catch (error) {
        console.log("Could not mark messages as read:", error.message);
    }
}

// Navigation functions
function goToHome() {
    window.location.href = '../index.html';  // Adjust if needed
}

function openSearch() {
    // Show search modal or redirect to search
    const modal = document.getElementById('searchModal');
    if (modal) {
        modal.style.display = 'flex';
        loadSearchResults();
    } else {
        window.location.href = '../index.html#search';  // Adjust
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

// Make functions available globally
window.goToHome = goToHome;
window.openSearch = openSearch;
window.openNotifications = openNotifications;
window.closeModal = closeModal;
window.openChat = openChat;
window.goToLogin = goToLogin;
window.goToSignup = goToSignup;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initFriendsPage);