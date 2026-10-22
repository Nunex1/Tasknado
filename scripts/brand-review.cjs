const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const Module = require("node:module");
const path = require("node:path");
const file = path.resolve("src/components/brand.tsx");
const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
}).outputText;
const mod = new Module(file, module);
mod.filename = file;
mod.paths = module.paths;
mod._compile(compiled, file);
const { BrandLogo } = mod.exports;
const variants = [
  ["Sidebar · 220 px", { size: "sm" }, "#001845", "220px"],
  ["Fundo claro", { tone: "blue" }, "#ffffff", "auto"],
  ["Vertical", { layout: "vertical" }, "#002855", "auto"],
  ["Compacta", { layout: "compact", size: "sm" }, "#001233", "auto"],
];
const css = fs.readFileSync("src/app/ocean.css", "utf8");
fs.writeFileSync(
  "public/brand-review.html",
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tasknado · Revisão da marca</title><style>:root{--text:#fff;--primary:#0466c8}body{margin:32px;background:#001233;color:white;font:16px system-ui}section{margin:24px 0;padding:16px;border:1px solid #33415c;border-radius:12px;box-sizing:border-box}' +
    css +
    "</style><h1>Composições oficiais</h1>" +
    variants
      .map(
        ([label, props, bg, width]) =>
          "<h2>" +
          label +
          '</h2><section style="background:' +
          bg +
          ";width:" +
          width +
          '">' +
          renderToStaticMarkup(React.createElement(BrandLogo, props)) +
          "</section>",
      )
      .join("") +
    "</html>",
);
