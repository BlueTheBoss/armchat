import { db } from './firebase-config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getCurrentUser } from './auth.js';

// DOM Elements
const authView = document.getElementById('auth-view');
const chatView = document.getElementById('chat-view');
const currentUserDisplay = document.getElementById('current-user-display');
const messagesContainer = document.getElementById('messages-container');
const myProfilePhoto = document.getElementById('my-profile-photo');
const logoButton = document.getElementById('logo-button');
const profileMenu = document.getElementById('profile-menu');
const changePhotoBtn = document.getElementById('change-photo-btn');
const changePhotoInput = document.getElementById('change-photo-input');
const userStatusSelect = document.getElementById('user-status-select');

// Initialize Theme on Load
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    
    // Global Event Delegation
    document.addEventListener('click', (e) => {
        // Theme Toggle
        const themeBtn = e.target.closest('.theme-toggle-btn');
        if (themeBtn) {
            e.preventDefault();
            toggleTheme();
            if (profileMenu) profileMenu.classList.add('hidden');
            return;
        }

        // Accent Swatches
        const swatch = e.target.closest('.swatch');
        if (swatch) {
            const color = swatch.dataset.color;
            const user = getCurrentUser();
            if (user) {
                updateDoc(doc(db, "users", user.uid), { accentColor: color })
                    .then(() => alert(`Signature Fog: ${color} set!`))
                    .catch(err => console.error(err));
            }
            if (profileMenu) profileMenu.classList.add('hidden');
            return;
        }
        
        // Close profile menu when clicking outside
        if (profileMenu && !profileMenu.classList.contains('hidden') && !e.target.closest('.logo-container')) {
            profileMenu.classList.add('hidden');
        }
    });

    // Logo Menu Toggle
    if (logoButton) {
        logoButton.addEventListener('click', (e) => {
            if (e.target.id === 'user-status-select') return;
            if (e.target.closest('.menu-item') && e.target.tagName !== 'BUTTON' && !e.target.classList.contains('swatch')) return;
            e.stopPropagation();
            profileMenu.classList.toggle('hidden');
        });
    }

    // Change Photo Logic
    if (changePhotoBtn) {
        changePhotoBtn.addEventListener('click', () => changePhotoInput.click());
    }

    if (changePhotoInput) {
        changePhotoInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            const user = getCurrentUser();
            if (file && user) {
                try {
                    const base64 = await processImage(file, 400);
                    await updateDoc(doc(db, "users", user.uid), { photoURL: base64 });
                    updateMyProfilePhoto(base64);
                    alert('Profile photo updated!');
                } catch (err) {
                    console.error(err);
                    alert('Failed to update photo');
                }
            }
        });
    }

    // User Status Update
    if (userStatusSelect) {
        userStatusSelect.addEventListener('change', async (e) => {
            const user = getCurrentUser();
            if (user) {
                try {
                    await updateDoc(doc(db, "users", user.uid), { status: e.target.value });
                } catch (err) {
                    console.error("Failed to update status", err);
                }
            }
        });
    }
});

export const updateStatusSelect = (status) => {
    if (userStatusSelect && status) {
        userStatusSelect.value = status;
    }
}

/**
 * Theme Management (Midnight Fog)
 */
export const initTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark-mode');
    }
    updateThemeButtonsText(savedTheme);
};

export const toggleTheme = () => {
    const isDark = document.documentElement.classList.toggle('dark-mode');
    const newTheme = isDark ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    updateThemeButtonsText(newTheme);
};

const updateThemeButtonsText = (theme) => {
    const text = theme === 'dark' ? 'LIGHT MODE' : 'DARK MODE';
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.textContent = text;
    });
};

/**
 * Switch between application views
 * @param {string} viewId 'auth-view', 'chat-view', or 'setup-view'
 */
export const switchView = (viewId) => {

    // Hide all views
    document.querySelectorAll('.view').forEach(view => view.classList.replace('active-view', 'hidden-view'));
    
    // Show target view
    const target = document.getElementById(viewId);
    target.classList.replace('hidden-view', 'active-view');
};

/**
 * Update current user's profile photo in sidebar
 */
export const updateMyProfilePhoto = (url) => {
    if(url) myProfilePhoto.style.backgroundImage = `url(${url})`;
};


/**
 * Display the current logged in user's email in the sidebar
 */
export const updateCurrentUserDisplay = (email) => {
    currentUserDisplay.textContent = `Logged in as: ${email}`;
};

/**
 * Scroll the chat area to the bottom
 */
export const scrollToBottom = () => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
};

/**
 * Resize and compress an image into a Base64 string
 * @param {File} file 
 * @param {number} maxDimension Max width or height in pixels
 * @returns {Promise<string>} Base64 string
 */
export const processImage = (file, maxDimension = 800) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Calculate new dimensions
                if (width > height) {
                    if (width > maxDimension) {
                        height *= maxDimension / width;
                        width = maxDimension;
                    }
                } else {
                    if (height > maxDimension) {
                        width *= maxDimension / height;
                        height = maxDimension;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Draw resized image
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Get Base64 JPEG at 0.7 quality
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(dataUrl);
            };
            
            img.onerror = (err) => reject(err);
        };
        
        reader.onerror = (err) => reject(err);
    });
};

