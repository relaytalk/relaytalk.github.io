// profile.js - Simple Profile with IMGBB Avatar Upload + Notifications

import { initializeSupabase, supabase as supabaseClient } from '../../../utils/supabase.js';

// IMGBB API Key
const IMGBB_API_KEY = '82e49b432e2ee14921f7d0cd81ba5551';

let supabase = null;
let currentUser = null;
let currentProfile = null;

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

        // Reflect notification permission state on the button
        updateNotifyButtonState();

    } catch (error) {
        console.error('Init error:', error);
        showToast('error', 'Failed to load profile');

        setTimeout(() => {
            window.location.href = '../../../pages/login/index.html';
        }, 2000);
    }
}

// ============================================================
// PROFILE LOADING
// ============================================================
async function loadProfile() {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, status, last_seen')
            .eq('id', currentUser.id)
            .maybeSingle();

        if (error) throw error;

        currentProfile = profile || {
            id: currentUser.id,
            username: currentUser.email?.split('@')[0] || 'User'
        };

        renderProfile(currentProfile);
        setTimeout(() => loadUserStats(), 100);

    } catch (error) {
        console.error('Profile load error:', error);
        renderProfile({
            username: currentUser.email?.split('@')[0] || 'User'
        });
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
        const { count: friendsCount, error } = await supabase
            .from('friends')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);

        if (error) throw error;

        document.getElementById('friendsCount').textContent = friendsCount || 0;
        document.getElementById('messagesCount').textContent = '0';

    } catch (error) {
        console.error('Stats error:', error);
        document.getElementById('friendsCount').textContent = '0';
        document.getElementById('messagesCount').textContent = '0';
    }
}

// ============================================================
// IMAGE PICKER
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
            .update({
                avatar_url: imageUrl,
                updated_at: new Date().toISOString()
            })
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
            .update({
                avatar_url: null,
                updated_at: new Date().toISOString()
            })
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
        console.error('Remove error:', error);
        showToast('error', 'Failed to remove photo');
    } finally {
        document.getElementById('uploadLoading').style.display = 'none';
        closeModal();
    }
};

// ============================================================
// NOTIFICATIONS
// ============================================================
window.enableNotifications = async function() {
    const btn = document.getElementById('enableNotificationsBtn');
    if (!btn) return;

    // If already enabled, show a friendly message
    if (Notification.permission === 'granted') {
        showToast('success', 'Notifications are already enabled');
        return;
    }

    if (!window.relaytalkPush) {
        showToast('error', 'Notifications not ready. Please refresh.');
        return;
    }

    const original = btn.innerHTML;
    btn.innerHTML = `
        <span class="notify-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
        </span>
        <span class="notify-text">Enabling...</span>
    `;
    btn.disabled = true;
    btn.classList.add('loading');

    try {
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isStandalone = window.navigator.standalone === true;
        if (isIOS && !isStandalone) {
            alert('On iPhone, please tap Share → Add to Home Screen first, then open RelayTalk from your home screen and tap this button again.');
            btn.innerHTML = original;
            btn.disabled = false;
            btn.classList.remove('loading');
            return;
        }

        const result = await window.relaytalkPush.request();

        if (result.success) {
            markNotifyEnabled();
            showToast('success', 'Notifications enabled!');
        } else {
            btn.innerHTML = original;
            btn.disabled = false;
            btn.classList.remove('loading');
            showToast('error', 'Could not enable notifications: ' + (result.reason || 'denied'));
        }
    } catch (e) {
        console.error(e);
        btn.innerHTML = original;
        btn.disabled = false;
        btn.classList.remove('loading');
        showToast('error', 'Something went wrong');
    }
};

// Reflect current state in the button on page load
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
        const text = btn.querySelector('.notify-text');
        if (text) text.textContent = 'Notifications Blocked';
    }
}

function markNotifyEnabled() {
    const btn = document.getElementById('enableNotificationsBtn');
    if (!btn) return;

    btn.classList.remove('loading');
    btn.classList.remove('denied');
    btn.classList.add('enabled');
    btn.disabled = false;

    btn.innerHTML = `
        <span class="notify-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6 9 17l-5-5"/>
            </svg>
        </span>
        <span class="notify-text">Notifications Enabled</span>
    `;
}

// ============================================================
// TOAST
// ============================================================
function showToast(type, message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'check-circle' : 'exclamation-circle';
    const color = type === 'success' ? '#28a745' : '#dc3545';

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

        // Best-effort: unsubscribe from push on logout
        try {
            if (window.relaytalkPush && window.relaytalkPush.unsubscribe) {
                await window.relaytalkPush.unsubscribe();
            }
        } catch (e) {
            console.warn('Push unsubscribe failed (non-fatal):', e);
        }

        if (supabase) await supabase.auth.signOut();

        localStorage.clear();
        sessionStorage.clear();

        document.cookie.split(";").forEach(function(c) {
            document.cookie = c.replace(/^ +/, "")
                .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });

        window.location.href = '../../../pages/login/index.html';

    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = '../../../pages/login/index.html';
    }
};

// Navigation
window.goToHome = () => window.location.href = '../../home/index.html';
window.goToFriends = () => window.location.href = '../friends/index.html';

// Initialize
document.addEventListener('DOMContentLoaded', initProfilePage);
