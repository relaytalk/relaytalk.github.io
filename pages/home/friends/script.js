// Friends Page Script
import { auth } from '../../../utils/auth.js'
import { supabase } from '../../../utils/supabase.js'

console.log("✨ Friends Page Loaded");

// Current user
let currentUser = null;
let currentProfile = null;

// Toast Notification System (same as home page)
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

    info(title, message = '', duration = 4000) {
        return this.show({ 
            title, 
            message, 
            type: 'info', 
            duration, 
            icon: '💬' 
        });
    }
}

// Initialize toast system
const toast = new ToastNotification();
window.showSuccess = toast.success.bind(toast);
window.showError = toast.error.bind(toast);
window.showInfo = toast.info.bind(toast);

// Initialize friends page
async function initFriendsPage() {
    console.log("Initializing friends page...");

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
    console.log("User logged in:", currentUser.email);  

    // Get user profile  
    await loadUserProfile();  

    // Load friends and update stats
    await loadFriendsList();
    await updateFriendsStats();
    
    // Set up search functionality
    setupSearch();
    
    // Set up event listeners
    setupEventListeners();

    // Hide loading indicator
    setTimeout(() => {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.classList.add('hidden');
            setTimeout(() => {
                loadingIndicator.style.display = 'none';
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
            username: currentUser.user_metadata?.username || 'User'
        };  
    }
}

// Load friends list
async function loadFriendsList(searchTerm = '') {
    if (!currentUser) return;

    console.log("Loading friends list...");  

    const container = document.getElementById('friendsContainer');  
    if (!container) {  
        console.error("Friends container not found!");  
        return;  
    }  

    try {  
        // Get friend IDs  
        const { data: friends, error } = await supabase  
            .from('friends')  
            .select('friend_id, created_at')  
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) {  
            console.log("Error loading friends:", error.message);  
            showEmptyFriends(container);  
            return;  
        }  

        console.log("Found friends:", friends?.length || 0);  

        if (!friends || friends.length === 0) {  
            showEmptyFriends(container);  
            return;  
        }  

        // Get profiles for each friend  
        const friendIds = friends.map(f => f.friend_id);  
        const { data: profiles, error: profilesError } = await supabase  
            .from('profiles')  
            .select('id, username, full_name, status, last_seen')  
            .in('id', friendIds);  

        if (profilesError) {  
            console.error("Error loading profiles:", profilesError);  
            showEmptyFriends(container);  
            return;  
        }  

        // Filter by search term if provided
        let filteredProfiles = profiles;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredProfiles = profiles.filter(profile => 
                profile.username.toLowerCase().includes(term) ||
                (profile.full_name && profile.full_name.toLowerCase().includes(term))
            );
        }

        // Sort: online first, then by name
        filteredProfiles.sort((a, b) => {
            if (a.status === 'online' && b.status !== 'online') return -1;
            if (a.status !== 'online' && b.status === 'online') return 1;
            return a.username.localeCompare(b.username);
        });

        // Calculate online count
        const onlineCount = filteredProfiles.filter(p => p.status === 'online').length;
        
        // Update stats
        document.getElementById('totalFriends').textContent = filteredProfiles.length;
        document.getElementById('onlineFriends').textContent = onlineCount;

        if (filteredProfiles.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <h3 class="empty-title">No Friends Found</h3>
                    <p class="empty-desc">Try a different search term</p>
                </div>
            `;
            return;
        }

        let html = '';  
        filteredProfiles.forEach(profile => {  
            const isOnline = profile.status === 'online';  
            const lastSeen = profile.last_seen ? new Date(profile.last_seen) : new Date();  
            const timeAgo = getTimeAgo(lastSeen);  
            const firstLetter = profile.username ? profile.username.charAt(0).toUpperCase() : '?';  
            const fullName = profile.full_name || '';

            html += `  
                <div class="friend-card-friends-page" onclick="openChat('${profile.id}', '${profile.username}')">  
                    <div class="friend-avatar-large" style="background: linear-gradient(45deg, #667eea, #764ba2);">  
                        ${firstLetter}  
                        <span class="status-indicator-large ${isOnline ? 'status-online' : 'status-offline'}"></span>
                    </div>  
                    <div class="friend-details-friends-page">  
                        <div class="friend-name-large">${profile.username}</div>  
                        <div class="friend-username-large">${fullName}</div>  
                        <div class="friend-status-friends-page">  
                            <span class="status-dot ${isOnline ? 'status-online' : 'status-offline'}"></span>  
                            ${isOnline ? 'Online now' : 'Last seen ' + timeAgo}  
                        </div>  
                        <div class="friend-actions-friends-page">  
                            <button class="action-btn-friends-page primary" onclick="event.stopPropagation(); openChat('${profile.id}', '${profile.username}')">  
                                <i class="fas fa-comment"></i> Message  
                            </button>  
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
            <h3 class="empty-title">No Friends Yet</h3>  
            <p class="empty-desc">Start building your friend list by searching for people</p>  
            <button class="search-btn" onclick="openSearch()" style="margin-top: 20px;">  
                <i class="fas fa-search"></i> Find Friends  
            </button>  
        </div>  
    `;
}

// Update friends stats
async function updateFriendsStats() {
    if (!currentUser) return;

    try {
        // Get total friends count
        const { count: totalCount, error: totalError } = await supabase
            .from('friends')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);

        if (totalError) throw totalError;

        // Get online friends count
        const { data: friends, error: friendsError } = await supabase
            .from('friends')
            .select('friend_id')
            .eq('user_id', currentUser.id);

        if (friendsError) throw friendsError;

        if (friends && friends.length > 0) {
            const friendIds = friends.map(f => f.friend_id);
            const { count: onlineCount, error: onlineError } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .in('id', friendIds)
                .eq('status', 'online');

            if (!onlineError) {
                document.getElementById('onlineFriends').textContent = onlineCount || 0;
            }
        }

        document.getElementById('totalFriends').textContent = totalCount || 0;

    } catch (error) {
        console.error("Error updating stats:", error);
    }
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
    showInfo("Opening Chat", `Connecting with ${friendUsername}...`);

    // Store friend info in session storage for chat page  
    sessionStorage.setItem('currentChatFriend', JSON.stringify({  
        id: friendId,  
        username: friendUsername  
    }));  

    // Redirect to chat page  
    setTimeout(() => {
        window.location.href = `../chats/index.html?friendId=${friendId}`;
    }, 500);
}

// Setup search functionality
function setupSearch() {
    const searchInput = document.getElementById('searchFriendsInput');
    if (searchInput) {
        let searchTimeout;
        
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            const searchTerm = this.value.trim();
            
            searchTimeout = setTimeout(() => {
                loadFriendsList(searchTerm);
            }, 300);
        });
    }
}

// Set up event listeners
function setupEventListeners() {
    console.log("Setting up event listeners...");

    // Nothing specific needed for now
}

// Navigation functions
function goToHome() {
    window.location.href = '../index.html';
}

function goToFriends() {
    // Already on friends page
    console.log("Already on friends page");
}

function openSearch() {
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
    const searchModal = document.getElementById('searchModal');
    const notificationsModal = document.getElementById('notificationsModal');

    if (searchModal) searchModal.style.display = 'none';  
    if (notificationsModal) notificationsModal.style.display = 'none';
}

// Load search results (for adding new friends)
async function loadSearchResults() {
    const container = document.getElementById('searchResults');
    const searchInput = document.getElementById('searchInput');

    if (!container || !currentUser) {  
        console.error("Search elements not found!");  
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
            </div>  
        `;  
        showError("Connection Error", "Unable to load users list");
    }
}

// Display search results
async function displaySearchResults(users) {
    const container = document.getElementById('searchResults');

    if (!container) return;  

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
                    <div class="search-user-info">
                        <div class="search-avatar" style="background: linear-gradient(45deg, #667eea, #764ba2);">  
                            ${firstLetter}  
                        </div>  
                        <div class="search-user-details">  
                            <div class="search-name">${user.username}</div>  
                            <div class="search-username">${user.full_name || ''}</div>  
                        </div>  
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
                        <button class="send-request-btn" onclick="sendFriendRequest('${user.id}', '${user.username}', this)">  
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
async function sendFriendRequest(toUserId, toUsername, button) {
    if (!currentUser) return;

    // Show loading state
    const originalText = button.textContent;
    button.textContent = 'Sending...';
    button.disabled = true;

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
            showInfo("Request Already Sent", `Already sent to ${toUsername}`);
            
            // Reset button
            button.textContent = '✓ Sent';
            button.disabled = true;
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
            showError("Request Failed", "Could not send");
            
            // Reset button
            button.textContent = originalText;
            button.disabled = false;
            return;  
        }  

        // Update UI  
        showSuccess("Request Sent", `Sent to ${toUsername}!`);
        
        // Update button
        button.textContent = '✓ Sent';
        button.disabled = true;
        button.classList.add('sent');

        // Reload friends list to show new friend if accepted elsewhere
        setTimeout(() => {
            loadFriendsList();
            updateFriendsStats();
        }, 1000);

    } catch (error) {  
        console.error("Error sending friend request:", error);  
        showError("Request Failed", "Please try again");
        
        // Reset button
        button.textContent = originalText;
        button.disabled = false;
    }
}

// Load notifications
async function loadNotifications() {
    const container = document.getElementById('notificationsList');

    if (!container || !currentUser) {  
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
            container.innerHTML = `  
                <div class="empty-state">  
                    <div class="empty-icon">🔔</div>  
                    <p>No notifications</p>  
                </div>  
            `;  
            return;  
        }  

        if (!notifications || notifications.length === 0) {  
            container.innerHTML = `  
                <div class="empty-state">  
                    <div class="empty-icon">🔔</div>  
                    <p>No notifications yet</p>  
                </div>  
            `;  
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
                        <div class="notification-text">
                            <div class="notification-title">${senderName} wants to be friends</div>  
                            <div class="notification-time">${timeAgo}</div>  
                        </div>
                        <div class="notification-actions">  
                            <button class="accept-btn" onclick="acceptFriendRequest('${notification.id}', '${notification.sender_id}', '${senderName}', this)">  
                                Accept  
                            </button>  
                            <button class="decline-btn" onclick="declineFriendRequest('${notification.id}', this)">  
                                Decline  
                            </button>  
                        </div>  
                    </div>  
                </div>  
            `;  
        });  

        container.innerHTML = html;  

    } catch (error) {  
        console.error("Error loading notifications:", error);  
        container.innerHTML = `  
            <div class="empty-state">  
                <div class="empty-icon">⚠️</div>  
                <p>Error loading notifications</p>  
            </div>  
        `;  
    }
}

// Accept friend request
async function acceptFriendRequest(requestId, senderId, senderName = 'User', button) {
    console.log("Accepting request:", requestId);

    // Show loading state
    const originalText = button.textContent;
    button.textContent = 'Accepting...';
    button.disabled = true;

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
        }  

        // 3. Show success  
        showSuccess("New Friend!", `You are now friends with ${senderName}! 🎉`);

        // 4. Update UI  
        button.textContent = '✓ Accepted';
        button.style.background = 'rgba(40, 167, 69, 0.3)';
        
        // Reload friends list
        setTimeout(() => {
            loadFriendsList();
            updateFriendsStats();
            loadNotifications();
        }, 1000);

    } catch (error) {  
        console.error("Error accepting friend request:", error);  
        showError("Failed", "Could not accept request");
        
        // Reset button
        button.textContent = originalText;
        button.disabled = false;
    }
}

// Decline friend request
async function declineFriendRequest(requestId, button) {
    // Show loading state
    const originalText = button.textContent;
    button.textContent = 'Declining...';
    button.disabled = true;

    try {
        const { error } = await supabase
            .from('friend_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);

        if (error) throw error;  

        // Show info
        showInfo("Request Declined", "Friend request declined");

        // Update button
        button.textContent = '✗ Declined';
        button.style.background = 'rgba(220, 53, 69, 0.3)';
        
        // Reload notifications
        setTimeout(() => {
            loadNotifications();
        }, 500);

    } catch (error) {  
        console.error("Error declining friend request:", error);  
        showError("Failed", "Could not decline");
        
        // Reset button
        button.textContent = originalText;
        button.disabled = false;
    }
}

// Make functions available globally
window.goToHome = goToHome;
window.goToFriends = goToFriends;
window.openSearch = openSearch;
window.openNotifications = openNotifications;
window.closeModal = closeModal;
window.openChat = openChat;
window.sendFriendRequest = sendFriendRequest;
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initFriendsPage);