// =====================================================
// Login / signup / password-reset form handler.
// Talks to Firebase through window.Auth (set up by auth.js).
// Three modes share one form: 'login', 'signup', 'reset'.
// =====================================================

const loginForm = document.getElementById('login-form');
const nameField = document.getElementById('name-field');
const nameInput = document.getElementById('login-name');
const inviteField = document.getElementById('invite-field');
const inviteInput = document.getElementById('login-invite');
const emailInput = document.getElementById('login-email');
const passwordField = document.getElementById('password-field');
const passwordInput = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');
const heading = document.getElementById('login-heading');
const lede = document.getElementById('login-lede');
const signupNote = document.getElementById('signup-note');
const errorBox = document.getElementById('form-error');
const successBox = document.getElementById('form-success');
const forgotLink = document.getElementById('forgot-link');
const backLink = document.getElementById('back-to-login');

const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');

// After a reset email is sent, the button stays locked this long so it
// cannot be hammered (Firebase rate-limits reset emails anyway).
const RESET_COOLDOWN_MS = 30000;

let mode = 'login'; // 'login' | 'signup' | 'reset'
let cooldownTimer = null;

const BUTTON_LABEL = { login: 'Log In', signup: 'Sign Up', reset: 'Send reset email' };

function setMode(newMode) {
    mode = newMode;
    const isSignup = mode === 'signup';
    const isReset = mode === 'reset';

    tabLogin.classList.toggle('active', mode === 'login');
    tabSignup.classList.toggle('active', isSignup);

    nameField.hidden = !isSignup;
    inviteField.hidden = !isSignup;
    signupNote.hidden = !isSignup;
    nameInput.required = isSignup;

    // A hidden field that is still "required" makes the browser silently
    // refuse to submit the form, so reset mode must switch the password
    // requirement off, not just hide the field.
    passwordField.hidden = isReset;
    passwordInput.required = !isReset;
    passwordInput.minLength = isReset ? 0 : 6;

    forgotLink.hidden = mode !== 'login';
    backLink.hidden = !isReset;

    heading.textContent = isReset ? 'Reset Password' : isSignup ? 'Sign Up' : 'Log In';
    lede.textContent = isReset
        ? 'Enter your email and we will send you a link to choose a new password.'
        : isSignup
            ? 'Create an account to save your results as you practise.'
            : 'Enter your email and password to continue.';

    // Leaving a mode clears any pending cooldown and old messages.
    clearTimeout(cooldownTimer);
    loginBtn.disabled = false;
    loginBtn.textContent = BUTTON_LABEL[mode];
    errorBox.hidden = true;
    successBox.hidden = true;
}

tabLogin.addEventListener('click', () => setMode('login'));
tabSignup.addEventListener('click', () => setMode('signup'));
forgotLink.addEventListener('click', () => setMode('reset'));
backLink.addEventListener('click', () => setMode('login'));

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    successBox.hidden = true;

    const email = emailInput.value.trim();

    if (mode === 'reset') {
        await handleReset(email);
        return;
    }

    const password = passwordInput.value;

    loginBtn.disabled = true;
    loginBtn.textContent = mode === 'signup' ? 'Signing up…' : 'Logging in…';

    try {
        if (mode === 'signup') {
            const name = nameInput.value.trim();
            if (!name) throw new Error('Enter your name.');
            await window.Auth.signUp(name, email, password, inviteInput.value);
        } else {
            await window.Auth.logIn(email, password);
        }

        const next = new URLSearchParams(window.location.search).get('next');
        window.location.href = window.Auth.safeNextPage(next);
    } catch (err) {
        errorBox.textContent = describeError(err);
        errorBox.hidden = false;
        loginBtn.disabled = false;
        loginBtn.textContent = BUTTON_LABEL[mode];
    }
});

async function handleReset(email) {
    loginBtn.disabled = true;
    loginBtn.textContent = 'Sending…';

    try {
        await window.Auth.resetPassword(email);
        showResetSent();
    } catch (err) {
        // Older Firebase projects report "no such user". Showing that would let
        // anyone discover which emails have accounts, so it is treated exactly
        // like success: the message never says whether the address was found.
        if (err && err.code === 'auth/user-not-found') {
            showResetSent();
            return;
        }
        errorBox.textContent = describeError(err);
        errorBox.hidden = false;
        loginBtn.disabled = false;
        loginBtn.textContent = BUTTON_LABEL.reset;
    }
}

function showResetSent() {
    successBox.textContent = 'If an account exists for that email, a reset link is on its way. '
        + 'Check your inbox and your spam folder, then come back here to log in.';
    successBox.hidden = false;

    loginBtn.disabled = true;
    loginBtn.textContent = 'Email sent';
    clearTimeout(cooldownTimer);
    cooldownTimer = setTimeout(() => {
        loginBtn.disabled = false;
        loginBtn.textContent = BUTTON_LABEL.reset;
    }, RESET_COOLDOWN_MS);
}

// Turns Firebase's error codes into plain, student-readable messages
// instead of showing raw technical error text.
function describeError(err) {
    const code = err && err.code;
    switch (code) {
        case 'invalid-invite-code':
            return 'That teacher invite code is not valid. Check it and try again, or leave it blank to register as a student.';
        case 'auth/email-already-in-use':
            return 'An account with that email already exists. Try logging in instead.';
        case 'auth/invalid-email':
        case 'auth/missing-email':
            return 'That email address doesn\u2019t look right.';
        case 'auth/weak-password':
            return 'Password must be at least 6 characters.';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'Email or password is incorrect.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please wait a moment and try again.';
        case 'auth/network-request-failed':
            return 'Could not reach the server. Check your internet connection and try again.';
        default:
            return err && err.message ? err.message : 'Something went wrong. Please try again.';
    }
}
