// /app/utils/callService.js - WITH SPEAKER MODE
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
        this.speakerMode = false; // false = microphone, true = system audio
        
        this.callState = 'idle';
        this.callStartTime = null;

        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ];

        this.onCallStateChange = null;
        this.onRemoteStream = null;
        this.onCallEvent = null;
        this.onSpeakerModeChange = null;
    }

    async initialize(userId) {
        this.userId = userId;
        return true;
    }

    async initiateCall(friendId, type = 'voice') {
        try {
            this.isCaller = true;
            const roomId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.currentRoomId = roomId;

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

            // Get microphone stream (default)
            await this.getLocalMedia();

            // Create peer connection
            this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });

            // Add local tracks based on speaker mode
            this.addLocalTracksToConnection();

            // Setup event handlers
            this.setupPeerConnection();

            // Create and save offer
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: type === 'video'
            });
            await this.peerConnection.setLocalDescription(offer);

            await supabase
                .from('calls')
                .update({ 
                    sdp_offer: JSON.stringify(offer),
                    updated_at: new Date().toISOString()
                })
                .eq('id', call.id);

            this.listenForAnswer();
            this.updateState('ringing');

            return call;

        } catch (error) {
            console.error("Initiate call failed:", error);
            this.cleanup();
            throw error;
        }
    }

    async answerCall(callId) {
        try {
            this.isCaller = false;

            const { data: call, error } = await supabase
                .from('calls')
                .select('*')
                .eq('id', callId)
                .single();

            if (error) throw error;
            this.currentCall = call;
            this.currentRoomId = call.room_id;

            // Get microphone stream (default)
            await this.getLocalMedia();

            // Create peer connection
            this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });

            // Add local tracks based on speaker mode
            this.addLocalTracksToConnection();

            // Setup event handlers
            this.setupPeerConnection();

            // Set remote offer
            const offer = JSON.parse(call.sdp_offer);
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

            // Create and save answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            await supabase
                .from('calls')
                .update({ 
                    sdp_answer: JSON.stringify(answer),
                    status: 'active',
                    started_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', callId);

            this.listenForAnswer();
            this.updateState('active');

            return true;

        } catch (error) {
            console.error("Answer call failed:", error);
            this.cleanup();
            throw error;
        }
    }

    async getLocalMedia() {
        try {
            // If speaker mode is OFF (default), get microphone
            if (!this.speakerMode) {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
            } else {
                // In speaker mode, we don't need microphone
                // Create a silent audio stream instead
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                gainNode.gain.value = 0; // Silent
                
                oscillator.connect(gainNode);
                oscillator.start();
                
                // Convert to media stream
                const destination = audioContext.createMediaStreamDestination();
                gainNode.connect(destination);
                
                this.localStream = destination.stream;
            }
        } catch (error) {
            console.error("Error getting local media:", error);
            throw error;
        }
    }

    addLocalTracksToConnection() {
        if (!this.peerConnection || !this.localStream) return;
        
        // Remove any existing tracks
        const senders = this.peerConnection.getSenders();
        senders.forEach(sender => {
            if (sender.track && sender.track.kind === 'audio') {
                this.peerConnection.removeTrack(sender);
            }
        });
        
        // Add new tracks based on current mode
        if (!this.speakerMode && this.localStream) {
            // Add microphone tracks
            this.localStream.getAudioTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }
        // If speaker mode is ON, we don't send any audio tracks
    }

    async toggleSpeakerMode() {
        this.speakerMode = !this.speakerMode;
        
        console.log("Speaker mode:", this.speakerMode ? "ON (System Audio)" : "OFF (Microphone)");
        
        // If we have an active call, update the connection
        if (this.peerConnection && this.peerConnection.connectionState === 'connected') {
            try {
                // Re-get local media with new mode
                await this.getLocalMedia();
                
                // Update peer connection tracks
                this.addLocalTracksToConnection();
                
                // Re-negotiate if needed
                if (this.isCaller) {
                    const offer = await this.peerConnection.createOffer();
                    await this.peerConnection.setLocalDescription(offer);
                    
                    await supabase
                        .from('calls')
                        .update({ 
                            sdp_offer: JSON.stringify(offer),
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', this.currentCall.id);
                }
                
            } catch (error) {
                console.error("Error updating speaker mode:", error);
            }
        }
        
        // Notify UI
        if (this.onSpeakerModeChange) {
            this.onSpeakerModeChange(this.speakerMode);
        }
        
        return this.speakerMode;
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
                this.callStartTime = Date.now();
            } else if (state === 'disconnected' || state === 'failed') {
                this.endCall();
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            const state = this.peerConnection.iceConnectionState;
            if (state === 'failed') {
                this.endCall();
            }
        };
    }

    async sendIceCandidate(candidate) {
        if (!this.currentCall) return;

        const receiverId = this.isCaller ? 
            this.currentCall.receiver_id : 
            this.currentCall.caller_id;

        try {
            await supabase
                .channel(`call-${this.currentCall.room_id}`)
                .httpSend({
                    type: 'broadcast',
                    event: 'ice-candidate',
                    payload: {
                        callId: this.currentCall.id,
                        candidate: candidate.toJSON(),
                        senderId: this.userId,
                        receiverId: receiverId
                    }
                });
        } catch (error) {
            console.log("Failed to send ICE candidate:", error);
        }
    }

    listenForAnswer() {
        if (!this.currentCall) return;

        const channel = supabase.channel(`call-${this.currentCall.room_id}`);

        channel.on('broadcast', { event: 'ice-candidate' }, async (payload) => {
            const { candidate, senderId } = payload.payload;
            if (senderId !== this.userId && this.peerConnection) {
                try {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (error) {
                    console.log("Failed to add ICE candidate:", error);
                }
            }
        });

        channel.on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'calls',
            filter: `id=eq.${this.currentCall.id}`
        }, async (payload) => {
            const call = payload.new;

            if (this.isCaller && call.sdp_answer) {
                try {
                    const answer = JSON.parse(call.sdp_answer);
                    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                    this.updateState('active');
                } catch (error) {
                    console.log("Failed to set answer:", error);
                }
            }

            if (call.status === 'ended' || call.status === 'rejected') {
                this.endCall();
            }
        });

        channel.subscribe();
    }

    async endCall() {
        if (this.currentCall) {
            try {
                const duration = this.callStartTime ? 
                    Math.floor((Date.now() - this.callStartTime) / 1000) : 0;

                await supabase
                    .from('calls')
                    .update({
                        status: 'ended',
                        ended_at: new Date().toISOString(),
                        duration: duration,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', this.currentCall.id);

                if (this.onCallEvent) {
                    this.onCallEvent('call_ended', { duration });
                }

            } catch (error) {
                console.error("Error ending call:", error);
            }
        }

        this.cleanup();
    }

    async toggleMute() {
        if (!this.localStream || this.speakerMode) return false;

        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length === 0) return false;
        
        const isMuted = audioTracks[0]?.enabled === false;
        const newState = !isMuted;

        audioTracks.forEach(track => {
            track.enabled = newState;
        });

        return newState;
    }

    updateState(state) {
        this.callState = state;
        if (this.onCallStateChange) {
            this.onCallStateChange(state);
        }
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

        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }

        this.currentCall = null;
        this.currentRoomId = null;
        this.callState = 'idle';
        this.callStartTime = null;
        this.isCaller = false;
        this.speakerMode = false;
    }

    setOnCallStateChange(callback) { this.onCallStateChange = callback; }
    setOnRemoteStream(callback) { this.onRemoteStream = callback; }
    setOnCallEvent(callback) { this.onCallEvent = callback; }
    setOnSpeakerModeChange(callback) { this.onSpeakerModeChange = callback; }
}

const callService = new CallService();
export default callService;