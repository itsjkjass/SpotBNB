import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getAuth, Auth } from "firebase/auth";
// getReactNativePersistence is resolved from the RN build at runtime via package exports,
// but the firebase/auth type declarations don't include it - see firebase-js-sdk#8253.
// @ts-expect-error Ignore missing type definition for getReactNativePersistence
import { getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY, // eslint-disable-line no-undef
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, // eslint-disable-line no-undef
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID, // eslint-disable-line no-undef
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET, // eslint-disable-line no-undef
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, // eslint-disable-line no-undef
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID, // eslint-disable-line no-undef
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

export { app, auth, db, storage, functions };