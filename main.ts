import "https://deno.land/x/xhr@0.1.0/mod.ts";

import { initializeApp } from "https://cdn.skypack.dev/@firebase/app@exp?dts";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInWithEmailAndPassword,
} from "https://cdn.skypack.dev/@firebase/auth@exp?dts";
import {
  collection,
  getDocs,
  getFirestore,
} from "https://cdn.skypack.dev/@firebase/firestore@exp?dts";

import { bold, cyan, green } from "https://deno.land/std@0.100.0/fmt/colors.ts";

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
await setPersistence(auth, browserLocalPersistence);

const router = new Router();

router.get("/", (ctx) => {
  ctx.response.body = "Hello world";
});

router.get("/users", async (ctx) => {
  await signInWithEmailAndPassword(
    auth,
    Deno.env.get("THEROPOD_USERNAME"),
    Deno.env.get("THEROPOD_PASSWORD"),
  );

  const db = getFirestore(firebase);

  const querySnapshot = await getDocs(collection(db, "users"));
  ctx.response.body = querySnapshot.docs.map((doc) => doc.data());
  ctx.response.type = "json";
});

const app = new Application({
  keys: JSON.parse(Deno.env.get("THEROPOD_KEYS") ?? `["secret"]`),
});

app.use(async (ctx, next) => {
  await next();
  const rt = ctx.response.headers.get("X-Response-Time");
  console.log(
    `${green(ctx.request.method)} ${cyan(ctx.request.url.pathname)} - ${
      bold(
        String(rt),
      )
    }`,
  );
});

app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.response.headers.set("X-Response-Time", `${ms}ms`);
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
  await next();
  const keys = [...localStore.keys()];
  if (keys.length) {
    ctx.cookies.set("TP_KEYS", JSON.stringify(keys));
    for (const key of localStore.keysSet()) {
      ctx.cookies.set(`TP_${key}`, localStore.getItem(key), {
        overwrite: true,
      });
    }
  }
  for (const key of localStore.keysDeleted()) {
    ctx.cookies.delete(`TP_${key}`, { overwrite: true });
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

addEventListener("fetch", app.fetchEventHandler());
