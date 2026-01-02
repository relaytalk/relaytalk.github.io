// Home Page Script - FINAL WORKING VERSION WITH TOAST NOTIFICATIONS
import { auth } from '../../utils/auth.js'
import { supabase } from '../../utils/supabase.js'

console.log("✨ Relay Home Page Loaded");

// ==================== TOAST NOTIFICATION SYSTEM ====================
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
        const {
            title = '',
            message = '',
            type = 'info',
            duration = 5000,
            icon = null
        } = options;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconHtml = icon;
        if (!iconHtml) {
            switch(type) {
                case 'success': iconHtml = '✨'; break;
                case 'error': iconHtml = '❌'; break;
                case 'warning': iconHtml = '⚠️'; break;
                case 'info': iconHtml = '💬'; break;
                default: iconHtml = '💬';
            }
        }

        const now = new Date();
        const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        toast.innerHTML = `
            <div class="toast-icon">${iconHtml}</div>
            <div class="toast-content">
                <div class="toast-title">
                    ${title}
                    <span style="color: #a0a0c0; font-size: 0.8rem; font-weight: normal; margin-left: auto;">${timeString}</span>
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
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.remove();
                    }
                }, 300);
            }, duration);
        }

        return toast;
    }

    success(title, message = '', duration = 5000) {
        return this.show({ 
            title, 
            message, 
            type: 'success', 
            duration, 
            icon: '✨' 
        });
    }

    error(title, message = '', duration = 7000) {
        return this.show({ 
            title, 
            message, 
            type: 'error', 
            duration, 
            icon: '❌' 
        });
    }

    warning(title, message = '', duration = 6000) {
        return this.show({ 
            title, 
            message, 
            type: 'warning', 
            duration, 
            icon: '⚠️' 
        });
    }

    info(title, message = '', duration = 4000) {
        return this.show({ 
            title, 
            message, 
            type: 'info', 
            duration, 
            icon: '💬' 
        });
    }

    friendRequest(title, message = '', duration = 6000) {
        return this.show({ 
            title, 
            message, 
            type: 'info', 
            duration, 
            icon: '👋' 
        });
    }

    friendAdded(title, message = '', duration = 5000) {
        return this.show({ 
            title, 
            message, 
            type: 'success', 
            duration, 
            icon: '🤝' 
        });
    }
}

// Initialize toast system
const toast = new ToastNotification();

// Make toast available globally
window.showToast = toast.show.bind(toast);
window.showSuccess = toast.success.bind(toast);
window.showError = toast.error.bind(toast);
window.showWarning = toast.warning.bind(toast);
window.showInfo = toast.info.bind(toast);
window.showFriendRequest = toast.friendRequest.bind(toast);
window.showFriendAdded = toast.friendAdded.bind(toast);

// ==================== END TOAST SYSTEM ====================

// Current user
let currentUser = null;
let currentProfile = null;

// Initialize home page
async function initHomePage() {
    console.log("Initializing home page...");

    // Check if user is logged in  
    const { success, user } = await auth.getCurrentUser();  

    if (!success || !user) {  
        showError("Login Required", "Please login to continue");
        setTimeout(() => {
            window.location.href = '../auth/index.html';  
        }, 1500);
        return;  
    }  

    currentUser = user;  
    console.log("Logged in as:", currentUser.email);  

    // Get user profile  
    await loadUserProfile();  

    // Update UI  
    updateWelcomeMessage();  
    await loadFriends();  
    await updateNotificationsBadge();  

    // Set up event listeners  
    setupEventListeners();  

    console.log("Home page initialized for:", currentProfile?.username);

    // Hide loading indicator
    setTimeout(() => {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.classList.add('hidden');
            setTimeout(() => {
                loadingIndicator.style.display = 'none';
                
                // Show welcome toast
                if (currentProfile) {
                    setTimeout(() => {
                        showSuccess(
                            "Welcome to Relay!",
                            `Good to see you, ${currentProfile.username} 👋`
                        );
                    }, 300);
                }
            }, 300);
        }
    }, 100);
}

// Load user profile
async function loadUserProfile() {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (error) throw error;  

        currentProfile = profile;  
        console.log("Profile loaded:", profile.username);  

    } catch (error) {  
        console.error("Error loading profile:", error);  
        currentProfile = {  
            username: currentUser.user_metadata?.username || 'User',  
            full_name: currentUser.user_metadata?.full_name || 'User',  
            avatar_url: currentUser.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=User&background=random`  
        };  
    }
}

// Update welcome message
function updateWelcomeMessage() {
    if (!currentProfile) return;

    const welcomeElement = document.getElementById('welcomeTitle');  
    if (welcomeElement) {  
        welcomeElement.textContent = `Welcome, ${currentProfile.username}!`;  
    }  

    const userAvatar = document.getElementById('userAvatar');  
    if (userAvatar && currentProfile.avatar_url) {  
        userAvatar.src = currentProfile.avatar_url;  
        userAvatar.alt = currentProfile.username;  
    }
}

// Load friends list
async function loadFriends() {
    if (!currentUser) return;

    console.log("Loading friends for user:", currentUser.id);  

    const container = document.getElementById('friendsList');  
    if (!container) {  
        console.error("Friends list container not found!");  
        return;  
    }  

    try {  
        // Get friend IDs  
        const { data: friends, error } = await supabase  
            .from('friends')  
            .select('friend_id')  
            .eq('user_id', currentUser.id);  

        if (error) {  
            console.log("Error loading friends:", error.message);  
            showEmptyFriends(container);  
            return;  
        }  

        console.log("Found friend IDs:", friends?.length || 0);  

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

        if (profilesError) {  
            console.error("Error loading profiles:", profilesError);  
            showEmptyFriends(container);  
            return;  
        }  

        let html = '';  
        profiles.forEach(profile => {  
            const isOnline = profile.status === 'online';  
            const lastSeen = profile.last_seen ? new Date(profile.last_seen) : new Date();  
            const timeAgo = getTimeAgo(lastSeen);  
            const firstLetter = profile.username ? profile.username.charAt(0).toUpperCase() : '?';  

            html += `  
                <div class="friend-card" onclick="window.openChat('${profile.id}', '${profile.username}')">  
                    <div class="friend-avatar" style="background: linear-gradient(45deg, #667eea, #764ba2);">  
                        ${firstLetter}  
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

        container.innerHTML = html;  

    } catch (error) {  
        console.error("Error loading friends:", error);  
        showEmptyFriends(container);  
    }
}

function showEmptyFriends(container) {
    container.innerHTML = `  
        <div class="empty-state">  
            <div class="empty-icon">👥</div>  
            <p>No friends yet</p>  
            <p style="font-size: 0.9rem; margin-top: 10px;">Search for users to add friends</p>  
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
    if (diffDays < 30) return `${Math.floor(diffDays/7)}w ago`;  
    return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Open chat with friend
async function openChat(friendId, friendUsername = 'Friend') {
    console.log("Opening chat with:", friendId, friendUsername);

    // Show loading toast
    const loadingToast = showInfo("Opening Chat", `Connecting with ${friendUsername}...`);

    // Store friend info in session storage for chat page  
    sessionStorage.setItem('currentChatFriend', JSON.stringify({  
        id: friendId,  
        username: friendUsername  
    }));  

    // Remove loading toast
    setTimeout(() => {
        if (loadingToast && loadingToast.parentNode) {
            loadingToast.remove();
        }
    }, 500);

    // Redirect to chat page  
    window.location.href = `../chats/index.html?friendId=${friendId}`;
}

// Update notifications badge
async function updateNotificationsBadge() {
    try {
        const { data: notifications, error } = await supabase
            .from('friend_requests')
            .select('id')
            .eq('receiver_id', currentUser.id)
            .eq('status', 'pending');

        if (error) {  
            console.log("Friend requests error:", error.message);  
            hideNotificationBadge();  
            return;  
        }  

        const unreadCount = notifications?.length || 0;  
        updateBadgeDisplay(unreadCount);  

    } catch (error) {  
        console.error("Error loading notifications:", error);  
        hideNotificationBadge();  
    }
}

function updateBadgeDisplay(count) {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : count;
            badge.style.display = 'block';
            
            // Show subtle notification toast for first notification
            if (count === 1) {
                setTimeout(() => {
                    showInfo("New Notification", "You have a new friend request");
                }, 1000);
            }
        } else {
            badge.style.display = 'none';
        }
    }
}

function hideNotificationBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
        badge.style.display = 'none';
    }
}

// Open search modal
function openSearch() {
    console.log("Opening search modal");
    const modal = document.getElementById('searchModal');
    if (modal) {
        modal.style.display = 'flex';
        loadSearchResults();
    } else {
        console.error("Search modal not found!");
        showError("Search Unavailable", "The search feature is currently unavailable");
    }
}

// Open notifications modal
function openNotifications() {
    console.log("Opening notifications modal");
    const modal = document.getElementById('notificationsModal');
    if (modal) {
        modal.style.display = 'flex';
        loadNotifications();
    } else {
        console.error("Notifications modal not found!");
        showError("Notifications Unavailable", "Unable to load notifications");
    }
}

// Close modal
function closeModal() {
    console.log("Closing modal");
    const searchModal = document.getElementById('searchModal');
    const notificationsModal = document.getElementById('notificationsModal');

    if (searchModal) searchModal.style.display = 'none';  
    if (notificationsModal) notificationsModal.style.display = 'none';
}

// Load search results
async function loadSearchResults() {
    const container = document.getElementById('searchResults');
    const searchInput = document.getElementById('searchInput');

    if (!container) {  
        console.error("Search results container not found!");  
        return;  
    }  

    try {  
        const { data: allUsers, error } = await supabase  
            .from('profiles')  
            .select('id, username, full_name')  
            .neq('id', currentUser.id);  

        if (error) throw error;  

        if (!allUsers || allUsers.length === 0) {  
            container.innerHTML = `  
                <div class="empty-state">  
                    <div class="empty-icon">👥</div>  
                    <p>No other users found</p>  
                </div>  
            `;  
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
        console.error("Error loading users:", error);  
        container.innerHTML = `  
            <div class="empty-state">  
                <div class="empty-icon">⚠️</div>  
                <p>Error loading users</p>  
                <p style="font-size: 0.9rem;">${error.message}</p>  
            </div>  
        `;  
        showError("Connection Error", "Unable to load users list");
    }
}

// Display search results
async function displaySearchResults(users) {
    const container = document.getElementById('searchResults');

    if (!container) {  
        console.error("Search results container not found!");  
        return;  
    }  

    if (!users || users.length === 0) {  
        container.innerHTML = `  
            <div class="empty-state">  
                <div class="empty-icon">🔍</div>  
                <p>No users found</p>  
            </div>  
        `;  
        return;  
    }  

    try {  
        // Check friends  
        const { data: friends, error: friendError } = await supabase  
            .from('friends')  
            .select('friend_id')  
            .eq('user_id', currentUser.id);  

        const friendIds = friendError ? [] : friends?.map(f => f.friend_id) || [];  

        // Check pending requests  
        const { data: pendingRequests, error: requestError } = await supabase  
            .from('friend_requests')  
            .select('receiver_id')  
            .eq('sender_id', currentUser.id)  
            .eq('status', 'pending');  

        const pendingIds = requestError ? [] : pendingRequests?.map(r => r.receiver_id) || [];  

        let html = '';  
        users.forEach(user => {  
            const isFriend = friendIds.includes(user.id);  
            const requestSent = pendingIds.includes(user.id);  
            const firstLetter = user.username.charAt(0).toUpperCase();  

            html += `  
                <div class="search-result">  
                    <div class="search-avatar" style="background: linear-gradient(45deg, #667eea, #764ba2);">  
                        ${firstLetter}  
                    </div>  
                    <div class="search-info">  
                        <div class="search-name">${user.username}</div>  
                        <div class="search-username">${user.full_name || ''}</div>  
                    </div>  
                    ${isFriend ? `  
                        <button class="send-request-btn sent" disabled>  
                            ✓ Friend  
                        </button>  
                    ` : requestSent ? `  
                        <button class="send-request-btn sent" disabled>  
                            ✓ Sent  
                        </button>  
                    ` : `  
                        <button class="send-request-btn" onclick="window.sendFriendRequest('${user.id}', '${user.username}')">  
                            Add Friend  
                        </button>  
                    `}  
                </div>  
            `;  
        });  

        container.innerHTML = html;  

    } catch (error) {  
        console.error("Error displaying results:", error);  
    }
}

// Send friend request
async function sendFriendRequest(toUserId, toUsername) {
    if (!currentUser) return;

    // Show loading state
    const sendBtn = event?.target;
    if (sendBtn) {
        const originalText = sendBtn.textContent;
        sendBtn.textContent = 'Sending...';
        sendBtn.disabled = true;
    }

    try {  
        // Check if request already exists  
const { data: existingRequest, error: checkError } = await supabase  
            .from('friend_requests')  
            .select('id')  
            .eq('sender_id', currentUser.id)  
            .eq('receiver_id', toUserId)  
            .eq('status', 'pending')  
            .maybeSingle();  

        if (existingRequest) {  
            showInfo("Request Already Sent", `You've already sent a friend request to ${toUsername}`);
            
            // Reset button
            if (sendBtn) {
                sendBtn.textContent = '✓ Sent';
                setTimeout(() => {
                    sendBtn.disabled = false;
                }, 1000);
            }
            return;  
        }  

        // Create friend request  
        const { error } = await supabase  
            .from('friend_requests')  
            .insert({  
                sender_id: currentUser.id,  
                receiver_id: toUserId,  
                status: 'pending',  
                created_at: new Date().toISOString()  
            });  

        if (error) {  
            console.error("Error sending request:", error);  
            showError("Request Failed", "Could not send friend request");
            
            // Reset button
            if (sendBtn) {
                sendBtn.textContent = 'Add Friend';
                sendBtn.disabled = false;
            }
            return;  
        }  

        // Update UI  
        loadSearchResults();  
        updateNotificationsBadge();  

        // Show success toast
        showFriendRequest("Friend Request Sent", `Your request has been sent to ${toUsername}!`);
        
        // Update button
        if (sendBtn) {
            sendBtn.textContent = '✓ Sent';
            sendBtn.disabled = true;
            sendBtn.classList.add('sent');
        }

    } catch (error) {  
        console.error("Error sending friend request:", error);  
        showError("Request Failed", "Please check your connection and try again");
        
        // Reset button
        if (sendBtn) {
            sendBtn.textContent = 'Add Friend';
            sendBtn.disabled = false;
        }
    }
}

// Load notifications
async function loadNotifications() {
    const container = document.getElementById('notificationsList');

    if (!container) {  
        console.error("Notifications container not found!");  
        return;  
    }  

    try {  
        // Get notifications  
        const { data: notifications, error } = await supabase  
            .from('friend_requests')  
            .select('id, sender_id, created_at')  
            .eq('receiver_id', currentUser.id)  
            .eq('status', 'pending')  
            .order('created_at', { ascending: false });  

        if (error) {  
            console.log("Notifications error:", error.message);  
            showEmptyNotifications(container);  
            return;  
        }  

        if (!notifications || notifications.length === 0) {  
            showEmptyNotifications(container);  
            return;  
        }  

        // Get usernames for each sender  
        const senderIds = notifications.map(n => n.sender_id);  
        const { data: profiles, error: profilesError } = await supabase  
            .from('profiles')  
            .select('id, username')  
            .in('id', senderIds);  

        const profileMap = {};  
        if (!profilesError && profiles) {  
            profiles.forEach(p => profileMap[p.id] = p.username);  
        }  

        let html = '';  
        notifications.forEach(notification => {  
            const timeAgo = getTimeAgo(notification.created_at);  
            const senderName = profileMap[notification.sender_id] || 'Unknown User';  
            const firstLetter = senderName.charAt(0).toUpperCase();  
            html += `  
                <div class="notification-item">  
                    <div class="notification-avatar" style="background: linear-gradient(45deg, #667eea, #764ba2);">  
                        ${firstLetter}  
                    </div>  
                    <div class="notification-content">  
                        <strong>${senderName}</strong> wants to be friends  
                        <small>${timeAgo}</small>  
                    </div>  
                    <div class="notification-actions">  
                        <button class="btn-small btn-success" onclick="window.acceptFriendRequest('${notification.id}', '${notification.sender_id}', '${senderName}', this)">  
                            ✓  
                        </button>  
                        <button class="btn-small btn-danger" onclick="window.declineFriendRequest('${notification.id}', this)">  
                            ✗  
                        </button>  
                    </div>  
                </div>  
            `;  
        });  

        container.innerHTML = html;  

    } catch (error) {  
        console.error("Error loading notifications:", error);  
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

// Accept friend request
async function acceptFriendRequest(requestId, senderId, senderName = 'User', button = null) {
    console.log("Accepting request:", requestId, "from:", senderId);

    // Show loading state on button
    if (button) {
        const originalText = button.textContent;
        button.textContent = '...';
        button.disabled = true;
    }

    try {  
        // 1. Update friend request status  
        const { error: updateError } = await supabase  
            .from('friend_requests')  
            .update({ status: 'accepted' })  
            .eq('id', requestId);  

        if (updateError) throw updateError;  

        // 2. Add to friends table (both directions)  
        const { error: friendError1 } = await supabase  
            .from('friends')  
            .insert({   
                user_id: currentUser.id,   
                friend_id: senderId,  
                created_at: new Date().toISOString()  
            });  

        const { error: friendError2 } = await supabase  
            .from('friends')  
            .insert({   
                user_id: senderId,   
                friend_id: currentUser.id,  
                created_at: new Date().toISOString()  
            });  

        if (friendError1 || friendError2) {  
            console.log("Friend errors (might already exist):", friendError1?.message, friendError2?.message);  
            // Continue anyway - might already exist  
        }  

        // 3. Update UI  
        await loadNotifications();  
        await loadFriends();  
        await updateNotificationsBadge();  

        // Show success toast
        showFriendAdded("New Friend!", `You are now connected with ${senderName}! 🎉`);

        // Update button
        if (button) {
            button.textContent = '✓ Accepted';
            button.style.background = 'rgba(40, 167, 69, 0.3)';
        }

    } catch (error) {  
        console.error("Error accepting friend request:", error);  
        showError("Connection Failed", "Could not accept friend request");
        
        // Reset button
        if (button) {
            button.textContent = '✓';
            button.disabled = false;
        }
    }
}

// Decline friend request
async function declineFriendRequest(requestId, button = null) {
    // Show loading state on button
    if (button) {
        const originalText = button.textContent;
        button.textContent = '...';
        button.disabled = true;
    }

    try {
        const { error } = await supabase
            .from('friend_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);

        if (error) throw error;  

        await loadNotifications();  
        await updateNotificationsBadge();  

        // Show info toast
        showInfo("Request Declined", "Friend request has been declined");

        // Update button
        if (button) {
            button.textContent = '✗ Declined';
            button.style.background = 'rgba(220, 53, 69, 0.3)';
        }

    } catch (error) {  
        console.error("Error declining friend request:", error);  
        showError("Action Failed", "Could not decline friend request");
        
        // Reset button
        if (button) {
            button.textContent = '✗';
            button.disabled = false;
        }
    }
}

// Set up event listeners
function setupEventListeners() {
    console.log("Setting up event listeners...");

    // Logout button (if exists)  
    const logoutBtn = document.getElementById('logoutBtn');  
    if (logoutBtn) {  
        logoutBtn.addEventListener('click', async () => {  
            try {  
                // Show loading toast
                const loadingToast = showInfo("Logging Out", "Please wait...");
                
                await auth.signOut();  
                
                // Remove loading toast
                if (loadingToast && loadingToast.parentNode) {
                    loadingToast.remove();
                }
                
                // Show success toast
                showSuccess("Logged Out", "See you soon! 👋");
                
                setTimeout(() => {
                    window.location.href = '../auth/index.html';  
                }, 1000);
                
            } catch (error) {  
                console.error("Error logging out:", error);  
                showError("Logout Failed", "Please try again");
            }  
        });  
    }  

    console.log("✅ Event listeners setup complete");
}

// Navigation functions
function goToHome() {
    console.log("Already on home page");
}

function openSettings() {
    showInfo("Coming Soon", "Settings page is under development! Stay tuned ✨");
}

// Function to navigate to Friends page
function viewFriendsPage() {
    // Check if we're already on the friends page
    const currentPath = window.location.pathname;
    if (currentPath.includes('friends')) {
        return; // Already on friends page
    }
    
    // Navigate to friends page
    window.location.href = 'friends/index.html';
}

// Make functions available globally
window.openSearch = openSearch;
window.openNotifications = openNotifications;
window.closeModal = closeModal;
window.openChat = openChat;
window.sendFriendRequest = sendFriendRequest;
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;
window.goToHome = goToHome;
window.openSettings = openSettings;
window.viewFriendsPage = viewFriendsPage;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initHomePage);
        