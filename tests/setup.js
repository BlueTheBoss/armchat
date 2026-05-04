document.body.innerHTML = `
    <div class="sidebar"></div>
    <ul id="user-list"></ul>
    <input type="text" id="search-users" />
    <button id="menu-toggle"></button>
    <h3 id="active-chat-title"></h3>
    <div id="active-chat-photo"></div>
    <div id="active-chat-status"></div>
    <div id="messages-container"></div>

    <div class="message-input-area">
        <form id="message-form">
            <input type="text" id="message-input" />
            <button id="send-btn"></button>
        </form>
    </div>

    <div id="typing-indicator"><span></span></div>
    <div id="context-menu"></div>
    <div id="reactions-overlay"></div>
    <button id="delete-for-me-btn"></button>
    <button id="delete-for-everyone-btn"></button>
    <button id="react-btn"></button>
    <button id="reply-btn"></button>
`;
