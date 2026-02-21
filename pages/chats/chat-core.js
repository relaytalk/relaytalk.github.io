import { auth } from '../../utils/auth.js';
import { supabase } from '../../utils/supabase.js';

console.log('✨ Chat Core Initialized - MULTI-IMAGE VERSION');

// ====================
// CORE CHAT VARIABLES
// ====================
let currentUser = null;
let chatFriend = null;
let chatChannel = null;
let statusChannel = null;
let typingChannel = null;
let isLoadingMessages = false;
let currentMessages = [];
let isSending = false;
let isTyping = false;
let typingTimeout = null;
let friendTypingTimeout = null;
let typingIndicatorInterval = null;

// Global variables for coordination
window.colorPickerVisible = false;
window.currentMessages = currentMessages;
window.currentUser = null;
window.chatFriend = null;
window.isSending = false;
window.isTyping = false;
window.typingTimeout = null;
window.friendTypingTimeout = null;

// ====================
// GLOBAL FUNCTION EXPORTS
// ====================
window.sendMessage = sendMessage;
window.handleKeyPress = handleKeyPress;
window.autoResize = autoResize;
window.goBack = goBack;
window.showUserInfo = showUserInfo;
window.closeModal = closeModal;
window.blockUserPrompt = blockUserPrompt;
window.clearChatPrompt = clearChatPrompt;
window.playSentSound = playSentSound;
window.playReceivedSound = playReceivedSound;
window.showCustomAlert = showCustomAlert;
window.showConfirmAlert = showConfirmAlert;
window.showToast = showToast;
window.forceScrollToBottom = forceScrollToBottom;
window.scrollToBottom = scrollToBottom;
window.loadOldMessages = loadOldMessages;
window.showMessages = showMessages;
window.addMessageToUI = addMessageToUI;
window.setupRealtime = setupRealtime;
window.handleTyping = handleTyping;
window.sendTypingStatus = sendTypingStatus;
window.showLoading = showLoading;
window.refreshChat = refreshChat;
window.reconnectRealtime = reconnectRealtime;

// Export for img-handler
window.getCurrentUser = () => currentUser;
window.getChatFriend = () => chatFriend;
window.getSupabaseClient = () => supabase;

// Signal that core is loaded
if (window.chatModules) {
    window.chatModules.coreLoaded = true;
    console.log('✅ chat-core.js loaded and ready');
}

// ====================
// INITIALIZATION
//===================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('🔧 Initializing chat core...');

        // Check authentication
        const { success, user } = await auth.getCurrentUser();
        if (!success || !user) {
            console.log('❌ User not authenticated, showing login');
            showLoginScreen();
            return;
        }

        currentUser = user;
        window.currentUser = user;
        console.log('✅ Current User:', user.id);

        // Hide login, show chat interface
        document.getElementById("login").style.display = "none";
        document.getElementById("chat").style.display = "block";

        // Hide all overlays on load
        const overlays = ['customAlert', 'customToast', 'userInfoModal'];
        overlays.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Get friend ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const friendId = urlParams.get('friendId');

        if (!friendId) {
            showCustomAlert('No friend selected!', '😕', 'Error', () => {
                window.location.href = '../home/index.html';
            });
            return;
        }

        // 🔥 Load friend data WITH avatar_url
        const { data: friend, error: friendError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', friendId)
            .single();

        if (friendError) throw friendError;

        chatFriend = friend;
        window.chatFriend = friend;

        // 🔥 Update chat header WITH avatar (ONLY HERE - NOT IN MESSAGES)
        const chatUserAvatar = document.getElementById('chatUserAvatar');
        const friendInitial = friend.username ? friend.username.charAt(0).toUpperCase() : '?';
        
        if (friend.avatar_url) {
            chatUserAvatar.innerHTML = `<img src="${friend.avatar_url}" alt="${friend.username}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        } else {
            chatUserAvatar.textContent = friendInitial;
        }

        document.getElementById('chatUserName').textContent = friend.username;
        updateFriendStatus(friend.status);

        // Load messages
        await loadOldMessages(friendId);

        // Setup real-time and listeners
        setupRealtime(friendId);
        setupTypingListener();
        setupTypingIndicator();
        updateInputListener();

        // Prevent accidental back navigation
        setupBackButtonPrevention();

        // Initial setup
        setTimeout(() => {
            const input = document.getElementById('messageInput');
            if (input) {
                autoResize(input);
                setTimeout(() => {
                    input.focus();
                }, 100);
            }
            forceScrollToBottom();
        }, 100);

        console.log('✅ Chat core ready!');
    } catch (error) {
        console.error('Init error:', error);
        showCustomAlert('Error loading chat: ' + error.message, '❌', 'Error', () => {
            window.location.href = '../home/index.html';
        });
    }
});

// ====================
// LOGIN SCREEN
// ====================
function showLoginScreen() {
    console.log('Showing login screen...');
    document.getElementById("login").style.display = "block";
    document.getElementById("chat").style.display = "none";

    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');

    if (loginBtn) {
        loginBtn.onclick = () => {
            window.location.href = '../login/index.html';
        };
    }

    if (signupBtn) {
        signupBtn.onclick = () => {
            window.location.href = '../auth/index.html';
        };
    }
}

// ====================
// BACK BUTTON FIX
// ====================
function setupBackButtonPrevention() {
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) {
        backBtn.onclick = null;
        backBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            this.style.pointerEvents = 'none';
            setTimeout(() => {
                goBack();
                this.style.pointerEvents = 'auto';
            }, 150);
        });
    }
}

// ====================
// TYPING INDICATOR SETUP
// ====================
function setupTypingIndicator() {
    // Add typing indicator element if it doesn't exist
    if (!document.getElementById('typingIndicator')) {
        const indicator = document.createElement('div');
        indicator.id = 'typingIndicator';
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <div class="typing-dots">
                <div></div>
                <div></div>
                <div></div>
            </div>
            <span id="typingText">${chatFriend?.username || 'Friend'} is typing...</span>
        `;
        indicator.style.display = 'none';
        
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.appendChild(indicator);
        }
    }

    // Add CSS for typing indicator if not present
    if (!document.querySelector('#typing-indicator-style')) {
        const style = document.createElement('style');
        style.id = 'typing-indicator-style';
        style.textContent = `
            .typing-indicator {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 16px;
                margin: 8px 0;
                align-self: flex-start;
                background: rgba(255, 255, 255, 0.9);
                border: 1px solid rgba(0, 122, 204, 0.2);
                border-radius: 20px;
                border-bottom-left-radius: 5px;
                font-size: 0.9rem;
                color: #007acc;
                width: fit-content;
                animation: fadeIn 0.2s ease;
            }
            
            .typing-dots {
                display: flex;
                gap: 5px;
            }
            
            .typing-dots div {
                width: 8px;
                height: 8px;
                background: #007acc;
                border-radius: 50%;
                animation: typing 1.4s infinite;
            }
            
            .typing-dots div:nth-child(2) {
                animation-delay: 0.2s;
            }
            
            .typing-dots div:nth-child(3) {
                animation-delay: 0.4s;
            }
            
            @keyframes typing {
                0%, 60%, 100% { transform: translateY(0); opacity: 0.6; }
                30% { transform: translateY(-6px); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
}

function showTypingIndicator(show) {
    const indicator = document.getElementById('typingIndicator');
    if (!indicator) return;
    
    if (show) {
        indicator.style.display = 'flex';
        setTimeout(() => {
            forceScrollToBottom();
        }, 10);
    } else {
        indicator.style.display = 'none';
    }
}

// ====================
// TEXT MESSAGE FUNCTIONS
// ====================

async function sendMessage() {
    if (isSending) {
        console.log('🔄 Message already being sent, skipping...');
        return;
    }

    const input = document.getElementById('messageInput');
    const text = input.value.trim();

    if (text === '/' || window.colorPickerVisible === true) {
        if (text === '/') {
            input.value = '';
            autoResize(input);
        }
        return;
    }

    if (!text || !chatFriend) {
        showToast('Please type a message!', '⚠️', 1500);
        return;
    }

    isSending = true;
    window.isSending = true;
    const sendBtn = document.getElementById('sendBtn');
    const originalHTML = sendBtn.innerHTML;

    try {
        console.log('📤 Sending message to:', chatFriend.id);
        sendBtn.innerHTML = `
            <svg class="send-icon" viewBox="0 0 24 24" style="opacity: 0.5">
                <path d="M2,21L23,12L2,3V10L17,12L2,14V21Z"/>
            </svg>
        `;
        sendBtn.disabled = true;

        // FIX: Added chat_id to messageData
        const messageData = {
            sender_id: currentUser.id,
            receiver_id: chatFriend.id,
            content: text,
            chat_id: chatFriend.id, // ← THIS FIXES THE CHAT_ID ERROR
            created_at: new Date().toISOString()
        };

        if (window.selectedColor) {
            messageData.color = window.selectedColor;
            console.log('🎨 Sending message with color:', window.selectedColor);
            window.selectedColor = null;
        }

        const { data, error } = await supabase
            .from('direct_messages')
            .insert(messageData)
            .select()
            .single();

        if (error) throw error;

        console.log('✅ Message sent:', data.id);
        playSentSound();
        input.value = '';
        autoResize(input);

        // Stop typing indicator
        isTyping = false;
        window.isTyping = false;
        if (typingTimeout) {
            clearTimeout(typingTimeout);
            typingTimeout = null;
            window.typingTimeout = null;
        }
        sendTypingStatus(false);

        setTimeout(() => {
            if (input) input.focus();
            isSending = false;
            window.isSending = false;
            sendBtn.innerHTML = originalHTML;
            sendBtn.disabled = false;
        }, 150);
    } catch (error) {
        console.error('Send failed:', error);
        showCustomAlert('Failed to send message: ' + error.message, '❌', 'Error');
        isSending = false;
        window.isSending = false;
        sendBtn.innerHTML = originalHTML;
        sendBtn.disabled = false;
    }
}

// ====================
// MESSAGE LOADING
// ====================
async function loadOldMessages(friendId) {
    if (isLoadingMessages) return;
    isLoadingMessages = true;

    try {
        console.log('Loading messages for friend:', friendId);

        const { data: messages, error } = await supabase
            .from('direct_messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Query error:', error);
            throw error;
        }

        console.log('Loaded', messages?.length || 0, 'messages');
        currentMessages = messages || [];
        window.currentMessages = currentMessages;

        showMessages(currentMessages);
    } catch (error) {
        console.error('Load error:', error);
        showMessages([]);
    } finally {
        isLoadingMessages = false;
    }
}

// 🔥 RESTORED: Original showMessages WITHOUT message avatars
function showMessages(messages) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    if (!messages || messages.length === 0) {
        container.innerHTML = `
            <div class="empty-chat">
                <svg class="empty-chat-icon" viewBox="0 0 24 24">
                    <path d="M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2Z"/>
                </svg>
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

        const color = msg.color || null;
        const colorAttr = color ? `data-color="${color}"` : '';

        // 🔥 ORIGINAL: No avatars in messages
        if (msg.image_url) {
            if (typeof window.createImageMessageHTML === 'function') {
                html += window.createImageMessageHTML(msg, isSent, colorAttr, time);
            } else {
                html += `
                    <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${msg.id}" ${colorAttr}>
                        <div class="message-content">📸 Image shared</div>
                        <div class="message-time">${time}</div>
                    </div>
                `;
            }
        } else {
            html += `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${msg.id}" ${colorAttr}>
                    <div class="message-content">${msg.content || ''}</div>
                    <div class="message-time">${time}</div>
                </div>
            `;
        }
    });

    html += `<div class="typing-indicator-placeholder"></div>`;
    container.innerHTML = html;

    // Add typing indicator back
    setupTypingIndicator();

    setTimeout(() => {
        forceScrollToBottom();
    }, 50);
}

// 🔥 RESTORED: Original addMessageToUI WITHOUT message avatars
function addMessageToUI(message, isFromRealtime = false) {
    const container = document.getElementById('messagesContainer');
    if (!container || !message) return;

    if (container.querySelector('.empty-chat')) {
        container.innerHTML = '';
    }

    const isSent = message.sender_id === currentUser.id;
    const time = new Date(message.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    const color = message.color || null;
    const colorAttr = color ? `data-color="${color}"` : '';

    let messageHTML;

    if (message.image_url) {
        if (typeof window.createImageMessageHTML === 'function') {
            messageHTML = window.createImageMessageHTML(message, isSent, colorAttr, time);
        } else {
            messageHTML = `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" ${colorAttr}>
                    <div class="message-content">📸 Image shared</div>
                    <div class="message-time">${time}</div>
                </div>
            `;
        }
    } else {
        messageHTML = `
            <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}" ${colorAttr}>
                <div class="message-content">${message.content || ''}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
    }

    // Remove typing indicator temporarily
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
    
    container.insertAdjacentHTML('beforeend', messageHTML);
    
    // Add typing indicator back
    setupTypingIndicator();

    const isDuplicate = currentMessages.some(msg => msg.id === message.id);
    if (!isDuplicate) {
        currentMessages.push(message);
        window.currentMessages = currentMessages;
    }

    const newMessage = container.lastElementChild;
    if (newMessage && isFromRealtime) {
        newMessage.style.opacity = '0';
        newMessage.style.transform = 'translateY(10px)';

        setTimeout(() => {
            newMessage.style.transition = 'all 0.15s ease';
            newMessage.style.opacity = '1';
            newMessage.style.transform = 'translateY(0)';
        }, 10);
    }

    setTimeout(() => {
        forceScrollToBottom();
    }, 10);

    if (message.sender_id === chatFriend.id) {
        playReceivedSound();
        if (!document.hasFocus()) {
            const originalTitle = document.title;
            document.title = '💬 ' + chatFriend.username;
            setTimeout(() => document.title = originalTitle, 800);
        }
    }
}

// ====================
// REALTIME FUNCTIONS
// ====================

function setupRealtime(friendId) {
    console.log('🔧 Setting up realtime for friend:', friendId);

    if (chatChannel) {
        supabase.removeChannel(chatChannel);
        window.chatChannel = null;
    }
    if (statusChannel) {
        supabase.removeChannel(statusChannel);
        window.statusChannel = null;
    }
    if (typingChannel) {
        supabase.removeChannel(typingChannel);
    }

    // Main chat channel
    chatChannel = supabase.channel(`dm:${currentUser.id}:${friendId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'direct_messages'
        }, (payload) => {
            console.log('📨 Realtime INSERT detected:', payload.new);
            const newMsg = payload.new;
            const isOurMessage = 
                (newMsg.sender_id === currentUser.id && newMsg.receiver_id === friendId) ||
                (newMsg.sender_id === friendId && newMsg.receiver_id === currentUser.id);

            if (isOurMessage) {
                const existingMessage = document.querySelector(`[data-message-id="${newMsg.id}"]`);
                if (!existingMessage) {
                    console.log('✅ Adding new message to UI (from realtime)');
                    addMessageToUI(newMsg, true);
                } else {
                    console.log('🔄 Message already in UI, skipping:', newMsg.id);
                }
            }
        })
        .subscribe();

    window.chatChannel = chatChannel;

    // Status channel
    statusChannel = supabase.channel(`status:${friendId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${friendId}`
        }, (payload) => {
            console.log('🔄 Friend status updated:', payload.new.status);
            if (payload.new.id === friendId) {
                chatFriend.status = payload.new.status;
                window.chatFriend = chatFriend;
                updateFriendStatus(payload.new.status);

                // 🔥 Update avatar if it changed (header only)
                if (payload.new.avatar_url && payload.new.avatar_url !== chatFriend.avatar_url) {
                    chatFriend.avatar_url = payload.new.avatar_url;
                    window.chatFriend = chatFriend;
                    
                    // Update header avatar only
                    const chatUserAvatar = document.getElementById('chatUserAvatar');
                    if (chatUserAvatar) {
                        chatUserAvatar.innerHTML = `<img src="${payload.new.avatar_url}" alt="${chatFriend.username}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                    }
                }

                if (payload.new.status === 'online') {
                    showToast(`${chatFriend.username} is now online`, '🟢', 1500);
                } else {
                    showToast(`${chatFriend.username} is now offline`, '⚫', 1500);
                }
            }
        })
        .subscribe();

    window.statusChannel = statusChannel;

    console.log('✅ Realtime active');
}

// ====================
// TYPING FUNCTIONS
// ====================
function setupTypingListener() {
    const input = document.getElementById('messageInput');
    if (!input) return;

    input.addEventListener('input', handleTyping);
}

function handleTyping() {
    if (!chatFriend || !currentUser) return;

    if (!isTyping) {
        isTyping = true;
        window.isTyping = true;
        sendTypingStatus(true);
    }

    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }

    typingTimeout = setTimeout(() => {
        if (isTyping) {
            isTyping = false;
            window.isTyping = false;
            sendTypingStatus(false);
        }
        typingTimeout = null;
        window.typingTimeout = null;
    }, 2000);
}

async function sendTypingStatus(isTyping) {
    if (!chatFriend || !currentUser) return;

    try {
        // Use broadcast for typing status (more efficient than database)
        const channel = supabase.channel(`typing:${currentUser.id}:${chatFriend.id}`);
        
        await channel.send({
            type: 'broadcast',
            event: 'typing',
            payload: { 
                userId: currentUser.id, 
                isTyping: isTyping,
                username: currentUser.email?.split('@')[0] || 'Someone'
            }
        });

        // Clean up channel after sending
        setTimeout(() => {
            supabase.removeChannel(channel);
        }, 1000);
    } catch (error) {
        console.log('Typing status error:', error);
    }
}

// Listen for friend's typing status
function setupTypingReceiver(friendId) {
    if (typingChannel) {
        supabase.removeChannel(typingChannel);
    }

    typingChannel = supabase.channel(`typing:${friendId}:${currentUser.id}`)
        .on('broadcast', { event: 'typing' }, (payload) => {
            console.log('✏️ Friend typing status:', payload);
            
            if (payload.payload.isTyping) {
                showTypingIndicator(true);
                
                if (friendTypingTimeout) {
                    clearTimeout(friendTypingTimeout);
                }
                
                friendTypingTimeout = setTimeout(() => {
                    showTypingIndicator(false);
                    friendTypingTimeout = null;
                }, 3000);
            } else {
                if (friendTypingTimeout) {
                    clearTimeout(friendTypingTimeout);
                    friendTypingTimeout = null;
                }
                showTypingIndicator(false);
            }
        })
        .subscribe();

    window.typingChannel = typingChannel;
}

function updateInputListener() {
    const input = document.getElementById('messageInput');
    if (!input) return;

    input.addEventListener('keydown', handleKeyPress);
}

function handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();

        if (window.colorPickerVisible === true) {
            const input = document.getElementById('messageInput');
            if (input && input.value === '/') {
                input.value = '';
                autoResize(input);
            }
            return;
        }

        const input = document.getElementById('messageInput');
        if (input && input.value === '/') {
            return;
        }

        if (input && input.value.trim()) {
            sendMessage();
        }
    }
}

function autoResize(textarea) {
    if (!textarea) return;

    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 100);
    textarea.style.height = newHeight + 'px';

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.disabled = textarea.value.trim() === '';
    }
}

// ====================
// NAVIGATION
// ====================
function goBack() {
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) {
        backBtn.innerHTML = '<div class="loading-spinner-small"></div>';
    }

    if (chatChannel) {
        supabase.removeChannel(chatChannel);
    }
    if (statusChannel) {
        supabase.removeChannel(statusChannel);
    }
    if (typingChannel) {
        supabase.removeChannel(typingChannel);
    }
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    if (friendTypingTimeout) {
        clearTimeout(friendTypingTimeout);
    }

    setTimeout(() => {
        window.location.href = '../home/index.html';
    }, 50);
}

// ====================
// USER INFO MODAL
// ====================

// 🔥 User info modal WITH avatar
function showUserInfo() {
    if (!chatFriend) {
        showToast('User information not available', '⚠️', 1500);
        return;
    }

    const modal = document.getElementById('userInfoModal');
    const content = document.getElementById('userInfoContent');
    const isOnline = chatFriend.status === 'online';
    const initial = chatFriend.username ? chatFriend.username.charAt(0).toUpperCase() : '?';

    content.innerHTML = `
        <div class="user-info-avatar" style="background: linear-gradient(45deg, #007acc, #00b4d8); position: relative; overflow: hidden;">
            ${chatFriend.avatar_url 
                ? `<img src="${chatFriend.avatar_url}" alt="${chatFriend.username}" style="width:100%; height:100%; object-fit:cover;">`
                : `<span style="color:white; font-size: 2rem; font-weight: 600;">${initial}</span>`
            }
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
            <button class="info-action-btn danger" onclick="blockUserPrompt()">🚫 Block User</button>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('userInfoModal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.style.display = 'none';
        }, 150);
    }
}

function blockUserPrompt() {
    showConfirmAlert(
        `Are you sure you want to block ${chatFriend.username}?`,
        '🚫',
        'Block User',
        () => {
            showToast('User blocked!', '✅', 1500);
            setTimeout(goBack, 800);
        }
    );
}

// ====================
// CLEAR CHAT
// ====================
async function clearChatPrompt() {
    showConfirmAlert(
        'Are you sure you want to clear all messages?',
        '🗑️',
        'Clear Chat',
        async () => {
            try {
                const friendId = new URLSearchParams(window.location.search).get('friendId');
                const { error } = await supabase
                    .from('direct_messages')
                    .delete()
                    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`);

                if (error) throw error;

                showToast('Chat cleared!', '✅', 1500);
                currentMessages = [];
                window.currentMessages = currentMessages;

                showMessages([]);
            } catch (error) {
                console.error('Clear chat error:', error);
                showCustomAlert('Error clearing chat', '❌', 'Error');
            }
        }
    );
}

// ====================
// SCROLL FUNCTIONS
// ====================
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    container.scrollTop = container.scrollHeight;
}

function forceScrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    container.scrollTop = container.scrollHeight;

    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
        const lastChild = container.lastElementChild;
        if (lastChild) {
            lastChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
        setTimeout(() => {
            container.scrollTop = container.scrollHeight;
        }, 50);
    }, 50);
}

// ====================
// LOADING FUNCTION
// ====================
function showLoading(show, text = 'Sending...') {
    let loadingOverlay = document.getElementById('loadingOverlay');

    if (!loadingOverlay) {
        const loadingHTML = `
            <div class="loading-overlay" id="loadingOverlay" style="display: none;">
                <div class="loading-spinner"></div>
                <p class="loading-text">${text}</p>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', loadingHTML);
        loadingOverlay = document.getElementById('loadingOverlay');
    }

    if (show) {
        loadingOverlay.querySelector('.loading-text').textContent = text;
        loadingOverlay.style.display = 'flex';
        setTimeout(() => {
            loadingOverlay.style.opacity = '1';
        }, 10);
    } else {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 150);
    }
}

// ====================
// REFRESH FUNCTIONS
// ====================
function refreshChat() {
    const urlParams = new URLSearchParams(window.location.search);
    const friendId = urlParams.get('friendId');
    if (friendId) {
        loadOldMessages(friendId);
        showToast('Chat refreshed', '🔄', 1500);
    }
}

function reconnectRealtime() {
    const urlParams = new URLSearchParams(window.location.search);
    const friendId = urlParams.get('friendId');
    if (friendId) {
        setupRealtime(friendId);
        showToast('Reconnected', '🔗', 1500);
    }
}

// ====================
// SOUND FUNCTIONS
// ====================
function playSentSound() {
    try {
        const audio = new Audio('/pages/chats/sent.mp3');
        audio.volume = 0.3;
        audio.play().catch(e => console.log('Sound play failed:', e));
    } catch (e) {
        console.log('Sound play failed:', e);
    }
}

function playReceivedSound() {
    try {
        const audio = new Audio('/pages/chats/recieve.mp3');
        audio.volume = 0.3;
        audio.play().catch(e => console.log('Sound play failed:', e));
    } catch (e) {
        console.log('Sound play failed:', e);
    }
}

// ====================
// ALERT FUNCTIONS
// ====================
function showCustomAlert(message, icon = '❌', title = 'Alert', callback = null) {
    const modal = document.getElementById('customAlert');
    const titleEl = document.getElementById('alertTitle');
    const iconEl = document.getElementById('alertIcon');
    const messageEl = document.getElementById('alertMessage');
    const confirmBtn = document.getElementById('alertConfirm');

    titleEl.textContent = title;
    iconEl.textContent = icon;
    messageEl.textContent = message;

    modal.style.display = 'flex';

    confirmBtn.onclick = () => {
        modal.style.display = 'none';
        if (callback) callback();
    };
}

function showConfirmAlert(message, icon = '❓', title = 'Confirm', onConfirm = null) {
    const modal = document.getElementById('customAlert');
    const titleEl = document.getElementById('alertTitle');
    const iconEl = document.getElementById('alertIcon');
    const messageEl = document.getElementById('alertMessage');
    const confirmBtn = document.getElementById('alertConfirm');
    const cancelBtn = document.getElementById('alertCancel');

    titleEl.textContent = title;
    iconEl.textContent = icon;
    messageEl.textContent = message;

    cancelBtn.style.display = 'flex';
    modal.style.display = 'flex';

    confirmBtn.onclick = () => {
        modal.style.display = 'none';
        cancelBtn.style.display = 'none';
        if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = () => {
        modal.style.display = 'none';
        cancelBtn.style.display = 'none';
    };
}

function showToast(message, icon = '✅', duration = 1500) {
    const toast = document.getElementById('customToast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');

    toastMessage.textContent = message;
    toastIcon.textContent = icon;

    toast.style.display = 'flex';

    setTimeout(() => {
        toast.style.display = 'none';
    }, duration);
}

function updateFriendStatus(status) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (status === 'online') {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Online';
    } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Offline';
    }
}

// ====================
// CHROME SPECIFIC FIXES
// ====================
if (navigator.userAgent.includes('Chrome')) {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            const container = document.getElementById('messagesContainer');
            if (container) {
                container.style.transform = 'translateZ(0)';
            }
        }, 300);
    });
}

// ====================
// CLEANUP ON UNLOAD
// ====================
window.addEventListener('beforeunload', () => {
    if (chatChannel) supabase.removeChannel(chatChannel);
    if (statusChannel) supabase.removeChannel(statusChannel);
    if (typingChannel) supabase.removeChannel(typingChannel);
    if (typingTimeout) clearTimeout(typingTimeout);
    if (friendTypingTimeout) clearTimeout(friendTypingTimeout);
});

// Add small loading spinner CSS for back button
if (!document.querySelector('#loading-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'loading-spinner-style';
    style.textContent = `
        .loading-spinner-small {
            width: 20px;
            height: 20px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top: 2px solid white;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

console.log('✅ Chat core functions exported');