import { exportResponse } from "./chatgpt-export.mjs";

const button = document.getElementById("export-response");
button.addEventListener("click", () => {
  const text = document.getElementById("response-text").value;
  const format = document.getElementById("response-format").value;
  const status = document.getElementById("status");
  try {
    const exported = exportResponse({ text, format });
    const blob = new Blob([exported.content], { type: exported.mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exported.filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    status.textContent = "Local response download requested; no upload performed.";
  } catch (error) {
    status.textContent = String(error?.message || error);
  }
});
