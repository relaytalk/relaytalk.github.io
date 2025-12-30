// Auth page script - Clean and Simple
console.log("✨ Luster Auth Page Loaded");

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

// Generate personal link
function generatePersonalLink(username) {
    const randomId = Math.random().toString(36).substr(2, 8);
    return `luster.chat/${username.toLowerCase()}_${randomId}`;
}

// Create user account
async function createUserAccount(userData) {
    // Show loading
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Creating account...';
    submitBtn.disabled = true;
    
    // Simulate API call
    return new Promise(resolve => {
        setTimeout(() => {
            // Generate user ID
            const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Create user object
            const user = {
                id: userId,
                username: userData.username,
                profileLink: generatePersonalLink(userData.username),
                createdAt: new Date().toISOString(),
                friends: [],
                notifications: [],
                isActive: true
            };
            
            // Save to localStorage
            localStorage.setItem('luster_user', JSON.stringify(user));
            
            // Save to all users list
            const allUsers = JSON.parse(localStorage.getItem('luster_all_users') || '[]');
            allUsers.push({
                username: userData.username,
                userId: userId,
                profileLink: user.profileLink,
                joinedAt: user.createdAt
            });
            localStorage.setItem('luster_all_users', JSON.stringify(allUsers));
            
            // Reset button
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
            
            resolve({
                success: true,
                user: user,
                message: 'Account created successfully!'
            });
        }, 1500);
    });
}

// Handle form submission
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
    
    // Check if username already exists
    const existingUsers = JSON.parse(localStorage.getItem('luster_all_users') || '[]');
    const usernameExists = existingUsers.some(user => 
        user.username.toLowerCase() === username.toLowerCase()
    );
    
    if (usernameExists) {
        showError('usernameError', 'Username already taken');
        return;
    }
    
    // Create user data object
    const userData = {
        username: username,
        password: password
    };
    
    // Create account
    const result = await createUserAccount(userData);
    
    if (result.success) {
        // Show success message
        showSuccessMessage(result.user);
    }
}

// Show success message with user link
function showSuccessMessage(user) {
    // Hide form
    document.getElementById('signupForm').style.display = 'none';
    
    // Show success message
    const successHTML = `
        <div style="background: rgba(40, 167, 69, 0.1); border: 1px solid rgba(40, 167, 69, 0.3); border-radius: 20px; padding: 30px; text-align: center;">
            <h3 style="margin-bottom: 10px; color: #28a745; font-size: 1.5rem;">Account Created!</h3>
            <p style="color: #c0c0e0; margin-bottom: 20px;">Welcome to Luster, <strong style="color: white;">${user.username}</strong>!</p>
            
            <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 15px; padding: 20px; margin: 20px 0; word-break: break-all;">
                <strong style="color: #667eea; display: block; margin-bottom: 10px;">Your personal link:</strong>
                <span id="userLink" style="font-family: monospace; color: white; font-size: 1.1rem;">https://${user.profileLink}</span>
            </div>
            
            <button onclick="copyUserLink()" id="copyLinkBtn" style="background: rgba(102, 126, 234, 0.2); color: #667eea; border: 1px solid rgba(102, 126, 234, 0.4); padding: 12px 24px; border-radius: 12px; cursor: pointer; font-size: 1rem; transition: all 0.3s; margin: 10px 0;">
                Copy Link
            </button>
            
            <div style="margin-top: 25px; color: #a0a0c0; font-size: 0.9rem;">
                Share this link with friends to start chatting!
            </div>
        </div>
    `;
    
    document.querySelector('.auth-form').insertAdjacentHTML('afterend', successHTML);
}

// Copy user link to clipboard
function copyUserLink() {
    const linkText = document.getElementById('userLink').textContent;
    navigator.clipboard.writeText(linkText)
        .then(() => {
            const copyBtn = document.getElementById('copyLinkBtn');
            copyBtn.textContent = '✅ Copied!';
            copyBtn.style.background = 'rgba(40, 167, 69, 0.2)';
            copyBtn.style.color = '#28a745';
            copyBtn.style.borderColor = 'rgba(40, 167, 69, 0.4)';
            
            setTimeout(() => {
                copyBtn.textContent = 'Copy Link';
                copyBtn.style.background = 'rgba(102, 126, 234, 0.2)';
                copyBtn.style.color = '#667eea';
                copyBtn.style.borderColor = 'rgba(102, 126, 234, 0.4)';
            }, 2000);
        });
}

// Initialize auth page - SIMPLE VERSION
function initAuthPage() {
    console.log("Auth page ready");
    
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