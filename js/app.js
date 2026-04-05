// DOM Elements
const authView = document.getElementById('auth-view');
const chatView = document.getElementById('chat-view');
const currentUserDisplay = document.getElementById('current-user-display');
const messagesContainer = document.getElementById('messages-container');

/**
 * Switch between application views
 * @param {string} viewId 'auth-view' or 'chat-view'
 */
export const switchView = (viewId) => {
    if (viewId === 'auth-view') {
        authView.classList.replace('hidden-view', 'active-view');
        chatView.classList.replace('active-view', 'hidden-view');
    } else {
        authView.classList.replace('active-view', 'hidden-view');
        chatView.classList.replace('hidden-view', 'active-view');
    }
};

/**
 * Display the current logged in user's email in the sidebar
 */
export const updateCurrentUserDisplay = (email) => {
    currentUserDisplay.textContent = `Logged in as: ${email}`;
};

/**
 * Scroll the chat area to the bottom
 */
export const scrollToBottom = () => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
};
