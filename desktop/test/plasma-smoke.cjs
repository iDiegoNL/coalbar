const { createPlasmaBridge } = require("../core/plasma.cjs");
(async () => {
  const { present } = await import("../core/presentation.mjs");
  let presence = 0;
  const server = await createPlasmaBridge({
    getState: () => ({
      ...present({
        reading: { phase: "heating", remaining: 520, duration: 780 },
        notice: null,
        freshRemaining: null,
        demo: true,
      }),
      demo: true,
      visible: true,
    }),
    action: () => {},
    onPresence: () => presence++,
  });
  setTimeout(
    () =>
      server.close(() => {
        console.log(
          presence > 0
            ? `PASS: Plasma widget fetched ${presence} updates`
            : "FAIL: Plasma widget did not connect",
        );
        process.exitCode = presence > 0 ? 0 : 1;
      }),
    5000,
  );
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
