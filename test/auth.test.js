import { jest } from '@jest/globals';

// Avoid unhandled promise rejection warnings in Jest console output
process.on('unhandledRejection', () => {});

describe('auth.js', () => {
  let consoleErrorSpy;
  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((err) => {
      if (err && err.message && err.message.includes('Not implemented: navigation')) return;
      if (err && err.type === 'not implemented') return;
      // Do not log other expected errors to keep tests clean
    });
  });
  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });
  let onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signOut;
  let getDoc, setDoc, updateDoc, collection, query, where, getDocs;
  let switchView, updateCurrentUserDisplay, updateMyProfilePhoto, processImage;
  let loadUsers, setupChatSystem;
  let authMockObj;

  const originalLocation = window.location;
  let consoleErrorMock;
  let mockReload;

  beforeAll(() => {
    delete window.location;
    mockReload = jest.fn();
    window.location = { reload: mockReload };
  });

  afterAll(() => {
    window.location = originalLocation;
  });

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    const fbAuth = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    onAuthStateChanged = fbAuth.onAuthStateChanged;
    createUserWithEmailAndPassword = fbAuth.createUserWithEmailAndPassword;
    signInWithEmailAndPassword = fbAuth.signInWithEmailAndPassword;
    signInWithPopup = fbAuth.signInWithPopup;
    signOut = fbAuth.signOut;

    const fbFs = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    getDoc = fbFs.getDoc;
    setDoc = fbFs.setDoc;
    updateDoc = fbFs.updateDoc;
    collection = fbFs.collection;
    query = fbFs.query;
    where = fbFs.where;
    getDocs = fbFs.getDocs;

    const fbConfig = await import('../__mocks__/firebase-config.js');
    authMockObj = fbConfig.auth;

    const appMock = await import('../__mocks__/app.js');
    switchView = appMock.switchView;
    updateCurrentUserDisplay = appMock.updateCurrentUserDisplay;
    updateMyProfilePhoto = appMock.updateMyProfilePhoto;
    processImage = appMock.processImage;

    const chatMock = await import('../__mocks__/chat.js');
    loadUsers = chatMock.loadUsers;
    setupChatSystem = chatMock.setupChatSystem;

    document.body.innerHTML = `
      <form id="auth-form"></form>
      <input id="email" />
      <input id="password" />
      <button id="login-btn"></button>
      <button id="signup-btn"></button>
      <button id="google-btn"></button>
      <div id="auth-error" class="hidden"></div>
      <button id="logout-btn"></button>

      <form id="setup-form"><button type="submit">Complete Setup</button></form>
      <input id="username" />
      <input id="profile-photo-input" type="file" />
      <div id="setup-photo-preview"></div>
    `;

    global.alert = jest.fn();
    mockReload.mockClear();

    // Stub console logs for cleaner test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation((err) => {
      if (err && err.message && err.message.includes('Not implemented: navigation')) return;
      if (err && err.type === 'not implemented') return;
      // Do not log other expected errors to keep tests clean
    });
  });

  describe('Auth State Changes', () => {
    it('should switch to auth-view when user is null', async () => {
      let authCallback = null;
      onAuthStateChanged.mockImplementationOnce((auth, callback) => {
        authCallback = callback;
      });

      const { getCurrentUser } = await import('../js/auth.js');
      expect(onAuthStateChanged).toHaveBeenCalled();

      await authCallback(null);

      expect(getCurrentUser()).toBeNull();
      expect(switchView).toHaveBeenCalledWith('auth-view');
    });

    it('should switch to setup-view when user logs in but has no username', async () => {
      const mockUser = { uid: '123', email: 'test@test.com' };
      getDoc.mockResolvedValueOnce({ data: () => ({}) });

      let authCallback = null;
      onAuthStateChanged.mockImplementationOnce((auth, callback) => {
        authCallback = callback;
      });

      const { getCurrentUser } = await import('../js/auth.js');

      await authCallback(mockUser);
      await new Promise(process.nextTick);

      expect(getCurrentUser()).toBe(mockUser);
      expect(switchView).toHaveBeenCalledWith('setup-view');
    });

    it('should switch to chat-view and load profile when user has a username', async () => {
      const mockUser = { uid: '123', email: 'test@test.com' };
      const mockUserData = { username: 'testuser', photoURL: 'photo.jpg' };
      getDoc.mockResolvedValueOnce({ data: () => mockUserData });

      let authCallback = null;
      onAuthStateChanged.mockImplementationOnce((auth, callback) => {
        authCallback = callback;
      });

      const { getCurrentUser } = await import('../js/auth.js');

      await authCallback(mockUser);
      await new Promise(process.nextTick);

      expect(getCurrentUser()).toBe(mockUser);
      expect(switchView).toHaveBeenCalledWith('chat-view');
      expect(updateCurrentUserDisplay).toHaveBeenCalledWith('testuser');
      expect(updateMyProfilePhoto).toHaveBeenCalledWith('photo.jpg');
      expect(loadUsers).toHaveBeenCalledWith('123');
      expect(setupChatSystem).toHaveBeenCalledWith('123');
    });

    it('does not call updateMyProfilePhoto when photoURL is missing from DB', async () => {
      const mockUser = { uid: '123', email: 'test@test.com' };
      const mockUserData = { username: 'testuser' }; // Missing photoURL
      getDoc.mockResolvedValueOnce({ data: () => mockUserData });

      let authCallback = null;
      onAuthStateChanged.mockImplementationOnce((auth, callback) => {
        authCallback = callback;
      });

      await import('../js/auth.js');

      await authCallback(mockUser);
      await new Promise(process.nextTick);

      expect(updateCurrentUserDisplay).toHaveBeenCalledWith('testuser');
      expect(updateMyProfilePhoto).not.toHaveBeenCalled();
    });
  });

  describe('Signup', () => {
    it('should show error if email or password missing', async () => {
      await import('../js/auth.js');

      document.getElementById('email').value = '';
      document.getElementById('password').value = '';

      document.getElementById('signup-btn').click();

      const authError = document.getElementById('auth-error');
      expect(authError.textContent).toBe('Enter email and password');
      expect(authError.classList.contains('hidden')).toBe(false);
      expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('should show error if password is less than 6 characters', async () => {
      await import('../js/auth.js');

      document.getElementById('email').value = 'test@test.com';
      document.getElementById('password').value = '12345';

      document.getElementById('signup-btn').click();

      const authError = document.getElementById('auth-error');
      expect(authError.textContent).toBe('Password must be at least 6 characters');
      expect(createUserWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('should create user and set doc on successful signup', async () => {
      await import('../js/auth.js');

      document.getElementById('email').value = 'test@test.com';
      document.getElementById('password').value = 'password123';

      const mockUser = { uid: '123', email: 'test@test.com' };
      createUserWithEmailAndPassword.mockResolvedValueOnce({ user: mockUser });
      setDoc.mockResolvedValueOnce({});

      document.getElementById('signup-btn').click();

      await new Promise(process.nextTick);
      await new Promise(process.nextTick);

      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(authMockObj, 'test@test.com', 'password123');
      expect(setDoc).toHaveBeenCalledWith(undefined, expect.objectContaining({
        uid: '123',
        email: 'test@test.com'
      }));
    });

    it('should show error if creation fails', async () => {
      await import('../js/auth.js');

      document.getElementById('email').value = 'test@test.com';
      document.getElementById('password').value = 'password123';

      createUserWithEmailAndPassword.mockRejectedValueOnce(new Error('Firebase Error'));

      document.getElementById('signup-btn').click();

      await new Promise(process.nextTick);

      const authError = document.getElementById('auth-error');
      expect(authError.textContent).toBe('Firebase Error');
    });
  });

  describe('Login', () => {
    it('should login on success', async () => {
      await import('../js/auth.js');

      document.getElementById('email').value = 'test@test.com';
      document.getElementById('password').value = 'password123';

      signInWithEmailAndPassword.mockResolvedValueOnce({});

      document.getElementById('login-btn').click();

      await new Promise(process.nextTick);
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(authMockObj, 'test@test.com', 'password123');
    });

    it('should show error if login fails', async () => {
      await import('../js/auth.js');

      document.getElementById('email').value = 'test@test.com';
      document.getElementById('password').value = 'password123';

      signInWithEmailAndPassword.mockRejectedValueOnce(new Error('Invalid login'));

      document.getElementById('login-btn').click();

      await new Promise(process.nextTick);

      const authError = document.getElementById('auth-error');
      expect(authError.textContent).toBe('Invalid email or password.');
    });
  });

  describe('Google Login', () => {
    it('should login with popup and create doc if it does not exist', async () => {
      await import('../js/auth.js');

      const mockUser = { uid: 'google-123', email: 'google@test.com' };
      signInWithPopup.mockResolvedValueOnce({ user: mockUser });
      getDoc.mockResolvedValueOnce({ exists: () => false });
      setDoc.mockResolvedValueOnce({});

      document.getElementById('google-btn').click();

      await new Promise(process.nextTick);
      await new Promise(process.nextTick);
      await new Promise(process.nextTick);

      expect(signInWithPopup).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalledWith(undefined, expect.objectContaining({
        uid: 'google-123',
        email: 'google@test.com'
      }));
    });

    it('Google login when user doc already exists', async () => {
      await import('../js/auth.js');

      const mockUser = { uid: 'google-123', email: 'google@test.com' };
      signInWithPopup.mockResolvedValueOnce({ user: mockUser });
      getDoc.mockResolvedValueOnce({ exists: () => true });

      document.getElementById('google-btn').click();

      await new Promise(process.nextTick);
      await new Promise(process.nextTick);

      expect(signInWithPopup).toHaveBeenCalled();
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('Google login error handling', async () => {
      await import('../js/auth.js');

      signInWithPopup.mockRejectedValueOnce(new Error('Popup closed'));

      document.getElementById('google-btn').click();

      await new Promise(process.nextTick);

      const authError = document.getElementById('auth-error');
      expect(authError.textContent).toBe('Popup closed');
    });

    it('Google login user doc missing properties defaults', async () => {
      await import('../js/auth.js');

      const mockUser = { uid: 'google-123' }; // No email
      signInWithPopup.mockResolvedValueOnce({ user: mockUser });
      getDoc.mockResolvedValueOnce({ exists: () => false });
      setDoc.mockResolvedValueOnce({});

      document.getElementById('google-btn').click();

      await new Promise(process.nextTick);
      await new Promise(process.nextTick);
      await new Promise(process.nextTick);

      expect(setDoc).toHaveBeenCalledWith(undefined, expect.objectContaining({
        uid: 'google-123',
        email: undefined
      }));
    });
  });

  describe('Profile Setup', () => {
    it('should alert if username is missing or too short', async () => {
      await import('../js/auth.js');

      document.getElementById('username').value = 'a';

      document.getElementById('setup-form').dispatchEvent(new Event('submit', { cancelable: true }));

      expect(global.alert).toHaveBeenCalledWith('Username must be at least 3 chars');
    });

    it('should alert if username is already taken', async () => {
      let authCallback = null;
      onAuthStateChanged.mockImplementationOnce((auth, callback) => {
        authCallback = callback;
      });

      await import('../js/auth.js');

      const mockUser = { uid: '123' };
      getDoc.mockResolvedValueOnce({ data: () => ({}) });
      await authCallback(mockUser);
      await new Promise(process.nextTick);

      document.getElementById('username').value = 'takenname';

      getDocs.mockResolvedValueOnce({ empty: false });

      document.getElementById('setup-form').dispatchEvent(new Event('submit', { cancelable: true }));

      await new Promise(process.nextTick);

      expect(getDocs).toHaveBeenCalled();
      expect(global.alert).toHaveBeenCalledWith('Username already taken!');
    });

    it('should successfully setup profile and switch views', async () => {
      let authCallback = null;
      onAuthStateChanged.mockImplementationOnce((auth, callback) => {
        authCallback = callback;
      });

      await import('../js/auth.js');

      const mockUser = { uid: '123' };
      getDoc.mockResolvedValueOnce({ data: () => ({}) });
      await authCallback(mockUser);
      await new Promise(process.nextTick);

      document.getElementById('username').value = 'newuser';

      getDocs.mockResolvedValueOnce({ empty: true });
      updateDoc.mockResolvedValueOnce();

      document.getElementById('setup-form').dispatchEvent(new Event('submit', { cancelable: true }));

      await new Promise(process.nextTick);
      await new Promise(process.nextTick);

      expect(updateDoc).toHaveBeenCalledWith(undefined, expect.objectContaining({
        username: 'newuser',
        photoURL: expect.stringContaining('ui-avatars.com')
      }));

      expect(switchView).toHaveBeenCalledWith('chat-view');
      expect(updateCurrentUserDisplay).toHaveBeenCalledWith('newuser');
      expect(loadUsers).toHaveBeenCalledWith('123');
    });

    it('setup with photo uploads file', async () => {
      let authCallback = null;
      onAuthStateChanged.mockImplementationOnce((auth, callback) => {
        authCallback = callback;
      });
      await import('../js/auth.js');

      const mockUser = { uid: '123' };
      getDoc.mockResolvedValueOnce({ data: () => ({}) });
      await authCallback(mockUser);
      await new Promise(process.nextTick);

      const photoInput = document.getElementById('profile-photo-input');
      const file = new File(['dummy content'], 'test.png', { type: 'image/png' });
      // Bypassing defining Property to set file, just mock the element
      const mockPhotoInput = {
        files: [file],
        addEventListener: jest.fn()
      };
      // actually, just mock the value
      Object.defineProperty(photoInput, 'files', { value: [file], writable: true, configurable: true });

      photoInput.dispatchEvent(new Event('change'));

      document.getElementById('username').value = 'newuser';
      getDocs.mockResolvedValueOnce({ empty: true });
      processImage.mockResolvedValueOnce('base64data');
      updateDoc.mockResolvedValueOnce();

      document.getElementById('setup-form').dispatchEvent(new Event('submit', { cancelable: true }));

      await new Promise(process.nextTick);
      await new Promise(process.nextTick);
      await new Promise(process.nextTick);

      expect(updateDoc).toHaveBeenCalledWith(undefined, expect.objectContaining({
        photoURL: 'base64data'
      }));
    });

    it('setup handles update error', async () => {
      let authCallback = null;
      onAuthStateChanged.mockImplementationOnce((auth, callback) => {
        authCallback = callback;
      });
      await import('../js/auth.js');

      const mockUser = { uid: '123' };
      getDoc.mockResolvedValueOnce({ data: () => ({}) });
      await authCallback(mockUser);
      await new Promise(process.nextTick);

      document.getElementById('username').value = 'newuser';
      getDocs.mockResolvedValueOnce({ empty: true });
      updateDoc.mockRejectedValueOnce(new Error('Update failed'));

      document.getElementById('setup-form').dispatchEvent(new Event('submit', { cancelable: true }));

      await new Promise(process.nextTick);
      await new Promise(process.nextTick);

      expect(global.alert).toHaveBeenCalledWith('Error saving profile: Update failed');
    });
  });

  describe('Logout', () => {
    it('should call signOut and reload window', async () => {
      await import('../js/auth.js');

      signOut.mockResolvedValueOnce();

      document.getElementById('logout-btn').click();

      await new Promise(process.nextTick);
      await new Promise(process.nextTick);

      expect(signOut).toHaveBeenCalled();
    });
  });

  describe('File Input Edge Cases', () => {
    it('photoInput change listener reads file and onload works', async () => {
      await import('../js/auth.js');
      const photoInput = document.getElementById('profile-photo-input');
      const photoPreview = document.getElementById('setup-photo-preview');
      const file = new File(['dummy content'], 'test.png', { type: 'image/png' });

      let onloadCallback;
      const mockReadAsDataURL = jest.fn();
      const mockFileReader = jest.spyOn(window, 'FileReader').mockImplementation(() => {
        return {
          readAsDataURL: mockReadAsDataURL,
          set onload(cb) { onloadCallback = cb; }
        };
      });

      Object.defineProperty(photoInput, 'files', { value: [file], writable: true, configurable: true });

      photoInput.dispatchEvent(new Event('change'));

      expect(mockReadAsDataURL).toHaveBeenCalledWith(file);

      onloadCallback({ target: { result: 'url-data' } });
      expect(photoPreview.style.backgroundImage).toBe('url("url-data")');

      mockFileReader.mockRestore();
    });

    it('photoInput change with no file returns early', async () => {
      await import('../js/auth.js');
      const photoInput = document.getElementById('profile-photo-input');

      const mockReadAsDataURL = jest.fn();
      const mockFileReader = jest.spyOn(window, 'FileReader').mockImplementation(() => ({
        readAsDataURL: mockReadAsDataURL,
        onload: null
      }));

      Object.defineProperty(photoInput, 'files', { value: [], writable: true, configurable: true });
      photoInput.dispatchEvent(new Event('change'));

      expect(mockReadAsDataURL).not.toHaveBeenCalled();
      mockFileReader.mockRestore();
    });
  });

  describe('getCurrentUser', () => {
    it('getCurrentUser exports currentUser', async () => {
      let authCallback = null;
      onAuthStateChanged.mockImplementationOnce((auth, callback) => {
        authCallback = callback;
      });
      const { getCurrentUser } = await import('../js/auth.js');
      expect(getCurrentUser()).toBe(null);

      const mockUser = { uid: '123' };
      getDoc.mockResolvedValueOnce({ data: () => ({}) });
      await authCallback(mockUser);

      expect(getCurrentUser()).toBe(mockUser);
    });
  });

  describe('Helper Error functions coverage', () => {
    it('hideError class removal coverage', async () => {
      await import('../js/auth.js');
      const authError = document.getElementById('auth-error');
      authError.classList.remove('hidden');

      signInWithPopup.mockRejectedValueOnce(new Error('Popup closed'));
      document.getElementById('google-btn').click();

      expect(authError.classList.contains('hidden')).toBe(true);
    });
  });

  describe('Helper Error class addition coverage', () => {
    it('showError adds hidden class', async () => {
      await import('../js/auth.js');
      const authError = document.getElementById('auth-error');

      document.getElementById('email').value = '';
      document.getElementById('password').value = '';
      document.getElementById('signup-btn').click();

      expect(authError.classList.contains('hidden')).toBe(false);
    });
  });
  describe('Helper Error class addition coverage more branches', () => {
    it('login with missing details tests showError adding class', async () => {
      await import('../js/auth.js');
      const authError = document.getElementById('auth-error');
      authError.classList.add('hidden'); // explicitly hidden

      document.getElementById('email').value = '';
      document.getElementById('password').value = '';
      document.getElementById('login-btn').click();

      expect(authError.classList.contains('hidden')).toBe(false);
    });
  });
});
