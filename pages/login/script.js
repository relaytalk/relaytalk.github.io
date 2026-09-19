// login/script.js - Complete version
console.log('✨ Login Page Loaded');

// ============================================================
// Supabase
// ============================================================
async function ensureSupabase() {
    console.log('⏳ Ensuring Supabase is loaded...');

    if (window.supabase) {
        console.log('✅ Supabase already loaded');
        return true;
    }

    try {
        const modulePath = '../../utils/supabase.js';
        await import(modulePath);

        let attempts = 0;
        while (!window.supabase && attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 150));
            attempts++;
        }

        if (window.supabase) {
            console.log('✅ Supabase loaded successfully');
            return true;
        } else {
            console.error('❌ Supabase failed to load');
            return false;
        }

    } catch (error) {
        console.error('❌ Error loading Supabase:', error);
        return false;
    }
}

// ============================================================
// Login
// ============================================================
async function loginUser(username, password) {
    try {
        if (!window.supabase?.auth) {
            throw new Error('Authentication service not ready');
        }

        const email = `${username}@luster.test`;
        console.log('Logging in with:', email);

        const { data, error } = await window.supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            console.error('Login error:', error.message);

            if (error.message.includes('Invalid login credentials')) {
                throw new Error('Invalid username or password');
            }

            throw new Error('Login failed. Please try again.');
        }

        console.log('✅ Login successful!');
        console.log('User:', data.user.email);

        // Verify session is saved
        await window.supabase.auth.getSession();

        return {
            success: true,
            user: data.user
        };

    } catch (error) {
        console.error('Login failed:', error);
        return {
            success: false,
            message: error.message
        };
    }
}

async function checkExistingLogin() {
    try {
        if (!window.supabase?.auth) return false;

        const { data } = await window.supabase.auth.getSession();
        const isLoggedIn = !!data?.session;

        console.log('Existing login check:', isLoggedIn ? 'Logged in' : 'Not logged in');

        return isLoggedIn;

    } catch (error) {
        console.error('Login check error:', error);
        return false;
    }
}

// ============================================================
// DOM
// ============================================================
const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const passwordToggle = document.getElementById('passwordToggle');
const usernameError = document.getElementById('usernameError');
const passwordError = document.getElementById('passwordError');
const loadingOverlay = document.getElementById('loadingOverlay');

// ============================================================
// Password toggle — SVGs
// ============================================================
const EYE_OPEN_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
    </svg>
`;

const EYE_OFF_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
`;

if (passwordToggle) {
    passwordToggle.innerHTML = EYE_OPEN_SVG;

    passwordToggle.addEventListener('click', function() {
        if (!loginPassword) return;
        if (loginPassword.type === 'password') {
            loginPassword.type = 'text';
            this.innerHTML = EYE_OFF_SVG;
        } else {
            loginPassword.type = 'password';
            this.innerHTML = EYE_OPEN_SVG;
        }
    });
}

// ============================================================
// Errors
// ============================================================
function showError(element, message) {
    if (!element) return;
    element.textContent = message;
    element.style.display = 'block';

    element.parentElement.classList.add('shake');
    setTimeout(() => {
        element.parentElement.classList.remove('shake');
    }, 500);
}

function hideError(element) {
    if (!element) return;
    element.style.display = 'none';
}

// ============================================================
// Validation — null-safe
// ============================================================
function validateForm() {
    let isValid = true;

    if (!loginUsername) {
        return false;
    }

    if (!loginUsername.value.trim()) {
        showError(usernameError, 'Please enter username');
        isValid = false;
    } else if (loginUsername.value.trim().length < 3) {
        showError(usernameError, 'Username must be at least 3 characters');
        isValid = false;
    } else {
        hideError(usernameError);
    }

    if (!loginPassword) {
        return false;
    }

    if (!loginPassword.value) {
        showError(passwordError, 'Please enter password');
        isValid = false;
    } else if (loginPassword.value.length < 6) {
        showError(passwordError, 'Password must be at least 6 characters');
        isValid = false;
    } else {
        hideError(passwordError);
    }

    return isValid;
}

// ============================================================
// Submit
// ============================================================
async function handleLogin(event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    if (!validateForm()) return;

    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) return;

    const originalText = loginBtn.textContent;
    loginBtn.textContent = 'Logging in...';
    loginBtn.disabled = true;

    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
    }

    try {
        const supabaseReady = await ensureSupabase();
        if (!supabaseReady) {
            showError(passwordError, 'Cannot connect to server');
            resetButton(loginBtn, originalText);
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            return;
        }

        const result = await loginUser(username, password);

        if (result.success) {
            console.log('✅ Login successful, redirecting to home...');

            const successMessage = document.getElementById('successMessage');
            if (successMessage) {
                successMessage.style.display = 'block';
                successMessage.innerHTML = `
                    <div class="success-block">
                        <svg class="success-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="8 12 11 15 16 9"/>
                        </svg>
                        <h3>Login Successful</h3>
                        <p>Redirecting to home page...</p>
                        <div class="progress-track">
                            <div class="progress-fill"></div>
                        </div>
                    </div>
                `;
            }

            setTimeout(() => {
                window.location.href = '../home/index.html';
            }, 1500);

        } else {
            showError(passwordError, result.message || 'Login failed');
            resetButton(loginBtn, originalText);
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }

    } catch (error) {
        console.error('Login handler error:', error);
        showError(passwordError, 'Something went wrong. Please try again.');
        resetButton(loginBtn, originalText);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

function resetButton(button, originalText) {
    button.textContent = originalText;
    button.disabled = false;
}

// ============================================================
// Init
// ============================================================
async function initLoginPage() {
    console.log('Initializing login page...');

    await ensureSupabase();

    const isLoggedIn = await checkExistingLogin();
    if (isLoggedIn) {
        console.log('✅ User already logged in, redirecting to home...');

        const successMessage = document.getElementById('successMessage');
        if (successMessage) {
            successMessage.style.display = 'block';
            successMessage.innerHTML = `
                <div class="success-block">
                    <svg class="success-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="8 12 11 15 16 9"/>
                    </svg>
                    <h3>Already Logged In</h3>
                    <p>Redirecting to home page...</p>
                </div>
            `;
        }

        setTimeout(() => {
            window.location.href = '../home/index.html';
        }, 1000);
        return;
    }

    console.log('User not logged in, showing login form');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    if (loginUsername) {
        loginUsername.addEventListener('input', function() {
            if (this.value.trim()) hideError(usernameError);
        });
    }

    if (loginPassword) {
        loginPassword.addEventListener('input', function() {
            if (this.value) hideError(passwordError);
        });
    }

    if (loginUsername) {
        setTimeout(() => loginUsername.focus(), 300);
    }

    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}

// ============================================================
// Global helpers
// ============================================================
window.togglePassword = function() {
    const passwordInput = document.getElementById('loginPassword');
    const toggleBtn = document.querySelector('#passwordToggle');

    if (passwordInput && toggleBtn) {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleBtn.innerHTML = EYE_OFF_SVG;
        } else {
            passwordInput.type = 'password';
            toggleBtn.innerHTML = EYE_OPEN_SVG;
        }
    }
};

window.handleLogin = handleLogin;

// ============================================================
// Boot — safe against late module load
// ============================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoginPage);
} else {
    initLoginPage();
}