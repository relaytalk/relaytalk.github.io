// /app/utils/callService.js - ULTIMATE FIX
import { supabase } from './supabase.js';

class CallService {
    constructor() {
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.currentCall = null;
        this.userId = null;
        this.speakerMode = false;
        this.isInCall = false;
        this.callStartTime = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
    }

    async initialize(userId) {
        this.userId = userId;
        console.log("📞 CallService initialized for user:", userId);
        return true;
    }

    async initiateCall(friendId, type = 'voice') {
        try {
            console.log("🚀 INITIATING CALL to:", friendId);
            
            // Get microphone first
            console.log("🎤 Getting microphone access...");
            await this.getLocalMedia();
            console.log("✅ Microphone ready");
            
            // Create room ID
            const roomId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log("🏠 Room ID:", roomId);
            
            // Create call in database
            console.log("💾 Creating call record...");
            const callData = {
                room_id: roomId,
                caller_id: this.userId,
                receiver_id: friendId,
                call_type: type,
                status: 'ringing',
                audio_mode: 'mic',
                initiated_at: new Date().toISOString()
            };
            
            const { data: call, error } = await supabase
                .from('calls')
                .insert(callData)
                .select()
                .single();

            if (error) {
                console.error("❌ Database insert error:", error);
                throw error;
            }
            
            this.currentCall = call;
            console.log("✅ Call created:", call.id);
            
            // Setup WebRTC
            await this.setupWebRTC();
            
            // Create and save SDP offer
            console.log("📨 Creating SDP offer...");
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: type === 'video'
            });
            
            console.log("Saving local description...");
            await this.peerConnection.setLocalDescription(offer);
            
            // Save to database
            console.log("💾 Saving SDP offer to database...");
            const { error: updateError } = await supabase
                .from('calls')
                .update({ 
                    sdp_offer: JSON.stringify(offer),
                    updated_at: new Date().toISOString()
                })
                .eq('id', call.id);

            if (updateError) {
                console.error("❌ Failed to save SDP:", updateError);
            } else {
                console.log("✅ SDP offer saved");
            }
            
            // Setup listeners
            this.setupCallListeners();
            
            this.isInCall = true;
            this.updateState('ringing');
            
            console.log("🎉 Call initiation COMPLETE");
            return call;

        } catch (error) {
            console.error("💥 Initiate call FAILED:", error);
            this.cleanup();
            throw error;
        }
    }

    async answerCall(callId) {
        try {
            console.log("📞 ANSWERING call:", callId);
            
            // Get call from database
            console.log("📥 Fetching call data...");
            const { data: call, error } = await supabase
                .from('calls')
                .select('*')
                .eq('id', callId)
                .single();

            if (error) {
                console.error("❌ Call not found:", error);
                throw new Error("Call not found");
            }
            
            if (!call.sdp_offer || call.sdp_offer === 'null') {
                console.error("❌ No SDP offer in call");
                throw new Error("Call has no SDP offer");
            }
            
            this.currentCall = call;
            console.log("✅ Call loaded:", call.id, "Status:", call.status);
            
            // Get microphone
            console.log("🎤 Getting microphone...");
            await this.getLocalMedia();
            
            // Setup WebRTC
            await this.setupWebRTC();
            
            // Set remote description
            console.log("📥 Setting remote description...");
            const offer = JSON.parse(call.sdp_offer);
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            
            // Create and save answer
            console.log("📤 Creating SDP answer...");
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            
            // Save to database
            console.log("💾 Saving SDP answer...");
            const { error: updateError } = await supabase
                .from('calls')
                .update({ 
                    sdp_answer: JSON.stringify(answer),
                    status: 'active',
                    audio_mode: this.speakerMode ? 'speaker' : 'mic',
                    started_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', callId);

            if (updateError) {
                console.error("❌ Failed to save answer:", updateError);
            } else {
                console.log("✅ SDP answer saved");
            }
            
            // Setup listeners
            this.setupCallListeners();
            
            this.isInCall = true;
            this.callStartTime = Date.now();
            this.updateState('active');
            
            console.log("🎉 Call answered SUCCESSFULLY");
            return true;

        } catch (error) {
            console.error("💥 Answer call FAILED:", error);
            this.cleanup();
            throw error;
        }
    }

    async setupWebRTC() {
        console.log("🔗 Setting up WebRTC...");
        
        // Create peer connection
        this.peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        
        // Add local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
            console.log("✅ Added local tracks");
        }
        
        // Setup event handlers
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.currentCall) {
                this.sendIceCandidate(event.candidate);
            }
        };
        
        this.peerConnection.ontrack = (event) => {
            console.log("🔊 Received remote stream!");
            this.remoteStream = event.streams[0];
            
            if (this.onRemoteStream) {
                this.onRemoteStream(this.remoteStream);
            }
        };
        
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log("🔗 WebRTC state:", state);
            
            if (state === 'connected') {
                console.log("✅ WebRTC CONNECTED!");
                this.updateState('active');
                this.callStartTime = Date.now();
            } else if (state === 'failed' || state === 'disconnected') {
                console.warn("⚠️ WebRTC connection issue:", state);
                this.tryReconnect();
            }
        };
        
        console.log("✅ WebRTC setup complete");
    }

    async sendIceCandidate(candidate) {
        if (!this.currentCall) return;
        
        try {
            await supabase
                .channel(`call-${this.currentCall.room_id}`)
                .httpSend({
                    type: 'broadcast',
                    event: 'ice-candidate',
                    payload: {
                        candidate: candidate.toJSON(),
                        callId: this.currentCall.id
                    }
                });
        } catch (error) {
            console.log("⚠️ ICE candidate send failed:", error);
        }
    }

    async setupCallListeners() {
        if (!this.currentCall) return;
        
        try {
            const channel = supabase.channel(`call-${this.currentCall.room_id}`);
            
            // Listen for ICE candidates
            channel.on('broadcast', { event: 'ice-candidate' }, async (payload) => {
                try {
                    const { candidate } = payload.payload;
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (error) {
                    console.log("⚠️ ICE candidate add failed:", error);
                }
            });
            
            // Listen for call updates
            channel.on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'calls',
                filter: `id=eq.${this.currentCall.id}`
            }, async (payload) => {
                const call = payload.new;
                
                if (call.status === 'ended' || call.status === 'rejected') {
                    console.log("Call ended by other party");
                    this.endCall();
                }
            });
            
            channel.subscribe();
            console.log("👂 Listening for call updates");
            
        } catch (error) {
            console.error("❌ Listener setup failed:", error);
        }
    }

    async tryReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("❌ Max reconnection attempts reached");
            this.endCall();
            return;
        }
        
        this.reconnectAttempts++;
        console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        // Try to reconnect after delay
        setTimeout(() => {
            if (this.isInCall && this.peerConnection) {
                // Try to restart ICE
                this.peerConnection.restartIce();
            }
        }, 2000);
    }

    async getLocalMedia() {
        try {
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            console.log("🎤 Requesting microphone...");
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            
            console.log("✅ Microphone access granted");
            
        } catch (error) {
            console.error("❌ Microphone error:", error);
            throw error;
        }
    }

    async toggleSpeakerMode() {
        console.log("🔊 TOGGLE SPEAKER - Current:", this.speakerMode);
        
        this.speakerMode = !this.speakerMode;
        
        console.log("✅ New speaker mode:", this.speakerMode ? "SPEAKER" : "MICROPHONE");
        
        // Update database
        if (this.currentCall && this.isInCall) {
            try {
                const { error } = await supabase
                    .from('calls')
                    .update({
                        audio_mode: this.speakerMode ? 'speaker' : 'mic',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', this.currentCall.id);
                
                if (error) {
                    console.error("❌ DB update failed:", error);
                } else {
                    console.log("💾 Audio mode updated:", this.speakerMode ? 'speaker' : 'mic');
                }
            } catch (error) {
                console.error("❌ Update error:", error);
            }
        }
        
        // Notify UI
        if (this.onSpeakerModeChange) {
            this.onSpeakerModeChange(this.speakerMode);
        }
        
        return this.speakerMode;
    }

    async toggleMute() {
        if (!this.localStream) return false;
        
        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length === 0) return false;
        
        const isMuted = !audioTracks[0].enabled;
        const newState = !isMuted;
        
        console.log("🎤 Mute toggle:", newState ? "UNMUTED" : "MUTED");
        
        audioTracks.forEach(track => {
            track.enabled = newState;
        });
        
        return !newState;
    }

    async endCall() {
        console.log("📞 ENDING CALL");
        
        if (this.currentCall) {
            const duration = this.callStartTime ? 
                Math.floor((Date.now() - this.callStartTime) / 1000) : 0;
            
            console.log("⏱️ Call duration:", duration, "seconds");
            
            try {
                await supabase
                    .from('calls')
                    .update({
                        status: 'ended',
                        ended_at: new Date().toISOString(),
                        duration: duration,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', this.currentCall.id);
                
                console.log("💾 Call ended in DB");
            } catch (error) {
                console.error("❌ DB end error:", error);
            }
            
            if (this.onCallEvent) {
                this.onCallEvent('call_ended', { duration });
            }
        }
        
        this.cleanup();
    }

    updateState(state) {
        console.log("📊 State change:", state);
        if (this.onCallStateChange) {
            this.onCallStateChange(state);
        }
    }

    cleanup() {
        console.log("🧹 CLEANING UP");
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }
        
        this.currentCall = null;
        this.isInCall = false;
        this.speakerMode = false;
        this.callStartTime = null;
        this.reconnectAttempts = 0;
        
        console.log("✅ Cleanup complete");
    }

    // Getters
    getSpeakerMode() {
        return this.speakerMode;
    }

    getMuteState() {
        if (!this.localStream) return false;
        const audioTracks = this.localStream.getAudioTracks();
        return audioTracks.length > 0 ? !audioTracks[0].enabled : false;
    }

    // Setters
    setOnCallStateChange(callback) { this.onCallStateChange = callback; }
    setOnRemoteStream(callback) { this.onRemoteStream = callback; }
    setOnCallEvent(callback) { this.onCallEvent = callback; }
    setOnSpeakerModeChange(callback) { this.onSpeakerModeChange = callback; }
}

const callService = new CallService();
export default callService;