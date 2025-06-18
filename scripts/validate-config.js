#!/usr/bin/env node

/**
 * Configuration Validation Script
 * 
 * Validates that the project configuration adheres to Cloudflare Agents standards:
 * - All Agent classes in durable_objects.bindings are properly declared
 * - All Agent classes using SQL are in migrations.new_sqlite_classes
 * - No secrets in source code
 * - Required directories and files exist
 */

const fs = require('fs');
const path = require('path');

function validateProject() {
  const errors = [];
  const warnings = [];

  // Check wrangler.jsonc exists and is valid
  const wranglerPath = 'wrangler.jsonc';
  if (!fs.existsSync(wranglerPath)) {
    errors.push('wrangler.jsonc not found');
    return { errors, warnings };
  }

  let config;
  try {
    const configText = fs.readFileSync(wranglerPath, 'utf8');
    // Remove comments for JSON.parse (simple approach)
    const jsonText = configText.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    config = JSON.parse(jsonText);
  } catch (e) {
    errors.push(`Invalid wrangler.jsonc: ${e.message}`);
    return { errors, warnings };
  }

  // Validate durable_objects.bindings exist
  if (!config.durable_objects?.bindings || !Array.isArray(config.durable_objects.bindings)) {
    errors.push('wrangler.jsonc must have durable_objects.bindings array');
    return { errors, warnings };
  }

  // Check for required project structure
  const requiredDirs = ['src', 'src/agents', 'test'];
  for (const dir of requiredDirs) {
    if (!fs.existsSync(dir)) {
      errors.push(`Required directory missing: ${dir}`);
    }
  }

  const requiredFiles = ['package.json', 'src/index.ts'];
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      errors.push(`Required file missing: ${file}`);
    }
  }

  // Check .gitignore contains required entries
  if (fs.existsSync('.gitignore')) {
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    const requiredIgnores = ['.dev.vars', 'node_modules', '.wrangler'];
    for (const ignore of requiredIgnores) {
      if (!gitignore.includes(ignore)) {
        warnings.push(`.gitignore should include: ${ignore}`);
      }
    }
  } else {
    warnings.push('.gitignore file recommended');
  }

  // Collect all Agent class names from bindings
  const boundAgentClasses = config.durable_objects.bindings.map(b => b.class_name);
  
  // Check if agent files exist
  for (const className of boundAgentClasses) {
    const agentFile = `src/agents/${className}.ts`;
    if (!fs.existsSync(agentFile)) {
      warnings.push(`Agent file not found: ${agentFile} (for class ${className})`);
    }
  }

  // Collect all classes in migrations
  const migratedClasses = [];
  if (config.migrations && Array.isArray(config.migrations)) {
    for (const migration of config.migrations) {
      if (migration.new_sqlite_classes && Array.isArray(migration.new_sqlite_classes)) {
        migratedClasses.push(...migration.new_sqlite_classes);
      }
    }
  }

  // Warn about agents not in migrations (they won't have SQL access)
  for (const className of boundAgentClasses) {
    if (!migratedClasses.includes(className)) {
      warnings.push(`Agent ${className} not in migrations - will not have SQL access`);
    }
  }

  // Scan for potential hardcoded secrets (but ignore env var access)
  const secretPatterns = [
    /api[_-]?key\s*[:=]\s*["'][a-zA-Z0-9]{10,}["']/i,
    /secret\s*[:=]\s*["'][a-zA-Z0-9]{10,}["']/i,
    /token\s*[:=]\s*["'][a-zA-Z0-9]{20,}["']/i,
    /password\s*[:=]\s*["'][a-zA-Z0-9]{5,}["']/i
  ];
  
  const envVarPatterns = [
    /\benv\./,
    /process\.env\./,
    /c\.env\./
  ];

  function scanDirectory(dir) {
    if (!fs.existsSync(dir)) return;
    
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        scanDirectory(itemPath);
      } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.js'))) {
        const content = fs.readFileSync(itemPath, 'utf8');
        for (const pattern of secretPatterns) {
          const match = content.match(pattern);
          if (match) {
            // Check if this looks like environment variable access
            const line = content.split('\n').find(l => l.includes(match[0]));
            const isEnvVar = envVarPatterns.some(envPattern => envPattern.test(line));
            
            if (!isEnvVar) {
              errors.push(`Potential hardcoded secret in ${itemPath}: ${match[0]}`);
            }
          }
        }
      }
    }
  }

  scanDirectory('src');

  return { errors, warnings };
}

function main() {
  console.log('🔍 Validating Cloudflare Agents project configuration...\n');
  
  const { errors, warnings } = validateProject();
  
  if (warnings.length > 0) {
    console.log('⚠️  Warnings:');
    for (const warning of warnings) {
      console.log(`   ${warning}`);
    }
    console.log();
  }
  
  if (errors.length > 0) {
    console.log('❌ Errors:');
    for (const error of errors) {
      console.log(`   ${error}`);
    }
    console.log('\nConfiguration validation failed.');
    process.exit(1);
  } else {
    console.log('✅ Configuration validation passed.');
    if (warnings.length === 0) {
      console.log('   No issues found.');
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateProject };