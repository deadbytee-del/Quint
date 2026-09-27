const fs = require('fs');
const path = require('path');
const {
  sanitizePackage,
  sanitizeIdentifier,
  artifactIdFor,
  buildPomXml,
  buildPluginYml,
  DEFAULT_API_VERSION,
  DEFAULT_PAPER_VERSION,
} = require('../../public/js/projectTemplate');

/**
 * Materializes a full Maven project on disk from the block-generated Java files.
 * @returns {{dir: string, packageName: string, mainClass: string}}
 */
function writeProject(rootDir, payload) {
  const project = payload.project || {};
  const packageName = sanitizePackage(project.packageName);
  const mainClass = sanitizeIdentifier(project.mainClass, 'QuintMain');
  const normalizedProject = { ...project, packageName, mainClass };

  const packageDir = path.join(rootDir, 'src', 'main', 'java', ...packageName.split('.'));
  const resourcesDir = path.join(rootDir, 'src', 'main', 'resources');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });

  fs.writeFileSync(path.join(rootDir, 'pom.xml'), buildPomXml(normalizedProject));
  fs.writeFileSync(path.join(resourcesDir, 'plugin.yml'), buildPluginYml(normalizedProject, payload.commands));

  for (const file of payload.files || []) {
    const safeRelative = String(file.path || '').replace(/\.\./g, '').replace(/^[/\\]+/, '');
    if (!safeRelative.endsWith('.java')) continue;
    const dest = path.join(packageDir, safeRelative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content || '');
  }

  return { dir: rootDir, packageName, mainClass, artifactId: artifactIdFor(normalizedProject) };
}

module.exports = { writeProject, sanitizePackage, sanitizeIdentifier, DEFAULT_API_VERSION, DEFAULT_PAPER_VERSION };
