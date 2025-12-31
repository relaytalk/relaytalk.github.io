// Login Page Script - UPDATED FOR SUPABASE
import { auth } from '../../utils/auth.js'

console.log("✨ Luster Login Page Loaded (Supabase Version)");

// DOM Elements
const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const passwordToggle = document.getElementById('passwordToggle');
const loginBtn = document.getElementById('loginBtn');
const successMessage = document.getElementById('successMessage');
const loadingOverlay = document.getElementById('loadingOverlay');
const usernameError = document.getElementById('usernameError');
const passwordError = document.getElementById('passwordError');

// Toggle password visibility
if (passwordToggle) {
    passwordToggle.addEventListener('click', function() {
        if (loginPassword.type === 'password') {
            loginPassword.type = 'text';
            this.textContent = '🙈';
            this.title = 'Hide password';
        } else {
            loginPassword.type = 'password';
            this.textContent = '👁️';
            this.title = 'Show password';
        }
    });
}

// Show error message
function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
    element.classList.add('shake');
    setTimeout(() => element.classList.remove('shake'), 500);
}

// Hide error message
function hideError(element) {
    element.style.display = 'none';
}

// Show loading overlay
function showLoading() {
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
}

// Hide loading overlay
function hideLoading() {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
}

// Validate login inputs
function validateLogin() {
    let isValid = true;

    // Validate username
    if (!loginUsername.value.trim() || loginUsername.value.length < 3) {
        showError(usernameError, 'Username must be at least 3 characters');
        isValid = false;
    } else {
        hideError(usernameError);
    }

    // Validate password
    if (!loginPassword.value || loginPassword.value.length < 6) {
        showError(passwordError, 'Password must be at least 6 characters');
        isValid = false;
    } else {
        hideError(passwordError);
    }

    return isValid;
}

// Handle form submission with SUPABASE
async function handleLogin(event) {
    event.preventDefault();

    // Validate inputs
    if (!validateLogin()) {
        return;
    }

    const username = loginUsername.value.trim();
    const password = loginPassword.value;

    showLoading();

    try {
        // Use Supabase auth
        const result = await auth.signIn(username, password);

        if (result.success) {
            // Show success
            showLoginSuccess(result.user.user_metadata.username || username);
        } else {
            showError(passwordError, result.message || 'Login failed');
            hideLoading();
        }

    } catch (error) {
        console.error('Login error:', error);
        showError(passwordError, error.message || 'Something went wrong');
        hideLoading();
    }
}

// Show login success and redirect
function showLoginSuccess(username) {
    // Hide form
    if (loginForm) loginForm.style.display = 'none';

    // Show success message
    if (successMessage) {
        successMessage.style.display = 'block';
        successMessage.innerHTML = `
            <h3 style="color: #28a745; margin-bottom: 10px;">✅ Login Successful!</h3>
            <p style="color: #c0c0c0; margin-bottom: 15px;">
                Welcome back, <strong style="color: white;">${username}</strong>!
            </p>
            <p style="color: #a0a0c0; font-size: 0.9rem;">
                Redirecting to home page...
            </p>
            <div class="redirect-progress">
                <div class="redirect-progress-fill" id="redirectProgress"></div>
            </div>
        `;

        // Start progress bar and redirect
        let progress = 0;
        const progressFill = document.getElementById('redirectProgress');
        const interval = setInterval(() => {
            progress += 2;
            if (progressFill) progressFill.style.width = progress + '%';

            if (progress >= 100) {
                clearInterval(interval);
                window.location.href = '../home/index.html';
            }
        }, 30);
    } else {
        // Fallback: direct redirect
        setTimeout(() => {
            window.location.href = '../home/index.html';
        }, 1000);
    }
}

// Initialize login page
async function initLoginPage() {
    console.log("✨ Luster Login Page Initialized with Supabase");

    // Check if user is already logged in
    const { success } = await auth.getCurrentUser();
    if (success) {
        // User is already logged in, redirect to home
        setTimeout(() => {
            window.location.href = '../home/index.html';
        }, 1000);
        return;
    }

    // Event listeners
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Real-time validation
    if (loginUsername) {
        loginUsername.addEventListener('input', function() {
            if (this.value.trim()) {
                hideError(usernameError);
            }
        });
    }

    if (loginPassword) {
        loginPassword.addEventListener('input', function() {
            if (this.value) {
                hideError(passwordError);
            }
        });
    }
    
    // Setup any other event listeners for buttons
    setupButtonListeners();
}

// Setup button event listeners
function setupButtonListeners() {
    // If you have other buttons in your login page HTML
    // Add their event listeners here
    
    // Example: Forgot password button
    const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    if (forgotPasswordBtn) {
        forgotPasswordBtn.addEventListener('click', function() {
            alert("Password reset feature coming soon!");
        });
    }
    
    // Example: Signup link button
    const signupLinkBtn = document.getElementById('signupLinkBtn');
    if (signupLinkBtn) {
        signupLinkBtn.addEventListener('click', function() {
            window.location.href = '../auth/index.html';
        });
    }
}

// ====== MAKE FUNCTIONS AVAILABLE TO HTML ======
// If your HTML uses onclick="functionName()", add them here

// Toggle password function (for HTML onclick)
window.togglePassword = function() {
    const passwordInput = document.getElementById('loginPassword');
    const toggleBtn = document.querySelector('#passwordToggle');
    
    if (passwordInput && toggleBtn) {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggleBtn.textContent = '🙈';
            toggleBtn.title = 'Hide password';
        } else {
            passwordInput.type = 'password';
            toggleBtn.textContent = '👁️';
            toggleBtn.title = 'Show password';
        }
    }
};

// Modal functions (if your login page has modals)
window.showTerms = function() {
    alert("Terms & Conditions modal would open here");
};

window.showPrivacy = function() {
    alert("Privacy Policy modal would open here");
};

window.closeModal = function() {
    // Close any open modals
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.style.display = 'none';
    });
};

// Make handleLogin available if HTML form uses onsubmit
window.handleLogin = handleLogin;

// Run when page loads
document.addEventListener('DOMContentLoaded', initLoginPage);