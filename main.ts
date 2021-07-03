import "https://deno.land/x/xhr@0.1.0/mod.ts";

// @deno-types=https://cdn.skypack.dev/-/firebase@v8.7.0-MrU9zUCxcEMCl2U7Tuz6/dist=es2020,mode=types/index.d.ts
import firebase from "https://cdn.skypack.dev/firebase@8.7.0/app";
import "https://cdn.skypack.dev/firebase@8.7.0/auth";
import "https://cdn.skypack.dev/firebase@8.7.0/firestore";

import * as colors from "https://deno.land/std@0.100.0/fmt/colors.ts";
import { Application, Router } from "https://deno.land/x/oak@v7.7.0/mod.ts";

// This is a "hack" to take local storage under Deploy and set them as cookies
// in the client.  Currently, I am using oak's cookie management to actually
// save and restore the keys and values.
import { Storage } from "./cookieStorage.ts";

// This is the "client" initialization keys, these end up in a client
// un-encrypted but you still need a login to the app to do anything.
const theropod = firebase.initializeApp({
  apiKey: "AIzaSyDu6yo0rhstSThmpFEDQDiFvOnTJrMtv6c",
  authDomain: "theropod-f4077.firebaseapp.com",
  projectId: "theropod-f4077",
  storageBucket: "theropod-f4077.appspot.com",
  messagingSenderId: "391024490546",
  appId: "1:391024490546:web:5fb4ab97e07b5af869e42b",
}, "theropod");

// This gets a handle to the auth part
const auth = firebase.auth(theropod);
auth.setPersistence("local");

// We only do this if we don't have session storage.
const sessionStore = new Storage();
if (!("sessionStorage" in globalThis)) {
  Object.defineProperty(globalThis, "sessionStorage", {
    value: sessionStore,
    writable: false,
    enumerable: true,
    configurable: true,
  });
}

const users = new Map<string, firebase.User>();

// We only do this if we don't have local storage.
const localStore = new Storage();
if (!("localStorage" in globalThis)) {
  Object.defineProperty(globalThis, "localStorage", {
    value: localStore,
    writable: false,
    enumerable: true,
    configurable: true,
  });
}

const router = new Router();

router.get("/", (ctx) => {
  ctx.response.body = "Hello world";
});

router.get("/users", async (ctx) => {
  console.log("/users");
  const db = firebase.firestore(theropod);
  const querySnapshot = await db.collection("users").get();
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
    `${colors.green(ctx.request.method)} ${
      colors.cyan(ctx.request.url.pathname)
    } - ${colors.bold(String(rt))}`,
  );
});

app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.response.headers.set("X-Response-Time", `${ms}ms`);
});

// this is the middleware that takes local-storage to and from cookies, it
// hydrates the store based on `"TP_KEYS"` and then when the rest of the
// middleware has run, it sets or deletes any values that have changed.
// It is important to base64 encode the values, as we need to make sure the
// values don't contain anything that might look like a cookie argument, which
// often values do.
app.use(async (ctx, next) => {
  console.log(":localStorage");
  const localStorageKeysStr = ctx.cookies.get("TP_KEYS");
  if (localStorageKeysStr) {
    try {
      const keys: string[] = JSON.parse(localStorageKeysStr);
      const entries: [string, string][] = [];
      for (const key of keys) {
        const value = ctx.cookies.get(`TP_${key}`);
        if (value) {
          entries.push([key, atob(value)]);
        }
        localStore.hydrate(entries);
      }
    } catch {
      // we just swallow errors here
    }
  }
  await next();
  console.log(":post next");
  const keys = [...localStore.keys()];
  if (keys.length) {
    ctx.cookies.set("TP_KEYS", JSON.stringify(keys));
    for (const key of localStore.keysSet()) {
      ctx.cookies.set(`TP_${key}`, btoa(localStore.getItem(key) ?? ""), {
        overwrite: true,
      });
    }
  }
  for (const key of localStore.keysDeleted()) {
    ctx.cookies.delete(`TP_${key}`, { overwrite: true });
  }
});

// this middleware logs in the user if there isn't a cookie that logs them in
// we have to set a flag, otherwise firebase things we are trying to re-auth a
// user again and goes through the whole auth flow.  If we don't log in again,
// and the local storage has the auth credentials in local storage, the other
// API calls work just fine.
app.use(async (ctx, next) => {
  console.log(":auth");
  // The default persistance is `local` which uses `localStorage` to save the
  // login.
  const signedInUid = ctx.cookies.get("TP_UID");
  const signedInUser = signedInUid != null ? users.get(signedInUid) : undefined;
  if (!signedInUid || !signedInUser || !auth.currentUser) {
    console.log("sign-in");
    const creds = await auth.signInWithEmailAndPassword(
      Deno.env.get("THEROPOD_USERNAME")!,
      Deno.env.get("THEROPOD_PASSWORD")!,
    );
    const { user } = creds;
    if (user) {
      users.set(user.uid, user);
      ctx.cookies.set("TP_UID", user.uid);
    }
  } else if (signedInUser && signedInUser.uid !== auth.currentUser?.uid) {
    console.log("swap user");
    await auth.updateCurrentUser(signedInUser);
  }
  return next();
});

app.use(router.routes());
app.use(router.allowedMethods());

app.addEventListener("error", (evt) => {
  let msg = `[${colors.red("error")}] `;
  if (evt.error instanceof Error) {
    msg += `${evt.error.name}: ${evt.error.message}`;
  } else {
    msg += Deno.inspect(evt.error);
  }
  if (evt.context) {
    msg += `\n\nrequest:\n  url: ${evt.context.request.url}\n  headers: ${
      Deno.inspect([...evt.context.request.headers])
    }\n`;
  }
  if (evt.error instanceof Error && evt.error.stack) {
    const stack = evt.error.stack.split("\n");
    stack.shift();
    msg += `\n\n${stack.join("\n")}\n`;
  }
  console.error(msg);
});

addEventListener("fetch", app.fetchEventHandler());
