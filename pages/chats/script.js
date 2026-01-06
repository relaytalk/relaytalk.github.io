import { auth } from '../../utils/auth.js';
import { supabase } from '../../utils/supabase.js';

console.log('✨ Chat Loaded - Edge Keyboard Fixed');

let currentUser = null;
let chatFriend = null;
let chatChannel = null;
let statusChannel = null;
let isLoadingMessages = false;
let currentMessages = [];
let isSending = false;
let isTyping = false;
let typingTimeout = null;
let friendTypingTimeout = null;
let keyboardHeight = 0;
let isKeyboardVisible = false;

// GLOBAL FUNCTIONS
window.sendMessage = sendMessage;
window.handleKeyPress = handleKeyPress;
window.autoResize = autoResize;
window.goBack = goBack;
window.showUserInfo = showUserInfo;
window.closeModal = closeModal;
window.startVoiceCall = startVoiceCall;
window.viewSharedMedia = viewSharedMedia;
window.blockUserPrompt = blockUserPrompt;
window.clearChatPrompt = clearChatPrompt;
window.showCustomAlert = showCustomAlert;
window.showConfirmAlert = showConfirmAlert;
window.showToast = showToast;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Edge mobile: Prevent pull-to-refresh
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        
        // Edge: Touch event handling
        document.addEventListener('touchmove', function(e) {
            if (e.scale !== 1) {
                e.preventDefault();
            }
        }, { passive: false });
        
        // Edge keyboard detection
        setupKeyboardDetection();
        
        // Handle resize/orientation change
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleOrientationChange);
        
        // Visibility change handling
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const { success, user } = await auth.getCurrentUser();
        if (!success || !user) {
            showLoginAlert();
            return;
        }

        currentUser = user;
        console.log('Current User:', user.id);

        const urlParams = new URLSearchParams(window.location.search);
        const friendId = urlParams.get('friendId');

        if (!friendId) {
            showCustomAlert('No friend selected!', '😕', 'Error', () => {
                window.location.href = '../home/index.html';
            });
            return;
        }

        const { data: friend, error: friendError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', friendId)
            .single();

        if (friendError) throw friendError;

        chatFriend = friend;
        document.getElementById('chatUserName').textContent = friend.username;
        document.getElementById('chatUserAvatar').textContent = friend.username.charAt(0).toUpperCase();

        updateFriendStatus(friend.status);
        await loadOldMessages(friendId);
        setupRealtime(friendId);
        setupTypingListener();
        updateInputListener();

        // Initial setup
        setTimeout(() => {
            const input = document.getElementById('messageInput');
            if (input) autoResize(input);
            scrollToBottom();
        }, 200);

        console.log('✅ Chat ready - Edge keyboard optimized!');
    } catch (error) {
        console.error('Init error:', error);
        showCustomAlert('Error loading chat: ' + error.message, '❌', 'Error', () => {
            window.location.href = '../home/index.html';
        });
    }
});

// EDGE KEYBOARD DETECTION
function setupKeyboardDetection() {
    const visualViewport = window.visualViewport;
    
    if (visualViewport) {
        visualViewport.addEventListener('resize', function() {
            const keyboardHeight = window.innerHeight - visualViewport.height;
            isKeyboardVisible = keyboardHeight > 100; // Keyboard is visible if height > 100px
            
            if (isKeyboardVisible) {
                // Adjust layout when keyboard is shown
                adjustForKeyboard(keyboardHeight);
            } else {
                // Reset when keyboard is hidden
                resetKeyboardLayout();
            }
            
            // Always scroll to bottom when keyboard changes
            setTimeout(scrollToBottom, 100);
        });
    }
    
    // Fallback for browsers without visualViewport
    window.addEventListener('resize', function() {
        const viewportHeight = window.innerHeight;
        const documentHeight = document.documentElement.clientHeight;
        const keyboardHeight = Math.max(0, documentHeight - viewportHeight);
        
        if (keyboardHeight > 100) {
            adjustForKeyboard(keyboardHeight);
        } else {
            resetKeyboardLayout();
        }
    });
}

function adjustForKeyboard(keyboardHeight) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    // Add extra padding at bottom when keyboard is open
    messagesContainer.style.paddingBottom = (keyboardHeight + 70) + 'px';
    
    // Scroll to bottom immediately
    scrollToBottom();
}

function resetKeyboardLayout() {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    // Reset padding
    messagesContainer.style.paddingBottom = '70px';
    
    // Scroll to bottom
    setTimeout(scrollToBottom, 50);
}

function handleResize() {
    setTimeout(() => {
        const input = document.getElementById('messageInput');
        if (input) autoResize(input);
        scrollToBottom();
    }, 100);
}

function handleOrientationChange() {
    setTimeout(() => {
        scrollToBottom();
        const input = document.getElementById('messageInput');
        if (input) autoResize(input);
    }, 300);
}

function handleVisibilityChange() {
    if (!document.hidden) {
        setTimeout(() => {
            scrollToBottom();
        }, 100);
    }
}

function handleTyping() {
    if (!isTyping) {
        isTyping = true;
        sendTypingStatus(true);
    }
    
    if (typingTimeout) clearTimeout(typingTimeout);
    
    typingTimeout = setTimeout(() => {
        isTyping = false;
        sendTypingStatus(false);
    }, 2000);
}

async function sendTypingStatus(isTyping) {
    try {
        await supabase
            .channel(`typing:${currentUser.id}:${chatFriend.id}`)
            .send({
                type: 'broadcast',
                event: 'typing',
                payload: {
                    userId: currentUser.id,
                    friendId: chatFriend.id,
                    isTyping: isTyping,
                    timestamp: Date.now()
                }
            });
    } catch (error) {
        console.log('Typing status error:', error);
    }
}

function setupTypingListener() {
    supabase
        .channel(`typing:${chatFriend.id}:${currentUser.id}`)
        .on('broadcast', { event: 'typing' }, (payload) => {
            if (payload.payload.userId === chatFriend.id) {
                showTypingIndicator(payload.payload.isTyping);
            }
        })
        .subscribe();
}

function showTypingIndicator(show) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    let indicator = document.getElementById('typingIndicator');
    
    if (!indicator) {
        const typingHTML = `
            <div id="typingIndicator" class="typing-indicator" style="display: none;">
                <div class="typing-dots">
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', typingHTML);
        indicator = document.getElementById('typingIndicator');
    }
    
    if (indicator) {
        indicator.style.display = show ? 'flex' : 'none';
        
        if (show) {
            if (friendTypingTimeout) clearTimeout(friendTypingTimeout);
            friendTypingTimeout = setTimeout(() => {
                indicator.style.display = 'none';
            }, 3000);
        }
        
        if (show) {
            setTimeout(scrollToBottom, 100);
        }
    }
}

function updateInputListener() {
    const input = document.getElementById('messageInput');
    if (input) {
        input.addEventListener('input', handleTyping);
        input.addEventListener('focus', function() {
            setTimeout(scrollToBottom, 300);
        });
    }
}

function playSentSound() {
    try {
        const audio = new Audio('sent.mp3');
        audio.volume = 0.3;
        audio.play().catch(e => console.log('Sound play failed:', e));
    } catch (error) {
        console.log('Sound error:', error);
    }
}

function playReceivedSound() {
    try {
        const audio = new Audio('recieve.mp3');
        audio.volume = 0.3;
        audio.play().catch(e => console.log('Sound play failed:', e));
    } catch (error) {
        console.log('Sound error:', error);
    }
}

function showLoginAlert() {
    const alertOverlay = document.getElementById('customAlert');
    const alertIcon = document.getElementById('alertIcon');
    const alertTitle = document.getElementById('alertTitle');
    const alertMessage = document.getElementById('alertMessage');
    const alertConfirm = document.getElementById('alertConfirm');
    const alertCancel = document.getElementById('alertCancel');

    alertIcon.textContent = '🔐';
    alertTitle.textContent = 'Login Required';
    alertMessage.textContent = 'Please login or signup to continue chatting!';
    alertCancel.style.display = 'inline-block';

    alertConfirm.textContent = 'Login';
    alertConfirm.className = 'alert-btn confirm';
    alertConfirm.onclick = () => {
        alertOverlay.style.display = 'none';
        window.location.href = '../login/index.html';
    };

    alertCancel.textContent = 'Signup';
    alertCancel.className = 'alert-btn cancel';
    alertCancel.onclick = () => {
        alertOverlay.style.display = 'none';
        window.location.href = '../auth/index.html';
    };

    alertOverlay.style.display = 'flex';
}

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
        showMessages(currentMessages);
    } catch (error) {
        console.error('Load error:', error);
        showMessages([]);
    } finally {
        isLoadingMessages = false;
    }
}

function showMessages(messages) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    console.log('Showing', messages?.length || 0, 'messages');

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
            <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${msg.id}">
                <div class="message-content">${msg.content || ''}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
    });

    // Spacer to prevent hiding behind input
    html += `<div style="height: 20px; opacity: 0; pointer-events: none;"></div>`;
    container.innerHTML = html;
    
    setTimeout(() => {
        scrollToBottom();
    }, 50);
}

// ULTIMATE SCROLL FIX FOR EDGE
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    // Method 1: Direct scroll (works best in Edge)
    container.scrollTop = container.scrollHeight;
    
    // Method 2: Double check (Edge sometimes needs this)
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
        
        // Method 3: Alternative approach for stubborn Edge
        const lastChild = container.lastElementChild;
        if (lastChild) {
            lastChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, 10);
}

function addMessageToUI(message, isFromRealtime = false) {
    const container = document.getElementById('messagesContainer');
    if (!container || !message) return;

    // Remove empty state if it exists
    if (container.querySelector('.empty-chat')) {
        container.innerHTML = '';
    }

    const isSent = message.sender_id === currentUser.id;
    const time = new Date(message.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    const messageHTML = `
        <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${message.id}">
            <div class="message-content">${message.content || ''}</div>
            <div class="message-time">${time}</div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', messageHTML);
    
    // Check for duplicate
    const isDuplicate = currentMessages.some(msg => msg.id === message.id);
    if (!isDuplicate) {
        currentMessages.push(message);
    }

    // Scroll to bottom
    setTimeout(() => {
        scrollToBottom();
    }, 10);

    // Play sound for received messages
    if (message.sender_id === chatFriend.id) {
        playReceivedSound();
        if (!document.hasFocus()) {
            const originalTitle = document.title;
            document.title = '💬 ' + chatFriend.username;
            setTimeout(() => document.title = originalTitle, 1000);
        }
    }
}

function updateFriendStatus(status) {
    const isOnline = status === 'online';
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');

    if (isOnline) {
        statusText.textContent = 'Online';
        statusText.style.color = '#28a745';
        statusDot.className = 'status-dot';
        statusDot.style.boxShadow = '0 0 8px #28a745';
    } else {
        statusText.textContent = 'Offline';
        statusText.style.color = '#6c757d';
        statusDot.className = 'status-dot offline';
        statusDot.style.boxShadow = 'none';
    }
}

function setupRealtime(friendId) {
    console.log('🔧 Setting up realtime for friend:', friendId);

    // Clean up old channels
    if (chatChannel) {
        supabase.removeChannel(chatChannel);
    }
    if (statusChannel) {
        supabase.removeChannel(statusChannel);
    }

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
                updateFriendStatus(payload.new.status);

                if (payload.new.status === 'online') {
                    showToast(`${chatFriend.username} is now online`, '🟢', 2000);
                } else {
                    showToast(`${chatFriend.username} is now offline`, '⚫', 2000);
                }
            }
        })
        .subscribe();

    console.log('✅ Realtime active');
}

async function sendMessage() {
    if (isSending) {
        console.log('🔄 Message already being sent, skipping...');
        return;
    }
    
    const input = document.getElementById('messageInput');
    const text = input.value.trim();

    if (!text || !chatFriend) {
        showToast('Please type a message!', '⚠️');
        return;
    }

    isSending = true;
    const sendBtn = document.getElementById('sendBtn');
    const originalText = sendBtn.innerHTML;

    try {
        console.log('📤 Sending message to:', chatFriend.id);
        sendBtn.innerHTML = '<div class="typing-dots"><div></div><div></div><div></div></div>';
        sendBtn.disabled = true;

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

        console.log('✅ Message sent to database:', data.id);
        playSentSound();
        input.value = '';
        autoResize(input);
        
        // Clear typing indicator
        isTyping = false;
        if (typingTimeout) {
            clearTimeout(typingTimeout);
            typingTimeout = null;
        }
        sendTypingStatus(false);
        
        setTimeout(() => {
            // Edge keyboard fix: focus without opening keyboard immediately
            input.focus({ preventScroll: true });
            isSending = false;
            sendBtn.innerHTML = originalText;
            sendBtn.disabled = false;
        }, 300);
    } catch (error) {
        console.error('Send failed:', error);
        showCustomAlert('Failed to send message: ' + error.message, '❌', 'Error');
        isSending = false;
        sendBtn.innerHTML = originalText;
        sendBtn.disabled = false;
    }
}

function handleKeyPress(event) {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    if (sendBtn) {
        sendBtn.disabled = !input || input.value.trim() === '';
    }

    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (input && input.value.trim()) {
            // Edge fix: prevent default keyboard behavior
            input.blur();
            setTimeout(() => {
                sendMessage();
                // Refocus but prevent keyboard from popping up immediately
                setTimeout(() => input.focus({ preventScroll: true }), 100);
            }, 50);
        }
    }
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 100);
    textarea.style.height = newHeight + 'px';

    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.disabled = textarea.value.trim() === '';
    }
}

function showCustomAlert(message, icon = '⚠️', title = 'Alert', onConfirm = null) {
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

    alertConfirm.textContent = 'OK';
    alertConfirm.onclick = () => {
        alertOverlay.style.display = 'none';
        if (onConfirm) onConfirm();
    };

    alertOverlay.style.display = 'flex';
}

function showConfirmAlert(message, icon = '❓', title = 'Confirm', onConfirm, onCancel = null) {
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

    alertConfirm.textContent = 'Yes';
    alertConfirm.onclick = () => {
        alertOverlay.style.display = 'none';
        if (onConfirm) onConfirm();
    };

    alertCancel.textContent = 'No';
    alertCancel.onclick = () => {
        alertOverlay.style.display = 'none';
        if (onCancel) onCancel();
    };

    alertOverlay.style.display = 'flex';
}

function showToast(message, icon = 'ℹ️', duration = 3000) {
    const toast = document.getElementById('customToast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');

    toastIcon.textContent = icon;
    toastMessage.textContent = message;
    toast.style.display = 'flex';

    setTimeout(() => toast.style.display = 'none', duration);
}

function goBack() {
    if (chatChannel) {
        supabase.removeChannel(chatChannel);
    }
    if (statusChannel) {
        supabase.removeChannel(statusChannel);
    }
    window.location.href = '../home/index.html';
}

function showUserInfo() {
    if (!chatFriend) {
        showToast('User information not available', '⚠️');
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
}

function closeModal() {
    document.getElementById('userInfoModal').style.display = 'none';
}

function startVoiceCall() {
    showToast('Voice call feature coming soon!', '📞');
}

function viewSharedMedia() {
    showToast('Shared media feature coming soon!', '📷');
}

function blockUserPrompt() {
    showConfirmAlert(
        `Are you sure you want to block ${chatFriend.username}?`,
        '🚫',
        'Block User',
        () => {
            showToast('User blocked!', '✅');
            setTimeout(goBack, 1000);
        }
    );
}

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

                showToast('Chat cleared!', '✅');
                currentMessages = [];
                showMessages([]);
            } catch (error) {
                console.error('Clear chat error:', error);
                showCustomAlert('Error clearing chat', '❌', 'Error');
            }
        }
    );
}