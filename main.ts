import "https://deno.land/x/xhr@0.1.1/mod.ts";

// @deno-types=https://cdn.skypack.dev/-/firebase@v8.7.0-MrU9zUCxcEMCl2U7Tuz6/dist=es2020,mode=types/index.d.ts
import firebase from "https://cdn.skypack.dev/firebase@8.7.0/app";
import "https://cdn.skypack.dev/firebase@8.7.0/auth";
import "https://cdn.skypack.dev/firebase@8.7.0/firestore";

import * as colors from "https://deno.land/std@0.100.0/fmt/colors.ts";
import {
  Application,
  HttpError,
  Router,
  Status,
} from "https://deno.land/x/oak@v7.7.0/mod.ts";

import { installGlobals } from "https://deno.land/x/virtualstorage@0.1.0/mod.ts";
import { virtualStorage } from "https://deno.land/x/virtualstorage@0.1.0/middleware.ts";

installGlobals({ overwrite: true });

const users = new Map<string, firebase.User>();

const theropod = firebase.initializeApp(
  JSON.parse(Deno.env.get("FIREBASE_APP_CONFIG") ?? "{}"),
  "theropod",
);
const auth = firebase.auth(theropod);
const db = firebase.firestore(theropod);

const router = new Router();

router.get("/", (ctx) => {
  ctx.response.body = "Hello world";
});

router.get("/login", (ctx) => {
  ctx.response.body = `<!DOCTYPE html>
  <html>
  <body>
    <h1>theropod login</h1>
    <form action="/login" method="post">
      <label for="username">Username:</label>
      <input type="email" name="username" id="username" required>
      <label for="password">Password:</label>
      <input type="password" name="password" id="password" required>
      <input type="submit" value="Login">
    </form>
  </body>
  </html>`;
});

router.post("/login", async (ctx) => {
  const body = ctx.request.body();
  if (body.type !== "form") {
    return ctx.throw(Status.BadRequest, "Only form bodies acceptable.");
  }
  const value = await body.value;
  const username = value.get("username") ?? "";
  const password = value.get("password") ?? "";
  const creds = await auth.signInWithEmailAndPassword(username, password);
  if (!creds.user) {
    return ctx.throw(Status.Unauthorized, "Bad username or password");
  }
  users.set(creds.user.uid, creds.user);
  ctx.cookies.set("TP_UID", creds.user.uid);
  ctx.response.status = Status.NoContent;
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

app.use(virtualStorage());

app.use(async (ctx, next) => {
  if (ctx.request.url.pathname !== "/login") {
    const signedInUid = ctx.cookies.get("TP_UID");
    const signedInUser = signedInUid != null
      ? users.get(signedInUid)
      : undefined;
    if (!signedInUid || !signedInUser || !auth.currentUser) {
      ctx.response.redirect("/login");
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
  if (
    (evt.error instanceof HttpError && evt.error.status >= 400 &&
      evt.error.status <= 499)
  ) {
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
  }
  console.error(msg);
});

addEventListener("fetch", app.fetchEventHandler());
