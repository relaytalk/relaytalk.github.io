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
        this.iceCandidates = [];
    }

    async initialize(userId) {
        this.userId = userId;
        console.log("📞 CallService initialized for:", userId);
        return true;
    }

    async initiateCall(friendId, type = 'voice') {
        console.log("🎯 INITIATE CALL to:", friendId);
        
        try {
            // 1. Get microphone stream
            await this.getLocalMedia();
            console.log("✅ Microphone access granted");

            // 2. Create unique call ID
            const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log("📱 Generated call ID:", callId);

            // 3. Create call record
            const callData = {
                room_id: callId,
                caller_id: this.userId,
                receiver_id: friendId,
                call_type: type,
                status: 'ringing',
                audio_mode: 'mic',  // Default to microphone mode
                initiated_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            console.log("💾 Inserting call to database:", callData);

            const { data: call, error } = await supabase
                .from('calls')
                .insert([callData])
                .select()
                .single();

            if (error) {
                console.error("❌ Database insert error:", error);
                throw new Error(`Database error: ${error.message}`);
            }

            this.currentCall = call;
            console.log("✅ Call created in database. ID:", call.id);

            // 4. Create WebRTC connection
            this.createPeerConnection();

            // 5. Add local tracks
            this.addLocalTracks();

            // 6. Create and send offer
            await this.createAndSendOffer();

            this.isInCall = true;
            console.log("🚀 Call initiated successfully");

            return {
                id: call.id,
                room_id: call.room_id,
                audio_mode: call.audio_mode,
                status: call.status
            };

        } catch (error) {
            console.error("❌ Initiate call FAILED:", error);
            this.cleanup();
            throw error;
        }
    }

    createPeerConnection() {
        console.log("🔗 Creating peer connection...");
        
        const config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        this.peerConnection = new RTCPeerConnection(config);
        console.log("✅ Peer connection created");

        // Handle incoming tracks
        this.peerConnection.ontrack = (event) => {
            console.log("🎧 Received remote stream");
            this.remoteStream = event.streams[0];
            
            if (this.onRemoteStream) {
                this.onRemoteStream(this.remoteStream);
            }
            
            // Apply current speaker mode
            setTimeout(() => this.applyAudioRouting(), 100);
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("🧊 Generated ICE candidate");
                this.iceCandidates.push(event.candidate);
                
                if (this.onIceCandidate) {
                    this.onIceCandidate(event.candidate);
                }
            }
        };

        // Handle connection state
        this.peerConnection.onconnectionstatechange = () => {
            console.log("🔌 Connection state:", this.peerConnection.connectionState);
            
            if (this.peerConnection.connectionState === 'connected') {
                console.log("✅ WebRTC connection established!");
                if (this.onCallStateChange) {
                    this.onCallStateChange('active');
                }
            } else if (this.peerConnection.connectionState === 'disconnected' || 
                      this.peerConnection.connectionState === 'failed') {
                console.error("❌ WebRTC connection failed");
                if (this.onCallStateChange) {
                    this.onCallStateChange('disconnected');
                }
            }
        };
    }

    addLocalTracks() {
        if (!this.localStream || !this.peerConnection) return;

        console.log("🎤 Adding local audio tracks...");
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });
        console.log("✅ Local tracks added");
    }

    async createAndSendOffer() {
        try {
            console.log("📤 Creating offer...");
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
            });
            
            await this.peerConnection.setLocalDescription(offer);
            console.log("✅ Local description set");

            // Save offer to database
            await this.updateCallInDatabase({
                sdp_offer: JSON.stringify(offer),
                updated_at: new Date().toISOString()
            });

            console.log("📨 Offer sent to database");

        } catch (error) {
            console.error("❌ Failed to create/send offer:", error);
            throw error;
        }
    }

    async answerCall(callId) {
        console.log("📲 ANSWERING CALL:", callId);
        
        try {
            // 1. Get call from database
            const { data: call, error } = await supabase
                .from('calls')
                .select('*')
                .eq('id', callId)
                .single();

            if (error) {
                console.error("❌ Database fetch error:", error);
                throw new Error(`Call not found: ${error.message}`);
            }

            this.currentCall = call;
            console.log("✅ Call found:", call.id, "Status:", call.status);

            // 2. Get microphone
            await this.getLocalMedia();

            // 3. Create peer connection
            this.createPeerConnection();

            // 4. Add local tracks
            this.addLocalTracks();

            // 5. Set remote description from offer
            if (call.sdp_offer) {
                const offer = JSON.parse(call.sdp_offer);
                console.log("📥 Setting remote description from offer");
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            }

            // 6. Create and send answer
            console.log("📤 Creating answer...");
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // 7. Update database
            await this.updateCallInDatabase({
                sdp_answer: JSON.stringify(answer),
                status: 'active',
                started_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            this.isInCall = true;
            this.callStartTime = Date.now();
            console.log("✅ Call answered successfully");

            return true;

        } catch (error) {
            console.error("❌ Answer call FAILED:", error);
            this.cleanup();
            throw error;
        }
    }

    async getLocalMedia() {
        console.log("🎤 Requesting microphone...");
        
        try {
            // Stop existing stream
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }

            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1
                },
                video: false
            });

            console.log("✅ Microphone stream obtained");
            return this.localStream;

        } catch (error) {
            console.error("❌ Microphone access denied:", error);
            throw new Error(`Microphone permission required: ${error.message}`);
        }
    }

    // ==================== SPEAKER TOGGLE - FIXED ====================
    async toggleSpeakerMode() {
        console.log("🔊 TOGGLE SPEAKER MODE called");
        
        if (!this.currentCall) {
            console.error("❌ CANNOT TOGGLE: No current call");
            return this.speakerMode;
        }

        console.log("📊 Before toggle:", {
            speakerMode: this.speakerMode,
            callId: this.currentCall.id,
            currentAudioMode: this.currentCall.audio_mode
        });

        // Toggle the mode
        this.speakerMode = !this.speakerMode;
        const newAudioMode = this.speakerMode ? 'speaker' : 'mic';
        
        console.log("🔄 Changing to:", newAudioMode);

        try {
            // 1. Update database FIRST
            console.log("💾 Updating database...");
            await this.updateCallInDatabase({
                audio_mode: newAudioMode,
                updated_at: new Date().toISOString()
            });

            // 2. Update local object
            if (this.currentCall) {
                this.currentCall.audio_mode = newAudioMode;
            }

            console.log("✅ Database updated successfully");

            // 3. Notify UI
            if (this.onSpeakerModeChange) {
                console.log("📢 Notifying UI of speaker change");
                this.onSpeakerModeChange(this.speakerMode);
            }

            // 4. Apply audio routing
            setTimeout(() => this.applyAudioRouting(), 100);

            return this.speakerMode;

        } catch (error) {
            console.error("❌ Speaker toggle failed:", error);
            // Revert on error
            this.speakerMode = !this.speakerMode;
            return this.speakerMode;
        }
    }

    applyAudioRouting() {
        console.log("🎧 Applying audio routing. Speaker mode:", this.speakerMode);
        
        // Find all audio elements with our streams
        const audioElements = document.querySelectorAll('audio');
        
        audioElements.forEach((audio, index) => {
            if (audio.srcObject === this.remoteStream || audio.srcObject === this.localStream) {
                console.log(`🔊 Audio element ${index + 1}:`, {
                    hasStream: !!audio.srcObject,
                    paused: audio.paused,
                    volume: audio.volume
                });

                if (this.speakerMode) {
                    // SPEAKER MODE - loudspeaker
                    audio.setAttribute('playsinline', 'false');
                    audio.removeAttribute('playsinline');
                    console.log("🔈 Set to LOUDSPEAKER mode");
                } else {
                    // MIC MODE - earpiece
                    audio.setAttribute('playsinline', 'true');
                    console.log("🎧 Set to EARPIECE mode");
                }

                // Force audio context resume
                if (audio.paused) {
                    audio.play().catch(e => {
                        console.log("⚠️ Audio play error (normal on mobile):", e.name);
                    });
                }
            }
        });
    }

    async updateCallInDatabase(updates) {
        if (!this.currentCall || !this.currentCall.id) {
            console.error("❌ Cannot update: No call ID");
            return false;
        }

        console.log("💾 Updating call in database:", {
            callId: this.currentCall.id,
            updates: updates
        });

        try {
            const { data, error } = await supabase
                .from('calls')
                .update(updates)
                .eq('id', this.currentCall.id)
                .select()
                .single();

            if (error) {
                console.error("❌ Database update error:", error);
                throw error;
            }

            console.log("✅ Database update successful:", data);
            return true;

        } catch (error) {
            console.error("❌ Update call failed:", error);
            return false;
        }
    }

    async toggleMute() {
        if (!this.localStream) {
            console.error("❌ No local stream to mute");
            return false;
        }

        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length === 0) {
            console.error("❌ No audio tracks found");
            return false;
        }

        const currentTrack = audioTracks[0];
        const newState = !currentTrack.enabled;
        
        console.log("🎤 Mute toggle:", {
            currentlyEnabled: currentTrack.enabled,
            newState: newState,
            isMuted: !newState
        });

        audioTracks.forEach(track => {
            track.enabled = newState;
        });

        return !newState; // Return true if now muted
    }

    async endCall() {
        console.log("📞 ENDING CALL");
        
        if (this.currentCall) {
            // Calculate duration
            const duration = this.callStartTime ? 
                Math.floor((Date.now() - this.callStartTime) / 1000) : 0;
            
            console.log("⏱️ Call duration:", duration, "seconds");

            // Update database
            await this.updateCallInDatabase({
                status: 'ended',
                ended_at: new Date().toISOString(),
                duration: duration,
                updated_at: new Date().toISOString()
            });

            // Notify listeners
            if (this.onCallEvent) {
                this.onCallEvent('call_ended', { duration });
            }
        }

        this.cleanup();
        console.log("✅ Call ended cleanly");
    }

    cleanup() {
        console.log("🧹 Cleaning up call service...");

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
            console.log("🔌 Peer connection closed");
        }

        // Stop media streams
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
            console.log("🎤 Local stream stopped");
        }

        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
            console.log("🔊 Remote stream stopped");
        }

        // Reset state
        this.currentCall = null;
        this.isInCall = false;
        this.speakerMode = false;
        this.callStartTime = null;
        this.iceCandidates = [];

        console.log("✅ Cleanup complete");
    }

    // ==================== GETTERS ====================
    getSpeakerMode() {
        return this.speakerMode;
    }

    getMuteState() {
        if (!this.localStream) return false;
        const audioTracks = this.localStream.getAudioTracks();
        return audioTracks.length > 0 ? !audioTracks[0].enabled : false;
    }

    getCurrentCall() {
        return this.currentCall;
    }

    // ==================== SETTERS ====================
    setOnCallStateChange(callback) { 
        this.onCallStateChange = callback; 
        console.log("✅ Set onCallStateChange callback");
    }
    
    setOnRemoteStream(callback) { 
        this.onRemoteStream = callback; 
        console.log("✅ Set onRemoteStream callback");
    }
    
    setOnCallEvent(callback) { 
        this.onCallEvent = callback; 
        console.log("✅ Set onCallEvent callback");
    }
    
    setOnSpeakerModeChange(callback) { 
        this.onSpeakerModeChange = callback; 
        console.log("✅ Set onSpeakerModeChange callback");
    }
    
    setOnIceCandidate(callback) { 
        this.onIceCandidate = callback; 
        console.log("✅ Set onIceCandidate callback");
    }
}

const callService = new CallService();
export default callService;