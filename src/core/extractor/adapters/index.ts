import { registry } from "./registry.ts";
import { githubAdapter } from "./github-adapter.ts";

registry.register(githubAdapter);

export { registry };
