import { db } from './firebase-config.js';
import { getCurrentUser } from './auth.js';
import { scrollToBottom } from './app.js';
import { 
    collection, 
    query, 
    onSnapshot, 
    orderBy, 
    addDoc, 
    updateDoc,
    getDoc,
    deleteDoc,
    doc,
    setDoc,
    arrayUnion,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elements
const userList = document.getElementById('user-list');
const sidebar = document.querySelector('.sidebar');
const menuToggle = document.getElementById('menu-toggle');
const activeChatTitle = document.getElementById('active-chat-title');
const activeChatPhoto = document.getElementById('active-chat-photo');
const activeChatStatus = document.getElementById('active-chat-status');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const searchUsers = document.getElementById('search-users');
const typingIndicator = document.getElementById('typing-indicator');

// Sidebar toggle for mobile
if (menuToggle) {
    menuToggle.onclick = (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('open');
    };
}
document.addEventListener('click', () => {
    if (window.innerWidth < 768) sidebar.classList.remove('open');
});
if (sidebar) sidebar.onclick = (e) => e.stopPropagation();

// Context Menu Elements
const contextMenu = document.getElementById('context-menu');
const reactionsOverlay = document.getElementById('reactions-overlay');
const deleteMeBtn = document.getElementById('delete-for-me-btn');
const deleteEveryoneBtn = document.getElementById('delete-for-everyone-btn');
const reactOptionBtn = document.getElementById('react-btn');

// Context Menu Elements (Reply button now in HTML)
const replyBtn = document.getElementById('reply-btn');

let activeChatUserId = null;
let activeChatObj = null;
let typingObj = null;
let allUsers = [];
let contextMessageId = null;
let contextMessageText = null;
let replyingToId = null;
let replyingToText = null;
let typingTimeout = null;

// Debounce helper
const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

// Helper to create a consistent Chat ID for 1-on-1 chats
const getChatId = (uid1, uid2) => {
    return [uid1, uid2].sort().join('_');
};

/**
 * Load all registered users
 */
export const loadUsers = (currentUid) => {
    const q = query(collection(db, "users"));
    
    onSnapshot(q, (snapshot) => {
        allUsers = snapshot.docs
            .map(doc => doc.data())
            .filter(user => user.uid !== currentUid);
        
        renderUserList(allUsers);
    });
};

const renderUserList = (users) => {
    userList.innerHTML = '';
    
    if(users.length === 0) {
        userList.innerHTML = '<li style="padding: 15px; color: #666; font-size: 0.9em;">No users found.</li>';
        return;
    }

    const fragment = document.createDocumentFragment();

    users.forEach(user => {
        const li = document.createElement('li');
        li.className = `user-row ${activeChatUserId === user.uid ? 'active' : ''}`;
        
        const name = user.username || user.email.split('@')[0];
        const photoURL = user.photoURL || `https://ui-avatars.com/api/?name=${name}&background=random`;
        
        li.innerHTML = `
            <div class="photo-circle-small" style="background-image: url(${photoURL});"></div>
            <span class="user-name-text">${name}</span>
        `;
        
        li.addEventListener('click', () => selectUserChat(user));
        fragment.appendChild(li);
    });

    userList.appendChild(fragment);
};

/**
 * User Search Filter
 */
searchUsers.addEventListener('input', debounce((e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allUsers.filter(user => (user.username || user.email).toLowerCase().includes(term));
    renderUserList(filtered);
}, 300));

/**
 * Select a user to chat with
 */
const selectUserChat = (targetUser) => {
    activeChatUserId = targetUser.uid;
    const currentUser = getCurrentUser();
    
    // Update Header
    activeChatTitle.textContent = `Chatting with ${targetUser.username || targetUser.email.split('@')[0]}`;
    updateHeaderStatus(true);
    
    if (targetUser.photoURL) {
        activeChatPhoto.style.backgroundImage = `url(${targetUser.photoURL})`;
        activeChatPhoto.classList.remove('hidden');
    } else {
        activeChatPhoto.classList.add('hidden');
    }
    
    // Enable input
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
    
    renderUserList(allUsers);
    
    if(currentUser) {
        listenForMessages(currentUser.uid, targetUser.uid);
        listenForTyping(currentUser.uid, targetUser.uid);
    }
};


/**
 * Typing Indicator Logic
 */
const listenForTyping = (currentUid, targetUid) => {
    if (typingObj) typingObj();
    const chatId = getChatId(currentUid, targetUid);
    
    typingObj = onSnapshot(doc(db, "typing", chatId), (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const status = data[targetUid];
            const targetName = activeChatTitle.textContent.replace('Chatting with ', '');
            
            if (status) {
                typingIndicator.classList.remove('hidden');
                // Ghost Typing Logic: Show snippet of what they are typing
                const ghostText = typeof status === 'string' ? status.substring(0, 40) : '';

                // Animated dots
                const typingDots = `<span style="animation: typing 1.4s infinite 0.2s;">.</span><span style="animation: typing 1.4s infinite 0.4s;">.</span><span style="animation: typing 1.4s infinite 0.6s;">.</span>`;

                // Escape text to prevent XSS
                const escapeHTML = (str) => {
                    return str.replace(/[&<>'"]/g,
                        tag => ({
                            '&': '&amp;',
                            '<': '&lt;',
                            '>': '&gt;',
                            "'": '&#39;',
                            '"': '&quot;'
                        }[tag] || tag)
                    );
                };
                const safeGhostText = escapeHTML(ghostText);

                typingIndicator.querySelector('span').innerHTML = safeGhostText
                    ? `${escapeHTML(targetName)} is writing: "${safeGhostText}${typingDots}"`
                    : `${escapeHTML(targetName)} is typing${typingDots}`;

                // Ensure dynamic keyframes exist
                if (!document.getElementById('typing-keyframes')) {
                    const style = document.createElement('style');
                    style.id = 'typing-keyframes';
                    style.innerHTML = `@keyframes typing { 0%, 100% { opacity: 0.2; } 20% { opacity: 1; } }`;
                    document.head.appendChild(style);
                }
            } else {
                typingIndicator.classList.add('hidden');
            }
        }
    });
};

const setTypingStatus = async (status) => {
    const currentUser = getCurrentUser();
    if (!currentUser || !activeChatUserId) return;
    const chatId = getChatId(currentUser.uid, activeChatUserId);
    
    // Ghost Typing: send the actual text if status is true-ish
    const value = status ? (messageInput.value || true) : false;
    
    await setDoc(doc(db, "typing", chatId), {
        [currentUser.uid]: value
    }, { merge: true });
};

messageInput.addEventListener('input', () => {
    setTypingStatus(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => setTypingStatus(false), 3000);
});

/**
 * Listen for messages
 */
const listenForMessages = (currentUid, targetUid) => {
    if(activeChatObj) activeChatObj();
    
    const chatId = getChatId(currentUid, targetUid);
    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));
    
    activeChatObj = onSnapshot(q, (snapshot) => {
        messagesContainer.innerHTML = '';
        
        let lastSenderId = null;
        let lastTimestamp = 0;

        snapshot.forEach((doc) => {
            const msg = doc.data();
            const msgId = doc.id;

            // Filter out "Delete for me" messages
            if (msg.hiddenFrom && msg.hiddenFrom.includes(currentUid)) return;

            // Grouping logic (same sender within 5 mins)
            const isGrouped = lastSenderId === msg.senderId && (msg.timestamp ? (msg.timestamp.toMillis() - lastTimestamp < 300000) : true);
            
            renderMessage(msg, msgId, currentUid, isGrouped);
            
            lastSenderId = msg.senderId;
            lastTimestamp = msg.timestamp ? msg.timestamp.toMillis() : Date.now();
        });
        
        scrollToBottom();
    });
};

const renderMessage = (msg, msgId, currentUid, isGrouped) => {
    const isSent = msg.senderId === currentUid;
    
    // Signature Fog Lookup
    let accentClass = '';
    const sender = allUsers.find(u => u.uid === msg.senderId) || (isSent ? getCurrentUser() : null);
    if (sender && sender.accentColor) {
        accentClass = `accent-${sender.accentColor}`;
    }

    const div = document.createElement('div');
    div.className = `message ${isSent ? 'sent' : 'received'} ${isGrouped ? 'grouped' : ''} ${accentClass}`;
    div.dataset.id = msgId;

    // Right-click listener for context menu
    div.oncontextmenu = (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, msgId, isSent);
    };
    
    // Reply Preview
    if (msg.replyToId && msg.replyToText) {
        const replyPreview = document.createElement('div');
        replyPreview.className = 'reply-preview';
        replyPreview.textContent = msg.replyToText;

        // Scroll to replied message on click
        replyPreview.style.cursor = 'pointer';
        replyPreview.onclick = () => {
            const targetMsg = document.querySelector(`.message[data-id="${msg.replyToId}"]`);
            if (targetMsg) {
                targetMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetMsg.style.transition = 'transform 0.3s, box-shadow 0.3s';
                targetMsg.style.transform = 'scale(1.05)';
                targetMsg.style.boxShadow = '0 0 15px var(--border-box)';
                setTimeout(() => {
                    targetMsg.style.transform = '';
                    targetMsg.style.boxShadow = '3.5px 3.5px 0px var(--border-box)';
                }, 1000);
            }
        };
        div.appendChild(replyPreview);
    }

    if (msg.type === 'image') {
        const img = document.createElement('img');
        img.src = msg.url;
        img.className = 'message-image';
        img.onclick = () => window.open(msg.url, '_blank');
        div.appendChild(img);
    } else {
        const textContent = document.createElement('div');
        textContent.textContent = msg.text;
        div.appendChild(textContent);
    }
    
    // Render Reactions
    if (msg.reactions) {
        const reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'reactions-container';
        Object.entries(msg.reactions).forEach(([emoji, count]) => {
            if (count > 0) {
                const span = document.createElement('span');
                span.className = 'reaction-pill';
                span.textContent = `${emoji} ${count}`;
                span.onclick = (e) => {
                    e.stopPropagation();
                    addReaction(msgId, emoji, -1); // Simple toggle off
                };
                reactionsDiv.appendChild(span);
            }
        });
        div.appendChild(reactionsDiv);
    }

    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    timeSpan.style.display = 'flex';
    timeSpan.style.alignItems = 'center';
    timeSpan.style.justifyContent = 'flex-end';
    timeSpan.style.gap = '4px';
    
    if (msg.timestamp) {
        const date = msg.timestamp.toDate();
        timeSpan.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (isSent) {
            // Read receipt indicator (Simulated Delivered)
            const receipt = document.createElement('span');
            receipt.innerHTML = '&#10003;&#10003;'; // double checkmark
            receipt.style.fontSize = '0.7rem';
            receipt.style.color = '#fff';
            receipt.style.opacity = '0.8';
            timeSpan.appendChild(receipt);
        }
    } else {
        timeSpan.textContent = "Sending...";
        if (isSent) {
            const receipt = document.createElement('span');
            receipt.innerHTML = '&#10003;'; // single checkmark
            receipt.style.fontSize = '0.7rem';
            receipt.style.color = '#fff';
            receipt.style.opacity = '0.5';
            timeSpan.appendChild(receipt);
        }
    }
    
    div.appendChild(timeSpan);

    // Double click to reply
    div.addEventListener('dblclick', () => {
        handleReply(msgId, msg.text);
    });

    messagesContainer.appendChild(div);
};

/**
 * UI: Smart Menu Positioning
 */
const smartPosition = (element, x, y) => {
    element.classList.remove('hidden'); // Show first to get dimensions
    const padding = 10;
    const { offsetWidth: menuWidth, offsetHeight: menuHeight } = element;
    const { innerWidth: windowWidth, innerHeight: windowHeight } = window;

    let finalX = x;
    let finalY = y;

    if (x + menuWidth > windowWidth - padding) finalX = windowWidth - menuWidth - padding;
    if (y + menuHeight > windowHeight - padding) finalY = windowHeight - menuHeight - padding;
    if (finalX < padding) finalX = padding;
    if (finalY < padding) finalY = padding;

    element.style.left = `${finalX}px`;
    element.style.top = `${finalY}px`;
};

/**
 * Update Header Status (2D Flat)
 */
const updateHeaderStatus = (isOnline) => {
    activeChatStatus.innerHTML = `<span class="status-dot ${isOnline ? 'online' : 'offline'}"></span> ${isOnline ? 'Online' : 'Offline'}`;
};

/**
 * Context Menu Logic
 */
const showContextMenu = (x, y, msgId, isSent) => {
    contextMessageId = msgId;

    // Find the message text for replying
    const msgElement = document.querySelector(`.message[data-id="${msgId}"]`);
    contextMessageText = msgElement ? msgElement.querySelector('div:not(.reply-preview):not(.reactions-container)').textContent : 'Message';

    contextMenu.classList.remove('hidden');

    // Use smart positioning
    smartPosition(contextMenu, x, y);
    
    deleteEveryoneBtn.classList.toggle('hidden', !isSent);
    reactionsOverlay.classList.add('hidden');
};

const handleReply = (msgId, text) => {
    replyingToId = msgId;
    replyingToText = text;

    // Show UI indicator above input
    let previewBox = document.getElementById('reply-preview-box');
    if (!previewBox) {
        previewBox = document.createElement('div');
        previewBox.id = 'reply-preview-box';
        previewBox.style.padding = '8px 15px';
        previewBox.style.backgroundColor = 'var(--bg-card)';
        previewBox.style.borderTop = '2px solid var(--border-sidebar)';
        previewBox.style.borderLeft = '2px solid var(--border-sidebar)';
        previewBox.style.borderRight = '2px solid var(--border-sidebar)';
        previewBox.style.borderTopLeftRadius = '16px';
        previewBox.style.borderTopRightRadius = '16px';
        previewBox.style.fontSize = '0.85rem';
        previewBox.style.display = 'flex';
        previewBox.style.justifyContent = 'space-between';
        previewBox.style.alignItems = 'center';

        const textSpan = document.createElement('span');
        textSpan.id = 'reply-preview-text';
        textSpan.style.opacity = '0.8';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.style.marginRight = '10px';
        previewBox.appendChild(textSpan);

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.fontSize = '1.2rem';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.color = 'var(--text-primary)';
        closeBtn.onclick = () => {
            replyingToId = null;
            replyingToText = null;
            previewBox.remove();
        };
        previewBox.appendChild(closeBtn);

        // Insert right above message input area
        const inputArea = document.querySelector('.message-input-area');
        inputArea.parentNode.insertBefore(previewBox, inputArea);
    }

    document.getElementById('reply-preview-text').textContent = `Replying to: ${text}`;
    messageInput.focus();
};

replyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    contextMenu.classList.add('hidden');
    handleReply(contextMessageId, contextMessageText);
});

document.addEventListener('click', () => {
    contextMenu.classList.add('hidden');
    reactionsOverlay.classList.add('hidden');
});

reactOptionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    reactionsOverlay.classList.remove('hidden');
    reactionsOverlay.style.left = contextMenu.style.left;
    reactionsOverlay.style.top = contextMenu.style.top;
    contextMenu.classList.add('hidden');
});

const addReaction = async (msgId, emoji, delta = 1) => {
    const currentUser = getCurrentUser();
    if (!currentUser || !activeChatUserId) return;
    const chatId = getChatId(currentUser.uid, activeChatUserId);
    const msgRef = doc(db, "chats", chatId, "messages", msgId);
    
    // In a real app, you'd track WHICH user reacted.
    // For this MVP, we'll increment/decrement a counter.
    const msgDoc = await getDoc(msgRef);
    const reactions = msgDoc.data().reactions || {};
    reactions[emoji] = (reactions[emoji] || 0) + delta;
    if (reactions[emoji] < 0) reactions[emoji] = 0;

    await updateDoc(msgRef, { reactions });
};

document.querySelectorAll('.reaction-option').forEach(btn => {
    btn.onclick = () => addReaction(contextMessageId, btn.textContent);
});

deleteMeBtn.onclick = async () => {
    const currentUser = getCurrentUser();
    const chatId = getChatId(currentUser.uid, activeChatUserId);
    const msgRef = doc(db, "chats", chatId, "messages", contextMessageId);
    await updateDoc(msgRef, {
        hiddenFrom: arrayUnion(currentUser.uid)
    });
};

deleteEveryoneBtn.onclick = async () => {
    const currentUser = getCurrentUser();
    const chatId = getChatId(currentUser.uid, activeChatUserId);
    const msgRef = doc(db, "chats", chatId, "messages", contextMessageId);
    await deleteDoc(msgRef);
};

/**
 * Setup Chat System
 */
export const setupChatSystem = (currentUid) => {
    messageForm.onsubmit = async (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        if(!text || !activeChatUserId) return;
        
        const chatId = getChatId(currentUid, activeChatUserId);
        messageInput.value = '';
        setTypingStatus(false);
        
        try {
            const msgData = {
                text: text,
                senderId: currentUid,
                timestamp: serverTimestamp(),
                hiddenFrom: []
            };

            if (replyingToId) {
                msgData.replyToId = replyingToId;
                msgData.replyToText = replyingToText;

                replyingToId = null;
                replyingToText = null;
                const existingPreview = document.getElementById('reply-preview-box');
                if (existingPreview) existingPreview.remove();
            }

            await addDoc(collection(db, "chats", chatId, "messages"), msgData);
        } catch (error) {
            console.error("Error sending message: ", error);
        }
    };
};

