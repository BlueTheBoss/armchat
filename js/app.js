import { db } from './firebase-config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global State
let currentUser = null;

// DOM Elements (evaluated when needed)
const getEl = (id) => document.getElementById(id);

/**
 * Global App Logic
 */
let isInitialized = false;

export const initApp = () => {
    if (isInitialized) return;
    isInitialized = true;
    
    initTheme();
    
    // --- Global Event Delegation ---
    document.addEventListener('click', (e) => {
        const settingsDrawer = getEl('settings-drawer');
        const emojiPicker = getEl('emoji-picker');
        const contextMenu = getEl('context-menu');
        const reactionsOverlay = getEl('reactions-overlay');

        const isSettingsBtn = e.target.closest('#settings-btn');
        const isCloseSettings = e.target.closest('#close-settings-btn');
        const isEmojiBtn = e.target.closest('#emoji-btn');
        const isSearchToggle = e.target.closest('#search-toggle');
        const isCloseSearch = e.target.closest('#close-search-btn');

        // Settings Drawer
        if (isSettingsBtn && settingsDrawer) {
            settingsDrawer.classList.add('open');
            return;
        }
        if (settingsDrawer && (isCloseSettings || (settingsDrawer.classList.contains('open') && !e.target.closest('#settings-drawer') && !isSettingsBtn))) {
            settingsDrawer.classList.remove('open');
        }

        // Emoji Picker
        if (isEmojiBtn && emojiPicker) {
            const isOpening = emojiPicker.classList.contains('hidden');
            emojiPicker.classList.toggle('hidden');
            if (isOpening) window.dispatchEvent(new CustomEvent('emoji-picker-open'));
            return;
        }
        if (emojiPicker && !e.target.closest('#emoji-picker') && !isEmojiBtn) {
            emojiPicker.classList.add('hidden');
        }

        // Search Overlay
        const searchOverlay = getEl('search-overlay');
        if (isSearchToggle && searchOverlay) {
            searchOverlay.classList.add('active');
            getEl('msg-search-input')?.focus();
            return;
        }
        if (isCloseSearch && searchOverlay) {
            searchOverlay.classList.remove('active');
            return;
        }

        // Context Menu & Reactions
        if (contextMenu && !e.target.closest('#context-menu') && !e.target.closest('.message')) {
            contextMenu.classList.add('hidden');
        }
        if (reactionsOverlay && !e.target.closest('#reactions-overlay') && !e.target.closest('#react-btn')) {
            reactionsOverlay.classList.add('hidden');
        }

        // Theme switching
        const themeOption = e.target.closest('.theme-option');
        if (themeOption) {
            const theme = themeOption.dataset.theme;
            setTheme(theme);
        }

        // Accent swatches
        const swatch = e.target.closest('.swatch');
        if (swatch) {
            const color = swatch.dataset.color;
            if (currentUser) {
                updateDoc(doc(db, "users", currentUser.uid), { accentColor: color })
                    .then(() => alert(`Accent set to ${color}!`))
                    .catch(err => console.error(err));
            }
        }
    });

    initEmojiPicker();

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
    setTheme(savedTheme);
};

export const setTheme = (theme) => {
    // Remove all possible themes
    const themes = ['dark-mode', 'theme-midnight', 'theme-sakura', 'theme-forest', 'theme-ocean', 'theme-sunset', 'theme-arctic'];
    document.documentElement.classList.remove(...themes);
    
    if (theme === 'dark') {
        document.documentElement.classList.add('dark-mode');
    } else if (theme !== 'light') {
        document.documentElement.classList.add(`theme-${theme}`);
    }
    
    localStorage.setItem('theme', theme);
    
    // Update active state in grid
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.theme === theme);
    });
};

const initEmojiPicker = () => {
    const picker = getEl('emoji-picker');
    const input = getEl('message-input');
    if (!picker) return;

    const getRecentEmojis = () => {
        try {
            return JSON.parse(localStorage.getItem('recent_emojis')) || [];
        } catch (e) { return []; }
    };

    const saveRecentEmoji = (emoji) => {
        let recent = getRecentEmojis();
        recent = [emoji, ...recent.filter(e => e !== emoji)].slice(0, 21);
        localStorage.setItem('recent_emojis', JSON.stringify(recent));
    };

    const emojiData = [
        { category: "Recent", emojis: getRecentEmojis() },
        { category: "Smileys", emojis: ['😊', '😂', '🤣', '❤️', '😍', '😒', '😭', '😘', '😩', '😔', '😁', '🤫', '😎', '🙄', '😤', '🥺', '😡', '😱', '😴', '🤤', '🫠', '🙃', '😏', '🥳', '🤓', '🧐', '😕', '😰', '🥶', '🥵', '🤯', '🤠', '🤡', '🤥', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '😈', '👿', '💀', '☠️', '💩', '🤡', '👻', '👽', '👾', '🤖'] },
        { category: "Body & People", emojis: ['👍', '👎', '👊', '✌️', '👌', '🤝', '👋', '🙏', '👏', '🙌', '💪', '🖕', '🤘', '🤟', '🤞', '🖖', '✋', '🤚', '🤏', '✍️', '🤳', '💅', '👂', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '👤', '👥', '🫂', '👶', '👧', '🧒', '👦', '👩', '🧑', '👨', '👩‍🦱', '🧑‍🦱', '👨‍🦱'] },
        { category: "Animals", emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🪳', '🕷️', '🕸️', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈'] },
        { category: "Food", emojis: ['🍎', '🍓', '🍒', '🍑', '🍋', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🫔', '🥗', '🥘', '🍲', '🫕', '🥣', '🍛', '🍜', '🍣', '🍤', '🍥', '🍡', '🥟', '🥠', '🥡', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🍵', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃', '🥤', '🧋', '🧃', '🧉', '🧊'] },
        { category: "Travel", emojis: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🛵', '🚲', '🛴', '🛹', '🛼', '🚏', '🛣️', '🛤️', '⛽', '🚨', '🚥', '🚦', '🛑', '🚧', '⚓', '⛵', '🛶', '🚤', '🛳️', '⛴️', '🚢', '✈️', '🛩️', '🛫', '🛬', '🪂', '💺', '🚁', '🚟', '🚠', '🚡', '🛰️', '🚀', '🛸', '🎆', '🎇', '🎑', '🏙️', '🏘️', '🏚️', '🏠', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭', '🏯', '🏰', '💒', '🗼', '🗽', '⛪', '🕌', '🛕', '🕍', '⛩️', '🕋', '⛲', '⛺', '🌁', '🌃', '🌄', '🌅', '🌆', '🌇', '🌉', '♨️', '🎠', '🎡', '🎢', '💈', '🎪'] },
        { category: "Objects", emojis: ['⌚', '📱', '📲', '💻', '⌨️', '🖱️', '🖲️', '🕹️', '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🪗', '⛓️', '🪝', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🧺', '🧻', '🚽', '🚰', '🚿', '🛁', '🛀', '🧼', '🪥', '🪒', '🧽', '🪣', '🧴', '🛎️', '🔑', '🗝️', '🚪', '🪑', '🛋️', '🛏️', '🛌', '🧸', '🪆', '🖼️', '🪞', '🪟', '🛍️', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🪅', '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷️', '🪧', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒️', '🗓️', '📆', '📅', '🗑️', '📇', '🗃️', '🗳️', '🗄️', '📋', '📁', '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇️', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '🖌️', '🖍️', '📝', '📁', '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇️', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '🖌️', '🖍️', '📝', '💼', '📁', '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇️', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '🖌️', '🖍️', '📝', '💼', '📁', '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇️', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '🖌️', '🖍️', '📝', '💼', '📁', '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇️', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '🖌️', '🖍️', '📝', '💼', '📁', '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇️', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '🖌️', '🖍️', '📝', '💼'] },
        { category: "Symbols", emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼', '⁉', '🔅', '   ', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '⚧️', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸️', '⏯️', '⏹️', '⏺️', '⏭️', '⏮️', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '♾️', '💲', '💱', '™️', '©️', '®️', '👁️‍🗨️', '🔚', '🔙', '🔛', '🔝', '🔜', '〰️', '➰', '➿', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔸', '🔹', '🔶', '🔷', '🔳', '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '🔈', '🔉', '🔊', '🔇', '📣', '📢', '🔔', '🔕', '🃏', '🎴', '🀄', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧'] }
    ];

    picker.innerHTML = `
        <div class="emoji-picker-header">
            <input type="text" class="emoji-search-input" placeholder="Search emojis..." id="emoji-search">
            <div class="category-tabs" id="category-tabs"></div>
        </div>
        <div class="emoji-picker-content" id="emoji-list-container"></div>
    `;

    const listContainer = getEl('emoji-list-container');
    const searchInput = getEl('emoji-search');
    const tabsContainer = getEl('category-tabs');

    const renderEmojis = (filter = "") => {
        listContainer.innerHTML = '';
        const currentRecent = getRecentEmojis();
        emojiData[0].emojis = currentRecent;

        emojiData.forEach((cat, idx) => {
            const filtered = cat.emojis.filter(e => !filter || e.includes(filter));
            if (filtered.length === 0) return;

            const title = document.createElement('div');
            title.className = 'emoji-category-title';
            title.id = `cat-${idx}`;
            title.textContent = cat.category;
            listContainer.appendChild(title);

            const grid = document.createElement('div');
            grid.className = 'emoji-grid';
            filtered.forEach(emoji => {
                const span = document.createElement('span');
                span.className = 'emoji-item';
                span.textContent = emoji;
                span.onclick = () => {
                    const start = input.selectionStart;
                    const end = input.selectionEnd;
                    input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
                    input.focus();
                    input.selectionStart = input.selectionEnd = start + emoji.length;
                    saveRecentEmoji(emoji);
                    picker.classList.add('hidden');
                };
                grid.appendChild(span);
            });
            listContainer.appendChild(grid);
        });
    };

    // Category Tabs logic
    const categoryIcons = ['🕒', '😊', '👋', '🦁', '🍎', '🚗', '⌚', '❤️'];
    emojiData.forEach((cat, idx) => {
        const btn = document.createElement('button');
        btn.className = 'category-tab-btn';
        btn.textContent = categoryIcons[idx];
        btn.onclick = () => {
            const target = getEl(`cat-${idx}`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        tabsContainer.appendChild(btn);
    });

    searchInput.oninput = (e) => renderEmojis(e.target.value);
    window.addEventListener('emoji-picker-open', () => renderEmojis(searchInput.value));
    renderEmojis();
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
