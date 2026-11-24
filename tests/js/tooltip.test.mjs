// Tooltip behaviour test (real component, jsdom). Not part of `npm test` because it needs two
// dev-only tools. Run:  npm i --no-save jsdom esbuild  &&  node tests/js/tooltip.test.mjs
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const out = path.join(root, "node_modules/.tooltip-test.cjs");
await build({
  stdin: { contents: `export { default as Tooltip } from "./resources/js/Components/shared/Tooltip.jsx";
    export * as React from "react"; export * as Client from "react-dom/client"; export * as TestUtils from "react";`, resolveDir: root, loader: "js" },
  bundle: true, platform: "node", format: "cjs", outfile: out, jsx: "automatic", loader: { ".css": "empty", ".jsx": "jsx" }, logLevel: "silent",
});

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
const { Tooltip, React, Client } = (await import("node:module")).createRequire(import.meta.url)(out);
const act = React.act;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fire = (el, type, init = {}) => el.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, ...init }));

let n = 0;
async function scenario(name, fn, { touch = false } = {}) {
  dom.window.matchMedia = (q) => ({ matches: touch, media: q, addEventListener() {}, removeEventListener() {} });
  document.body.innerHTML = '<div id="root"></div>';
  const rootEl = document.getElementById("root");
  const root = Client.createRoot(rootEl);
  try { await fn(root, rootEl); n++; console.log("ok   " + name); }
  finally { await act(async () => root.unmount()); }
}
const tip = () => document.querySelector('[role="tooltip"]');
const h = React.createElement;

await scenario("adds no wrapper element around the control", async (root, el) => {
  await act(async () => root.render(h(Tooltip, { label: "Close" }, h("button", { "aria-label": "Close" }, "x"))));
  assert.equal(el.innerHTML, '<button aria-label="Close">x</button>');
});
await scenario("hover shows it in <body>, sets aria-describedby, leaving hides it", async (root, el) => {
  await act(async () => root.render(h(Tooltip, { label: "Collapse sidebar", delay: 0 }, h("button", null, "x"))));
  const b = el.querySelector("button");
  await act(async () => { fire(b, "mouseover"); await wait(20); });
  assert.ok(tip(), "tooltip should be open");
  assert.equal(tip().textContent, "Collapse sidebar");
  assert.equal(tip().parentElement, document.body);
  assert.equal(b.getAttribute("aria-describedby"), tip().id);
  await act(async () => { fire(b, "mouseout"); });
  assert.equal(tip(), null);
  assert.equal(b.getAttribute("aria-describedby"), null);
});
await scenario("keyboard focus shows it, blur and Escape hide it", async (root, el) => {
  await act(async () => root.render(h(Tooltip, { label: "Hint", delay: 0 }, h("button", null, "x"))));
  const b = el.querySelector("button");
  await act(async () => { b.focus(); await wait(20); });
  assert.ok(tip());
  await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })); });
  assert.equal(tip(), null);
  await act(async () => { b.focus(); b.blur(); await wait(20); });
  assert.equal(tip(), null);
});
await scenario("the control's own onClick/onMouseEnter still run, and click closes the tooltip", async (root, el) => {
  let clicks = 0; let enters = 0;
  await act(async () => root.render(h(Tooltip, { label: "Go", delay: 0 }, h("button", { onClick: () => clicks++, onMouseEnter: () => enters++ }, "x"))));
  const b = el.querySelector("button");
  await act(async () => { fire(b, "mouseover"); await wait(20); });
  assert.ok(tip()); assert.equal(enters, 1);
  await act(async () => { fire(b, "click"); });
  assert.equal(clicks, 1); assert.equal(tip(), null);
});
await scenario("touch / no-hover devices: control renders as-is, no tooltip ever", async (root, el) => {
  await act(async () => root.render(h(Tooltip, { label: "Nope", delay: 0 }, h("button", null, "x"))));
  const b = el.querySelector("button");
  await act(async () => { fire(b, "mouseover"); b.focus(); await wait(20); });
  assert.equal(tip(), null);
}, { touch: true });
await scenario("disabled prop and empty label switch it off", async (root, el) => {
  await act(async () => root.render(h("div", null, h(Tooltip, { label: "A", disabled: true, delay: 0 }, h("button", { id: "a" }, "a")), h(Tooltip, { label: "", delay: 0 }, h("button", { id: "b" }, "b")))));
  for (const id of ["a", "b"]) { await act(async () => { fire(el.querySelector("#" + id), "mouseover"); await wait(20); }); assert.equal(tip(), null); }
});
await scenario("works on a link-like child and keeps an existing aria-describedby while closed", async (root, el) => {
  await act(async () => root.render(h(Tooltip, { label: "Back", delay: 0 }, h("a", { href: "/x", "aria-describedby": "keep" }, "<"))));
  assert.equal(el.querySelector("a").getAttribute("aria-describedby"), "keep");
});
console.log(`\n${n} tooltip scenarios passed`);
process.exit(0);
