import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const code = transformSync(readFileSync(new URL("../src/lib/params.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
const { deploymentSearch } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
const KIT = "0x3c26351ad8b9dc7bb4f837c5b921879c35e20fb7";

test("link to the landing: screen parameters are dropped, so no 'potkit.pro/?tab=trade'", () => {
  assert.equal(deploymentSearch("?tab=trade"), "");
  assert.equal(deploymentSearch("?tab=verify&id=2&sell=1"), "");
  assert.equal(deploymentSearch(""), "");
});

test("link to the landing: the deployment (judge link) parameters are kept", () => {
  assert.equal(deploymentSearch(`?kit=${KIT}&tab=trade`), `?kit=${KIT}`);
  assert.equal(deploymentSearch(`?tab=issue&kit=${KIT}&id=1`), `?kit=${KIT}`);
  assert.equal(deploymentSearch(`kit=${KIT}`), `?kit=${KIT}`, "a search without the leading ? works too");
  assert.equal(deploymentSearch("?vault=0x1&receipt=0x2&market=0x3&usd=0x4&tab=history"), "?vault=0x1&receipt=0x2&usd=0x4&market=0x3", "kept in a fixed order");
});
