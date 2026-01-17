import { extname } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { setUseDefaults } from '../lib/prompts.js';
import { getTool } from './tools.js';

/** Get dist directory (where cli.js lives after bundling) */
export function getDistDir(): string {
	const currentFile = fileURLToPath(import.meta.url);
	// tsup bundles everything into dist/cli.js, so dirname gives dist/
	return dirname(currentFile);
}

/** Get registry base path for PicLet menu on an extension */
export function getMenuBasePath(extension: string): string {
	return `HKCU\\Software\\Classes\\SystemFileAssociations\\${extension}\\shell\\PicLet`;
}

/** Validate files have correct extensions for the tool */
export function validateExtensions(
	files: string[],
	allowedExtensions: string[],
): { valid: string[]; invalid: string[] } {
	const valid: string[] = [];
	const invalid: string[] = [];

	for (const file of files) {
		const ext = extname(file).toLowerCase();
		if (allowedExtensions.includes(ext)) {
			valid.push(file);
		} else {
			invalid.push(file);
		}
	}

	return { valid, invalid };
}

/** Run tool on multiple files */
export async function runToolOnFiles(
	toolId: string,
	files: string[],
	useYes: boolean,
): Promise<boolean> {
	const tool = getTool(toolId);
	if (!tool) {
		console.error(chalk.red(`Tool not found: ${toolId}`));
		return false;
	}

	// Validate extensions
	const { valid, invalid } = validateExtensions(files, tool.config.extensions);

	if (invalid.length > 0) {
		console.error(chalk.red('Invalid file types:'));
		for (const file of invalid) {
			console.error(chalk.red(`  ✗ ${file}`));
		}
		console.error(
			chalk.yellow(
				`\nSupported extensions: ${tool.config.extensions.join(', ')}`,
			),
		);
		if (valid.length === 0) return false;
		console.log();
	}

	// Enable defaults mode if --yes flag or multiple files
	if (useYes || valid.length > 1) {
		setUseDefaults(true);
	}

	// Process files
	let allSuccess = true;
	for (let i = 0; i < valid.length; i++) {
		const file = valid[i];
		if (valid.length > 1) {
			console.log(chalk.cyan(`\n[${i + 1}/${valid.length}] ${file}`));
		}
		const success = await tool.run(file);
		if (!success) allSuccess = false;
	}

	return allSuccess;
}
