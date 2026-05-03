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

let activeChatUserId = null;
let activeChatObj = null;
let typingObj = null;
let allUsers = [];
let contextMessageId = null;
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
        userList.appendChild(li);
    });
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
 * Message Form Handler
 */
messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    const currentUser = getCurrentUser();
    
    if (!text || !activeChatUserId || !currentUser) return;
    
    messageInput.value = '';
    messageInput.focus();

    try {
        await addDoc(collection(db, "chats", getChatId(currentUser.uid, activeChatUserId), "messages"), {
            senderId: currentUser.uid,
            text: text,
            type: 'text',
            timestamp: serverTimestamp()
        });
    } catch (err) {
        console.error(err);
        alert('Failed to send message');
    }
});

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
                typingIndicator.querySelector('span').textContent = ghostText 
                    ? `${targetName} is writing: "${ghostText}..."` 
                    : `${targetName} is typing...`;
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
    
    if (msg.timestamp) {
        const date = msg.timestamp.toDate();
        timeSpan.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        timeSpan.textContent = "Sending...";
    }
    
    div.appendChild(timeSpan);
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
    contextMenu.classList.remove('hidden');
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    
    deleteEveryoneBtn.classList.toggle('hidden', !isSent);
    reactionsOverlay.classList.add('hidden');
};

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
            await addDoc(collection(db, "chats", chatId, "messages"), {
                text: text,
                senderId: currentUid,
                timestamp: serverTimestamp(),
                hiddenFrom: []
            });
        } catch (error) {
            console.error("Error sending message: ", error);
        }
    };
};

