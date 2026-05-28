import type { ComponentType } from "react";
import { HelloWorld } from "./hello-world/HelloWorld";
import helloWorldSource from "./hello-world/HelloWorld.tsx?raw";

/** What we want readers to copy-paste — the published package name, not the
 *  in-repo relative path. Demo files import from "../../lib" so the SPA
 *  doesn't depend on `npm link`, but the displayed source rewrites that to
 *  this name. Update if the published package gets a scope. */
const PACKAGE_NAME = "unfold";

/** Rewrite in-repo relative imports of the library to the published package
 *  name. Matches `from "../../lib"` and `from "../../lib/anything"`. */
function rewriteForDisplay(source: string): string {
  return source.replace(
    /from\s+(["'])\.\.\/\.\.\/lib(\/[^"']*)?\1/g,
    (_m, q, sub) => `from ${q}${PACKAGE_NAME}${sub ?? ""}${q}`,
  );
}

export interface Demo {
  slug: string;
  title: string;
  blurb: string;
  Component: ComponentType;
  source: string;
  sourcePath: string;
}

export const demos: Demo[] = [
  {
    slug: "hello-world",
    title: "Hello World",
    blurb:
      "The smallest possible <Unfold>: 5 nodes, 4 edges, no theme, no callbacks. " +
      "Shows the default layered layout and out-of-the-box look.",
    Component: HelloWorld,
    source: rewriteForDisplay(helloWorldSource),
    sourcePath: "src/demos/hello-world/HelloWorld.tsx",
  },
];

export function findDemo(slug: string): Demo | undefined {
  return demos.find((d) => d.slug === slug);
}
