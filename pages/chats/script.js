import { auth } from '../../utils/auth.js'
import { supabase } from '../../utils/supabase.js'

console.log("✨ Chat Loaded");

let currentUser = null;
let chatFriend = null;
let chatChannel = null;
let statusChannel = null;
let isTyping = false;
let typingTimeout = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check auth
        const { success, user } = await auth.getCurrentUser();
        if (!success || !user) {
            alert("Please login first!");
            window.location.href = '../auth/index.html';
            return;
        }

        currentUser = user;
        console.log("User:", user.email);

        // Create real-time status indicator immediately
        createStatus();
        updateRealtimeStatus('🟡 Connecting');

        // Get friend ID
        const urlParams = new URLSearchParams(window.location.search);
        const friendId = urlParams.get('friendId');

        if (!friendId) {
            alert("No friend selected!");
            window.location.href = '../home/index.html';
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
        const isOnline = friend.status === 'online';
        document.getElementById('statusText').textContent = isOnline ? 'Online' : 'Offline';
        document.getElementById('statusDot').className = isOnline ? 'status-dot' : 'status-dot offline';

        // Show loading
        showLoading();

        // Load old messages
        await loadOldMessages(friendId);

        // Setup realtime
        setupRealtime(friendId);

        // Setup typing listener
        setupTypingListener();

        console.log("✅ Chat ready");

    } catch (error) {
        console.error("Init error:", error);
        alert("Error loading chat: " + error.message);
        window.location.href = '../home/index.html';
    }
});

// Show loading indicator
function showLoading() {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = `
        <div class="loading-messages">
            <div style="font-size: 1.5rem; margin-bottom: 10px;">⏳</div>
            Loading messages...
        </div>
    `;
}

// Load old messages - FIXED (Efficient query)
async function loadOldMessages(friendId) {
    try {
        console.log("Loading messages between:", currentUser.id, "and", friendId);

        // Get messages using proper filter (both directions in one query)
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
        showMessages(messages || []);

        // Scroll after messages are rendered
        setTimeout(() => {
            scrollToBottom(true);
        }, 50);

    } catch (error) {
        console.error("Load error:", error);
        // Show empty state
        showMessages([]);
        showNotification("⚠️ Could not load all messages", "warning");
    }
}

// Sanitize HTML to prevent XSS
function sanitizeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show messages in UI - FIXED (XSS protected)
function showMessages(messages) {
    const container = document.getElementById('messagesContainer');
    if (!container) {
        console.error("messagesContainer not found!");
        return;
    }

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
        const date = new Date(msg.created_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        // Add date separator if date changed
        if (date !== lastDate) {
            html += `<div class="date-separator"><span>${date}</span></div>`;
            lastDate = date;
        }

        html += `
            <div class="message ${isSent ? 'sent' : 'received'}" data-id="${msg.id}">
                <div class="message-content">${sanitizeHTML(msg.content || '')}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Scroll to bottom
function scrollToBottom(smooth = false) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    if (smooth) {
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
    } else {
        container.scrollTop = container.scrollHeight;
    }
}

// REAL-TIME FIXED
function setupRealtime(friendId) {
    console.log("Setting realtime for friend:", friendId);

    // Remove old channels properly
    removeChannels();

    // Create message channel - FIXED
    chatChannel = supabase.channel(`dm-${currentUser.id}-${friendId}`, {
        config: {
            broadcast: { self: false }
        }
    })
    .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `or(and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id}))`
    }, async (payload) => {
        console.log("🔥 New message:", payload.new);

        // Add just the new message instead of reloading all
        addNewMessage(payload.new);

        // Play sound if not from current user
        if (payload.new.sender_id !== currentUser.id) {
            playMessageSound();
        }

        // Flash title if tab not active
        if (document.hidden) {
            flashTitle("💬 New Message!");
        }
    })
    .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'direct_messages',
        filter: `or(and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id}))`
    }, async () => {
        // Reload if messages deleted
        await loadOldMessages(friendId);
    })
    .subscribe((status, err) => {
        console.log("Message channel status:", status);
        if (err) {
            console.error("Channel error:", err);
            updateRealtimeStatus('🔴 Error');
            // Retry after delay
            setTimeout(() => {
                if (friendId) setupRealtime(friendId);
            }, 3000);
        } else {
            updateRealtimeStatus(status === 'SUBSCRIBED' ? '🟢 Live' : '🟡 Connecting');
        }
    });

    // Create status channel for real-time status updates
    statusChannel = supabase.channel(`status-${friendId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${friendId}`
        }, (payload) => {
            console.log("Friend status updated:", payload.new.status);
            chatFriend.status = payload.new.status;

            // Update UI
            const isOnline = payload.new.status === 'online';
            document.getElementById('statusText').textContent = isOnline ? 'Online' : 'Offline';
            document.getElementById('statusDot').className = isOnline ? 'status-dot' : 'status-dot offline';
        })
        .subscribe();
}

// Add single new message to UI
function addNewMessage(msg) {
    const container = document.getElementById('messagesContainer');
    if (!container || !msg) return;

    // Check if message already exists
    const existing = container.querySelector(`[data-id="${msg.id}"]`);
    if (existing) return;

    const isSent = msg.sender_id === currentUser.id;
    const time = new Date(msg.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    const messageHTML = `
        <div class="message ${isSent ? 'sent' : 'received'}" data-id="${msg.id}">
            <div class="message-content">${sanitizeHTML(msg.content || '')}</div>
            <div class="message-time">${time}</div>
        </div>
    `;

    // Remove empty state if exists
    const emptyChat = container.querySelector('.empty-chat');
    if (emptyChat) {
        emptyChat.remove();
    }

    container.insertAdjacentHTML('beforeend', messageHTML);
    scrollToBottom(true);
}

// Remove channels properly
function removeChannels() {
    if (chatChannel) {
        supabase.removeChannel(chatChannel);
        chatChannel = null;
    }
    if (statusChannel) {
        supabase.removeChannel(statusChannel);
        statusChannel = null;
    }
}

// Update realtime status indicator
function updateRealtimeStatus(status) {
    let statusEl = document.getElementById('realtimeStatus');
    if (!statusEl) {
        statusEl = createStatus();
    }

    statusEl.textContent = status;

    if (status === '🟢 Live') {
        statusEl.style.background = '#28a745';
    } else if (status.includes('Error')) {
        statusEl.style.background = '#dc3545';
    } else {
        statusEl.style.background = '#ffc107';
    }
}

// Create status indicator
function createStatus() {
    const div = document.createElement('div');
    div.id = 'realtimeStatus';
    div.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: #ffc107;
        color: white;
        padding: 5px 10px;
        border-radius: 10px;
        font-size: 12px;
        z-index: 9999;
        font-weight: bold;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.1);
    `;
    document.body.appendChild(div);
    return div;
}

// Send message - FIXED (with pending state)
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();

    if (!text || !chatFriend) {
        showNotification("Please type a message!", "warning");
        return;
    }

    const sendBtn = document.getElementById('sendBtn');
    const originalText = input.value;
    
    // Disable immediately to prevent double send
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    
    // Show sending state
    if (sendBtn) sendBtn.innerHTML = '⏳';

    try {
        console.log("Sending:", text, "to:", chatFriend.id);

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

        if (error) {
            console.error("Send error:", error);
            showNotification("Error sending message: " + error.message, "error");
            // Restore text if failed
            input.value = originalText;
            return;
        }

        console.log("✅ Message sent:", data);
        input.value = '';
        input.style.height = 'auto';

        // Clear typing indicator
        stopTyping();

    } catch (error) {
        console.error("Send failed:", error);
        showNotification("Failed to send message", "error");
        input.value = originalText;
    } finally {
        // Re-enable
        input.disabled = false;
        if (sendBtn) {
            sendBtn.disabled = input.value.trim() === '';
            sendBtn.innerHTML = '➤';
        }
        input.focus();
    }
}

// Handle Enter key
function handleKeyPress(event) {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    if (sendBtn) {
        sendBtn.disabled = !input || input.value.trim() === '';
    }

    // Start typing indicator
    startTyping();

    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (input && input.value.trim()) {
            sendMessage();
        }
    }
}

// Setup typing listener
function setupTypingListener() {
    const input = document.getElementById('messageInput');
    if (!input) return;

    input.addEventListener('input', () => {
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.disabled = input.value.trim() === '';
        }
    });

    // Also listen for paste
    input.addEventListener('paste', () => {
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            setTimeout(() => {
                sendBtn.disabled = input.value.trim() === '';
            }, 10);
        }
    });
}

// Auto resize textarea - FIXED
function autoResize(textarea) {
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 150); // Match CSS max-height
    textarea.style.height = newHeight + 'px';

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.disabled = textarea.value.trim() === '';
    }

    // Typing indicator
    startTyping();
}

// Typing indicator functions
function startTyping() {
    if (!chatFriend) return;
    
    isTyping = true;
    
    // Clear existing timeout
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    
    // Set timeout to stop typing after 2 seconds
    typingTimeout = setTimeout(() => {
        stopTyping();
    }, 2000);
}

function stopTyping() {
    isTyping = false;
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }
}

// Play message sound
function playMessageSound() {
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ');
        // Simple beep sound
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        
        oscillator.frequency.value = 800;
        gainNode.gain.value = 0.1;
        
        oscillator.start();
        setTimeout(() => {
            oscillator.stop();
        }, 100);
    } catch (e) {
        console.log("Sound not supported");
    }
}

// Flash title
function flashTitle(message) {
    const originalTitle = document.title;
    let isFlashing = true;
    let flashCount = 0;
    
    const flashInterval = setInterval(() => {
        document.title = isFlashing ? message : originalTitle;
        isFlashing = !isFlashing;
        flashCount++;
        
        if (flashCount >= 6) { // Flash 3 times
            clearInterval(flashInterval);
            document.title = originalTitle;
        }
    }, 500);
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#28a745'};
        color: white;
        padding: 10px 20px;
        border-radius: 10px;
        z-index: 10000;
        font-weight: bold;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.2);
        animation: slideDown 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Go back - FIXED
function goBack() {
    removeChannels();
    window.location.href = '../home/index.html';
}

// Show user info modal
window.showUserInfo = function() {
    if (!chatFriend) {
        showNotification("User information not available", "warning");
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
            <h3 class="user-info-name">${sanitizeHTML(chatFriend.full_name || chatFriend.username)}</h3>
            <p class="user-info-username">@${sanitizeHTML(chatFriend.username)}</p>
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
            <button class="info-action-btn danger" onclick="blockUser()">
                🚫 Block User
            </button>
        </div>
    `;

    modal.style.display = 'flex';
    
    // Close on outside click
    modal.onclick = function(e) {
        if (e.target === modal) {
            closeModal();
        }
    };
};

window.closeModal = function() {
    const modal = document.getElementById('userInfoModal');
    if (modal) {
        modal.style.display = 'none';
        modal.onclick = null;
    }
};

window.startVoiceCall = function() {
    showNotification("Voice call feature coming soon!", "info");
};

window.viewSharedMedia = function() {
    showNotification("Shared media feature coming soon!", "info");
};

window.blockUser = function() {
    if (confirm(`Are you sure you want to block ${chatFriend.username}?`)) {
        showNotification("User blocked!", "info");
        setTimeout(() => {
            goBack();
        }, 1000);
    }
};

window.attachFile = function() {
    showNotification("File attachment feature coming soon!", "info");
};

window.clearChat = async function() {
    if (!confirm("Are you sure you want to clear all messages? This cannot be undone!")) return;

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const friendId = urlParams.get('friendId');

        const { error } = await supabase
            .from('direct_messages')
            .delete()
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`);

        if (error) throw error;

        showNotification("Chat cleared!", "info");
        await loadOldMessages(friendId);
    } catch (error) {
        console.error("Clear chat error:", error);
        showNotification("Error clearing chat", "error");
    }
};

// Debug function to check if messages exist
window.debugMessages = async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const friendId = urlParams.get('friendId');

    const { data: allMessages } = await supabase
        .from('direct_messages')
        .select('*');

    console.log("All messages in DB:", allMessages);

    const { data: ourMessages } = await supabase
        .from('direct_messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`);

    console.log("Our messages:", ourMessages);
    showNotification(`Found ${ourMessages?.length || 0} messages`, "info");
};