// pages/home/friends/history/history.js - Complete with Missed Call Counter

import { initializeSupabase } from '../../../call-app/utils/supabase.js';
import { getRelayTalkUser, syncUserToDatabase } from '../../../call-app/utils/userSync.js';

let supabase;
let currentUser;
let allCalls = [];
let currentFilter = 'all';
let missedCallCount = 0;

// Initialize history page
async function initHistory() {
    document.getElementById('loadingIndicator').style.display = 'flex';

    try {
        const user = getRelayTalkUser();
        if (!user) {
            window.location.href = '../../../index.html';
            return;
        }

        supabase = await initializeSupabase();
        currentUser = await syncUserToDatabase(supabase, user);

        await loadCallHistory();
        
        // Mark missed calls as seen
        await markMissedCallsAsSeen();

        document.getElementById('loadingIndicator').style.display = 'none';

    } catch (error) {
        console.error('History error:', error);
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('historyList').innerHTML = `
            <div class="empty-history">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error loading history</h3>
                <p>Please try again</p>
                <button onclick="location.reload()" class="primary-btn" style="background: #007acc; color: white; margin-top: 16px;">
                    Retry
                </button>
            </div>
        `;
    }
}

// Load call history
async function loadCallHistory() {
    const { data: calls, error } = await supabase
        .from('calls')
        .select('*')
        .or(`caller_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) throw error;

    allCalls = calls || [];

    // Count missed calls
    missedCallCount = allCalls.filter(call => {
        const isMissed = call.status === 'missed' || 
                        (call.status === 'ringing' && call.receiver_id === currentUser.id);
        const isNew = !call.seen;
        return isMissed && isNew;
    }).length;

    updateMissedCallBadge();

    // Get unique user IDs to fetch profiles
    const userIds = new Set();
    allCalls.forEach(call => {
        if (call.caller_id !== currentUser.id) userIds.add(call.caller_id);
        if (call.receiver_id !== currentUser.id) userIds.add(call.receiver_id);
    });

    // Fetch profiles
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', [...userIds]);

    const profileMap = {};
    profiles?.forEach(p => profileMap[p.id] = p);

    renderHistory(allCalls, profileMap);
}

// Mark missed calls as seen
async function markMissedCallsAsSeen() {
    const missedCalls = allCalls.filter(call => {
        const isMissed = call.status === 'missed' || 
                        (call.status === 'ringing' && call.receiver_id === currentUser.id);
        return isMissed && !call.seen;
    });

    if (missedCalls.length === 0) return;

    const missedIds = missedCalls.map(call => call.id);
    
    await supabase
        .from('calls')
        .update({ seen: true })
        .in('id', missedIds);

    // Update badge immediately
    missedCallCount = 0;
    updateMissedCallBadge();
}

// Update missed call badge
function updateMissedCallBadge() {
    const badge = document.getElementById('missedCallBadge');
    if (badge) {
        if (missedCallCount > 0) {
            badge.textContent = missedCallCount > 9 ? '9+' : missedCallCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Render history with filter
function renderHistory(calls, profileMap) {
    if (!calls || calls.length === 0) {
        document.getElementById('historyList').innerHTML = `
            <div class="empty-history">
                <i class="fas fa-history"></i>
                <h3>No call history</h3>
                <p>Your calls will appear here</p>
                <button onclick="window.location.href='../../index.html'" class="primary-btn" style="background: #007acc; color: white; margin-top: 16px;">
                    Make a Call
                </button>
            </div>
        `;
        return;
    }

    // Apply filter
    let filteredCalls = calls;
    if (currentFilter === 'active') {
        filteredCalls = calls.filter(call => call.status === 'active');
    } else if (currentFilter === 'missed') {
        filteredCalls = calls.filter(call => {
            const isMissed = call.status === 'missed' || 
                           (call.status === 'ringing' && call.receiver_id === currentUser.id);
            return isMissed;
        });
    } else if (currentFilter === 'outgoing') {
        filteredCalls = calls.filter(call => call.caller_id === currentUser.id);
    }

    if (filteredCalls.length === 0) {
        document.getElementById('historyList').innerHTML = `
            <div class="empty-history">
                <i class="fas fa-filter"></i>
                <h3>No calls match filter</h3>
                <button onclick="filterHistory('all')" class="link-btn" style="color: #007acc; margin-top: 8px;">
                    Show All
                </button>
            </div>
        `;
        return;
    }

    let html = '';
    let currentDate = '';

    filteredCalls.forEach(call => {
        const callDate = new Date(call.created_at).toLocaleDateString();

        if (callDate !== currentDate) {
            currentDate = callDate;
            html += `<div class="history-date">${currentDate}</div>`;
        }

        const isOutgoing = call.caller_id === currentUser.id;
        const otherUserId = isOutgoing ? call.receiver_id : call.caller_id;
        const otherUser = profileMap[otherUserId] || { username: 'Unknown', avatar_url: null };
        const initial = otherUser.username.charAt(0).toUpperCase();

        let statusClass = '';
        let statusText = '';

        if (call.status === 'active') {
            statusClass = 'status-active';
            statusText = 'Answered';
        } else if (call.status === 'missed' || (call.status === 'ringing' && !isOutgoing)) {
            statusClass = 'status-missed';
            statusText = 'Missed';
        } else if (call.status === 'rejected') {
            statusClass = 'status-rejected';
            statusText = 'Rejected';
        } else if (call.status === 'cancelled' && isOutgoing) {
            statusClass = 'status-rejected';
            statusText = 'Cancelled';
        } else if (call.status === 'ringing' && isOutgoing) {
            statusClass = 'status-outgoing';
            statusText = 'Ringing';
        } else {
            statusClass = 'status-missed';
            statusText = call.status;
        }

        // Calculate duration if available
        let duration = '';
        if (call.duration && call.duration > 0) {
            duration = formatDuration(call.duration);
        } else if (call.started_at && call.ended_at) {
            const start = new Date(call.started_at);
            const end = new Date(call.ended_at);
            const diff = Math.floor((end - start) / 1000);
            duration = formatDuration(diff);
        }

        const time = new Date(call.created_at).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        html += `
            <div class="history-item">
                <div class="history-avatar">
                    ${otherUser.avatar_url 
                        ? `<img src="${otherUser.avatar_url}" alt="${otherUser.username}">`
                        : `<span>${initial}</span>`
                    }
                </div>
                <div class="history-info">
                    <div class="history-name">${otherUser.username}</div>
                    <div class="history-meta">
                        <span>${isOutgoing ? '📤 Outgoing' : '📥 Incoming'}</span>
                        <span>•</span>
                        <span>${time}</span>
                        ${duration ? `<span>•</span><span>${duration}</span>` : ''}
                    </div>
                </div>
                <div class="history-status ${statusClass}">${statusText}</div>
            </div>
        `;
    });

    document.getElementById('historyList').innerHTML = html;
}

// Format duration
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Filter history
window.filterHistory = function(filter) {
    currentFilter = filter;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');

    // Reload with filter (we already have allCalls)
    const userIds = new Set();
    allCalls.forEach(call => {
        if (call.caller_id !== currentUser.id) userIds.add(call.caller_id);
        if (call.receiver_id !== currentUser.id) userIds.add(call.receiver_id);
    });

    // We need profiles again
    supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', [...userIds])
        .then(({ data: profiles }) => {
            const profileMap = {};
            profiles?.forEach(p => profileMap[p.id] = p);
            renderHistory(allCalls, profileMap);
        });
};

// Start
document.addEventListener('DOMContentLoaded', initHistory);