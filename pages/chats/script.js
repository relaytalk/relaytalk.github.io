import { auth } from '../../utils/auth.js'
import { supabase } from '../../utils/supabase.js'

console.log("✨ Chat Loaded - Clean Version");

let currentUser = null;
let chatFriend = null;
let chatChannel = null;
let statusChannel = null;

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

        // Load old messages
        await loadMessages(friendId);

        // Setup realtime
        setupRealtime(friendId);

        console.log("✅ Chat ready");

    } catch (error) {
        console.error("Init error:", error);
        alert("Error loading chat: " + error.message);
        window.location.href = '../home/index.html';
    }
});

// Load messages - FIXED with proper filtering
async function loadMessages(friendId) {
    try {
        console.log("Loading messages...");

        // Get messages between these two users only
        const { data: messages, error } = await supabase
            .from('direct_messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });

        if (error) throw error;

        console.log("Loaded", messages?.length || 0, "messages");
        showMessages(messages || []);

    } catch (error) {
        console.error("Load error:", error);
        showMessages([]);
    }
}

// Show messages in UI - OPTIMIZED
function showMessages(messages) {
    const container = document.getElementById('messagesContainer');
    
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
        const time = formatTime(msg.created_at);
        const date = formatDate(msg.created_at);

        // Add date separator if date changed
        if (date !== lastDate) {
            html += `<div class="date-separator"><span>${date}</span></div>`;
            lastDate = date;
        }

        html += `
            <div class="message ${isSent ? 'sent' : 'received'}" data-id="msg-${msg.id}">
                <div class="message-content">${escapeHtml(msg.content || '')}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
    });

    container.innerHTML = html;
    
    // Scroll to bottom
    scrollToBottom();
}

// Helper: Format time
function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).replace(' AM', 'am').replace(' PM', 'pm');
}

// Helper: Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString([], {
            month: 'short',
            day: 'numeric'
        });
    }
}

// Helper: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// REAL-TIME SETUP - FIXED FILTER
function setupRealtime(friendId) {
    console.log("Setting up realtime for chat:", friendId);

    // Remove old channels if they exist
    if (chatChannel) {
        supabase.removeChannel(chatChannel);
    }
    if (statusChannel) {
        supabase.removeChannel(statusChannel);
    }

    // Create message channel with PROPER filter
    chatChannel = supabase.channel(`dm-${currentUser.id}-${friendId}`, {
        config: {
            broadcast: { self: true }
        }
    })
    .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `(sender_id=eq.${currentUser.id} and receiver_id=eq.${friendId}) or (sender_id=eq.${friendId} and receiver_id=eq.${currentUser.id})`
    }, async (payload) => {
        console.log("📨 Realtime: New message detected:", payload.new);
        
        // Check if this is our message (optimistic update already shown)
        const container = document.getElementById('messagesContainer');
        const tempMsg = container.querySelector(`[data-id="temp-${payload.new.content}"]`);
        if (tempMsg) {
            // Replace temp message with real one
            tempMsg.setAttribute('data-id', `msg-${payload.new.id}`);
            return;
        }
        
        // Check if message already exists
        const existingMsg = container.querySelector(`[data-id="msg-${payload.new.id}"]`);
        if (existingMsg) {
            console.log("Message already displayed, skipping");
            return;
        }
        
        // Remove empty state
        const emptyChat = container.querySelector('.empty-chat');
        if (emptyChat) emptyChat.remove();
        
        // Add new message
        appendMessage(payload.new);
        
        // Notification if message is from friend
        if (payload.new.sender_id !== currentUser.id) {
            notifyNewMessage();
        }
    })
    .subscribe((status) => {
        console.log("📡 Realtime subscription status:", status);
        updateConnectionStatus(status);
    });

    // Create status channel
    statusChannel = supabase.channel(`status-${friendId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${friendId}`
        }, (payload) => {
            console.log("Friend status updated:", payload.new.status);
            chatFriend.status = payload.new.status;
            
            const isOnline = payload.new.status === 'online';
            document.getElementById('statusText').textContent = isOnline ? 'Online' : 'Offline';
            document.getElementById('statusDot').className = isOnline ? 'status-dot' : 'status-dot offline';
        })
        .subscribe();
}

// Append single message - FIXED SCROLLING
function appendMessage(msg) {
    const container = document.getElementById('messagesContainer');
    const isSent = msg.sender_id === currentUser.id;
    const time = formatTime(msg.created_at);
    const date = formatDate(msg.created_at);
    
    // Get last message to check date
    const messages = container.querySelectorAll('.message:not(.empty-chat)');
    let lastDate = '';
    
    if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const lastMsgDate = formatDate(msg.created_at); // Simplified for demo
        lastDate = lastMsgDate;
    }
    
    // Add date separator if needed
    if (date !== lastDate && messages.length > 0) {
        const dateSeparator = document.createElement('div');
        dateSeparator.className = 'date-separator';
        dateSeparator.innerHTML = `<span>${date}</span>`;
        container.appendChild(dateSeparator);
    }
    
    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    messageDiv.setAttribute('data-id', `msg-${msg.id || 'temp-' + Date.now()}`);
    messageDiv.innerHTML = `
        <div class="message-content">${escapeHtml(msg.content || '')}</div>
        <div class="message-time">${time}</div>
    `;
    
    container.appendChild(messageDiv);
    
    // Smart scroll: only if user is near bottom
    const isNearBottom = container.scrollHeight - container.clientHeight - container.scrollTop < 100;
    if (isNearBottom) {
        scrollToBottom();
    }
}

// Smart scroll to bottom
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    setTimeout(() => {
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
    }, 50);
}

// New message notification
function notifyNewMessage() {
    const originalTitle = document.title;
    if (!document.title.startsWith("💬")) {
        document.title = "💬 " + originalTitle;
        setTimeout(() => {
            document.title = originalTitle;
        }, 2000);
    }
}

// Update connection status
function updateConnectionStatus(status) {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;
    
    const statusDot = statusEl.querySelector('.status-dot');
    const statusText = statusEl.querySelector('.status-text');
    
    statusEl.className = 'connection-status';
    
    if (status === 'SUBSCRIBED') {
        statusEl.classList.add('connected');
        statusText.textContent = 'Connected';
        if (statusDot) statusDot.style.background = '#28a745';
        
        // Hide after 2 seconds
        setTimeout(() => {
            statusEl.style.opacity = '0';
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 300);
        }, 2000);
        
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        statusEl.classList.add('error');
        statusText.textContent = 'Connection lost';
        if (statusDot) statusDot.style.background = '#dc3545';
        statusEl.style.display = 'flex';
        statusEl.style.opacity = '1';
        
        // Retry after 5 seconds
        setTimeout(() => {
            const urlParams = new URLSearchParams(window.location.search);
            const friendId = urlParams.get('friendId');
            if (friendId) setupRealtime(friendId);
        }, 5000);
        
    } else {
        statusText.textContent = 'Connecting...';
        if (statusDot) statusDot.style.background = '#ffc107';
        statusEl.style.display = 'flex';
        statusEl.style.opacity = '1';
    }
}

// Send message - OPTIMIZED with optimistic update
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text || !chatFriend) return;
    
    const sendBtn = document.getElementById('sendBtn');
    const originalText = input.value;
    
    // Clear input immediately
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    sendBtn.classList.add('sending');
    
    try {
        // Create optimistic message
        const tempId = 'temp-' + Date.now();
        const tempMessage = {
            id: tempId,
            sender_id: currentUser.id,
            receiver_id: chatFriend.id,
            content: originalText,
            created_at: new Date().toISOString()
        };
        
        // Show optimistic update
        appendMessage(tempMessage);
        
        // Send to server
        const { data, error } = await supabase
            .from('direct_messages')
            .insert({
                sender_id: currentUser.id,
                receiver_id: chatFriend.id,
                content: originalText,
                created_at: new Date().toISOString()
            });
        
        if (error) throw error;
        
        console.log("✅ Message sent to server");
        
    } catch (error) {
        console.error("Send error:", error);
        alert("Failed to send message. Please try again.");
        
        // Restore message to input
        input.value = originalText;
        autoResize(input);
    } finally {
        sendBtn.classList.remove('sending');
        sendBtn.disabled = input.value.trim() === '';
    }
}

// Handle Enter key
function handleKeyPress(event) {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    
    sendBtn.disabled = input.value.trim() === '';
    
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (input.value.trim()) {
            sendMessage();
        }
    }
}

// Auto resize textarea
function autoResize(textarea) {
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = newHeight + 'px';
    
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = textarea.value.trim() === '';
}

// Go back - Clean up
function goBack() {
    if (chatChannel) supabase.removeChannel(chatChannel);
    if (statusChannel) supabase.removeChannel(statusChannel);
    window.location.href = '../home/index.html';
}

// Show user info modal
window.showUserInfo = function() {
    if (!chatFriend) {
        alert("User information not available");
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
            <h3 class="user-info-name">${escapeHtml(chatFriend.full_name || chatFriend.username)}</h3>
            <p class="user-info-username">@${escapeHtml(chatFriend.username)}</p>
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
};

// Close modal
window.closeModal = function() {
    const modal = document.getElementById('userInfoModal');
    if (modal) modal.style.display = 'none';
};

// Stub functions for demo
window.startVoiceCall = function() {
    alert("Voice call feature coming soon!");
};

window.viewSharedMedia = function() {
    alert("Shared media feature coming soon!");
};

window.blockUser = function() {
    if (confirm(`Are you sure you want to block ${chatFriend.username}?`)) {
        alert("User blocked!");
        goBack();
    }
};

window.attachFile = function() {
    alert("File attachment feature coming soon!");
};

// Clear chat
window.clearChat = async function() {
    if (!confirm("Are you sure you want to clear all messages?")) return;
    
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const friendId = urlParams.get('friendId');
        
        const { error } = await supabase
            .from('direct_messages')
            .delete()
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`);
        
        if (error) throw error;
        
        showMessages([]);
        
    } catch (error) {
        console.error("Clear chat error:", error);
        alert("Error clearing chat");
    }
};

// Export functions for global access
window.sendMessage = sendMessage;
window.handleKeyPress = handleKeyPress;
window.autoResize = autoResize;
window.goBack = goBack;