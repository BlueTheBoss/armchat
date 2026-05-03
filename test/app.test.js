describe('processImage', () => {
    let processImage;

    beforeEach(async () => {
        jest.resetModules();

        // Mock Firebase Firestore imports
        jest.mock('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js', () => ({
            doc: jest.fn(),
            updateDoc: jest.fn(),
            getDoc: jest.fn(),
            setDoc: jest.fn(),
            collection: jest.fn(),
            query: jest.fn(),
            where: jest.fn(),
            getDocs: jest.fn(),
        }), { virtual: true });

        // Mock Firebase Auth imports
        jest.mock('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js', () => ({
            onAuthStateChanged: jest.fn(),
            createUserWithEmailAndPassword: jest.fn(),
            signInWithEmailAndPassword: jest.fn(),
            signInWithPopup: jest.fn(),
            signOut: jest.fn(),
        }), { virtual: true });

        jest.mock('../js/firebase-config.js', () => ({
            db: {},
            auth: {}
        }), { virtual: true });

        jest.mock('../js/auth.js', () => ({
            getCurrentUser: jest.fn(() => ({ uid: '123' }))
        }), { virtual: true });

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
          <div id="auth-view"></div>
          <div id="chat-view"></div>
          <div id="setup-view"></div>
          <div id="messages-container"></div>
          <div id="current-user-display"></div>
          <div id="my-profile-photo"></div>
          <div id="logo-button"></div>
          <div id="profile-menu"></div>
          <div id="change-photo-btn"></div>
          <div id="change-photo-input"></div>
          <div id="user-status-select"></div>
        `;

        const app = await import('../js/app.js');
        processImage = app.processImage;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should not resize if both dimensions are under maxDimension', async () => {
        // Mock FileReader
        const mockFileReader = {
            readAsDataURL: jest.fn(function() {
                setTimeout(() => {
                    if (this.onload) this.onload({ target: { result: 'data:image/jpeg;base64,test' } });
                }, 0);
            })
        };
        global.FileReader = jest.fn(() => mockFileReader);

        // Mock Image
        const mockImage = {
            width: 400,
            height: 300,
        };
        Object.defineProperty(mockImage, 'src', {
            set: function(val) {
                this._src = val;
                setTimeout(() => {
                    if (this.onload) this.onload();
                }, 0);
            },
            get: function() { return this._src; }
        });
        global.Image = jest.fn(() => mockImage);

        // Mock Canvas
        const mockContext = {
            drawImage: jest.fn()
        };
        const mockCanvas = {
            getContext: jest.fn(() => mockContext),
            toDataURL: jest.fn(() => 'data:image/jpeg;base64,resized')
        };
        const originalCreateElement = document.createElement.bind(document);
        jest.spyOn(document, 'createElement').mockImplementation((tag) => {
            if (tag === 'canvas') return mockCanvas;
            return originalCreateElement(tag);
        });

        const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
        const result = await processImage(file, 800);

        expect(result).toBe('data:image/jpeg;base64,resized');
        expect(mockCanvas.width).toBe(400);
        expect(mockCanvas.height).toBe(300);
    });

    it('should process and resize an image based on width', async () => {
        // Mock FileReader
        const mockFileReader = {
            readAsDataURL: jest.fn(function() {
                setTimeout(() => {
                    if (this.onload) this.onload({ target: { result: 'data:image/jpeg;base64,test' } });
                }, 0);
            })
        };
        global.FileReader = jest.fn(() => mockFileReader);

        // Mock Image
        const mockImage = {
            width: 1000,
            height: 500,
        };
        Object.defineProperty(mockImage, 'src', {
            set: function(val) {
                this._src = val;
                setTimeout(() => {
                    if (this.onload) this.onload();
                }, 0);
            },
            get: function() { return this._src; }
        });
        global.Image = jest.fn(() => mockImage);

        // Mock Canvas
        const mockContext = {
            drawImage: jest.fn()
        };
        const mockCanvas = {
            getContext: jest.fn(() => mockContext),
            toDataURL: jest.fn(() => 'data:image/jpeg;base64,resized')
        };
        const originalCreateElement = document.createElement.bind(document);
        jest.spyOn(document, 'createElement').mockImplementation((tag) => {
            if (tag === 'canvas') return mockCanvas;
            return originalCreateElement(tag);
        });

        const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
        const result = await processImage(file, 800);

        expect(result).toBe('data:image/jpeg;base64,resized');
        expect(mockCanvas.width).toBe(800);
        expect(mockCanvas.height).toBe(400); // 500 * (800 / 1000)
    });

    it('should process and resize an image based on height', async () => {
        // Mock FileReader
        const mockFileReader = {
            readAsDataURL: jest.fn(function() {
                setTimeout(() => {
                    if (this.onload) this.onload({ target: { result: 'data:image/jpeg;base64,test' } });
                }, 0);
            })
        };
        global.FileReader = jest.fn(() => mockFileReader);

        // Mock Image
        const mockImage = {
            width: 500,
            height: 1000,
        };
        Object.defineProperty(mockImage, 'src', {
            set: function(val) {
                this._src = val;
                setTimeout(() => {
                    if (this.onload) this.onload();
                }, 0);
            },
            get: function() { return this._src; }
        });
        global.Image = jest.fn(() => mockImage);

        // Mock Canvas
        const mockContext = {
            drawImage: jest.fn()
        };
        const mockCanvas = {
            getContext: jest.fn(() => mockContext),
            toDataURL: jest.fn(() => 'data:image/jpeg;base64,resized')
        };
        const originalCreateElement = document.createElement.bind(document);
        jest.spyOn(document, 'createElement').mockImplementation((tag) => {
            if (tag === 'canvas') return mockCanvas;
            return originalCreateElement(tag);
        });

        const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
        const result = await processImage(file, 800);

        expect(result).toBe('data:image/jpeg;base64,resized');
        expect(mockCanvas.height).toBe(800);
        expect(mockCanvas.width).toBe(400); // 500 * (800 / 1000)
    });

    it('should handle FileReader error', async () => {
        // Mock FileReader with error
        const mockFileReader = {
            readAsDataURL: jest.fn(function() {
                setTimeout(() => {
                    if (this.onerror) this.onerror(new Error('FileReader error'));
                }, 0);
            })
        };
        global.FileReader = jest.fn(() => mockFileReader);

        const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
        await expect(processImage(file, 800)).rejects.toThrow('FileReader error');
    });

    it('should handle Image load error', async () => {
        // Mock FileReader
        const mockFileReader = {
            readAsDataURL: jest.fn(function() {
                setTimeout(() => {
                    if (this.onload) this.onload({ target: { result: 'data:image/jpeg;base64,test' } });
                }, 0);
            })
        };
        global.FileReader = jest.fn(() => mockFileReader);

        // Mock Image with error
        const mockImage = {};
        Object.defineProperty(mockImage, 'src', {
            set: function(val) {
                this._src = val;
                setTimeout(() => {
                    if (this.onerror) this.onerror(new Error('Image error'));
                }, 0);
            },
            get: function() { return this._src; }
        });
        global.Image = jest.fn(() => mockImage);

        const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
        await expect(processImage(file, 800)).rejects.toThrow('Image error');
    });
});
