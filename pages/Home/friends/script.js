// Friends Page Script - WITH ABSOLUTE PATHS AND CALL FUNCTIONALITY
import { auth } from '/app/utils/auth.js'
import { supabase } from '/app/utils/supabase.js'
import presenceTracker from '/app/utils/presence.js';

console.log("✨ Friends Page Loaded");






// ==================== ABSOLUTE PATHS CONFIGURATION ====================


// Add this function to your script.js file (around line 123)
function setupSearch() {
  const searchInput = document.querySelector('.search-bar input');
  const friendItems = document.querySelectorAll('.friend-item');
  
  if (!searchInput) return;
  
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    
    friendItems.forEach(item => {
      const friendName = item.querySelector('.friend-name')?.textContent.toLowerCase() || '';
      const friendStatus = item.querySelector('.friend-status')?.textContent.toLowerCase() || '';
      
      const matches = friendName.includes(searchTerm) || friendStatus.includes(searchTerm);
      item.style.display = matches ? 'flex' : 'none';
    });
  });
}

const PATHS = {
    // Absolute paths from root
    HOME: '/app/pages/home/index.html',
    LOGIN: '/app/pages/login/index.html',  
    SIGNUP: '/app/pages/auth/index.html',
    CHATS: '/app/pages/chats/index.html',
    FRIENDS: '/app/pages/home/friends/index.html',
    PHONE: '/app/pages/phone/index.html',
    PHONE_CALL: '/app/pages/phone/call.html'
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

// ==================== UPDATED INIT FRIENDS PAGE FUNCTION ====================

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

        // ✅ START PRESENCE TRACKING - ADDED HERE
        await presenceTracker.start(currentUser.id);

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

        // Setup real-time listeners for friend status changes
        setupFriendPresenceListener();

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

// ==================== PRESENCE TRACKING FUNCTIONS ====================

let presenceChannel = null;

// Setup listener for friend presence changes
function setupFriendPresenceListener() {
    if (!currentUser || !allFriends.length) return;
    
    // Create channel name
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
            async (payload) => {
                console.log('👥 Friend presence changed:', payload.new);
                
                // Update friend's online status in our array
                const friend = allFriends.find(f => f.id === payload.new.user_id);
                if (friend) {
                    friend.is_online = payload.new.is_online;
                    friend.last_seen = payload.new.last_seen;
                    
                    // Update UI
                    updateFriendOnlineStatus(friend.id, payload.new.is_online);
                }
            }
        )
        .subscribe((status) => {
            console.log(`📡 Friend presence channel: ${status}`);
        });
}

// Update friend's online status in UI
function updateFriendOnlineStatus(friendId, isOnline) {
    // Find all friend items in DOM
    const friendItems = document.querySelectorAll('.friend-item-clean');
    
    friendItems.forEach(item => {
        const avatar = item.querySelector('.friend-avatar-clean');
        if (avatar && avatar.textContent?.trim()[0]) {
            // Check if this is the right friend item
            const friendNameElement = item.querySelector('.friend-name-clean');
            if (friendNameElement) {
                // We need to match by friend ID - we'll store it in dataset
                const friendName = friendNameElement.textContent;
                const friend = allFriends.find(f => f.username === friendName);
                
                if (friend && friend.id === friendId) {
                    const statusIndicator = item.querySelector('.status-indicator-clean');
                    const statusText = item.querySelector('.friend-status-clean');
                    const callButton = item.querySelector('.call-button');
                    
                    if (statusIndicator) {
                        statusIndicator.className = `status-indicator-clean ${isOnline ? 'online' : 'offline'}`;
                    }
                    
                    if (statusText) {
                        statusText.textContent = isOnline ? 'Online' : 'Last seen ' + getTimeAgo(new Date());
                    }
                    
                    if (callButton) {
                        if (isOnline) {
                            callButton.classList.remove('offline');
                            callButton.disabled = false;
                            callButton.title = 'Call friend';
                        } else {
                            callButton.classList.add('offline');
                            callButton.disabled = true;
                            callButton.title = 'Friend is offline';
                        }
                    }
                }
            }
        }
    });
}

// Check if user is online (helper function)
async function checkIfUserIsOnline(userId) {
    try {
        const { data: presence, error } = await supabase
            .from('user_presence')
            .select('is_online, last_seen')
            .eq('user_id', userId)
            .single();
        
        if (error || !presence) {
            return false;
        }
        
        // If marked online
        if (presence.is_online) {
            return true;
        }
        
        // Check if recently seen (within 2 minutes)
        const lastSeen = new Date(presence.last_seen);
        const now = new Date();
        const minutesAway = (now - lastSeen) / (1000 * 60);
        
        return minutesAway < 2;
        
    } catch (error) {
        console.error("Error checking online status:", error);
        return false;
    }
}

// Clean up on page unload
window.addEventListener('beforeunload', async () => {
    if (currentUser) {
        await presenceTracker.stop();
    }
    
    if (presenceChannel) {
        supabase.removeChannel(presenceChannel);
    }
});

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
            .select('id, username, avatar_url')  
            .in('id', friendIds);  

        if (profilesError) throw profilesError;  

        // Get presence data for each friend
        const presencePromises = profiles.map(async (profile) => {
            const isOnline = await checkIfUserIsOnline(profile.id);
            return { ...profile, is_online: isOnline };
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

    if (totalFriends) {
        totalFriends.textContent = friends.length;
    }
    
    if (onlineFriends) {
        const onlineCount = friends.filter(f => f.is_online).length;
        onlineFriends.textContent = onlineCount;
    }
}

// Display friends in CLEAN style WITH CALL BUTTONS
function displayFriendsCleanStyle(friends, container) {
    // Sort: online first, then by unread count, then by name
    friends.sort((a, b) => {
        // Online first
        if (a.is_online && !b.is_online) return -1;
        if (!a.is_online && b.is_online) return 1;

        // More unread messages first
        if (a.unreadCount > b.unreadCount) return -1;
        if (a.unreadCount < b.unreadCount) return 1;

        // Alphabetical
        return a.username.localeCompare(b.username);
    });

    let html = '';  
    friends.forEach(friend => {  
        const isOnline = friend.is_online || false;  
        const timeAgo = 'Recently'; // We'll update this dynamically

        // Get ONLY FIRST LETTER (uppercase)
        const firstLetter = friend.username ? friend.username.charAt(0).toUpperCase() : '?';  

        // Simple avatar color
        const avatarColor = '#667eea';

        // Phone icon SVG
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
                            ${isOnline ? 'Online' : 'Recently'}  
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

// ==================== REST OF THE FILE CONTINUES... ====================
// [The rest of your existing functions remain the same]
// showEmptyFriends, showErrorState, getTimeAgo, setupSearch, openChat,
// markMessagesAsRead, all call functions, modal functions, etc.

// IMPORTANT: At the very end, add:
document.addEventListener('DOMContentLoaded', initFriendsPage);