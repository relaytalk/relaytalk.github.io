// profile.js - Profile with notifications & details toggle

import { initializeSupabase, supabase as supabaseClient } from '../../../utils/supabase.js';

const IMGBB_API_KEY = '82e49b432e2ee14921f7d0cd81ba5551';

let supabase = null;
let currentUser = null;
let currentProfile = null;
let currentShowDetails = true;

// ============================================================
// INIT
// ============================================================
async function initProfilePage() {
    console.log('Loading profile...');

    try {
        supabase = await initializeSupabase();

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!session) {
            window.location.href = '../../../pages/login/index.html';
            return;
        }

        currentUser = session.user;

        await Promise.all([
            loadProfile(),
            new Promise(resolve => setTimeout(resolve, 500))
        ]);

        const loader = document.getElementById('loadingIndicator');
        if (loader) loader.style.display = 'none';

        updateNotifyButtonState();
        updateDetailsToggle();

    } catch (error) {
        console.error('Init error:', error);
        showToast('error', 'Failed to load profile');

        setTimeout(() => {
            window.location.href = '../../../pages/login/index.html';
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
            .select('id, username, avatar_url, status, last_seen, show_message_preview')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (error) throw error;

        currentProfile = profile || {
            id: currentUser.id,
            username: currentUser.email?.split('@')[0] || 'User',
            show_message_preview: true
        };

        currentShowDetails = currentProfile.show_message_preview !== false;

        renderProfile(currentProfile);
        setTimeout(() => loadUserStats(), 100);

    } catch (error) {
        console.error('Profile load error:', error);
        renderProfile({ username: currentUser.email?.split('@')[0] || 'User' });
    }
}

function renderProfile(profile) {
    const username = profile.username || currentUser.email?.split('@')[0] || 'User';
    document.getElementById('displayName').textContent = username;
    document.getElementById('displayUsername').textContent = `@${username.toLowerCase()}`;

    const img = document.getElementById('avatarImage');
    const initialDiv = document.getElementById('avatarInitial');

    if (profile.avatar_url) {
        const preloadImg = new Image();
        preloadImg.src = profile.avatar_url;
        preloadImg.onload = () => {
            img.src = profile.avatar_url;
            img.style.display = 'block';
            initialDiv.style.display = 'none';
        };
        preloadImg.onerror = () => {
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
    } catch (error) {
        document.getElementById('friendsCount').textContent = '0';
        document.getElementById('messagesCount').textContent = '0';
    }
}

// ============================================================
// AVATAR
// ============================================================
window.openImagePicker = function() {
    document.getElementById('imagePickerModal').style.display = 'flex';
};

window.closeModal = function() {
    document.getElementById('imagePickerModal').style.display = 'none';
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
// NOTIFICATIONS — Enable
// ============================================================
window.enableNotifications = async function() {
    const btn = document.getElementById('enableNotificationsBtn');
    if (!btn) return;

    if (Notification.permission === 'granted') {
        // Re-subscribe silently in case they deleted the SW subscription
        if (window.relaytalkPush) {
            await window.relaytalkPush.init();
        }
        showToast('success', 'Notifications already enabled');
        return;
    }

    if (!window.relaytalkPush) {
        showToast('error', 'Notifications not ready. Please refresh.');
        return;
    }

    btn.disabled = true;
    btn.classList.add('loading');

    try {
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isStandalone = window.navigator.standalone === true;
        if (isIOS && !isStandalone) {
            alert('On iPhone, please tap Share → Add to Home Screen first, then reopen and tap Enable again.');
            btn.disabled = false;
            btn.classList.remove('loading');
            return;
        }

        const result = await window.relaytalkPush.request();
        if (result.success) {
            markNotifyEnabled();
            showToast('success', 'Notifications enabled!');
        } else {
            showToast('error', 'Could not enable: ' + (result.reason || 'denied'));
        }
    } catch (e) {
        console.error(e);
        showToast('error', 'Something went wrong');
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
};

// ============================================================
// NOTIFICATIONS — Reset
// ============================================================
window.resetNotifications = async function() {
    const btn = document.getElementById('resetNotificationsBtn');
    if (!btn) return;

    const ok = confirm('Reset notifications?\n\nThis will unsubscribe this device and create a fresh subscription. Any duplicate/broken ones will be cleaned up.');
    if (!ok) return;

    btn.disabled = true;
    btn.classList.add('loading');
    showToast('info', 'Resetting...');

    try {
        // 1. Unsubscribe from browser push
        if (window.relaytalkPush) {
            await window.relaytalkPush.unsubscribe();
        }

        // 2. Also delete all rows for this user (in case of stale subscriptions)
        if (supabase && currentUser) {
            await supabase.from('push_subscriptions').delete().eq('user_id', currentUser.id);
        }

        // 3. Brief wait so the browser finishes unsubscribing
        await new Promise(r => setTimeout(r, 800));

        // 4. Re-subscribe (permission is already granted, so no new prompt)
        if (window.relaytalkPush) {
            const result = await window.relaytalkPush.request();
            if (result.success) {
                markNotifyEnabled();
                showToast('success', 'Notifications reset successfully!');
            } else {
                showToast('error', 'Reset failed: ' + (result.reason || 'unknown'));
            }
        }
    } catch (e) {
        console.error(e);
        showToast('error', 'Reset failed');
    } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
    }
};

// ============================================================
// NOTIFY BUTTON STATE
// ============================================================
function markNotifyEnabled() {
    const btn = document.getElementById('enableNotificationsBtn');
    if (!btn) return;

    btn.classList.add('enabled');
    btn.querySelector('.notify-label').textContent = 'Enabled';
}

function updateNotifyButtonState() {
    const btn = document.getElementById('enableNotificationsBtn');
    if (!btn) return;

    if (!('Notification' in window)) {
        btn.style.display = 'none';
        return;
    }

    if (Notification.permission === 'granted') {
        markNotifyEnabled();
    } else if (Notification.permission === 'denied') {
        btn.classList.add('denied');
        btn.querySelector('.notify-label').textContent = 'Blocked';
    }
}

// ============================================================
// DETAILS TOGGLE
// ============================================================
window.toggleDetails = function() {
    // Show info popup explaining the change
    showDetailsInfo();
};

function showDetailsInfo() {
    const isCurrentlyOn = currentShowDetails;
    const titleEl = document.getElementById('detailsInfoTitle');
    const bodyEl = document.getElementById('detailsInfoBody');

    if (isCurrentlyOn) {
        // Currently ON → will turn OFF
        titleEl.innerHTML = '<i class="fas fa-eye-slash" style="color:#d97706;"></i> Hide Details';
        bodyEl.innerHTML = `
            <p style="margin-bottom:12px;">By turning this <strong>off</strong>, notifications will be less detailed:</p>
            <ul style="padding-left:20px; line-height:1.8;">
                <li>You'll only see <em>"There Is a New Message On RelayTalk"</em></li>
                <li><strong>No sender name</strong> will be shown</li>
                <li><strong>No avatar</strong> will be shown</li>
                <li><strong>No message content</strong> or images</li>
            </ul>
            <p style="margin-top:14px;color:#666;font-size:0.9rem;">Useful for privacy when your phone screen is visible to others.</p>
        `;
    } else {
        // Currently OFF → will turn ON
        titleEl.innerHTML = '<i class="fas fa-eye" style="color:#007acc;"></i> Show Details';
        bodyEl.innerHTML = `
            <p style="margin-bottom:12px;">By turning this <strong>on</strong>, notifications will include:</p>
            <ul style="padding-left:20px; line-height:1.8;">
                <li>The <strong>sender's name</strong> (bold)</li>
                <li>The <strong>sender's avatar</strong> as the notification icon</li>
                <li>The <strong>message content</strong></li>
                <li>A <strong>preview image</strong> when a photo is sent</li>
            </ul>
            <p style="margin-top:14px;color:#666;font-size:0.9rem;">Recommended if you want to know who messaged and what they said.</p>
        `;
    }

    document.getElementById('detailsInfoModal').style.display = 'flex';
}

window.closeDetailsInfo = function() {
    document.getElementById('detailsInfoModal').style.display = 'none';
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
    const btn = document.getElementById('detailsToggleBtn');
    const label = document.getElementById('detailsToggleLabel');
    if (!btn || !label) return;

    if (currentShowDetails) {
        btn.classList.add('active');
        btn.classList.remove('inactive');
        label.textContent = 'Details Visible';
    } else {
        btn.classList.add('inactive');
        btn.classList.remove('active');
        label.textContent = 'Details Hidden';
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
    const color = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007acc';

    toast.innerHTML = `
        <i class="fas fa-${icon}" style="color: ${color}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================================
// LOGOUT
// ============================================================
window.logout = async function() {
    try {
        document.getElementById('uploadLoading').style.display = 'flex';
        document.querySelector('.loading-text').textContent = 'Logging out...';

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

        window.location.href = '../../../pages/login/index.html';
    } catch (error) {
        window.location.href = '../../../pages/login/index.html';
    }
};

window.goToHome = () => window.location.href = '../../home/index.html';
window.goToFriends = () => window.location.href = '../friends/index.html';

document.addEventListener('DOMContentLoaded', initProfilePage);