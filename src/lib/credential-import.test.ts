import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import {
  dedupeImportItems,
  detectCsvSource,
  parseCredentialCsv,
  parseCredentialExport,
  parseCredentialFile,
  summarizeImportItem,
  totpSeed,
} from "./credential-import.ts";

const SEED = "JBSWY3DPEHPK3PXP";
const PROTON_HEADER = "type,name,url,email,username,password,note,totp,createTime,modifyTime,vault";

test("detects common export formats", () => {
  assert.equal(detectCsvSource(PROTON_HEADER.split(",")), "proton");
  assert.equal(
    detectCsvSource(
      "folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp".split(
        ",",
      ),
    ),
    "bitwarden",
  );
  assert.equal(detectCsvSource("name,url,username,password,note".split(",")), "browser");
  assert.equal(
    detectCsvSource("Title,URL,Username,Password,Notes,OTPAuth".split(",")),
    "1password",
  );
  assert.equal(
    detectCsvSource("url,username,password,totp,extra,name,grouping,fav".split(",")),
    "lastpass",
  );
  assert.equal(
    detectCsvSource("url,username,password,httpRealm,formActionOrigin,guid".split(",")),
    "firefox",
  );
  assert.equal(detectCsvSource(["something", "else"]), null);
});

test("Proton CSV: logins with vault, http, notes and 2FA import instead of needing review", () => {
  const csv = [
    PROTON_HEADER,
    `login,Gmail,https://mail.google.com,a@example.com,,fixture-pass,my note,otpauth://totp/G?secret=${SEED}&algorithm=SHA1&digits=6&period=30,1,2,Personal`,
    `login,Router,http://192.168.1.1,,admin,fixture-pass,,,1,2,Personal`,
    `login,Multi,"https://a.example, https://b.example",,bob,fixture-pass,,,1,2,Work`,
    `login,NoUrl,,,carol,fixture-pass,,,1,2,Work`,
    `login,App,android://com.example.app,,dave,fixture-pass,,,1,2,Work`,
    `note,Recovery codes,,,,,"code-1 code-2",,1,2,Personal`,
    `alias,Alias,,x@alias.example,,,,,1,2,Personal`,
    `creditCard,Card,,,,,,,1,2,Personal`,
    `login,TotpOnly,https://t.example,,erin,,,${SEED},1,2,Personal`,
    `login,Sha256,https://s.example,,frank,fixture-pass,,otpauth://totp/S?secret=${SEED}&algorithm=SHA256,1,2,Personal`,
  ].join("\n");
  const items = parseCredentialCsv(csv);
  const by = (name: string) => items.find((item) => item.name === name)!;
  for (const name of [
    "Gmail",
    "Router",
    "Multi",
    "NoUrl",
    "App",
    "Recovery codes",
    "TotpOnly",
    "Sha256",
  ])
    assert.equal(by(name).status, "ready", name);
  assert.equal(by("Gmail").totp_secret, SEED);
  assert.equal(by("Gmail").email_address, "a@example.com");
  assert.equal(by("Gmail").notes, "my note");
  assert.deepEqual(by("Gmail").tags, ["imported", "proton-pass", "personal"]);
  assert.match(by("Router").reasons.join(), /HTTPS/);
  assert.equal(by("Multi").website, "https://a.example/");
  assert.match(by("Multi").notes, /b\.example/);
  assert.equal(by("Recovery codes").secret_type, "other");
  assert.equal(by("Recovery codes").password, "code-1 code-2");
  assert.equal(by("TotpOnly").secret_type, "totp");
  assert.equal(by("TotpOnly").password, SEED);
  assert.equal(by("Sha256").totp_secret, "");
  assert.match(by("Sha256").notes, /SHA256/);
  assert.equal(by("Alias").status, "skipped");
  assert.equal(by("Card").status, "skipped");
});

test("TOTP parsing matches the vault generator limits", () => {
  assert.equal(totpSeed(`otpauth://totp/x?secret=${SEED.toLowerCase()}`), SEED);
  assert.equal(totpSeed("jbsw y3dp ehpk 3pxp"), SEED);
  assert.equal(totpSeed(""), "");
  for (const bad of [
    `otpauth://hotp/x?secret=${SEED}`,
    `otpauth://totp/x?secret=${SEED}&digits=8`,
    `otpauth://totp/x?secret=${SEED}&period=60`,
    "not!base32",
  ])
    assert.equal(totpSeed(bad), null);
});

test("dedupe removes exact duplicates and vault matches, renames conflicting accounts", () => {
  const csv = [
    "name,url,username,password",
    "Site,https://site.example,alice,one-pass",
    "Site,https://site.example,alice,one-pass",
    "Site,https://site.example,alice,two-pass",
    "Kept,https://kept.example,bob,three-pass",
  ].join("\n");
  const items = dedupeImportItems(parseCredentialCsv(csv), [
    {
      name: "Kept",
      secret_type: "password",
      website: "https://kept.example",
      username: "bob",
      email_address: null,
    },
  ]);
  assert.deepEqual(
    items.map((item) => [item.name, item.status]),
    [
      ["Site", "ready"],
      ["Site", "duplicate"],
      ["Site (2)", "ready"],
      ["Kept", "duplicate"],
    ],
  );
});

test("summaries never expose secrets, notes or full accounts", () => {
  const [item] = parseCredentialCsv(
    `${PROTON_HEADER}\nlogin,Bank,https://bank.example,private@example.com,,secret-password,secret note,${SEED},1,2,V`,
  );
  const text = JSON.stringify(summarizeImportItem(item!));
  assert.doesNotMatch(text, /secret|private@|JBSW/);
  assert.equal(summarizeImportItem(item!).has_totp, true);
});

function zip(name: string, content: string) {
  const data = deflateRawSync(Buffer.from(content));
  const nameBytes = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBytes.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return new Uint8Array(Buffer.concat([local, nameBytes, data, central, nameBytes, end]));
}

test("Proton ZIP export: passkeys, custom fields and trash are handled", async () => {
  const data = {
    encrypted: false,
    vaults: {
      v1: {
        name: "Personal",
        items: [
          {
            state: 1,
            data: {
              type: "login",
              metadata: { name: "GitHub", note: "" },
              content: {
                itemEmail: "a@example.com",
                itemUsername: "octo",
                password: "fixture-pass",
                urls: ["https://github.com"],
                totpUri: `otpauth://totp/GH?secret=${SEED}`,
                passkeys: [{ keyId: "x" }],
              },
              extraFields: [
                { fieldName: "Recovery email", type: "text", data: { content: "r@example.com" } },
                { fieldName: "PIN", type: "hidden", data: { content: "1234" } },
              ],
            },
          },
          {
            state: 2,
            data: { type: "login", metadata: { name: "Old" }, content: { password: "x-pass" } },
          },
        ],
      },
    },
  };
  const items = await parseCredentialFile(
    "export.zip",
    zip("Proton Pass/data.json", JSON.stringify(data)),
  );
  assert.equal(items[0]!.status, "ready");
  assert.equal(items[0]!.totp_secret, SEED);
  assert.equal(items[0]!.username, "octo");
  assert.match(items[0]!.notes, /Recovery email: r@example.com/);
  assert.doesNotMatch(items[0]!.notes, /1234/);
  assert.match(items[0]!.reasons.join(), /passkey/);
  assert.match(items[0]!.reasons.join(), /hidden/);
  // Hidden fields become an encrypted companion secure note, never plain notes.
  assert.equal(items[1]!.status, "ready");
  assert.equal(items[1]!.secret_type, "other");
  assert.equal(items[1]!.name, "GitHub · hidden fields");
  assert.equal(items[1]!.password, "PIN: 1234");
  assert.equal(items[1]!.notes, "");
  assert.equal(items[2]!.status, "skipped");
  await assert.rejects(parseCredentialFile("export.pgp", new Uint8Array()), /Encrypted/);
});

test("Bitwarden JSON export maps folders, TOTP and passkeys", async () => {
  const json = JSON.stringify({
    encrypted: false,
    folders: [{ id: "f", name: "Work" }],
    items: [
      {
        type: 1,
        name: "Jira",
        folderId: "f",
        login: {
          username: "j",
          password: "fixture-pass",
          totp: SEED,
          uris: [{ uri: "https://jira.example" }],
        },
      },
    ],
  });
  const [item] = await parseCredentialFile("bw.json", new TextEncoder().encode(json));
  assert.equal(item!.status, "ready");
  assert.equal(item!.totp_secret, SEED);
  assert.deepEqual(item!.tags, ["imported", "bitwarden", "work"]);
});

test("ZIP attachments are counted so the user knows they were not imported", async () => {
  const data = JSON.stringify({ encrypted: false, vaults: {} });
  const bytes = zip("Proton Pass/data.json", data);
  const parsed = await parseCredentialExport("export.zip", bytes);
  assert.equal(parsed.attachments, 0);
  assert.deepEqual(parsed.items, []);
});
