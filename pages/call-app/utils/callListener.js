// ../../call-app/utils/callListener.js - UPDATED WITH TIMEOUT HANDLING

let supabase = null;
let currentUser = null;
let callChannel = null;
let callListeners = {};

/**
 * Initialize call listener for incoming calls
 * @param {Object} supabaseClient - Supabase client instance
 * @param {Object} user - Current user object
 * @param {Object} listeners - Event listeners
 * @param {Function} listeners.onIncomingCall - Callback for incoming calls
 */
export function initCallListener(supabaseClient, user, listeners = {}) {
    if (!supabaseClient || !user) {
        console.error('❌ Cannot initialize call listener: missing supabase or user');
        return;
    }

    // Store for later use
    supabase = supabaseClient;
    currentUser = user;
    callListeners = listeners;

    console.log('📞 Initializing call listener for user:', user.id);

    // Clean up any existing channel
    if (callChannel) {
        supabase.removeChannel(callChannel);
    }

    // Create a unique channel for this user to receive calls
    callChannel = supabase.channel(`calls:user:${user.id}`, {
        config: {
            broadcast: { self: true },
            presence: { key: 'call-status' }
        }
    });

    // Listen for incoming calls
    callChannel
        .on('broadcast', { event: 'incoming-call' }, (payload) => {
            console.log('📞🔥 Incoming call received:', payload);
            
            const callData = payload.payload;
            
            // Validate call data
            if (!callData || !callData.callId || !callData.callerId || !callData.room) {
                console.error('❌ Invalid call data:', callData);
                return;
            }
            
            // Ensure the call is for this user
            if (callData.calleeId !== user.id) {
                console.log('⏭️ Call not for this user, ignoring');
                return;
            }
            
            // Update call in database to 'ringing' status
            supabase
                .from('calls')
                .update({ 
                    status: 'ringing',
                    updated_at: new Date().toISOString()
                })
                .eq('id', callData.callId)
                .then(({ error }) => {
                    if (error) {
                        console.error('❌ Error updating call status:', error);
                    } else {
                        console.log('📞 Call status updated to ringing');
                    }
                });
            
            // Notify the UI
            if (callListeners.onIncomingCall) {
                callListeners.onIncomingCall(callData);
            }
        })
        .on('broadcast', { event: 'call-accepted' }, (payload) => {
            console.log('📞 Call accepted:', payload);
            // Handle call accepted (for the caller)
        })
        .on('broadcast', { event: 'call-rejected' }, (payload) => {
            console.log('📞 Call rejected:', payload);
            
            const callData = payload.payload;
            
            // Update call in database to 'rejected' status
            supabase
                .from('calls')
                .update({ 
                    status: 'rejected',
                    ended_at: new Date().toISOString()
                })
                .eq('id', callData.callId)
                .then(({ error }) => {
                    if (error) {
                        console.error('❌ Error updating call status:', error);
                    }
                });
        })
        .on('broadcast', { event: 'call-ended' }, (payload) => {
            console.log('📞 Call ended:', payload);
            
            const callData = payload.payload;
            
            // Update call in database to 'ended' status
            supabase
                .from('calls')
                .update({ 
                    status: 'ended',
                    ended_at: new Date().toISOString()
                })
                .eq('id', callData.callId)
                .then(({ error }) => {
                    if (error) {
                        console.error('❌ Error updating call status:', error);
                    }
                });
        })
        .subscribe((status) => {
            console.log('📞 Call listener subscription status:', status);
        });

    return callChannel;
}

/**
 * Send an incoming call notification to a user
 * @param {string} userId - User ID to notify
 * @param {Object} callData - Call data (callId, room, callerId, calleeId)
 */
export async function sendIncomingCall(userId, callData) {
    if (!supabase) {
        console.error('❌ Cannot send call: listener not initialized');
        return false;
    }

    const channel = supabase.channel(`calls:user:${userId}`);
    
    await channel.subscribe();
    
    channel.send({
        type: 'broadcast',
        event: 'incoming-call',
        payload: callData
    });
    
    // Clean up channel after sending
    setTimeout(() => {
        supabase.removeChannel(channel);
    }, 1000);
    
    return true;
}

/**
 * Clean up call listener
 */
export function cleanupCallListener() {
    if (callChannel && supabase) {
        supabase.removeChannel(callChannel);
        callChannel = null;
    }
}