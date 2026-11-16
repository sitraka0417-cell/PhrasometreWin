import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import config from '../config.json';

const app = initializeApp(config.firebase);
export const auth = getAuth(app);
// Cache hors ligne persistant : les modifications faites sans internet partent au retour du réseau
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({}),
  experimentalAutoDetectLongPolling: true
});
