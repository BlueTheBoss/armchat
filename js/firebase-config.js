// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDmng1VgItR3cIqGTWymAY91X6OCrHWdlo",
  authDomain: "armchat-3b39b.firebaseapp.com",
  projectId: "armchat-3b39b",
  storageBucket: "armchat-3b39b.firebasestorage.app",
  messagingSenderId: "453549249637",
  appId: "1:453549249637:web:d28b274f8110bb61d2228c",
  measurementId: "G-HSSDSC3M68"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, db, storage, googleProvider };

