// profile.js - Profile with IMGBB Avatar + Notifications + Bio

import { initializeSupabase } from '../../../utils/supabase.js';

const IMGBB_API_KEY = '82e49b432e2ee14921f7d0cd81ba5551';

let supabase = null;
let currentUser = null;
let currentProfile = null;
let currentShowDetails = true;
let currentBio = '';
let notificationsEnabled = false;

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
        renderProfile({ username: currentUser.email?.split('@')[0] || 'User' });
        renderBio('');
    }
}

function renderProfile(profile) {
    const username = profile.username || currentUser.email?.split('@')[0] || 'User';
    document.getElementById('displayName').textContent = username;
    document.getElementById('displayUsername').textContent = `@${username.toLowerCase()}`;

    const img = document.getElementById('avatarImage');
    const initialDiv = document.getElementById('avatarInitial');

    if (profile.avatar_url) {
        const preload = new Image();
        preload.src = profile.avatar_url;
        preload.onload = () => {
            img.src = profile.avatar_url;
            img.style.display = 'block';
            initialDiv.style.display = 'none';
        };
        preload.onerror = () => {
            img.style.display = 'none';
            initialDiv.style.display = 'flex';
            initialDiv.textContent = username.charAt(0).toUpperCase();
        };
    } else {
        img.style.display = 'none';
        initialDiv.style.display = 'flex';
        initialDiv.textContent = username.charAt(0).toUpperCase();
    }
}

async function loadUserStats() {
    try {
        const { count: friendsCount } = await supabase
            .from('friends')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);

        document.getElementById('friendsCount').textContent = friendsCount || 0;
        document.getElementById('messagesCount').textContent = '0';
    } catch {
        document.getElementById('friendsCount').textContent = '0';
        document.getElementById('messagesCount').textContent = '0';
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
    if (modal) {
        modal.classList.remove('visible');
        setTimeout(() => modal.style.display = 'none', 200);
    }
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
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('uploadLoading').style.display = 'flex';

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

        const img = document.getElementById('avatarImage');
        const initialDiv = document.getElementById('avatarInitial');
        img.src = imageUrl;
        img.style.display = 'block';
        initialDiv.style.display = 'none';

        showToast('success', 'Profile photo updated!');
    } catch (error) {
        console.error('Upload error:', error);
        showToast('error', 'Failed to upload image');
    } finally {
        document.getElementById('uploadLoading').style.display = 'none';
        event.target.value = '';
    }
};

window.removeAvatar = async function() {
    if (!confirm('Remove profile photo?')) return;
    document.getElementById('uploadLoading').style.display = 'flex';

    try {
        const { error } = await supabase
            .from('profiles')
            .update({ avatar_url: null, updated_at: new Date().toISOString() })
            .eq('id', currentUser.id);

        if (error) throw error;

        const img = document.getElementById('avatarImage');
        const initialDiv = document.getElementById('avatarInitial');
        const username = currentProfile?.username || currentUser.email?.split('@')[0] || 'User';

        img.style.display = 'none';
        initialDiv.style.display = 'flex';
        initialDiv.textContent = username.charAt(0).toUpperCase();

        showToast('success', 'Profile photo removed');
    } catch (error) {
        showToast('error', 'Failed to remove photo');
    } finally {
        document.getElementById('uploadLoading').style.display = 'none';
        closeModal();
    }
};

// ============================================================
// NOTIFICATIONS — Toggle (Enable / Disable)
// ============================================================
window.toggleNotifications = async function() {
    const btn = document.getElementById('enableNotificationsBtn');
    if (!btn) return;

    if (!('Notification' in window)) {
        showToast('error', 'Notifications not supported');
        return;
    }

    btn.disabled = true;
    btn.classList.add('loading');

    try {
        if (notificationsEnabled) {
            // Currently enabled → turn OFF
            await disableNotificationsAction();
        } else {
            // Currently off → turn ON
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

async function enableNotificationsAction() {
    if (Notification.permission === 'granted') {
        if (window.relaytalkPush) await window.relaytalkPush.init();
        showToast('success', 'Notifications enabled');
        return;
    }

    if (!window.relaytalkPush) {
        showToast('error', 'Notifications not ready. Please refresh.');
        return;
    }

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true;
    if (isIOS && !isStandalone) {
        alert('On iPhone, please tap Share → Add to Home Screen first, then reopen this page and tap Enable again.');
        return;
    }

    const result = await window.relaytalkPush.request();
    if (result.success) {
        showToast('success', 'Notifications enabled!');
    } else {
        showToast('error', 'Could not enable: ' + (result.reason || 'denied'));
    }
}

async function disableNotificationsAction() {
    const ok = confirm('Turn off notifications for this device?\n\nYou will need to enable them again to receive alerts.');
    if (!ok) {
        // user cancelled — no state change
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

// ============================================================
// NOTIFICATION STATE (button visual)
// ============================================================
async function refreshNotificationState() {
    const btn = document.getElementById('enableNotificationsBtn');
    const label = document.getElementById('enableBtnLabel');
    const icon = document.getElementById('enableBtnIcon');
    if (!btn || !label || !icon) return;

    // Reset classes
    btn.classList.remove('enabled', 'denied', 'loading');

    // Check browser permission
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

    // Is there an active subscription?
    let hasSub = false;
    try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
            const sub = await reg.pushManager.getSubscription();
            hasSub = !!sub;
        }
    } catch (e) {}

    // Also check DB
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

// ============================================================
// NOTIFICATIONS — Reset
// ============================================================
window.resetNotifications = async function() {
    const btn = document.getElementById('resetNotificationsBtn');
    if (!btn) return;

    const ok = confirm('Reset notifications?\n\nThis will unsubscribe this device and create a fresh subscription.');
    if (!ok) return;

    btn.disabled = true;
    btn.classList.add('loading');
    showToast('info', 'Resetting...');

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
// TOAST
// ============================================================
function showToast(type, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
    const color = type === 'success' ? '#22c55e' : type === 'error' ? '#dc3545' : '#007acc';

    toast.innerHTML = `
        <i class="fas fa-${icon}" style="color:${color}"></i>
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
        document.getElementById('uploadLoading').style.display = 'flex';
        document.querySelector('#uploadLoading .loading-text').textContent = 'Logging out...';

        try {
            if (window.relaytalkPush?.unsubscribe) {
                await window.relaytalkPush.unsubscribe();
            }
        } catch (e) {}

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

document.addEventListener('DOMContentLoaded', initProfilePage);