import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const appId = rawAppId.replace(/\//g, '_');

const firebaseConfig = {
    apiKey: "AIzaSyAQsBf1CZB5tWYWGBJPLGtuIzqgAbHCi4Y",
    authDomain: "mahtii-4e508.firebaseapp.com",
    projectId: "mahtii-4e508",
    storageBucket: "mahtii-4e508.appspot.com",
    messagingSenderId: "731819768757",
    appId: "1:731819768757:web:e27cb2ada52915f60877fc",
    measurementId: "G-V6431LNWVM"
};

const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Inicialização do Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, appId, initialAuthToken };
