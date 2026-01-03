// Phone Page Script
import { supabase } from '../../utils/supabase.js';
import { auth } from '../../utils/auth.js';

console.log("📱 Phone Page Loaded");

let currentUser = null;
let callServiceInstance = null;
let callTimerInterval = null;
let isMuted = false;
let isSpeakerOn = true;

// ==================== INITIALIZATION ====================
async function initPhonePage() {
    console.log("Initializing phone page...");

    try {
        const { success, user } = await auth.getCurrentUser();
        if (!success || !user) {
            window.location.href = '../../login/index.html';
            return;
        }

        currentUser = user;
        console.log("✅ User authenticated:", currentUser.email);

        // Load recent calls
        await loadRecentCalls();

        // Setup incoming call listener
        setupIncomingCallListener();

        // Add search suggestions
        setupSearchSuggestions();

    } catch (error) {
        console.error("Init error:", error);
        alert("Failed to load phone page. Please refresh.");
    }
}

// ==================== CALL FUNCTIONS ====================
async function startVoiceCall() {
    const username = document.getElementById('friendUsername').value.trim();
    if (!username) {
        showNotification("Please enter a username", "error");
        return;
    }

    try {
        // Get friend ID from username
        const { data: friend, error } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('username', username)
            .single();

        if (error || !friend) {
            showNotification("User not found", "error");
            return;
        }

        // Check if friend
        const { data: isFriend } = await supabase
            .from('friends')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('friend_id', friend.id)
            .single();

        if (!isFriend) {
            showNotification("You need to be friends to call", "error");
            return;
        }

        // Show call screen
        showCallScreen(friend.username, friend.id, 'outgoing');

        // Initialize call service
        const { default: callService } = await import('../../utils/callService.js');
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
                setTimeout(() => {
                    hideCallScreen();
                    loadRecentCalls(); // Refresh recent calls
                }, 1000);
            }
        });
        
        // Start call
        await callService.initiateCall(friend.id, 'voice');
        
    } catch (error) {
        console.error("❌ Call failed:", error);
        showNotification("Call failed: " + error.message, "error");
        hideCallScreen();
    }
}

async function startVideoCall() {
    const username = document.getElementById('friendUsername').value.trim();
    if (!username) {
        showNotification("Please enter a username", "error");
        return;
    }

    showNotification("Video calls coming soon!", "info");
    // Similar to startVoiceCall but with video: true
}

// ==================== CALL SCREEN ====================
function showCallScreen(friendName, friendId, type = 'outgoing') {
    // Remove existing screen
    const existing = document.getElementById('callScreen');
    if (existing) existing.remove();

    const firstLetter = friendName.charAt(0).toUpperCase();
    
    // Create call screen
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
    
    // Add animations
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
    document.head.appendChild(style);
    
    callScreen.innerHTML = `
        <div style="text-align: center; padding: 30px; width: 100%; max-width: 500px;">
            <!-- Friend Avatar -->
            <div class="calling-ring" style="
                width: 180px;
                height: 180px;
                border-radius: 50%;
                background: linear-gradient(45deg, #667eea, #764ba2);
                margin: 0 auto 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 4rem;
                font-weight: bold;
                color: white;
                position: relative;
                box-shadow: 0 20px 50px rgba(102, 126, 234, 0.3);
            ">
                ${firstLetter}
            </div>
            
            <!-- Friend Name -->
            <h2 style="font-size: 2.8rem; margin-bottom: 15px; color: white;">${friendName}</h2>
            
            <!-- Call Status -->
            <p id="callStatusText" style="color: #a0a0c0; margin-bottom: 40px; font-size: 1.4rem;">
                ${type === 'outgoing' ? 'Calling...' : 'Incoming call...'}
            </p>
            
            <!-- Call Timer -->
            <div id="callTimer" style="
                font-size: 3.5rem;
                font-weight: bold;
                margin-bottom: 60px;
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
                gap: 40px;
                margin-top: 40px;
                flex-wrap: wrap;
            ">
                <!-- Mute Button -->
                <div style="text-align: center;">
                    <button onclick="toggleMuteCall()" id="muteCallBtn" style="
                        width: 90px;
                        height: 90px;
                        border-radius: 50%;
                        background: rgba(255,255,255,0.1);
                        border: 2px solid rgba(255,255,255,0.2);
                        color: white;
                        font-size: 2.5rem;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.3s;
                    ">
                        🔇
                    </button>
                    <p style="margin-top: 15px; color: #a0a0c0; font-size: 1rem;">MUTE</p>
                </div>
                
                <!-- Speaker Button -->
                <div style="text-align: center;">
                    <button onclick="toggleSpeaker()" id="speakerBtn" style="
                        width: 90px;
                        height: 90px;
                        border-radius: 50%;
                        background: rgba(255,255,255,0.2);
                        border: 2px solid rgba(102, 126, 234, 0.5);
                        color: white;
                        font-size: 2.5rem;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.3s;
                        box-shadow: 0 0 20px rgba(102, 126, 234, 0.3);
                    ">
                        🔊
                    </button>
                    <p style="margin-top: 15px; color: #667eea; font-size: 1rem;">SPEAKER ON</p>
                </div>
                
                <!-- End Call Button -->
                <div style="text-align: center;">
                    <button onclick="endCurrentCall()" style="
                        width: 90px;
                        height: 90px;
                        border-radius: 50%;
                        background: linear-gradient(45deg, #ff3b30, #ff5e3a);
                        border: none;
                        color: white;
                        font-size: 2.5rem;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.3s;
                        box-shadow: 0 10px 30px rgba(255, 59, 48, 0.4);
                    ">
                        📞
                    </button>
                    <p style="margin-top: 15px; color: #ff6b6b; font-size: 1rem;">END CALL</p>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(callScreen);
}

function updateCallScreenStatus(state) {
    const statusText = document.getElementById('callStatusText');
    const timer = document.getElementById('callTimer');
    
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

async function toggleMuteCall() {
    if (!callServiceInstance) return;
    
    isMuted = !isMuted;
    const muteBtn = document.getElementById('muteCallBtn');
    const muteLabel = muteBtn?.parentElement?.querySelector('p');
    
    if (muteBtn) {
        muteBtn.innerHTML = isMuted ? '🔈' : '🔇';
        muteBtn.style.background = isMuted ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
        muteBtn.style.borderColor = isMuted ? 'rgba(102, 126, 234, 0.5)' : 'rgba(255,255,255,0.2)';
        
        if (muteLabel) {
            muteLabel.textContent = isMuted ? 'MUTED' : 'MUTE';
            muteLabel.style.color = isMuted ? '#667eea' : '#a0a0c0';
        }
    }
    
    await callServiceInstance.toggleMute();
}

function toggleSpeaker() {
    const audio = document.getElementById('remoteAudio');
    if (!audio) return;
    
    isSpeakerOn = !isSpeakerOn;
    const speakerBtn = document.getElementById('speakerBtn');
    const speakerLabel = speakerBtn?.parentElement?.querySelector('p');
    
    if (speakerBtn) {
        speakerBtn.innerHTML = isSpeakerOn ? '🔊' : '🔈';
        speakerBtn.style.background = isSpeakerOn ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
        speakerBtn.style.borderColor = isSpeakerOn ? 'rgba(102, 126, 234, 0.5)' : 'rgba(255,255,255,0.2)';
        speakerBtn.style.boxShadow = isSpeakerOn ? '0 0 20px rgba(102, 126, 234, 0.3)' : 'none';
        
        if (speakerLabel) {
            speakerLabel.textContent = isSpeakerOn ? 'SPEAKER ON' : 'SPEAKER OFF';
            speakerLabel.style.color = isSpeakerOn ? '#667eea' : '#a0a0c0';
        }
    }
    
    // Adjust volume: 40% when off (60% decrease), 100% when on
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

// ==================== INCOMING CALLS ====================
function setupIncomingCallListener() {
    if (!currentUser) return;
    
    supabase
        .channel(`phone-calls-${currentUser.id}`)
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
    
    if (!caller) return;
    
    // Show incoming call screen
    showCallScreen(caller.username, call.id, 'incoming');
}

// ==================== RECENT CALLS ====================
async function loadRecentCalls() {
    if (!currentUser) return;
    
    const container = document.getElementById('recentCallsList');
    if (!container) return;
    
    try {
        const { data: calls, error } = await supabase
            .from('calls')
            .select(`
                id,
                caller_id,
                receiver_id,
                call_type,
                status,
                duration,
                initiated_at,
                ended_at,
                profiles!calls_caller_id_fkey(username, avatar_url)
            `)
            .or(`caller_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
            .order('initiated_at', { ascending: false })
            .limit(10);
        
        if (error) throw error;
        
        if (!calls || calls.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📱</div>
                    <h3 style="color: white; margin-bottom: 10px;">No Recent Calls</h3>
                    <p>Start calling your friends to see them here</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        calls.forEach(call => {
            const isOutgoing = call.caller_id === currentUser.id;
            const friendName = call.profiles?.username || 'Unknown';
            const firstLetter = friendName.charAt(0).toUpperCase();
            const callType = call.call_type === 'video' ? '📹' : '📞';
            
            let statusColor = '#a0a0c0';
            let statusText = 'Missed';
            
            if (call.status === 'ended') {
                statusColor = '#4CAF50';
                statusText = call.duration ? formatDuration(call.duration) : 'Connected';
            } else if (call.status === 'rejected') {
                statusColor = '#ff3b30';
                statusText = 'Rejected';
            }
            
            const timeAgo = getTimeAgo(new Date(call.initiated_at));
            
            html += `
                <div class="recent-call-item" style="
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    padding: 15px;
                    background: rgba(255,255,255,0.03);
                    border-radius: 15px;
                    margin-bottom: 10px;
                    border: 1px solid rgba(255,255,255,0.05);
                ">
                    <div style="
                        width: 50px;
                        height: 50px;
                        border-radius: 50%;
                        background: linear-gradient(45deg, #667eea, #764ba2);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.3rem;
                        font-weight: bold;
                        color: white;
                    ">
                        ${firstLetter}
                    </div>
                    
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h4 style="color: white; margin: 0; font-size: 1.1rem;">
                                ${friendName}
                                <span style="font-size: 0.9rem; margin-left: 8px;">${callType}</span>
                            </h4>
                            <span style="font-size: 0.9rem; color: #a0a0c0;">${timeAgo}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
                            <span style="color: ${statusColor}; font-size: 0.9rem;">
                                ${isOutgoing ? '↗️ Outgoing' : '↙️ Incoming'} • ${statusText}
                            </span>
                            <button onclick="callAgain('${friendName}')" style="
                                padding: 6px 15px;
                                background: rgba(102, 126, 234, 0.2);
                                border: 1px solid rgba(102, 126, 234, 0.3);
                                border-radius: 20px;
                                color: #667eea;
                                font-size: 0.85rem;
                                cursor: pointer;
                            ">
                                Call Again
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error("Error loading recent calls:", error);
    }
}

function callAgain(username) {
    const input = document.getElementById('friendUsername');
    if (input) {
        input.value = username;
        input.focus();
    }
}

function formatDuration(seconds) {
    if (!seconds) return '';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
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
    if (days < 7) return `${days}d ago`;
    
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w ago`;
    
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    
    const years = Math.floor(days / 365);
    return `${years}y ago`;
}

// ==================== UTILITIES ====================
function setupSearchSuggestions() {
    const input = document.getElementById('friendUsername');
    if (!input) return;
    
    // Load friends for autocomplete
    input.addEventListener('focus', async () => {
        // Could implement friend list autocomplete here
    });
}

function showNotification(message, type = 'info') {
    // Create notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'error' ? 'linear-gradient(45deg, #ff3b30, #ff5e3a)' : 
                      type === 'success' ? 'linear-gradient(45deg, #4CAF50, #2E7D32)' : 
                      'linear-gradient(45deg, #667eea, #764ba2)'};
        color: white;
        padding: 15px 25px;
        border-radius: 15px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 1000;
        animation: slideUp 0.3s ease;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideDown 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Navigation
function goToFriends() {
    window.location.href = '../home/friends/index.html';
}

function goToChats() {
    window.location.href = '../chats/index.html';
}

function goToHome() {
    window.location.href = '../home/index.html';
}

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', initPhonePage);

// Add slide animations
const slideStyle = document.createElement('style');
slideStyle.textContent = `
    @keyframes slideUp {
        from {
            transform: translateX(-50%) translateY(20px);
            opacity: 0;
        }
        to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
    }
    
    @keyframes slideDown {
        from {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        to {
            transform: translateX(-50%) translateY(20px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(slideStyle);