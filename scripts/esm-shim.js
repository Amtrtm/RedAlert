// ESM shim for esbuild CJS bundling
// Replaces import.meta.url with a file:// URL derived from __filename
const __bundled_import_meta_url = require('url').pathToFileURL(__filename).href;
