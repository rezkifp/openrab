const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const src = path.join(context.packager.projectDir, '.next', 'standalone', 'node_modules');
  const dest = path.join(context.appOutDir, 'resources', 'standalone', 'node_modules');
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
    console.log('Copied standalone node_modules to:', dest);
  }
  const drizzleSrc = path.join(context.packager.projectDir, 'drizzle');
  const drizzleDest = path.join(context.appOutDir, 'resources', 'standalone', 'drizzle');
  if (fs.existsSync(drizzleSrc)) {
    fs.cpSync(drizzleSrc, drizzleDest, { recursive: true });
    console.log('Copied drizzle migrations to:', drizzleDest);
  }
};
