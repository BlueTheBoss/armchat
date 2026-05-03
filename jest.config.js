module.exports = {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
  moduleNameMapper: {
    '^./firebase-config.js$': '<rootDir>/__mocks__/firebase-config.js',
    '^https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js$': '<rootDir>/__mocks__/firebase-auth.js',
    '^https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js$': '<rootDir>/__mocks__/firebase-firestore.js',
    '^./app.js$': '<rootDir>/__mocks__/app.js',
    '^./chat.js$': '<rootDir>/__mocks__/chat.js',
  }
};
