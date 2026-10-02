// pages/home/profile/view.js
// Friend profile viewer — shows bio, status, actions, calls.
// Now supports "not friends" state: hides Message/Call, shows a notice.

import { initializeSupabase } from '../../../utils/supabase.js';

let supabase = null;
let currentUser = null;
let viewedUser = null;
let friendSinceDate = null;
let isFriend = false;
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

        // Check friendship BEFORE rendering, so the actions area is correct
        // on the very first paint (no flicker).
        await checkFriendship();
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
// FRIENDSHIP CHECK
// ============================================================
async function checkFriendship() {
    isFriend = false;
    try {
        const { data } = await supabase
            .from('friends')
            .select('friend_id')
            .eq('user_id', currentUser.id)
            .eq('friend_id', viewedUser.id)
            .maybeSingle();

        isFriend = !!data;
    } catch (e) {
        console.warn('Friendship check failed:', e);
        isFriend = false;
    }
}

// ============================================================
// LOAD WHEN WE BECAME FRIENDS
// ============================================================
async function loadFriendshipDate() {
    friendSinceDate = null;
    if (!isFriend) return;

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

    renderActionsAndFooter();
}

// ============================================================
// ACTIONS + FOOTER (depends on friendship)
// ============================================================
function renderActionsAndFooter() {
    const actionsEl = document.querySelector('.view-actions');
    const sinceEl = document.getElementById('viewFriendsSince');

    if (isFriend) {
        // Show Message + Call (restore if previously hidden)
        if (actionsEl) {
            actionsEl.style.display = '';
        }
        // Remove any previously-injected notice
        const existingNotice = document.getElementById('viewNotFriendsNotice');
        if (existingNotice) existingNotice.remove();

        // Footer text
        if (sinceEl) {
            if (friendSinceDate) {
                const dt = new Date(friendSinceDate);
                const formatted = dt.toLocaleDateString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric'
                });
                sinceEl.textContent = `You both have been friends since ${formatted}`;
            } else {
                sinceEl.textContent = '';
            }
            sinceEl.style.display = '';
        }
    } else {
        // Hide Message + Call
        if (actionsEl) {
            actionsEl.style.display = 'none';
        }

        // Hide "friends since" line
        if (sinceEl) {
            sinceEl.textContent = '';
            sinceEl.style.display = 'none';
        }

        // Inject a friendly "not friends yet" notice where the buttons used to be
        const existingNotice = document.getElementById('viewNotFriendsNotice');
        if (existingNotice) existingNotice.remove();

        const notice = document.createElement('div');
        notice.id = 'viewNotFriendsNotice';
        notice.className = 'view-not-friends';
        notice.innerHTML = `
            <div class="view-not-friends-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="8.5" cy="7" r="4"/>
                    <line x1="20" y1="8" x2="20" y2="14"/>
                    <line x1="23" y1="11" x2="17" y2="11"/>
                </svg>
            </div>
            <div class="view-not-friends-text">
                <div class="view-not-friends-title">You're not friends yet</div>
                <div class="view-not-friends-desc">Send a friend request from the search page to start chatting and calling.</div>
            </div>
        `;

        // Insert right before the bio section, so it sits where the buttons were
        const bioSection = document.querySelector('.view-bio-section');
        if (bioSection && bioSection.parentNode) {
            bioSection.parentNode.insertBefore(notice, bioSection);
        } else {
            const main = document.getElementById('viewMain');
            if (main) main.appendChild(notice);
        }
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
    if (!isFriend) {
        showToast('You are not friends yet', '⚠️');
        return;
    }
    window.location.href = `../../chats/index.html?friendId=${viewedUser.id}`;
};

window.startCallFromView = function() {
    if (!viewedUser) return;

    if (!isFriend) {
        showToast('You are not friends yet', '⚠️');
        return;
    }

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