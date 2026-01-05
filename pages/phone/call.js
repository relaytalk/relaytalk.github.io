// /app/pages/phone/call.js - FINAL FIXED VERSION
console.log("📞 Call Page Loaded");

let supabase;
let callService;
let currentCallId = null;
let isSpeakerMode = false;
let isProcessingSpeaker = false;

async function initCallPage() {
    console.log("🚀 Initializing call page...");

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const friendId = urlParams.get('friend');
    const friendName = urlParams.get('name');
    currentCallId = urlParams.get('call');
    const isIncoming = urlParams.get('incoming') === 'true';
    const callType = urlParams.get('type') || 'voice';

    // Store in window for global access
    window.currentCallId = currentCallId;
    window.friendId = friendId;
    window.isIncoming = isIncoming;

    console.log("📊 Call params:", { friendId, friendName, currentCallId, isIncoming, callType });

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

    console.log("👤 User:", user.id);

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
            console.log("📲 Incoming call");
            document.getElementById('callStatus').textContent = 'Incoming call...';
            setupIncomingCallControls();
        } else if (friendId) {
            console.log("📤 Outgoing call to:", friendId);
            document.getElementById('callStatus').textContent = 'Calling...';
            startOutgoingCall(friendId, callType);
        } else {
            showError("No call information provided");
        }

    } catch (error) {
        console.error("❌ Call setup failed:", error);
        showError("Call setup failed: " + error.message);
    }
}

function startOutgoingCall(friendId, type) {
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
            console.log("✅ Call started:", call.id);
            window.currentCallId = call.id;
        })
        .catch(error => {
            console.error("❌ Call failed:", error);
            showError("Call failed: " + error.message);
        });
}

function setupIncomingCallControls() {
    const controls = document.getElementById('callControls');
    controls.innerHTML = `
        <button class="control-btn accept-btn" onclick="window.answerCall()">
            <i class="fas fa-phone"></i>
            <span>Answer</span>
        </button>
        <button class="control-btn decline-btn" onclick="window.declineCall()">
            <i class="fas fa-phone-slash"></i>
            <span>Decline</span>
        </button>
    `;
}

// Global functions
window.answerCall = async function() {
    console.log("📞 Answering call...");
    document.getElementById('callStatus').textContent = 'Answering...';

    if (callService && window.currentCallId) {
        try {
            await callService.answerCall(window.currentCallId);

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
            
        } catch (error) {
            console.error("❌ Answer call failed:", error);
            showError("Failed to answer: " + error.message);
        }
    }
};

window.declineCall = async function() {
    console.log("❌ Declining call...");
    
    if (supabase && window.currentCallId) {
        try {
            await supabase
                .from('calls')
                .update({ 
                    status: 'rejected',
                    ended_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', window.currentCallId);
            console.log("✅ Call rejected in database");
        } catch (error) {
            console.error("❌ Decline failed:", error);
        }
    }

    window.history.back();
};

window.toggleSpeaker = async function() {
    if (!callService || isProcessingSpeaker) {
        console.log("⏸️ Speaker toggle blocked");
        return;
    }

    isProcessingSpeaker = true;
    
    try {
        console.log("🔊 Toggling speaker...");
        
        // Call the service to toggle
        const newMode = await callService.toggleSpeakerMode();
        isSpeakerMode = newMode;
        
        // Update UI
        updateSpeakerUI(isSpeakerMode);
        
        // Show toast notification
        showToast(isSpeakerMode ? '🔊 Loudspeaker Mode ON' : '🎧 Earpiece Mode ON');
        
    } catch (error) {
        console.error("❌ Toggle speaker failed:", error);
        showToast('❌ Failed to toggle speaker');
    } finally {
        isProcessingSpeaker = false;
    }
};

function updateSpeakerUI(speakerOn) {
    const speakerBtn = document.getElementById('speakerBtn');
    const remoteAudio = document.getElementById('remoteAudio');
    
    if (!speakerBtn) {
        console.error("❌ Speaker button not found");
        return;
    }
    
    const speakerIcon = speakerBtn.querySelector('i');
    const speakerLabel = speakerBtn.querySelector('.speaker-label');
    
    if (speakerOn) {
        // Speaker ON - Loudspeaker mode
        speakerIcon.className = 'fas fa-volume-up';
        speakerLabel.textContent = 'Speaker ON';
        speakerBtn.style.background = 'linear-gradient(45deg, #4cd964, #5ac8fa)';
        speakerBtn.style.boxShadow = '0 0 15px rgba(76, 217, 100, 0.4)';
        
        // Set audio to loudspeaker
        if (remoteAudio) {
            remoteAudio.setAttribute('playsinline', 'false');
        }
        
    } else {
        // Speaker OFF - Earpiece mode
        speakerIcon.className = 'fas fa-headphones';
        speakerLabel.textContent = 'Speaker';
        speakerBtn.style.background = 'rgba(255, 255, 255, 0.1)';
        speakerBtn.style.boxShadow = 'none';
        
        // Set audio to earpiece
        if (remoteAudio) {
            remoteAudio.setAttribute('playsinline', 'true');
        }
    }
}

window.toggleMute = async function() {
    if (!callService) {
        console.error("❌ Call service not available");
        return;
    }

    try {
        const isMuted = await callService.toggleMute();
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
        console.error("❌ Toggle mute failed:", error);
        showToast('❌ Failed to toggle mute');
    }
};

window.endCall = async function() {
    console.log("📞 Ending call...");
    
    if (callService) {
        try {
            await callService.endCall();
        } catch (error) {
            console.error("❌ Error ending call:", error);
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
    console.log("📊 Call state changed:", state);
    
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
    console.log("🔊 Remote stream received");
    
    const audio = document.getElementById('remoteAudio');
    if (audio) {
        audio.srcObject = stream;
        audio.volume = 1.0;
        audio.muted = false;
        
        // Set initial to earpiece mode
        audio.setAttribute('playsinline', 'true');
        
        // Play audio
        audio.play()
            .then(() => {
                console.log("✅ Audio playing successfully");
                audio.volume = 1.0;
            })
            .catch(error => {
                console.log("⚠️ Audio play failed:", error.name);
                showAudioHelp();
            });
    }
}

function handleSpeakerModeChange(speakerMode) {
    console.log("🔊 Speaker mode changed in service:", speakerMode);
    isSpeakerMode = speakerMode;
    
    // Update UI
    setTimeout(() => {
        updateSpeakerUI(isSpeakerMode);
    }, 100);
}

function handleCallEvent(event, data) {
    console.log("📞 Call event:", event, data);
    
    if (event === 'call_ended') {
        document.getElementById('callStatus').textContent = 'Call ended';
        showToast('📞 Call ended');
        
        setTimeout(() => {
            window.history.back();
        }, 1500);
    }
}

function showAudioHelp() {
    const existing = document.getElementById('audioHelp');
    if (existing) existing.remove();

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
            <p style="margin: 0; font-size: 14px;">Tap to enable audio</p>
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

window.enableAudio = function() {
    const audio = document.getElementById('remoteAudio');
    if (audio) {
        audio.play()
            .then(() => console.log("✅ Audio enabled"))
            .catch(e => console.error("❌ Audio play error:", e));
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

    // Remove after 3 seconds
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 3000);
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
    
    showToast('❌ ' + message);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initCallPage);

// Add event listener for cleanup
window.addEventListener('beforeunload', () => {
    if (callService) {
        callService.endCall();
    }
});