import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const extensionDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const buildModulePath = join(
  extensionDirectory,
  '..',
  '..',
  'node_modules',
  '@shopify',
  'app',
  'dist',
  'cli',
  'services',
  'function',
  'build.js'
);
const { ExportJavyBuilder } = await import(pathToFileURL(buildModulePath).href);
const builder = new ExportJavyBuilder(['run']);

await builder.bundle(
  {
    directory: extensionDirectory,
    entrySourceFilePath: join(extensionDirectory, 'src/index.js'),
  },
  {
    app: { dotenv: { variables: {} } },
    stdout: process.stdout,
    stderr: process.stderr,
  }
);

await builder.compile(
  {
    directory: extensionDirectory,
    entrySourceFilePath: join(extensionDirectory, 'src/index.js'),
    outputPath: join(extensionDirectory, 'dist/index.wasm'),
  },
  {
    stdout: process.stdout,
    stderr: process.stderr,
  }
);
