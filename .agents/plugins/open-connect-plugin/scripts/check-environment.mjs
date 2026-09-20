const required = ["OPEN_CONNECT_API_KEY"];
const optional = ["OPENAI_API_KEY", "OPEN_CONNECT_BASE_URL"];

const report = {
  ok: required.every((name) => Boolean(process.env[name]?.trim())),
  required: Object.fromEntries(required.map((name) => [name, Boolean(process.env[name]?.trim())])),
  optional: Object.fromEntries(optional.map((name) => [name, Boolean(process.env[name]?.trim())])),
};

console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
