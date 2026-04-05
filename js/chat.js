import { db } from './firebase-config.js';
import { getCurrentUser } from './auth.js';
import { scrollToBottom } from './app.js';
import { 
    collection, 
    query, 
    onSnapshot, 
    orderBy, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elements
const userList = document.getElementById('user-list');
const activeChatTitle = document.getElementById('active-chat-title');
const activeChatStatus = document.getElementById('active-chat-status');
const messagesContainer = document.getElementById('messages-container');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const searchUsers = document.getElementById('search-users');

let activeChatUserId = null;
let activeChatObj = null; // Unsubscribe function for active chat listener
let allUsers = [];

// Helper to create a consistent Chat ID for 1-on-1 chats
const getChatId = (uid1, uid2) => {
    return [uid1, uid2].sort().join('_');
};

/**
 * Load all registered users from Firestore to display in the sidebar
 */
export const loadUsers = (currentUid) => {
    const q = query(collection(db, "users"));
    
    onSnapshot(q, (snapshot) => {
        allUsers = snapshot.docs
            .map(doc => doc.data())
            .filter(user => user.uid !== currentUid); // Filter out self
        
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
        li.className = `user-item ${activeChatUserId === user.uid ? 'active' : ''}`;
        li.textContent = user.email.split('@')[0]; // Display name before @
        
        li.addEventListener('click', () => selectUserChat(user));
        userList.appendChild(li);
    });
};

/**
 * User Search Filter
 */
searchUsers.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allUsers.filter(user => user.email.toLowerCase().includes(term));
    renderUserList(filtered);
});

/**
 * Select a user to start chatting
 */
const selectUserChat = (targetUser) => {
    activeChatUserId = targetUser.uid;
    
    // Update UI
    activeChatTitle.textContent = `Chatting with ${targetUser.email.split('@')[0]}`;
    activeChatStatus.textContent = '🟢 Online'; // Placeholder
    
    // Enable input
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
    
    renderUserList(allUsers); // Re-render to show active state
    
    // Load messages
    const currentUser = getCurrentUser();
    if(currentUser) {
        listenForMessages(currentUser.uid, targetUser.uid);
    }
};

/**
 * Listen for messages in this specific 1-on-1 chat room
 */
const listenForMessages = (currentUid, targetUid) => {
    // Unsubscribe from previous chat listener if exists
    if(activeChatObj) activeChatObj();
    
    const chatId = getChatId(currentUid, targetUid);
    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));
    
    activeChatObj = onSnapshot(q, (snapshot) => {
        messagesContainer.innerHTML = '';
        
        if (snapshot.empty) {
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    <p>No messages yet. Send a 'Yo!' to break the ice.</p>
                </div>
            `;
            return;
        }

        snapshot.forEach((doc) => {
            const msg = doc.data();
            renderMessage(msg, currentUid);
        });
        
        scrollToBottom();
    });
};

const renderMessage = (msg, currentUid) => {
    const isSent = msg.senderId === currentUid;
    const div = document.createElement('div');
    div.className = `message ${isSent ? 'sent' : 'received'}`;
    
    // Safety escape for HTML
    const textContent = document.createElement('div');
    textContent.textContent = msg.text;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'message-time';
    
    if (msg.timestamp) {
        const date = msg.timestamp.toDate();
        timeSpan.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        timeSpan.textContent = "Sending...";
    }
    
    div.appendChild(textContent);
    div.appendChild(timeSpan);
    
    messagesContainer.appendChild(div);
};

/**
 * Set up the form submit handler
 */
export const setupChatSystem = (currentUid) => {
    messageForm.onsubmit = async (e) => {
        e.preventDefault();
        const text = messageInput.value.trim();
        
        if(!text || !activeChatUserId) return;
        
        const chatId = getChatId(currentUid, activeChatUserId);
        messageInput.value = ''; // Clear early for better UX
        
        try {
            await addDoc(collection(db, "chats", chatId, "messages"), {
                text: text,
                senderId: currentUid,
                timestamp: serverTimestamp()
            });
        } catch (error) {
            console.error("Error sending message: ", error);
        }
    };
};
