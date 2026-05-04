import { db } from './firebase-config.js';
import { getCurrentUser, scrollToBottom } from './app.js';
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
    getDoc,
    where,
    arrayUnion,
    increment,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Helper to get elements safely
const getEl = (id) => document.getElementById(id);

// State
let activeChatUserId = null;
let activeChatIsGroup = false;
let activeChatObj = null;
let typingObj = null;
let allUsers = [];
let allUsersMap = new Map();
let allGroups = [];
let contextMessageId = null;
let contextMessageText = null;
let replyingToId = null;
let replyingToText = null;
let typingTimeout = null;
let editingMessageId = null;
let selectedUsersForGroup = new Set();

/**
 * Initialization (runs immediately in module)
 */
const initSidebarHandlers = () => {
    const menuToggle = getEl('menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (menuToggle && sidebar) {
        menuToggle.onclick = (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        };
        document.addEventListener('click', () => {
            if (window.innerWidth < 768) sidebar.classList.remove('open');
        });
        sidebar.onclick = (e) => e.stopPropagation();
    }
};
initSidebarHandlers();

/**
 * Load Users & Groups
 */
export const loadUsers = (currentUid) => {
    const qUsers = query(collection(db, "users"));
    onSnapshot(qUsers, (snapshot) => {
        const usersData = snapshot.docs.map(doc => doc.data());
        allUsersMap = new Map(usersData.map(u => [u.uid, u]));
        allUsers = usersData.filter(user => user.uid !== currentUid);
        renderUserList();
    });

    const qGroups = query(collection(db, "groups"), where("members", "array-contains", currentUid));
    onSnapshot(qGroups, (snapshot) => {
        allGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderUserList();
    });
};

const renderUserList = (filteredUsers = null, filteredGroups = null) => {
    const userList = getEl('user-list');
    if (!userList) return;
    
    userList.innerHTML = '';
    const usersToRender = filteredUsers || allUsers;
    const groupsToRender = filteredGroups || allGroups;

    if(usersToRender.length === 0 && groupsToRender.length === 0) {
        userList.innerHTML = '<li style="padding: 15px; color: #666; font-size: 0.9em;">No users found.</li>';
        return;
    }

    groupsToRender.forEach(group => {
        const li = document.createElement('li');
        li.className = `user-row ${activeChatUserId === group.id && activeChatIsGroup ? 'active' : ''}`;
        li.innerHTML = `
            <div class="photo-circle-small" style="background-image: url(https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=random);"></div>
            <span class="user-name-text">${group.name} (Group)</span>
        `;
        li.onclick = () => selectGroupChat(group);
        userList.appendChild(li);
    });

    usersToRender.forEach(user => {
        const li = document.createElement('li');
        li.className = `user-row ${activeChatUserId === user.uid && !activeChatIsGroup ? 'active' : ''}`;
        const name = user.username || user.email.split('@')[0];
        const photo = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
        li.innerHTML = `
            <div class="photo-circle-small" style="background-image: url(${photo});"></div>
            <span class="user-name-text">${name}</span>
        `;
        li.onclick = () => selectUserChat(user);
        userList.appendChild(li);
    });
};

/**
 * Chat Selection
 */
const selectUserChat = (targetUser) => {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    activeChatUserId = targetUser.uid;
    activeChatIsGroup = false;

    getEl('active-chat-title').textContent = `Chatting with ${targetUser.username || targetUser.email.split('@')[0]}`;
    updateHeaderStatus(targetUser.status || 'Offline');
    
    const photoEl = getEl('active-chat-photo');
    if (targetUser.photoURL) {
        photoEl.style.backgroundImage = `url(${targetUser.photoURL})`;
        photoEl.classList.remove('hidden');
    } else {
        photoEl.classList.add('hidden');
    }
    
    const input = getEl('message-input');
    const sendBtn = getEl('send-btn');
    if (input) { input.disabled = false; input.focus(); }
    if (sendBtn) sendBtn.disabled = false;
    
    renderUserList();
    listenForMessages(getChatId(currentUser.uid, targetUser.uid));
    listenForTyping(getChatId(currentUser.uid, targetUser.uid), targetUser.uid);
};

const selectGroupChat = (group) => {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    activeChatUserId = group.id;
    activeChatIsGroup = true;

    getEl('active-chat-title').textContent = group.name;
    updateHeaderStatus(true);
    
    const photoEl = getEl('active-chat-photo');
    photoEl.style.backgroundImage = `url(https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=random)`;
    photoEl.classList.remove('hidden');

    const input = getEl('message-input');
    const sendBtn = getEl('send-btn');
    if (input) { input.disabled = false; input.focus(); }
    if (sendBtn) sendBtn.disabled = false;

    renderUserList();
    listenForMessages(group.id);
    if (typingObj) { typingObj(); typingObj = null; }
    getEl('typing-indicator').classList.add('hidden');
};

/**
 * Message Listening
 */
const listenForMessages = (chatId) => {
    if (activeChatObj) activeChatObj();
    const user = getCurrentUser();
    if (!user) return;

    const messagesRef = collection(db, activeChatIsGroup ? "groups" : "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));
    
    activeChatObj = onSnapshot(q, (snapshot) => {
        const container = getEl('messages-container');
        if (!container) return;
        container.innerHTML = '';
        
        let lastSenderId = null;
        let lastTimestamp = 0;
        const fragment = document.createDocumentFragment();

        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            const msgId = docSnap.id;

            if (msg.hiddenFrom && msg.hiddenFrom.includes(user.uid)) return;

            const isGrouped = lastSenderId === msg.senderId && (msg.timestamp ? (msg.timestamp.toMillis() - lastTimestamp < 300000) : true);
            
            if (!activeChatIsGroup && msg.senderId !== user.uid && !msg.read) {
                updateDoc(doc(db, "chats", chatId, "messages", msgId), { read: true }).catch(() => {});
            }

            renderMessage(msg, msgId, user.uid, isGrouped, fragment);
            lastSenderId = msg.senderId;
            lastTimestamp = msg.timestamp ? msg.timestamp.toMillis() : Date.now();
        });
        
        container.appendChild(fragment);
        scrollToBottom();
    });
};

/**
 * Message Rendering
 */
const renderMessage = (msg, msgId, currentUid, isGrouped, container) => {
    const isSent = msg.senderId === currentUid;
    const sender = allUsersMap.get(msg.senderId) || (isSent ? getCurrentUser() : null);
    const accentClass = (sender && sender.accentColor) ? `accent-${sender.accentColor}` : '';

    const div = document.createElement('div');
    div.className = `message ${isSent ? 'sent' : 'received'} ${isGrouped ? 'grouped' : ''} ${accentClass}`;
    div.dataset.id = msgId;

    div.oncontextmenu = (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, msgId, isSent, msg.text);
    };

    if (msg.replyToId && msg.replyToText) {
        const reply = document.createElement('div');
        reply.className = 'reply-preview';
        reply.textContent = msg.replyToText;
        div.appendChild(reply);
    }

    const content = document.createElement('div');
    content.textContent = msg.text;
    if (msg.edited) {
        const span = document.createElement('span');
        span.className = 'edited-tag';
        span.textContent = ' (edited)';
        content.appendChild(span);
    }
    div.appendChild(content);

    const time = document.createElement('span');
    time.className = 'message-time';
    if (msg.timestamp) {
        time.textContent = msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        time.textContent = 'Sending...';
    }
    div.appendChild(time);

    container.appendChild(div);
};

/**
 * Context Menu
 */
const showContextMenu = (x, y, msgId, isSent, text) => {
    const menu = getEl('context-menu');
    if (!menu) return;
    contextMessageId = msgId;
    contextMessageText = text;

    menu.classList.remove('hidden');
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    
    getEl('delete-for-everyone-btn').classList.toggle('hidden', !isSent);
    getEl('edit-msg-btn').classList.toggle('hidden', !isSent);
};

/**
 * Typing Status
 */
const setTypingStatus = async (isTyping) => {
    const user = getCurrentUser();
    if (!user || !activeChatUserId || activeChatIsGroup) return;
    const chatId = getChatId(user.uid, activeChatUserId);
    
    await setDoc(doc(db, "typing", chatId), {
        [user.uid]: isTyping
    }, { merge: true });
};

/**
 * System Setup
 */
export const setupChatSystem = (currentUid) => {
    const messageForm = getEl('message-form');
    const messageInput = getEl('message-input');
    if (!messageForm || !messageInput) return;

    messageForm.onsubmit = async (e) => {
        e.preventDefault();
        try {
            const text = messageInput.value.trim();
            if (!text || !activeChatUserId) return;

            const user = getCurrentUser();
            if (!user) return;

            const chatId = activeChatIsGroup ? activeChatUserId : getChatId(user.uid, activeChatUserId);
            const collectionName = activeChatIsGroup ? "groups" : "chats";

            const msgData = {
                senderId: user.uid,
                text: text,
                timestamp: serverTimestamp(),
                type: 'text'
            };

            if (replyingToId) {
                msgData.replyToId = replyingToId;
                msgData.replyToText = replyingToText;
            }

            messageInput.value = '';
            const isEditing = editingMessageId;
            const editId = editingMessageId;
            editingMessageId = null;
            getEl('send-btn').textContent = 'Send';
            
            setTypingStatus(false);

            if (isEditing) {
                await updateDoc(doc(db, collectionName, chatId, "messages", editId), {
                    text: text,
                    edited: true
                });
            } else {
                await addDoc(collection(db, collectionName, chatId, "messages"), msgData);
            }

            replyingToId = null;
            const preview = getEl('reply-preview-box');
            if (preview) preview.remove();

        } catch (err) {
            console.error("Chat Submit Error:", err);
        }
    };

    messageInput.oninput = () => {
        setTypingStatus(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => setTypingStatus(false), 3000);
    };

    // User Search
    const searchInput = getEl('search-users');
    if (searchInput) {
        searchInput.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = allUsers.filter(u => (u.username || u.email).toLowerCase().includes(term));
            renderUserList(filtered);
        };
    }

    // Context Menu Handlers
    getEl('edit-msg-btn').onclick = () => {
        messageInput.value = contextMessageText;
        editingMessageId = contextMessageId;
        getEl('send-btn').textContent = 'Save';
        getEl('context-menu').classList.add('hidden');
        messageInput.focus();
    };

    getEl('delete-for-me-btn').onclick = async () => {
        const user = getCurrentUser();
        const chatId = activeChatIsGroup ? activeChatUserId : getChatId(user.uid, activeChatUserId);
        await updateDoc(doc(db, activeChatIsGroup ? "groups" : "chats", chatId, "messages", contextMessageId), {
            hiddenFrom: arrayUnion(user.uid)
        });
        getEl('context-menu').classList.add('hidden');
    };

    getEl('delete-for-everyone-btn').onclick = async () => {
        const user = getCurrentUser();
        const chatId = activeChatIsGroup ? activeChatUserId : getChatId(user.uid, activeChatUserId);
        await deleteDoc(doc(db, activeChatIsGroup ? "groups" : "chats", chatId, "messages", contextMessageId));
        getEl('context-menu').classList.add('hidden');
    };

    // Group Logic
    const createGroupBtn = getEl('create-group-btn');
    const confirmBtn = getEl('confirm-create-group-btn');
    const cancelBtn = getEl('cancel-create-group-btn');
    const modal = getEl('create-group-modal');

    if (createGroupBtn) {
        createGroupBtn.onclick = () => {
            modal.classList.remove('hidden-view');
            modal.classList.add('active-view');
            const list = getEl('group-user-select-list');
            list.innerHTML = '';
            selectedUsersForGroup.clear();
            allUsers.forEach(u => {
                const li = document.createElement('li');
                const name = u.username || u.email.split('@')[0];
                li.innerHTML = `<input type="checkbox"> <span>${name}</span>`;
                li.onclick = () => {
                    const cb = li.querySelector('input');
                    cb.checked = !cb.checked;
                    if (cb.checked) selectedUsersForGroup.add(u.uid); else selectedUsersForGroup.delete(u.uid);
                };
                list.appendChild(li);
            });
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            modal.classList.remove('active-view');
            modal.classList.add('hidden-view');
        };
    }

    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            const name = getEl('group-name-input').value.trim();
            if (!name || selectedUsersForGroup.size === 0) return alert('Name and members required');
            const user = getCurrentUser();
            const members = Array.from(selectedUsersForGroup);
            members.push(user.uid);
            await addDoc(collection(db, "groups"), { name, members, createdBy: user.uid, createdAt: serverTimestamp() });
            modal.classList.remove('active-view');
            modal.classList.add('hidden-view');
        };
    }
};

/**
 * Utils
 */
const getChatId = (u1, u2) => [u1, u2].sort().join('_');

const updateHeaderStatus = (status) => {
    const el = getEl('active-chat-status');
    if (!el) return;
    const isOnline = status === true || status === 'Online';
    el.innerHTML = `<span class="status-dot ${isOnline ? 'online' : 'offline'}"></span> ${isOnline ? 'Online' : 'Offline'}`;
};

const listenForTyping = (chatId, targetUid) => {
    if (typingObj) typingObj();
    typingObj = onSnapshot(doc(db, "typing", chatId), (snap) => {
        const indicator = getEl('typing-indicator');
        if (snap.exists() && snap.data()[targetUid]) {
            indicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
        }
    });
};
