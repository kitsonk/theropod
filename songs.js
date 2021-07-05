// Firebase uses XMLHttpRequest instead of `fetch()`, so we need to provide a
// polyfill for it.
import "https://deno.land/x/xhr@0.1.1/mod.ts";

// Firebase for the web by default stores authenticated sessions in
// localStorage.  This polyfill will allow us to "extract" the localStorage and
// send it to the client as cookies.
import { installGlobals } from "https://deno.land/x/virtualstorage@0.1.0/mod.ts";

// Since Deploy is browser-like, we will use the Firebase web client libraries
// importing in just what we need for this tutorial. We are using the Skypack
// CDN which also provides modules as ES Modules.
// @deno-types=https://cdn.skypack.dev/-/firebase@v8.7.0-MrU9zUCxcEMCl2U7Tuz6/dist=es2020,mode=types/index.d.ts
import firebase from "https://cdn.skypack.dev/firebase@8.7.0/app";
import "https://cdn.skypack.dev/firebase@8.7.0/auth";
import "https://cdn.skypack.dev/firebase@8.7.0/firestore";

// For this tutorial, we are going to use the oak middleware framework to create
// our APIs and integrate to Firebase.
import {
  Application,
  Router,
  Status,
} from "https://deno.land/x/oak@v7.7.0/mod.ts";

import * as colors from "https://deno.land/std@0.100.0/fmt/colors.ts";

// There is also middleware for oak that will help use with the setting the
// localStorage cookies for the client
import { virtualStorage } from "https://deno.land/x/virtualstorage@0.1.0/middleware.ts";

// This will install the polyfill for localStorage
installGlobals();

const firebaseConfig = JSON.parse(Deno.env.get("FIREBASE_CONFIG"));

const firebaseApp = firebase.initializeApp(firebaseConfig, "example");

const auth = firebase.auth(firebaseApp);

/** A map of users that we will log in.  While this tutorial only uses one user
 * retrieved from the environment variables. It demonstrates how this can be
 * easily modified to allow different users to authenticate.
 *
 * @type {Map<string, firebase.User>} */
const users = new Map();

const db = firebase.firestore(firebaseApp);

const router = new Router();

/**
 * @typedef {Object} Song
 * @property {string} title
 * @property {string} album
 * @property {string} artist
 * @property {string} released
 * @property {string} genres
 */

/**
 * @param {unknown} value
 * @returns {value is Song}
 */
function isSong(value) {
  return typeof value === "object" && value !== null && "title" in value;
}

router.get("/songs", async (ctx) => {
  const querySnapshot = await db.collection("songs").get();
  ctx.response.body = querySnapshot.docs.map((doc) => doc.data());
  ctx.response.type = "json";
});
router.get("/songs/:title", async (ctx) => {
  const { title } = ctx.params;
  const querySnapshot = await db.collection("songs").where("title", "==", title)
    .get();
  const song = querySnapshot.docs.map((doc) => doc.data())[0];
  if (!song) {
    ctx.response.status = 404;
    ctx.response.body = `The song titled "${ctx.params.title}" was not found.`;
    ctx.response.type = "text";
  } else {
    ctx.response.body = querySnapshot.docs.map((doc) => doc.data())[0];
    ctx.response.type = "json";
  }
});
router.post("/songs", async (ctx) => {
  const body = ctx.request.body();
  if (body.type !== "json") {
    ctx.throw(Status.BadRequest, "Must be a JSON document");
  }
  const song = await body.value;
  if (!isSong(song)) {
    ctx.throw(Status.BadRequest, "Payload was not well formed");
  }
  const querySnapshot = await db
    .collection("songs")
    .where("title", "==", song.title)
    .get();
  await Promise.all(querySnapshot.map((doc) => doc.ref.delete()));
  const songsRef = db.collection("songs");
  await songsRef.add(song);
});

const app = new Application();

// This will take the localStorage values and send them to the client as cookies
// and restore their values on subsequent requests.
app.use(virtualStorage());

// This demonstrates how to manage multiple logins from Firebase with Deploy,
// though we will only ever have one authenticated user in this example.
app.use(async (ctx, next) => {
  const signedInUid = ctx.cookies.get("LOGGED_IN_UID");
  const signedInUser = signedInUid != null ? users.get(signedInUid) : undefined;
  if (!signedInUid || !signedInUser || !auth.currentUser) {
    // in a real application, this is where we would want to redirect the user
    // to a sign-in page for our application, instead of grabbing the
    // authentication details from the environment variables.
    const creds = await auth.signInWithEmailAndPassword(
      Deno.env.get("FIREBASE_USERNAME"),
      Deno.env.get("FIREBASE_PASSWORD"),
    );
    const { user } = creds;
    if (user) {
      users.set(user.uid, user);
      ctx.cookies.set("LOGGED_IN_UID", user.uid);
    } else if (signedInUser && signedInUid.uid !== auth.currentUser?.uid) {
      await auth.updateCurrentUser(signedInUser);
    }
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

// This sets up the application to start processing requests
addEventListener("fetch", app.fetchEventHandler());
