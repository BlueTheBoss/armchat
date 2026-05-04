import { loadUsers, setupChatSystem } from '../js/chat.js';
import * as firestoreMock from '../tests/mocks/firebase-firestore.js';
import * as authMock from '../tests/mocks/auth.js';

describe('chat.js tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Ensure DOM is clean and ready
        document.getElementById('user-list').innerHTML = '';
        document.getElementById('search-users').value = '';
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('loadUsers fetches users and renders them, ignoring current user', () => {
        const mockCurrentUid = 'uid_1';

        const mockUsers = [
            { uid: 'uid_1', username: 'CurrentUser' }, // Should be filtered out
            { uid: 'uid_2', username: 'TestUser2' },
            { uid: 'uid_3', email: 'test3@example.com' } // Fallback to email prefix
        ];

        firestoreMock.onSnapshot.mockImplementation((q, callback) => {
            callback({
                docs: mockUsers.map(u => ({ data: () => u }))
            });
            return () => {};
        });

        loadUsers(mockCurrentUid);

        expect(firestoreMock.query).toHaveBeenCalled();
        expect(firestoreMock.onSnapshot).toHaveBeenCalled();

        // Check if list items are rendered in the DOM
        const userListItems = document.querySelectorAll('#user-list li');
        expect(userListItems.length).toBe(2);

        expect(userListItems[0].querySelector('.user-name-text').textContent).toBe('TestUser2');
        expect(userListItems[1].querySelector('.user-name-text').textContent).toBe('test3');
    });

    test('searchUsers filters the rendered user list', () => {
        const mockCurrentUid = 'uid_1';

        const mockUsers = [
            { uid: 'uid_2', username: 'Alpha' },
            { uid: 'uid_3', username: 'Beta' }
        ];

        firestoreMock.onSnapshot.mockImplementation((q, callback) => {
            callback({
                docs: mockUsers.map(u => ({ data: () => u }))
            });
            return () => {};
        });

        loadUsers(mockCurrentUid);

        let userListItems = document.querySelectorAll('#user-list li');
        expect(userListItems.length).toBe(2);

        // Trigger search input
        const searchInput = document.getElementById('search-users');
        searchInput.value = 'alp';
        searchInput.dispatchEvent(new Event('input'));

        jest.advanceTimersByTime(300);

        userListItems = document.querySelectorAll('#user-list li');
        expect(userListItems.length).toBe(1);
        expect(userListItems[0].querySelector('.user-name-text').textContent).toBe('Alpha');
    });

    test('setupChatSystem adds a document when form is submitted', async () => {
        const mockCurrentUid = 'uid_1';

        const mockUsers = [{ uid: 'uid_2', username: 'TargetUser' }];

        // Mock onSnapshot behavior properly with `forEach` support for chat snapshots
        firestoreMock.onSnapshot.mockImplementation((q, callback) => {
            callback({
                exists: () => false, // For typing snapshot mock
                forEach: (fn) => {
                    // For messages snapshot
                    // No messages yet
                },
                docs: mockUsers.map(u => ({ data: () => u })) // For users snapshot
            });
            return () => {};
        });

        authMock.getCurrentUser.mockReturnValue({ uid: mockCurrentUid });

        loadUsers(mockCurrentUid);

        // Click the user to select them
        const userListItem = document.querySelector('#user-list li');
        userListItem.click();

        setupChatSystem(mockCurrentUid);

        const messageInput = document.getElementById('message-input');
        const messageForm = document.getElementById('message-form');

        messageInput.value = 'Hello World';

        // Simulate form submit
        messageForm.onsubmit(new Event('submit', { cancelable: true }));

        await Promise.resolve();

        expect(firestoreMock.addDoc).toHaveBeenCalled();
        const addDocCallArgs = firestoreMock.addDoc.mock.calls[0];

        const msgData = addDocCallArgs[1];
        expect(msgData.text).toBe('Hello World');
        expect(msgData.senderId).toBe(mockCurrentUid);
        expect(messageInput.value).toBe('');
    });
});
