// /app/utils/callService.js - SIMPLIFIED FOR DIRECT CALLS
import { supabase } from './supabase.js';

class CallService {
    constructor() {
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.currentCall = null;
        this.isCaller = false;
        this.userId = null;
        
        this.callState = 'idle';
        this.callStartTime = null;
        this.callTimer = null;
        
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478?transport=udp' }
        ];
        
        this.onCallStateChange = null;
        this.onRemoteStream = null;
        this.onCallEvent = null;
        
        console.log("✅ Call Service initialized");
    }

    async initialize(userId) {
        this.userId = userId;
        return true;
    }

    async initiateCall(friendId, type = 'voice') {
        try {
            this.isCaller = true;
            
            // Create call record
            const roomId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const { data: call, error } = await supabase
                .from('calls')
                .insert({
                    room_id: roomId,
                    caller_id: this.userId,
                    receiver_id: friendId,
                    call_type: type,
                    status: 'ringing',
                    initiated_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (error) throw error;
            this.currentCall = call;
            
            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });
            
            // Create peer connection
            this.peerConnection = new RTCPeerConnection({
                iceServers: this.iceServers
            });
            
            // Add local tracks
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Setup event handlers
            this.setupPeerConnection();
            
            // Create offer
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
            });
            
            await this.peerConnection.setLocalDescription(offer);
            
            // Save offer to DB
            await supabase
                .from('calls')
                .update({ 
                    sdp_offer: JSON.stringify(offer),
                    updated_at: new Date().toISOString()
                })
                .eq('id', call.id);
            
            // Listen for answer
            this.listenForCallUpdates();
            
            // Update state
            this.updateState('ringing');
            
            return call;
            
        } catch (error) {
            console.error("❌ Initiate call failed:", error);
            this.cleanup();
            throw error;
        }
    }

    async answerCall(callId) {
        try {
            this.isCaller = false;
            
            // Get call data
            const { data: call, error } = await supabase
                .from('calls')
                .select('*')
                .eq('id', callId)
                .single();
            
            if (error) throw error;
            this.currentCall = call;
            
            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false
            });
            
            // Create peer connection
            this.peerConnection = new RTCPeerConnection({
                iceServers: this.iceServers
            });
            
            // Add local tracks
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            
            // Setup event handlers
            this.setupPeerConnection();
            
            // Set remote offer
            const offer = JSON.parse(call.sdp_offer);
            await this.peerConnection.setRemoteDescription(
                new RTCSessionDescription(offer)
            );
            
            // Create answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            // Save answer to DB
            await supabase
                .from('calls')
                .update({ 
                    sdp_answer: JSON.stringify(answer),
                    status: 'active',
                    started_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', callId);
            
            // Listen for updates
            this.listenForCallUpdates();
            
            // Update state
            this.updateState('active');
            
            return true;
            
        } catch (error) {
            console.error("❌ Answer call failed:", error);
            this.cleanup();
            throw error;
        }
    }

    setupPeerConnection() {
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.currentCall) {
                this.sendIceCandidate(event.candidate);
            }
        };
        
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            if (this.onRemoteStream) {
                this.onRemoteStream(this.remoteStream);
            }
        };
        
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            
            if (state === 'connected') {
                this.updateState('active');
                this.startTimer();
            } else if (state === 'disconnected' || state === 'failed') {
                this.endCall();
            }
        };
    }

    async sendIceCandidate(candidate) {
        if (!this.currentCall) return;
        
        const receiverId = this.isCaller ? 
            this.currentCall.receiver_id : 
            this.currentCall.caller_id;
        
        await supabase
            .channel(`call-${this.currentCall.room_id}`)
            .send({
                type: 'broadcast',
                event: 'ice-candidate',
                payload: {
                    candidate: candidate.toJSON(),
                    senderId: this.userId,
                    receiverId: receiverId
                }
            });
    }

    listenForCallUpdates() {
        if (!this.currentCall) return;
        
        supabase
            .channel(`call-${this.currentCall.room_id}`)
            .on('broadcast', { event: 'ice-candidate' }, async (payload) => {
                const { candidate, senderId } = payload.payload;
                if (senderId !== this.userId && this.peerConnection) {
                    try {
                        await this.peerConnection.addIceCandidate(
                            new RTCIceCandidate(candidate)
                        );
                    } catch (error) {
                        console.log("ICE candidate error:", error);
                    }
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'calls',
                filter: `id=eq.${this.currentCall.id}`
            }, async (payload) => {
                const call = payload.new;
                
                // Caller receives answer
                if (this.isCaller && call.sdp_answer) {
                    const answer = JSON.parse(call.sdp_answer);
                    await this.peerConnection.setRemoteDescription(
                        new RTCSessionDescription(answer)
                    );
                    this.updateState('active');
                }
                
                // Call ended
                if (call.status === 'ended' || call.status === 'rejected') {
                    this.endCall();
                }
            })
            .subscribe();
    }

    async endCall() {
        if (!this.currentCall) return;
        
        try {
            await supabase
                .from('calls')
                .update({
                    status: 'ended',
                    ended_at: new Date().toISOString(),
                    duration: this.callStartTime ? 
                        Math.floor((Date.now() - this.callStartTime) / 1000) : 0,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.currentCall.id);
            
            if (this.onCallEvent) {
                this.onCallEvent('call_ended', {});
            }
            
        } catch (error) {
            console.error("Error ending call:", error);
        }
        
        this.cleanup();
    }

    async toggleMute() {
        if (!this.localStream) return false;
        
        const audioTracks = this.localStream.getAudioTracks();
        const isMuted = audioTracks[0]?.enabled === false;
        const newState = !isMuted;
        
        audioTracks.forEach(track => {
            track.enabled = newState;
        });
        
        return newState; // true = unmuted, false = muted
    }

    updateState(state) {
        this.callState = state;
        if (this.onCallStateChange) {
            this.onCallStateChange(state);
        }
    }

    startTimer() {
        this.callStartTime = Date.now();
        this.callTimer = setInterval(() => {
            // Timer running
        }, 1000);
    }

    cleanup() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        if (this.callTimer) {
            clearInterval(this.callTimer);
            this.callTimer = null;
        }
        
        this.currentCall = null;
        this.callState = 'idle';
        this.callStartTime = null;
        this.isCaller = false;
    }

    // Setters
    setOnCallStateChange(callback) { this.onCallStateChange = callback; }
    setOnRemoteStream(callback) { this.onRemoteStream = callback; }
    setOnCallEvent(callback) { this.onCallEvent = callback; }
}

// Export singleton
const callService = new CallService();
export default callService;