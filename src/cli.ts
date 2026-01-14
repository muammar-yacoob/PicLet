#!/usr/bin/env node

import { extname } from 'node:path';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { Command } from 'commander';
import { showBanner } from './lib/banner.js';
import { getConfigPath, loadConfig, resetConfig } from './lib/config.js';
import { wslToWindows } from './lib/paths.js';
import { setUseDefaults } from './lib/prompts.js';
import { addRegistryKey, deleteRegistryKey, isWSL } from './lib/registry.js';
import * as iconpack from './tools/iconpack.js';
import * as makeicon from './tools/makeicon.js';
import * as removeBg from './tools/remove-bg.js';
import * as rescale from './tools/rescale.js';

/** Tool configuration */
interface ToolConfig {
	id: string;
	name: string;
	icon: string;
	extensions: string[];
}

/** Tool registration result */
interface RegistrationResult {
	extension: string;
	toolName: string;
	success: boolean;
}

/** All available tools */
const tools = [
	{ config: makeicon.config, run: makeicon.run },
	{ config: removeBg.config, run: removeBg.run },
	{ config: rescale.config, run: rescale.run },
	{ config: iconpack.config, run: iconpack.run },
];

const program = new Command();

/** Get dist directory */
function getDistDir(): string {
	const currentFile = fileURLToPath(import.meta.url);
	return dirname(currentFile);
}

/** Get registry base path for PicLet menu on an extension */
function getMenuBasePath(extension: string): string {
	return `HKCU\\Software\\Classes\\SystemFileAssociations\\${extension}\\shell\\PicLet`;
}

/** Get all unique extensions from tools */
function getAllExtensions(): string[] {
	const extensions = new Set<string>();
	for (const { config } of tools) {
		for (const ext of config.extensions) {
			extensions.add(ext);
		}
	}
	return Array.from(extensions);
}

/** Get tools that support a given extension */
function getToolsForExtension(extension: string) {
	return tools.filter((t) => t.config.extensions.includes(extension));
}

/** Register PicLet menu for a single extension */
async function registerMenuForExtension(
	extension: string,
	iconsDir: string,
): Promise<RegistrationResult[]> {
	const results: RegistrationResult[] = [];
	const basePath = getMenuBasePath(extension);
	const iconsDirWin = wslToWindows(iconsDir);
	const extensionTools = getToolsForExtension(extension);

	// Create parent PicLet menu
	await addRegistryKey(basePath, 'MUIVerb', 'PicLet');
	await addRegistryKey(basePath, 'Icon', `${iconsDirWin}\\banana.ico`);
	await addRegistryKey(basePath, 'SubCommands', '');

	// Create submenu for each tool
	for (const { config } of extensionTools) {
		const toolPath = `${basePath}\\shell\\${config.id}`;

		const menuSuccess = await addRegistryKey(toolPath, 'MUIVerb', config.name);
		const iconSuccess = await addRegistryKey(
			toolPath,
			'Icon',
			`${iconsDirWin}\\${config.icon}`,
		);

		// Enable multi-select
		await addRegistryKey(toolPath, 'MultiSelectModel', 'Player');

		// Command - %1 must be outside quotes so Windows expands it
		const commandValue = `wsl piclet ${config.id} "%1" -y`;
		const cmdSuccess = await addRegistryKey(
			`${toolPath}\\command`,
			'',
			commandValue,
		);

		results.push({
			extension,
			toolName: config.name,
			success: menuSuccess && iconSuccess && cmdSuccess,
		});
	}

	return results;
}

/** Unregister PicLet menu for a single extension */
async function unregisterMenuForExtension(
	extension: string,
): Promise<RegistrationResult[]> {
	const results: RegistrationResult[] = [];
	const basePath = getMenuBasePath(extension);
	const extensionTools = getToolsForExtension(extension);

	// Delete each tool's submenu
	for (const { config } of extensionTools) {
		const toolPath = `${basePath}\\shell\\${config.id}`;
		await deleteRegistryKey(`${toolPath}\\command`);
		const success = await deleteRegistryKey(toolPath);

		results.push({
			extension,
			toolName: config.name,
			success,
		});
	}

	// Delete the shell container
	await deleteRegistryKey(`${basePath}\\shell`);

	// Delete parent PicLet menu
	await deleteRegistryKey(basePath);

	return results;
}

/** Register all tools */
async function registerAllTools(
	distDir: string,
): Promise<RegistrationResult[]> {
	const iconsDir = join(distDir, 'icons');
	const results: RegistrationResult[] = [];

	for (const extension of getAllExtensions()) {
		const extResults = await registerMenuForExtension(extension, iconsDir);
		results.push(...extResults);
	}

	return results;
}

/** Unregister all tools */
async function unregisterAllTools(): Promise<RegistrationResult[]> {
	const results: RegistrationResult[] = [];

	for (const extension of getAllExtensions()) {
		const extResults = await unregisterMenuForExtension(extension);
		results.push(...extResults);
	}

	return results;
}

/** Get tool by ID */
function getTool(id: string) {
	return tools.find((t) => t.config.id === id);
}

/** Validate files have correct extensions for the tool */
function validateExtensions(
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
async function runToolOnFiles(
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

function showHelp(): void {
	showBanner();

	const dim = chalk.gray;
	const cmd = chalk.cyan;
	const arg = chalk.yellow;
	const opt = chalk.green;
	const head = chalk.white.bold;

	console.log(
		`  ${head('Usage:')} piclet ${cmd('<command>')} ${arg('<file>')} ${opt('[options]')}`,
	);
	console.log();
	console.log(head('  Image Tools'));
	console.log(
		`    ${cmd('makeicon')} ${arg('<file>')}   Convert PNG to multi-resolution ICO`,
	);
	console.log(
		`    ${cmd('remove-bg')} ${arg('<file>')}  Remove solid background from image`,
	);
	console.log(
		`    ${cmd('scale')} ${arg('<file>')}      Resize image with optional padding`,
	);
	console.log(
		`    ${cmd('iconpack')} ${arg('<file>')}   Generate icon sets for Web/Android/iOS`,
	);
	console.log();
	console.log(head('  Setup'));
	console.log(
		`    ${cmd('install')}              Add Windows right-click menu`,
	);
	console.log(`    ${cmd('uninstall')}            Remove right-click menu`);
	console.log();
	console.log(head('  Config'));
	console.log(`    ${cmd('config')}               Display current settings`);
	console.log(`    ${cmd('config reset')}         Restore defaults`);
	console.log();
	console.log(head('  Examples'));
	console.log(`    ${dim('$')} piclet ${cmd('makeicon')} ${arg('logo.png')}        ${dim('# Interactive')}`);
	console.log(`    ${dim('$')} piclet ${cmd('makeicon')} ${arg('*.png')} ${opt('-y')}        ${dim('# Batch with defaults')}`);
	console.log(`    ${dim('$')} piclet ${cmd('remove-bg')} ${arg('photo.png')}      ${dim('# Interactive prompts')}`);
	console.log(`    ${dim('$')} piclet ${cmd('remove-bg')} ${arg('*.png')} ${opt('-y')}       ${dim('# Batch: fuzz=10, trim')}`);
	console.log(`    ${dim('$')} piclet ${cmd('scale')} ${arg('image.jpg')}          ${dim('# Interactive resize')}`);
	console.log(`    ${dim('$')} piclet ${cmd('scale')} ${arg('a.jpg b.jpg')} ${opt('-y')}     ${dim('# Batch: 50% scale')}`);
	console.log(`    ${dim('$')} piclet ${cmd('iconpack')} ${arg('icon.png')} ${opt('-y')}     ${dim('# All platforms')}`);
	console.log();
	console.log(head('  Requirements'));
	console.log('    - WSL (Windows Subsystem for Linux)');
	console.log('    - ImageMagick: sudo apt install imagemagick');
	console.log();
}

// Override default help
program.helpInformation = () => '';
program.on('--help', () => {});

program
	.name('piclet')
	.description('Image manipulation utility toolkit with Windows shell integration')
	.version('1.0.0')
	.action(() => {
		showHelp();
	});

// Help command
program
	.command('help')
	.description('Show help')
	.action(() => {
		showHelp();
	});

// Install command
program
	.command('install')
	.description('Install Windows shell context menu integration')
	.action(async () => {
		showBanner();
		console.log(chalk.bold('Installing...\n'));

		if (!isWSL()) {
			console.log(
				chalk.yellow('! Not running in WSL. Registry integration skipped.'),
			);
			console.log(
				chalk.yellow('! Run "piclet install" from WSL to add context menu.'),
			);
			return;
		}

		// Clean up existing entries first
		console.log(chalk.dim('Removing old entries...'));
		await unregisterAllTools();
		console.log();

		const results = await registerAllTools(getDistDir());
		const successCount = results.filter((r) => r.success).length;

		for (const result of results) {
			if (result.success) {
				console.log(
					`${chalk.green('✓')} ${result.extension} → ${result.toolName}`,
				);
			} else {
				console.log(
					`${chalk.red('✗')} ${result.extension} → ${result.toolName} (failed)`,
				);
			}
		}

		console.log();
		if (successCount === results.length) {
			console.log(
				chalk.green(`✓ Registered ${successCount} context menu entries.`),
			);
		} else {
			console.log(
				chalk.yellow(`! Registered ${successCount}/${results.length} entries.`),
			);
		}

		console.log(chalk.bold('\nUsage:'));
		console.log('  Right-click any supported image in Windows Explorer.');
		console.log('  Multi-select supported for batch processing.');
		console.log();
	});

// Uninstall command
program
	.command('uninstall')
	.description('Remove Windows shell context menu integration')
	.action(async () => {
		showBanner();
		console.log(chalk.bold('Uninstalling...\n'));

		if (!isWSL()) {
			console.log(
				chalk.yellow('! Not running in WSL. Registry cleanup skipped.'),
			);
			console.log(
				chalk.yellow(
					'! Run "piclet uninstall" from WSL to remove context menu.',
				),
			);
			return;
		}

		const results = await unregisterAllTools();
		const removedCount = results.filter((r) => r.success).length;

		for (const result of results) {
			if (result.success) {
				console.log(
					`${chalk.green('✓')} Removed: ${result.extension} → ${result.toolName}`,
				);
			} else {
				console.log(
					`${chalk.gray('-')} Skipped: ${result.extension} → ${result.toolName}`,
				);
			}
		}

		console.log();
		console.log(
			chalk.green(
				`✓ Cleanup complete. Removed ${removedCount}/${results.length} entries.`,
			),
		);
		console.log(chalk.dim('\nThanks for using PicLet!\n'));
	});

// Make Icon command
program
	.command('makeicon <files...>')
	.description('Convert PNG to multi-resolution ICO file')
	.option('-y, --yes', 'Use defaults, skip prompts')
	.action(async (files: string[], options: { yes?: boolean }) => {
		const success = await runToolOnFiles(
			'makeicon',
			files,
			options.yes ?? false,
		);
		process.exit(success ? 0 : 1);
	});

// Remove Background command
program
	.command('remove-bg <files...>')
	.alias('removebg')
	.description('Remove solid background from image')
	.option('-y, --yes', 'Use defaults, skip prompts')
	.action(async (files: string[], options: { yes?: boolean }) => {
		const success = await runToolOnFiles(
			'remove-bg',
			files,
			options.yes ?? false,
		);
		process.exit(success ? 0 : 1);
	});

// Scale command
program
	.command('scale <files...>')
	.alias('rescale')
	.description('Resize image with optional padding')
	.option('-y, --yes', 'Use defaults, skip prompts')
	.action(async (files: string[], options: { yes?: boolean }) => {
		const success = await runToolOnFiles(
			'rescale',
			files,
			options.yes ?? false,
		);
		process.exit(success ? 0 : 1);
	});

// Icon Pack command
program
	.command('iconpack <files...>')
	.description('Generate icon sets for Web, Android, iOS')
	.option('-y, --yes', 'Use defaults, skip prompts')
	.action(async (files: string[], options: { yes?: boolean }) => {
		const success = await runToolOnFiles(
			'iconpack',
			files,
			options.yes ?? false,
		);
		process.exit(success ? 0 : 1);
	});

// Config command
const configCmd = program
	.command('config')
	.description('Display current settings')
	.action(() => {
		const config = loadConfig();
		console.log(chalk.white.bold('\n  PicLet Configuration'));
		console.log(chalk.gray(`  ${getConfigPath()}\n`));
		console.log(JSON.stringify(config, null, 2));
		console.log();
	});

configCmd
	.command('reset')
	.description('Restore defaults')
	.action(() => {
		resetConfig();
		console.log(chalk.green('Configuration reset to defaults.'));
	});

// Parse and run
program.parseAsync(process.argv).catch((error) => {
	console.error(chalk.red(`Error: ${error.message}`));
	process.exit(1);
});
