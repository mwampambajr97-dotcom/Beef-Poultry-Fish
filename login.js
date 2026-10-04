// =====================================================
// Login form handler
// Sets a name + role via auth.js's setSession(), then
// returns to the home page. See auth.js for the important
// note on why this is not real authentication.
// =====================================================

const loginForm = document.getElementById('login-form');
const nameInput = document.getElementById('login-name');

loginForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();
    if (!name) return;

    const role = document.querySelector('input[name="role"]:checked').value;

    setSession(name, role);

    // Return to the page the visitor came from, if a valid one was passed.
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.href = safeNextPage(next);
});
