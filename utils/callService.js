// /app/utils/callService.js - WITH SDP FIX
import { supabase } from './supabase.js';

class CallService {
    constructor() {
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.currentCall = null;
        this.isCaller = false;
        this.userId = null;
        this.currentRoomId = null;
        this.speakerMode = false;
        this.isInCall = false;
        
        this.callState = 'idle';
        this.callStartTime = null;
        
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' }
        ];
        
        this.onCallStateChange = null;
        this.onRemoteStream = null;
        this.onCallEvent = null;
        this.onSpeakerModeChange = null;
    }

    async initialize(userId) {
        this.userId = userId;
        console.log("📞 CallService initialized for user:", userId);
        return true;
    }

    async initiateCall(friendId, type = 'voice') {
        try {
            console.log("🚀 Starting call to:", friendId);
            
            this.isCaller = true;
            const roomId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.currentRoomId = roomId;
            
            console.log("📝 Creating call in database...");
            
            // Create call record FIRST
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
                console.error("❌ Database error:", error);
                throw error;
            }
            
            this.currentCall = call;
            console.log("✅ Call created with ID:", call.id);

            // Get microphone stream
            await this.getLocalMedia();

            // Create peer connection
            this.peerConnection = new RTCPeerConnection({ 
                iceServers: this.iceServers 
            });

            // Add microphone track
            if (this.localStream && this.localStream.getAudioTracks().length > 0) {
                this.localStream.getAudioTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });
                console.log("🎤 Added microphone track");
            }

            // Setup event handlers
            this.setupPeerConnection();

            // Create and save offer
            console.log("📨 Creating SDP offer...");
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: type === 'video'
            });
            
            console.log("SDP offer created:", offer.type);
            await this.peerConnection.setLocalDescription(offer);

            // Save SDP offer to database - WAIT for it to complete
            console.log("💾 Saving SDP offer to database...");
            const { error: updateError } = await supabase
                .from('calls')
                .update({ 
                    sdp_offer: JSON.stringify(offer),
                    updated_at: new Date().toISOString()
                })
                .eq('id', call.id);

            if (updateError) {
                console.error("❌ Failed to save SDP offer:", updateError);
                throw updateError;
            }
            
            console.log("✅ SDP offer saved to database");

            // Listen for answer
            this.listenForAnswer();
            
            this.isInCall = true;
            this.updateState('ringing');
            
            console.log("✅ Call initiated successfully");
            return call;

        } catch (error) {
            console.error("❌ Initiate call failed:", error);
            this.cleanup();
            throw error;
        }
    }

    async answerCall(callId) {
        try {
            console.log("📞 Answering call:", callId);
            
            this.isCaller = false;

            // Fetch call from database - WITH RETRY
            let call;
            let retries = 3;
            
            while (retries > 0) {
                const { data, error } = await supabase
                    .from('calls')
                    .select('*')
                    .eq('id', callId)
                    .single();

                if (error) {
                    console.error("❌ Fetch call error:", error);
                    throw error;
                }
                
                call = data;
                
                // Check if SDP offer exists
                if (call.sdp_offer && call.sdp_offer !== 'null') {
                    console.log("✅ SDP offer found");
                    break;
                }
                
                console.log("⏳ Waiting for SDP offer... attempt", 4 - retries);
                retries--;
                
                if (retries > 0) {
                    // Wait 1 second before retrying
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            if (!call.sdp_offer || call.sdp_offer === 'null') {
                throw new Error("No SDP offer found in call after waiting");
            }
            
            this.currentCall = call;
            this.currentRoomId = call.room_id;
            console.log("✅ Call found:", call.id, "SDP present:", !!call.sdp_offer);

            // Get microphone stream
            await this.getLocalMedia();

            // Create peer connection
            this.peerConnection = new RTCPeerConnection({ 
                iceServers: this.iceServers 
            });

            // Add microphone track
            if (this.localStream && this.localStream.getAudioTracks().length > 0) {
                this.localStream.getAudioTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });
                console.log("🎤 Added microphone track");
            }

            // Setup event handlers
            this.setupPeerConnection();

            // Set remote offer
            console.log("📥 Setting remote description...");
            const offer = JSON.parse(call.sdp_offer);
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

            // Create and save answer
            console.log("📤 Creating SDP answer...");
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            console.log("💾 Saving SDP answer to database...");
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
                throw updateError;
            }

            console.log("✅ SDP answer saved");

            // Listen for connection updates
            this.listenForAnswer();
            
            this.isInCall = true;
            this.updateState('active');
            this.callStartTime = Date.now();
            
            console.log("✅ Call answered successfully");
            return true;

        } catch (error) {
            console.error("❌ Answer call failed:", error);
            this.cleanup();
            throw error;
        }
    }

    async getLocalMedia() {
        try {
            // Clean up existing stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }

            console.log("🎤 Requesting microphone access...");
            
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
            console.error("❌ Error getting microphone:", error.name, error.message);
            
            if (error.name === 'NotAllowedError') {
                throw new Error("Microphone access denied. Please allow microphone permissions.");
            } else {
                throw error;
            }
        }
    }

    setupPeerConnection() {
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.currentCall) {
                this.sendIceCandidate(event.candidate);
            }
        };

        this.peerConnection.ontrack = (event) => {
            console.log("🔊 Received remote audio stream");
            this.remoteStream = event.streams[0];

            if (this.onRemoteStream) {
                this.onRemoteStream(this.remoteStream);
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log("🔗 Connection state:", state);

            if (state === 'connected') {
                this.updateState('active');
                this.callStartTime = Date.now();
            } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                console.log("🔌 Connection lost");
                this.endCall();
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            console.log("🧊 ICE state:", this.peerConnection.iceConnectionState);
        };
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
                        callId: this.currentCall.id,
                        candidate: candidate.toJSON(),
                        senderId: this.userId
                    }
                });
        } catch (error) {
            console.log("⚠️ Failed to send ICE candidate:", error);
        }
    }

    listenForAnswer() {
        if (!this.currentCall) return;

        try {
            const channel = supabase.channel(`call-${this.currentCall.room_id}`);

            // Listen for ICE candidates
            channel.on('broadcast', { event: 'ice-candidate' }, async (payload) => {
                const { candidate } = payload.payload;
                if (this.peerConnection) {
                    try {
                        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (error) {
                        console.log("⚠️ Failed to add ICE candidate:", error);
                    }
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
                
                // If we're the caller and an answer was received
                if (this.isCaller && call.sdp_answer && call.sdp_answer !== 'null') {
                    try {
                        const answer = JSON.parse(call.sdp_answer);
                        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                        this.updateState('active');
                    } catch (error) {
                        console.log("⚠️ Failed to set answer:", error);
                    }
                }

                // If call was ended or rejected
                if (call.status === 'ended' || call.status === 'rejected') {
                    this.endCall();
                }
            });

            channel.subscribe();
            console.log("👂 Subscribed to call channel");
            
        } catch (error) {
            console.error("❌ Failed to set up channel listener:", error);
        }
    }

    async toggleSpeakerMode() {
        console.log("🔊 Toggling speaker mode. Current:", this.speakerMode);
        
        this.speakerMode = !this.speakerMode;
        
        console.log("✅ New speaker mode:", this.speakerMode ? "SPEAKER" : "MICROPHONE");
        
        // Update database
        if (this.currentCall) {
            try {
                const { error } = await supabase
                    .from('calls')
                    .update({
                        audio_mode: this.speakerMode ? 'speaker' : 'mic',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', this.currentCall.id);

                if (error) {
                    console.warn("⚠️ Failed to update audio mode:", error);
                } else {
                    console.log("💾 Audio mode updated:", this.speakerMode ? 'speaker' : 'mic');
                }
            } catch (error) {
                console.error("❌ Error updating audio mode:", error);
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
        
        console.log("🎤 Microphone", newState ? "unmuted" : "muted");
        
        audioTracks.forEach(track => {
            track.enabled = newState;
        });
        
        return !newState;
    }

    async endCall() {
        console.log("📞 Ending call");
        
        if (this.currentCall) {
            const duration = this.callStartTime ? 
                Math.floor((Date.now() - this.callStartTime) / 1000) : 0;
            
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
                
                console.log("💾 Call ended in database");
            } catch (error) {
                console.error("❌ Error ending call:", error);
            }

            if (this.onCallEvent) {
                this.onCallEvent('call_ended', { duration });
            }
        }
        
        this.cleanup();
    }

    updateState(state) {
        console.log("📊 Call state:", state);
        this.callState = state;
        if (this.onCallStateChange) {
            this.onCallStateChange(state);
        }
    }

    cleanup() {
        console.log("🧹 Cleaning up");
        
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
        this.currentRoomId = null;
        this.isInCall = false;
        this.callState = 'idle';
        this.callStartTime = null;
        this.isCaller = false;
        this.speakerMode = false;
        
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