import RFB from "/novnc/core/rfb.js";
const status = document.getElementById("status");
status.textContent = "Waiting for your private sign-in session…";
window.addEventListener("message", function accept(event) {
  const trusted =
    event.source === window.parent &&
    (event.origin === location.origin ||
      ["https://open-connect.site", "https://www.open-connect.site"].includes(event.origin) ||
      /^https:\/\/[a-z0-9-]+\.open-connect-app\.pages\.dev$/.test(event.origin));
  const token = event.data?.viewToken;
  if (!trusted || typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return;
  window.removeEventListener("message", accept);
  const rfb = new RFB(
    document.getElementById("screen"),
    `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/desktop`,
    { wsProtocols: ["binary", token] },
  );
  rfb.scaleViewport = true;
  rfb.addEventListener("connect", () => {
    status.textContent = "Private browser connected. Agent control is paused.";
    rfb.focus();
  });
  rfb.addEventListener("disconnect", () => {
    status.textContent = "Session ended. Return to Open-Connect to reopen it.";
  });
  document.getElementById("focus").onclick = () => rfb.focus();
  document.getElementById("send-paste").onclick = () => {
    const input = document.getElementById("paste");
    rfb.clipboardPasteFrom(input.value);
    input.value = "";
    rfb.focus();
  };
});
