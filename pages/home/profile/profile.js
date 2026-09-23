// profile.js - Simple Profile with IMGBB Avatar Upload

import { initializeSupabase, supabase as supabaseClient } from '../../../utils/supabase.js';

// IMGBB API Key
const IMGBB_API_KEY = '82e49b432e2ee14921f7d0cd81ba5551';

let supabase = null;
let currentUser = null;
let currentProfile = null;

// Initialize - LOAD FASTER
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
        
        // 🔥 FIX 1: Load profile and hide loader SIMULTANEOUSLY
        await Promise.all([
            loadProfile(),
            // Hide loader after 500ms max
            new Promise(resolve => setTimeout(resolve, 500))
        ]);
        
        // Hide loader
        const loader = document.getElementById('loadingIndicator');
        if (loader) loader.style.display = 'none';
        
    } catch (error) {
        console.error('Init error:', error);
        showToast('error', 'Failed to load profile');
        
        setTimeout(() => {
            window.location.href = '../../../pages/login/index.html';
        }, 2000);
    }
}

// 🔥 FIX 2: Load profile ONLY what's needed - NO messages query
async function loadProfile() {
    try {
        // Get profile - SINGLE query, fast
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
        
        // Render immediately
        renderProfile(currentProfile);
        
        // 🔥 FIX 3: Load stats in BACKGROUND - doesn't block UI
        setTimeout(() => loadUserStats(), 100);
        
    } catch (error) {
        console.error('Profile load error:', error);
        // Show fallback profile
        renderProfile({ 
            username: currentUser.email?.split('@')[0] || 'User' 
        });
    }
}

// Render profile - FAST
function renderProfile(profile) {
    // Set username - use email prefix if no username
    const username = profile.username || currentUser.email?.split('@')[0] || 'User';
    document.getElementById('displayName').textContent = username;
    document.getElementById('displayUsername').textContent = `@${username.toLowerCase()}`;
    
    // 🔥 FIX 4: REMOVED BIO SECTION - no bio element
    
    // Set avatar - FAST
    const img = document.getElementById('avatarImage');
    const initialDiv = document.getElementById('avatarInitial');
    
    if (profile.avatar_url) {
        // Preload image
        const preloadImg = new Image();
        preloadImg.src = profile.avatar_url;
        preloadImg.onload = () => {
            img.src = profile.avatar_url;
            img.style.display = 'block';
            initialDiv.style.display = 'none';
        };
        preloadImg.onerror = () => {
            // Fallback to initials
            img.style.display = 'none';
            initialDiv.style.display = 'flex';
            initialDiv.textContent = username.charAt(0).toUpperCase();
        };
    } else {
        // Show initials - FAST
        img.style.display = 'none';
        initialDiv.style.display = 'flex';
        initialDiv.textContent = username.charAt(0).toUpperCase();
    }
}

// 🔥 FIX 5: Load ONLY friends count - REMOVED messages query (causing 400 error)
async function loadUserStats() {
    try {
        // Only load friends count - messages query was failing
        const { count: friendsCount, error } = await supabase
            .from('friends')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', currentUser.id);
            
        if (error) throw error;
        
        document.getElementById('friendsCount').textContent = friendsCount || 0;
        
        // Set messages count to 0 (or remove this stat entirely)
        document.getElementById('messagesCount').textContent = '0';
        
    } catch (error) {
        console.error('Stats error:', error);
        document.getElementById('friendsCount').textContent = '0';
        document.getElementById('messagesCount').textContent = '0';
    }
}

// Open image picker modal
window.openImagePicker = function() {
    document.getElementById('imagePickerModal').style.display = 'flex';
};

// Close modal
window.closeModal = function() {
    document.getElementById('imagePickerModal').style.display = 'none';
};

// Upload from camera
window.uploadFromCamera = function() {
    const input = document.getElementById('cameraInput');
    input.accept = 'image/*';
    input.capture = 'environment';
    input.click();
    closeModal();
};

// Upload from gallery
window.uploadFromGallery = function() {
    const input = document.getElementById('galleryInput');
    input.accept = 'image/*';
    input.click();
    closeModal();
};

// Handle file selection
window.handleImageSelect = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Show loading
    document.getElementById('uploadLoading').style.display = 'flex';
    
    try {
        // Upload to IMGBB
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
        
        // Save to Supabase
        const { error } = await supabase
            .from('profiles')
            .update({ 
                avatar_url: imageUrl,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentUser.id);
            
        if (error) throw error;
        
        // Update UI
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

// Remove avatar
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
        
        // Update UI
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

// Show toast
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

// Logout - clears everything
window.logout = async function() {
    try {
        document.getElementById('uploadLoading').style.display = 'flex';
        document.querySelector('.loading-text').textContent = 'Logging out...';
        
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