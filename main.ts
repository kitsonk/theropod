import "https://deno.land/x/xhr@0.1.1/mod.ts";

// @deno-types=https://cdn.skypack.dev/-/firebase@v8.7.0-MrU9zUCxcEMCl2U7Tuz6/dist=es2020,mode=types/index.d.ts
import firebase from "https://cdn.skypack.dev/firebase@8.7.0/app";
import "https://cdn.skypack.dev/firebase@8.7.0/auth";
import "https://cdn.skypack.dev/firebase@8.7.0/firestore";

import * as colors from "https://deno.land/std@0.100.0/fmt/colors.ts";
import { Application, Router } from "https://deno.land/x/oak@v7.7.0/mod.ts";

// I created a small library called of virtual storage which provides the
// DOM storage API and allows state to be saved and stored externally, and then
// create a oak middleware that takes that state and saves it as cookies.  This
// allows the firebase auth module to persist the authentication of the user to
// the cookies of the user and have those be restored.
import { installGlobals } from "https://deno.land/x/virtualstorage@0.1.0/mod.ts";
import { virtualStorage } from "https://deno.land/x/virtualstorage@0.1.0/middleware.ts";

// Storage globals need to be installed prior to the application auth being
// setup.
installGlobals({ overwrite: true });

const users = new Map<string, firebase.User>();

// This is the "client" initialization keys, these end up in a client
// un-encrypted but you still need a login to the app to do anything.
const theropod = firebase.initializeApp(
  JSON.parse(Deno.env.get("FIREBASE_APP_CONFIG") ?? "{}"),
  "theropod",
);

// This gets a handle to the auth part
const auth = firebase.auth(theropod);
// This is implied, but wanted to make it explicit, that we are setting the
// persistance to local storage.
auth.setPersistence("local");

const db = firebase.firestore(theropod);

const router = new Router();

router.get("/", (ctx) => {
  ctx.response.body = "Hello world";
});

router.get("/users", async (ctx) => {
  const querySnapshot = await db.collection("users").get();
  ctx.response.body = querySnapshot.docs.map((doc) => doc.data());
  ctx.response.type = "json";
});

const app = new Application({
  keys: JSON.parse(Deno.env.get("THEROPOD_KEYS") ?? `["secret"]`),
});

// A basic logging middleware.
app.use(async (ctx, next) => {
  await next();
  const rt = ctx.response.headers.get("X-Response-Time");
  console.log(
    `${colors.green(ctx.request.method)} ${
      colors.cyan(ctx.request.url.pathname)
    } - ${colors.bold(String(rt))}`,
  );
});

// A basic timing middleware.
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.response.headers.set("X-Response-Time", `${ms}ms`);
});

// This is the middleware that stores `localStorage` to cookies on the request
// and restores them on subsequent requests.
app.use(virtualStorage());

// this middleware logs in the user if there isn't a cookie that logs them in
// we have to set a flag, otherwise firebase things we are trying to re-auth a
// user again and goes through the whole auth flow.  If we don't log in again,
// and the local storage has the auth credentials in local storage, the other
// API calls work just fine.
app.use(async (ctx, next) => {
  // The default persistance is `local` which uses `localStorage` to save the
  // login.
  const signedInUid = ctx.cookies.get("TP_UID");
  const signedInUser = signedInUid != null ? users.get(signedInUid) : undefined;
  if (!signedInUid || !signedInUser || !auth.currentUser) {
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
    await auth.updateCurrentUser(signedInUser);
  }
  return next();
});

app.use(router.routes());
app.use(router.allowedMethods());

// Should log any internal errors that are thrown within the oak application
// with some context that should make isolating the problem better
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
