// =====================================================
// Login / signup form handler.
// Talks to Firebase through window.Auth (set up by auth.js).
// =====================================================

const loginForm = document.getElementById('login-form');
const nameField = document.getElementById('name-field');
const nameInput = document.getElementById('login-name');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');
const heading = document.getElementById('login-heading');
const lede = document.getElementById('login-lede');
const signupNote = document.getElementById('signup-note');
const errorBox = document.getElementById('form-error');

const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');

let mode = 'login'; // or 'signup'

function setMode(newMode) {
    mode = newMode;
    const isSignup = mode === 'signup';

    tabLogin.classList.toggle('active', !isSignup);
    tabSignup.classList.toggle('active', isSignup);

    nameField.hidden = !isSignup;
    nameInput.required = isSignup;
    signupNote.hidden = !isSignup;

    heading.textContent = isSignup ? 'Sign Up' : 'Log In';
    lede.textContent = isSignup
        ? 'Create an account to save your results as you practise.'
        : 'Enter your email and password to continue.';
    loginBtn.textContent = isSignup ? 'Sign Up' : 'Log In';

    errorBox.hidden = true;
}

tabLogin.addEventListener('click', () => setMode('login'));
tabSignup.addEventListener('click', () => setMode('signup'));

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    loginBtn.disabled = true;
    loginBtn.textContent = mode === 'signup' ? 'Signing up…' : 'Logging in…';

    try {
        if (mode === 'signup') {
            const name = nameInput.value.trim();
            if (!name) throw new Error('Enter your name.');
            await window.Auth.signUp(name, email, password);
        } else {
            await window.Auth.logIn(email, password);
        }

        const next = new URLSearchParams(window.location.search).get('next');
        window.location.href = window.Auth.safeNextPage(next);
    } catch (err) {
        errorBox.textContent = describeError(err);
        errorBox.hidden = false;
        loginBtn.disabled = false;
        loginBtn.textContent = mode === 'signup' ? 'Sign Up' : 'Log In';
    }
});

// Turns Firebase's error codes into plain, student-readable messages
// instead of showing raw technical error text.
function describeError(err) {
    const code = err && err.code;
    switch (code) {
        case 'auth/email-already-in-use':
            return 'An account with that email already exists. Try logging in instead.';
        case 'auth/invalid-email':
            return 'That email address doesn\u2019t look right.';
        case 'auth/weak-password':
            return 'Password must be at least 6 characters.';
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            return 'Email or password is incorrect.';
        case 'auth/too-many-requests':
            return 'Too many attempts. Please wait a moment and try again.';
        default:
            return err && err.message ? err.message : 'Something went wrong. Please try again.';
    }
}
