import { db } from './firebase-config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global State
let currentUser = null;

// DOM Elements (evaluated when needed)
const getEl = (id) => document.getElementById(id);

/**
 * Global App Logic
 */
export const initApp = () => {
    initTheme();
    
    // --- Global Event Delegation ---
    document.addEventListener('click', (e) => {
        const profileMenu = getEl('profile-menu');
        if (!profileMenu) return;

        const isThemeBtn = e.target.closest('.theme-toggle-btn');
        const isSwatch = e.target.closest('.swatch');
        const isLogoBtn = e.target.closest('#logo-button');
        const isProfileMenu = e.target.closest('#profile-menu');
        const isStatusSelect = e.target.id === 'user-status-select';
        
        // 1. Handle Theme Toggle
        if (isThemeBtn) {
            e.preventDefault();
            toggleTheme();
            profileMenu.classList.add('hidden');
            return;
        }

        // 2. Handle Accent Swatches
        if (isSwatch) {
            const color = isSwatch.dataset.color;
            if (currentUser) {
                updateDoc(doc(db, "users", currentUser.uid), { accentColor: color })
                    .then(() => alert(`Signature Fog: ${color} set!`))
                    .catch(err => console.error(err));
            }
            profileMenu.classList.add('hidden');
            return;
        }

        // 3. Handle Status Select
        if (isStatusSelect) return;

        // 4. Handle Logo / Menu Toggle
        if (isLogoBtn && !isProfileMenu) {
            profileMenu.classList.toggle('hidden');
            return;
        }
        
        // 5. Close profile menu when clicking outside
        if (!profileMenu.classList.contains('hidden') && !isLogoBtn) {
            profileMenu.classList.add('hidden');
        }
    });

    // Change Photo Logic
    const changePhotoBtn = getEl('change-photo-btn');
    const changePhotoInput = getEl('change-photo-input');
    if (changePhotoBtn && changePhotoInput) {
        changePhotoBtn.onclick = () => changePhotoInput.click();
        changePhotoInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (file && currentUser) {
                try {
                    const base64 = await processImage(file, 400);
                    await updateDoc(doc(db, "users", currentUser.uid), { photoURL: base64 });
                    updateMyProfilePhoto(base64);
                    alert('Profile photo updated!');
                } catch (err) {
                    console.error(err);
                }
            }
        };
    }

    // Status Select
    const statusSelect = getEl('user-status-select');
    if (statusSelect) {
        statusSelect.onchange = async (e) => {
            if (currentUser) {
                await updateDoc(doc(db, "users", currentUser.uid), { status: e.target.value });
            }
        };
    }
};

// Exported State Management
export const setCurrentUser = (user) => { currentUser = user; };
export const getCurrentUser = () => currentUser;

/**
 * Theme Management
 */
export const initTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') document.documentElement.classList.add('dark-mode');
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
    document.querySelectorAll('.theme-toggle-btn').forEach(btn => btn.textContent = text);
};

/**
 * UI Utilities
 */
export const switchView = (viewId) => {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active-view');
        view.classList.add('hidden-view');
    });
    const target = getEl(viewId);
    if (target) {
        target.classList.remove('hidden-view');
        target.classList.add('active-view');
    }
};

export const updateMyProfilePhoto = (url) => {
    const el = getEl('my-profile-photo');
    if (el && url) el.style.backgroundImage = `url(${url})`;
};

export const updateCurrentUserDisplay = (text) => {
    const el = getEl('current-user-display');
    if (el) el.textContent = `Logged in as: ${text}`;
};

export const updateStatusSelect = (status) => {
    const el = getEl('user-status-select');
    if (el && status) el.value = status;
};

export const scrollToBottom = () => {
    const el = getEl('messages-container');
    if (el) el.scrollTop = el.scrollHeight;
};

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
                if (width > height) {
                    if (width > maxDimension) { height *= maxDimension / width; width = maxDimension; }
                } else {
                    if (height > maxDimension) { width *= maxDimension / height; height = maxDimension; }
                }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
};

// Auto-init theme
initTheme();
