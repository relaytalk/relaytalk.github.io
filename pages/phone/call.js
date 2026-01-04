// /app/pages/phone/call.js - CORRECTED SPEAKER MODE (Audio Output)
console.log("📞 Call Page Loaded");

let supabase;
let callService;
let currentCallId = null;
let isSpeakerMode = false; // false = earpiece, true = loudspeaker
let remoteAudio = null;

async function initCallPage() {
    console.log("Initializing call page...");

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const friendId = urlParams.get('friend');
    const friendName = urlParams.get('name');
    currentCallId = urlParams.get('call');
    const isIncoming = urlParams.get('incoming') === 'true';
    const callType = urlParams.get('type') || 'voice';

    window.currentCallId = currentCallId;

    // Get supabase
    if (window.supabase) {
        supabase = window.supabase;
        window.globalSupabase = supabase;
    } else {
        try {
            const module = await import('/app/utils/supabase.js');
            supabase = module.supabase;
            window.globalSupabase = supabase;
        } catch (error) {
            showError("Failed to load Supabase: " + error.message);
            return;
        }
    }

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        showError("Please log in to make calls");
        setTimeout(() => window.location.href = '/app/pages/login/index.html', 2000);
        return;
    }

    // Update UI
    if (friendName) {
        document.getElementById('callerName').textContent = friendName;
        document.getElementById('callerAvatar').textContent = friendName.charAt(0).toUpperCase();
    }

    // Initialize call service
    try {
        const module = await import('/app/utils/callService.js');
        callService = module.default;
        window.globalCallService = callService;
        await callService.initialize(user.id);

        // Setup callbacks
        callService.setOnCallStateChange(handleCallStateChange);
        callService.setOnRemoteStream(handleRemoteStream);
        callService.setOnCallEvent(handleCallEvent);
        callService.setOnSpeakerModeChange(handleSpeakerModeChange);

        // Start or answer call
        if (isIncoming && currentCallId) {
            document.getElementById('callStatus').textContent = 'Incoming call...';
            setupIncomingCallControls();
        } else if (friendId) {
            document.getElementById('callStatus').textContent = 'Calling...';
            startOutgoingCall(friendId, friendName || 'Friend', callType);
        } else {
            showError("No call information provided");
        }

    } catch (error) {
        console.error("Call setup failed:", error);
        showError("Call setup failed: " + error.message);
    }
}

function startOutgoingCall(friendId, friendName, type) {
    const controls = document.getElementById('callControls');
    controls.innerHTML = `
        <button class="control-btn speaker-btn" id="speakerBtn" onclick="window.toggleSpeaker()">
            <i class="fas fa-volume-up"></i>
            <span class="speaker-label">Speaker</span>
        </button>
        <button class="control-btn mute-btn" id="muteBtn" onclick="window.toggleMute()">
            <i class="fas fa-microphone"></i>
        </button>
        <button class="control-btn end-btn" onclick="window.endCall()">
            <i class="fas fa-phone-slash"></i>
        </button>
    `;

    callService.initiateCall(friendId, type).catch(error => {
        console.error("Call initiation failed:", error);
        showError("Call failed: " + error.message);
    });
}

function setupIncomingCallControls() {
    const controls = document.getElementById('callControls');
    controls.innerHTML = `
        <button class="control-btn accept-btn" onclick="window.handleAnswerClick()">
            <i class="fas fa-phone"></i>
        </button>
        <button class="control-btn decline-btn" onclick="window.handleDeclineClick()">
            <i class="fas fa-phone-slash"></i>
        </button>
    `;
}

// Handle answer button click
window.handleAnswerClick = async function() {
    document.getElementById('callStatus').textContent = 'Answering...';

    if (window.globalCallService && window.currentCallId) {
        try {
            await window.globalCallService.answerCall(window.currentCallId);

            const controls = document.getElementById('callControls');
            if (controls) {
                controls.innerHTML = `
                    <button class="control-btn speaker-btn" id="speakerBtn" onclick="window.toggleSpeaker()">
                        <i class="fas fa-volume-up"></i>
                        <span class="speaker-label">Speaker</span>
                    </button>
                    <button class="control-btn mute-btn" id="muteBtn" onclick="window.toggleMute()">
                        <i class="fas fa-microphone"></i>
                    </button>
                    <button class="control-btn end-btn" onclick="window.endCall()">
                        <i class="fas fa-phone-slash"></i>
                    </button>
                `;
            }
        } catch (error) {
            console.error("Answer call failed:", error);
            showError("Failed to answer: " + error.message);
        }
    }
};

// Handle decline button click
window.handleDeclineClick = async function() {
    if (window.globalSupabase && window.currentCallId) {
        try {
            await window.globalSupabase
                .from('calls')
                .update({ 
                    status: 'rejected',
                    ended_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', window.currentCallId);
        } catch (error) {
            console.error("Decline failed:", error);
        }
    }

    window.history.back();
};

// Toggle speaker output (loudspeaker vs earpiece)
window.toggleSpeaker = async () => {
    if (!window.globalCallService) {
        console.error("Call service not available");
        return;
    }

    try {
        // Toggle speaker mode in call service
        isSpeakerMode = await window.globalCallService.toggleSpeakerMode();
        
        const speakerBtn = document.getElementById('speakerBtn');
        const remoteAudio = document.getElementById('remoteAudio');
        
        if (speakerBtn && remoteAudio) {
            const speakerIcon = speakerBtn.querySelector('i');
            const speakerLabel = speakerBtn.querySelector('.speaker-label');
            
            if (isSpeakerMode) {
                // Switch to LOUDSPEAKER (system audio)
                speakerIcon.className = 'fas fa-volume-up';
                speakerLabel.textContent = 'Speaker ON';
                speakerBtn.style.background = 'linear-gradient(45deg, #4cd964, #5ac8fa)';
                speakerBtn.style.boxShadow = '0 0 15px rgba(76, 217, 100, 0.4)';
                
                // Set audio output to loudspeaker
                remoteAudio.setAttribute('playsinline', 'false');
                
                // On mobile, we might need to use different audio context
                if (typeof remoteAudio.sinkId !== 'undefined') {
                    try {
                        await remoteAudio.setSinkId(''); // System default (speaker)
                    } catch (err) {
                        console.log("Could not set sinkId:", err);
                    }
                }
                
                showToast('🔊 Speaker Mode: Loudspeaker');
                
            } else {
                // Switch to EARPIECE (normal phone mode)
                speakerIcon.className = 'fas fa-headphones';
                speakerLabel.textContent = 'Earpiece';
                speakerBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                speakerBtn.style.boxShadow = 'none';
                
                // Set audio output to earpiece/headphones
                remoteAudio.setAttribute('playsinline', 'true');
                
                // Try to use earpiece if available
                if (typeof remoteAudio.sinkId !== 'undefined') {
                    try {
                        // Try to get earpiece/headphones sink
                        const devices = await navigator.mediaDevices.enumerateDevices();
                        const audioOutputs = devices.filter(device => 
                            device.kind === 'audiooutput' && 
                            (device.label.includes('earpiece') || device.label.includes('default'))
                        );
                        
                        if (audioOutputs.length > 0) {
                            await remoteAudio.setSinkId(audioOutputs[0].deviceId);
                        }
                    } catch (err) {
                        console.log("Could not set earpiece sink:", err);
                    }
                }
                
                showToast('🎧 Speaker Mode: Earpiece');
            }
        }
    } catch (error) {
        console.error("Toggle speaker failed:", error);
        showToast('❌ Failed to toggle speaker');
    }
};

// Toggle microphone mute
window.toggleMute = async () => {
    if (!window.globalCallService) {
        console.error("Call service not available");
        return;
    }

    try {
        const isMuted = await window.globalCallService.toggleMute();
        const muteBtn = document.getElementById('muteBtn');
        
        if (muteBtn) {
            if (isMuted) {
                muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                muteBtn.style.background = 'linear-gradient(45deg, #ff9500, #ff5e3a)';
                muteBtn.style.boxShadow = '0 0 10px rgba(255, 149, 0, 0.4)';
                showToast('🔇 Microphone Muted');
            } else {
                muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                muteBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                muteBtn.style.boxShadow = 'none';
                showToast('🎤 Microphone Unmuted');
            }
        }
    } catch (error) {
        console.error("Toggle mute failed:", error);
        showToast('❌ Failed to toggle mute');
    }
};

window.endCall = async () => {
    if (window.globalCallService) {
        try {
            await window.globalCallService.endCall();
        } catch (error) {
            console.error("Error ending call:", error);
        }
    }
    
    // Also update call status in database if we have call ID
    if (window.globalSupabase && window.currentCallId) {
        try {
            await window.globalSupabase
                .from('calls')
                .update({ 
                    status: 'ended',
                    ended_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', window.currentCallId);
        } catch (error) {
            console.error("Failed to update call status:", error);
        }
    }
    
    // Show ending message
    document.getElementById('callStatus').textContent = 'Call ended';
    showToast('📞 Call ended');
    
    // Wait a moment then go back
    setTimeout(() => {
        window.history.back();
    }, 1500);
};

function handleCallStateChange(state) {
    const statusEl = document.getElementById('callStatus');
    const timerEl = document.getElementById('callTimer');
    const loadingEl = document.getElementById('loadingMessage');

    if (loadingEl) loadingEl.style.display = 'none';

    switch(state) {
        case 'ringing':
            statusEl.textContent = 'Ringing...';
            break;
        case 'connecting':
            statusEl.textContent = 'Connecting...';
            break;
        case 'active':
            statusEl.textContent = 'Call Connected';
            if (timerEl) {
                timerEl.style.display = 'block';
                startCallTimer();
            }
            break;
        case 'ending':
            statusEl.textContent = 'Ending call...';
            break;
        case 'idle':
            statusEl.textContent = 'Call ended';
            break;
    }
}

function handleRemoteStream(stream) {
    console.log("Remote stream received");

    const audio = document.getElementById('remoteAudio');
    if (audio) {
        audio.srcObject = stream;
        audio.volume = 1.0;
        audio.muted = false;
        
        // Set initial audio output (default to earpiece)
        audio.setAttribute('playsinline', 'true');
        
        // Play audio
        audio.play().then(() => {
            console.log("Audio playing!");
            // Ensure audio is at correct volume
            audio.volume = 1.0;
        }).catch(error => {
            console.log("Audio play failed:", error.name);
            showAudioHelp();
        });
    }
}

function handleSpeakerModeChange(speakerMode) {
    console.log("Speaker mode changed:", speakerMode);
    isSpeakerMode = speakerMode;
    
    // Update UI to reflect the change
    setTimeout(() => {
        window.toggleSpeaker();
    }, 100);
}

function showAudioHelp() {
    const help = document.createElement('div');
    help.innerHTML = `
        <div id="audioHelp" style="
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 15px;
            border-radius: 15px;
            text-align: center;
            z-index: 9999;
            max-width: 300px;
            border: 2px solid #667eea;
        ">
            <p style="margin: 0; font-size: 14px;">Tap to enable audio playback</p>
            <button onclick="enableAudio()" style="
                margin-top: 10px;
                background: #667eea;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 8px;
                cursor: pointer;
            ">Enable Audio</button>
        </div>
    `;

    document.body.appendChild(help);
}

// Helper to enable audio
window.enableAudio = function() {
    const audio = document.getElementById('remoteAudio');
    if (audio) {
        audio.play().catch(e => console.error("Audio play error:", e));
    }
    const helpEl = document.getElementById('audioHelp');
    if (helpEl) helpEl.remove();
};

function showToast(message) {
    // Remove existing toast
    const existing = document.getElementById('toastNotification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'toastNotification';
    toast.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.85);
        color: white;
        padding: 12px 20px;
        border-radius: 20px;
        z-index: 9999;
        font-size: 13px;
        text-align: center;
        animation: fadeInOut 3s ease-in-out;
        border: 1px solid rgba(255,255,255,0.1);
        backdrop-filter: blur(10px);
        white-space: pre-line;
        line-height: 1.4;
    `;

    toast.textContent = message;
    document.body.appendChild(toast);

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
            15% { opacity: 1; transform: translateX(-50%) translateY(0); }
            85% { opacity: 1; transform: translateX(-50%) translateY(0); }
            100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        }
    `;
    document.head.appendChild(style);

    // Remove after animation
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
        if (style.parentNode) style.remove();
    }, 3000);
}

function handleCallEvent(event, data) {
    if (event === 'call_ended') {
        document.getElementById('callStatus').textContent = 'Call ended';
        showToast('📞 Call ended');
        
        setTimeout(() => {
            window.history.back();
        }, 1500);
    }
}

let callTimerInterval = null;
function startCallTimer() {
    let seconds = 0;
    const timerEl = document.getElementById('callTimer');
    if (!timerEl) return;

    clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
        seconds++;
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }, 1000);
}

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }

    document.getElementById('callStatus').textContent = 'Error';
    document.getElementById('loadingMessage').style.display = 'none';
    
    // Show error toast
    showToast('❌ ' + message);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initCallPage);

// Add event listener for beforeunload to clean up
window.addEventListener('beforeunload', () => {
    if (window.globalCallService) {
        window.globalCallService.endCall();
    }
});