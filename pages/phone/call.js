// /app/pages/phone/call.js - WITH SPEAKER TOGGLE
console.log("📞 Call Page Loaded");

let supabase;
let callService;
let currentCallId = null;

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
            <i class="fas fa-microphone"></i>
            <span class="speaker-label">Mic</span>
        </button>
        <button class="control-btn mute-btn" onclick="window.toggleMute()">
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
                        <i class="fas fa-microphone"></i>
                        <span class="speaker-label">Mic</span>
                    </button>
                    <button class="control-btn mute-btn" onclick="window.toggleMute()">
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

// Global functions
window.toggleSpeaker = async () => {
    if (!window.globalCallService) return;
    
    try {
        const isSpeakerMode = await window.globalCallService.toggleSpeakerMode();
        const speakerBtn = document.getElementById('speakerBtn');
        const speakerIcon = speakerBtn.querySelector('i');
        const speakerLabel = speakerBtn.querySelector('.speaker-label');
        
        if (isSpeakerMode) {
            // Speaker ON - System Audio
            speakerIcon.className = 'fas fa-volume-up';
            speakerLabel.textContent = 'Speaker';
            speakerBtn.style.background = 'linear-gradient(45deg, #4cd964, #5ac8fa)';
            
            // Show notification
            showToast('Speaker Mode: System Audio');
        } else {
            // Speaker OFF - Microphone
            speakerIcon.className = 'fas fa-microphone';
            speakerLabel.textContent = 'Mic';
            speakerBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            
            // Show notification
            showToast('Speaker Mode: Microphone');
        }
    } catch (error) {
        console.error("Toggle speaker failed:", error);
    }
};

window.toggleMute = async () => {
    if (!window.globalCallService) return;
    
    try {
        const isMuted = await window.globalCallService.toggleMute();
        const muteBtn = document.querySelector('.mute-btn');
        if (muteBtn) {
            if (isMuted) {
                muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                muteBtn.style.background = 'linear-gradient(45deg, #ff9500, #ff5e3a)';
                showToast('Microphone Muted');
            } else {
                muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                muteBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                showToast('Microphone Unmuted');
            }
        }
    } catch (error) {
        console.error("Toggle mute failed:", error);
    }
};

window.endCall = () => {
    if (window.globalCallService) {
        window.globalCallService.endCall();
    }
    setTimeout(() => {
        window.history.back();
    }, 1000);
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
    }
}

function handleRemoteStream(stream) {
    console.log("Remote stream received");
    
    const audio = document.getElementById('remoteAudio');
    if (audio) {
        audio.srcObject = stream;
        audio.volume = 1.0;
        audio.muted = false;
        
        // Try to play immediately
        audio.play().then(() => {
            console.log("Audio playing!");
        }).catch(error => {
            console.log("Audio play failed:", error.name);
            showAudioHelp();
        });
    }
}

function handleSpeakerModeChange(isSpeakerMode) {
    console.log("Speaker mode changed:", isSpeakerMode);
    
    if (isSpeakerMode) {
        // Show system audio notification
        showToast('Now in Speaker Mode - Others can hear your system audio');
    } else {
        // Show microphone notification
        showToast('Now in Microphone Mode - Others can hear your voice');
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
            <p style="margin: 0; font-size: 14px;">Click anywhere to enable audio</p>
        </div>
    `;
    
    document.body.appendChild(help);
    
    // Click anywhere to play
    document.body.addEventListener('click', () => {
        const audio = document.getElementById('remoteAudio');
        if (audio && audio.paused) {
            audio.play().catch(() => {});
        }
        const helpEl = document.getElementById('audioHelp');
        if (helpEl) helpEl.remove();
    }, { once: true });
    
    // Remove after 5 seconds
    setTimeout(() => {
        const helpEl = document.getElementById('audioHelp');
        if (helpEl && helpEl.parentNode) helpEl.remove();
    }, 5000);
}

function showToast(message) {
    // Remove existing toast
    const existing = document.getElementById('toastNotification');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.id = 'toastNotification';
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 12px 24px;
        border-radius: 25px;
        z-index: 9999;
        font-size: 14px;
        text-align: center;
        animation: fadeInOut 3s ease-in-out;
        border: 1px solid rgba(255,255,255,0.1);
    `;
    
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            10% { opacity: 1; transform: translateX(-50%) translateY(0); }
            90% { opacity: 1; transform: translateX(-50%) translateY(0); }
            100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
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
        if (window.globalCallService) {
            window.globalCallService.endCall();
        }
        setTimeout(() => {
            window.history.back();
        }, 1000);
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
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initCallPage);