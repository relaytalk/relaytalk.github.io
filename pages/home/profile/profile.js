// profile.js - Profile with IMGBB Avatar + Notifications + Bio + Guide

import { initializeSupabase } from '../../../utils/supabase.js';

const IMGBB_API_KEY = '82e49b432e2ee14921f7d0cd81ba5551';

let supabase = null;
let currentUser = null;
let currentProfile = null;
let currentShowDetails = true;
let currentBio = '';
let notificationsEnabled = false;
let currentNotifTab = 'main';

// Prevents stale avatar renders from winning a race against newer ones
let avatarRenderToken = 0;

// ============================================================
// NATIVE DETECTION
// ============================================================
function isNativeShell() {
    return !!(
        window.Capacitor &&
        window.Capacitor.isNativePlatform &&
        window.Capacitor.isNativePlatform()
    );
}

// ============================================================
// INIT
// ============================================================
async function initProfilePage() {
    try {
        supabase = await initializeSupabase();

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!session) {
            window.location.href = '../../login/index.html';
            return;
        }

        currentUser = session.user;

        await Promise.all([
            loadProfile(),
            new Promise(resolve => setTimeout(resolve, 400))
        ]);

        const loader = document.getElementById('loadingIndicator');
        if (loader) loader.style.display = 'none';

        await refreshNotificationState();
        updateDetailsToggle();
        loadMemberSince();
        updateNavBadge();
    } catch (error) {
        console.error('Init error:', error);
        showToast('error', 'Failed to load profile');
        setTimeout(() => {
            window.location.href = '../../login/index.html';
        }, 2000);
    }
}

// ============================================================
// PROFILE
// ============================================================
async function loadProfile() {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, status, last_seen, show_message_preview, bio')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (error) throw error;

        currentProfile = profile || {
            id: currentUser.id,
            username: currentUser.email?.split('@')[0] || 'User',
            show_message_preview: true,
            bio: ''
        };

        currentShowDetails = currentProfile.show_message_preview !== false;

        renderProfile(currentProfile);
        renderBio(currentProfile.bio || '');
        setTimeout(() => loadUserStats(), 80);
    } catch (error) {
        console.error('Profile load error:', error);
        const fallbackUsername = currentUser?.email?.split('@')[0] || 'User';
        currentProfile = { id: currentUser.id, username: fallbackUsername, bio: '' };
        renderProfile(currentProfile);
        renderBio('');
    }
}

// ------------------------------------------------------------
// Reliable username getter. Falls back through every possible
// source so we never render '?' by accident.
// ------------------------------------------------------------
function getBestUsername() {
    return (
        currentProfile?.username ||
        currentUser?.user_metadata?.username ||
        currentUser?.email?.split('@')[0] ||
        'User'
    );
}

// ------------------------------------------------------------
// renderAvatar — single source of truth.
//
// Uses a preload Image() so we don't swap the DOM until the
// file is actually fetched by the browser. This eliminates the
// "placeholder flashes" problem when a fresh ImgBB URL is used.
//
// Uses a token so an older render cannot overwrite a newer one.
// ------------------------------------------------------------
function renderAvatar(avatarUrl, username) {
    const img = document.getElementById('avatarImage');
    const initialDiv = document.getElementById('avatarInitial');
    if (!img || !initialDiv) return;

    const token = ++avatarRenderToken;
    const initial = (username || '?').trim().charAt(0).toUpperCase() || '?';

    // Always clear stale handlers
    img.onload = null;
    img.onerror = null;

    // No avatar → show initials immediately
    if (!avatarUrl || !String(avatarUrl).trim()) {
        img.removeAttribute('src');
        img.style.display = 'none';
        initialDiv.style.display = 'flex';
        initialDiv.textContent = initial;
        return;
    }

    // Have an avatar. Show initials while we preload.
    img.style.display = 'none';
    initialDiv.style.display = 'flex';
    initialDiv.textContent = initial;

    const pre = new Image();
    pre.decoding = 'async';

    pre.onload = () => {
        // If a newer render happened while we were loading, bail.
        if (token !== avatarRenderToken) return;
        img.src = avatarUrl;
        img.alt = username || 'Profile';
        img.style.display = 'block';
        initialDiv.style.display = 'none';
    };

    pre.onerror = () => {
        if (token !== avatarRenderToken) return;
        img.removeAttribute('src');
        img.style.display = 'none';
        initialDiv.style.display = 'flex';
        initialDiv.textContent = initial;
    };

    pre.src = avatarUrl;
}

function renderProfile(profile) {
    const username = profile.username || getBestUsername();

    const nameEl = document.getElementById('displayName');
    const userEl = document.getElementById('displayUsername');
    if (nameEl) nameEl.textContent = username;
    if (userEl) userEl.textContent = `@${username.toLowerCase()}`;

    renderAvatar(profile.avatar_url, username);
}

async function loadUserStats() {
    try {
        const { count: friendsCount } = await supabase
            .from('friends')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);

        const friendsEl = document.getElementById('friendsCount');
        if (friendsEl) friendsEl.textContent = friendsCount || 0;

        const msgCountEl = document.getElementById('messagesCount');
        if (msgCountEl) {
            const { count: msgCount } = await supabase
                .from('direct_messages')
                .select('*', { count: 'exact', head: true })
                .eq('sender_id', currentUser.id);
            msgCountEl.textContent = msgCount || 0;
        }
    } catch {
        const friendsEl = document.getElementById('friendsCount');
        if (friendsEl) friendsEl.textContent = '0';
        const msgEl = document.getElementById('messagesCount');
        if (msgEl) msgEl.textContent = '0';
    }
}

// ============================================================
// MEMBER SINCE
// ============================================================
async function loadMemberSince() {
    try {
        if (!supabase || !currentUser) return;
        const el = document.getElementById('memberSince');
        if (!el) return;

        const { data, error } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (error || !data?.created_at) {
            el.textContent = '—';
            return;
        }
        const dt = new Date(data.created_at);
        el.textContent = dt.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    } catch (e) {
        const el = document.getElementById('memberSince');
        if (el) el.textContent = '—';
    }
}

// ============================================================
// BIO
// ============================================================
function renderBio(bio) {
    currentBio = bio || '';
    const box = document.getElementById('bioBox');
    if (!box) return;

    if (currentBio.trim()) {
        box.textContent = currentBio.trim();
        box.classList.remove('empty');
    } else {
        box.innerHTML = '<span class="bio-empty">Tap the pencil to write something about you (max 50 chars)</span>';
        box.classList.add('empty');
    }
}

window.openBioEditor = function() {
    const modal = document.getElementById('bioEditorModal');
    const input = document.getElementById('bioInput');
    const counter = document.getElementById('bioCharCount');

    if (!modal || !input) return;

    input.value = currentBio || '';
    counter.textContent = input.value.length;

    input.oninput = () => {
        counter.textContent = input.value.length;
    };

    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));
    setTimeout(() => input.focus(), 120);
};

window.closeBioEditor = function() {
    const modal = document.getElementById('bioEditorModal');
    if (modal) {
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 200);
    }
};

window.saveBio = async function() {
    const input = document.getElementById('bioInput');
    if (!input) return;

    const newBio = input.value.trim();

    if (newBio.length > 50) {
        showToast('error', 'Bio must be 50 characters or less');
        return;
    }

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ bio: newBio, updated_at: new Date().toISOString() })
            .eq('id', currentUser.id);

        if (error) throw error;

        if (currentProfile) currentProfile.bio = newBio;
        renderBio(newBio);
        closeBioEditor();
        showToast('success', 'Bio updated!');
    } catch (error) {
        console.error('Save bio error:', error);
        showToast('error', 'Could not save bio');
    }
};

// ============================================================
// AVATAR
// ============================================================
window.openImagePicker = function() {
    const modal = document.getElementById('imagePickerModal');
    if (modal) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('visible'));
    }
};

window.closeModal = function() {
    const modal = document.getElementById('imagePickerModal');
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => modal.style.display = 'none', 200);
};

window.uploadFromCamera = function() {
    const input = document.getElementById('cameraInput');
    input.accept = 'image/*';
    input.capture = 'environment';
    input.click();
    closeModal();
};

window.uploadFromGallery = function() {
    const input = document.getElementById('galleryInput');
    input.accept = 'image/*';
    input.click();
    closeModal();
};

window.handleImageSelect = async function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const uploadLoading = document.getElementById('uploadLoading');
    if (uploadLoading) uploadLoading.style.display = 'flex';

    try {
        const formData = new FormData();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', file);

        const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (!data.success) throw new Error('Upload failed');

        const imageUrl = data.data.url;

        const { error } = await supabase
            .from('profiles')
            .update({ avatar_url: imageUrl, updated_at: new Date().toISOString() })
            .eq('id', currentUser.id);

        if (error) throw error;

        if (currentProfile) currentProfile.avatar_url = imageUrl;

        // Force-clear and re-render through the preloader.
        // (Also kills any in-flight stale render.)
        renderAvatar(imageUrl, getBestUsername());

        showToast('success', 'Profile photo updated!');
    } catch (error) {
        console.error('Upload error:', error);
        showToast('error', 'Failed to upload image');
    } finally {
        if (uploadLoading) uploadLoading.style.display = 'none';
        event.target.value = '';
    }
};

window.removeAvatar = async function() {
    if (!confirm('Remove profile photo?')) return;

    const uploadLoading = document.getElementById('uploadLoading');
    if (uploadLoading) uploadLoading.style.display = 'flex';

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ avatar_url: null, updated_at: new Date().toISOString() })
            .eq('id', currentUser.id);

        if (error) throw error;

        if (currentProfile) currentProfile.avatar_url = null;

        // Immediate optimistic update — no waiting on any subscription
        renderAvatar(null, getBestUsername());

        showToast('success', 'Profile photo removed');
    } catch (error) {
        console.error('Remove avatar error:', error);
        showToast('error', 'Failed to remove photo');
    } finally {
        if (uploadLoading) uploadLoading.style.display = 'none';
        closeModal();
    }
};

// ============================================================
// NOTIFICATIONS — Enable (native FCM or web push)
// ============================================================
async function enableNativeNotifications() {
    const Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    const PushNotifications = Plugins.PushNotifications;

    if (!PushNotifications) {
        showToast('error', 'Push plugin missing. Reinstall the app.');
        return false;
    }

    try {
        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
            perm = await PushNotifications.requestPermissions();
        }

        if (perm.receive !== 'granted') {
            showToast('error', 'Notifications blocked in system settings');
            return false;
        }

        await PushNotifications.register();

        showToast('success', 'Notifications enabled!');
        return true;
    } catch (e) {
        console.error('Native enable error:', e);
        showToast('error', 'Could not enable notifications');
        return false;
    }
}

async function enableWebNotifications() {
    if (Notification.permission === 'granted') {
        if (window.relaytalkPush) await window.relaytalkPush.init();
        showToast('success', 'Notifications enabled');
        return true;
    }

    if (!window.relaytalkPush) {
        showToast('error', 'Notifications not ready. Please refresh.');
        return false;
    }

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true;
    if (isIOS && !isStandalone) {
        alert('On iPhone, please tap Share → Add to Home Screen first, then reopen this page and tap Enable again.');
        return false;
    }

    const result = await window.relaytalkPush.request();
    if (result.success) {
        showToast('success', 'Notifications enabled!');
        return true;
    } else {
        showToast('error', 'Could not enable: ' + (result.reason || 'denied'));
        return false;
    }
}

async function enableNotificationsAction() {
    if (isNativeShell()) {
        return await enableNativeNotifications();
    }
    return await enableWebNotifications();
}

async function disableNotificationsAction() {
    const ok = confirm('Turn off notifications for this device?\n\nYou will need to enable them again to receive alerts.');
    if (!ok) return;

    if (isNativeShell()) {
        try {
            if (supabase && currentUser) {
                await supabase.from('device_tokens').delete().eq('user_id', currentUser.id);
            }
        } catch (e) {
            console.warn('Native cleanup failed:', e);
        }
        showToast('success', 'Notifications turned off');
        return;
    }

    try {
        if (window.relaytalkPush?.unsubscribe) {
            await window.relaytalkPush.unsubscribe();
        }
    } catch (e) {
        console.warn('Unsubscribe failed:', e);
    }

    try {
        if (supabase && currentUser) {
            await supabase.from('push_subscriptions').delete().eq('user_id', currentUser.id);
        }
    } catch (e) {
        console.warn('DB cleanup failed:', e);
    }

    showToast('success', 'Notifications turned off');
}

window.toggleNotifications = async function() {
    const btn = document.getElementById('enableNotificationsBtn');
    if (!btn) return;

    if (!isNativeShell() && !('Notification' in window)) {
        showToast('error', 'Notifications not supported');
        return;
    }

    btn.disabled = true;
    btn.classList.add('loading');

    try {
        if (notificationsEnabled) {
            await disableNotificationsAction();
        } else {
            await enableNotificationsAction();
        }
    } catch (e) {
        console.error('Toggle notification error:', e);
        showToast('error', 'Something went wrong');
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        await refreshNotificationState();
    }
};

async function refreshNotificationState() {
    const btn = document.getElementById('enableNotificationsBtn');
    const label = document.getElementById('enableBtnLabel');
    const icon = document.getElementById('enableBtnIcon');
    if (!btn || !label || !icon) return;

    // ---- Native shell path ----
    if (isNativeShell()) {
        btn.classList.remove('enabled', 'denied', 'loading');
        try {
            const Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
            const PushNotifications = Plugins.PushNotifications;
            let granted = false;
            if (PushNotifications) {
                const p = await PushNotifications.checkPermissions();
                granted = p.receive === 'granted';
            }

            let hasToken = false;
            if (supabase && currentUser) {
                const { data } = await supabase
                    .from('device_tokens')
                    .select('id')
                    .eq('user_id', currentUser.id)
                    .limit(1);
                hasToken = !!(data && data.length > 0);
            }

            notificationsEnabled = granted && hasToken;
            if (notificationsEnabled) {
                btn.classList.add('enabled');
                label.textContent = 'Enabled';
                setBellIcon(icon, 'on');
            } else {
                label.textContent = 'Enable';
                setBellIcon(icon, 'off');
            }
        } catch (e) {
            console.warn('Native state check failed:', e);
            label.textContent = 'Enable';
            setBellIcon(icon, 'off');
        }
        return;
    }

    // ---- Web path ----
    btn.classList.remove('enabled', 'denied', 'loading');

    const perm = ('Notification' in window) ? Notification.permission : 'unsupported';

    if (perm === 'unsupported') {
        btn.style.display = 'none';
        return;
    }

    if (perm === 'denied') {
        notificationsEnabled = false;
        btn.classList.add('denied');
        label.textContent = 'Blocked';
        setBellIcon(icon, 'off');
        return;
    }

    let hasSub = false;
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
            const sub = await reg.pushManager.getSubscription();
            hasSub = !!sub;
        }
    } catch (e) {}

    let hasDbRow = false;
    try {
        if (supabase && currentUser) {
            const { data } = await supabase
                .from('push_subscriptions')
                .select('id')
                .eq('user_id', currentUser.id)
                .limit(1);
            hasDbRow = !!(data && data.length > 0);
        }
    } catch (e) {}

    notificationsEnabled = (perm === 'granted') && (hasSub || hasDbRow);

    if (notificationsEnabled) {
        btn.classList.add('enabled');
        label.textContent = 'Enabled';
        setBellIcon(icon, 'on');
    } else {
        label.textContent = 'Enable';
        setBellIcon(icon, 'off');
    }
}

function setBellIcon(container, state) {
    if (!container) return;
    if (state === 'on') {
        container.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                <polyline points="9 12 11 14 15 10" style="stroke: currentColor; stroke-width: 2.5;"/>
            </svg>
        `;
    } else {
        container.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
        `;
    }
}

window.resetNotifications = async function() {
    const btn = document.getElementById('resetNotificationsBtn');
    if (!btn) return;

    const ok = confirm('Reset notifications?\n\nThis will unsubscribe this device and create a fresh subscription.');
    if (!ok) return;

    btn.disabled = true;
    btn.classList.add('loading');
    showToast('info', 'Resetting...');

    // ---- Native shell path ----
    if (isNativeShell()) {
        try {
            if (supabase && currentUser) {
                await supabase.from('device_tokens').delete().eq('user_id', currentUser.id);
            }

            await new Promise(r => setTimeout(r, 500));

            const Plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
            const PushNotifications = Plugins.PushNotifications;
            if (PushNotifications) {
                await PushNotifications.register();
            }

            showToast('success', 'Notifications reset!');
        } catch (e) {
            console.error('Native reset failed:', e);
            showToast('error', 'Reset failed');
        } finally {
            btn.disabled = false;
            btn.classList.remove('loading');
            await refreshNotificationState();
        }
        return;
    }

    // ---- Web path ----
    try {
        if (window.relaytalkPush?.unsubscribe) {
            await window.relaytalkPush.unsubscribe();
        }
    } catch (e) {}

    try {
        if (supabase && currentUser) {
            await supabase.from('push_subscriptions').delete().eq('user_id', currentUser.id);
        }
    } catch (e) {}

    await new Promise(r => setTimeout(r, 700));

    try {
        if (window.relaytalkPush) {
            const result = await window.relaytalkPush.request();
            if (result.success) {
                showToast('success', 'Notifications reset!');
            } else {
                showToast('error', 'Reset failed: ' + (result.reason || 'unknown'));
            }
        }
    } catch (e) {
        showToast('error', 'Reset failed');
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
        await refreshNotificationState();
    }
};

// ============================================================
// DETAILS TOGGLE
// ============================================================
window.toggleDetails = function() {
    showDetailsInfo();
};

function showDetailsInfo() {
    const isCurrentlyOn = currentShowDetails;
    const titleEl = document.getElementById('detailsInfoTitle');
    const bodyEl = document.getElementById('detailsInfoBody');

    if (isCurrentlyOn) {
        titleEl.textContent = 'Hide Details';
        bodyEl.innerHTML = `
            <p style="margin-bottom:12px;">By turning this <strong>off</strong>, notifications will be less detailed:</p>
            <ul style="padding-left:20px; line-height:1.8;">
                <li>You'll only see <em>"There is a new message on RelayTalk"</em></li>
                <li><strong>No sender name</strong> will be shown</li>
                <li><strong>No avatar</strong> will be shown</li>
                <li><strong>No message content</strong> or images</li>
            </ul>
            <p style="margin-top:14px;color:#666;font-size:0.9rem;">Useful for privacy when your phone screen is visible to others.</p>
        `;
    } else {
        titleEl.textContent = 'Show Details';
        bodyEl.innerHTML = `
            <p style="margin-bottom:12px;">By turning this <strong>on</strong>, notifications will include:</p>
            <ul style="padding-left:20px; line-height:1.8;">
                <li>The <strong>sender's name</strong></li>
                <li>The <strong>sender's avatar</strong> as the icon</li>
                <li>The <strong>message content</strong></li>
                <li>A <strong>preview image</strong> when a photo is sent</li>
            </ul>
            <p style="margin-top:14px;color:#666;font-size:0.9rem;">Recommended if you want to know who messaged and what they said.</p>
        `;
    }

    const modal = document.getElementById('detailsInfoModal');
    if (modal) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('visible'));
    }
}

window.closeDetailsInfo = function() {
    const modal = document.getElementById('detailsInfoModal');
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => modal.style.display = 'none', 200);
};

window.confirmDetailsToggle = async function() {
    closeDetailsInfo();
    await applyDetailsToggle(!currentShowDetails);
};

async function applyDetailsToggle(newValue) {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({
                show_message_preview: newValue,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentUser.id);

        if (error) throw error;

        currentShowDetails = newValue;
        if (currentProfile) currentProfile.show_message_preview = newValue;
        updateDetailsToggle();
        showToast('success', newValue ? 'Details ON' : 'Details OFF');
    } catch (error) {
        console.error('Toggle error:', error);
        showToast('error', 'Could not update preference');
    }
}

function updateDetailsToggle() {
    const label = document.getElementById('detailsToggleLabel');
    const toggleSwitch = document.getElementById('detailsToggleSwitch');
    const btn = document.getElementById('detailsToggleBtn');
    if (!btn || !label) return;

    if (currentShowDetails) {
        btn.classList.add('active');
        btn.classList.remove('inactive');
        label.textContent = 'Details Visible';
        if (toggleSwitch) toggleSwitch.classList.add('on');
    } else {
        btn.classList.add('inactive');
        btn.classList.remove('active');
        label.textContent = 'Details Hidden';
        if (toggleSwitch) toggleSwitch.classList.remove('on');
    }
}

// ============================================================
// NOTIFICATIONS MODAL (Requests + Calls)
// ============================================================
window.openNotifications = function(event) {
    if (event) event.preventDefault();
    const modal = document.getElementById('notificationsModal');
    if (modal) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('visible'));
        switchNotifTab('main');
    }
};

window.closeNotifications = function() {
    const modal = document.getElementById('notificationsModal');
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => { modal.style.display = 'none'; }, 200);
};

window.switchNotifTab = function(tab) {
    currentNotifTab = tab;

    const mainTab = document.getElementById('notifTabMain');
    const callsTab = document.getElementById('notifTabCalls');
    const mainContent = document.getElementById('notifMainContent');
    const callsContent = document.getElementById('notifCallsContent');

    if (!mainTab || !callsTab || !mainContent || !callsContent) return;

    if (tab === 'main') {
        mainTab.classList.add('active');
        callsTab.classList.remove('active');
        mainContent.classList.add('active');
        callsContent.classList.remove('active');
        loadNotifications();
    } else {
        callsTab.classList.add('active');
        mainTab.classList.remove('active');
        callsContent.classList.add('active');
        mainContent.classList.remove('active');
        loadCallHistory();
    }
};

async function loadNotifications() {
    const container = document.getElementById('notificationsList');
    if (!container) return;

    try {
        if (!currentUser || !supabase) {
            showEmptyNotifications(container);
            return;
        }

        const { data: notifications, error } = await supabase
            .from('friend_requests')
            .select('id, sender_id, created_at')
            .eq('receiver_id', currentUser.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error || !notifications || notifications.length === 0) {
            showEmptyNotifications(container);
            return;
        }

        const senderIds = notifications.map(n => n.sender_id);
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', senderIds);

        const profileMap = {};
        if (profiles) profiles.forEach(p => profileMap[p.id] = p);

        let html = '';
        notifications.forEach(notification => {
            const timeAgo = timeAgoShort(notification.created_at);
            const sender = profileMap[notification.sender_id] || { username: 'Unknown' };
            const senderName = sender.username;
            const initial = senderName.charAt(0).toUpperCase();
            const avatarSrc = sender.avatar_url || '';

            html += `
                <div class="notification-item">
                    <div class="notification-avatar">
                        ${avatarSrc
                            ? `<img src="${avatarSrc}" alt="${escapeHtml(senderName)}">`
                            : `<span>${escapeHtml(initial)}</span>`
                        }
                    </div>
                    <div class="notification-content">
                        <div class="notification-text">
                            <strong>${escapeHtml(senderName)}</strong> wants to be friends
                            <span class="notification-time">${timeAgo}</span>
                        </div>
                    </div>
                    <div class="notification-actions">
                        <button class="btn-small btn-success" onclick="acceptFriendRequest('${notification.id}', '${notification.sender_id}', '${escapeAttr(senderName)}', this)" aria-label="Accept">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn-small btn-danger" onclick="declineFriendRequest('${notification.id}', this)" aria-label="Decline">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading notifications:', error);
        showEmptyNotifications(container);
    }
}

function showEmptyNotifications(container) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">
                <i class="fas fa-bell-slash"></i>
            </div>
            <p class="empty-desc">No notifications yet</p>
        </div>
    `;
}

async function loadCallHistory() {
    const container = document.getElementById('callHistoryList');
    if (!container) return;

    try {
        if (!currentUser || !supabase) {
            container.innerHTML = `<div class="empty-state"><p>Cannot load call history</p></div>`;
            return;
        }

        const { data: calls, error } = await supabase
            .from('calls')
            .select('*')
            .or(`caller_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id},callee_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error || !calls || calls.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-phone-slash"></i>
                    </div>
                    <h3 class="empty-title">No calls yet</h3>
                    <p class="empty-desc">Your call history will appear here</p>
                </div>
            `;
            return;
        }

        const userIds = new Set();
        calls.forEach(call => {
            if (call.caller_id !== currentUser.id) userIds.add(call.caller_id);
            if (call.receiver_id !== currentUser.id) userIds.add(call.receiver_id);
            if (call.callee_id && call.callee_id !== currentUser.id) userIds.add(call.callee_id);
        });

        let profileMap = {};
        if (userIds.size > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, avatar_url')
                .in('id', [...userIds]);
            if (profiles) profiles.forEach(p => profileMap[p.id] = p);
        }

        let html = '';
        let lastDate = '';

        calls.forEach(call => {
            const callDate = new Date(call.created_at).toLocaleDateString();
            if (callDate !== lastDate) {
                lastDate = callDate;
                html += `<div class="call-history-date">${callDate}</div>`;
            }

            const isOutgoing = call.caller_id === currentUser.id;
            const otherUserId = isOutgoing ? (call.receiver_id || call.callee_id) : (call.caller_id || call.callee_id);
            const otherUser = profileMap[otherUserId] || { username: 'Unknown' };

            let metaIcon = 'fa-arrow-down';
            let metaClass = 'meta-incoming';
            let metaText = 'Incoming';
            let isMissed = false;

            if (isOutgoing) {
                metaIcon = 'fa-arrow-up';
                metaClass = 'meta-outgoing';
                metaText = 'Outgoing';
            }

            if (call.status === 'missed' || call.status === 'cancelled' || call.status === 'rejected') {
                if (!isOutgoing || call.status === 'rejected') {
                    metaIcon = 'fa-phone-slash';
                    metaClass = 'meta-missed';
                    metaText = 'Missed';
                    isMissed = true;
                }
            } else if (call.status === 'ringing' && !isOutgoing) {
                metaIcon = 'fa-phone-slash';
                metaClass = 'meta-missed';
                metaText = 'Missed';
                isMissed = true;
            }

            const time = new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const initial = otherUser.username ? otherUser.username.charAt(0).toUpperCase() : '?';
            const avatarSrc = otherUser.avatar_url || '';

            html += `
                <div class="call-history-item">
                    <div class="call-history-avatar">
                        ${avatarSrc
                            ? `<img src="${avatarSrc}" alt="${escapeHtml(otherUser.username || '')}">`
                            : `<span>${escapeHtml(initial)}</span>`
                        }
                    </div>
                    <div class="call-history-info">
                        <div class="call-history-name ${isMissed ? 'missed' : ''}">${escapeHtml(otherUser.username || 'Unknown')}</div>
                        <div class="call-history-meta">
                            <i class="fas ${metaIcon} ${metaClass}"></i>
                            <span>${metaText}</span>
                            <span class="dot">•</span>
                            <span>${time}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading call history:', error);
        container.innerHTML = `<div class="empty-state"><p>Could not load call history</p></div>`;
    }
}

// ============================================================
// ACCEPT / DECLINE FRIEND REQUEST
// ============================================================
window.acceptFriendRequest = async function(requestId, senderId, senderName, button) {
    if (button) {
        button.innerHTML = '...';
        button.disabled = true;
    }

    try {
        await supabase
            .from('friend_requests')
            .update({ status: 'accepted', updated_at: new Date().toISOString() })
            .eq('id', requestId);

        await supabase.from('friends').insert({
            user_id: currentUser.id,
            friend_id: senderId,
            created_at: new Date().toISOString()
        });

        await supabase.from('friends').insert({
            user_id: senderId,
            friend_id: currentUser.id,
            created_at: new Date().toISOString()
        });

        showToast('success', `You are now friends with ${senderName}!`);

        await loadNotifications();
        await loadUserStats();
        await updateNavBadge();
    } catch (error) {
        console.error('Accept error:', error);
        showToast('error', 'Could not accept request');
        if (button) {
            button.innerHTML = '<i class="fas fa-check"></i>';
            button.disabled = false;
        }
    }
};

window.declineFriendRequest = async function(requestId, button) {
    if (button) {
        button.innerHTML = '...';
        button.disabled = true;
    }

    try {
        await supabase
            .from('friend_requests')
            .update({ status: 'rejected', updated_at: new Date().toISOString() })
            .eq('id', requestId);

        showToast('info', 'Request declined');

        await loadNotifications();
        await updateNavBadge();
    } catch (error) {
        console.error('Decline error:', error);
        if (button) {
            button.innerHTML = '<i class="fas fa-times"></i>';
            button.disabled = false;
        }
    }
};

// ============================================================
// NAV BADGE
// ============================================================
async function updateNavBadge() {
    try {
        if (!currentUser || !supabase) return;

        const { data: friendReqs } = await supabase
            .from('friend_requests')
            .select('id')
            .eq('receiver_id', currentUser.id)
            .eq('status', 'pending');

        const pendingCount = friendReqs?.length || 0;

        const { count: missedCount } = await supabase
            .from('calls')
            .select('*', { count: 'exact', head: true })
            .eq('callee_id', currentUser.id)
            .eq('seen', false)
            .in('status', ['missed', 'rejected']);

        const total = pendingCount + (missedCount || 0);

        const navBadge = document.getElementById('notificationBadge');
        if (navBadge) {
            if (total > 0) {
                navBadge.textContent = total > 9 ? '9+' : total;
                navBadge.style.display = 'flex';
            } else {
                navBadge.style.display = 'none';
            }
        }

        const mainTabBadge = document.getElementById('mainTabBadge');
        if (mainTabBadge) {
            if (pendingCount > 0) {
                mainTabBadge.textContent = pendingCount > 9 ? '9+' : pendingCount;
                mainTabBadge.style.display = 'inline-flex';
            } else {
                mainTabBadge.style.display = 'none';
            }
        }

        const callsTabBadge = document.getElementById('callsTabBadge');
        if (callsTabBadge) {
            if (missedCount && missedCount > 0) {
                callsTabBadge.textContent = missedCount > 9 ? '9+' : missedCount;
                callsTabBadge.style.display = 'inline-flex';
            } else {
                callsTabBadge.style.display = 'none';
            }
        }
    } catch (e) {
        // silent
    }
}

// ============================================================
// HELPERS
// ============================================================
function timeAgoShort(dateStr) {
    const now = new Date();
    const past = new Date(dateStr);
    const diffMins = Math.floor((now - past) / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return past.toLocaleDateString();
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeAttr(str) { return escapeHtml(str); }

// ============================================================
// GUIDE MODAL
// ============================================================
const GUIDE_CONTENT = {
    home: {
        icon: 'fa-home',
        color: '#1a73e8',
        bg: '#e8f0fe',
        title: 'Home',
        sub: 'Your starting point',
        items: [
            { icon: 'fa-search', title: 'Find friends', desc: 'Tap "Find friends" on the home page and search by username to send a friend request.' },
            { icon: 'fa-bell', title: 'Notifications & Alerts', desc: 'Tap the bell icon at the top right to see friend requests and call logs. The red badge clears once you view them.' },
            { icon: 'fa-comments', title: 'Open a chat', desc: 'Tap any friend in the list to open a chat with them instantly.' },
            { icon: 'fa-user-plus', title: 'Accept requests', desc: 'When someone accepts your friend request, they appear in your friends list automatically.' },
            { icon: 'fa-circle', title: 'Online status', desc: 'A green dot next to a friend means they are online right now. Grey means offline — you can still chat and call them.' }
        ]
    },
    chats: {
        icon: 'fa-comment-dots',
        color: '#1e8e3e',
        bg: '#e6f4ea',
        title: 'Chats',
        sub: 'Talk, react, share',
        items: [
            { icon: 'fa-paper-plane', title: 'Send a message', desc: 'Type in the box at the bottom and tap the send button.' },
            { icon: 'fa-image', title: 'Share images', desc: 'Tap the paperclip icon, choose Camera or Gallery. You can send up to 10 images at once.' },
            { icon: 'fa-palette', title: 'Color your message', desc: 'Type "/" in the message box → pick a color → your next message uses it.' },
            { icon: 'fa-face-smile', title: 'React to messages', desc: 'Long-press any message → pick an emoji. Tap the same emoji to remove it. Tap "+" for more options.' },
            { icon: 'fa-copy', title: 'Copy a message', desc: 'Long-press → tap the copy icon in the top of the bar.' },
            { icon: 'fa-pen', title: 'Edit your message', desc: 'Long-press your own message → tap the pencil icon. Edited messages show a small (edited) label.' },
            { icon: 'fa-trash', title: 'Delete your message', desc: 'Long-press your own message → tap the trash icon. Deleted messages show as "This message was deleted" for both people.' },
            { icon: 'fa-user', title: "Open friend's profile", desc: "Tap your friend's name or avatar at the top of the chat to see their bio and profile." },
            { icon: 'fa-phone', title: 'Voice / video call', desc: 'Tap the phone icon in the top-right corner.' }
        ]
    },
    friends: {
        icon: 'fa-user-friends',
        color: '#b06000',
        bg: '#fef7e0',
        title: 'Friends',
        sub: "Everyone you're connected with",
        items: [
            { icon: 'fa-magnifying-glass', title: 'Search friends', desc: 'Use the search bar at the top to filter your friends by username.' },
            { icon: 'fa-comment-dots', title: 'Message button', desc: 'Tap the message icon to open a chat with that friend.' },
            { icon: 'fa-phone', title: 'Call button', desc: "Tap the phone icon to start a call. Works even if the friend is offline — they'll get a missed-call notification." },
            { icon: 'fa-id-badge', title: 'Open profile', desc: "Tap a friend's avatar or name to view their profile page." },
            { icon: 'fa-circle', title: 'Online / Offline', desc: 'A green circle means online. A white circle with a light border means offline — you can still call and message.' }
        ]
    },
    profile: {
        icon: 'fa-user',
        color: '#7c3aed',
        bg: '#f3e8fd',
        title: 'Your Profile',
        sub: 'Everything about you',
        items: [
            { icon: 'fa-camera', title: 'Change your photo', desc: 'Tap the camera badge on your avatar to upload a new photo from your camera or gallery.' },
            { icon: 'fa-pen', title: 'Edit your bio', desc: 'Tap the pencil next to "Biography" to write up to 50 characters about yourself.' },
            { icon: 'fa-bell', title: 'Enable notifications', desc: 'Turn on push notifications so you get alerts even when the app is closed.' },
            { icon: 'fa-rotate', title: 'Reset notifications', desc: 'Notifications not working? Reset them and re-enable — this creates a fresh subscription.' },
            { icon: 'fa-eye', title: 'Show / Hide details', desc: 'Control whether notifications show the sender name, avatar, message content, and images. Hide them for privacy.' },
            { icon: 'fa-right-from-bracket', title: 'Log out', desc: 'Sign out of this device. Your account stays safe — you can log back in any time.' }
        ]
    },
    view: {
        icon: 'fa-id-badge',
        color: '#d93025',
        bg: '#fce8e6',
        title: "Friend's Profile",
        sub: 'Viewing someone else',
        items: [
            { icon: 'fa-circle', title: 'Live status', desc: 'See whether your friend is online, or when they were last seen — updates in real time.' },
            { icon: 'fa-comment-dots', title: 'Message', desc: 'Tap "Message" to open a chat with this friend.' },
            { icon: 'fa-phone', title: 'Call', desc: "Tap 'Call' to start an audio call — works whether they're online or offline." },
            { icon: 'fa-quote-left', title: 'Biography', desc: 'Read their bio if they\'ve written one. If not, you\'ll see "No biography yet."' },
            { icon: 'fa-clock', title: 'Friends since', desc: 'See the date you two became friends.' }
        ]
    },
    others: {
        icon: 'fa-ellipsis-h',
        color: '#5f6368',
        bg: '#f1f3f4',
        title: 'Others',
        sub: 'Tips and extras',
        items: [
            { icon: 'fa-mobile-screen', title: 'Install as an app', desc: 'Add RelayTalk to your home screen for a native app experience. On iPhone: Share → Add to Home Screen.' },
            { icon: 'fa-shield-halved', title: 'Privacy', desc: 'Choose whether notifications show details. Turn off for more privacy on lock screen.' },
            { icon: 'fa-moon', title: 'Calls when offline', desc: 'You can call anyone anytime — online or offline. If they miss it, it shows up in their Alerts tab.' },
            { icon: 'fa-circle-info', title: 'Need help?', desc: 'Come back to this guide any time from Profile → RelayTalk Guide.' }
        ]
    }
};

window.openGuide = function() {
    const modal = document.getElementById('guideModal');
    if (!modal) return;
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('visible'));
    showGuideSection('home', document.querySelector('.guide-nav-btn[data-guide="home"]'));
};

window.closeGuide = function() {
    const modal = document.getElementById('guideModal');
    if (!modal) return;
    modal.classList.remove('visible');
    setTimeout(() => { modal.style.display = 'none'; }, 220);
};

window.showGuideSection = function(section, btn) {
    const data = GUIDE_CONTENT[section];
    if (!data) return;

    document.querySelectorAll('.guide-nav-btn').forEach(b => b.classList.remove('active'));
    if (btn) {
        btn.classList.add('active');
    } else {
        const fallback = document.querySelector(`.guide-nav-btn[data-guide="${section}"]`);
        if (fallback) fallback.classList.add('active');
    }

    const body = document.getElementById('guideBody');
    if (!body) return;

    body.innerHTML = `
        <div class="guide-section">
            <div class="guide-section-head">
                <span class="guide-section-icon" style="background:${data.bg};color:${data.color};">
                    <i class="fas ${data.icon}"></i>
                </span>
                <div>
                    <h4 class="guide-section-title">${data.title}</h4>
                    <div class="guide-section-sub">${data.sub}</div>
                </div>
            </div>
            <div class="guide-items">
                ${data.items.map(it => `
                    <div class="guide-item">
                        <span class="guide-item-icon"><i class="fas ${it.icon}"></i></span>
                        <div class="guide-item-text">
                            <div class="guide-item-title">${it.title}</div>
                            <p class="guide-item-desc">${it.desc}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
};

// ============================================================
// TOAST
// ============================================================
function showToast(type, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';

    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 320);
    }, 2800);
}

// ============================================================
// LOGOUT
// ============================================================
window.logout = async function() {
    try {
        const uploadEl = document.getElementById('uploadLoading');
        if (uploadEl) uploadEl.style.display = 'flex';
        const uploadText = document.querySelector('#uploadLoading .loading-text');
        if (uploadText) uploadText.textContent = 'Logging out...';

        if (isNativeShell()) {
            try {
                if (supabase && currentUser) {
                    await supabase.from('device_tokens').delete().eq('user_id', currentUser.id);
                }
            } catch (e) {}
        } else {
            try {
                if (window.relaytalkPush?.unsubscribe) {
                    await window.relaytalkPush.unsubscribe();
                }
            } catch (e) {}
        }

        if (supabase) await supabase.auth.signOut();

        localStorage.clear();
        sessionStorage.clear();

        document.cookie.split(";").forEach(function(c) {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });

        window.location.href = '../../login/index.html';
    } catch (error) {
        window.location.href = '../../login/index.html';
    }
};

window.goToHome = () => window.location.href = '../../home/index.html';
window.goToFriends = () => window.location.href = '../friends/index.html';

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfilePage);
} else {
    initProfilePage();
}