import { fileURLToPath } from 'node:url';

// Windows looks up a bare command such as `git` or `go` in the child's working
// directory before PATH. External tools start from this module's own folder,
// so an analyzed repository or the caller's directory cannot supply them.
export const TOOL_CWD = fileURLToPath(new URL('.', import.meta.url));
