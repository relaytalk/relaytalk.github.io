// /app/pages/phone/call.js - CLEAN FINAL VERSION
console.log("📞 Call Page Loaded");

// Global references
let supabase;
let callService;
let currentCallId = null;

// Audio state
let audioUnlocked = false;

async function initCallPage() {
    console.log("Initializing call page...");
    
    // Setup audio unlock
    setupAudioUnlock();

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const friendId = urlParams.get('friend');
    const friendName = urlParams.get('name');
    currentCallId = urlParams.get('call');
    const isIncoming = urlParams.get('incoming') === 'true';
    const callType = urlParams.get('type') || 'voice';

    console.log("Call parameters:", { friendId, friendName, currentCallId, isIncoming, callType });

    // Store in global for inline handlers
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

    console.log("Current user:", user.email);

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
            // Incoming call
            document.getElementById('callStatus').textContent = 'Incoming call...';
            setupIncomingCallControls();
        } else if (friendId) {
            // Outgoing call
            document.getElementById('callStatus').textContent = 'Calling...';
            startOutgoingCall(friendId, friendName, callType);
        } else {
            showError("No call information provided");
        }

    } catch (error) {
        console.error("❌ Call setup failed:", error);
        showError("Call setup failed: " + error.message);
    }
}

function setupAudioUnlock() {
    // Create silent audio to warm up audio context
    const silentAudio = new Audio();
    silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
    silentAudio.volume = 0.001;
    
    const unlockAudio = async () => {
        if (audioUnlocked) return;
        
        try {
            await silentAudio.play();
            audioUnlocked = true;
            
            // Try to play remote audio
            const remoteAudio = document.getElementById('remoteAudio');
            if (remoteAudio && remoteAudio.srcObject && remoteAudio.paused) {
                setTimeout(() => {
                    remoteAudio.play().catch(() => {});
                }, 300); // Small delay for better reliability
            }
        } catch (error) {
            console.log("Audio unlock attempt failed:", error.name);
        }
    };
    
    // Unlock on user interaction
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });
    
    // Also try after delay
    setTimeout(unlockAudio, 1000);
}

function startOutgoingCall(friendId, friendName, type) {
    console.log("Starting outgoing call to:", friendName);

    // Show calling UI
    const controls = document.getElementById('callControls');
    controls.innerHTML = `
        <button class="control-btn mute-btn" onclick="window.toggleMute()">
            <i class="fas fa-microphone"></i>
        </button>
        <button class="control-btn end-btn" onclick="window.endCall()">
            <i class="fas fa-phone-slash"></i>
        </button>
    `;

    // Start the call
    callService.initiateCall(friendId, type).catch(error => {
        console.error("Call initiation failed:", error);
        showError("Call failed: " + error.message);
    });
}

function setupIncomingCallControls() {
    console.log("Setting up incoming call controls");

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
    console.log("Answer button clicked");
    
    // Show loading state
    document.getElementById('callStatus').textContent = 'Answering...';
    
    // Unlock audio on user interaction
    setupAudioUnlock();
    
    // Wait for call service to be ready
    for (let i = 0; i < 30; i++) {
        if (window.globalCallService && window.currentCallId) {
            try {
                await window.globalCallService.answerCall(window.currentCallId);
                
                // Update controls to show mute/end
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
                
                console.log("✅ Call answered successfully");
                return;
            } catch (error) {
                console.error("Answer call failed:", error);
                showError("Failed to answer: " + error.message);
                return;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // If we get here, service never became ready
    showError("Call service is taking too long to load. Please try again.");
};

// Handle decline button click
window.handleDeclineClick = async function() {
    console.log("Decline button clicked");
    
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

// Global functions (for inline onclick handlers)
window.toggleMute = async () => {
    if (!window.globalCallService) {
        alert("Call service not ready yet");
        return;
    }
    
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
    }
}

function handleRemoteStream(stream) {
    console.log("Remote stream received");
    
    const audio = document.getElementById('remoteAudio');
    if (audio) {
        // Clear previous stream
        audio.srcObject = null;
        
        // Add 300ms delay for smoother audio
        setTimeout(() => {
            audio.srcObject = stream;
            audio.volume = 1.0;
            audio.muted = false;
            
            // Try to play with retry logic
            const playWithRetry = (retries = 3) => {
                audio.play().then(() => {
                    console.log("✅ Audio playing smoothly");
                }).catch(error => {
                    if (retries > 0) {
                        console.log(`Retrying audio playback (${retries} attempts left)...`);
                        setTimeout(() => playWithRetry(retries - 1), 500);
                    } else {
                        console.log("Audio playback failed, waiting for user interaction");
                    }
                });
            };
            
            playWithRetry();
        }, 300); // 300ms delay for smoother audio
    }
}

function handleCallEvent(event, data) {
    console.log("Call event:", event, data);

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
    console.error("Error:", message);

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