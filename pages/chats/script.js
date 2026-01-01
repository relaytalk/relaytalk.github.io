// Chat Page Script - WITH FIXED REALTIME UPDATES
import { auth } from '../../utils/auth.js'
import { supabase } from '../../utils/supabase.js'

console.log("✨ Luster Chat Page Loaded");

let currentUser = null;
let chatFriend = null;
let messages = [];
let chatChannel = null;

// Initialize chat page
async function initChatPage() {
    console.log("Initializing chat page...");

    // Check if user is logged in
    const { success, user } = await auth.getCurrentUser();

    if (!success || !user) {
        alert("Please login first!");
        window.location.href = '../auth/index.html';
        return;
    }

    currentUser = user;
    console.log("Logged in as:", currentUser.email);

    // Get friend ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const friendId = urlParams.get('friendId');

    if (!friendId) {
        alert("No friend selected!");
        window.location.href = '../home/index.html';
        return;
    }

    // Load friend data
    await loadFriendData(friendId);

    // Load messages
    await loadMessages(friendId);

    // Set up event listeners
    setupEventListeners();

    // Setup real-time listener
    setupRealtimeListener(friendId);

    console.log("Chat page initialized");
}

// Load friend data
async function loadFriendData(friendId) {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', friendId)
            .single();

        if (error) throw error;

        chatFriend = profile;
        console.log("Chatting with:", profile.username);

        // Update UI
        updateChatHeader();

    } catch (error) {
        console.error("Error loading friend:", error);
        alert("Error loading friend data!");
        window.location.href = '../home/index.html';
    }
}

// Update chat header
function updateChatHeader() {
    if (!chatFriend) return;

    // Update friend name
    const chatUserName = document.getElementById('chatUserName');
    if (chatUserName) {
        chatUserName.textContent = chatFriend.username;
    }

    // Update avatar
    const chatUserAvatar = document.getElementById('chatUserAvatar');
    if (chatUserAvatar) {
        const firstLetter = chatFriend.username.charAt(0).toUpperCase();
        chatUserAvatar.textContent = firstLetter;
        chatUserAvatar.style.background = 'linear-gradient(45deg, #667eea, #764ba2)';
    }

    // Update status
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');

    if (statusText && statusDot) {
        const isOnline = chatFriend.status === 'online';
        statusText.textContent = isOnline ? 'Online' : 'Offline';
        statusDot.className = isOnline ? 'status-dot' : 'status-dot offline';
    }
}

// Load messages from direct_messages table
async function loadMessages(friendId) {
    if (!currentUser || !friendId) return;

    try {
        // Get all messages between current user and friend
        const { data: allMessages, error } = await supabase
            .from('direct_messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });

        if (error) {
            console.log("Using alternative query...");
            // Fallback: two separate queries
            const [messagesToFriend, messagesFromFriend] = await Promise.all([
                supabase
                    .from('direct_messages')
                    .select('*')
                    .eq('sender_id', currentUser.id)
                    .eq('receiver_id', friendId),
                supabase
                    .from('direct_messages')
                    .select('*')
                    .eq('sender_id', friendId)
                    .eq('receiver_id', currentUser.id)
            ]);

            const combined = [
                ...(messagesToFriend.data || []),
                ...(messagesFromFriend.data || [])
            ];
            
            messages = combined.sort((a, b) => 
                new Date(a.created_at) - new Date(b.created_at)
            );
        } else {
            messages = allMessages || [];
        }

        console.log("Loaded", messages.length, "messages");

        // Display messages
        displayMessages();

        // Scroll to bottom
        setTimeout(() => {
            scrollToBottom();
        }, 100);

    } catch (error) {
        console.error("Error loading messages:", error);
        messages = [];
        displayMessages();
    }
}

// Display messages
function displayMessages() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    if (messages.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <div class="empty-chat-icon">💬</div>
                <h3>No messages yet</h3>
                <p style="margin-top: 10px;">Start the conversation!</p>
            </div>
        `;
        return;
    }

    let html = '';
    let lastDate = null;
    
    messages.forEach((message) => {
        // Date separator
        const messageDate = new Date(message.created_at).toDateString();
        if (messageDate !== lastDate) {
            const dateStr = formatDate(message.created_at);
            html += `
                <div class="date-separator">
                    <span>${dateStr}</span>
                </div>
            `;
            lastDate = messageDate;
        }

        const isSent = message.sender_id === currentUser.id;
        const time = formatTime(message.created_at);

        html += `
            <div class="message ${isSent ? 'sent' : 'received'}">
                <div class="message-content">
                    ${message.content || ''}
                </div>
                <div class="message-time">
                    ${time}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Format date for separator
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'short', 
            day: 'numeric' 
        });
    }
}

// Format time for message
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    }).toLowerCase();
}

// Send message to direct_messages table
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();

    if (!text || !chatFriend) {
        alert("Please enter a message!");
        return;
    }

    try {
        // Create message in direct_messages table
        const { data: newMessage, error } = await supabase
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
            console.error("Supabase error:", error);
            throw error;
        }

        // Add to local messages array
        messages.push(newMessage);

        // Clear input
        input.value = '';
        input.style.height = 'auto';
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.disabled = true;

        // Display messages
        displayMessages();

        // Scroll to bottom
        scrollToBottom();

        console.log("Message sent successfully!");

    } catch (error) {
        console.error("Error sending message:", error);
        alert("Could not send message. Please try again.");
    }
}

// Setup real-time listener for new messages - FIXED VERSION
function setupRealtimeListener(friendId) {
    if (!friendId || !currentUser) return;

    console.log("Setting up real-time listener for friend:", friendId);

    // Clean up previous channel if exists
    if (chatChannel) {
        supabase.removeChannel(chatChannel);
    }

    // Create new channel - listen to ALL messages in direct_messages table
    chatChannel = supabase
        .channel('direct-messages-channel')
        .on('postgres_changes', 
            { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'direct_messages'
            },
            (payload) => {
                console.log("Realtime update received:", payload.new);
                
                const message = payload.new;
                
                // Check if this message is between current user and friend
                const isMessageForThisChat = 
                    (message.sender_id === currentUser.id && message.receiver_id === friendId) ||
                    (message.sender_id === friendId && message.receiver_id === currentUser.id);
                
                if (isMessageForThisChat) {
                    // Check if message is not already in array
                    if (!messages.some(m => m.id === message.id)) {
                        console.log("Adding new message to chat:", message);
                        messages.push(message);
                        
                        // Sort messages by time
                        messages.sort((a, b) => 
                            new Date(a.created_at) - new Date(b.created_at)
                        );
                        
                        displayMessages();
                        scrollToBottom();
                    }
                }
            }
        )
        .on('postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'direct_messages'
            },
            (payload) => {
                // Handle message updates if needed
                console.log("Message updated:", payload.new);
            }
        )
        .subscribe((status) => {
            console.log("Realtime subscription status:", status);
        });
}

// Handle key press
function handleKeyPress(event) {
    const sendBtn = document.getElementById('sendBtn');
    const input = document.getElementById('messageInput');

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

// Auto-resize textarea
function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.disabled = textarea.value.trim() === '';
    }
}

// Scroll to bottom
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

// Go back to home
function goBack() {
    // Clean up realtime channel
    if (chatChannel) {
        supabase.removeChannel(chatChannel);
        chatChannel = null;
    }
    window.location.href = '../home/index.html';
}

// Show user info modal - UPDATED WITHOUT VOICE CALL & SHARED MEDIA
function showUserInfo() {
    if (!chatFriend) return;

    const modal = document.getElementById('userInfoModal');
    const content = document.getElementById('userInfoContent');

    if (!modal || !content) return;

    const isOnline = chatFriend.status === 'online';

    content.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <div style="width: 80px; height: 80px; background: linear-gradient(45deg, #667eea, #764ba2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: bold; margin: 0 auto 15px;">
                ${chatFriend.username.charAt(0).toUpperCase()}
            </div>
            <h3 style="margin-bottom: 5px;">${chatFriend.username}</h3>
            <p style="color: #a0a0c0; margin-bottom: 10px;">${chatFriend.full_name || ''}</p>
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span class="status-dot ${isOnline ? '' : 'offline'}" style="margin: 0;"></span>
                <span>${isOnline ? 'Online' : 'Offline'}</span>
            </div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 20px;">
            <button onclick="blockUser()" style="padding: 12px; background: rgba(220, 53, 69, 0.2); border: 1px solid rgba(220, 53, 69, 0.3); border-radius: 10px; color: #dc3545; cursor: pointer;">
                🚫 Block User
            </button>
            <button onclick="clearChat()" style="padding: 12px; background: rgba(255, 193, 7, 0.2); border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 10px; color: #ffc107; cursor: pointer;">
                🗑️ Clear Chat
            </button>
        </div>
    `;

    modal.style.display = 'flex';
}

// Close modal
function closeModal() {
    const modal = document.getElementById('userInfoModal');
    if (modal) modal.style.display = 'none';
}

// Set up event listeners
function setupEventListeners() {
    // Close modal when clicking outside
    window.onclick = function(event) {
        const modal = document.getElementById('userInfoModal');
        if (modal && event.target === modal) {
            closeModal();
        }
    };

    // Escape key closes modal
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeModal();
        }
    });

    // Auto-focus on message input
    setTimeout(() => {
        const input = document.getElementById('messageInput');
        if (input) {
            input.focus();
            input.value = '';
        }
    }, 500);

    // Clean up channel on page unload
    window.addEventListener('beforeunload', () => {
        if (chatChannel) {
            supabase.removeChannel(chatChannel);
        }
    });
}

// Placeholder functions
function attachFile() {
    alert("File attachment coming soon!");
}

function blockUser() {
    if (chatFriend && confirm(`Block ${chatFriend.username}? You won't be able to message each other.`)) {
        alert(`${chatFriend.username} has been blocked.`);
        closeModal();
        goBack();
    }
}

function clearChat() {
    if (!chatFriend || !confirm("Clear all messages in this chat? This cannot be undone.")) {
        return;
    }
    
    // Note: In production, you would delete from database
    // For now, just clear local messages
    messages = [];
    displayMessages();
    closeModal();
}

// Make functions available globally
window.sendMessage = sendMessage;
window.handleKeyPress = handleKeyPress;
window.autoResize = autoResize;
window.goBack = goBack;
window.showUserInfo = showUserInfo;
window.closeModal = closeModal;
window.attachFile = attachFile;
window.clearChat = clearChat;
window.blockUser = blockUser;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initChatPage);