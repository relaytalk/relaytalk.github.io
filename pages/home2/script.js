// ===== RELAYTALK HOME PAGE - MIDNIGHT AURORA =====
// Using global variables from your existing auth.js and supabase.js

// Wait a moment for scripts to load
setTimeout(() => {
    // Get auth and supabase from global window object
    const auth = window.auth;
    const supabase = window.supabase;
    
    if (!auth) {
        console.error("❌ Auth not found!");
        alert("Auth not loaded. Please refresh.");
        location.reload();
        return;
    }
    
    if (!supabase) {
        console.error("❌ Supabase not found!");
        alert("Supabase not loaded. Please refresh.");
        location.reload();
        return;
    }
    
    console.log("✅ Auth loaded:", typeof auth);
    console.log("✅ Supabase loaded:", typeof supabase);
    
    // Now initialize everything
    initApp(auth, supabase);
}, 1000);

// Main initialization function (receives auth and supabase as parameters)
function initApp(auth, supabase) {
    // Global variables
    let currentUser = null;
    let currentProfile = null;
    let realtimeSubscription = null;
    let heartbeatInterval = null;

    // DOM Elements
    const loadingScreen = document.getElementById('loadingIndicator');
    const appContainer = document.getElementById('appContainer');
    const chatsList = document.getElementById('chatsList');
    const emptyState = document.getElementById('emptyState');
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');
    const notificationBadge = document.getElementById('notificationBadge');
    const navNotificationBadge = document.getElementById('navNotificationBadge');
    const newChatFab = document.getElementById('newChatFab');
    const newChatModal = document.getElementById('newChatModal');
    const welcomeTitle = document.getElementById('welcomeTitle');

    // Initialize when page loads
    document.addEventListener('DOMContentLoaded', () => {
        initHomePage(auth, supabase);
    });

    async function initHomePage(auth, supabase) {
        console.log("✨ RelayTalk Home Page Initializing...");

        try {
            // Hide app, show loading
            appContainer.style.display = 'none';

            // Check if user is logged in using your existing auth system
            const { success, user } = await auth.getCurrentUser();  

            if (!success || !user) {  
                alert("Please login first!");  
                window.location.href = '../auth/index.html';  
                return;  
            }  

            currentUser = user;  
            console.log("✅ User authenticated:", currentUser.email);  

            // Get user profile
            await loadUserProfile();  

            // Update UI  
            updateWelcomeMessage();  
            await loadFriends();  
            await updateNotificationsBadge();  

            // Setup real-time updates
            setupRealtimeUpdates();

            // Setup heartbeat
            startHeartbeat();

            // Set up event listeners  
            setupEventListeners();  

            console.log("✅ Home page initialized for:", currentProfile?.username);

            // Hide loading indicator
            setTimeout(() => {
                if (loadingScreen) {
                    loadingScreen.style.opacity = '0';
                    setTimeout(() => {
                        loadingScreen.style.display = 'none';
                        appContainer.style.display = 'block';
                    }, 300);
                }
            }, 500);

        } catch (error) {
            console.error("❌ Initialization error:", error);
            showError("Failed to load app. Please refresh.");
        }
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
            console.log("✅ Profile loaded:", profile.username);  

        } catch (error) {  
            console.error("❌ Error loading profile:", error);  
            currentProfile = {  
                username: currentUser.user_metadata?.username || 'User',  
                full_name: currentUser.user_metadata?.full_name || 'User',  
                avatar_url: currentUser.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=User&background=random`  
            };  
        }
    }

    // Update welcome message
    function updateWelcomeMessage() {
        if (!currentProfile || !welcomeTitle) return;
        welcomeTitle.textContent = `Welcome, ${currentProfile.username}!`;  
    }

    // Load friends (chats)
    async function loadFriends() {
        if (!currentUser) return;

        console.log("Loading friends for user:", currentUser.id);  

        if (!chatsList) {  
            console.error("Chats list container not found!");  
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
                showEmptyFriends();  
                return;  
            }  

            console.log("Found friend IDs:", friends?.length || 0);  

            if (!friends || friends.length === 0) {  
                showEmptyFriends();  
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
                showEmptyFriends();  
                return;  
            }  

            let html = '';  
            profiles.forEach(profile => {  
                const isOnline = profile.status === 'online';  
                const lastSeen = profile.last_seen ? new Date(profile.last_seen) : new Date();  
                const timeAgo = getTimeAgo(lastSeen);  
                const firstLetter = profile.username ? profile.username.charAt(0).toUpperCase() : '?';  
                const avatarColor = generateColorFromName(profile.username);

                html += `  
                    <div class="chat-item" onclick="openChat('${profile.id}', '${profile.username}')">  
                        <div class="chat-avatar">  
                            <div class="avatar-img" style="background: linear-gradient(135deg, ${avatarColor}, ${adjustColor(avatarColor, -20)})">  
                                ${firstLetter}  
                            </div>  
                            <div class="online-status ${isOnline ? '' : 'offline'}"></div>  
                        </div>  
                        <div class="chat-content">  
                            <div class="chat-header">  
                                <div class="chat-name">${profile.username || 'Unknown User'}</div>  
                                <div class="chat-time">${isOnline ? 'Online' : timeAgo}</div>  
                            </div>  
                            <div class="chat-preview">  
                                <div class="chat-message">  
                                    ${isOnline ? 'Available to chat' : 'Last seen ' + timeAgo}  
                                </div>  
                            </div>  
                        </div>  
                    </div>  
                `;  
            });  

            chatsList.innerHTML = html;  
            if (emptyState) emptyState.style.display = 'none';

        } catch (error) {  
            console.error("Error loading friends:", error);  
            showEmptyFriends();  
        }
    }

    function showEmptyFriends() {
        if (emptyState) emptyState.style.display = 'block';
        if (chatsList) chatsList.innerHTML = '';
    }

    // Setup real-time updates
    function setupRealtimeUpdates() {
        if (realtimeSubscription) {
            supabase.removeChannel(realtimeSubscription);
        }

        // Subscribe to profile status changes
        realtimeSubscription = supabase
            .channel('profile-status')
            .on('postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles'
                },
                (payload) => {
                    console.log('Profile status updated:', payload);
                    loadFriends();
                }
            )
            .subscribe();
    }

    // Start heartbeat for online status
    function startHeartbeat() {
        // Send initial heartbeat
        sendHeartbeat();

        // Set up interval for heartbeat (every 30 seconds)
        heartbeatInterval = setInterval(sendHeartbeat, 30000);

        // Send heartbeat on visibility change
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                sendHeartbeat();
            }
        });
    }

    // Send heartbeat to update online status
    async function sendHeartbeat() {
        try {
            await supabase
                .from('profiles')
                .update({ 
                    status: 'online',
                    last_seen: new Date().toISOString()
                })
                .eq('id', currentUser.id);
        } catch (error) {
            console.error('Heartbeat error:', error);
        }
    }

    // Update notifications badge
    async function updateNotificationsBadge() {
        try {
            const { count, error } = await supabase
                .from('friend_requests')
                .select('*', { count: 'exact', head: true })
                .eq('receiver_id', currentUser.id)
                .eq('status', 'pending');

            if (error) throw error;

            const unreadCount = count || 0;

            // Update both badges
            [notificationBadge, navNotificationBadge].forEach(badge => {
                if (badge) {
                    if (unreadCount > 0) {
                        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                        badge.style.display = 'flex';
                    } else {
                        badge.style.display = 'none';
                    }
                }
            });

        } catch (error) {
            console.error('Error updating notifications badge:', error);
        }
    }

    // Setup event listeners
    function setupEventListeners() {
        console.log("Setting up event listeners...");

        // Search button
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                window.location.href = 'subpages/search.html';
            });
        }

        // Notifications button
        const notificationsBtn = document.getElementById('notificationsBtn');
        if (notificationsBtn) {
            notificationsBtn.addEventListener('click', () => {
                window.location.href = 'subpages/notifications.html';
            });
        }

        // New chat FAB
        if (newChatFab) {
            newChatFab.addEventListener('click', openNewChatModal);
        }

        // Search input in modal
        const friendSearch = document.getElementById('friendSearch');
        if (friendSearch) {
            friendSearch.addEventListener('input', async (e) => {
                await loadFriendsForModal(e.target.value);
            });
        }
    }

    // Open new chat modal
    async function openNewChatModal() {
        try {
            await loadFriendsForModal();
            if (newChatModal) newChatModal.style.display = 'flex';
        } catch (error) {
            console.error('Error opening new chat modal:', error);
        }
    }

    // Load friends for new chat modal
    async function loadFriendsForModal(searchTerm = '') {
        if (!currentUser) return;

        const container = document.getElementById('friendsListModal');
        if (!container) return;

        try {
            // Get friend IDs
            const { data: friends, error } = await supabase
                .from('friends')
                .select('friend_id')
                .eq('user_id', currentUser.id);

            if (error) throw error;

            if (!friends || friends.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <p>No friends yet</p>
                        <button class="btn-secondary" onclick="window.location.href='subpages/search.html'">
                            Find Friends
                        </button>
                    </div>
                `;
                return;
            }

            const friendIds = friends.map(f => f.friend_id);

            // Get profiles
            let query = supabase
                .from('profiles')
                .select('id, username, avatar_color')
                .in('id', friendIds);

            if (searchTerm) {
                query = query.ilike('username', `%${searchTerm}%`);
            }

            const { data: profiles, error: profilesError } = await query;

            if (profilesError) throw profilesError;

            if (!profiles || profiles.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <p>No friends found</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = profiles.map(profile => {
                const initial = profile.username.charAt(0).toUpperCase();
                const avatarColor = profile.avatar_color || generateColorFromName(profile.username);

                return `
                    <div class="friend-item" onclick="openChat('${profile.id}', '${profile.username}')">
                        <div class="friend-avatar" style="background: linear-gradient(135deg, ${avatarColor}, ${adjustColor(avatarColor, -20)})">
                            ${initial}
                        </div>
                        <div class="friend-name">${profile.username}</div>
                        <i class="fas fa-chevron-right"></i>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('Error loading friends for modal:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <p>Error loading friends</p>
                </div>
            `;
        }
    }

    // Open chat
    function openChat(friendId, friendUsername = 'Friend') {
        console.log("Opening chat with:", friendId, friendUsername);

        // Store friend info in session storage for chat page  
        sessionStorage.setItem('currentChatFriend', JSON.stringify({  
            id: friendId,  
            username: friendUsername  
        }));  

        // Redirect to chat page  
        window.location.href = `../chats/index.html?friendId=${friendId}`;
    }

    // Close modal
    function closeModal() {
        if (newChatModal) newChatModal.style.display = 'none';
    }

    // Refresh chats
    function refreshChats() {
        loadFriends();
        showRefreshFeedback();
    }

    // Show refresh feedback
    function showRefreshFeedback() {
        const feedback = document.createElement('div');
        feedback.className = 'refresh-feedback';
        feedback.innerHTML = '<i class="fas fa-check-circle"></i> Refreshed!';
        feedback.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #00d4ff, #8a2be2);
            color: white;
            padding: 12px 24px;
            border-radius: 25px;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 1000;
            animation: slideDown 0.3s ease, slideUp 0.3s ease 1.5s;
            font-weight: 600;
            box-shadow: 0 10px 30px rgba(0, 212, 255, 0.3);
        `;

        document.body.appendChild(feedback);

        setTimeout(() => {
            feedback.remove();
        }, 1800);
    }

    // Show error
    function showError(message) {
        if (loadingScreen) {
            loadingScreen.innerHTML = `
                <div class="loading-content">
                    <div class="logo-circle" style="background: linear-gradient(135deg, #ff6b8b, #ff2e63)">
                        <i class="fas fa-exclamation"></i>
                    </div>
                    <h1 class="app-title">Oops!</h1>
                    <p class="loading-text">${message}</p>
                    <button class="btn-primary" onclick="location.reload()" style="margin-top: 20px;">
                        <i class="fas fa-redo"></i>
                        Try Again
                    </button>
                </div>
            `;
        }
    }

    // Helper functions from your original code
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

    function generateColorFromName(name) {
        const colors = [
            '#00d4ff', '#8a2be2', '#ff00ff', '#00ffaa', '#ffaa00',
            '#ff6b8b', '#6b8bff', '#8bff6b', '#ff8b6b', '#6bff8b'
        ];
        if (!name) return colors[0];
        const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
    }

    function adjustColor(color, amount) {
        let usePound = false;
        if (color[0] === "#") {
            color = color.slice(1);
            usePound = true;
        }
        const num = parseInt(color, 16);
        let r = (num >> 16) + amount;
        if (r > 255) r = 255;
        else if (r < 0) r = 0;
        let b = ((num >> 8) & 0x00FF) + amount;
        if (b > 255) b = 255;
        else if (b < 0) b = 0;
        let g = (num & 0x0000FF) + amount;
        if (g > 255) g = 255;
        else if (g < 0) g = 0;
        return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
    }

    // Add CSS for refresh feedback animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from { top: -50px; opacity: 0; }
            to { top: 20px; opacity: 1; }
        }
        @keyframes slideUp {
            from { top: 20px; opacity: 1; }
            to { top: -50px; opacity: 0; }
        }
        .friend-item {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 15px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 15px;
            margin-bottom: 10px;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        .friend-item:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateX(5px);
        }
        .friend-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            color: white;
            flex-shrink: 0;
        }
        .friend-name {
            flex: 1;
            font-weight: 500;
        }
    `;
    document.head.appendChild(style);

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (realtimeSubscription) {
            supabase.removeChannel(realtimeSubscription);
        }
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }
    });

    // Make functions available globally
    window.openChat = openChat;
    window.closeModal = closeModal;
    window.openNewChatModal = openNewChatModal;
    window.refreshChats = refreshChats;
}