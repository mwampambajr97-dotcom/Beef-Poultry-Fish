// =====================================================
// Firebase project configuration and shared instances.
//
// These values are NOT secret. Firebase's actual security comes
// from the Firestore security rules (see firestore.rules), not
// from hiding this config — it is normal and expected for this
// to be visible in a public GitHub repo.
// =====================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyBB4Lf6sOzvyeI6LQTU0d0rG2f8m8qCAOA",
    authDomain: "must-meat-science-lab.firebaseapp.com",
    projectId: "must-meat-science-lab",
    storageBucket: "must-meat-science-lab.firebasestorage.app",
    messagingSenderId: "146056101814",
    appId: "1:146056101814:web:a3a5e48ef9d192d3e6cb17"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
