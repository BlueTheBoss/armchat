import { auth, db, googleProvider } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithPopup,
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    switchView, 
    updateCurrentUserDisplay, 
    updateMyProfilePhoto, 
    processImage, 
    updateStatusSelect, 
    setCurrentUser,
    initApp
} from './app.js';
import { loadUsers, setupChatSystem } from './chat.js';

// Initialize the App listeners
initApp();

// DOM Elements
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const googleBtn = document.getElementById('google-btn');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');

// Setup View Elements
const setupForm = document.getElementById('setup-form');
const usernameInput = document.getElementById('username');
const bioInput = document.getElementById('bio');
const photoInput = document.getElementById('profile-photo-input');
const photoPreview = document.getElementById('setup-photo-preview');

let currentPhotoFile = null;

// Handle Auth State Changes
onAuthStateChanged(auth, async (user) => {
    setCurrentUser(user);
    if (user) {
        
        // Fetch user data to check for username
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userData = userDoc.data();

        if (userData && userData.username) {
            switchView('chat-view');
            updateCurrentUserDisplay(userData.username);
            if(userData.photoURL) updateMyProfilePhoto(userData.photoURL);
            if(userData.status) updateStatusSelect(userData.status);
            
            loadUsers(user.uid);
            setupChatSystem(user.uid);
        } else {
            switchView('setup-view');
        }
    } else {
        setCurrentUser(null);
        switchView('auth-view');
    }
});

// Profile Setup Logic
photoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        currentPhotoFile = file;
        const reader = new FileReader();
        reader.onload = (e) => photoPreview.style.backgroundImage = `url(${e.target.result})`;
        reader.readAsDataURL(file);
    }
});

setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const username = usernameInput.value.trim().toLowerCase();
    const bio = bioInput.value.trim();
    
    if (!username || username.length < 3) return alert('Username must be at least 3 chars');

    // UI Loading State
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = 'Processing...';
    submitBtn.disabled = true;

    try {
        console.log('Checking username availability...');
        // Check if username is taken
        const q = query(collection(db, "users"), where("username", "==", username));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            submitBtn.textContent = originalBtnText;
            submitBtn.disabled = false;
            return alert('Username already taken!');
        }

        let photoURL = 'https://ui-avatars.com/api/?name=' + username + '&background=random&size=200'; // Default
        
        if (currentPhotoFile) {
            console.log('Resizing and converting photo to Base64...');
            photoURL = await processImage(currentPhotoFile, 400); 
        }

        console.log('Updating user document in Firestore...');
        // Update Firestore
        const user = auth.currentUser;
        await updateDoc(doc(db, "users", user.uid), {
            username: username,
            photoURL: photoURL,
            bio: bio
        });

        console.log('Profile setup complete. Switching view.');
        // Continue to chat
        switchView('chat-view');
        updateCurrentUserDisplay(username);
        updateMyProfilePhoto(photoURL);
        
        loadUsers(currentUser.uid);
        setupChatSystem(currentUser.uid);

    } catch (error) {
        console.error('Setup Error:', error);
        alert('Error saving profile: ' + error.message);
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
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
    signOut(auth).then(() => {
        window.location.reload(); // Hard reset for clean state
    });
});


