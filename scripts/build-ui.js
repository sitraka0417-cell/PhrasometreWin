const esbuild = require('esbuild');

esbuild
  .build({
    entryPoints: ['src/app.js'],
    bundle: true,
    outfile: 'renderer/bundle.js',
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    minify: true,
    loader: { '.json': 'json' },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'info'
  })
  .catch(() => process.exit(1));
