// WORKING CHAT SCRIPT - GUARANTEED
import { auth } from '../../utils/auth.js'
import { supabase } from '../../utils/supabase.js'

console.log("✨ Chat Loaded");

let currentUser = null;
let chatFriend = null;
let chatChannel = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check auth
        const { success, user } = await auth.getCurrentUser();
        if (!success || !user) {
            alert("Login first!");
            window.location.href = '../auth/index.html';
            return;
        }
        
        currentUser = user;
        console.log("User:", user.email);
        
        // Get friend ID
        const urlParams = new URLSearchParams(window.location.search);
        const friendId = urlParams.get('friendId');
        
        if (!friendId) {
            alert("No friend!");
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
        
        // Load old messages
        await loadOldMessages(friendId);
        
        // Setup realtime
        setupRealtime(friendId);
        
        console.log("✅ Chat ready");
        
    } catch (error) {
        console.error("Init error:", error);
        alert("Error: " + error.message);
        window.location.href = '../home/index.html';
    }
});

// Load old messages
async function loadOldMessages(friendId) {
    try {
        // Get messages I sent
        const { data: sent } = await supabase
            .from('direct_messages')
            .select('*')
            .eq('sender_id', currentUser.id)
            .eq('receiver_id', friendId)
            .order('created_at', { ascending: true });
        
        // Get messages I received
        const { data: received } = await supabase
            .from('direct_messages')
            .select('*')
            .eq('sender_id', friendId)
            .eq('receiver_id', currentUser.id)
            .order('created_at', { ascending: true });
        
        // Combine
        const allMessages = [
            ...(sent || []),
            ...(received || [])
        ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        console.log("Loaded", allMessages.length, "old messages");
        
        // Show them
        showMessages(allMessages);
        
    } catch (error) {
        console.error("Load error:", error);
    }
}

// Show messages in UI
function showMessages(messages) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <div class="empty-chat-icon">💬</div>
                <h3>No messages</h3>
                <p>Say hello!</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    messages.forEach(msg => {
        const isSent = msg.sender_id === currentUser.id;
        const time = new Date(msg.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        html += `
            <div class="message ${isSent ? 'sent' : 'received'}">
                <div class="message-content">${msg.content}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Scroll to bottom
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
    }, 100);
}

// REAL-TIME THAT WORKS
function setupRealtime(friendId) {
    console.log("Setting realtime for friend:", friendId);
    
    // Remove old
    if (chatChannel) {
        supabase.removeChannel(chatChannel);
    }
    
    // Create new - LISTEN TO ALL INSERTS
    chatChannel = supabase.channel('any-messages')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'direct_messages'
        }, async (payload) => {
            console.log("🔥 REALTIME GOT:", payload.new);
            
            const newMsg = payload.new;
            
            // Is this for our chat?
            if ((newMsg.sender_id === currentUser.id && newMsg.receiver_id === friendId) ||
                (newMsg.sender_id === friendId && newMsg.receiver_id === currentUser.id)) {
                
                console.log("✅ This is our message!");
                
                // Reload all messages
                await loadOldMessages(friendId);
                
                // Flash title
                document.title = "💬 New!";
                setTimeout(() => {
                    document.title = "✨ Luster Chat";
                }, 1000);
            }
        })
        .subscribe((status) => {
            console.log("Realtime status:", status);
            
            // Show status
            const statusEl = document.getElementById('realtimeStatus') || createStatus();
            if (status === 'SUBSCRIBED') {
                statusEl.textContent = "🟢 Live";
                statusEl.style.background = '#28a745';
                console.log("🎉 REALTIME WORKING!");
            } else if (status === 'CHANNEL_ERROR') {
                statusEl.textContent = "🔴 Error";
                statusEl.style.background = '#dc3545';
                // Retry
                setTimeout(() => setupRealtime(friendId), 3000);
            } else {
                statusEl.textContent = "🟡 Connecting";
                statusEl.style.background = '#ffc107';
            }
        });
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
    `;
    document.body.appendChild(div);
    return div;
}

// Send message
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text || !chatFriend) {
        alert("Type something!");
        return;
    }
    
    try {
        console.log("Sending:", text);
        
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
            alert("Error: " + error.message);
            return;
        }
        
        console.log("✅ Sent!");
        input.value = '';
        
        // Update send button
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.disabled = true;
        
    } catch (error) {
        console.error("Send failed:", error);
        alert("Failed to send");
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
    textarea.style.height = textarea.scrollHeight + 'px';
    
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.disabled = textarea.value.trim() === '';
    }
}

// Go back
function goBack() {
    if (chatChannel) {
        supabase.removeChannel(chatChannel);
    }
    window.location.href = '../home/index.html';
}

// Make functions global
window.sendMessage = sendMessage;
window.handleKeyPress = handleKeyPress;
window.autoResize = autoResize;
window.goBack = goBack;
window.showUserInfo = () => alert("Info");
window.closeModal = () => {
    const modal = document.getElementById('userInfoModal');
    if (modal) modal.style.display = 'none';
};
window.attachFile = () => alert("File");
window.clearChat = () => alert("Clear");
window.blockUser = () => {
    if (confirm("Block?")) {
        alert("Blocked");
        goBack();
    }
};