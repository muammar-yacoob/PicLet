import chalk from 'chalk';
import { Command } from 'commander';
import { showBanner } from '../lib/banner.js';
import { registerConfigCommand } from './commands/config.js';
import { registerHelpCommand } from './commands/help.js';
import { registerIconpackCommand } from './commands/iconpack.js';
import { registerInstallCommand } from './commands/install.js';
import { registerMakeiconCommand } from './commands/makeicon.js';
import { registerPicletCommand } from './commands/piclet.js';
import { registerRemoveBgCommand } from './commands/remove-bg.js';
import { registerScaleCommand } from './commands/scale.js';
import { registerStorepackCommand } from './commands/storepack.js';
import { registerUninstallCommand } from './commands/uninstall.js';

export function showHelp(): void {
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
	console.log(head('  Unified'));
	console.log(
		`    ${cmd('piclet')} ${arg('<file>')}     Open all tools in one window`,
	);
	console.log();
	console.log(head('  Individual Tools'));
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
	console.log(
		`    ${cmd('storepack')} ${arg('<file>')}  Generate assets for app stores`,
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
	console.log(`    ${dim('$')} piclet ${cmd('piclet')} ${arg('image.png')}         ${dim('# All tools in one window')}`);
	console.log(`    ${dim('$')} piclet ${cmd('makeicon')} ${arg('logo.png')}        ${dim('# Interactive')}`);
	console.log(`    ${dim('$')} piclet ${cmd('makeicon')} ${arg('*.png')} ${opt('-y')}        ${dim('# Batch with defaults')}`);
	console.log(`    ${dim('$')} piclet ${cmd('remove-bg')} ${arg('photo.png')}      ${dim('# Interactive prompts')}`);
	console.log(`    ${dim('$')} piclet ${cmd('scale')} ${arg('image.jpg')}          ${dim('# Interactive resize')}`);
	console.log(`    ${dim('$')} piclet ${cmd('iconpack')} ${arg('icon.png')} ${opt('-y')}     ${dim('# All platforms')}`);
	console.log();
	console.log(head('  Requirements'));
	console.log('    - WSL (Windows Subsystem for Linux)');
	console.log('    - ImageMagick: sudo apt install imagemagick');
	console.log();
}

export function createProgram(): Command {
	const program = new Command();

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

	// Register all commands
	registerHelpCommand(program);
	registerInstallCommand(program);
	registerUninstallCommand(program);
	registerMakeiconCommand(program);
	registerRemoveBgCommand(program);
	registerScaleCommand(program);
	registerIconpackCommand(program);
	registerStorepackCommand(program);
	registerPicletCommand(program);
	registerConfigCommand(program);

	return program;
}

export * from './tools.js';
export * from './utils.js';
export * from './registry.js';
