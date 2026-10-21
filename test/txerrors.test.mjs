import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

const code = transformSync(readFileSync(new URL("../src/lib/txerrors.ts", import.meta.url), "utf8"), { loader: "ts", format: "esm" }).code;
const { isUserRejected } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

test("isUserRejected: EIP-1193 code, viem error name, wording, and nested cause", () => {
  assert.equal(isUserRejected({ code: 4001 }), true);
  assert.equal(isUserRejected({ name: "UserRejectedRequestError" }), true);
  assert.equal(isUserRejected(new Error("User denied transaction signature")), true);
  assert.equal(isUserRejected({ message: "wrapped", cause: { code: 4001 } }), true);
});
test("isUserRejected: real failures are not rejections", () => {
  assert.equal(isUserRejected(new Error("insufficient funds for gas")), false);
  assert.equal(isUserRejected(null), false);
  assert.equal(isUserRejected("boom"), false);
});
