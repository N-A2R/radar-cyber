import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { resolve } from "node:path";

const srcDir = resolve(process.cwd(), "src") + "/";

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

/**
 * A component is exported from a source module (PascalCase function or the
 * lowercase `rendu*` render helpers). It is documented when its paired story
 * file actually renders it, not merely when the name appears in a comment.
 */
export function inventory() {
  const modules = walk(srcDir).filter(
    (path) => !path.endsWith(".stories.tsx") && basename(path) !== "main.tsx",
  );
  const components = [];

  for (const path of modules) {
    const source = readFileSync(path, "utf8");
    const storyPath = path.replace(/\.tsx$/, ".stories.tsx");
    const stories = existsSync(storyPath) ? readFileSync(storyPath, "utf8") : "";
    const names = [...source.matchAll(/^export (?:default )?function ([A-Za-z_$][\w$]*)/gm)]
      .map((match) => match[1])
      .filter((name) => /^[A-Z]/.test(name) || name.startsWith("rendu"));

    for (const name of names) {
      const rendered =
        stories.includes(`<${name}`) ||
        stories.includes(`component: ${name}`) ||
        stories.includes(`${name}(`);
      components.push({
        name,
        module: path.slice(srcDir.length),
        story: existsSync(storyPath) ? storyPath.slice(srcDir.length) : null,
        documented: rendered,
      });
    }
  }

  const storyFiles = modules.filter((path) => existsSync(path.replace(/\.tsx$/, ".stories.tsx")));
  const stories = storyFiles.flatMap((path) => {
    const source = readFileSync(path.replace(/\.tsx$/, ".stories.tsx"), "utf8");
    return [...source.matchAll(/^export const (\w+): Story/gm)].map((match) => match[1]);
  });

  const documented = components.filter((component) => component.documented).length;
  return {
    components,
    documentedComponents: documented,
    coveragePercent: components.length === 0 ? 0 : Math.round((documented / components.length) * 100),
    storyFiles: storyFiles.length,
    stories: stories.length,
    missing: components.filter((component) => !component.documented).map((component) => `${component.module}:${component.name}`),
  };
}
