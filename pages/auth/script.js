// auth/script.js - COMPLETE FIXED VERSION (NO DUPLICATE PROFILE ERROR)

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

window.onclick = function(event) {
    const termsModal = document.getElementById('termsModal');
    const privacyModal = document.getElementById('privacyModal');
    if (event.target === termsModal) termsModal.style.display = 'none';
    if (event.target === privacyModal) privacyModal.style.display = 'none';
};

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') closeModal();
});

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

function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function hideError(elementId) {
    const errorEl = document.getElementById(elementId);
    errorEl.style.display = 'none';
}

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

function validatePassword(password) {
    if (password.length < 6) {
        showError('passwordError', 'Password must be at least 6 characters');
        return false;
    }
    hideError('passwordError');
    return true;
}

function validateConfirmPassword(password, confirmPassword) {
    if (password !== confirmPassword) {
        showError('confirmError', 'Passwords do not match');
        return false;
    }
    hideError('confirmError');
    return true;
}

// Supabase initialization
async function initAuthSupabase() {
    console.log('🔄 Initializing Supabase for auth page...');
    
    try {
        // Load from relative path
        const modulePath = '../../utils/supabase.js';
        await import(modulePath);
        
        // Wait for window.supabase to be available
        let attempts = 0;
        while (!window.supabase && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (window.supabase) {
            console.log('✅ Supabase ready for auth page');
            return true;
        } else {
            console.error('❌ Supabase failed to load');
            return false;
        }
    } catch (error) {
        console.error('❌ Supabase import error:', error);
        return false;
    }
}

// Handle form submission - FIXED: No manual profile insert (trigger handles it)
async function handleSignup(event) {
    event.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    const isUsernameValid = validateUsername(username);
    const isPasswordValid = validatePassword(password);
    const isConfirmValid = validateConfirmPassword(password, confirmPassword);

    if (!isUsernameValid || !isPasswordValid || !isConfirmValid) return;
    if (!document.getElementById('terms').checked) {
        alert('Please agree to Terms & Conditions');
        return;
    }

    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;

    try {
        // Initialize Supabase first
        const supabaseReady = await initAuthSupabase();
        if (!supabaseReady) {
            throw new Error('Cannot connect to server');
        }

        if (!window.supabase?.auth) {
            throw new Error('Authentication service not available');
        }

        const internalEmail = `${username}@luster.test`;
        console.log('Creating account with email:', internalEmail);

        // 1. Sign up - THE TRIGGER WILL AUTOMATICALLY CREATE THE PROFILE
        const { data: authData, error: authError } = await window.supabase.auth.signUp({
            email: internalEmail,
            password: password,
            options: { 
                data: { 
                    username: username, 
                    full_name: username 
                } 
            }
        });

        if (authError) {
            console.error('Auth error:', authError);
            if (authError.message.includes('already registered')) {
                showError('usernameError', 'Username already taken');
            } else {
                throw authError;
            }
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            return;
        }

        console.log('✅ Auth created, user ID:', authData.user?.id);
        
        // ⚠️ IMPORTANT: No manual profile insert needed!
        // The database trigger "handle_new_user" automatically creates the profile
        // Manual insert would cause duplicate key error
        
        console.log('✅ Profile will be auto-created by database trigger');

        // 2. Auto-login
        const { data: signInData, error: signInError } = await window.supabase.auth.signInWithPassword({
            email: internalEmail,
            password: password
        });

        if (signInError) {
            console.warn('Auto-login failed:', signInError);
            showSuccessAndRedirect(username, false);
        } else {
            console.log('✅ Auto-login successful');
            showSuccessAndRedirect(username, true);
        }

    } catch (error) {
        console.error('Signup error:', error);
        let errorMessage = 'Something went wrong. Please try again.';
        
        if (error.message.includes('already registered') || error.message.includes('already exists')) {
            errorMessage = 'Username already taken. Please choose another.';
            showError('usernameError', errorMessage);
        } else if (error.message.includes('password')) {
            errorMessage = 'Password too weak. Try a stronger one.';
            showError('passwordError', errorMessage);
        } else {
            // Don't show alert for 409 conflict (it's handled by the trigger)
            if (!error.message.includes('duplicate key')) {
                alert('Error: ' + error.message);
            }
        }
        
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

function showSuccessAndRedirect(username, autoLoggedIn = true) {
    document.getElementById('signupForm').style.display = 'none';
    const successContainer = document.getElementById('successContainer');
    successContainer.style.display = 'block';

    const message = autoLoggedIn 
        ? `Welcome to Luster, <strong style="color: white;">${username}</strong>!<br>Redirecting to home page...`
        : `Account created, <strong style="color: white;">${username}</strong>!<br>Please log in with your credentials.`;

    successContainer.innerHTML = `
        <div class="success-icon">✨</div>
        <h2 style="color: #28a745; margin-bottom: 15px;">${autoLoggedIn ? 'Account Created!' : 'Almost Done!'}</h2>
        <p style="color: #c0c0e0; margin-bottom: 10px;">${message}</p>
        <div style="background: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 15px; margin: 20px 0;">
            <p style="color: #a0a0c0; font-size: 0.9rem; margin-bottom: 8px;">🔐 Remember your password securely</p>
            <p style="color: #667eea; font-size: 0.9rem;">
                Username: <strong>${username}</strong><br>
                We cannot recover passwords if forgotten
            </p>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
        </div>
    `;

    let progress = 0;
    const progressFill = document.getElementById('progressFill');
    const interval = setInterval(() => {
        progress += 2;
        if (progressFill) progressFill.style.width = progress + '%';
        if (progress >= 100) {
            clearInterval(interval);
            if (autoLoggedIn) {
                window.location.href = '../home/index.html';
            } else {
                window.location.href = '../login/index.html';
            }
        }
    }, 30);
}

async function initAuthPage() {
    console.log('✨ Luster Create Account Page Initialized');
    
    const connected = await initAuthSupabase();
    if (!connected) {
        alert('Cannot connect to server. Please try again later.');
        return;
    }
    
    if (window.supabase) {
        const { data } = await window.supabase.auth.getSession();
        if (data.session) {
            console.log('User already logged in, redirecting...');
            setTimeout(() => {
                window.location.href = '../home/index.html';
            }, 1000);
            return;
        }
    }
    
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

document.addEventListener('DOMContentLoaded', initAuthPage);

window.showTerms = showTerms;
window.showPrivacy = showPrivacy;
window.closeModal = closeModal;
window.togglePassword = togglePassword;
window.handleSignup = handleSignup;
