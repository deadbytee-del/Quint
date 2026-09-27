const fs = require('fs');
const path = require('path');

const DEFAULT_API_VERSION = '1.20';
const DEFAULT_PAPER_VERSION = '1.20.4-R0.1-SNAPSHOT';

function sanitizeIdentifier(name, fallback) {
  const cleaned = String(name || '').replace(/[^A-Za-z0-9_]/g, '');
  if (!cleaned) return fallback;
  return /^[0-9]/.test(cleaned) ? `P${cleaned}` : cleaned;
}

function sanitizePackage(pkg) {
  const parts = String(pkg || 'com.quint.generated')
    .split('.')
    .map((p) => sanitizeIdentifier(p, 'pkg').toLowerCase())
    .filter(Boolean);
  return parts.length ? parts.join('.') : 'com.quint.generated';
}

function escapeYaml(str) {
  return String(str == null ? '' : str).replace(/"/g, '\\"');
}

function buildPomXml(project) {
  const groupId = project.packageName.split('.').slice(0, -1).join('.') || 'com.quint';
  const artifactId = sanitizeIdentifier(project.name, 'quint-plugin').toLowerCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>${groupId}</groupId>
  <artifactId>${artifactId}</artifactId>
  <version>${project.version || '1.0.0'}</version>
  <packaging>jar</packaging>

  <properties>
    <maven.compiler.source>17</maven.compiler.source>
    <maven.compiler.target>17</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>

  <repositories>
    <repository>
      <id>papermc</id>
      <url>https://repo.papermc.io/repository/maven-public/</url>
    </repository>
  </repositories>

  <dependencies>
    <dependency>
      <groupId>io.papermc.paper</groupId>
      <artifactId>paper-api</artifactId>
      <version>${project.paperVersion || DEFAULT_PAPER_VERSION}</version>
      <scope>provided</scope>
    </dependency>
  </dependencies>

  <build>
    <finalName>${artifactId}</finalName>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.13.0</version>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

function buildPluginYml(project, commands) {
  const lines = [
    `name: ${sanitizeIdentifier(project.name, 'QuintPlugin')}`,
    `version: '${project.version || '1.0.0'}'`,
    `main: ${project.packageName}.${project.mainClass}`,
    `api-version: '${project.apiVersion || DEFAULT_API_VERSION}'`,
  ];
  if (project.description) lines.push(`description: "${escapeYaml(project.description)}"`);
  if (project.author) lines.push(`author: "${escapeYaml(project.author)}"`);
  if (commands && commands.length) {
    lines.push('commands:');
    for (const cmd of commands) {
      const cname = sanitizeIdentifier(cmd.name, 'cmd').toLowerCase();
      lines.push(`  ${cname}:`);
      if (cmd.description) lines.push(`    description: "${escapeYaml(cmd.description)}"`);
      lines.push(`    usage: "${escapeYaml(cmd.usage || `/${cname}`)}"`);
    }
  }
  return lines.join('\n') + '\n';
}

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

  return { dir: rootDir, packageName, mainClass, artifactId: sanitizeIdentifier(project.name, 'quint-plugin').toLowerCase() };
}

module.exports = { writeProject, sanitizePackage, sanitizeIdentifier, DEFAULT_API_VERSION, DEFAULT_PAPER_VERSION };
