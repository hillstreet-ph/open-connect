// Explicit user-triggered local suggestions; no conversation scraping.
const commands = [
  { command: "/openconnect status", description: "Review Open-Connect gateway status" },
  { command: "/openconnect agents", description: "Explore available AI agents" },
  { command: "/openconnect files", description: "Open project file workflows" },
  { command: "/openconnect workflows", description: "Review approved workflows" },
  { command: "/openconnect knowledge", description: "Find authorized project knowledge" },
];

function suggest(input) {
  const q = String(input || "").trim().toLowerCase();
  return commands
    .filter(
      (item) =>
        !q ||
        item.command.includes(q) ||
        item.description.toLowerCase().includes(q),
    )
    .slice(0, 5);
}

const query = document.getElementById("command-query");
const results = document.getElementById("command-results");

function render() {
  results.replaceChildren();
  for (const item of suggest(query.value)) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.command + " — " + item.description;
    btn.addEventListener("click", () =>
      navigator.clipboard.writeText(item.command).then(() => {
        document.getElementById("status").textContent =
          "Command copied. Paste into ChatGPT to use as a prompt; no command executed.";
      }),
    );
    li.append(btn);
    results.append(li);
  }
}

query.addEventListener("input", render);
render();
