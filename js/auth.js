import { auth, db, googleProvider } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithPopup,
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { switchView, updateCurrentUserDisplay } from './app.js';
import { loadUsers, setupChatSystem } from './chat.js';

// DOM Elements
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const googleBtn = document.getElementById('google-btn');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');


let currentUser = null;

// Handle Auth State Changes
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        switchView('chat-view');
        updateCurrentUserDisplay(user.email);
        
        // Fetch users and setup chat
        loadUsers(user.uid);
        setupChatSystem(user.uid);
    } else {
        currentUser = null;
        switchView('auth-view');
    }
});

// Helper for errors
const showError = (message) => {
    authError.textContent = message;
    authError.classList.remove('hidden');
};

const hideError = () => {
    authError.classList.add('hidden');
    authError.textContent = '';
};

// Signup
signupBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    hideError();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if(!email || !password) return showError('Enter email and password');
    if(password.length < 6) return showError('Password must be at least 6 characters');

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Add user to Firestore 'users' collection
        await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: user.email,
            createdAt: new Date().toISOString()
        });
        
    } catch (error) {
        showError(error.message);
    }
});

// Login
loginBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    hideError();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    if(!email || !password) return showError('Enter email and password');

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        showError('Invalid email or password.');
    }
});

// Google Login
googleBtn.addEventListener('click', async () => {
    hideError();
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        
        // Ensure user is in Firestore
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                email: user.email,
                createdAt: new Date().toISOString()
            });
        }
    } catch (error) {
        showError(error.message);
    }
});

// Logout
logoutBtn.addEventListener('click', () => {
    signOut(auth);
});


export const getCurrentUser = () => currentUser;
