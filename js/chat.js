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
    where,
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

let activeChatUserId = null;
let activeChatIsGroup = false;
let activeChatObj = null;
let typingObj = null;
let allUsers = [];
let allGroups = [];
let contextMessageId = null;
let typingTimeout = null;
let selectedUsersForGroup = new Set();

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
        const photoURL = user.photoURL || `https://ui-avatars.com/api/?name=${name}&background=random`;
        
        let statusDot = '';
        if (user.status === 'Online') {
            statusDot = '<span class="status-dot online" style="margin-left: 5px;"></span>';
        } else if (user.status === 'Away') {
            statusDot = '<span class="status-dot" style="background-color: #F59E0B; margin-left: 5px;"></span>';
        } else if (user.status === 'Do Not Disturb') {
            statusDot = '<span class="status-dot" style="background-color: #EF4444; margin-left: 5px;"></span>';
        }

        li.innerHTML = `
            <div class="photo-circle-small" style="background-image: url(${photoURL});"></div>
            <span class="user-name-text">${name}${statusDot}</span>
        `;
        
        li.addEventListener('click', () => selectUserChat(user));
        userList.appendChild(li);
    });
};

/**
 * User Search Filter
 */
searchUsers.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filteredUsers = allUsers.filter(user => (user.username || user.email).toLowerCase().includes(term));
    const filteredGroups = allGroups.filter(group => group.name.toLowerCase().includes(term));
    renderUserList(filteredUsers, filteredGroups);
});

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

                // Clear previous content to allow animation re-triggering nicely
                const span = typingIndicator.querySelector('span');
                span.textContent = ghostText
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

const renderMessage = (msg, msgId, currentUid, isGrouped) => {
    const isSent = msg.senderId === currentUid;
    
    // Identify sender for group chats
    let senderName = '';
    if (activeChatIsGroup && !isSent) {
        const senderInfo = allUsers.find(u => u.uid === msg.senderId);
        senderName = senderInfo ? (senderInfo.username || senderInfo.email.split('@')[0]) : 'Unknown';
    }

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
    
    if (senderName && !isGrouped) {
        const senderSpan = document.createElement('div');
        senderSpan.style.fontSize = '0.75rem';
        senderSpan.style.fontWeight = 'bold';
        senderSpan.style.marginBottom = '2px';
        senderSpan.style.opacity = '0.8';
        senderSpan.textContent = senderName;
        div.appendChild(senderSpan);
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

        if (msg.edited) {
            const editedSpan = document.createElement('span');
            editedSpan.style.fontSize = '0.7em';
            editedSpan.style.opacity = '0.6';
            editedSpan.style.marginLeft = '8px';
            editedSpan.style.fontStyle = 'italic';
            editedSpan.textContent = '(edited)';
            textContent.appendChild(editedSpan);
        }

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
        let timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Add Read Receipt indicator for sent messages
        if (isSent && !activeChatIsGroup) { // simplified read receipts for 1-on-1 only
            if (msg.read) {
                timeStr += ' ✓✓'; // Double check for read
            } else {
                timeStr += ' ✓';  // Single check for sent/delivered
            }
        }

        timeSpan.textContent = timeStr;
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
const updateHeaderStatus = (status) => {
    if (status === true || status === 'Online') {
        activeChatStatus.innerHTML = `<span class="status-dot online"></span> Online`;
    } else if (status === 'Away') {
        activeChatStatus.innerHTML = `<span class="status-dot" style="background-color: #F59E0B;"></span> Away`;
    } else if (status === 'Do Not Disturb') {
        activeChatStatus.innerHTML = `<span class="status-dot" style="background-color: #EF4444;"></span> Do Not Disturb`;
    } else {
        activeChatStatus.innerHTML = `<span class="status-dot offline"></span> Offline`;
    }
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
    editMsgBtn.classList.toggle('hidden', !isSent);
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
    const chatId = activeChatIsGroup ? activeChatUserId : getChatId(currentUser.uid, activeChatUserId);
    const collectionName = activeChatIsGroup ? "groups" : "chats";
    const msgRef = doc(db, collectionName, chatId, "messages", msgId);
    
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
            if (editingMessageId) {
                // Edit existing message
                const msgRef = doc(db, collectionName, chatId, "messages", editingMessageId);
                await updateDoc(msgRef, {
                    text: text,
                    edited: true,
                    editedAt: serverTimestamp()
                });
                editingMessageId = null;
                sendBtn.textContent = 'Send';
            } else {
                // Send new message
                await addDoc(collection(db, collectionName, chatId, "messages"), {
                    text: text,
                    type: 'text',
                    senderId: currentUid,
                    timestamp: serverTimestamp(),
                    hiddenFrom: []
                });
            }
        } catch (error) {
            console.error("Error sending/editing message: ", error);
        }
    };
};

