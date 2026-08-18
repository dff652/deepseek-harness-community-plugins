// The integration is intentionally configuration-only. DeepSeek Harness reads
// the bundle patch from package.json; this inert entry keeps the packed module
// valid without copying AgentMemory handlers or a stdio adapter into this
// repository. Automatic prompt, tool-result and full-session capture are out
// of scope.
export function apply() {}

export default { apply };
