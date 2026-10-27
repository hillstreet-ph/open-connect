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
    const text = input.value;
    input.value = "";
    rfb.clipboardPasteFrom(text);
    rfb.focus();
    // x11vnc does not reliably expose received cut text to Chromium, so insert the
    // text as keystrokes. Keep the clipboard update for apps that read it directly.
    for (const character of text) {
      const code = character.codePointAt(0);
      // Printable characters only: a pasted newline must not submit a form.
      if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue;
      rfb.sendKey(code <= 0xff ? code : 0x01000000 + code, null);
    }
  };
});
