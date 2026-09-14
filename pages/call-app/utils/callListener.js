// pages/call-app/utils/callListener.js - NEW MUMBAI PROJECT

let supabase = null;
let currentUser = null;
let callChannel = null;
let callListeners = {};

/**
 * Initialize call listener for incoming calls
 */
export function initCallListener(supabaseClient, user, listeners = {}) {
    if (!supabaseClient || !user) {
        console.error('❌ Cannot initialize call listener: missing supabase or user');
        return;
    }

    supabase = supabaseClient;
    currentUser = user;
    callListeners = listeners;

    console.log('📞 Initializing call listener for user:', user.id);

    if (callChannel) {
        supabase.removeChannel(callChannel);
    }

    callChannel = supabase.channel(`calls:user:${user.id}`, {
        config: {
            broadcast: { self: true },
            presence: { key: 'call-status' }
        }
    });

    callChannel
        .on('broadcast', { event: 'incoming-call' }, (payload) => {
            console.log('📞🔥 Incoming call received:', payload);

            const callData = payload.payload;

            if (!callData || !callData.callId || !callData.callerId || !callData.room) {
                console.error('❌ Invalid call data:', callData);
                return;
            }

            if (callData.calleeId !== user.id) {
                console.log('⏭️ Call not for this user, ignoring');
                return;
            }

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

            if (callListeners.onIncomingCall) {
                callListeners.onIncomingCall(callData);
            }
        })
        .on('broadcast', { event: 'call-accepted' }, (payload) => {
            console.log('📞 Call accepted:', payload);
        })
        .on('broadcast', { event: 'call-rejected' }, (payload) => {
            console.log('📞 Call rejected:', payload);

            const callData = payload.payload;

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