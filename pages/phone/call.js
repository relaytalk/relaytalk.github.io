// /app/pages/phone/call.js - COMPLETELY FIXED VERSION
console.log("📞 Call Page Loaded");

let supabase;
let callService;
let currentCallId = null;
let isSpeakerMode = false;
let lastSpeakerMode = null;
let isProcessingSpeakerToggle = false;

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
    console.log("Call params:", { friendId, friendName, currentCallId, isIncoming, callType });

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

    console.log("User authenticated:", user.id);

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
            console.log("Incoming call detected");
            document.getElementById('callStatus').textContent = 'Incoming call...';
            setupIncomingCallControls();
        } else if (friendId) {
            console.log("Outgoing call to:", friendId);
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
            <i class="fas fa-headphones"></i>
            <span class="speaker-label">Speaker</span>
        </button>
        <button class="control-btn mute-btn" id="muteBtn" onclick="window.toggleMute()">
            <i class="fas fa-microphone"></i>
        </button>
        <button class="control-btn end-btn" onclick="window.endCall()">
            <i class="fas fa-phone-slash"></i>
        </button>
    `;

    callService.initiateCall(friendId, type)
        .then(call => {
            console.log("Call initiated:", call);
            // Update audio mode in database
            updateAudioModeInDatabase('mic');
        })
        .catch(error => {
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
    console.log("Answering call...");
    document.getElementById('callStatus').textContent = 'Answering...';

    if (window.globalCallService && window.currentCallId) {
        try {
            await window.globalCallService.answerCall(window.currentCallId);

            const controls = document.getElementById('callControls');
            if (controls) {
                controls.innerHTML = `
                    <button class="control-btn speaker-btn" id="speakerBtn" onclick="window.toggleSpeaker()">
                        <i class="fas fa-headphones"></i>
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
            
            // Update audio mode in database
            updateAudioModeInDatabase('mic');
            
        } catch (error) {
            console.error("Answer call failed:", error);
            showError("Failed to answer: " + error.message);
        }
    }
};

// Handle decline button click
window.handleDeclineClick = async function() {
    console.log("Declining call...");
    
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
            console.log("Call rejected in database");
        } catch (error) {
            console.error("Decline failed:", error);
        }
    }

    window.history.back();
};

// Update audio mode in database
async function updateAudioModeInDatabase(audioMode) {
    if (!window.globalSupabase || !window.currentCallId) return;
    
    try {
        await window.globalSupabase
            .from('calls')
            .update({ 
                audio_mode: audioMode,
                updated_at: new Date().toISOString()
            })
            .eq('id', window.currentCallId);
        console.log("Audio mode updated to:", audioMode);
    } catch (error) {
        console.error("Failed to update audio mode:", error);
    }
}

// Toggle speaker output
window.toggleSpeaker = async () => {
    if (!window.globalCallService || isProcessingSpeakerToggle) {
        console.log("Speaker toggle blocked - service not available or already processing");
        return;
    }

    try {
        isProcessingSpeakerToggle = true;
        console.log("Toggling speaker...");
        
        // Toggle in call service
        const newMode = await window.globalCallService.toggleSpeakerMode();
        
        // Update local state
        isSpeakerMode = newMode;
        
        // Update UI immediately
        updateSpeakerUI(isSpeakerMode);
        
        // Update database
        await updateAudioModeInDatabase(isSpeakerMode ? 'speaker' : 'mic');
        
        isProcessingSpeakerToggle = false;
        
    } catch (error) {
        console.error("Toggle speaker failed:", error);
        isProcessingSpeakerToggle = false;
        showToast('❌ Failed to toggle speaker');
    }
};

// Update speaker UI
function updateSpeakerUI(speakerOn) {
    const speakerBtn = document.getElementById('speakerBtn');
    const remoteAudio = document.getElementById('remoteAudio');
    
    if (!speakerBtn) {
        console.error("Speaker button not found");
        return;
    }
    
    const speakerIcon = speakerBtn.querySelector('i');
    const speakerLabel = speakerBtn.querySelector('.speaker-label');
    
    if (speakerOn) {
        // Speaker Mode ON (Loudspeaker)
        speakerIcon.className = 'fas fa-volume-up';
        speakerLabel.textContent = 'Speaker ON';
        speakerBtn.style.background = 'linear-gradient(45deg, #4cd964, #5ac8fa)';
        speakerBtn.style.boxShadow = '0 0 15px rgba(76, 217, 100, 0.4)';
        
        // Set audio to loudspeaker
        if (remoteAudio) {
            remoteAudio.setAttribute('playsinline', 'false');
            
            // Try to use system speaker
            if (typeof remoteAudio.sinkId !== 'undefined') {
                remoteAudio.setSinkId('')
                    .then(() => console.log("Audio output set to system speaker"))
                    .catch(err => console.log("Could not set sinkId:", err));
            }
        }
        
        showToast('🔊 Speaker Mode: Loudspeaker');
        
    } else {
        // Speaker Mode OFF (Earpiece)
        speakerIcon.className = 'fas fa-headphones';
        speakerLabel.textContent = 'Speaker';
        speakerBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        speakerBtn.style.boxShadow = 'none';
        
        // Set audio to earpiece
        if (remoteAudio) {
            remoteAudio.setAttribute('playsinline', 'true');
        }
        
        showToast('🎧 Speaker Mode: Earpiece');
    }
}

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
    console.log("Ending call...");
    
    if (window.globalCallService) {
        try {
            await window.globalCallService.endCall();
        } catch (error) {
            console.error("Error ending call:", error);
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
    console.log("Call state changed:", state);
    
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
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log("Audio playing successfully");
                    audio.volume = 1.0;
                })
                .catch(error => {
                    console.log("Audio play failed:", error.name);
                    showAudioHelp();
                });
        }
    }
}

function handleSpeakerModeChange(speakerMode) {
    console.log("Speaker mode changed in service:", speakerMode);
    
    // Only update if different from current state
    if (lastSpeakerMode !== speakerMode) {
        lastSpeakerMode = speakerMode;
        isSpeakerMode = speakerMode;
        
        // Update UI without triggering another toggle
        setTimeout(() => {
            updateSpeakerUI(isSpeakerMode);
        }, 100);
    }
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
            <button onclick="window.enableAudio()" style="
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
        audio.play()
            .then(() => console.log("Audio enabled"))
            .catch(e => console.error("Audio play error:", e));
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
    console.log("Call event:", event, data);
    
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
    const loadingEl = document.getElementById('loadingMessage');
    if (loadingEl) loadingEl.style.display = 'none';
    
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

// Add a global error handler
window.addEventListener('error', function(event) {
    console.error("Global error:", event.error);
});

// Add unhandled promise rejection handler
window.addEventListener('unhandledrejection', function(event) {
    console.error("Unhandled promise rejection:", event.reason);
});