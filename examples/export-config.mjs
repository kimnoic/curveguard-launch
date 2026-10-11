import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, ".sites-runtime", "examples");
fs.mkdirSync(output, { recursive: true });
for (const name of ["launch-types", "curve-config", "launch-engine"]) {
  const source = fs.readFileSync(path.join(root, "lib", `${name}.ts`), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replaceAll('"./curve-config"', '"./curve-config.mjs"').replaceAll('"./launch-types"', '"./launch-types.mjs"');
  fs.writeFileSync(path.join(output, `${name}.mjs`), code);
}
const { designLaunch, inputSchema } = await import(path.join(output, "launch-engine.mjs"));
const { DEFAULT_INPUTS } = await import(path.join(output, "launch-types.mjs"));
const argument = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : DEFAULT_INPUTS;
const design = designLaunch(inputSchema.parse(argument.input ?? argument));
console.log(JSON.stringify({ input: design.input, sdkVersion: design.sdkVersion, weights: design.selected.weights,
  sdkValid: design.selected.sdkValid, sdkConfig: design.selected.sdkConfig, warnings: design.warnings }, null, 2));
