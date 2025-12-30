// Home Page Script - Clean Version
console.log("✨ Luster Home Page Loaded");

// Current user
let currentUser = null;

// Initialize home page
function initHomePage() {
    console.log("Initializing home page...");
    
    // Check if user is logged in
    currentUser = JSON.parse(localStorage.getItem('luster_user'));
    
    if (!currentUser) {
        // No user found, redirect to auth
        alert("Please create an account first!");
        window.location.href = '../auth/index.html';
        return;
    }
    
    // Update UI with user data
    updateWelcomeMessage();
    loadFriends();
    updateNotificationsBadge();
    
    // Set up event listeners
    setupEventListeners();
    
    console.log("Home page initialized for:", currentUser.username);
}

// Update welcome message
function updateWelcomeMessage() {
    if (!currentUser) return;
    
    // Update welcome title
    document.getElementById('welcomeTitle').textContent = `Welcome, ${currentUser.username}!`;
}

// Load friends list
// Load friends list
function loadFriends() {
    if (!currentUser) return;
    
    console.log("Loading friends for user:", currentUser.id);
    
    // Get friends from localStorage
    const friends = JSON.parse(localStorage.getItem(`luster_friends_${currentUser.id}`) || '[]');
    const container = document.getElementById('friendsList');
    
    console.log("Found friends:", friends.length);
    
    if (friends.length === 0) {
        // Show empty state
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <p>No friends yet</p>
                <p style="font-size: 0.9rem; margin-top: 10px;">Search for users to add friends</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    friends.forEach(friend => {
        console.log("Processing friend:", friend);
        
        // Random online status (for demo - will be real later)
        const isOnline = Math.random() > 0.3;
        
        // Get first letter for avatar
        const firstLetter = friend.username ? friend.username.charAt(0).toUpperCase() : '?';
        
        // Friend added date
        const addedDate = friend.addedAt ? new Date(friend.addedAt) : new Date();
        const timeAgo = getTimeAgo(friend.addedAt || new Date().toISOString());
        
        html += `
            <div class="friend-card" onclick="openChat('${friend.id}')">
                <div class="friend-avatar" style="background: linear-gradient(45deg, #667eea, #764ba2);">
                    ${firstLetter}
                </div>
                <div class="friend-info">
                    <div class="friend-name">${friend.username || 'Unknown User'}</div>
                    <div class="friend-status">
                        <span class="status-dot ${isOnline ? '' : 'offline'}"></span>
                        ${isOnline ? 'Online' : 'Last seen ' + timeAgo}
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Get time ago string (also add this function)
function getTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
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

// Open chat with friend (update this function too)
function openChat(friendId) {
    console.log("Opening chat with friend:", friendId);
    
    // First check if friend exists
    const friends = JSON.parse(localStorage.getItem(`luster_friends_${currentUser.id}`) || '[]');
    const friend = friends.find(f => f.id === friendId);
    
    if (!friend) {
        alert("Friend not found!");
        return;
    }
    
    // Redirect to chat page with friend ID
    window.location.href = `../chat/index.html?friend=${friendId}`;
}
// Update notifications badge
function updateNotificationsBadge() {
    const notifications = JSON.parse(localStorage.getItem('luster_notifications') || '[]');
    const unreadCount = notifications.filter(n => !n.read && n.type === 'friend_request').length;
    
    const badge = document.getElementById('notificationBadge');
    if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

// Open search modal
function openSearch() {
    document.getElementById('searchModal').style.display = 'flex';
    loadSearchResults();
}

// Open notifications modal
function openNotifications() {
    document.getElementById('notificationsModal').style.display = 'flex';
    loadNotifications();
    
    // Mark all as read when opened
    markAllNotificationsAsRead();
}

// Go to home (refresh)
function goToHome() {
    // Already on home, just reload friends
    loadFriends();
}

// Open settings
function openSettings() {
    alert("Settings:\n\n• Change password\n• Privacy settings\n• Delete account\n\nComing soon!");
}

// Close modal
function closeModal() {
    document.getElementById('searchModal').style.display = 'none';
    document.getElementById('notificationsModal').style.display = 'none';
}

// Load search results
function loadSearchResults() {
    const allUsers = JSON.parse(localStorage.getItem('luster_all_users') || '[]');
    const container = document.getElementById('searchResults');
    const searchInput = document.getElementById('searchInput');
    
    // Filter out current user
    const otherUsers = allUsers.filter(user => user.userId !== currentUser.id);
    
    if (otherUsers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <p>No other users found</p>
            </div>
        `;
        return;
    }
    
    // Display all users initially
    displaySearchResults(otherUsers);
    
    // Add search functionality
    searchInput.oninput = function() {
        const searchTerm = this.value.toLowerCase().trim();
        
        if (searchTerm === '') {
            displaySearchResults(otherUsers);
            return;
        }
        
        const filteredUsers = otherUsers.filter(user => 
            user.username.toLowerCase().includes(searchTerm)
        );
        
        displaySearchResults(filteredUsers);
    };
    
    // Focus on search input
    searchInput.focus();
}

// Display search results
function displaySearchResults(users) {
    const container = document.getElementById('searchResults');
    
    if (users.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔍</div>
                <p>No users found</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    users.forEach(user => {
        // Check if already friends
        const friends = JSON.parse(localStorage.getItem(`luster_friends_${currentUser.id}`) || '[]');
        const isFriend = friends.some(f => f.id === user.userId);
        
        // Check if request already sent
        const notifications = JSON.parse(localStorage.getItem('luster_notifications') || '[]');
        const requestSent = notifications.some(n => 
            n.fromId === currentUser.id && 
            n.to === user.username && 
            n.type === 'friend_request'
        );
        
        html += `
            <div class="search-result">
                <div class="search-avatar">
                    ${user.username.charAt(0).toUpperCase()}
                </div>
                <div class="search-info">
                    <div class="search-name">${user.username}</div>
                    <div class="search-username">${user.profileLink}</div>
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
                    <button class="send-request-btn" onclick="sendFriendRequest('${user.username}')">
                        Add Friend
                    </button>
                `}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Send friend request
function sendFriendRequest(toUsername) {
    if (!currentUser) return;
    
    // Create notification
    const notification = {
        id: 'req_' + Date.now(),
        type: 'friend_request',
        from: currentUser.username,
        fromId: currentUser.id,
        to: toUsername,
        toId: getUserIdByUsername(toUsername),
        message: `${currentUser.username} wants to be your friend`,
        timestamp: new Date().toISOString(),
        read: false,
        status: 'pending'
    };
    
    // Save notification
    let notifications = JSON.parse(localStorage.getItem('luster_notifications') || '[]');
    notifications.push(notification);
    localStorage.setItem('luster_notifications', JSON.stringify(notifications));
    
    // Update UI
    updateNotificationsBadge();
    
    // Refresh search results
    loadSearchResults();
    
    // Show success message
    alert(`Friend request sent to ${toUsername}!`);
}

// Get user ID by username
function getUserIdByUsername(username) {
    const allUsers = JSON.parse(localStorage.getItem('luster_all_users') || '[]');
    const user = allUsers.find(u => u.username === username);
    return user ? user.userId : null;
}

// Load notifications
function loadNotifications() {
    const notifications = JSON.parse(localStorage.getItem('luster_notifications') || '[]');
    const friendRequests = notifications.filter(n => n.type === 'friend_request');
    const container = document.getElementById('notificationsList');
    
    if (friendRequests.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔔</div>
                <p>No notifications yet</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    friendRequests.forEach(notification => {
        const timeAgo = getTimeAgo(notification.timestamp);
        
        html += `
            <div class="search-result">
                <div class="search-avatar">
                    ${notification.from.charAt(0).toUpperCase()}
                </div>
                <div class="search-info">
                    <div class="search-name">${notification.from}</div>
                    <div class="search-username">${notification.message}</div>
                    <div style="color: #a0a0c0; font-size: 0.8rem; margin-top: 5px;">${timeAgo}</div>
                </div>
                ${notification.status === 'pending' ? `
                <div style="display: flex; gap: 8px;">
                    <button class="accept-btn" onclick="acceptFriendRequest('${notification.id}')">
                        Accept
                    </button>
                    <button class="decline-btn" onclick="declineFriendRequest('${notification.id}')">
                        Decline
                    </button>
                </div>
                ` : notification.status === 'accepted' ? `
                <button class="send-request-btn sent" disabled>
                    ✓ Accepted
                </button>
                ` : `
                <button class="decline-btn" disabled>
                    Declined
                </button>
                `}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Accept friend request
function acceptFriendRequest(notificationId) {
    let notifications = JSON.parse(localStorage.getItem('luster_notifications') || '[]');
    const notification = notifications.find(n => n.id === notificationId);
    
    if (!notification) return;
    
    // Update notification status
    notification.status = 'accepted';
    notification.read = true;
    
    // Add to friends list
    const friends = JSON.parse(localStorage.getItem(`luster_friends_${currentUser.id}`) || '[]');
    friends.push({
        id: notification.fromId,
        username: notification.from,
        addedAt: new Date().toISOString()
    });
    localStorage.setItem(`luster_friends_${currentUser.id}`, JSON.stringify(friends));
    
    // Also add current user to the other user's friends list
    const otherUserFriends = JSON.parse(localStorage.getItem(`luster_friends_${notification.fromId}`) || '[]');
    otherUserFriends.push({
        id: currentUser.id,
        username: currentUser.username,
        addedAt: new Date().toISOString()
    });
    localStorage.setItem(`luster_friends_${notification.fromId}`, JSON.stringify(otherUserFriends));
    
    // Save updated notifications
    localStorage.setItem('luster_notifications', JSON.stringify(notifications));
    
    // Update UI
    loadNotifications();
    loadFriends();
    updateNotificationsBadge();
    
    alert(`You are now friends with ${notification.from}!`);
}

// Decline friend request
function declineFriendRequest(notificationId) {
    let notifications = JSON.parse(localStorage.getItem('luster_notifications') || '[]');
    const notification = notifications.find(n => n.id === notificationId);
    
    if (!notification) return;
    
    // Update notification status
    notification.status = 'declined';
    notification.read = true;
    
    // Save updated notifications
    localStorage.setItem('luster_notifications', JSON.stringify(notifications));
    
    // Update UI
    loadNotifications();
    updateNotificationsBadge();
    
    alert(`Friend request from ${notification.from} declined.`);
}

// Mark all notifications as read
function markAllNotificationsAsRead() {
    let notifications = JSON.parse(localStorage.getItem('luster_notifications') || '[]');
    notifications = notifications.map(n => {
        n.read = true;
        return n;
    });
    
    localStorage.setItem('luster_notifications', JSON.stringify(notifications));
    updateNotificationsBadge();
}

// Open chat (placeholder)
// Open chat with friend
function openChat(friendId) {
    window.location.href = `../chat/index.html?friend=${friendId}`;
}

// Get time ago string
function getTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return past.toLocaleDateString();
}

// Set up event listeners
function setupEventListeners() {
    // Close modals when clicking outside
    window.onclick = function(event) {
        const searchModal = document.getElementById('searchModal');
        const notificationsModal = document.getElementById('notificationsModal');
        
        if (event.target === searchModal) {
            closeModal();
        }
        if (event.target === notificationsModal) {
            closeModal();
        }
    };
    
    // Escape key closes modals
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeModal();
        }
    });
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initHomePage);