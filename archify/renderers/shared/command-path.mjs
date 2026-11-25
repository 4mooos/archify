import fs from 'node:fs';
import path from 'node:path';

// Resolve a bare command name to an absolute file using PATH only. Given a
// name without a directory, Windows process creation first searches the
// working directory (or the spawn cwd), so a repository under analysis could
// supply the program. Spawn the returned path instead. Relative PATH entries,
// the given exact directories and anything inside the given roots are skipped.
const real = (location) => { try { return fs.realpathSync.native(location); } catch { return path.resolve(location); } };
const within = (root, location) => {
  const relative = path.relative(root, location);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

export function resolveCommandOnPath(name, { exclude = [], excludeWithin = [], env = process.env } = {}) {
  const windows = process.platform === 'win32';
  const names = windows ? [...(path.extname(name) ? [name] : []), `${name}.com`, `${name}.exe`] : [name];
  const excluded = exclude.filter(Boolean).map(real);
  const roots = excludeWithin.filter(Boolean).map(real);
  for (const raw of String(env.PATH || '').split(path.delimiter)) {
    const entry = windows ? raw.replace(/^"(.*)"$/, '$1') : raw;
    if (!entry || !path.isAbsolute(entry)) continue;
    const directory = real(entry);
    if (excluded.some(item => path.relative(item, directory) === '') || roots.some(root => within(root, directory))) continue;
    for (const candidate of names.map(item => path.join(directory, item))) {
      try {
        if (!fs.statSync(candidate).isFile()) continue;
        if (!windows) fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch { /* try the next candidate */ }
    }
  }
  return null;
}
