import { 
    collection, 
    query, 
    onSnapshot, 
    orderBy, 
    addDoc, 
    setDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    where,
    arrayUnion,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase-config.js';
import { getCurrentUser, scrollToBottom } from './app.js';

// Helper to get elements safely
const getEl = (id) => document.getElementById(id);

// State
let activeChatUserId = null;
let activeChatIsGroup = false;
let activeChatObj = null;
let typingObj = null;
let pinUnsub = null;
let lastSenderId = null;
let lastTimestamp = 0;
let heartbeatInterval = null;

// Sound
const notificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');

// Notification Permission managed by banner in app.js
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
    }
    document.addEventListener('click', (e) => {
        const sidebar = document.querySelector('.sidebar');
        if (window.innerWidth < 850 && sidebar && !e.target.closest('.sidebar') && !e.target.closest('#menu-toggle')) {
            sidebar.classList.remove('open');
        }
    });

    // Profile Modal Close Handlers
    const closeProfileBtn = getEl('close-profile-btn');
    if (closeProfileBtn) {
        closeProfileBtn.onclick = () => getEl('profile-modal').classList.add('hidden');
    }
    const profileModal = getEl('profile-modal');
    if (profileModal) {
        profileModal.onclick = (e) => {
            if (e.target.id === 'profile-modal') profileModal.classList.add('hidden');
        };
    }
};
initSidebarHandlers();

/**
 * Load Users & Groups (Integrated Sidebar Listener)
 */
let unsubUsers = null;
let unsubGroups = null;
let unsubChats = null;
let chatMetadata = new Map();

export const loadUsers = (currentUid) => {
    if (unsubUsers) unsubUsers();
    if (unsubGroups) unsubGroups();
    if (unsubChats) unsubChats();

    // 1. Listen to all users
    unsubUsers = onSnapshot(query(collection(db, "users")), (snapshot) => {
        const usersData = snapshot.docs.map(doc => doc.data());
        allUsersMap = new Map(usersData.map(u => [u.uid, u]));
        allUsers = usersData.filter(user => user.uid !== currentUid);
        updateUserOrderAndRender();
    }, (err) => console.error("Users listener error:", err));

    // 2. Listen to chats metadata for sorting/previews
    unsubChats = onSnapshot(query(collection(db, "chats"), where("members", "array-contains", currentUid)), (snapshot) => {
        snapshot.docs.forEach(doc => {
            chatMetadata.set(doc.id, doc.data());
        });
        updateUserOrderAndRender();
    }, (err) => console.error("Chats listener error:", err));

    // 3. Listen to group memberships
    unsubGroups = onSnapshot(query(collection(db, "groups"), where("members", "array-contains", currentUid)), (snapshot) => {
        allGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateUserOrderAndRender();
    }, (err) => console.error("Groups listener error:", err));

    // 4. Start presence heartbeat
    startHeartbeat(currentUid);
};

const startHeartbeat = (uid) => {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    const updatePresence = () => {
        updateDoc(doc(db, "users", uid), {
            lastSeen: serverTimestamp()
        }).catch(() => {});
    };
    updatePresence();
    heartbeatInterval = setInterval(updatePresence, 30000); // Every 30s
};

const updateUserOrderAndRender = () => {
    allUsers.sort((a, b) => {
        const curUid = getCurrentUser()?.uid;
        const metaA = chatMetadata.get(getChatId(curUid, a.uid));
        const metaB = chatMetadata.get(getChatId(curUid, b.uid));
        
        const timeA = metaA?.lastMessageAt?.toMillis?.() || metaA?.lastMessageAt || a.lastMessageAt?.toMillis?.() || 0;
        const timeB = metaB?.lastMessageAt?.toMillis?.() || metaB?.lastMessageAt || b.lastMessageAt?.toMillis?.() || 0;
        
        if (timeA !== timeB) return timeB - timeA;
        if (a.status === 'Online' && b.status !== 'Online') return -1;
        return (a.username || a.email).localeCompare(b.username || b.email);
    });
    
    allGroups.sort((a, b) => {
        const timeA = a.lastMessageAt ? a.lastMessageAt.toMillis() : 0;
        const timeB = b.lastMessageAt ? b.lastMessageAt.toMillis() : 0;
        return timeB - timeA;
    });

    renderUserList();
};

const renderUserList = (filteredUsers = null, filteredGroups = null) => {
    const userList = getEl('user-list');
    if (!userList) return;
    
    const curUid = getCurrentUser()?.uid;
    userList.innerHTML = '';
    const usersToRender = filteredUsers || allUsers;
    const groupsToRender = filteredGroups || allGroups;

    if(usersToRender.length === 0 && groupsToRender.length === 0) {
        userList.innerHTML = '<li style="padding: 20px; color: var(--text-muted); font-weight: 700; text-align: center;">No contacts found.</li>';
        return;
    }

    groupsToRender.forEach(group => {
        const li = document.createElement('li');
        li.className = `user-row ${activeChatUserId === group.id && activeChatIsGroup ? 'active' : ''}`;
        li.innerHTML = `
            <div class="photo-circle-small" style="background-image: url(https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=random&color=fff&bold=true);"></div>
            <div class="user-info-stack" style="flex: 1;">
                <p class="user-name-text">${group.name}</p>
                <p class="user-status-text">
                    ${group.lastMessageText ? (group.lastSenderId === curUid ? 'You: ' : '') + group.lastMessageText : 'Group Chat'}
                </p>
            </div>
        `;
        li.onclick = () => selectGroupChat(group);
        userList.appendChild(li);
    });

    usersToRender.forEach(user => {
        const li = document.createElement('li');
        li.className = `user-row ${activeChatUserId === user.uid && !activeChatIsGroup ? 'active' : ''}`;
        const name = user.username || user.email.split('@')[0];
        const photo = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&bold=true`;
        const isOnline = user.status === 'Online';
        
        li.innerHTML = `
            <div class="photo-circle-small" style="background-image: url(${photo}); position: relative;">
                <span class="status-indicator-mini ${isOnline ? 'online' : 'offline'}"></span>
            </div>
            <div class="user-info-stack" style="flex: 1;">
                <p class="user-name-text">${name}</p>
                <p class="user-status-text">
                    ${(() => {
                        const chatId = getChatId(curUid, user.uid);
                        const meta = chatMetadata.get(chatId);
                        if (meta?.lastMessageText) {
                            return (meta.lastSenderId === curUid ? 'You: ' : '') + meta.lastMessageText;
                        }
                        return user.status || 'Offline';
                    })()}
                </p>
            </div>
            ${user.unreadCount ? `<span class="unread-badge">${user.unreadCount}</span>` : ''}
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

    getEl('active-chat-title').textContent = targetUser.username || targetUser.email.split('@')[0];
    updateHeaderStatus(targetUser.status || 'Offline');
    
    const photoEl = getEl('active-chat-photo');
    if (targetUser.photoURL) {
        photoEl.style.backgroundImage = `url(${targetUser.photoURL})`;
        photoEl.classList.remove('hidden');
    } else {
        photoEl.classList.add('hidden');
    }
    
    enableInput();
    renderUserList();
    
    const chatId = getChatId(currentUser.uid, targetUser.uid);
    // Ensure chat metadata doc exists for sorting/previews
    setDoc(doc(db, "chats", chatId), { 
        members: [currentUser.uid, targetUser.uid],
        type: 'private'
    }, { merge: true }).catch(err => console.warn("Meta update failed:", err));

    listenForMessages(chatId);
    listenForTyping(chatId);
    listenForPins(chatId);
};

const selectGroupChat = (group) => {
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    activeChatUserId = group.id;
    activeChatIsGroup = true;

    getEl('active-chat-title').textContent = group.name;
    updateHeaderStatus(true);
    
    const photoEl = getEl('active-chat-photo');
    photoEl.style.backgroundImage = `url(https://ui-avatars.com/api/?name=${encodeURIComponent(group.name)}&background=random&color=fff&bold=true)`;
    photoEl.classList.remove('hidden');

    enableInput();
    renderUserList();

    // Ensure group metadata doc exists for sorting
    setDoc(doc(db, "groups", group.id), { 
        members: arrayUnion(currentUser.uid)
    }, { merge: true }).catch(err => console.warn("Group meta update failed:", err));

    listenForMessages(group.id);
    listenForTyping(group.id);
    listenForPins(group.id);
};

const enableInput = () => {
    const input = getEl('message-input');
    const sendBtn = getEl('send-btn');
    const emojiBtn = getEl('emoji-btn');
    if (input) { input.disabled = false; input.focus(); }
    if (sendBtn) sendBtn.disabled = false;
    if (emojiBtn) emojiBtn.disabled = false;
};

/**
 * Message Listening & Rendering
 */
const listenForMessages = (chatId) => {
    if (activeChatObj) activeChatObj();
    const user = getCurrentUser();
    const messagesRef = collection(db, activeChatIsGroup ? "groups" : "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));
    
    activeChatObj = onSnapshot(q, (snapshot) => {
        const container = getEl('messages-container');
        if (!container) return;
        
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const msg = change.doc.data();
                if (msg.senderId !== user.uid && msg.timestamp) {
                    const sender = allUsersMap.get(msg.senderId);
                    if (sender && activeChatUserId !== msg.senderId) {
                        sender.unreadCount = (sender.unreadCount || 0) + 1;
                        playNotifySound();
                        showToast(`New message from ${sender.username || sender.email.split('@')[0]}`, msg.text);
                        updateUserOrderAndRender();
                    }
                }
            }
        });

        container.innerHTML = '';
        lastSenderId = null;
        lastTimestamp = 0;
        const fragment = document.createDocumentFragment();

        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            if (msg.hiddenFrom && msg.hiddenFrom.includes(user.uid)) return;
            const isGrouped = lastSenderId === msg.senderId && (msg.timestamp ? (msg.timestamp.toMillis() - lastTimestamp < 300000) : true);
            
            if (!activeChatIsGroup && msg.senderId !== user.uid && !msg.read) {
                updateDoc(docSnap.ref, { read: true }).catch(() => {});
            }
            
            renderMessage(msg, docSnap.id, user.uid, isGrouped, fragment);
            lastSenderId = msg.senderId;
            lastTimestamp = msg.timestamp ? msg.timestamp.toMillis() : Date.now();
        });
        
        container.appendChild(fragment);
        scrollToBottom();
    });
};

const renderMessage = (msg, msgId, currentUid, isGrouped, container) => {
    const isSent = msg.senderId === currentUid;
    const sender = allUsersMap.get(msg.senderId) || (isSent ? getCurrentUser() : null);
    
    const div = document.createElement('div');
    div.className = `message ${isSent ? 'sent' : 'received'} ${isGrouped ? 'grouped' : ''}`;
    div.dataset.id = msgId;

    div.oncontextmenu = (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, msgId, isSent, msg.text);
    };

    // Reply Logic
    if (msg.replyToText) {
        const reply = document.createElement('div');
        reply.className = 'reply-bubble';
        reply.textContent = msg.replyToText;
        div.appendChild(reply);
    }

    // Avatar for non-grouped received messages
    if (!isSent && !isGrouped) {
        const avatar = document.createElement('div');
        avatar.className = 'photo-circle-extra-small';
        avatar.style = `width: 24px; height: 24px; font-size: 0.6rem; border: 2px solid var(--border-box); margin-bottom: 5px; cursor: pointer; background-image: url(${sender?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(sender?.username || 'U')}`}); background-size: cover; border-radius: 50%;`;
        avatar.onclick = () => openProfileModal(sender);
        div.appendChild(avatar);
    }

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = msg.text;
    if (msg.edited) {
        const span = document.createElement('span');
        span.style = "font-size: 0.7rem; opacity: 0.5; margin-left: 5px;";
        span.textContent = '(edited)';
        content.appendChild(span);
    }
    div.appendChild(content);

    // Reactions
    if (msg.reactions) {
        const reactionBox = document.createElement('div');
        reactionBox.className = 'reaction-box';
        Object.entries(msg.reactions).forEach(([emoji, uids]) => {
            if (uids.length > 0) {
                const pill = document.createElement('span');
                const hasReacted = uids.includes(currentUid);
                pill.className = `reaction-pill ${hasReacted ? 'active' : ''}`;
                pill.textContent = `${emoji} ${uids.length}`;
                pill.onclick = (e) => { e.stopPropagation(); toggleReaction(msgId, emoji); };
                reactionBox.appendChild(pill);
            }
        });
        div.appendChild(reactionBox);
    }

    const footer = document.createElement('div');
    footer.className = 'message-footer';
    
    const time = document.createElement('span');
    if (msg.timestamp) {
        time.textContent = msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        time.textContent = '...';
    }
    footer.appendChild(time);

    if (isSent) {
        const status = document.createElement('span');
        status.style = `color: ${msg.read ? 'var(--accent-blue)' : 'inherit'}; font-weight: 900;`;
        status.textContent = msg.read ? '✓✓' : '✓';
        footer.appendChild(status);
    }

    div.appendChild(footer);
    container.appendChild(div);
};

/**
 * Pins Logic
 */
const listenForPins = (chatId) => {
    if (pinUnsub) pinUnsub();
    const docRef = doc(db, activeChatIsGroup ? "groups" : "chats", chatId);
    pinUnsub = onSnapshot(docRef, (docSnap) => {
        const data = docSnap.data();
        const bar = getEl('pinned-messages');
        const text = getEl('pinned-msg-text');
        if (data && data.pinnedMessage) {
            text.textContent = data.pinnedMessage.text;
            bar.classList.remove('hidden');
        } else {
            bar.classList.add('hidden');
        }
    });
};

/**
 * Profile Modal Logic
 */
const openProfileModal = (user) => {
    if (!user) return;
    const modal = getEl('profile-modal');
    getEl('profile-modal-avatar').style.backgroundImage = `url(${user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username || 'U')}`})`;
    getEl('profile-modal-name').textContent = user.username || user.email.split('@')[0];
    getEl('profile-modal-status').textContent = user.status || 'Offline';
    getEl('profile-modal-bio').textContent = user.bio || 'This user is too brutal for a bio.';
    
    if (user.lastSeen) {
        const date = user.lastSeen.toDate();
        getEl('profile-modal-joined').textContent = `Last active: ${date.toLocaleString()}`;
    } else {
        getEl('profile-modal-joined').textContent = 'Last active: Unknown';
    }

    getEl('start-chat-from-profile').onclick = () => {
        modal.classList.add('hidden');
        selectUserChat(user);
    };

    modal.classList.remove('hidden');
};

/**
 * Context Menu & Actions
 */
const showContextMenu = (x, y, msgId, isSent, text) => {
    const menu = getEl('context-menu');
    contextMessageId = msgId;
    contextMessageText = text;
    menu.classList.remove('hidden');
    
    const menuWidth = 180;
    const menuHeight = 240;
    let finalX = x;
    let finalY = y;
    if (x + menuWidth > window.innerWidth) finalX = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) finalY = window.innerHeight - menuHeight - 10;
    menu.style.left = `${finalX}px`;
    menu.style.top = `${finalY}px`;
    
    getEl('delete-for-everyone-btn').classList.toggle('hidden', !isSent);
    getEl('edit-msg-btn').classList.toggle('hidden', !isSent);
};

/**
 * System Setup (Event Listeners)
 */
export const setupChatSystem = (currentUid) => {
    const messageForm = getEl('message-form');
    const messageInput = getEl('message-input');
    if (!messageForm || !messageInput) return;

    messageForm.onsubmit = async (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        if (!text || !activeChatUserId) return;
        const user = getCurrentUser();
        const chatId = activeChatIsGroup ? activeChatUserId : getChatId(user.uid, activeChatUserId);
        const collectionName = activeChatIsGroup ? "groups" : "chats";

        const msgData = {
            senderId: user.uid,
            text: text,
            timestamp: serverTimestamp(),
            type: 'text'
        };

        if (replyingToId) { msgData.replyToId = replyingToId; msgData.replyToText = replyingToText; }

        messageInput.value = '';
        const isEditing = editingMessageId;
        const editId = editingMessageId;
        editingMessageId = null;
        getEl('send-btn').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(45deg);"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
        
        if (isEditing) {
            await updateDoc(doc(db, collectionName, chatId, "messages", editId), { text: text, edited: true });
        } else {
            await addDoc(collection(db, collectionName, chatId, "messages"), msgData);
            
            // Update Chat/Group Metadata for Sorting
            const ref = doc(db, collectionName, chatId);
            const metadata = { 
                lastMessageAt: Date.now(), // Use local time for immediate local sorting
                lastMessageText: text,
                lastSenderId: user.uid
            };
            
            if (!activeChatIsGroup) {
                metadata.members = [user.uid, activeChatUserId];
            }
            
            // Update local map for instant feedback
            chatMetadata.set(chatId, metadata);
            updateUserOrderAndRender();

            // Sync to Firestore
            setDoc(ref, { ...metadata, lastMessageAt: serverTimestamp() }, { merge: true });
        }

        replyingToId = null;
        getEl('reply-preview-container').classList.add('hidden');
    };

    // Pin Handler
    getEl('pin-btn').onclick = async () => {
        const chatId = activeChatIsGroup ? activeChatUserId : getChatId(getCurrentUser().uid, activeChatUserId);
        await updateDoc(doc(db, activeChatIsGroup ? "groups" : "chats", chatId), {
            pinnedMessage: { id: contextMessageId, text: contextMessageText }
        });
        getEl('context-menu').classList.add('hidden');
        showToast("Brutal!", "Message pinned to header.");
    };

    getEl('unpin-btn').onclick = async () => {
        const chatId = activeChatIsGroup ? activeChatUserId : getChatId(getCurrentUser().uid, activeChatUserId);
        await updateDoc(doc(db, activeChatIsGroup ? "groups" : "chats", chatId), { pinnedMessage: null });
        showToast("Brutal!", "Message unpinned.");
    };

    // Context Menu Buttons
    getEl('react-btn').onclick = () => {
        const reactions = getEl('reactions-overlay');
        const context = getEl('context-menu');
        reactions.style.left = context.style.left;
        reactions.style.top = context.style.top;
        reactions.classList.remove('hidden');
        context.classList.add('hidden');
    };

    getEl('reply-btn').onclick = () => {
        replyingToId = contextMessageId;
        replyingToText = contextMessageText;
        getEl('reply-text-preview').textContent = contextMessageText;
        getEl('reply-preview-container').classList.remove('hidden');
        getEl('context-menu').classList.add('hidden');
        messageInput.focus();
    };

    getEl('edit-msg-btn').onclick = () => {
        messageInput.value = contextMessageText;
        editingMessageId = contextMessageId;
        getEl('send-btn').textContent = 'SAVE';
        getEl('context-menu').classList.add('hidden');
        messageInput.focus();
    };

    getEl('delete-for-me-btn').onclick = async () => {
        const chatId = activeChatIsGroup ? activeChatUserId : getChatId(getCurrentUser().uid, activeChatUserId);
        await updateDoc(doc(db, activeChatIsGroup ? "groups" : "chats", chatId, "messages", contextMessageId), {
            hiddenFrom: arrayUnion(getCurrentUser().uid)
        });
        getEl('context-menu').classList.add('hidden');
    };

    getEl('delete-for-everyone-btn').onclick = async () => {
        const chatId = activeChatIsGroup ? activeChatUserId : getChatId(getCurrentUser().uid, activeChatUserId);
        await deleteDoc(doc(db, activeChatIsGroup ? "groups" : "chats", chatId, "messages", contextMessageId));
        getEl('context-menu').classList.add('hidden');
    };

    // User Search
    getEl('search-users').oninput = (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allUsers.filter(u => (u.username || u.email).toLowerCase().includes(term));
        renderUserList(filtered);
    };

    // Emoji Selection
    document.querySelectorAll('.reaction-option').forEach(btn => {
        btn.onclick = () => {
            toggleReaction(contextMessageId, btn.dataset.emoji);
            getEl('reactions-overlay').classList.add('hidden');
        };
    });

    // Cancel Reply
    getEl('cancel-reply-btn').onclick = () => {
        replyingToId = null;
        getEl('reply-preview-container').classList.add('hidden');
    };

    // Message Search
    getEl('msg-search-input').oninput = (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.message').forEach(el => {
            const text = el.querySelector('.message-content')?.textContent.toLowerCase() || '';
            el.classList.toggle('hidden', term && !text.includes(term));
            if (term && text.includes(term)) el.style.border = '4px solid var(--accent-blue)';
            else el.style.border = '';
        });
    };

    // Settings Drawer Controls
    getEl('close-settings-btn').onclick = () => getEl('settings-drawer').classList.remove('active');

    getEl('setting-text-size')?.addEventListener('input', (e) => {
        const size = e.target.value;
        document.documentElement.style.setProperty('--font-size-base', `${size}px`);
        localStorage.setItem('armchat_text_size', size);
    });

    getEl('setting-bubble-radius')?.addEventListener('input', (e) => {
        const radius = e.target.value;
        document.documentElement.style.setProperty('--bubble-radius', `${radius}px`);
        localStorage.setItem('armchat_bubble_radius', radius);
    });

    getEl('setting-read-receipts')?.addEventListener('change', (e) => {
        localStorage.setItem('armchat_read_receipts', e.target.checked);
    });

    getEl('setting-notif-sound')?.addEventListener('change', (e) => {
        localStorage.setItem('armchat_notif_sound', e.target.checked);
    });

    getEl('clear-cache-btn')?.addEventListener('click', () => {
        if (confirm('Clear all local cache? This will reset your theme and recent emojis.')) {
            localStorage.clear();
            window.location.reload();
        }
    });

    // Load saved settings
    const savedSize = localStorage.getItem('armchat_text_size') || '16';
    document.documentElement.style.setProperty('--font-size-base', `${savedSize}px`);
    if(getEl('setting-text-size')) getEl('setting-text-size').value = savedSize;

    const savedRadius = localStorage.getItem('armchat_bubble_radius') || '15';
    document.documentElement.style.setProperty('--bubble-radius', `${savedRadius}px`);
    if(getEl('setting-bubble-radius')) getEl('setting-bubble-radius').value = savedRadius;
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

const listenForTyping = (chatId) => {
    if (typingObj) typingObj();
    const docRef = doc(db, activeChatIsGroup ? "groups" : "chats", chatId);
    typingObj = onSnapshot(docRef, (docSnap) => {
        const data = docSnap.data();
        if (data && data.typing) {
            const typingUsers = Object.entries(data.typing)
                .filter(([uid, isTyping]) => isTyping && uid !== getCurrentUser().uid)
                .map(([uid]) => allUsersMap.get(uid)?.username || 'Someone');
            const indicator = getEl('typing-indicator');
            const text = getEl('typing-text');
            if (typingUsers.length > 0) {
                text.textContent = typingUsers.length === 1 ? `${typingUsers[0]} is typing...` : 'Several people are typing...';
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        }
    });
};

const showToast = (title, body) => {
    const toast = document.createElement('div');
    toast.className = 'brutal-box toast-notification';
    toast.style = "position: fixed; bottom: 30px; right: 30px; z-index: 10000; padding: 15px 25px; transition: transform 0.4s var(--ease-brutal); transform: translateX(150%);";
    toast.innerHTML = `<div style="font-weight: 900; color: var(--accent-blue);">${title}</div><div>${body}</div>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.transform = "translateX(0)";
        setTimeout(() => {
            toast.style.transform = "translateX(150%)";
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }, 100);
};

const playNotifySound = () => {
    notificationSound.currentTime = 0;
    notificationSound.play().catch(() => {});
};

const toggleReaction = async (msgId, emoji) => {
    const user = getCurrentUser();
    const chatId = activeChatIsGroup ? activeChatUserId : getChatId(user.uid, activeChatUserId);
    const msgRef = doc(db, activeChatIsGroup ? "groups" : "chats", chatId, "messages", msgId);
    const msgSnap = await getDoc(msgRef);
    if (!msgSnap.exists()) return;
    const reactions = msgSnap.data().reactions || {};
    const uids = reactions[emoji] || [];
    reactions[emoji] = uids.includes(user.uid) ? uids.filter(id => id !== user.uid) : [...uids, user.uid];
    await updateDoc(msgRef, { reactions });
};
