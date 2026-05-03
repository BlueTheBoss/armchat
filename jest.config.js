// We need to require `jest.setup.js` in jest.config.js
module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/tests/setup.js'],
  moduleNameMapper: {
    '^https://www.gstatic.com/firebasejs/.*/(.*)\\.js$': '<rootDir>/tests/mocks/$1.js',
    '^https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js$': '<rootDir>/tests/mocks/firebase-firestore.js',
    '^./firebase-config.js$': '<rootDir>/tests/mocks/firebase-config.js',
    '^./auth.js$': '<rootDir>/tests/mocks/auth.js',
    '^./app.js$': '<rootDir>/tests/mocks/app.js'
  },
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
};
