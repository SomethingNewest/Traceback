import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter(
        (entry) =>
          !entry.name.startsWith('.') && !['work', 'outputs', 'node_modules'].includes(entry.name),
      )
      .map((entry) =>
        entry.isDirectory() ? walk(resolve(directory, entry.name)) : resolve(directory, entry.name),
      ),
  );
  return nested.flat();
}
const files = (await walk(root)).filter((path) => /\.m?js$/.test(path));
let imports = 0;
for (const file of files) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(check.stderr);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)) {
    await access(resolve(dirname(file), match[1]));
    imports++;
  }
}
const html = await readFile(resolve(root, 'index.html'), 'utf8');
let assets = 0;
for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) {
  await access(resolve(root, match[1]));
  assets++;
}
console.log(
  `Checked syntax for ${files.length} JavaScript files, ${imports} relative imports and ${assets} entry assets.`,
);
