/**
 * @jest-environment jsdom
 */

describe('app.js - switchView', () => {
    let switchView;

    beforeAll(async () => {
        // Set up the DOM before dynamic import
        document.body.innerHTML = `
            <!-- elements for switchView -->
            <div id="auth-view" class="view active-view"></div>
            <div id="chat-view" class="view hidden-view"></div>
            <div id="setup-view" class="view hidden-view"></div>

            <!-- elements needed by auth.js and app.js on load -->
            <input id="profile-photo-input" type="file" />
            <form id="setup-form"></form>
            <button id="signup-btn"></button>
            <button id="login-btn"></button>
            <button id="google-btn"></button>
            <button id="logout-btn"></button>

            <!-- app.js elements -->
            <div id="current-user-display"></div>
            <div id="messages-container"></div>
            <div id="my-profile-photo"></div>
            <button id="logo-button"></button>
            <div id="profile-menu"></div>
            <button id="change-photo-btn"></button>
            <input id="change-photo-input" type="file" />
            <select id="user-status-select"></select>

            <!-- auth.js additional elements -->
            <input id="email" />
            <input id="password" />
            <div id="auth-error"></div>
            <input id="username" />
            <div id="setup-photo-preview"></div>
        `;

        const appModule = await import('../js/app.js');
        switchView = appModule.switchView;
    });

    beforeEach(() => {
        // Reset view classes for each test
        const views = document.querySelectorAll('.view');
        views.forEach(view => {
            view.className = 'view hidden-view';
        });
        document.getElementById('auth-view').className = 'view active-view';
    });

    it('should hide all views and show the target view', () => {
        switchView('chat-view');

        const authView = document.getElementById('auth-view');
        const chatView = document.getElementById('chat-view');
        const setupView = document.getElementById('setup-view');

        expect(authView.classList.contains('hidden-view')).toBe(true);
        expect(authView.classList.contains('active-view')).toBe(false);

        expect(chatView.classList.contains('active-view')).toBe(true);
        expect(chatView.classList.contains('hidden-view')).toBe(false);

        expect(setupView.classList.contains('hidden-view')).toBe(true);
    });

    it('should throw an error for invalid viewId due to null target', () => {
        expect(() => {
            switchView('invalid-view');
        }).toThrow(TypeError);
    });
});
