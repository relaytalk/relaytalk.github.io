import { auth } from '../../utils/auth.js';
import { supabase } from '../../utils/supabase.js';

console.log('✨ Chat Core initialized');

let currentUser = null;
let chatFriend = null;
let chatChannel = null;
let statusChannel = null;
let typingChannel = null;
let reactionsChannel = null;
let callsChannel = null;
let isLoadingMessages = false;
let currentMessages = [];
let isSending = false;
let isTyping = false;
let typingTimeout = null;
let friendTypingTimeout = null;

let messageReactions = {};

let longPressTimer = null;
let longPressTarget = null;
let selectedMessageId = null;
let selectedMessageEl = null;
let quickBarElement = null;
let justOpenedAt = 0;

window.colorPickerVisible = false;
window.currentMessages = currentMessages;
window.currentUser = null;
window.chatFriend = null;
window.isSending = false;
window.isTyping = false;

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
window.openGuide = openGuide;
window.closeGuide = closeGuide;
window.openFriendProfile = openFriendProfile;

window.getCurrentUser = () => currentUser;
window.getChatFriend = () => chatFriend;
window.getSupabaseClient = () => supabase;

if (window.chatModules) window.chatModules.coreLoaded = true;

const QUICK_REACTIONS = ['🥀', '💕', '🫂', '😭'];

const PICKER_EMOJIS = [
    '🥀', '💕', '🫂', '😭', '😂', '❤️',
    '🔥', '👍', '👎', '😮', '😢', '😡',
    '🙏', '🎉', '💯', '😍', '😘', '🤔',
    '😴', '🤯', '🥺', '😈', '💀', '🤝',
    '✨', '🙌', '👏', '🥰', '😅', '🤗'
];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { success, user } = await auth.getCurrentUser();
        if (!success || !user) {
            showFallbackPage('You need to sign in', 'Please login or create a new account to start chatting.', '🔐');
            return;
        }

        currentUser = user;
        window.currentUser = user;

        document.getElementById("login").style.display = "none";
        document.getElementById("chat").style.display = "block";

        ['customAlert', 'customToast', 'userInfoModal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        const urlParams = new URLSearchParams(window.location.search);
        const friendId = urlParams.get('friendId');

        if (!friendId) {
            showFallbackPage('No chat selected', 'This link is missing the person you wanted to chat with.', '💬');
            return;
        }

        const { data: friend, error: friendError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', friendId)
            .maybeSingle();

        if (friendError || !friend) {
            showFallbackPage('Account not found', 'This account does not exist or may have been removed.', '🔎');
            return;
        }

        if (friend.id === currentUser.id) {
            showFallbackPage('This is you', 'You cannot start a chat with yourself.', '🤔');
            return;
        }

        chatFriend = friend;
        window.chatFriend = friend;

        const chatUserAvatar = document.getElementById('chatUserAvatar');
        const friendInitial = friend.username ? friend.username.charAt(0).toUpperCase() : '?';

        if (friend.avatar_url) {
            chatUserAvatar.innerHTML = `<img src="${friend.avatar_url}" alt="${friend.username}">`;
        } else {
            chatUserAvatar.textContent = friendInitial;
        }

        document.getElementById('chatUserName').textContent = friend.username;
        updateFriendStatus(friend.status, friend.last_seen);

        const clickableHeader = document.getElementById('chatHeaderProfile');
        if (clickableHeader) {
            clickableHeader.addEventListener('click', () => openFriendProfile(friend.id));
        }

        await loadOldMessages(friendId);
        setupRealtime(friendId);
        setupCallsListener(friendId);
        setupTypingListener();
        setupTypingReceiver(friendId);
        setupTypingIndicator();
        updateInputListener();
        setupBackButtonPrevention();
        setupLongPressHandlers();
        setupGlobalDismiss();
        setupKeyboardPreservation();

        setTimeout(() => {
            const input = document.getElementById('messageInput');
            if (input) {
                autoResize(input);
                input.focus();
            }
            forceScrollToBottom();
        }, 150);

        console.log('✅ Chat ready');
    } catch (error) {
        console.error('Init error:', error);
        showFallbackPage('Something went wrong', 'We could not load this chat. Please try again.', '⚠️');
    }
});

// ============================================================
// KEYBOARD PRESERVATION
// Only prevents focus-steal on non-send buttons. The send
// button keeps its normal click behaviour so sending works,
// and the input is re-focused right after.
// ============================================================
function setupKeyboardPreservation() {
    const inputBar = document.querySelector('.message-input-wrapper');
    if (!inputBar) return;

    inputBar.querySelectorAll('button').forEach(btn => {
        // Skip the send button — it must fire its click handler normally
        if (btn.id === 'sendBtn' || btn.classList.contains('send-btn')) return;

        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    });
}

function showFallbackPage(title, message, emoji = '💬') {
    const loginEl = document.getElementById('login');
    const chatEl = document.getElementById('chat');
    if (loginEl) loginEl.style.display = 'none';
    if (chatEl) chatEl.style.display = 'none';

    const LOGIN_URL = '../login/index.html';
    const SIGNUP_URL = '../auth/index.html';
    const HOME_URL = '../home/index.html';

    const existing = document.getElementById('rtFallbackScreen');
    if (existing) existing.remove();

    const screen = document.createElement('div');
    screen.id = 'rtFallbackScreen';
    screen.innerHTML = `
        <div class="fallback-card">
            <div class="fallback-emoji">${emoji}</div>
            <h1 class="fallback-title">${escapeHtml(title)}</h1>
            <p class="fallback-message">${escapeHtml(message)}</p>
            <div class="fallback-actions">
                <a href="${LOGIN_URL}" class="fallback-btn fallback-btn-primary">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                        <polyline points="10 17 15 12 10 7"/>
                        <line x1="15" y1="12" x2="3" y2="12"/>
                    </svg>
                    Login
                </a>
                <a href="${HOME_URL}" class="fallback-btn fallback-btn-secondary">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    Home
                </a>
                <a href="${SIGNUP_URL}" class="fallback-btn fallback-btn-secondary">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="8.5" cy="7" r="4"/>
                        <line x1="20" y1="8" x2="20" y2="14"/>
                        <line x1="23" y1="11" x2="17" y2="11"/>
                    </svg>
                    Sign Up
                </a>
            </div>
            <div class="fallback-footer">RelayTalk</div>
        </div>
    `;

    document.body.appendChild(screen);
    document.body.classList.add('fallback-active');
}

function showLoginScreen() {
    showFallbackPage('You need to sign in', 'Please login or create a new account to start chatting.', '🔐');
}

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

function setupTypingIndicator() {
    if (!document.getElementById('typingIndicator')) {
        const indicator = document.createElement('div');
        indicator.id = 'typingIndicator';
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <div class="typing-dots"><div></div><div></div><div></div></div>
            <span id="typingText">${chatFriend?.username || 'Friend'} is typing...</span>
        `;
        indicator.style.display = 'none';
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) messagesContainer.appendChild(indicator);
    }
}

function showTypingIndicator(show) {
    const indicator = document.getElementById('typingIndicator');
    if (!indicator) return;
    if (show) {
        indicator.style.display = 'flex';
        forceScrollToBottom();
    } else {
        indicator.style.display = 'none';
    }
}

// ============================================================
// CALL EVENTS
// ============================================================
function setupCallsListener(friendId) {
    if (callsChannel) {
        supabase.removeChannel(callsChannel);
        callsChannel = null;
    }

    callsChannel = supabase
        .channel(`calls-chat:${currentUser.id}:${friendId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'calls'
        }, (payload) => {
            const call = payload.new;
            if (!call) return;

            const isOurCall =
                (call.caller_id === currentUser.id && call.callee_id === friendId) ||
                (call.caller_id === friendId && call.callee_id === currentUser.id) ||
                (call.caller_id === currentUser.id && call.receiver_id === friendId) ||
                (call.caller_id === friendId && call.receiver_id === currentUser.id);

            if (!isOurCall) return;

            insertCallEventMessage(call);
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'calls'
        }, (payload) => {
            const call = payload.new;
            if (!call) return;

            const isOurCall =
                (call.caller_id === currentUser.id && call.callee_id === friendId) ||
                (call.caller_id === friendId && call.callee_id === currentUser.id) ||
                (call.caller_id === currentUser.id && call.receiver_id === friendId) ||
                (call.caller_id === friendId && call.receiver_id === currentUser.id);

            if (!isOurCall) return;

            if (['missed', 'rejected', 'ended', 'completed'].includes(call.status)) {
                insertCallEventMessage(call);
            }
        })
        .subscribe();
}

async function insertCallEventMessage(call) {
    if (!call || !call.id) return;
    if (!currentUser || !chatFriend) return;

    const eventKey = `call_${call.id}_${call.status}`;
    if (insertCallEventMessage._seen && insertCallEventMessage._seen.has(eventKey)) return;
    if (!insertCallEventMessage._seen) insertCallEventMessage._seen = new Set();
    insertCallEventMessage._seen.add(eventKey);

    const isOutgoing = call.caller_id === currentUser.id;
    const status = call.status || 'unknown';
    const duration = call.duration || 0;

    const messageData = {
        sender_id: currentUser.id,
        receiver_id: chatFriend.id,
        content: '',
        chat_id: chatFriend.id,
        created_at: new Date().toISOString(),
        message_type: 'call',
        metadata: {
            call_id: call.id,
            direction: isOutgoing ? 'outgoing' : 'incoming',
            status: status,
            duration: duration,
            call_type: call.call_type || call.type || 'audio'
        }
    };

    try {
        const { data, error } = await supabase
            .from('direct_messages')
            .insert(messageData)
            .select()
            .single();

        if (error) {
            console.warn('Call event insert failed (may need schema update):', error.message);
            return;
        }

        if (!currentMessages.some(m => m.id === data.id)) {
            currentMessages.push(data);
            window.currentMessages = currentMessages;
        }
        addMessageToUI(data, false);
    } catch (e) {
        console.warn('Call event error:', e);
    }
}

// ============================================================
// SEND MESSAGE
// ============================================================
async function sendMessage() {
    if (isSending) return;

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

    try {
        if (sendBtn) sendBtn.disabled = true;

        const messageData = {
            sender_id: currentUser.id,
            receiver_id: chatFriend.id,
            content: text,
            chat_id: chatFriend.id,
            created_at: new Date().toISOString(),
            read: false,
            message_type: 'text'
        };

        if (window.selectedColor) {
            messageData.color = window.selectedColor;
            window.selectedColor = null;
        }

        const { data, error } = await supabase
            .from('direct_messages')
            .insert(messageData)
            .select()
            .single();

        if (error) throw error;

        if (!currentMessages.some(msg => msg.id === data.id)) {
            currentMessages.push(data);
            window.currentMessages = currentMessages;
        }
        addMessageToUI(data, false);

        playSentSound();
        input.value = '';
        autoResize(input);
        input.focus({ preventScroll: true });

        isTyping = false;
        window.isTyping = false;
        if (typingTimeout) { clearTimeout(typingTimeout); typingTimeout = null; }
        sendTypingStatus(false);
    } catch (error) {
        console.error('Send failed:', error);
        showToast('Failed to send message', '❌', 2000);
    } finally {
        isSending = false;
        window.isSending = false;
        if (sendBtn) sendBtn.disabled = false;
    }
}

// ============================================================
// LOAD MESSAGES
// ============================================================
async function loadOldMessages(friendId) {
    if (isLoadingMessages) return;
    isLoadingMessages = true;

    try {
        const { data: messages, error } = await supabase
            .from('direct_messages')
            .select('*')
            .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUser.id})`)
            .order('created_at', { ascending: true });

        if (error) throw error;

        currentMessages = messages || [];
        window.currentMessages = currentMessages;

        await loadReactionsForMessages(currentMessages.filter(m => m.message_type !== 'call').map(m => m.id));
        showMessages(currentMessages);

        await markMessagesAsRead(friendId);
    } catch (error) {
        console.error('Load error:', error);
        showMessages([]);
    } finally {
        isLoadingMessages = false;
    }
}

async function markMessagesAsRead(friendId) {
    if (!friendId || !currentUser) return;
    try {
        await supabase
            .from('direct_messages')
            .update({ read: true })
            .eq('receiver_id', currentUser.id)
            .eq('sender_id', friendId)
            .eq('read', false);
    } catch (e) {}
}

async function loadReactionsForMessages(messageIds) {
    messageReactions = {};
    if (!messageIds || messageIds.length === 0) return;

    try {
        const { data: reactions, error } = await supabase
            .from('message_reactions')
            .select('message_id, user_id, emoji')
            .in('message_id', messageIds);

        if (error) throw error;

        (reactions || []).forEach(r => {
            if (!messageReactions[r.message_id]) messageReactions[r.message_id] = [];
            messageReactions[r.message_id].push({ user_id: r.user_id, emoji: r.emoji });
        });
    } catch (e) {}
}

// ============================================================
// RENDER
// ============================================================
function isDeletedMessage(msg) {
    if (!msg) return false;
    if (msg.deleted === true || msg.deleted_at) return true;
    if (typeof msg.content === 'string' && msg.content === '__DELETED__') return true;
    return false;
}

function isCallMessage(msg) {
    return msg && msg.message_type === 'call';
}

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
        const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const date = new Date(msg.created_at).toLocaleDateString();

        if (date !== lastDate) {
            html += `<div class="date-separator"><span>${date}</span></div>`;
            lastDate = date;
        }

        html += `<div class="message-wrap ${isSent ? 'sent' : 'received'}" data-wrap-id="${msg.id}">${renderSingleMessage(msg, isSent, time)}${isCallMessage(msg) ? '' : renderReactionPills(msg.id)}</div>`;
    });

    container.innerHTML = html;
    setupTypingIndicator();
    setTimeout(() => forceScrollToBottom(), 50);
}

function renderSingleMessage(msg, isSent, time) {
    if (isCallMessage(msg)) {
        return renderCallMessage(msg, isSent, time);
    }

    const color = msg.color || null;
    const colorAttr = color ? `data-color="${color}"` : '';
    const editedMark = msg.edited_at ? '<span class="edited-mark"> (edited)</span>' : '';
    const deleted = isDeletedMessage(msg);

    if (deleted) {
        return `
            <div class="message ${isSent ? 'sent' : 'received'} deleted-message" data-message-id="${msg.id}">
                <div class="message-content deleted-content">
                    <svg class="deleted-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                    </svg>
                    <span>This message was deleted</span>
                </div>
                <div class="message-time">${time}</div>
            </div>
        `;
    }

    if (msg.image_url) {
        if (typeof window.createImageMessageHTML === 'function') {
            return window.createImageMessageHTML(msg, isSent, colorAttr, time);
        }
        return `
            <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${msg.id}" ${colorAttr}>
                <div class="message-content">📸 Image shared</div>
                <div class="message-time">${time}${editedMark}</div>
            </div>
        `;
    }

    return `
        <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${msg.id}" ${colorAttr}>
            <div class="message-content">${escapeHtml(msg.content || '')}</div>
            <div class="message-time">${time}${editedMark}</div>
        </div>
    `;
}

function renderCallMessage(msg, isSent, time) {
    const meta = msg.metadata || {};
    const status = meta.status || 'unknown';
    const duration = meta.duration || 0;
    const callType = meta.call_type || 'audio';

    let icon = '📞';
    let label = 'Call';
    let statusClass = '';

    if (callType === 'video') icon = '📹';

    if (status === 'missed') {
        icon = '📵';
        label = isSent ? 'No answer' : 'Missed call';
        statusClass = 'call-missed';
    } else if (status === 'rejected') {
        icon = '🚫';
        label = isSent ? 'Declined by them' : 'You declined';
        statusClass = 'call-declined';
    } else if (status === 'completed' || status === 'ended') {
        icon = callType === 'video' ? '📹' : '📞';
        label = formatCallDuration(duration);
        statusClass = 'call-completed';
    } else if (status === 'answered' || status === 'ongoing') {
        icon = callType === 'video' ? '📹' : '📞';
        label = formatCallDuration(duration);
        statusClass = 'call-completed';
    } else {
        label = isSent ? 'Outgoing call' : 'Incoming call';
    }

    return `
        <div class="message ${isSent ? 'sent' : 'received'} call-message ${statusClass}" data-message-id="${msg.id}">
            <div class="call-message-body">
                <span class="call-icon">${icon}</span>
                <div class="call-info">
                    <span class="call-label">${escapeHtml(label)}</span>
                    <span class="call-sub">${time}</span>
                </div>
            </div>
        </div>
    `;
}

function formatCallDuration(seconds) {
    if (!seconds || seconds < 1) return 'Call ended';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m < 1) return `${s}s`;
    return `${m}m ${s}s`;
}

function addMessageToUI(message, isFromRealtime = false) {
    const container = document.getElementById('messagesContainer');
    if (!container || !message) return;

    if (container.querySelector('.empty-chat')) {
        container.innerHTML = '';
    }

    const isSent = message.sender_id === currentUser.id;
    const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) typingIndicator.remove();

    const wrap = document.createElement('div');
    wrap.className = `message-wrap ${isSent ? 'sent' : 'received'}`;
    wrap.dataset.wrapId = message.id;
    const pills = isCallMessage(message) ? '' : renderReactionPills(message.id);
    wrap.innerHTML = renderSingleMessage(message, isSent, time) + pills;
    container.appendChild(wrap);

    setupTypingIndicator();

    if (!currentMessages.some(msg => msg.id === message.id)) {
        currentMessages.push(message);
        window.currentMessages = currentMessages;
    }

    const bubble = wrap.querySelector('.message');
    if (bubble && isFromRealtime) {
        bubble.style.opacity = '0';
        bubble.style.transform = 'translateY(10px)';
        setTimeout(() => {
            bubble.style.transition = 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)';
            bubble.style.opacity = '1';
            bubble.style.transform = 'translateY(0)';
        }, 10);
    }

    setTimeout(() => forceScrollToBottom(), 10);

    if (!isSent && !isCallMessage(message)) {
        supabase
            .from('direct_messages')
            .update({ read: true })
            .eq('id', message.id)
            .then(() => {}).catch(() => {});
    }

    if (message.sender_id === chatFriend.id && !isCallMessage(message)) {
        playReceivedSound();
        if (!document.hasFocus()) {
            const originalTitle = document.title;
            document.title = '💬 ' + chatFriend.username;
            setTimeout(() => document.title = originalTitle, 800);
        }
    }
}

function refreshMessageBubble(messageId) {
    const msg = currentMessages.find(m => m.id === messageId);
    const wrap = document.querySelector(`.message-wrap[data-wrap-id="${messageId}"]`);
    if (!msg || !wrap) return;

    const isSent = msg.sender_id === currentUser.id;
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const bubbleHTML = renderSingleMessage(msg, isSent, time);
    const oldBubble = wrap.querySelector('.message');
    if (oldBubble) {
        oldBubble.outerHTML = bubbleHTML;
    } else {
        wrap.insertAdjacentHTML('afterbegin', bubbleHTML);
    }

    if (isDeletedMessage(msg) || isCallMessage(msg)) {
        const pills = wrap.querySelector('.reaction-pills');
        if (pills) pills.remove();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// REACTIONS
// ============================================================
function renderReactionPills(messageId) {
    const msg = currentMessages.find(m => m.id === messageId);
    if (msg && (isDeletedMessage(msg) || isCallMessage(msg))) return '';

    const reactions = messageReactions[messageId] || [];
    if (reactions.length === 0) return '';

    const grouped = {};
    reactions.forEach(r => {
        grouped[r.emoji] = (grouped[r.emoji] || 0) + 1;
    });

    const myEmoji = reactions.find(r => r.user_id === currentUser.id)?.emoji;

    const pills = Object.entries(grouped).map(([emoji, count]) => {
        const isMine = emoji === myEmoji;
        return `
            <button class="reaction-pill ${isMine ? 'mine' : ''}" data-emoji="${emoji}" data-message-id="${messageId}">
                <span class="reaction-emoji">${emoji}</span>
                ${count > 1 ? `<span class="reaction-count">${count}</span>` : ''}
            </button>
        `;
    }).join('');

    return `<div class="reaction-pills" data-reactions-for="${messageId}">${pills}</div>`;
}

function updateReactionPills(messageId) {
    const wrap = document.querySelector(`.message-wrap[data-wrap-id="${messageId}"]`);
    if (!wrap) return;

    const oldPills = wrap.querySelector('.reaction-pills');
    const newHTML = renderReactionPills(messageId);

    if (oldPills) {
        if (newHTML) oldPills.outerHTML = newHTML;
        else oldPills.remove();
    } else if (newHTML) {
        wrap.insertAdjacentHTML('beforeend', newHTML);
    }
}

async function toggleReaction(messageId, emoji) {
    const target = currentMessages.find(m => m.id === messageId);
    if (target && (isDeletedMessage(target) || isCallMessage(target))) {
        showToast('Cannot react to this message', '⚠️', 1500);
        return;
    }

    try {
        const existing = (messageReactions[messageId] || []).find(r => r.user_id === currentUser.id);

        if (existing && existing.emoji === emoji) {
            const { error } = await supabase
                .from('message_reactions')
                .delete()
                .eq('message_id', messageId)
                .eq('user_id', currentUser.id);
            if (error) throw error;
            messageReactions[messageId] = messageReactions[messageId].filter(r => r.user_id !== currentUser.id);
        } else if (existing) {
            const { error } = await supabase
                .from('message_reactions')
                .update({ emoji, updated_at: new Date().toISOString() })
                .eq('message_id', messageId)
                .eq('user_id', currentUser.id);
            if (error) throw error;
            existing.emoji = emoji;
        } else {
            const { error } = await supabase
                .from('message_reactions')
                .insert({ message_id: messageId, user_id: currentUser.id, emoji });
            if (error) throw error;
            if (!messageReactions[messageId]) messageReactions[messageId] = [];
            messageReactions[messageId].push({ user_id: currentUser.id, emoji });
        }

        updateReactionPills(messageId);
    } catch (error) {
        console.error('Reaction error:', error);
        showToast('Could not save reaction', '❌', 1500);
    }
}

// ============================================================
// LONG PRESS
// ============================================================
function setupLongPressHandlers() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    container.addEventListener('touchstart', handlePressStart, { passive: true });
    container.addEventListener('touchend', handlePressEnd);
    container.addEventListener('touchmove', handlePressCancel, { passive: true });

    container.addEventListener('mousedown', handlePressStart);
    container.addEventListener('mouseup', handlePressEnd);
    container.addEventListener('mouseleave', handlePressCancel);

    container.addEventListener('contextmenu', (e) => {
        const wrap = e.target.closest('.message-wrap');
        if (wrap) {
            e.preventDefault();
            openActionBar(wrap);
        }
    });

    container.addEventListener('click', (e) => {
        const pill = e.target.closest('.reaction-pill');
        if (pill) {
            e.stopPropagation();
            toggleReaction(parseInt(pill.dataset.messageId), pill.dataset.emoji);
            return;
        }
    });
}

function handlePressStart(e) {
    const wrap = e.target.closest('.message-wrap');
    if (!wrap) return;
    if (e.target.closest('.reaction-pill')) return;
    if (e.target.closest('.message-image-container')) return;
    if (e.target.closest('.quick-reaction-bar')) return;
    if (wrap.querySelector('.call-message')) return;

    longPressTarget = wrap;
    longPressTimer = setTimeout(() => {
        if (longPressTarget === wrap) {
            openActionBar(wrap);
            if (navigator.vibrate) navigator.vibrate(25);
        }
    }, 420);
}

function handlePressEnd() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    longPressTarget = null;
}

function handlePressCancel() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    longPressTarget = null;
}

// ============================================================
// ACTION BAR
// ============================================================
function openActionBar(wrap) {
    const messageId = parseInt(wrap.dataset.wrapId);
    const msg = currentMessages.find(m => m.id === messageId);

    if (msg && isDeletedMessage(msg)) {
        showToast('This message was deleted', '🚫', 1500);
        return;
    }
    if (msg && isCallMessage(msg)) return;

    if (selectedMessageId === messageId && quickBarElement) return;

    closeQuickBar();
    if (selectedMessageEl) selectedMessageEl.classList.remove('selected');

    selectedMessageId = messageId;
    selectedMessageEl = wrap;

    justOpenedAt = Date.now() + 500;

    wrap.classList.add('selected');
    document.body.classList.add('selection-active');

    buildQuickBar(wrap);
}

function buildQuickBar(wrap) {
    closeQuickBar();

    const messageId = parseInt(wrap.dataset.wrapId);
    const msg = currentMessages.find(m => m.id === messageId);
    if (!msg) return;

    const isMine = msg.sender_id === currentUser.id;
    const isImage = !!msg.image_url;
    const isText = !isImage && (msg.content || '').trim().length > 0;
    const myEmoji = (messageReactions[messageId] || []).find(r => r.user_id === currentUser.id)?.emoji;

    const editBtnHTML = (isMine && isText) ? `
        <button class="action-btn-icon" data-action="edit" title="Edit">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
        </button>
    ` : '';

    const deleteBtnHTML = isMine ? `
        <button class="action-btn-icon action-btn-danger" data-action="delete" title="Delete">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"/>
                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
                <path d="M19 6l-.9 13.1A2 2 0 0 1 16.1 21H7.9a2 2 0 0 1-2-1.9L5 6"/>
                <path d="M10 11v6"/>
                <path d="M14 11v6"/>
            </svg>
        </button>
    ` : '';

    const copyBtnHTML = isImage ? '' : `
        <button class="action-btn-icon" data-action="copy" title="Copy">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
        </button>
    `;

    quickBarElement = document.createElement('div');
    quickBarElement.className = 'quick-reaction-bar';
    quickBarElement.id = 'quickReactionBar';
    quickBarElement.innerHTML = `
        <div class="action-bar-row action-bar-top">
            ${copyBtnHTML}
            ${editBtnHTML}
            ${deleteBtnHTML}
            <div class="action-bar-spacer"></div>
            <button class="action-btn-icon action-btn-close" data-action="close" title="Close">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
        <div class="action-bar-row action-bar-emojis">
            ${QUICK_REACTIONS.map(e => `
                <button class="quick-emoji ${myEmoji === e ? 'selected' : ''}" data-emoji="${e}">${e}</button>
            `).join('')}
            <button class="quick-emoji quick-more" data-action="more">＋</button>
        </div>
    `;

    wrap.appendChild(quickBarElement);
    requestAnimationFrame(() => quickBarElement.classList.add('visible'));

    quickBarElement.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            if (action === 'copy') handleCopy();
            else if (action === 'edit') handleEdit();
            else if (action === 'delete') handleDelete();
            else if (action === 'close') closeAll();
            else if (action === 'more') openEmojiGridForSelected();
        });
    });

    quickBarElement.querySelectorAll('.quick-emoji').forEach(btn => {
        if (btn.dataset.action) return;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleReaction(messageId, btn.dataset.emoji);
            closeAll();
        });
    });
}

function closeQuickBar() {
    if (quickBarElement) {
        quickBarElement.classList.remove('visible');
        const el = quickBarElement;
        quickBarElement = null;
        setTimeout(() => el.remove(), 180);
    }
}

function closeAll() {
    if (selectedMessageEl) selectedMessageEl.classList.remove('selected');
    selectedMessageId = null;
    selectedMessageEl = null;
    document.body.classList.remove('selection-active');
    closeQuickBar();
}

function setupGlobalDismiss() {
    document.addEventListener('pointerdown', (e) => {
        if (!selectedMessageId) return;
        if (Date.now() < justOpenedAt) return;
        if (quickBarElement && quickBarElement.contains(e.target)) return;
        if (selectedMessageEl && selectedMessageEl.contains(e.target)) return;
        if (e.target.closest('.reaction-pill')) return;

        closeAll();
    }, true);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && selectedMessageId) closeAll();
    });
}

// ============================================================
// COPY / EDIT / DELETE
// ============================================================
async function handleCopy() {
    if (!selectedMessageId) return;
    const msg = currentMessages.find(m => m.id === selectedMessageId);
    if (!msg) return;
    if (msg.image_url) { closeAll(); return; }

    try {
        const text = (msg.content || '').trim();
        if (!text) {
            showToast('Nothing to copy', '⚠️', 1500);
            closeAll();
            return;
        }
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard', '📋', 1500);
    } catch (e) {
        showToast('Could not copy', '❌', 1500);
    }

    closeAll();
}

function handleEdit() {
    if (!selectedMessageId) return;
    const msg = currentMessages.find(m => m.id === selectedMessageId);
    if (!msg || msg.sender_id !== currentUser.id) return;
    if (msg.image_url) return;
    if (isDeletedMessage(msg) || isCallMessage(msg)) return;

    const msgId = msg.id;
    closeAll();
    setTimeout(() => showEditModal(msgId), 220);
}

function handleDelete() {
    if (!selectedMessageId) return;
    const msg = currentMessages.find(m => m.id === selectedMessageId);
    if (!msg || msg.sender_id !== currentUser.id) return;

    const msgId = msg.id;
    closeAll();

    setTimeout(() => {
        showConfirmAlert(
            'Delete this message?',
            '🗑️', 'Delete Message',
            async () => {
                await performDelete(msgId);
            }
        );
    }, 220);
}

async function performDelete(msgId) {
    try {
        const deletedAt = new Date().toISOString();

        await supabase.from('message_reactions').delete().eq('message_id', msgId);

        const updatePayload = {
            content: '__DELETED__',
            image_url: null,
            thumbnail_url: null,
            color: null,
            edited_at: deletedAt
        };

        let { error } = await supabase
            .from('direct_messages')
            .update(updatePayload)
            .eq('id', msgId);

        if (!error) {
            await supabase
                .from('direct_messages')
                .update({ deleted: true })
                .eq('id', msgId)
                .then(() => {}).catch(() => {});
        }

        if (error) {
            const { error: delErr } = await supabase.from('direct_messages').delete().eq('id', msgId);
            if (delErr) throw delErr;

            currentMessages = currentMessages.filter(m => m.id !== msgId);
            window.currentMessages = currentMessages;
            delete messageReactions[msgId];

            const wrap = document.querySelector(`.message-wrap[data-wrap-id="${msgId}"]`);
            if (wrap) {
                wrap.classList.add('removing');
                setTimeout(() => wrap.remove(), 220);
            }
            showToast('Message deleted', '✅', 1500);
            return;
        }

        const idx = currentMessages.findIndex(m => m.id === msgId);
        if (idx >= 0) {
            currentMessages[idx] = {
                ...currentMessages[idx],
                content: '__DELETED__',
                image_url: null,
                thumbnail_url: null,
                color: null,
                edited_at: deletedAt
            };
            window.currentMessages = currentMessages;
        }
        delete messageReactions[msgId];

        refreshMessageBubble(msgId);
        showToast('Message deleted', '✅', 1500);
    } catch (error) {
        showToast('Could not delete message', '❌', 1500);
    }
}

function showEditModal(msgId) {
    const msg = currentMessages.find(m => m.id === msgId);
    if (!msg) return;

    const modal = document.createElement('div');
    modal.className = 'edit-modal-overlay';
    modal.id = 'editModalOverlay';
    modal.innerHTML = `
        <div class="edit-modal-panel">
            <div class="edit-modal-header">
                <h3>Edit message</h3>
                <button class="edit-modal-close" id="editModalClose">×</button>
            </div>
            <textarea class="edit-modal-input" id="editModalInput" rows="4">${escapeHtml(msg.content || '')}</textarea>
            <div class="edit-modal-actions">
                <button class="btn-secondary" id="editModalCancel">Cancel</button>
                <button class="btn-primary" id="editModalSave">Save</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('visible'));

    const input = document.getElementById('editModalInput');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    const close = () => {
        modal.classList.remove('visible');
        setTimeout(() => modal.remove(), 220);
    };

    document.getElementById('editModalClose').onclick = close;
    document.getElementById('editModalCancel').onclick = close;

    document.getElementById('editModalSave').onclick = async () => {
        const newText = input.value.trim();
        if (!newText) { showToast('Message cannot be empty', '⚠️', 1500); return; }
        if (newText === msg.content) { close(); return; }

        try {
            const editedAt = new Date().toISOString();
            const { error } = await supabase
                .from('direct_messages')
                .update({ content: newText, edited_at: editedAt })
                .eq('id', msg.id);
            if (error) throw error;

            msg.content = newText;
            msg.edited_at = editedAt;

            refreshMessageBubble(msg.id);
            showToast('Message updated', '✅', 1500);
            close();
        } catch (error) {
            showToast('Could not edit message', '❌', 1500);
        }
    };
}

function openEmojiGridForSelected() {
    if (!selectedMessageId) return;
    const messageId = selectedMessageId;

    const modal = document.createElement('div');
    modal.className = 'emoji-picker-overlay';
    modal.id = 'emojiPickerOverlay';
    modal.innerHTML = `
        <div class="emoji-picker-panel">
            <div class="emoji-picker-header">
                <span>Choose a reaction</span>
                <button class="emoji-picker-close">×</button>
            </div>
            <div class="emoji-picker-grid">
                ${PICKER_EMOJIS.map(e => `<button class="emoji-cell" data-emoji="${e}">${e}</button>`).join('')}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('visible'));

    const close = () => {
        modal.classList.remove('visible');
        setTimeout(() => modal.remove(), 220);
    };

    modal.querySelector('.emoji-picker-close').onclick = close;

    modal.querySelectorAll('.emoji-cell').forEach(btn => {
        btn.addEventListener('click', () => {
            toggleReaction(messageId, btn.dataset.emoji);
            close();
            closeAll();
        });
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });
}

// ============================================================
// REALTIME
// ============================================================
function setupRealtime(friendId) {
    const userIds = [currentUser.id, friendId].sort();
    const channelName = `chat:${userIds[0]}:${userIds[1]}`;

    [chatChannel, statusChannel, typingChannel, reactionsChannel].forEach(ch => {
        if (ch) supabase.removeChannel(ch);
    });
    chatChannel = statusChannel = typingChannel = reactionsChannel = null;

    chatChannel = supabase.channel(channelName)
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'direct_messages'
        }, (payload) => {
            const newMsg = payload.new;
            const isOurConversation =
                (newMsg.sender_id === currentUser.id && newMsg.receiver_id === friendId) ||
                (newMsg.sender_id === friendId && newMsg.receiver_id === currentUser.id);
            if (!isOurConversation) return;
            if (document.querySelector(`[data-message-id="${newMsg.id}"]`)) return;

            if (!currentMessages.some(msg => msg.id === newMsg.id)) {
                currentMessages.push(newMsg);
                window.currentMessages = currentMessages;
            }
            addMessageToUI(newMsg, true);

            if (newMsg.receiver_id === currentUser.id && newMsg.message_type !== 'call') {
                supabase
                    .from('direct_messages')
                    .update({ read: true })
                    .eq('id', newMsg.id)
                    .then(() => {}).catch(() => {});
            }
        })
        .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'direct_messages'
        }, (payload) => {
            const updated = payload.new;
            const idx = currentMessages.findIndex(m => m.id === updated.id);
            if (idx >= 0) {
                currentMessages[idx] = { ...currentMessages[idx], ...updated };
                window.currentMessages = currentMessages;
            }
            if (isDeletedMessage(updated)) {
                delete messageReactions[updated.id];
            }
            refreshMessageBubble(updated.id);
            if (!isCallMessage(updated)) updateReactionPills(updated.id);
        })
        .on('postgres_changes', {
            event: 'DELETE', schema: 'public', table: 'direct_messages'
        }, (payload) => {
            const deleted = payload.old;
            if (!deleted?.id) return;
            const wrap = document.querySelector(`.message-wrap[data-wrap-id="${deleted.id}"]`);
            if (wrap) {
                wrap.classList.add('removing');
                setTimeout(() => wrap.remove(), 220);
            }
            currentMessages = currentMessages.filter(m => m.id !== deleted.id);
            window.currentMessages = currentMessages;
            delete messageReactions[deleted.id];
        })
        .subscribe();

    window.chatChannel = chatChannel;

    statusChannel = supabase.channel(`status:${friendId}`)
        .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'profiles',
            filter: `id=eq.${friendId}`
        }, (payload) => {
            if (payload.new.id === friendId && chatFriend) {
                chatFriend.status = payload.new.status;
                chatFriend.last_seen = payload.new.last_seen || chatFriend.last_seen;
                window.chatFriend = chatFriend;
                updateFriendStatus(payload.new.status, payload.new.last_seen);

                if (payload.new.avatar_url && payload.new.avatar_url !== chatFriend.avatar_url) {
                    chatFriend.avatar_url = payload.new.avatar_url;
                    const el = document.getElementById('chatUserAvatar');
                    if (el) el.innerHTML = `<img src="${payload.new.avatar_url}" alt="${chatFriend.username}">`;
                }
            }
        })
        .subscribe();

    window.statusChannel = statusChannel;

    reactionsChannel = supabase.channel(`reactions:${userIds[0]}:${userIds[1]}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' },
            (payload) => handleReactionChange(payload.new))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_reactions' },
            (payload) => handleReactionChange(payload.new))
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' },
            (payload) => handleReactionDelete(payload.old))
        .subscribe();

    window.reactionsChannel = reactionsChannel;
}

function handleReactionChange(row) {
    const messageId = row.message_id;
    const msg = currentMessages.find(m => m.id === messageId);
    if (msg && (isDeletedMessage(msg) || isCallMessage(msg))) return;

    if (!document.querySelector(`[data-message-id="${messageId}"]`)) return;
    if (!messageReactions[messageId]) messageReactions[messageId] = [];
    messageReactions[messageId] = messageReactions[messageId].filter(r => r.user_id !== row.user_id);
    messageReactions[messageId].push({ user_id: row.user_id, emoji: row.emoji });
    updateReactionPills(messageId);
}

function handleReactionDelete(row) {
    const messageId = row.message_id;
    if (!messageReactions[messageId]) return;
    messageReactions[messageId] = messageReactions[messageId].filter(r => r.user_id !== row.user_id);
    updateReactionPills(messageId);
}

// ============================================================
// TYPING
// ============================================================
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

    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        window.isTyping = false;
        sendTypingStatus(false);
        typingTimeout = null;
    }, 2000);
}

async function sendTypingStatus(isTyping) {
    if (!chatFriend || !currentUser) return;
    try {
        const userIds = [currentUser.id, chatFriend.id].sort();
        const channel = supabase.channel(`typing:${userIds[0]}:${userIds[1]}`);
        await channel.subscribe();
        await channel.send({
            type: 'broadcast', event: 'typing',
            payload: { userId: currentUser.id, isTyping }
        });
        setTimeout(() => supabase.removeChannel(channel), 5000);
    } catch (e) {}
}

function setupTypingReceiver(friendId) {
    if (typingChannel) {
        supabase.removeChannel(typingChannel);
        typingChannel = null;
    }

    const userIds = [currentUser.id, friendId].sort();
    typingChannel = supabase.channel(`typing:${userIds[0]}:${userIds[1]}`)
        .on('broadcast', { event: 'typing' }, (payload) => {
            if (payload.payload?.userId === friendId) {
                if (payload.payload.isTyping) {
                    const text = document.getElementById('typingText');
                    if (text && chatFriend) text.textContent = `${chatFriend.username} is typing...`;
                    showTypingIndicator(true);
                    if (friendTypingTimeout) clearTimeout(friendTypingTimeout);
                    friendTypingTimeout = setTimeout(() => showTypingIndicator(false), 3000);
                } else {
                    showTypingIndicator(false);
                }
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
        if (input && input.value === '/') return;
        if (input && input.value.trim()) sendMessage();
    }
}

function autoResize(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = textarea.value.trim() === '';
}

function goBack() {
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) backBtn.innerHTML = '<div class="loading-spinner-small"></div>';

    [chatChannel, statusChannel, typingChannel, reactionsChannel, callsChannel].forEach(ch => {
        if (ch) supabase.removeChannel(ch);
    });
    if (typingTimeout) clearTimeout(typingTimeout);
    if (friendTypingTimeout) clearTimeout(friendTypingTimeout);

    setTimeout(() => window.location.href = '../home/index.html', 50);
}

function openFriendProfile(friendId) {
    if (!friendId) return;
    window.location.href = `../home/profile/view.html?userId=${friendId}`;
}

function showUserInfo() {
    if (!chatFriend) return;
    const modal = document.getElementById('userInfoModal');
    const content = document.getElementById('userInfoContent');
    const isOnline = chatFriend.status === 'online';
    const initial = chatFriend.username ? chatFriend.username.charAt(0).toUpperCase() : '?';

    content.innerHTML = `
        <div class="user-info-avatar">
            ${chatFriend.avatar_url
                ? `<img src="${chatFriend.avatar_url}">`
                : `<span>${initial}</span>`}
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
            <button class="info-action-btn" onclick="openFriendProfile('${chatFriend.id}')">👤 View Profile</button>
            <button class="info-action-btn danger" onclick="blockUserPrompt()">🚫 Block User</button>
        </div>
    `;

    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));
}

function closeModal() {
    const modal = document.getElementById('userInfoModal');
    if (modal) {
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 200);
    }
}

function blockUserPrompt() {
    showConfirmAlert(
        `Are you sure you want to block ${chatFriend.username}?`,
        '🚫', 'Block User',
        () => {
            showToast('User blocked!', '✅', 1500);
            setTimeout(goBack, 800);
        }
    );
}

async function clearChatPrompt() {
    showConfirmAlert(
        'Are you sure you want to clear all messages?',
        '🗑️', 'Clear Chat',
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
                messageReactions = {};
                showMessages([]);
            } catch (error) {
                showToast('Error clearing chat', '❌', 1500);
            }
        }
    );
}

function openGuide() {
    const modal = document.getElementById('guideModal');
    if (!modal) return;

    const bodyEl = modal.querySelector('.guide-body');
    if (bodyEl) {
        bodyEl.innerHTML = `
            <div class="guide-item">
                <div class="guide-icon">💬</div>
                <div>
                    <strong>Send a message</strong>
                    <p>Type in the box at the bottom and tap the send button.</p>
                </div>
            </div>
            <div class="guide-item">
                <div class="guide-icon">🖼️</div>
                <div>
                    <strong>Share images</strong>
                    <p>Tap the paperclip icon, then choose Camera or Gallery. You can send up to 10 images at once.</p>
                </div>
            </div>
            <div class="guide-item">
                <div class="guide-icon">🎨</div>
                <div>
                    <strong>Color your message</strong>
                    <p>Type <code>/</code> in the message box → pick a color → your next message uses it.</p>
                </div>
            </div>
            <div class="guide-item">
                <div class="guide-icon">📞</div>
                <div>
                    <strong>Calls</strong>
                    <p>Missed, declined, and completed calls show up right in the chat as their own bubbles.</p>
                </div>
            </div>
            <div class="guide-item">
                <div class="guide-icon">😀</div>
                <div>
                    <strong>React to messages</strong>
                    <p>Long-press any message → pick an emoji. Tap the same emoji to remove it.</p>
                </div>
            </div>
            <div class="guide-item">
                <div class="guide-icon">📋</div>
                <div>
                    <strong>Copy a message</strong>
                    <p>Long-press → tap the copy icon. Images don't show copy.</p>
                </div>
            </div>
            <div class="guide-item">
                <div class="guide-icon">✏️</div>
                <div>
                    <strong>Edit your message</strong>
                    <p>Long-press your own message → tap the pencil icon.</p>
                </div>
            </div>
            <div class="guide-item">
                <div class="guide-icon">🗑️</div>
                <div>
                    <strong>Delete your message or image</strong>
                    <p>Long-press → tap the trash icon. Works for text and images.</p>
                </div>
            </div>
            <div class="guide-item">
                <div class="guide-icon">📞</div>
                <div>
                    <strong>Voice / video call</strong>
                    <p>Tap the phone icon in the top-right corner.</p>
                </div>
            </div>
        `;
    }

    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));
}

function closeGuide() {
    const modal = document.getElementById('guideModal');
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => modal.style.display = 'none', 220);
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) container.scrollTop = container.scrollHeight;
}

function forceScrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
}

function showLoading(show, text = 'Sending...') {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="loading-overlay" id="loadingOverlay" style="display: none;">
                <div class="loading-spinner"></div>
                <p class="loading-text">${text}</p>
            </div>
        `);
        overlay = document.getElementById('loadingOverlay');
    }
    if (show) {
        overlay.querySelector('.loading-text').textContent = text;
        overlay.style.display = 'flex';
        setTimeout(() => overlay.style.opacity = '1', 10);
    } else {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 150);
    }
}

function refreshChat() {
    const friendId = new URLSearchParams(window.location.search).get('friendId');
    if (friendId) {
        loadOldMessages(friendId);
        showToast('Chat refreshed', '🔄', 1500);
    }
}

function reconnectRealtime() {
    const friendId = new URLSearchParams(window.location.search).get('friendId');
    if (friendId) {
        setupRealtime(friendId);
        setupCallsListener(friendId);
        showToast('Reconnected', '🔗', 1500);
    }
}

let sentAudio = null;
let receivedAudio = null;

function playSentSound() {
    try {
        if (!sentAudio) {
            sentAudio = new Audio('/pages/chats/sent.mp3');
            sentAudio.volume = 0.3;
        }
        sentAudio.currentTime = 0;
        sentAudio.play().catch(() => {});
    } catch (e) {}
}

function playReceivedSound() {
    try {
        if (!receivedAudio) {
            receivedAudio = new Audio('/pages/chats/recieve.mp3');
            receivedAudio.volume = 0.3;
        }
        receivedAudio.currentTime = 0;
        receivedAudio.play().catch(() => {});
    } catch (e) {}
}

function showCustomAlert(message, icon = '❌', title = 'Alert', callback = null) {
    const modal = document.getElementById('customAlert');
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertIcon').textContent = icon;
    document.getElementById('alertMessage').textContent = message;
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));

    document.getElementById('alertConfirm').onclick = () => {
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 200);
        if (callback) callback();
    };
}

function showConfirmAlert(message, icon = '❓', title = 'Confirm', onConfirm = null) {
    const modal = document.getElementById('customAlert');
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertIcon').textContent = icon;
    document.getElementById('alertMessage').textContent = message;

    const cancelBtn = document.getElementById('alertCancel');
    cancelBtn.style.display = 'flex';
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));

    document.getElementById('alertConfirm').onclick = () => {
        modal.classList.remove('visible');
        cancelBtn.style.display = 'none';
        setTimeout(() => modal.style.display = 'none', 200);
        if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = () => {
        modal.classList.remove('visible');
        cancelBtn.style.display = 'none';
        setTimeout(() => modal.style.display = 'none', 200);
    };
}

function showToast(message, icon = '✅', duration = 1500) {
    const toast = document.getElementById('customToast');
    document.getElementById('toastMessage').textContent = message;
    document.getElementById('toastIcon').textContent = icon;
    toast.style.display = 'flex';
    setTimeout(() => toast.style.display = 'none', duration);
}

function updateFriendStatus(status, lastSeen) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');

    if (status === 'online') {
        dot.className = 'status-dot';
        text.textContent = 'Online';
    } else {
        dot.className = 'status-dot offline';
        text.textContent = lastSeen ? `Last seen ${formatLastSeen(lastSeen)}` : 'Offline';
    }
}

function formatLastSeen(ts) {
    try {
        const now = new Date();
        const t = new Date(ts);
        const diffMs = now - t;
        const sec = Math.floor(diffMs / 1000);
        const min = Math.floor(sec / 60);
        const hr = Math.floor(min / 60);
        const day = Math.floor(hr / 24);

        if (sec < 60) return 'now';
        if (min < 60) return `${min}m`;
        if (hr < 24) return `${hr}h`;
        if (day === 1) return '1d';
        if (day < 7) return `${day}d`;
        if (day < 30) return `${Math.floor(day / 7)}w`;
        return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
        return 'offline';
    }
}

window.addEventListener('beforeunload', () => {
    [chatChannel, statusChannel, typingChannel, reactionsChannel, callsChannel].forEach(ch => {
        if (ch) supabase.removeChannel(ch);
    });
});

console.log('✅ Chat core ready');