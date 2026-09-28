// pages/home/profile/view.js
// Friend profile viewer — shows bio, status, actions, calls.

import { initializeSupabase } from '../../../utils/supabase.js';

let supabase = null;
let currentUser = null;
let viewedUser = null;
let friendSinceDate = null;
let statusChannel = null;

// Online freshness window — matches callHub.js / friends.js / chat-core.js
const ONLINE_FRESH_WINDOW_MS = 60000;

// ============================================================
// ONLINE HELPER
// ============================================================
function isUserOnline(profile) {
    if (!profile) return false;
    if (profile.status !== 'online') return false;
    if (!profile.last_seen) return false;
    try {
        const ageMs = Date.now() - new Date(profile.last_seen).getTime();
        return ageMs < ONLINE_FRESH_WINDOW_MS;
    } catch (e) {
        return false;
    }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', initViewPage);

async function initViewPage() {
    try {
        supabase = await initializeSupabase();
        if (!supabase?.auth) throw new Error('No Supabase');

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
            window.location.href = '../../login/index.html';
            return;
        }
        currentUser = session.user;

        const params = new URLSearchParams(window.location.search);
        const userId = params.get('userId');

        if (!userId) {
            showFallback();
            return;
        }

        if (userId === currentUser.id) {
            window.location.href = 'index.html';
            return;
        }

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url, status, last_seen, bio')
            .eq('id', userId)
            .maybeSingle();

        if (error || !profile) {
            showFallback();
            return;
        }

        viewedUser = profile;

        await loadFriendshipDate();

        renderPage();
        subscribeToStatus();
        startStatusTicker();

    } catch (error) {
        console.error('View init error:', error);
        showFallback();
    }
}

// ============================================================
// LOAD WHEN WE BECAME FRIENDS
// ============================================================
async function loadFriendshipDate() {
    try {
        const { data } = await supabase
            .from('friends')
            .select('created_at')
            .eq('user_id', currentUser.id)
            .eq('friend_id', viewedUser.id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (data?.created_at) {
            friendSinceDate = data.created_at;
        }
    } catch (e) {
        console.warn('Could not load friendship date:', e);
    }
}

// ============================================================
// RENDER
// ============================================================
function renderPage() {
    const main = document.getElementById('viewMain');
    if (main) main.style.display = 'flex';

    const initial = viewedUser.username ? viewedUser.username.charAt(0).toUpperCase() : '?';
    const avatarImg = document.getElementById('viewAvatarImg');
    const avatarInitial = document.getElementById('viewAvatarInitial');

    if (viewedUser.avatar_url) {
        avatarImg.onload = () => {
            avatarImg.style.display = 'block';
            avatarInitial.style.display = 'none';
        };
        avatarImg.onerror = () => {
            avatarImg.style.display = 'none';
            avatarInitial.style.display = 'flex';
        };
        avatarImg.src = viewedUser.avatar_url;
        avatarImg.alt = viewedUser.username;
    } else {
        avatarInitial.textContent = initial;
    }

    document.getElementById('viewName').textContent = viewedUser.full_name || viewedUser.username;
    document.getElementById('viewUsername').textContent = `@${viewedUser.username}`;

    updateStatusUI(viewedUser);

    const bioBox = document.getElementById('viewBioBox');
    if (viewedUser.bio && viewedUser.bio.trim()) {
        bioBox.textContent = viewedUser.bio.trim();
        bioBox.classList.remove('empty');
    } else {
        bioBox.innerHTML = '<span class="view-bio-empty">No biography yet.</span>';
        bioBox.classList.add('empty');
    }

    const sinceEl = document.getElementById('viewFriendsSince');
    if (friendSinceDate) {
        const dt = new Date(friendSinceDate);
        const formatted = dt.toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        });
        sinceEl.textContent = `You both have been friends since ${formatted}`;
    } else {
        sinceEl.textContent = '';
    }
}

// ============================================================
// STATUS UI — online if status==='online' AND last_seen is fresh
// ============================================================
function updateStatusUI(profile) {
    const dot = document.getElementById('viewStatusDot');
    const text = document.getElementById('viewStatusText');
    if (!dot || !text) return;

    const online = isUserOnline(profile);

    if (online) {
        dot.classList.add('online');
        text.textContent = 'Online';
        text.classList.add('online');
    } else {
        dot.classList.remove('online');
        const label = profile.last_seen
            ? `Last seen ${formatLastSeenShort(profile.last_seen)}`
            : 'Offline';
        text.textContent = label;
        text.classList.remove('online');
    }
}

function formatLastSeenShort(ts) {
    try {
        const now = new Date();
        const t = new Date(ts);
        const diffMs = now - t;
        const sec = Math.floor(diffMs / 1000);
        const min = Math.floor(sec / 60);
        const hr = Math.floor(min / 60);
        const day = Math.floor(hr / 24);

        if (sec < 60) return 'now';
        if (min < 60) return `${min}m ago`;
        if (hr < 24) return `${hr}h ago`;
        if (day === 1) return 'yesterday';
        if (day < 7) return `${day}d ago`;
        if (day < 30) return `${Math.floor(day / 7)}w ago`;
        return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
        return 'a while ago';
    }
}

// ============================================================
// STATUS REALTIME
// ============================================================
function subscribeToStatus() {
    if (statusChannel) {
        supabase.removeChannel(statusChannel);
        statusChannel = null;
    }

    statusChannel = supabase
        .channel(`view-status:${viewedUser.id}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${viewedUser.id}`
        }, (payload) => {
            if (payload.new) {
                viewedUser.status = payload.new.status;
                viewedUser.last_seen = payload.new.last_seen;
                viewedUser.avatar_url = payload.new.avatar_url || viewedUser.avatar_url;
                viewedUser.bio = payload.new.bio;

                updateStatusUI(viewedUser);

                if (payload.new.avatar_url) {
                    const img = document.getElementById('viewAvatarImg');
                    if (img && img.src !== payload.new.avatar_url) {
                        img.src = payload.new.avatar_url;
                        img.style.display = 'block';
                        const initial = document.getElementById('viewAvatarInitial');
                        if (initial) initial.style.display = 'none';
                    }
                }

                const bioBox = document.getElementById('viewBioBox');
                if (bioBox) {
                    if (payload.new.bio && payload.new.bio.trim()) {
                        bioBox.textContent = payload.new.bio.trim();
                        bioBox.classList.remove('empty');
                    } else {
                        bioBox.innerHTML = '<span class="view-bio-empty">No biography yet.</span>';
                        bioBox.classList.add('empty');
                    }
                }
            }
        })
        .subscribe();
}

// ============================================================
// STATUS TICKER
// ============================================================
// The realtime listener only fires when the DB row changes. If the
// user stops heartbeating, we don't get an UPDATE — the row stays
// 'online' forever. So we re-evaluate the label locally every 20s
// and flip to "Offline" once last_seen gets stale.
let statusTicker = null;

function startStatusTicker() {
    if (statusTicker) clearInterval(statusTicker);
    statusTicker = setInterval(() => {
        if (viewedUser) updateStatusUI(viewedUser);
    }, 20000);

    window.addEventListener('beforeunload', () => {
        if (statusTicker) clearInterval(statusTicker);
        if (statusChannel && supabase) supabase.removeChannel(statusChannel);
    });
}

// ============================================================
// ACTIONS
// ============================================================
window.closeView = function() {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = '../index.html';
    }
};

window.openChat = function() {
    if (!viewedUser) return;
    window.location.href = `../../chats/index.html?friendId=${viewedUser.id}`;
};

window.startCallFromView = function() {
    if (!viewedUser) return;

    if (typeof window.startCall !== 'function') {
        showToast('Calling not ready yet', '⚠️');
        return;
    }

    window.startCall(viewedUser.id, viewedUser.username || 'Friend');
};

// ============================================================
// HELPERS
// ============================================================
function showFallback() {
    const fallback = document.getElementById('fallbackScreen');
    if (fallback) fallback.style.display = 'flex';
}

function showToast(message, icon = '✅') {
    const toast = document.getElementById('viewToast');
    document.getElementById('viewToastText').textContent = message;
    document.getElementById('viewToastIcon').textContent = icon;
    toast.style.display = 'flex';
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => { toast.style.display = 'none'; }, 200);
    }, 2000);
}