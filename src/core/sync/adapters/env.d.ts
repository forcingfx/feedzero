/** Type declarations for server-only adapter modules that access Node.js APIs. */
declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
};

declare module "node:fs" {
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(
    path: string,
    data: string,
    encoding: string,
  ): void;
  export function mkdirSync(
    path: string,
    options?: { recursive?: boolean },
  ): string | undefined;
  export function existsSync(path: string): boolean;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}
