// =====================================================
// Real authentication and data access, backed by Firebase.
//
// This replaces the earlier localStorage placeholder. Real email/
// password accounts are now checked by Firebase itself, not by
// this code. This file reacts to what Firebase reports and gives
// the rest of the site (plain, non-module scripts) a small public
// API via window.Auth, since they can't use `import` directly.
//
// SECURITY NOTE: signUp() below always creates new accounts as
// role: 'student'. There is no "sign up as teacher" option on
// purpose — a signup form can never safely be trusted to self-
// report a privileged role. Teacher accounts are promoted by
// hand in the Firebase console (see the project notes for how).
// The real enforcement of who can read what lives in
// firestore.rules, not in this file — this file only decides
// what the page displays.
// =====================================================

import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
    doc,
    setDoc,
    getDoc,
    collection,
    addDoc,
    getDocs,
    query,
    orderBy
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

// ---------- Account actions ----------

async function signUp(name, email, password) {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', credential.user.uid), {
        name,
        role: 'student', // see SECURITY NOTE above — always student at signup
        email,
        createdAt: new Date().toISOString()
    });
    return credential.user;
}

async function logIn(email, password) {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
}

async function logOut() {
    await signOut(auth);
}

async function getProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
}

// ---------- Saving and reading practical results ----------

// Saves one reading for the signed-in student. Does nothing (and
// does not throw) if nobody is signed in — practicals still work
// locally without an account; the reading just is not saved
// anywhere. Callers should not need to await this; it fails
// silently (logged to the console) so a network hiccup never
// breaks the on-page experience.
async function saveReading(practical, sampleId, data) {
    if (!auth.currentUser) return null;
    try {
        const profile = window.Auth.currentProfile;
        const ref = await addDoc(collection(db, 'readings'), {
            uid: auth.currentUser.uid,
            name: profile ? profile.name : '',
            practical,
            sampleId,
            data,
            createdAt: new Date().toISOString()
        });
        return ref.id;
    } catch (err) {
        console.error('Could not save reading:', err);
        return null;
    }
}

// For the teacher dashboard: every reading from every student,
// newest first. Firestore's own security rules — not this
// function — are what actually stop a non-teacher account from
// getting real data back; a student calling this will simply get
// a permission error from Firestore.
async function getAllReadings() {
    const snap = await getDocs(query(collection(db, 'readings'), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------- Header rendering ----------

function renderAuthStatus(user, profile) {
    const container = document.getElementById('auth-status');
    if (!container) return;

    if (!user || !profile) {
        container.innerHTML = `<a href="login.html" class="auth-link">Log in</a>`;
        return;
    }

    const dashboardLink = profile.role === 'teacher'
        ? `<a href="teacher-dashboard.html" class="auth-link">Dashboard</a>`
        : '';

    container.innerHTML = `
        <span class="auth-name">${escapeHtml(profile.name)} &middot; ${escapeHtml(profile.role)}</span>
        ${dashboardLink}
        <a href="#" class="auth-link" id="logout-link">Log out</a>
    `;

    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', async (event) => {
            event.preventDefault();
            await logOut();
            window.location.href = 'index.html';
        });
    }
}

// ---------- Logged-out prompt on practical pages ----------

// Only allows a plain page name like "chromameter.html" as the place to
// return to after login. Anything else falls back to the home page, so
// the ?next= value in a link can never be used to send someone elsewhere.
function safeNextPage(value) {
    if (typeof value === 'string' && /^[A-Za-z0-9_-]+\.html$/.test(value)) {
        return value;
    }
    return 'index.html';
}

function renderLoginPrompt(user) {
    const main = document.querySelector('main[data-login-prompt]');
    if (!main) return;

    const existing = document.querySelector('.login-prompt');
    if (user) {
        if (existing) existing.remove();
        return;
    }
    if (existing) return; // already shown, don't duplicate

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const notice = document.createElement('p');
    notice.className = 'login-prompt';
    notice.innerHTML = `You are not logged in. You can still practise, but nothing here is saved. `
        + `<a href="login.html?next=${encodeURIComponent(safeNextPage(currentPage))}">Log in</a>`;

    const breadcrumb = main.querySelector('.session-breadcrumb');
    if (breadcrumb) {
        breadcrumb.insertAdjacentElement('afterend', notice);
    } else {
        main.prepend(notice);
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ---------- Wire it all together ----------

window.Auth = {
    signUp,
    logIn,
    logOut,
    getProfile,
    saveReading,
    getAllReadings,
    safeNextPage,
    currentUser: null,
    currentProfile: null
};

onAuthStateChanged(auth, async (user) => {
    const profile = user ? await getProfile(user.uid) : null;
    window.Auth.currentUser = user;
    window.Auth.currentProfile = profile;

    renderAuthStatus(user, profile);
    renderLoginPrompt(user);

    // Lets any page react once we know the real sign-in state
    // (the teacher dashboard uses this to decide what to query).
    window.dispatchEvent(new CustomEvent('auth-ready', { detail: { user, profile } }));
});
