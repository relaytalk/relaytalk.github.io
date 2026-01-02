import { auth } from '../../utils/auth.js'
import { supabase } from '../../utils/supabase.js'

console.log("✨ Chat Loaded");

let currentUser = null;
let chatFriend = null;
let chatChannel = null;
let statusChannel = null;
let isLoadingMessages = false;
let currentMessages = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check auth
        const { success, user } = await auth.getCurrentUser();
        if (!success || !user) {
            showCustomAlert("Please login first!", "⚠️", "Login Required", () => {
                window.location.href = '../auth/index.html';
            });
            return;
        }

        currentUser = user;
        console.log("Current User:", user.id);

        // Get friend ID
        const urlParams = new URLSearchParams(window.location.search);
        const friendId = urlParams.get('friendId');

        if (!friendId) {
            showCustomAlert("No friend selected!", "😕", "Error", () => {
                window.location.href = '../home/index.html';
            });
            return;
        }

        // Load friend
        const { data: friend, error: friendError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', friendId)
            .single();

        if (friendError) throw friendError;

        chatFriend = friend;
        document.getElementById('chatUserName').textContent = friend.username;
        document.getElementById('chatUserAvatar').textContent = friend.username.charAt(0).toUpperCase();

        // Update friend status in UI
        updateFriendStatus(friend.status);

        // Load old messages
        await loadOldMessages(friendId);

        // Setup realtime - SIMPLIFIED & FIXED
        setupRealtime(friendId);

        console.log("✅ Chat ready - Realtime active!");

    } catch (error) {
        console.error("Init error:", error);
        showCustomAlert("Error loading chat: " + error.message, "❌", "Error", () => {
            window.location.href = '../home/index.html';
        });
    }
});

// Load old messages - FIXED QUERY
async function loadOldMessages(friendId) {
    if (isLoadingMessages) return;
    isLoadingMessages = true;

    try {
        console.log("Loading messages for friend:", friendId);

        // FIXED: Get messages between ONLY these two users
        const { data: messages, error } = await supabase
            .from('direct_messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });

        if (error) {
            console.error("Query error:", error);
            throw error;
        }

        console.log("Loaded", messages?.length || 0, "messages");
        currentMessages = messages || [];

        showMessages(currentMessages);

    } catch (error) {
        console.error("Load error:", error);
        showMessages([]);
    } finally {
        isLoadingMessages = false;
    }
}

// Show messages in UI
function showMessages(messages) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    console.log("Showing", messages?.length || 0, "messages");

    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <div class="empty-chat-icon">💬</div>
                <h3>No messages yet</h3>
                <p style="margin-top: 10px;">Say hello to start the conversation!</p>
            </div>
        `;
        return;
    }

    let html = '';
    let lastDate = '';

    messages.forEach(msg => {
        const isSent = msg.sender_id === currentUser.id;
        const time = new Date(msg.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
        const date = new Date(msg.created_at).toLocaleDateString();

        if (date !== lastDate) {
            html += `<div class="date-separator"><span>${date}</span></div>`;
            lastDate = date;
        }

        html += `
            <div class="message ${isSent ? 'sent' : 'received'}">
                <div class="message-content">${msg.content || ''}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
    });

    html += `<div style="height: 10px;"></div>`;
    container.innerHTML = html;
    setTimeout(scrollToBottom, 150);
}

// Scroll to bottom
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) {
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 100);
    }
}

// Add single message to UI
function addMessageToUI(message) {
    const container = document.getElementById('messagesContainer');
    if (!container || !message) return;

    // Remove empty state if exists
    if (container.querySelector('.empty-chat')) {
        container.innerHTML = '';
    }

    const isSent = message.sender_id === currentUser.id;
    const time = new Date(message.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    const messageHTML = `
        <div class="message ${isSent ? 'sent' : 'received'}">
            <div class="message-content">${message.content || ''}</div>
            <div class="message-time">${time}</div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', messageHTML);
    currentMessages.push(message);
    setTimeout(scrollToBottom, 50);
}

// Update friend status UI
function updateFriendStatus(status) {
    const isOnline = status === 'online';
    document.getElementById('statusText').textContent = isOnline ? 'Online' : 'Offline';
    document.getElementById('statusDot').className = isOnline ? 'status-dot' : 'status-dot offline';
}

// REAL-TIME - SIMPLIFIED & WORKING
function setupRealtime(friendId) {
    console.log("🔧 Setting up realtime for friend:", friendId);

    // Clean up old channels
    if (chatChannel) {
        console.log("Removing old chat channel");
        supabase.removeChannel(chatChannel);
    }
    if (statusChannel) {
        console.log("Removing old status channel");
        supabase.removeChannel(statusChannel);
    }

    // ========== MESSAGE CHANNEL - SIMPLIFIED ==========
    // Listen to ALL inserts in direct_messages, then filter manually
    chatChannel = supabase.channel(`dm:${currentUser.id}:${friendId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'direct_messages'
        }, (payload) => {
            console.log("📨 Realtime INSERT detected:", payload.new);
            
            const newMsg = payload.new;
            
            // Check if this message is for our chat
            const isOurMessage = 
                (newMsg.sender_id === currentUser.id && newMsg.receiver_id === friendId) ||
                (newMsg.sender_id === friendId && newMsg.receiver_id === currentUser.id);
            
            if (isOurMessage) {
                // Check for duplicates
                const isDuplicate = currentMessages.some(msg => msg.id === newMsg.id);
                
                if (!isDuplicate) {
                    console.log("✅ Adding new message to UI");
                    addMessageToUI(newMsg);
                    
                    // Notification for incoming messages only
                    if (newMsg.sender_id === friendId) {
                        const originalTitle = document.title;
                        document.title = "💬 New Message!";
                        setTimeout(() => document.title = originalTitle, 1000);
                        showToast(`New message from ${chatFriend.username}`, "💬");
                    }
                }
            }
        })
        .subscribe((status) => {
            console.log("💬 Message Channel Status:", status);
            updateRealtimeStatus(status, 'message');
        });

    // ========== STATUS CHANNEL - SIMPLIFIED ==========
    // Listen to ALL updates in profiles, then filter
    statusChannel = supabase.channel(`status:${friendId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles'
        }, (payload) => {
            console.log("🔄 Profile UPDATE detected:", payload.new);
            
            // Check if this update is for our friend
            if (payload.new.id === friendId) {
                console.log("✅ Friend status updated:", payload.new.status);
                chatFriend.status = payload.new.status;
                updateFriendStatus(payload.new.status);
                
                // Show toast for status change
                if (payload.new.status === 'online') {
                    showToast(`${chatFriend.username} is now online`, "🟢");
                }
            }
        })
        .subscribe((status) => {
            console.log("📊 Status Channel Status:", status);
            updateRealtimeStatus(status, 'status');
        });

    console.log("🎯 Realtime channels created");
}

// Update realtime status indicator
function updateRealtimeStatus(status, type = 'message') {
    let statusEl = document.getElementById('realtimeStatus');
    if (!statusEl) {
        statusEl = createStatus();
    }

    const now = new Date().toLocaleTimeString();
    
    if (status === 'SUBSCRIBED') {
        statusEl.innerHTML = `🟢 Live (${type}) - ${now}`;
        statusEl.style.background = '#28a745';
        console.log(`✅ ${type.toUpperCase()} CHANNEL SUBSCRIBED!`);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        statusEl.innerHTML = `🔴 ${type} Error - ${now}`;
        statusEl.style.background = '#dc3545';
        console.error(`${type} channel error, retrying...`);
        
        // Retry after 5 seconds
        setTimeout(() => {
            const friendId = new URLSearchParams(window.location.search).get('friendId');
            if (friendId) {
                console.log(`🔄 Retrying ${type} channel...`);
                setupRealtime(friendId);
            }
        }, 5000);
    } else {
        statusEl.innerHTML = `🟡 ${type} Connecting... - ${now}`;
        statusEl.style.background = '#ffc107';
    }
}

function createStatus() {
    const div = document.createElement('div');
    div.id = 'realtimeStatus';
    div.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: #ffc107;
        color: white;
        padding: 8px 12px;
        border-radius: 10px;
        font-size: 12px;
        z-index: 9999;
        font-weight: bold;
        max-width: 250px;
        word-wrap: break-word;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.2);
    `;
    document.body.appendChild(div);
    return div;
}

// Send message
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();

    if (!text || !chatFriend) {
        showToast("Please type a message!", "⚠️");
        return;
    }

    try {
        console.log("📤 Sending message to:", chatFriend.id);

        const { data, error } = await supabase
            .from('direct_messages')
            .insert({
                sender_id: currentUser.id,
                receiver_id: chatFriend.id,
                content: text,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        console.log("✅ Message sent to database:", data.id);
        
        // Clear input but keep focus
        input.value = '';
        input.style.height = 'auto';
        input.focus();
        
        // Update send button
        document.getElementById('sendBtn').disabled = true;

        // Add message instantly (realtime will also add it)
        addMessageToUI(data);

        // Debug: Check if message was inserted
        console.log("Message inserted, waiting for realtime...");

    } catch (error) {
        console.error("Send failed:", error);
        showCustomAlert("Failed to send message: " + error.message, "❌", "Error");
    }
}

// Handle Enter key
function handleKeyPress(event) {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    if (sendBtn) {
        sendBtn.disabled = !input || input.value.trim() === '';
    }

    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (input && input.value.trim()) {
            sendMessage();
        }
    }
}

// Auto resize textarea
function autoResize(textarea) {
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 100);
    textarea.style.height = newHeight + 'px';

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.disabled = textarea.value.trim() === '';
    }
}

// CUSTOM ALERT SYSTEM
function showCustomAlert(message, icon = "⚠️", title = "Alert", onConfirm = null) {
    const alertOverlay = document.getElementById('customAlert');
    const alertIcon = document.getElementById('alertIcon');
    const alertTitle = document.getElementById('alertTitle');
    const alertMessage = document.getElementById('alertMessage');
    const alertConfirm = document.getElementById('alertConfirm');
    const alertCancel = document.getElementById('alertCancel');

    alertIcon.textContent = icon;
    alertTitle.textContent = title;
    alertMessage.textContent = message;
    alertCancel.style.display = 'none';

    alertConfirm.textContent = "OK";
    alertConfirm.onclick = () => {
        alertOverlay.style.display = 'none';
        if (onConfirm) onConfirm();
    };

    alertOverlay.style.display = 'flex';
}

function showConfirmAlert(message, icon = "❓", title = "Confirm", onConfirm, onCancel = null) {
    const alertOverlay = document.getElementById('customAlert');
    const alertIcon = document.getElementById('alertIcon');
    const alertTitle = document.getElementById('alertTitle');
    const alertMessage = document.getElementById('alertMessage');
    const alertConfirm = document.getElementById('alertConfirm');
    const alertCancel = document.getElementById('alertCancel');

    alertIcon.textContent = icon;
    alertTitle.textContent = title;
    alertMessage.textContent = message;
    alertCancel.style.display = 'inline-block';

    alertConfirm.textContent = "Yes";
    alertConfirm.onclick = () => {
        alertOverlay.style.display = 'none';
        if (onConfirm) onConfirm();
    };

    alertCancel.textContent = "No";
    alertCancel.onclick = () => {
        alertOverlay.style.display = 'none';
        if (onCancel) onCancel();
    };

    alertOverlay.style.display = 'flex';
}

function showToast(message, icon = "ℹ️") {
    const toast = document.getElementById('customToast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');

    toastIcon.textContent = icon;
    toastMessage.textContent = message;
    toast.style.display = 'flex';

    setTimeout(() => toast.style.display = 'none', 3000);
}

// Go back
function goBack() {
    if (chatChannel) {
        console.log("Closing chat channel");
        supabase.removeChannel(chatChannel);
    }
    if (statusChannel) {
        console.log("Closing status channel");
        supabase.removeChannel(statusChannel);
    }
    window.location.href = '../home/index.html';
}

// Show user info modal
window.showUserInfo = function() {
    if (!chatFriend) {
        showToast("User information not available", "⚠️");
        return;
    }

    const modal = document.getElementById('userInfoModal');
    const content = document.getElementById('userInfoContent');
    const isOnline = chatFriend.status === 'online';

    content.innerHTML = `
        <div class="user-info-avatar">
            ${chatFriend.username.charAt(0).toUpperCase()}
        </div>
        <div class="user-info-details">
            <h3 class="user-info-name">${chatFriend.full_name || chatFriend.username}</h3>
            <p class="user-info-username">@${chatFriend.username}</p>
            <div class="user-info-status ${isOnline ? '' : 'offline'}">
                <span class="status-dot ${isOnline ? '' : 'offline'}"></span>
                ${isOnline ? 'Online' : 'Offline'}
            </div>
        </div>
        <div class="user-info-actions">
            <button class="info-action-btn primary" onclick="startVoiceCall()">
                🎤 Voice Call
            </button>
            <button class="info-action-btn secondary" onclick="viewSharedMedia()">
                📷 Shared Media
            </button>
            <button class="info-action-btn danger" onclick="blockUserPrompt()">
                🚫 Block User
            </button>
        </div>
    `;

    modal.style.display = 'flex';
};

window.closeModal = function() {
    document.getElementById('userInfoModal').style.display = 'none';
};

window.startVoiceCall = function() {
    showToast("Voice call feature coming soon!", "🎤");
};

window.viewSharedMedia = function() {
    showToast("Shared media feature coming soon!", "📷");
};

window.blockUserPrompt = function() {
    showConfirmAlert(
        `Are you sure you want to block ${chatFriend.username}?`,
        "🚫",
        "Block User",
        () => {
            showToast("User blocked!", "✅");
            setTimeout(goBack, 1000);
        }
    );
};

window.attachFile = function() {
    showToast("File attachment feature coming soon!", "📎");
};

window.clearChatPrompt = async function() {
    showConfirmAlert(
        "Are you sure you want to clear all messages?",
        "🗑️",
        "Clear Chat",
        async () => {
            try {
                const friendId = new URLSearchParams(window.location.search).get('friendId');
                const { error } = await supabase
                    .from('direct_messages')
                    .delete()
                    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`);

                if (error) throw error;

                showToast("Chat cleared!", "✅");
                currentMessages = [];
                showMessages([]);
            } catch (error) {
                console.error("Clear chat error:", error);
                showCustomAlert("Error clearing chat", "❌", "Error");
            }
        }
    );
};

// DEBUG FUNCTION: Test realtime manually
window.testRealtime = async function() {
    console.log("=== REALTIME DEBUG ===");
    console.log("Current User:", currentUser?.id);
    console.log("Friend:", chatFriend?.id);
    console.log("Chat Channel:", chatChannel?.topic);
    console.log("Status Channel:", statusChannel?.topic);
    console.log("Current Messages:", currentMessages.length);
    
    // Test insert
    const testMsg = {
        sender_id: currentUser.id,
        receiver_id: chatFriend.id,
        content: "Test message at " + new Date().toLocaleTimeString(),
        created_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
        .from('direct_messages')
        .insert(testMsg)
        .select()
        .single();
        
    if (error) {
        console.error("Test insert failed:", error);
    } else {
        console.log("Test insert successful:", data);
        showToast("Test message sent!", "🧪");
    }
};

// Make functions global
window.sendMessage = sendMessage;
window.handleKeyPress = handleKeyPress;
window.autoResize = autoResize;
window.goBack = goBack;
window.showCustomAlert = showCustomAlert;
window.showConfirmAlert = showConfirmAlert;
window.showToast = showToast;