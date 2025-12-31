// ====== CREATE ACCOUNT PAGE SCRIPT - FIXED WITH PHONE AUTH ======
// Modal functions
function showTerms() {
    document.getElementById('termsModal').style.display = 'flex';
}

function showPrivacy() {
    document.getElementById('privacyModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('termsModal').style.display = 'none';
    document.getElementById('privacyModal').style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const termsModal = document.getElementById('termsModal');
    const privacyModal = document.getElementById('privacyModal');

    if (event.target === termsModal) {
        termsModal.style.display = 'none';
    }
    if (event.target === privacyModal) {
        privacyModal.style.display = 'none';
    }
};

// Escape key closes modal
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeModal();
    }
});

// Toggle password visibility
function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleBtn = document.querySelector('.password-toggle');

    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.textContent = '🙈';
    } else {
        passwordInput.type = 'password';
        toggleBtn.textContent = '👁️';
    }
}

// Show error message
function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

// Hide error message
function hideError(elementId) {
    const errorEl = document.getElementById(elementId);
    errorEl.style.display = 'none';
}

// Validate username
function validateUsername(username) {
    if (username.length < 3) {
        showError('usernameError', 'Username must be at least 3 characters');
        return false;
    }
    if (username.length > 20) {
        showError('usernameError', 'Username must be less than 20 characters');
        return false;
    }
    if (!/^[a-zA-Z0-9_.]+$/.test(username)) {
        showError('usernameError', 'Only letters, numbers, underscore, and dot allowed');
        return false;
    }
    hideError('usernameError');
    return true;
}

// Validate password
function validatePassword(password) {
    if (password.length < 6) {
        showError('passwordError', 'Password must be at least 6 characters');
        return false;
    }
    hideError('passwordError');
    return true;
}

// Validate password confirmation
function validateConfirmPassword(password, confirmPassword) {
    if (password !== confirmPassword) {
        showError('confirmError', 'Passwords do not match');
        return false;
    }
    hideError('confirmError');
    return true;
}

// Load Supabase
let supabase = null;

async function initSupabase() {
    try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        supabase = createClient(
            'https://blxtldgnssvasuinpyit.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJseHRsZGduc3N2YXN1aW5weWl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwODIxODIsImV4cCI6MjA4MjY1ODE4Mn0.Dv04IOAY76o2ccu5dzwK3fJjzo93BIoK6C2H3uWrlMw'
        );
        console.log("✅ Supabase connected");
        return true;
    } catch (error) {
        console.error("❌ Supabase error:", error);
        return false;
    }
}

// Handle form submission - FIXED WITH PHONE AUTH
async function handleSignup(event) {
    event.preventDefault();

    // Get form values
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validate inputs
    const isUsernameValid = validateUsername(username);
    const isPasswordValid = validatePassword(password);
    const isConfirmValid = validateConfirmPassword(password, confirmPassword);

    if (!isUsernameValid || !isPasswordValid || !isConfirmValid) {
        return;
    }

    if (!document.getElementById('terms').checked) {
        alert('Please agree to Terms & Conditions');
        return;
    }

    // Show loading
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;

    try {
        // 1. CREATE FAKE PHONE NUMBER (NO EMAIL RATE LIMITS!)
        const fakePhone = `+1${Date.now().toString().slice(-10)}`;
        console.log("Creating account with phone:", fakePhone);

        // 2. SIGN UP WITH SUPABASE (PHONE AUTH!)
        const { data: authData, error: authError } = await supabase.auth.signUp({
            phone: fakePhone,  // PHONE, not email!
            password: password,
            options: {
                data: {
                    username: username,
                    full_name: username
                }
            }
        });

        if (authError) {
            console.error("Auth error:", authError);
            if (authError.message.includes('already registered')) {
                showError('usernameError', 'Username already taken. Please choose another.');
            } else {
                throw authError;
            }
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            return;
        }

        console.log("✅ Auth created, user ID:", authData.user?.id);

        // 3. CREATE PROFILE
        await new Promise(resolve => setTimeout(resolve, 300));

        const { error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: authData.user.id,
                username: username,
                full_name: username,
                avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`,
                status: 'online',
                created_at: new Date().toISOString()
            });

        if (profileError) {
            console.error("Profile error:", profileError);
            throw profileError;
        }

        console.log("✅ Profile created for:", username);

        // 4. AUTO-LOGIN WITH PHONE
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            phone: fakePhone,  // PHONE, not email!
            password: password
        });

        if (signInError) {
            console.warn("Auto-login failed:", signInError);
            showSuccessAndRedirect(username, false);
        } else {
            console.log("✅ Auto-login successful");
            showSuccessAndRedirect(username, true);
        }

    } catch (error) {
        console.error("Signup error:", error);

        let errorMessage = 'Something went wrong. Please try again.';

        if (error.message.includes('already registered') || error.message.includes('already exists')) {
            errorMessage = 'Username already taken. Please choose another.';
            showError('usernameError', errorMessage);
        } else if (error.message.includes('password')) {
            errorMessage = 'Password too weak. Try a stronger one.';
            showError('passwordError', errorMessage);
        } else {
            alert('Error: ' + error.message);
        }

        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Show success and redirect
function showSuccessAndRedirect(username, autoLoggedIn = true) {
    // Hide form
    document.getElementById('signupForm').style.display = 'none';

    // Show success message
    const successContainer = document.getElementById('successContainer');
    successContainer.style.display = 'block';

    const message = autoLoggedIn 
        ? `Welcome to Luster, <strong style="color: white;">${username}</strong>!<br>Redirecting to home page...`
        : `Account created, <strong style="color: white;">${username}</strong>!<br>Please log in with your credentials.`;

    successContainer.innerHTML = `
        <div class="success-icon">✨</div>
        <h2 style="color: #28a745; margin-bottom: 15px;">${autoLoggedIn ? 'Account Created!' : 'Almost Done!'}</h2>
        <p style="color: #c0c0e0; margin-bottom: 10px;">
            ${message}
        </p>
        
        <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 15px; margin: 20px 0;">
            <p style="color: #a0a0c0; font-size: 0.9rem; margin-bottom: 8px;">
                🔐 Remember your password securely
            </p>
            <p style="color: #667eea; font-size: 0.9rem;">
                Username: <strong>${username}</strong><br>
                We cannot recover passwords if forgotten
            </p>
        </div>
        
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
        </div>
    `;

    // Start progress bar
    let progress = 0;
    const progressFill = document.getElementById('progressFill');
    const interval = setInterval(() => {
        progress += 2;
        if (progressFill) progressFill.style.width = progress + '%';

        if (progress >= 100) {
            clearInterval(interval);
            // Redirect
            if (autoLoggedIn) {
                window.location.href = '../home/index.html';
            } else {
                window.location.href = '../login/index.html';
            }
        }
    }, 30);
}

// Initialize auth page
async function initAuthPage() {
    console.log("✨ Luster Create Account Page Initialized");

    // Initialize Supabase
    const connected = await initSupabase();
    if (!connected) {
        alert("Cannot connect to server. Please try again later.");
        return;
    }

    // Check if user is already logged in
    const { data } = await supabase.auth.getSession();
    if (data.session) {
        // User is already logged in, redirect to home
        console.log("User already logged in, redirecting...");
        setTimeout(() => {
            window.location.href = '../home/index.html';
        }, 1000);
        return;
    }

    // Real-time validation
    document.getElementById('username').addEventListener('input', function() {
        validateUsername(this.value);
    });

    document.getElementById('password').addEventListener('input', function() {
        validatePassword(this.value);
    });

    document.getElementById('confirmPassword').addEventListener('input', function() {
        const password = document.getElementById('password').value;
        validateConfirmPassword(password, this.value);
    });
}

// Run when page loads
document.addEventListener('DOMContentLoaded', initAuthPage);

// ====== MAKE FUNCTIONS AVAILABLE TO HTML ======
window.showTerms = showTerms;
window.showPrivacy = showPrivacy;
window.closeModal = closeModal;
window.togglePassword = togglePassword;
window.handleSignup = handleSignup;