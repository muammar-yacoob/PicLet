import chalk from 'chalk';
import type { Command } from 'commander';
import { showBanner } from '../../lib/banner.js';
import { wslToWindows } from '../../lib/paths.js';
import { isWSL, isWSLInteropEnabled } from '../../lib/registry.js';
import { generateRegFile, registerAllTools, unregisterAllTools } from '../registry.js';

export function registerInstallCommand(program: Command): void {
	program
		.command('install')
		.description('Install Windows shell context menu integration')
		.action(async () => {
			console.log(chalk.bold('Installing...\n'));
			showBanner();

			if (!isWSL()) {
				console.log(
					chalk.yellow('! Not running in WSL. Registry integration skipped.'),
				);
				console.log(
					chalk.yellow('! Run "piclet install" from WSL to add context menu.'),
				);
				return;
			}

			if (!isWSLInteropEnabled()) {
				console.log(chalk.yellow('WSL Interop not available. Generating registry file...\n'));

				const regPath = await generateRegFile();
				const winPath = wslToWindows(regPath);

				console.log(chalk.green('✓ Generated registry file:'));
				console.log(chalk.cyan(`  ${winPath}\n`));
				console.log(chalk.bold('To install, either:'));
				console.log(chalk.dim('  1. Double-click the .reg file in Windows Explorer'));
				console.log(chalk.dim(`  2. Run in elevated PowerShell: reg import "${winPath}"`));
				return;
			}

			// Clean up existing entries first
			// console.log(chalk.dim('Removing old entries...'));
			await unregisterAllTools();
			await registerAllTools();

			const dim = chalk.gray;
			const cmd = chalk.cyan;
			const arg = chalk.hex('#cc8800'); // dimmer orange for <file>
			const opt = chalk.green;
			const head = chalk.white.bold;

			console.log(chalk.bold('\nContext Menu Usage:'));
			console.log('  Right-click any supported image in Windows Explorer.');
			console.log('  Multi-select supported for batch processing.');
			console.log(
				`  Supported image formats: ${arg('[.png, .jpg, .jpeg, .gif, .bmp, .ico]')}`,
			);

			console.log(head('\nCLI Usage:'));
			console.log(
				`  ${head('Usage:')} piclet ${cmd('<command>')} ${arg('<file>')} ${opt('[options]')}`,
			);
			console.log();
			console.log(head('  GUI'));
			console.log(
				`    ${cmd('piclet')} ${arg('<file>')}     Opens PicLet GUI window with all tools`,
			);
			console.log();
			console.log(head('  Setup'));
			console.log(`    ${cmd('install')}              Add Windows right-click menu`);
			console.log(`    ${cmd('uninstall')}            Remove right-click menu`);
			console.log();
			console.log(head('  Config'));
			console.log(`    ${cmd('config')}               Display current settings`);
			console.log(`    ${cmd('config reset')}         Restore defaults`);
			console.log();
			console.log(head('  Prerequisites'));
			console.log('    - WSL (Windows Subsystem for Linux)');
			console.log('    - ImageMagick: sudo apt install imagemagick');
			console.log();
			console.log(head('  Examples'));
			console.log(`    ${dim('$')} piclet ${cmd('piclet')} ${arg('image.png')}         ${dim('# All tools in one window')}`);
			console.log(`    ${dim('$')} piclet ${cmd('makeicon')} ${arg('logo.png')}        ${dim('# Interactive')}`);
			console.log(`    ${dim('$')} piclet ${cmd('makeicon')} ${arg('*.png')} ${opt('-y')}        ${dim('# Batch with defaults')}`);
			console.log(`    ${dim('$')} piclet ${cmd('remove-bg')} ${arg('photo.png')}      ${dim('# Interactive prompts')}`);
			console.log(`    ${dim('$')} piclet ${cmd('scale')} ${arg('image.jpg')}          ${dim('# Interactive resize')}`);
			console.log(`    ${dim('$')} piclet ${cmd('gif')} ${arg('anim.gif')}             ${dim('# Extract GIF frames')}`);
			console.log(`    ${dim('$')} piclet ${cmd('iconpack')} ${arg('icon.png')} ${opt('-y')}     ${dim('# All platforms')}`);
			console.log(`    ${dim('$')} piclet ${cmd('storepack')} ${arg('image.png')} ${opt('-g')}   ${dim('# GUI for store assets')}`);
			console.log(
				`\n  Run "piclet ${opt('--help')}" for full documentation.`,
			);
			console.log();
		});
}
