// =====================================================
// Placeholder login/session handling
//
// IMPORTANT: this is NOT real authentication. There is no
// password check, no server, and no database — anyone can
// type any name and pick any role. The session is stored
// only in this browser's own localStorage, so it does not
// exist on any other device and is not visible to anyone
// but this browser.
//
// This exists to establish the SHAPE of accounts (a name
// and a role attached to the current visit, shown in the
// header, gating a teacher-only link) so the rest of the
// site can be built against it now. Real authentication —
// verified passwords, a server, a database that survives
// clearing browser data — is separate, later work.
// =====================================================

const SESSION_KEY = 'meat-science-lab-session';

function getSession() {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch {
        return null;
    }
}

function setSession(name, role) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ name, role }));
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

// Fills in the #auth-status element in the header, present
// on every page. Called automatically below on page load.
function renderAuthStatus() {
    const container = document.getElementById('auth-status');
    if (!container) return;

    const session = getSession();

    if (!session) {
        container.innerHTML = `<a href="login.html" class="auth-link">Log in</a>`;
        return;
    }

    const dashboardLink = session.role === 'teacher'
        ? `<a href="teacher-dashboard.html" class="auth-link">Dashboard</a>`
        : '';

    container.innerHTML = `
        <span class="auth-name">${escapeHtml(session.name)} &middot; ${escapeHtml(session.role)}</span>
        ${dashboardLink}
        <a href="#" class="auth-link" id="logout-link">Log out</a>
    `;

    const logoutLink = document.getElementById('logout-link');
    if (logoutLink) {
        logoutLink.addEventListener('click', (event) => {
            event.preventDefault();
            clearSession();
            window.location.href = 'index.html';
        });
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Only allows a plain page name like "chromameter.html" as the place to
// return to after login. Anything else (full URLs, paths, odd characters)
// falls back to the home page, so the ?next= value in a link can never be
// used to send someone to another website.
function safeNextPage(value) {
    if (typeof value === 'string' && /^[A-Za-z0-9_-]+\.html$/.test(value)) {
        return value;
    }
    return 'index.html';
}

// A gentle, non-blocking notice on practical pages for visitors who are not
// logged in. Pages opt in with a data-login-prompt attribute on <main>.
// This does NOT restrict access — there is nothing real to protect yet.
function renderLoginPrompt() {
    const main = document.querySelector('main[data-login-prompt]');
    if (!main || getSession()) return;

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const notice = document.createElement('p');
    notice.className = 'login-prompt';
    notice.innerHTML = `You are not logged in. You can still practise, but nothing here is tied to your name. `
        + `<a href="login.html?next=${encodeURIComponent(safeNextPage(currentPage))}">Log in</a>`;

    const breadcrumb = main.querySelector('.session-breadcrumb');
    if (breadcrumb) {
        breadcrumb.insertAdjacentElement('afterend', notice);
    } else {
        main.prepend(notice);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    renderAuthStatus();
    renderLoginPrompt();
});
