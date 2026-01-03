// /app/utils/callService.js

import webRTCManager from './webrtc.js';
import signalingManager from './signaling.js';
import { supabase } from './supabase.js';

class CallService {
    constructor() {
        this.currentCall = null;
        this.isCaller = false;
        this.callType = 'voice'; // 'voice' or 'video'
        this.userId = null;
        
        // Call state
        this.callState = 'idle'; // 'idle', 'ringing', 'connecting', 'active', 'ending'
        this.callStartTime = null;
        this.callTimer = null;
        
        // UI callbacks
        this.onCallStateChange = null;
        this.onRemoteStream = null;
        this.onCallQualityUpdate = null;
        this.onCallEvent = null;
        
        console.log("✅ Call Service initialized");
    }
    
    // ==================== INITIALIZATION ====================
    
    async initialize(userId) {
        this.userId = userId;
        
        // Initialize signaling
        await signalingManager.initialize(userId);
        
        // Initialize WebRTC with callbacks
        await webRTCManager.initialize({
            onRemoteStream: (stream) => this.handleRemoteStream(stream),
            onConnectionStateChange: (state) => this.handleConnectionStateChange(state),
            onIceConnectionStateChange: (state) => this.handleIceConnectionStateChange(state),
            onDataChannelMessage: (message) => this.handleDataChannelMessage(message),
            onDataChannelOpen: (channel) => this.handleDataChannelOpen(channel)
        });
        
        // Set ICE candidate callback
        webRTCManager.setOnIceCandidate((candidate) => 
            this.handleLocalIceCandidate(candidate)
        );
        
        console.log("✅ Call Service ready for user:", userId);
        return true;
    }
    
    // ==================== CALL INITIATION ====================
    
    async initiateCall(friendId, callType = 'voice') {
        console.log("📞 Initiating", callType, "call to:", friendId);
        
        this.callType = callType;
        this.isCaller = true;
        
        try {
            // 1. Create call record
            this.currentCall = await this.createCallRecord(friendId, callType);
            if (!this.currentCall) throw new Error("Failed to create call record");
            
            // 2. Get local media stream
            const constraints = {
                audio: true,
                video: callType === 'video'
            };
            
            await webRTCManager.getLocalStream(constraints);
            await webRTCManager.addLocalStreamToConnection();
            
            // 3. Create data channel
            await webRTCManager.createDataChannel('relaytalk-call');
            
            // 4. Create and send offer
            const offer = await webRTCManager.createOffer({ video: callType === 'video' });
            
            // 5. Send offer via signaling
            await signalingManager.sendOffer(
                this.currentCall.id,
                offer,
                friendId
            );
            
            // 6. Subscribe to call channel
            await this.subscribeToCall(this.currentCall.id, friendId);
            
            // 7. Update UI
            this.updateCallState('ringing');
            
            console.log("✅ Call initiated successfully");
            return this.currentCall;
            
        } catch (error) {
            console.error("❌ Failed to initiate call:", error);
            this.cleanupFailedCall();
            throw error;
        }
    }
    
    async answerCall(callId) {
        console.log("📞 Answering call:", callId);
        
        this.isCaller = false;
        
        try {
            // 1. Get call data
            this.currentCall = await signalingManager.getCallData(callId);
            if (!this.currentCall) throw new Error("Call not found");
            
            this.callType = this.currentCall.call_type || 'voice';
            
            // 2. Get local media stream
            const constraints = {
                audio: true,
                video: this.callType === 'video'
            };
            
            await webRTCManager.getLocalStream(constraints);
            await webRTCManager.addLocalStreamToConnection();
            
            // 3. Set remote description (offer)
            const offer = JSON.parse(this.currentCall.sdp_offer);
            await webRTCManager.setRemoteDescription(offer);
            
            // 4. Create and send answer
            const answer = await webRTCManager.createAnswer();
            
            // 5. Send answer via signaling
            await signalingManager.sendAnswer(
                callId,
                answer,
                this.currentCall.caller_id
            );
            
            // 6. Subscribe to call channel
            await this.subscribeToCall(callId, this.currentCall.caller_id);
            
            // 7. Update call status to active
            await signalingManager.updateCallStatus(callId, 'active');
            
            // 8. Update UI
            this.updateCallState('connecting');
            
            console.log("✅ Call answered successfully");
            return this.currentCall;
            
        } catch (error) {
            console.error("❌ Failed to answer call:", error);
            this.cleanupFailedCall();
            throw error;
        }
    }
    
    async rejectCall(callId) {
        console.log("❌ Rejecting call:", callId);
        
        try {
            await signalingManager.updateCallStatus(callId, 'rejected');
            await signalingManager.sendCallEvent(
                callId,
                'call_rejected',
                { userId: this.userId },
                this.currentCall?.caller_id
            );
            
            this.cleanup();
            
        } catch (error) {
            console.error("❌ Failed to reject call:", error);
        }
    }
    
    // ==================== CALL MANAGEMENT ====================
    
    async endCall() {
        if (!this.currentCall) return;
        
        console.log("📞 Ending call:", this.currentCall.id);
        
        // Update call state
        this.updateCallState('ending');
        
        try {
            // Send call ended event
            await signalingManager.sendCallEvent(
                this.currentCall.id,
                'call_ended',
                { userId: this.userId },
                this.isCaller ? this.currentCall.receiver_id : this.currentCall.caller_id
            );
            
            // Update call status
            await signalingManager.updateCallStatus(this.currentCall.id, 'ended');
            
            // Stop call timer
            this.stopCallTimer();
            
            // Cleanup
            this.cleanup();
            
            console.log("✅ Call ended successfully");
            
        } catch (error) {
            console.error("❌ Error ending call:", error);
        } finally {
            this.updateCallState('idle');
        }
    }
    
    async toggleMute() {
        if (!webRTCManager.getLocalStream()) return;
        
        const audioTracks = webRTCManager.getLocalStream().getAudioTracks();
        const currentlyMuted = audioTracks[0]?.enabled === false;
        
        const newState = !currentlyMuted;
        await webRTCManager.toggleAudio(newState);
        
        // Send mute event
        if (this.currentCall) {
            await signalingManager.sendCallEvent(
                this.currentCall.id,
                'mute_toggled',
                { muted: newState },
                this.isCaller ? this.currentCall.receiver_id : this.currentCall.caller_id
            );
        }
        
        return newState;
    }
    
    async toggleVideo() {
        if (!webRTCManager.getLocalStream() || this.callType !== 'video') return;
        
        const videoTracks = webRTCManager.getLocalStream().getVideoTracks();
        const currentlyDisabled = videoTracks[0]?.enabled === false;
        
        const newState = !currentlyDisabled;
        await webRTCManager.toggleVideo(newState);
        
        // Send video toggle event
        if (this.currentCall) {
            await signalingManager.sendCallEvent(
                this.currentCall.id,
                'video_toggled',
                { videoEnabled: newState },
                this.isCaller ? this.currentCall.receiver_id : this.currentCall.caller_id
            );
        }
        
        return newState;
    }
    
    async switchCamera() {
        if (this.callType !== 'video') return;
        
        try {
            await webRTCManager.switchCamera();
            return true;
        } catch (error) {
            console.error("❌ Failed to switch camera:", error);
            return false;
        }
    }
    
    // ==================== SIGNALING SUBSCRIPTION ====================
    
    async subscribeToCall(callId, otherUserId) {
        console.log("🔔 Subscribing to call signals:", callId);
        
        await signalingManager.subscribeToCall(callId, {
            onOffer: (offer, senderId) => this.handleRemoteOffer(offer, senderId),
            onAnswer: (answer, senderId) => this.handleRemoteAnswer(answer, senderId),
            onIceCandidate: (candidate, senderId) => this.handleRemoteIceCandidate(candidate, senderId),
            onCallEvent: (event, data, senderId) => this.handleRemoteCallEvent(event, data, senderId)
        });
    }
    
    // ==================== SIGNAL HANDLERS ====================
    
    async handleRemoteOffer(offer, senderId) {
        console.log("📨 Received remote offer from:", senderId);
        
        if (this.isCaller) return; // Caller shouldn't receive offers
        
        try {
            // Set remote description
            await webRTCManager.setRemoteDescription(offer);
            
            // Get local media stream
            const constraints = {
                audio: true,
                video: this.callType === 'video'
            };
            
            await webRTCManager.getLocalStream(constraints);
            await webRTCManager.addLocalStreamToConnection();
            
            // Create and send answer
            const answer = await webRTCManager.createAnswer();
            await signalingManager.sendAnswer(
                this.currentCall.id,
                answer,
                senderId
            );
            
            // Update call state
            this.updateCallState('connecting');
            
        } catch (error) {
            console.error("❌ Failed to handle remote offer:", error);
        }
    }
    
    async handleRemoteAnswer(answer, senderId) {
        console.log("📨 Received remote answer from:", senderId);
        
        if (!this.isCaller) return; // Only caller receives answers
        
        try {
            await webRTCManager.setRemoteDescription(answer);
            
            // Update call status to active
            await signalingManager.updateCallStatus(this.currentCall.id, 'active');
            
            // Update UI
            this.updateCallState('active');
            this.startCallTimer();
            
        } catch (error) {
            console.error("❌ Failed to handle remote answer:", error);
        }
    }
    
    async handleRemoteIceCandidate(candidate, senderId) {
        console.log("🧊 Received remote ICE candidate from:", senderId);
        
        try {
            await webRTCManager.addIceCandidate(candidate);
        } catch (error) {
            console.error("❌ Failed to add remote ICE candidate:", error);
        }
    }
    
    async handleLocalIceCandidate(candidate) {
        if (!this.currentCall) return;
        
        console.log("🧊 Sending local ICE candidate");
        
        const receiverId = this.isCaller ? 
            this.currentCall.receiver_id : 
            this.currentCall.caller_id;
        
        await signalingManager.sendIceCandidate(
            this.currentCall.id,
            candidate,
            receiverId
        );
    }
    
    // ==================== EVENT HANDLERS ====================
    
    handleRemoteCallEvent(event, data, senderId) {
        console.log("📨 Received remote call event:", event, "from:", senderId);
        
        switch(event) {
            case 'call_ended':
                console.log("📞 Remote user ended the call");
                this.endCall();
                break;
                
            case 'call_rejected':
                console.log("❌ Call was rejected");
                this.cleanup();
                this.updateCallState('idle');
                break;
                
            case 'mute_toggled':
                if (this.onCallEvent) {
                    this.onCallEvent('remote_mute_toggled', data);
                }
                break;
                
            case 'video_toggled':
                if (this.onCallEvent) {
                    this.onCallEvent('remote_video_toggled', data);
                }
                break;
        }
    }
    
    handleRemoteStream(stream) {
        console.log("🎵 Remote stream received");
        
        if (this.onRemoteStream) {
            this.onRemoteStream(stream);
        }
    }
    
    handleConnectionStateChange(state) {
        console.log("📡 Connection state changed:", state);
        
        if (state === 'connected') {
            console.log("✅ WebRTC connected!");
            this.updateCallState('active');
            this.startCallTimer();
        } else if (state === 'disconnected' || state === 'failed') {
            console.warn("⚠️ WebRTC connection lost");
            this.endCall();
        }
    }
    
    handleIceConnectionStateChange(state) {
        console.log("❄️ ICE connection state changed:", state);
        
        // Monitor connection quality
        this.monitorCallQuality();
    }
    
    handleDataChannelMessage(message) {
        try {
            const data = JSON.parse(message);
            console.log("📨 Data channel message:", data);
            
            // Handle different message types
            switch(data.type) {
                case 'chat_message':
                    // Handle in-call chat messages
                    break;
                case 'call_control':
                    // Handle call controls
                    break;
            }
            
        } catch (error) {
            console.error("❌ Failed to parse data channel message:", error);
        }
    }
    
    handleDataChannelOpen(channel) {
        console.log("📨 Data channel opened:", channel.label);
        
        // Send initial handshake
        webRTCManager.sendDataChannelMessage({
            type: 'handshake',
            userId: this.userId,
            timestamp: Date.now()
        });
    }
    
    // ==================== CALL MONITORING ====================
    
    async monitorCallQuality() {
        if (!this.currentCall || this.callState !== 'active') return;
        
        try {
            const stats = await webRTCManager.getConnectionStats();
            
            if (stats && this.onCallQualityUpdate) {
                this.onCallQualityUpdate(stats);
            }
            
            // Log quality issues
            if (stats?.overallQuality === 'poor') {
                console.warn("⚠️ Poor call quality detected");
            }
            
        } catch (error) {
            console.error("❌ Failed to monitor call quality:", error);
        }
    }
    
    startCallTimer() {
        this.callStartTime = Date.now();
        
        this.callTimer = setInterval(() => {
            if (this.onCallEvent) {
                const duration = Math.floor((Date.now() - this.callStartTime) / 1000);
                this.onCallEvent('call_duration_update', { duration });
            }
            
            // Monitor quality every 10 seconds
            if (Math.floor(Date.now() / 1000) % 10 === 0) {
                this.monitorCallQuality();
            }
        }, 1000);
    }
    
    stopCallTimer() {
        if (this.callTimer) {
            clearInterval(this.callTimer);
            this.callTimer = null;
        }
    }
    
    // ==================== UTILITIES ====================
    
    async createCallRecord(friendId, callType) {
        try {
            const roomId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            const { data: call, error } = await supabase
                .from('calls')
                .insert({
                    room_id: roomId,
                    caller_id: this.userId,
                    receiver_id: friendId,
                    call_type: callType,
                    status: 'ringing',
                    initiated_at: new Date().toISOString()
                })
                .select()
                .single();
            
            if (error) throw error;
            
            return call;
            
        } catch (error) {
            console.error("❌ Failed to create call record:", error);
            return null;
        }
    }
    
    updateCallState(state) {
        this.callState = state;
        console.log("🔄 Call state changed to:", state);
        
        if (this.onCallStateChange) {
            this.onCallStateChange(state);
        }
    }
    
    cleanupFailedCall() {
        if (this.currentCall) {
            signalingManager.updateCallStatus(this.currentCall.id, 'failed');
        }
        this.cleanup();
    }
    
    cleanup() {
        console.log("🧹 Cleaning up call service...");
        
        // Stop timer
        this.stopCallTimer();
        
        // Cleanup WebRTC
        webRTCManager.cleanup();
        
        // Unsubscribe from signaling
        if (this.currentCall) {
            signalingManager.unsubscribeFromCall(this.currentCall.id);
        }
        
        // Reset state
        this.currentCall = null;
        this.isCaller = false;
        this.callType = 'voice';
        this.callStartTime = null;
        
        console.log("✅ Call service cleanup complete");
    }
    
    // ==================== GETTERS ====================
    
    getCallState() {
        return this.callState;
    }
    
    getCurrentCall() {
        return this.currentCall;
    }
    
    getLocalStream() {
        return webRTCManager.getLocalStream();
    }
    
    getRemoteStream() {
        return webRTCManager.getRemoteStream();
    }
    
    isInCall() {
        return this.callState === 'active' || this.callState === 'connecting';
    }
    
    // ==================== SETTERS ====================
    
    setOnCallStateChange(callback) {
        this.onCallStateChange = callback;
    }
    
    setOnRemoteStream(callback) {
        this.onRemoteStream = callback;
    }
    
    setOnCallQualityUpdate(callback) {
        this.onCallQualityUpdate = callback;
    }
    
    setOnCallEvent(callback) {
        this.onCallEvent = callback;
    }
}

// Export singleton instance
const callService = new CallService();
export default callService;