import { createWorker } from "https://deno.land/x/dectyl@0.6.2/mod.ts";

Deno.test({
  name: "basic",
  async fn() {
    const theropod = await createWorker("./main.ts", {
      name: "theropod",
      env: {
        "THEROPOD_USER": "kitson@deno.com",
        "THEROPOD_PASSWORD": Deno.env.get("THEROPOD_PASSWORD") ?? "",
      },
    });

    (async () => {
      for await (const log of theropod.logs) {
        console.log(`[${theropod}]`, log);
      }
    })();

    await theropod.run(async () => {
      const [res] = await theropod.fetch("/users");
      console.log(await res.text());
    });
  },
});
