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

const firebase = initializeApp({
  apiKey: "AIzaSyDu6yo0rhstSThmpFEDQDiFvOnTJrMtv6c",
  authDomain: "theropod-f4077.firebaseapp.com",
  projectId: "theropod-f4077",
  storageBucket: "theropod-f4077.appspot.com",
  messagingSenderId: "391024490546",
  appId: "1:391024490546:web:5fb4ab97e07b5af869e42b",
});

const auth = getAuth(firebase);

await signInWithEmailAndPassword(
  auth,
  Deno.env.get("THEROPOD_USERNAME"),
  Deno.env.get("THEROPOD_PASSWORD"),
);

const db = getFirestore(firebase);

const router = new Router();

router.get("/users", async (ctx) => {
  const querySnapshot = await getDocs(collection(db, "users"));
  ctx.response.body = querySnapshot.docs.map((doc) => doc.data());
  ctx.response.type = "json";
});

const app = new Application();

app.use(router.routes());
app.use(router.allowedMethods());

addEventListener("fetch", app.fetchEventHandler());
