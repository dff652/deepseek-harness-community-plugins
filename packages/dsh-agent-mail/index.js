// The integration is intentionally configuration-only. DeepSeek Harness reads
// the bundle patch from package.json; this inert entry keeps the packed module
// valid without copying Agent Mail tool handlers into this repository.
// Automatic wake, session injection and native Cordis services are out of scope.
export function apply() {}

export default { apply };
