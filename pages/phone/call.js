// /app/pages/phone/call.js - GUARANTEED AUDIO
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

        // Start or answer call
        if (isIncoming && currentCallId) {
            document.getElementById('callStatus').textContent = 'Incoming call...';
            setupIncomingCallControls();
        } else if (friendId) {
            document.getElementById('callStatus').textContent = 'Calling...';
            startOutgoingCall(friendId, friendName, callType);
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
    
    // Wait for call service to be ready
    for (let i = 0; i < 30; i++) {
        if (window.globalCallService && window.currentCallId) {
            try {
                await window.globalCallService.answerCall(window.currentCallId);
                
                const controls = document.getElementById('callControls');
                if (controls) {
                    controls.innerHTML = `
                        <button class="control-btn mute-btn" onclick="window.toggleMute()">
                            <i class="fas fa-microphone"></i>
                        </button>
                        <button class="control-btn end-btn" onclick="window.endCall()">
                            <i class="fas fa-phone-slash"></i>
                        </button>
                    `;
                }
                
                return;
            } catch (error) {
                console.error("Answer call failed:", error);
                showError("Failed to answer: " + error.message);
                return;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    showError("Call service is taking too long to load.");
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
window.toggleMute = async () => {
    if (!window.globalCallService) return;
    
    try {
        const isMuted = await window.globalCallService.toggleMute();
        const muteBtn = document.querySelector('.mute-btn');
        if (muteBtn) {
            if (isMuted) {
                muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                muteBtn.style.background = 'linear-gradient(45deg, #ff9500, #ff5e3a)';
            } else {
                muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                muteBtn.style.background = 'rgba(255, 255, 255, 0.1)';
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
    console.log("🎵 Stream received, setting up audio...");
    
    const audio = document.getElementById('remoteAudio');
    if (audio) {
        // Clear any previous stream
        audio.srcObject = null;
        
        // Set the new stream
        audio.srcObject = stream;
        audio.volume = 1.0;
        audio.muted = false;
        
        console.log("Audio element configured:", {
            hasStream: !!audio.srcObject,
            muted: audio.muted,
            volume: audio.volume
        });
        
        // CRITICAL: Try to play audio with multiple attempts
        const playAudio = async (attempt = 1) => {
            try {
                await audio.play();
                console.log("✅ Audio playback started successfully!");
                document.getElementById('audioIndicator').style.background = '#4cd964';
            } catch (error) {
                console.log(`❌ Play attempt ${attempt} failed:`, error.name);
                
                if (attempt < 5) {
                    // Wait and retry
                    setTimeout(() => playAudio(attempt + 1), 500);
                } else {
                    // Show help message
                    showAudioHelp();
                }
            }
        };
        
        // Start playback attempts
        playAudio();
        
        // Also setup click-to-play fallback
        document.body.addEventListener('click', () => {
            if (audio.paused && audio.srcObject) {
                audio.play().catch(() => {});
            }
        }, { once: true });
    }
}

function showAudioHelp() {
    const helpDiv = document.createElement('div');
    helpDiv.id = 'audioHelp';
    helpDiv.style.cssText = `
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
    `;
    
    helpDiv.innerHTML = `
        <h4 style="margin: 0 0 10px 0;">🔊 Audio Help</h4>
        <p style="margin: 0 0 10px 0; font-size: 14px;">
            Click anywhere on screen to enable audio
        </p>
        <button onclick="this.parentElement.remove()" style="
            background: #667eea;
            color: white;
            border: none;
            padding: 8px 20px;
            border-radius: 10px;
            cursor: pointer;
        ">
            OK
        </button>
    `;
    
    document.body.appendChild(helpDiv);
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