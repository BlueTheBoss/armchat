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
    deleteDoc,
    doc,
    setDoc,
    arrayUnion,
    increment,
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

// Edit Elements
const editMsgBtn = document.getElementById('edit-msg-btn');
let editingMessageId = null;

// Group Elements
const createGroupBtn = document.getElementById('create-group-btn');
const createGroupModal = document.getElementById('create-group-modal');
const groupNameInput = document.getElementById('group-name-input');
const groupUserSelectList = document.getElementById('group-user-select-list');
const confirmCreateGroupBtn = document.getElementById('confirm-create-group-btn');
const cancelCreateGroupBtn = document.getElementById('cancel-create-group-btn');

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
let activeChatIsGroup = false;
let activeChatObj = null;
let typingObj = null;
let allUsers = [];
let allGroups = [];
let contextMessageId = null;
let contextMessageText = null;
let replyingToId = null;
let replyingToText = null;
let typingTimeout = null;
let selectedUsersForGroup = new Set();

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
 * Load all registered users and groups
 */
export const loadUsers = (currentUid) => {
    const qUsers = query(collection(db, "users"));
    
    onSnapshot(qUsers, (snapshot) => {
        allUsers = snapshot.docs
            .map(doc => doc.data())
            .filter(user => user.uid !== currentUid);
        
        renderUserList();
    });

    const qGroups = query(collection(db, "groups"), where("members", "array-contains", currentUid));
    onSnapshot(qGroups, (snapshot) => {
        allGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderUserList();
    });
};

const renderUserList = (filteredUsers = null, filteredGroups = null) => {
    userList.innerHTML = '';
    
    const usersToRender = filteredUsers || allUsers;
    const groupsToRender = filteredGroups || allGroups;

    if(usersToRender.length === 0 && groupsToRender.length === 0) {
        userList.innerHTML = '<li style="padding: 15px; color: #666; font-size: 0.9em;">No users or groups found.</li>';
        return;
    }

    // Render Groups
    groupsToRender.forEach(group => {
        const li = document.createElement('li');
        li.className = `user-row ${activeChatUserId === group.id && activeChatIsGroup ? 'active' : ''}`;

        const name = group.name;
        const photoURL = `https://ui-avatars.com/api/?name=${name}&background=random`;

        li.innerHTML = `
            <div class="photo-circle-small" style="background-image: url(${photoURL});"></div>
            <span class="user-name-text">${name} (Group)</span>
        `;

        li.addEventListener('click', () => selectGroupChat(group));
        userList.appendChild(li);
    });

    // Render Users
    usersToRender.forEach(user => {
        const li = document.createElement('li');
        li.className = `user-row ${activeChatUserId === user.uid && !activeChatIsGroup ? 'active' : ''}`;
        
        const name = user.username || user.email.split('@')[0];
        const photoURL = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
        
        const photoDiv = document.createElement('div');
        photoDiv.className = 'photo-circle-small';
        photoDiv.style.backgroundImage = `url(${photoURL})`;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'user-name-text';
        nameSpan.textContent = name;

        li.appendChild(photoDiv);
        li.appendChild(nameSpan);
        
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
    activeChatIsGroup = false;
    const currentUser = getCurrentUser();
    
    // Update Header
    activeChatTitle.textContent = `Chatting with ${targetUser.username || targetUser.email.split('@')[0]}`;
    updateHeaderStatus(targetUser.status || 'Offline');
    
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
    
    renderUserList();

    if(currentUser) {
        listenForMessages(getChatId(currentUser.uid, targetUser.uid));
        listenForTyping(getChatId(currentUser.uid, targetUser.uid), targetUser.uid);
    }
};

/**
 * Select a group to chat with
 */
const selectGroupChat = (group) => {
    activeChatUserId = group.id;
    activeChatIsGroup = true;
    const currentUser = getCurrentUser();

    // Update Header
    activeChatTitle.textContent = `${group.name}`;
    updateHeaderStatus(true); // Groups are "always online" conceptually here

    const photoURL = `https://ui-avatars.com/api/?name=${group.name}&background=random`;
    activeChatPhoto.style.backgroundImage = `url(${photoURL})`;
    activeChatPhoto.classList.remove('hidden');

    // Enable input
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();

    renderUserList();
    
    if(currentUser) {
        listenForMessages(group.id);
        // Disable typing indicator for groups for simplicity, or implement group typing
        if (typingObj) {
            typingObj();
            typingObj = null;
        }
        typingIndicator.classList.add('hidden');
    }
};


/**
 * Typing Indicator Logic
 */
const listenForTyping = (chatId, targetUid) => {
    if (activeChatIsGroup) return; // Skip for groups for now
    if (typingObj) typingObj();
    
    typingObj = onSnapshot(doc(db, "typing", chatId), (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            const status = data[targetUid];
            const targetName = activeChatTitle.textContent.replace('Chatting with ', '');
            
            if (status) {
                typingIndicator.classList.remove('hidden');
                // Ghost Typing Logic: Show snippet of what they are typing
                const ghostText = typeof status === 'string' ? status.substring(0, 40) : '';

                const typingSpan = typingIndicator.querySelector('span');
                typingSpan.textContent = ''; // Clear previous

                const targetNameText = activeChatTitle.textContent.replace('Chatting with ', '');

                if (ghostText) {
                    typingSpan.appendChild(document.createTextNode(`${targetNameText} is writing: "${ghostText}"`));
                } else {
                    typingSpan.appendChild(document.createTextNode(`${targetNameText} is typing`));
                }

                // Animated dots
                [0.2, 0.4, 0.6].forEach(delay => {
                    const dot = document.createElement('span');
                    dot.textContent = '.';
                    dot.style.animation = `typing 1.4s infinite ${delay}s`;
                    typingSpan.appendChild(dot);
                });

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
    if (!currentUser || !activeChatUserId || activeChatIsGroup) return;
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
const listenForMessages = (chatId) => {
    if(activeChatObj) activeChatObj();
    const currentUid = getCurrentUser().uid;
    
    const messagesRef = collection(db, activeChatIsGroup ? "groups" : "chats", chatId, "messages");
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
            
            // Mark unread messages as read if they aren't from the current user
            if (!activeChatIsGroup && msg.senderId !== currentUid && !msg.read) {
                const msgRef = doc(db, "chats", chatId, "messages", msgId);
                updateDoc(msgRef, { read: true }).catch(console.error);
            }

            renderMessage(msg, msgId, currentUid, isGrouped);
            
            lastSenderId = msg.senderId;
            lastTimestamp = msg.timestamp ? msg.timestamp.toMillis() : Date.now();
        });
        
        scrollToBottom();
    });
};

const getSenderAccentClass = (msg, isSent) => {
    const sender = allUsers.find(u => u.uid === msg.senderId) || (isSent ? getCurrentUser() : null);
    if (sender && sender.accentColor) {
        return `accent-${sender.accentColor}`;
    }
    return '';
};

const createReplyPreview = (msg) => {
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
    return replyPreview;
};

const createMessageContent = (msg) => {
    if (msg.type === 'image') {
        const img = document.createElement('img');
        img.src = msg.url;
        img.className = 'message-image';
        img.onclick = () => window.open(msg.url, '_blank');
        return img;
    } else {
        const textContent = document.createElement('div');
        textContent.textContent = msg.text;

        if (msg.edited) {
            const editedSpan = document.createElement('span');
            editedSpan.style.fontSize = '0.7em';
            editedSpan.style.opacity = '0.6';
            editedSpan.style.marginLeft = '8px';
            editedSpan.style.fontStyle = 'italic';
            editedSpan.textContent = '(edited)';
            textContent.appendChild(editedSpan);
        }
        return textContent;
    }
};

const createReactionsContainer = (msg, msgId) => {
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
    return reactionsDiv;
};

const createTimeSpan = (msg, isSent) => {
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
    
    return timeSpan;
};

const renderMessage = (msg, msgId, currentUid, isGrouped) => {
    const isSent = msg.senderId === currentUid;

    const accentClass = getSenderAccentClass(msg, isSent);

    const div = document.createElement('div');
    div.className = `message ${isSent ? 'sent' : 'received'} ${isGrouped ? 'grouped' : ''} ${accentClass}`;
    div.dataset.id = msgId;

    // Right-click listener for context menu
    div.oncontextmenu = (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, msgId, isSent);
    };

    if (msg.replyToId && msg.replyToText) {
        div.appendChild(createReplyPreview(msg));
    }

    div.appendChild(createMessageContent(msg));

    if (msg.reactions) {
        div.appendChild(createReactionsContainer(msg, msgId));
    }

    div.appendChild(createTimeSpan(msg, isSent));

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
    activeChatStatus.textContent = '';
    const statusDot = document.createElement('span');
    statusDot.className = `status-dot ${isOnline ? 'online' : 'offline'}`;
    activeChatStatus.appendChild(statusDot);
    activeChatStatus.appendChild(document.createTextNode(isOnline ? ' Online' : ' Offline'));
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
    editMsgBtn.classList.toggle('hidden', !isSent);
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
        closeBtn.textContent = '×';
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
    const chatId = activeChatIsGroup ? activeChatUserId : getChatId(currentUser.uid, activeChatUserId);
    const collectionName = activeChatIsGroup ? "groups" : "chats";
    const msgRef = doc(db, collectionName, chatId, "messages", msgId);
    
    // In a real app, you'd track WHICH user reacted.
    // For this MVP, we'll increment/decrement a counter.
    // Optimizing using increment() to avoid extra getDoc() roundtrip.
    await updateDoc(msgRef, {
        [`reactions.${emoji}`]: increment(delta)
    });
};

document.querySelectorAll('.reaction-option').forEach(btn => {
    btn.onclick = () => addReaction(contextMessageId, btn.textContent);
});

deleteMeBtn.onclick = async () => {
    const currentUser = getCurrentUser();
    const chatId = activeChatIsGroup ? activeChatUserId : getChatId(currentUser.uid, activeChatUserId);
    const collectionName = activeChatIsGroup ? "groups" : "chats";
    const msgRef = doc(db, collectionName, chatId, "messages", contextMessageId);
    await updateDoc(msgRef, {
        hiddenFrom: arrayUnion(currentUser.uid)
    });
};

deleteEveryoneBtn.onclick = async () => {
    const currentUser = getCurrentUser();
    const chatId = activeChatIsGroup ? activeChatUserId : getChatId(currentUser.uid, activeChatUserId);
    const collectionName = activeChatIsGroup ? "groups" : "chats";
    const msgRef = doc(db, collectionName, chatId, "messages", contextMessageId);
    await deleteDoc(msgRef);
};

editMsgBtn.onclick = async () => {
    const currentUser = getCurrentUser();
    const chatId = activeChatIsGroup ? activeChatUserId : getChatId(currentUser.uid, activeChatUserId);
    const collectionName = activeChatIsGroup ? "groups" : "chats";
    const msgRef = doc(db, collectionName, chatId, "messages", contextMessageId);

    const msgDoc = await getDoc(msgRef);
    if (msgDoc.exists()) {
        const msgData = msgDoc.data();
        if (msgData.type === 'text') {
            messageInput.value = msgData.text;
            editingMessageId = contextMessageId;
            sendBtn.textContent = 'Save';
            messageInput.focus();
        }
    }
    contextMenu.classList.add('hidden');
};

/**
 * Create Group Modal Logic
 */
createGroupBtn.addEventListener('click', () => {
    createGroupModal.classList.remove('hidden-view');
    createGroupModal.classList.add('active-view');
    groupNameInput.value = '';
    selectedUsersForGroup.clear();

    // Populate users list for selection
    groupUserSelectList.innerHTML = '';
    allUsers.forEach(user => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.alignItems = 'center';
        li.style.gap = '10px';
        li.style.padding = '5px 0';
        li.style.cursor = 'pointer';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = user.uid;

        const name = user.username || user.email.split('@')[0];
        const span = document.createElement('span');
        span.textContent = name;
        span.style.color = 'var(--text-primary)';

        li.appendChild(checkbox);
        li.appendChild(span);

        li.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            if (checkbox.checked) {
                selectedUsersForGroup.add(user.uid);
            } else {
                selectedUsersForGroup.delete(user.uid);
            }
        });

        groupUserSelectList.appendChild(li);
    });
});

cancelCreateGroupBtn.addEventListener('click', () => {
    createGroupModal.classList.remove('active-view');
    createGroupModal.classList.add('hidden-view');
});

confirmCreateGroupBtn.addEventListener('click', async () => {
    const groupName = groupNameInput.value.trim();
    if (!groupName) {
        alert('Please enter a group name.');
        return;
    }
    if (selectedUsersForGroup.size === 0) {
        alert('Please select at least one user to add to the group.');
        return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const members = Array.from(selectedUsersForGroup);
    members.push(currentUser.uid); // Add creator

    try {
        await addDoc(collection(db, "groups"), {
            name: groupName,
            members: members,
            createdBy: currentUser.uid,
            createdAt: serverTimestamp()
        });
        createGroupModal.classList.remove('active-view');
        createGroupModal.classList.add('hidden-view');
    } catch (err) {
        console.error("Error creating group:", err);
        alert('Failed to create group.');
    }
});

/**
 * Setup Chat System
 */
export const setupChatSystem = (currentUid) => {
    messageForm.onsubmit = async (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        if(!text || !activeChatUserId) return;
        
        const chatId = activeChatIsGroup ? activeChatUserId : getChatId(currentUid, activeChatUserId);
        const collectionName = activeChatIsGroup ? "groups" : "chats";

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
            console.error("Error sending/editing message: ", error);
        }
    };
};

