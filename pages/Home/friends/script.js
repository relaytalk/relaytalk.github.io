// Friends Page Script - WITH ABSOLUTE PATHS AND CALL FUNCTIONALITY
import { auth } from '/app/utils/auth.js'
import { supabase } from '/app/utils/supabase.js'
import presenceTracker from '/app/utils/presence.js';

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

// ==================== VARIABLES ====================
let currentUser = null;
let currentProfile = null;
let allFriends = [];
let callServiceInstance = null;
let callTimerInterval = null;

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

// ==================== INIT FRIENDS PAGE ====================
async function initFriendsPage() {
    console.log("Initializing friends page...");

    const loadingTimeout = setTimeout(() => {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
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

        await presenceTracker.start(currentUser.id);
        await loadFriendsList();
        setupSearch();
        setupIncomingCallListener();

        clearTimeout(loadingTimeout);
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }

        setupFriendPresenceListener();

    } catch (error) {
        console.error("Init error:", error);
        clearTimeout(loadingTimeout);
        toast.error("Error", "Failed to load page");

        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
}

// ==================== PRESENCE TRACKING ====================
let presenceChannel = null;

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
            async (payload) => {
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
        if (avatar && avatar.textContent?.trim()[0]) {
            const friendNameElement = item.querySelector('.friend-name-clean');
            if (friendNameElement) {
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

        if (presence.is_online) {
            return true;
        }

        const lastSeen = new Date(presence.last_seen);
        const now = new Date();
        const minutesAway = (now - lastSeen) / (1000 * 60);

        return minutesAway < 2;

    } catch (error) {
        console.error("Error checking online status:", error);
        return false;
    }
}

// ==================== NAVIGATION ====================
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

// ==================== FRIENDS LIST ====================
async function loadFriendsList(searchTerm = '') {
    if (!currentUser) return;

    const container = document.getElementById('friendsContainer');  
    if (!container) return;  

    try {  
        showLoadingSkeleton(container);

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

        const friendIds = friends.map(f => f.friend_id);  
        const { data: profiles, error: profilesError } = await supabase  
            .from('profiles')  
            .select('id, username, avatar_url')  
            .in('id', friendIds);  

        if (profilesError) throw profilesError;  

        const presencePromises = profiles.map(async (profile) => {
            const isOnline = await checkIfUserIsOnline(profile.id);
            return { ...profile, is_online: isOnline };
        });

        const profilesWithPresence = await Promise.all(presencePromises);
        const unreadCounts = await getUnreadMessageCounts(friendIds);

        allFriends = profilesWithPresence.map(profile => ({
            ...profile,
            unreadCount: unreadCounts[profile.id] || 0
        }));

        let filteredFriends = allFriends;
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredFriends = allFriends.filter(friend => 
                friend.username.toLowerCase().includes(term)
            );
        }

        updateFriendsStats(filteredFriends);

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

    if (totalFriends) {
        totalFriends.textContent = friends.length;
    }

    if (onlineFriends) {
        const onlineCount = friends.filter(f => f.is_online).length;
        onlineFriends.textContent = onlineCount;
    }
}

function displayFriendsCleanStyle(friends, container) {
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

function getTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
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
        const searchTerm = e.target.value.trim();
        loadFriendsList(searchTerm);
    });
}

// ==================== CALL FUNCTIONS ====================
async function startCall(friendId, friendName, event) {
    if (event) event.stopPropagation();
    
    const friend = allFriends.find(f => f.id === friendId);
    if (!friend || !friend.is_online) {
        toast.error("Offline", `${friendName} is currently offline`);
        return;
    }
    
    try {
        showCallScreen(friendName, friendId, 'outgoing');
        
        const { default: callService } = await import('/app/utils/callService.js');
        callServiceInstance = callService;
        
        await callService.initialize(currentUser.id);
        
        callService.setOnCallStateChange((state) => {
            updateCallScreenStatus(state);
        });
        
        callService.setOnRemoteStream((stream) => {
            const audio = document.getElementById('remoteAudio');
            if (audio) {
                audio.srcObject = stream;
            }
        });
        
        callService.setOnCallEvent((event, data) => {
            if (event === 'call_ended') {
                setTimeout(hideCallScreen, 1000);
            }
        });
        
        await callService.initiateCall(friendId, 'voice');
        
    } catch (error) {
        console.error("❌ Call failed:", error);
        toast.error("Call Failed", "Could not connect");
        hideCallScreen();
    }
}

function showCallScreen(friendName, friendId, type = 'outgoing') {
    const existing = document.getElementById('callScreen');
    if (existing) existing.remove();
    
    const firstLetter = friendName.charAt(0).toUpperCase();
    
    const callScreen = document.createElement('div');
    callScreen.id = 'callScreen';
    callScreen.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #0a0a1a 0%, #1a1a2e 100%);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: inherit;
        animation: fadeInCall 0.3s ease;
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInCall {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        @keyframes pulseRing {
            0% { transform: scale(0.8); opacity: 0.8; }
            70% { transform: scale(1.2); opacity: 0; }
            100% { transform: scale(1.2); opacity: 0; }
        }
        
        @keyframes fadeOut {
            from { opacity: 1; }
            to { opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    callScreen.innerHTML = `
        <div style="text-align: center; padding: 30px; width: 100%; max-width: 500px;">
            <!-- Friend Avatar with Ring Animation -->
            <div class="calling-ring" style="
                width: 150px;
                height: 150px;
                border-radius: 50%;
                background: linear-gradient(45deg, #667eea, #764ba2);
                margin: 0 auto 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 3.5rem;
                font-weight: bold;
                color: white;
                position: relative;
            ">
                ${firstLetter}
            </div>
            
            <!-- Friend Name -->
            <h2 style="font-size: 2.5rem; margin-bottom: 10px; color: white;">${friendName}</h2>
            
            <!-- Call Status -->
            <p id="callStatusText" style="color: #a0a0c0; margin-bottom: 40px; font-size: 1.3rem;">
                ${type === 'outgoing' ? 'Calling...' : 'Incoming call...'}
            </p>
            
            <!-- Call Timer -->
            <div id="callTimer" style="
                font-size: 3rem;
                font-weight: bold;
                margin-bottom: 50px;
                background: linear-gradient(45deg, #667eea, #764ba2);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                display: none;
            ">00:00</div>
            
            <!-- Hidden Audio -->
            <audio id="remoteAudio" autoplay style="display: none;"></audio>
            
            <!-- Call Controls -->
            <div style="
                display: flex;
                justify-content: center;
                gap: 30px;
                margin-top: 50px;
                flex-wrap: wrap;
            ">
                <!-- Mute Button -->
                <div style="text-align: center;">
                    <button onclick="toggleMuteCall()" id="muteCallBtn" style="
                        width: 80px;
                        height: 80px;
                        border-radius: 50%;
                        background: rgba(255,255,255,0.1);
                        border: 2px solid rgba(255,255,255,0.2);
                        color: white;
                        font-size: 2rem;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                    ">
                        🔇
                    </button>
                    <p style="margin-top: 10px; color: #a0a0c0; font-size: 0.9rem;">Mute</p>
                </div>
                
                <!-- Speaker Button -->
                <div style="text-align: center;">
                    <button onclick="toggleSpeaker()" id="speakerBtn" style="
                        width: 80px;
                        height: 80px;
                        border-radius: 50%;
                        background: rgba(255,255,255,0.1);
                        border: 2px solid rgba(255,255,255,0.2);
                        color: white;
                        font-size: 2rem;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                    ">
                        🔊
                    </button>
                    <p style="margin-top: 10px; color: #a0a0c0; font-size: 0.9rem;">Speaker</p>
                </div>
                
                <!-- End Call Button -->
                <div style="text-align: center;">
                    <button onclick="endCurrentCall()" style="
                        width: 80px;
                        height: 80px;
                        border-radius: 50%;
                        background: linear-gradient(45deg, #ff3b30, #ff5e3a);
                        border: none;
                        color: white;
                        font-size: 2rem;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                        box-shadow: 0 5px 15px rgba(255, 59, 48, 0.4);
                    ">
                        📞
                    </button>
                    <p style="margin-top: 10px; color: #ff6b6b; font-size: 0.9rem;">End Call</p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(callScreen);
    
    // Add ring animation for outgoing calls
    if (type === 'outgoing') {
        const ringStyle = document.createElement('style');
        ringStyle.textContent = `
            .calling-ring::before {
                content: '';
                position: absolute;
                top: -10px;
                left: -10px;
                right: -10px;
                bottom: -10px;
                border-radius: 50%;
                background: inherit;
                animation: pulseRing 1.5s infinite;
                z-index: -1;
            }
        `;
        document.head.appendChild(ringStyle);
    }
}

function updateCallScreenStatus(state) {
    const statusText = document.getElementById('callStatusText');
    const timer = document.getElementById('callTimer');
    const muteBtn = document.getElementById('muteCallBtn');
    const speakerBtn = document.getElementById('speakerBtn');
    
    if (!statusText) return;
    
    switch(state) {
        case 'ringing':
            statusText.textContent = 'Calling...';
            break;
        case 'connecting':
            statusText.textContent = 'Connecting...';
            break;
        case 'active':
            statusText.textContent = 'Call Connected';
            if (timer) {
                timer.style.display = 'block';
                startCallTimer();
            }
            if (muteBtn) {
                muteBtn.style.display = 'block';
            }
            if (speakerBtn) {
                speakerBtn.style.display = 'block';
            }
            break;
        case 'ending':
            statusText.textContent = 'Ending call...';
            break;
    }
}

function startCallTimer() {
    let seconds = 0;
    const timerEl = document.getElementById('callTimer');
    if (!timerEl) return;
    
    clearInterval(callTimerInterval);
    
    callTimerInterval = setInterval(() => {
        seconds++;
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        timerEl.textContent = 
            `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

let isMuted = false;
let isSpeakerOn = true;

async function toggleMuteCall() {
    if (!callServiceInstance) return;
    
    isMuted = !isMuted;
    const muteBtn = document.getElementById('muteCallBtn');
    if (muteBtn) {
        muteBtn.innerHTML = isMuted ? '🔈' : '🔇';
        muteBtn.style.background = isMuted ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
    }
    
    await callServiceInstance.toggleMute();
}

function toggleSpeaker() {
    const audio = document.getElementById('remoteAudio');
    if (!audio) return;
    
    isSpeakerOn = !isSpeakerOn;
    const speakerBtn = document.getElementById('speakerBtn');
    
    if (speakerBtn) {
        speakerBtn.innerHTML = isSpeakerOn ? '🔊' : '🔈';
        speakerBtn.style.background = isSpeakerOn ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
    }
    
    // Adjust volume: 60% when off, 100% when on
    audio.volume = isSpeakerOn ? 1.0 : 0.4;
}

async function endCurrentCall() {
    if (callServiceInstance) {
        await callServiceInstance.endCall();
    }
    hideCallScreen();
}

function hideCallScreen() {
    const callScreen = document.getElementById('callScreen');
    if (callScreen) {
        callScreen.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            callScreen.remove();
        }, 300);
    }
    
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    
    isMuted = false;
    isSpeakerOn = true;
}

// ==================== INCOMING CALL HANDLER ====================
function setupIncomingCallListener() {
    if (!currentUser) return;
    
    supabase
        .channel(`user-calls-${currentUser.id}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'calls',
            filter: `receiver_id=eq.${currentUser.id}`
        }, async (payload) => {
            const call = payload.new;
            if (call.status === 'ringing') {
                showIncomingCallScreen(call);
            }
        })
        .subscribe();
}

async function showIncomingCallScreen(call) {
    const { data: caller } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', call.caller_id)
        .single();
    
    const friendName = caller?.username || 'Unknown';
    showCallScreen(friendName, call.id, 'incoming');
}

async function answerIncomingCall(callId) {
    try {
        const { default: callService } = await import('/app/utils/callService.js');
        callServiceInstance = callService;
        
        await callService.initialize(currentUser.id);
        callService.setOnCallStateChange(updateCallScreenStatus);
        callService.setOnRemoteStream((stream) => {
            const audio = document.getElementById('remoteAudio');
            if (audio) audio.srcObject = stream;
        });
        
        await callService.answerCall(callId);
        
    } catch (error) {
        console.error("Answer call failed:", error);
        hideCallScreen();
        toast.error("Failed", "Could not answer call");
    }
}

async function rejectIncomingCall(callId) {
    try {
        await supabase
            .from('calls')
            .update({ status: 'rejected' })
            .eq('id', callId);
    } catch (error) {
        console.error("Reject call failed:", error);
    }
    hideCallScreen();
}

// ==================== OTHER FUNCTIONS ====================
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

    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
}

function openChat(friendId, friendName) {
    localStorage.setItem('currentChatFriend', JSON.stringify({
        id: friendId,
        name: friendName
    }));
    window.location.href = PATHS.CHATS;
}

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', initFriendsPage);

// Clean up on page unload
window.addEventListener('beforeunload', async () => {
    if (currentUser) {
        await presenceTracker.stop();
    }

    if (presenceChannel) {
        supabase.removeChannel(presenceChannel);
    }
    
    if (callServiceInstance) {
        await callServiceInstance.endCall();
    }
});