import { auth } from '../../utils/auth.js';
import { supabase } from '../../utils/supabase.js';

console.log('✨ Chat Core initialized');

// ============================================================
// CORE VARIABLES
// ============================================================
let currentUser = null;
let chatFriend = null;
let chatChannel = null;
let statusChannel = null;
let typingChannel = null;
let reactionsChannel = null;
let isLoadingMessages = false;
let currentMessages = [];
let isSending = false;
let isTyping = false;
let typingTimeout = null;
let friendTypingTimeout = null;

let messageReactions = {};

// Long-press / selection state
let longPressTimer = null;
let longPressTarget = null;
let selectedMessageId = null;
let selectedMessageEl = null;
let toolbarElement = null;

// Global coordination
window.colorPickerVisible = false;
window.currentMessages = currentMessages;
window.currentUser = null;
window.chatFriend = null;
window.isSending = false;
window.isTyping = false;

// ============================================================
// EXPORTS
// ============================================================
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

if (window.chatModules) {
    window.chatModules.coreLoaded = true;
}

// ============================================================
// REACTION CONSTANTS
// ============================================================
const QUICK_REACTIONS = ['🥀', '💕', '🫂', '😭'];

const PICKER_EMOJIS = [
    '🥀', '💕', '🫂', '😭', '😂', '❤️',
    '🔥', '👍', '👎', '😮', '😢', '😡',
    '🙏', '🎉', '💯', '😍', '😘', '🤔',
    '😴', '🤯', '🥺', '😈', '💀', '🤝',
    '✨', '🙌', '👏', '🥰', '😅', '🤗'
];

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { success, user } = await auth.getCurrentUser();
        if (!success || !user) {
            showLoginScreen();
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
        window.chatFriend = friend;

        const chatUserAvatar = document.getElementById('chatUserAvatar');
        const friendInitial = friend.username ? friend.username.charAt(0).toUpperCase() : '?';

        if (friend.avatar_url) {
            chatUserAvatar.innerHTML = `<img src="${friend.avatar_url}" alt="${friend.username}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        } else {
            chatUserAvatar.textContent = friendInitial;
        }

        document.getElementById('chatUserName').textContent = friend.username;
        updateFriendStatus(friend.status);

        // Clickable header → friend profile
        const clickableHeader = document.getElementById('chatHeaderProfile');
        if (clickableHeader) {
            clickableHeader.addEventListener('click', () => openFriendProfile(friend.id));
        }

        await loadOldMessages(friendId);
        setupRealtime(friendId);
        setupTypingListener();
        setupTypingReceiver(friendId);
        setupTypingIndicator();
        updateInputListener();
        setupBackButtonPrevention();
        setupLongPressHandlers();
        setupGlobalDismiss();

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
        showCustomAlert('Error loading chat: ' + error.message, '❌', 'Error', () => {
            window.location.href = '../home/index.html';
        });
    }
});

// ============================================================
// LOGIN SCREEN
// ============================================================
function showLoginScreen() {
    document.getElementById("login").style.display = "block";
    document.getElementById("chat").style.display = "none";

    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    if (loginBtn) loginBtn.onclick = () => window.location.href = '../login/index.html';
    if (signupBtn) signupBtn.onclick = () => window.location.href = '../auth/index.html';
}

// ============================================================
// BACK BUTTON
// ============================================================
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

// ============================================================
// TYPING INDICATOR
// ============================================================
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
    const originalHTML = sendBtn.innerHTML;

    try {
        sendBtn.innerHTML = `<svg class="send-icon" viewBox="0 0 24 24" style="opacity: 0.5"><path d="M2,21L23,12L2,3V10L17,12L2,14V21Z"/></svg>`;
        sendBtn.disabled = true;

        const messageData = {
            sender_id: currentUser.id,
            receiver_id: chatFriend.id,
            content: text,
            chat_id: chatFriend.id,
            created_at: new Date().toISOString()
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
        sendBtn.innerHTML = originalHTML;
        sendBtn.disabled = false;
    }
}

// ============================================================
// LOAD OLD MESSAGES
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

        await loadReactionsForMessages(currentMessages.map(m => m.id));

        showMessages(currentMessages);
    } catch (error) {
        console.error('Load error:', error);
        showMessages([]);
    } finally {
        isLoadingMessages = false;
    }
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
    } catch (e) {
        console.warn('Failed to load reactions:', e.message);
    }
}

// ============================================================
// RENDER MESSAGES
// ============================================================
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

        const color = msg.color || null;
        const colorAttr = color ? `data-color="${color}"` : '';

        let messageHTML = '';
        if (msg.image_url) {
            if (typeof window.createImageMessageHTML === 'function') {
                messageHTML = window.createImageMessageHTML(msg, isSent, colorAttr, time);
            } else {
                messageHTML = `
                    <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${msg.id}" ${colorAttr}>
                        <div class="message-content">📸 Image shared</div>
                        <div class="message-time">${time}</div>
                    </div>
                `;
            }
        } else {
            messageHTML = `
                <div class="message ${isSent ? 'sent' : 'received'}" data-message-id="${msg.id}" ${colorAttr}>
                    <div class="message-content">${escapeHtml(msg.content || '')}</div>
                    <div class="message-time">${time}</div>
                </div>
            `;
        }

        html += `<div class="message-wrap ${isSent ? 'sent' : 'received'}" data-wrap-id="${msg.id}">${messageHTML}${renderReactionPills(msg.id)}</div>`;
    });

    container.innerHTML = html;
    setupTypingIndicator();

    setTimeout(() => forceScrollToBottom(), 50);
}

function addMessageToUI(message, isFromRealtime = false) {
    const container = document.getElementById('messagesContainer');
    if (!container || !message) return;

    if (container.querySelector('.empty-chat')) {
        container.innerHTML = '';
    }

    const isSent = message.sender_id === currentUser.id;
    const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const color = message.color || null;
    const colorAttr = color ? `data-color="${color}"` : '';

    let messageHTML = '';
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
                <div class="message-content">${escapeHtml(message.content || '')}</div>
                <div class="message-time">${time}</div>
            </div>
        `;
    }

    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) typingIndicator.remove();

    const wrap = document.createElement('div');
    wrap.className = `message-wrap ${isSent ? 'sent' : 'received'}`;
    wrap.dataset.wrapId = message.id;
    wrap.innerHTML = messageHTML + renderReactionPills(message.id);
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
            bubble.style.transition = 'all 0.2s cubic-bezier(0.22, 1, 0.36, 1)';
            bubble.style.opacity = '1';
            bubble.style.transform = 'translateY(0)';
        }, 10);
    }

    setTimeout(() => forceScrollToBottom(), 10);

    if (message.sender_id === chatFriend.id) {
        playReceivedSound();
        if (!document.hasFocus()) {
            const originalTitle = document.title;
            document.title = '💬 ' + chatFriend.username;
            setTimeout(() => document.title = originalTitle, 800);
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// REACTION PILLS
// ============================================================
function renderReactionPills(messageId) {
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
        if (newHTML) {
            oldPills.outerHTML = newHTML;
        } else {
            oldPills.remove();
        }
    } else if (newHTML) {
        wrap.insertAdjacentHTML('beforeend', newHTML);
    }
}

// ============================================================
// TOGGLE REACTION
// ============================================================
async function toggleReaction(messageId, emoji) {
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
// LONG PRESS + SELECTION + TOOLBAR
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
            selectMessage(wrap);
        }
    });

    // Tap on pill = toggle
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

    // Don't interfere if user tapped a pill or interactive element inside image
    if (e.target.closest('.reaction-pill')) return;

    longPressTarget = wrap;
    longPressTimer = setTimeout(() => {
        if (longPressTarget === wrap) {
            selectMessage(wrap);
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

function selectMessage(wrap) {
    clearSelection();
    closeToolbar();

    selectedMessageId = parseInt(wrap.dataset.wrapId);
    selectedMessageEl = wrap;

    wrap.classList.add('selected');

    buildTopToolbar();
}

function clearSelection() {
    if (selectedMessageEl) {
        selectedMessageEl.classList.remove('selected');
    }
    selectedMessageId = null;
    selectedMessageEl = null;
}

function buildTopToolbar() {
    const msg = currentMessages.find(m => m.id === selectedMessageId);
    if (!msg) return;

    const isMine = msg.sender_id === currentUser.id;
    const isImage = !!msg.image_url;
    const isText = !isImage && (msg.content || '').trim().length > 0;

    const myEmoji = (messageReactions[selectedMessageId] || []).find(r => r.user_id === currentUser.id)?.emoji;

    toolbarElement = document.createElement('div');
    toolbarElement.className = 'message-context-menu';
    toolbarElement.id = 'messageContextMenu';

    toolbarElement.innerHTML = `
        <div class="context-toolbar">
            <button class="context-btn" data-action="copy" title="Copy">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
            </button>
            ${isMine && isText ? `
            <button class="context-btn" data-action="edit" title="Edit">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
            </button>
            ` : ''}
            ${isMine ? `
            <button class="context-btn context-btn-danger" data-action="delete" title="Delete">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>
            ` : ''}
        </div>
        <div class="context-reactions">
            ${QUICK_REACTIONS.map(e => `
                <button class="context-emoji ${myEmoji === e ? 'selected' : ''}" data-emoji="${e}">${e}</button>
            `).join('')}
            <button class="context-emoji context-more" data-action="more">＋</button>
        </div>
    `;

    document.body.appendChild(toolbarElement);

    // Animate in
    requestAnimationFrame(() => {
        toolbarElement.classList.add('visible');
    });

    // Handle button clicks
    toolbarElement.querySelectorAll('.context-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            if (action === 'copy') handleCopy();
            else if (action === 'edit') handleEdit();
            else if (action === 'delete') handleDelete();
        });
    });

    toolbarElement.querySelectorAll('.context-emoji').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (btn.dataset.action === 'more') {
                openEmojiGridForSelected();
            } else {
                toggleReaction(selectedMessageId, btn.dataset.emoji);
                closeToolbar();
            }
        });
    });
}

function closeToolbar() {
    if (toolbarElement) {
        toolbarElement.classList.remove('visible');
        const el = toolbarElement;
        toolbarElement = null;
        setTimeout(() => el.remove(), 200);
    }
}

function setupGlobalDismiss() {
    document.addEventListener('click', (e) => {
        if (!selectedMessageId) return;
        // Tap inside toolbar — ignore
        if (toolbarElement && toolbarElement.contains(e.target)) return;
        // Tap on a pill — handled separately
        if (e.target.closest('.reaction-pill')) return;
        // Tap on selected message — ignore
        if (selectedMessageEl && selectedMessageEl.contains(e.target)) return;

        clearSelection();
        closeToolbar();
    }, true);

    // Scroll closes
    const container = document.getElementById('messagesContainer');
    if (container) {
        container.addEventListener('scroll', () => {
            if (selectedMessageId) {
                clearSelection();
                closeToolbar();
            }
        }, { passive: true });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && selectedMessageId) {
            clearSelection();
            closeToolbar();
        }
    });
}

// ============================================================
// COPY / EDIT / DELETE
// ============================================================
async function handleCopy() {
    if (!selectedMessageId) return;
    const msg = currentMessages.find(m => m.id === selectedMessageId);
    if (!msg) return;

    const isImage = !!msg.image_url;

    try {
        if (isImage) {
            // Try to copy the image itself
            try {
                const res = await fetch(msg.image_url);
                const blob = await res.blob();

                // Only proceed if ClipboardItem is supported
                if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
                    await navigator.clipboard.write([
                        new ClipboardItem({ [blob.type]: blob })
                    ]);
                    showToast('Image copied', '📋', 1500);
                    clearSelection();
                    closeToolbar();
                    return;
                }
            } catch (imgErr) {
                // Silent — don't fall back to URL, per user's request
            }
            // If image copy failed, do nothing
            showToast('Copy not supported for images', '⚠️', 1500);
        } else {
            const text = (msg.content || '').trim();
            if (!text) {
                showToast('Nothing to copy', '⚠️', 1500);
                clearSelection();
                closeToolbar();
                return;
            }
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard', '📋', 1500);
        }
    } catch (e) {
        console.error('Copy failed:', e);
        showToast('Could not copy', '❌', 1500);
    }

    clearSelection();
    closeToolbar();
}

function handleEdit() {
    if (!selectedMessageId) return;
    const msg = currentMessages.find(m => m.id === selectedMessageId);
    if (!msg || msg.sender_id !== currentUser.id) return;
    if (msg.image_url) return;

    closeToolbar();
    showEditModal(msg);
}

function handleDelete() {
    if (!selectedMessageId) return;
    const msg = currentMessages.find(m => m.id === selectedMessageId);
    if (!msg || msg.sender_id !== currentUser.id) return;

    closeToolbar();
    showConfirmAlert(
        'Delete this message?',
        '🗑️', 'Delete Message',
        async () => {
            try {
                await supabase.from('message_reactions').delete().eq('message_id', msg.id);
                const { error } = await supabase.from('direct_messages').delete().eq('id', msg.id);
                if (error) throw error;

                currentMessages = currentMessages.filter(m => m.id !== msg.id);
                window.currentMessages = currentMessages;
                delete messageReactions[msg.id];

                const wrap = document.querySelector(`.message-wrap[data-wrap-id="${msg.id}"]`);
                if (wrap) {
                    wrap.classList.add('removing');
                    setTimeout(() => wrap.remove(), 200);
                }
                clearSelection();
                showToast('Message deleted', '✅', 1500);
            } catch (error) {
                console.error('Delete failed:', error);
                showToast('Could not delete message', '❌', 1500);
            }
        }
    );
}

function showEditModal(msg) {
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
        setTimeout(() => modal.remove(), 200);
    };

    document.getElementById('editModalClose').onclick = close;
    document.getElementById('editModalCancel').onclick = close;

    document.getElementById('editModalSave').onclick = async () => {
        const newText = input.value.trim();
        if (!newText) {
            showToast('Message cannot be empty', '⚠️', 1500);
            return;
        }
        if (newText === msg.content) {
            close();
            return;
        }

        try {
            const { error } = await supabase
                .from('direct_messages')
                .update({ content: newText, edited_at: new Date().toISOString() })
                .eq('id', msg.id);
            if (error) throw error;

            msg.content = newText;
            msg.edited_at = new Date().toISOString();

            const bubble = document.querySelector(`.message-wrap[data-wrap-id="${msg.id}"] .message-content`);
            if (bubble) bubble.textContent = newText;

            showToast('Message updated', '✅', 1500);
            close();
        } catch (error) {
            console.error('Edit failed:', error);
            showToast('Could not edit message', '❌', 1500);
        }
    };
}

// ============================================================
// EMOJI PICKER (for "+" in toolbar)
// ============================================================
function openEmojiGridForSelected() {
    if (!selectedMessageId) return;

    const messageId = selectedMessageId;
    closeToolbar();
    // Keep selection for context, but hide menu
    if (selectedMessageEl) selectedMessageEl.classList.remove('selected');
    selectedMessageId = null;
    selectedMessageEl = null;

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
        })
        .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'direct_messages'
        }, (payload) => {
            const updated = payload.new;
            const idx = currentMessages.findIndex(m => m.id === updated.id);
            if (idx >= 0) {
                currentMessages[idx] = { ...currentMessages[idx], ...updated };
                const bubble = document.querySelector(`.message-wrap[data-wrap-id="${updated.id}"] .message-content`);
                if (bubble) bubble.textContent = updated.content || '';
            }
        })
        .on('postgres_changes', {
            event: 'DELETE', schema: 'public', table: 'direct_messages'
        }, (payload) => {
            const deleted = payload.old;
            if (!deleted?.id) return;
            const wrap = document.querySelector(`.message-wrap[data-wrap-id="${deleted.id}"]`);
            if (wrap) {
                wrap.classList.add('removing');
                setTimeout(() => wrap.remove(), 200);
            }
            currentMessages = currentMessages.filter(m => m.id !== deleted.id);
            window.currentMessages = currentMessages;
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
                updateFriendStatus(payload.new.status);

                if (payload.new.avatar_url && payload.new.avatar_url !== chatFriend.avatar_url) {
                    chatFriend.avatar_url = payload.new.avatar_url;
                    const el = document.getElementById('chatUserAvatar');
                    if (el) el.innerHTML = `<img src="${payload.new.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
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

// ============================================================
// INPUT
// ============================================================
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

// ============================================================
// NAVIGATION
// ============================================================
function goBack() {
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) backBtn.innerHTML = '<div class="loading-spinner-small"></div>';

    [chatChannel, statusChannel, typingChannel, reactionsChannel].forEach(ch => {
        if (ch) supabase.removeChannel(ch);
    });
    if (typingTimeout) clearTimeout(typingTimeout);
    if (friendTypingTimeout) clearTimeout(friendTypingTimeout);

    setTimeout(() => window.location.href = '../home/index.html', 50);
}

function openFriendProfile(friendId) {
    if (!friendId) return;
    window.location.href = `../profile/view.html?userId=${friendId}`;
}

// ============================================================
// USER INFO / MODALS
// ============================================================
function showUserInfo() {
    if (!chatFriend) return;

    const modal = document.getElementById('userInfoModal');
    const content = document.getElementById('userInfoContent');
    const isOnline = chatFriend.status === 'online';
    const initial = chatFriend.username ? chatFriend.username.charAt(0).toUpperCase() : '?';

    content.innerHTML = `
        <div class="user-info-avatar" style="background: linear-gradient(45deg, #007acc, #00b4d8);">
            ${chatFriend.avatar_url
                ? `<img src="${chatFriend.avatar_url}" style="width:100%;height:100%;object-fit:cover;">`
                : `<span style="color:white;font-size:2rem;font-weight:600;">${initial}</span>`}
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
            <button class="info-action-btn" onclick="openFriendProfile('${chatFriend.id}')">
                👤 View Profile
            </button>
            <button class="info-action-btn danger" onclick="blockUserPrompt()">🚫 Block User</button>
        </div>
    `;

    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('userInfoModal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => modal.style.display = 'none', 150);
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

// ============================================================
// CLEAR CHAT
// ============================================================
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

// ============================================================
// GUIDE
// ============================================================
function openGuide() {
    const modal = document.getElementById('guideModal');
    if (!modal) return;
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));
}

function closeGuide() {
    const modal = document.getElementById('guideModal');
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => modal.style.display = 'none', 200);
}

// ============================================================
// SCROLL
// ============================================================
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) container.scrollTop = container.scrollHeight;
}

function forceScrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
    }, 50);
}

// ============================================================
// LOADING
// ============================================================
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

// ============================================================
// REFRESH
// ============================================================
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
        showToast('Reconnected', '🔗', 1500);
    }
}

// ============================================================
// SOUNDS (cached to avoid repeat fetches)
// ============================================================
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

// ============================================================
// ALERTS
// ============================================================
function showCustomAlert(message, icon = '❌', title = 'Alert', callback = null) {
    const modal = document.getElementById('customAlert');
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertIcon').textContent = icon;
    document.getElementById('alertMessage').textContent = message;
    modal.style.display = 'flex';

    document.getElementById('alertConfirm').onclick = () => {
        modal.style.display = 'none';
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

    document.getElementById('alertConfirm').onclick = () => {
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
    document.getElementById('toastMessage').textContent = message;
    document.getElementById('toastIcon').textContent = icon;
    toast.style.display = 'flex';
    setTimeout(() => toast.style.display = 'none', duration);
}

function updateFriendStatus(status) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    if (status === 'online') {
        dot.className = 'status-dot';
        text.textContent = 'Online';
    } else {
        dot.className = 'status-dot offline';
        text.textContent = 'Offline';
    }
}

// ============================================================
// CLEANUP
// ============================================================
window.addEventListener('beforeunload', () => {
    [chatChannel, statusChannel, typingChannel, reactionsChannel].forEach(ch => {
        if (ch) supabase.removeChannel(ch);
    });
});

console.log('✅ Chat core ready');