// auth/script.js — Complete version

// ============================================================
// Modal functions
// ============================================================
function showTerms() {
    const modal = document.getElementById('termsModal');
    if (modal) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('visible'));
    }
}

function showPrivacy() {
    const modal = document.getElementById('privacyModal');
    if (modal) {
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('visible'));
    }
}

function closeModal() {
    ['termsModal', 'privacyModal'].forEach(id => {
        const m = document.getElementById(id);
        if (!m) return;
        m.classList.remove('visible');
        setTimeout(() => { m.style.display = 'none'; }, 200);
    });
}

// Close modal on overlay click (event-delegated; does not clobber other handlers)
document.addEventListener('click', function(event) {
    const termsModal = document.getElementById('termsModal');
    const privacyModal = document.getElementById('privacyModal');
    if (event.target === termsModal) closeModal();
    if (event.target === privacyModal) closeModal();
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') closeModal();
});

// ============================================================
// Password toggle — inline SVGs
// ============================================================
const AUTH_EYE_OPEN_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
    </svg>
`;

const AUTH_EYE_OFF_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
`;

function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleBtn = document.querySelector('.password-toggle');
    if (!passwordInput || !toggleBtn) return;

    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    toggleBtn.innerHTML = isHidden ? AUTH_EYE_OFF_SVG : AUTH_EYE_OPEN_SVG;
}

// ============================================================
// Error helpers
// ============================================================
function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function hideError(elementId) {
    const errorEl = document.getElementById(elementId);
    if (!errorEl) return;
    errorEl.style.display = 'none';
}

// ============================================================
// Validation
// ============================================================
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

// ============================================================
// Supabase initialization
// ============================================================
async function initAuthSupabase() {
    console.log('🔄 Initializing Supabase for auth page...');

    try {
        const modulePath = '../../utils/supabase.js';
        await import(modulePath);

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

// ============================================================
// Handle form submission
// ============================================================
async function handleSignup(event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const confirmEl = document.getElementById('confirmPassword');
    const termsEl = document.getElementById('terms');

    if (!usernameEl || !passwordEl || !confirmEl) return;

    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    const confirmPassword = confirmEl.value;

    const isUsernameValid = validateUsername(username);
    const isPasswordValid = validatePassword(password);
    const isConfirmValid = validateConfirmPassword(password, confirmPassword);

    if (!isUsernameValid || !isPasswordValid || !isConfirmValid) return;

    if (!termsEl || !termsEl.checked) {
        showError('termsError', 'Please agree to Terms & Conditions to continue');
        if (termsEl) {
            const wrap = termsEl.closest('.terms-checkbox');
            if (wrap) {
                wrap.classList.add('shake');
                setTimeout(() => wrap.classList.remove('shake'), 500);
            }
        }
        return;
    }
    hideError('termsError');

    const submitBtn = document.getElementById('submitBtn');
    if (!submitBtn) return;

    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;

    try {
        const supabaseReady = await initAuthSupabase();
        if (!supabaseReady) {
            throw new Error('Cannot connect to server');
        }

        if (!window.supabase?.auth) {
            throw new Error('Authentication service not available');
        }

        const internalEmail = `${username}@luster.test`;
        console.log('Creating account with email:', internalEmail);

        // 1. Sign up — SQL trigger should create the profile automatically
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

        // 2. Auto-login
        const { error: signInError } = await window.supabase.auth.signInWithPassword({
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

        if (error.message.includes('already registered') || error.message.includes('already exists')) {
            showError('usernameError', 'Username already taken. Please choose another.');
        } else if (error.message.includes('password')) {
            showError('passwordError', 'Password too weak. Try a stronger one.');
        } else if (!error.message.includes('duplicate key')) {
            showError('passwordError', 'Something went wrong. Please try again.');
        }

        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// ============================================================
// Success + redirect
// ============================================================
function showSuccessAndRedirect(username, autoLoggedIn = true) {
    const form = document.getElementById('signupForm');
    const successContainer = document.getElementById('successContainer');
    if (form) form.style.display = 'none';
    if (!successContainer) return;
    successContainer.style.display = 'block';

    const message = autoLoggedIn
        ? `Welcome to RelayTalk, <strong>${username}</strong>!<br>Redirecting to home page…`
        : `Account created, <strong>${username}</strong>!<br>Please log in with your credentials.`;

    successContainer.innerHTML = `
        <div class="success-icon">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="8 12 11 15 16 9"/>
            </svg>
        </div>
        <h2>${autoLoggedIn ? 'Account Created' : 'Almost Done'}</h2>
        <p>${message}</p>
        <div style="background: var(--bg-sub); padding: 14px 16px; border-radius: 12px; margin: 18px 0; border: 1px solid var(--border-soft); text-align: left;">
            <p style="color: var(--text-2); font-size: 0.85rem; margin-bottom: 6px;">Remember your password securely</p>
            <p style="color: var(--primary); font-size: 0.88rem; font-weight: 500; margin: 0;">
                Username: <strong>${username}</strong><br>
                <span style="color: var(--text-2); font-weight: 400;">We cannot recover passwords if forgotten</span>
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

// ============================================================
// Init
// ============================================================
async function initAuthPage() {
    console.log('✨ RelayTalk Create Account Page Initialized');

    // Bind form submit — no more inline onsubmit
    const form = document.getElementById('signupForm');
    if (form) {
        form.addEventListener('submit', handleSignup);
    }

    const connected = await initAuthSupabase();
    if (!connected) {
        showError('usernameError', 'Cannot connect to server. Please try again later.');
        return;
    }

    if (window.supabase) {
        const { data } = await window.supabase.auth.getSession();
        if (data && data.session) {
            console.log('User already logged in, redirecting...');
            setTimeout(() => {
                window.location.href = '../home/index.html';
            }, 1000);
            return;
        }
    }

    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const confirmEl = document.getElementById('confirmPassword');
    const termsEl = document.getElementById('terms');

    if (usernameEl) {
        usernameEl.addEventListener('input', function() {
            validateUsername(this.value);
        });
    }

    if (passwordEl) {
        passwordEl.addEventListener('input', function() {
            validatePassword(this.value);
        });
    }

    if (confirmEl) {
        confirmEl.addEventListener('input', function() {
            const password = passwordEl ? passwordEl.value : '';
            validateConfirmPassword(password, this.value);
        });
    }

    if (termsEl) {
        termsEl.addEventListener('change', function() {
            if (this.checked) hideError('termsError');
        });
    }
}

// ============================================================
// Exports + boot
// ============================================================
window.showTerms = showTerms;
window.showPrivacy = showPrivacy;
window.closeModal = closeModal;
window.togglePassword = togglePassword;
window.handleSignup = handleSignup;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthPage);
} else {
    initAuthPage();
}