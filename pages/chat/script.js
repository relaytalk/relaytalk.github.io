// Chat Page Script - UPDATED FOR SUPABASE
import { auth } from '../../utils/auth.js'
import { supabase } from '../../utils/supabase.js'

console.log("✨ Luster Chat Page Loaded (Supabase Version)");

let currentUser = null;
let currentConversationId = null;
let chatFriend = null;
let messages = [];
let isTyping = false;

// Initialize chat page
async function initChatPage() {
    console.log("Initializing chat page with Supabase...");

    // Check if user is logged in
    const { success, user } = await auth.getCurrentUser();
    
    if (!success || !user) {
        // No user found, redirect to auth
        alert("Please login first!");
        window.location.href = '../auth/index.html';
        return;
    }

    currentUser = user;
    console.log("Logged in as:", currentUser.email);

    // Get conversation ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const conversationId = urlParams.get('conversation');

    if (!conversationId) {
        // No conversation specified
        alert("No conversation selected!");
        window.location.href = '../home/index.html';
        return;
    }

    currentConversationId = conversationId;

    // Load conversation data
    await loadConversationData(conversationId);

    // Load messages
    await loadMessages();

    // Set up event listeners
    setupEventListeners();

    // Setup real-time listeners
    setupRealtimeListeners();

    console.log("Chat page initialized");
}

// Load conversation data
async function loadConversationData(conversationId) {
    try {
        // Get conversation info and other participant
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select(`
                *,
                participants (
                    user_id,
                    profiles:user_id (
                        username,
                        full_name,
                        avatar_url,
                        status
                    )
                )
            `)
            .eq('id', conversationId)
            .single();

        if (convError) throw convError;

        // Find the other participant (not current user)
        const otherParticipant = conversation.participants.find(
            p => p.user_id !== currentUser.id
        );

        if (!otherParticipant || !otherParticipant.profiles) {
            alert("Conversation participant not found!");
            window.location.href = '../home/index.html';
            return;
        }

        chatFriend = {
            id: otherParticipant.user_id,
            username: otherParticipant.profiles.username,
            full_name: otherParticipant.profiles.full_name,
            avatar_url: otherParticipant.profiles.avatar_url,
            status: otherParticipant.profiles.status
        };

        // Update UI with friend data
        updateChatHeader();
        
    } catch (error) {
        console.error("Error loading conversation:", error);
        alert("Error loading conversation. Please try again.");
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
        if (chatFriend.avatar_url) {
            chatUserAvatar.innerHTML = `<img src="${chatFriend.avatar_url}" alt="${chatFriend.username}">`;
        } else {
            // Fallback: first letter
            const firstLetter = chatFriend.username.charAt(0).toUpperCase();
            chatUserAvatar.textContent = firstLetter;
            chatUserAvatar.style.background = 'linear-gradient(45deg, #667eea, #764ba2)';
        }
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

// Load messages from Supabase
async function loadMessages() {
    if (!currentConversationId) return;

    try {
        const { data: chatMessages, error } = await supabase
            .from('messages')
            .select(`
                *,
                sender:profiles!messages_sender_id_fkey (
                    username,
                    avatar_url
                )
            `)
            .eq('conversation_id', currentConversationId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        messages = chatMessages || [];
        
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
        // Show empty state
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
        // Check if we need a date separator
        const messageDate = new Date(message.created_at).toDateString();
        if (messageDate !== lastDate) {
            html += `
                <div class="date-separator">
                    <span>${formatDate(message.created_at)}</span>
                </div>
            `;
            lastDate = messageDate;
        }

        const isSent = message.sender_id === currentUser.id;
        const time = formatTime(message.created_at);

        html += `
            <div class="message ${isSent ? 'sent' : 'received'}" 
                 data-message-id="${message.id}">
                <div class="message-content">
                    ${message.content || ''}
                    ${message.attachment_url ? `
                        <img src="${message.attachment_url}" class="message-image" 
                             onclick="viewImage('${message.attachment_url}')">
                    ` : ''}
                </div>
                <div class="message-time">
                    ${time}
                    ${isSent ? `
                        <div class="message-status">
                            ${message.read_by && message.read_by.includes(chatFriend?.id) ? '✓✓' : '✓'}
                        </div>
                    ` : ''}
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

// Send message via Supabase
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();

    if (!text || !currentConversationId || !chatFriend) return;

    try {
        // Create message in Supabase
        const { data: newMessage, error } = await supabase
            .from('messages')
            .insert({
                conversation_id: currentConversationId,
                sender_id: currentUser.id,
                content: text,
                message_type: 'text',
                read_by: [currentUser.id] // Mark as read by sender
            })
            .select()
            .single();

        if (error) throw error;

        // Add to local messages array
        messages.push({
            ...newMessage,
            sender: { username: currentUser.user_metadata?.username }
        });

        // Clear input
        input.value = '';
        input.style.height = 'auto';
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.disabled = true;

        // Display messages (will be updated via realtime anyway)
        displayMessages();

        // Scroll to bottom
        scrollToBottom();

        console.log("Message sent:", newMessage);
        
    } catch (error) {
        console.error("Error sending message:", error);
        alert("Could not send message. Please try again.");
    }
}

// Handle key press
function handleKeyPress(event) {
    const sendBtn = document.getElementById('sendBtn');
    const input = document.getElementById('messageInput');

    // Enable/disable send button
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

    // Enable/disable send button
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
    window.location.href = '../home/index.html';
}

// Show user info modal
function showUserInfo() {
    if (!chatFriend) return;

    const modal = document.getElementById('userInfoModal');
    const content = document.getElementById('userInfoContent');

    if (!modal || !content) return;

    const isOnline = chatFriend.status === 'online';

    content.innerHTML = `
        <div class="user-info-avatar">
            ${chatFriend.avatar_url ? 
                `<img src="${chatFriend.avatar_url}" alt="${chatFriend.username}">` : 
                chatFriend.username.charAt(0).toUpperCase()
            }
        </div>
        
        <div class="user-info-details">
            <h3 class="user-info-name">${chatFriend.username}</h3>
            <p class="user-info-username">${chatFriend.full_name || ''}</p>
            <div class="user-info-status">
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
}

// Close modal
function closeModal() {
    const modal = document.getElementById('userInfoModal');
    if (modal) modal.style.display = 'none';
}

// Setup realtime listeners
function setupRealtimeListeners() {
    if (!currentConversationId) return;

    // Listen for new messages
    supabase
        .channel(`messages:${currentConversationId}`)
        .on('postgres_changes', 
            { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages',
                filter: `conversation_id=eq.${currentConversationId}`
            },
            async (payload) => {
                console.log("New message received:", payload.new);
                
                // Get sender info for the new message
                const { data: sender } = await supabase
                    .from('profiles')
                    .select('username, avatar_url')
                    .eq('id', payload.new.sender_id)
                    .single();

                // Add to messages array
                messages.push({
                    ...payload.new,
                    sender: sender || { username: 'Unknown' }
                });

                // Display messages
                displayMessages();

                // Scroll to bottom
                scrollToBottom();

                // Mark as read if it's from the other person
                if (payload.new.sender_id !== currentUser.id) {
                    markMessageAsRead(payload.new.id);
                }
            }
        )
        .subscribe();

    // Listen for message updates (read receipts)
    supabase
        .channel(`messages-updates:${currentConversationId}`)
        .on('postgres_changes', 
            { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'messages',
                filter: `conversation_id=eq.${currentConversationId}`
            },
            (payload) => {
                console.log("Message updated:", payload.new);
                
                // Update message in array
                const index = messages.findIndex(m => m.id === payload.new.id);
                if (index !== -1) {
                    messages[index] = payload.new;
                    displayMessages();
                }
            }
        )
        .subscribe();

    // Listen for user status changes
    if (chatFriend) {
        supabase
            .channel(`user-status:${chatFriend.id}`)
            .on('postgres_changes', 
                { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'profiles',
                    filter: `id=eq.${chatFriend.id}`
                },
                (payload) => {
                    console.log("User status updated:", payload.new);
                    chatFriend.status = payload.new.status;
                    updateChatHeader();
                }
            )
            .subscribe();
    }
}

// Mark message as read
async function markMessageAsRead(messageId) {
    try {
        // Get current read_by array
        const { data: message, error: getError } = await supabase
            .from('messages')
            .select('read_by')
            .eq('id', messageId)
            .single();

        if (getError) throw getError;

        // Add current user to read_by if not already there
        const readBy = message.read_by || [];
        if (!readBy.includes(currentUser.id)) {
            readBy.push(currentUser.id);

            const { error: updateError } = await supabase
                .from('messages')
                .update({ read_by: readBy })
                .eq('id', messageId);

            if (updateError) throw updateError;
        }
        
    } catch (error) {
        console.error("Error marking message as read:", error);
    }
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
        if (input) input.focus();
    }, 500);

    // Logout button (if exists)
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await auth.signOut();
                window.location.href = '../auth/index.html';
            } catch (error) {
                console.error("Error logging out:", error);
                alert("Error logging out. Please try again.");
            }
        });
    }
}

// Placeholder functions (for future features)
function attachFile() {
    alert("File attachment feature coming soon!\n\nYou'll be able to send:\n• Images\n• Documents\n• Voice messages");
}

function startVoiceCall() {
    alert("Voice call feature coming soon!");
    closeModal();
}

function viewSharedMedia() {
    alert("Shared media feature coming soon!");
    closeModal();
}

function blockUser() {
    if (chatFriend && confirm(`Block ${chatFriend.username}? You won't receive messages from them.`)) {
        alert(`${chatFriend.username} has been blocked.`);
        closeModal();
        goBack();
    }
}

function viewImage(imageUrl) {
    window.open(imageUrl, '_blank');
}

function clearChat() {
    if (!chatFriend || !confirm("Clear all messages in this chat? This cannot be undone.")) {
        return;
    }
    alert("Clear chat feature will be available in the database admin panel.");
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
window.startVoiceCall = startVoiceCall;
window.viewSharedMedia = viewSharedMedia;
window.blockUser = blockUser;
window.viewImage = viewImage;
// Add these if not already there
window.togglePassword = togglePassword;
window.showTerms = showTerms;
window.showPrivacy = showPrivacy;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initChatPage);