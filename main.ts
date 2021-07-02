import "https://deno.land/x/xhr@0.1.0/mod.ts";

import { initializeApp } from "https://cdn.skypack.dev/@firebase/app@exp?dts";
import {
  getAuth,
  signInWithEmailAndPassword,
} from "https://cdn.skypack.dev/@firebase/auth@exp?dts";
import {
  collection,
  getDocs,
  getFirestore,
} from "https://cdn.skypack.dev/@firebase/firestore@exp?dts";

import { Application, Router } from "https://deno.land/x/oak@v7.7.0/mod.ts";

import { Storage } from "./cookieStorage.ts";

const sessionStore = new Storage();
if (!("sessionStorage" in globalThis)) {
  Object.defineProperty(globalThis, "sessionStorage", {
    value: sessionStore,
    writable: false,
    enumerable: true,
    configurable: true,
  });
}

const localStore = new Storage();
if (!("localStorage" in globalThis)) {
  Object.defineProperty(globalThis, "localStorage", {
    value: localStore,
    writable: false,
    enumerable: true,
    configurable: true,
  });
}

const firebase = initializeApp({
  apiKey: "AIzaSyDu6yo0rhstSThmpFEDQDiFvOnTJrMtv6c",
  authDomain: "theropod-f4077.firebaseapp.com",
  projectId: "theropod-f4077",
  storageBucket: "theropod-f4077.appspot.com",
  messagingSenderId: "391024490546",
  appId: "1:391024490546:web:5fb4ab97e07b5af869e42b",
});

const auth = getAuth(firebase);

const router = new Router();

router.get("/", (ctx) => {
  ctx.response.body = "Hello world";
});

router.get("/users", async (ctx) => {
  const userCreds = await signInWithEmailAndPassword(
    auth,
    Deno.env.get("THEROPOD_USERNAME"),
    Deno.env.get("THEROPOD_PASSWORD"),
  );
  console.log("userCreds", userCreds);

  const db = getFirestore(firebase);

  const querySnapshot = await getDocs(collection(db, "users"));
  ctx.response.body = querySnapshot.docs.map((doc) => doc.data());
  ctx.response.type = "json";
});

const app = new Application({
  keys: JSON.parse(Deno.env.get("THEROPOD_KEYS") ?? `["secret"]`),
});

app.use(async (ctx, next) => {
  const localStorageKeysStr = ctx.cookies.get("TP_KEYS");
  if (localStorageKeysStr) {
    try {
      const keys: string[] = JSON.parse(localStorageKeysStr);
      const entries: [string, string][] = [];
      for (const key of keys) {
        const value = ctx.cookies.get(`TP_${key}`);
        if (value) {
          entries.push([key, value]);
        }
        localStore.hydrate(entries);
      }
    } catch {
      //
    }
  }
  console.log("storage", [...localStore.entries()]);
  await next();
  const keys = [...localStore.keys()];
  if (keys.length) {
    ctx.cookies.set("TP_KEYS", JSON.stringify(keys));
    for (const [key, value] of localStore.entries()) {
      ctx.cookies.set(`TP_${key}`, value);
    }
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

addEventListener("fetch", app.fetchEventHandler());
