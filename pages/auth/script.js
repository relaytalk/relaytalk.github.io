// ================================
// LUSTER SIGNUP – script.js (MODULE)
// ================================

// -------- Supabase Init --------
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = "https://blxtldgnssvasuinpyit.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJseHRsZGduc3N2YXN1aW5weWl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwODIxODIsImV4cCI6MjA4MjY1ODE4Mn0.Dv04IOAY76o2ccu5dzwK3fJjzo93BIoK6C2H3uWrlMw";

const supabase = createClient(supabaseUrl, supabaseKey);

// -------- Helpers --------
const $ = (id) => document.getElementById(id);

function showError(id, msg) {
  $(id).textContent = msg;
  $(id).style.display = "block";
}

function hideError(id) {
  $(id).style.display = "none";
}

// -------- Validation --------
function validateUsername(username) {
  if (username.length < 3) {
    showError("usernameError", "Username must be at least 3 characters");
    return false;
  }
  if (!/^[a-zA-Z0-9_.]+$/.test(username)) {
    showError("usernameError", "Only letters, numbers, _ and . allowed");
    return false;
  }
  hideError("usernameError");
  return true;
}

function validatePassword(password) {
  if (password.length < 6) {
    showError("passwordError", "Password must be at least 6 characters");
    return false;
  }
  hideError("passwordError");
  return true;
}

function validateConfirm(password, confirm) {
  if (password !== confirm) {
    showError("confirmError", "Passwords do not match");
    return false;
  }
  hideError("confirmError");
  return true;
}

// -------- Password Toggle --------
$("togglePassword").addEventListener("click", () => {
  const input = $("password");
  input.type = input.type === "password" ? "text" : "password";
});

// -------- Signup Handler --------
$("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = $("username").value.trim();
  const password = $("password").value;
  const confirm = $("confirmPassword").value;

  if (
    !validateUsername(username) ||
    !validatePassword(password) ||
    !validateConfirm(password, confirm)
  ) return;

  if (!$("terms").checked) {
    alert("Please accept Terms & Privacy Policy");
    return;
  }

  const btn = $("submitBtn");
  btn.disabled = true;
  btn.textContent = "Creating account...";

  try {
    const email = `${username}@example.com`;

    // 1️⃣ Create Auth User
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });

    if (error) throw error;

    // 2️⃣ Create Profile
    await supabase.from("profiles").insert({
      id: data.user.id,
      username,
      full_name: username,
      status: "online"
    });

    // 3️⃣ Auto Login
    await supabase.auth.signInWithPassword({ email, password });

    showSuccess(username);

  } catch (err) {
    alert(err.message);
    btn.disabled = false;
    btn.textContent = "Create Account";
  }
});

// -------- Success UI --------
function showSuccess(username) {
  $("signupForm").style.display = "none";

  $("successContainer").style.display = "block";
  $("successContainer").innerHTML = `
    <h2 style="color:#28a745">✨ Account Created!</h2>
    <p>Welcome <strong>${username}</strong></p>
    <p>Redirecting...</p>
  `;

  setTimeout(() => {
    window.location.href = "../home/index.html";
  }, 2000);
}

// -------- Already Logged In --------
const { data } = await supabase.auth.getSession();
if (data.session) {
  window.location.href = "../home/index.html";
}