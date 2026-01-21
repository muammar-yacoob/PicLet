import chalk from 'chalk';
import type { Command } from 'commander';
import { showBanner } from '../../lib/banner.js';
import { wslToWindows } from '../../lib/paths.js';
import { isWSL, isWSLInteropEnabled } from '../../lib/registry.js';
import { generateRegFile, registerAllTools, unregisterAllTools } from '../registry.js';
import { tools } from '../tools.js';

export function registerInstallCommand(program: Command): void {
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

			if (!isWSLInteropEnabled()) {
				console.log(chalk.yellow('WSL Interop not available. Generating registry file...\n'));

				const regPath = await generateRegFile();
				const winPath = wslToWindows(regPath);

				console.log(chalk.green('✓ Generated registry file:'));
				console.log(chalk.cyan(`  ${winPath}\n`));
				console.log(chalk.bold('To install, either:'));
				console.log(chalk.dim('  1. Double-click the .reg file in Windows Explorer'));
				console.log(chalk.dim(`  2. Run in elevated PowerShell: reg import "${winPath}"`));
				console.log();
				return;
			}

			// Clean up existing entries first
			console.log(chalk.dim('Removing old entries...'));
			await unregisterAllTools();
			console.log();

			const results = await registerAllTools();
			const allSuccess = results.every((r) => r.success);

			// Display each tool with its supported extensions
			for (const { config } of tools) {
				const extList = config.extensions.join(', ');
				console.log(`${chalk.green('✓')} ${config.name} ${chalk.dim(`[${extList}]`)}`);
			}

			console.log();
			if (allSuccess) {
				console.log(
					chalk.green(`✓ Registered ${tools.length} tools for context menu.`),
				);
			} else {
				const successCount = results.filter((r) => r.success).length;
				console.log(
					chalk.yellow(`! Registered ${successCount}/${results.length} entries.`),
				);
			}

			console.log(chalk.bold('\nContext Menu Usage:'));
			console.log('  Right-click any supported image in Windows Explorer.');
			console.log('  Multi-select supported for batch processing.');

			console.log(chalk.bold('\nCLI Usage:'));
			console.log(chalk.cyan('  piclet <image>') + chalk.dim('         Open GUI editor'));
			console.log(chalk.cyan('  piclet makeicon <img>') + chalk.dim('  Convert to .ico'));
			console.log(chalk.cyan('  piclet remove-bg <img>') + chalk.dim(' Remove background'));
			console.log(chalk.cyan('  piclet scale <img>') + chalk.dim('     Resize image'));
			console.log(chalk.cyan('  piclet iconpack <img>') + chalk.dim('  Generate icon pack'));
			console.log(chalk.cyan('  piclet storepack <img>') + chalk.dim(' Generate store assets'));
			console.log(chalk.cyan('  piclet transform <img>') + chalk.dim(' Rotate/flip image'));
			console.log(chalk.cyan('  piclet filter <img>') + chalk.dim('    Apply filters'));
			console.log(chalk.cyan('  piclet border <img>') + chalk.dim('    Add border'));
			console.log(chalk.cyan('  piclet recolor <img>') + chalk.dim('   Replace colors'));
			console.log(chalk.cyan('  piclet extract-frames <gif>') + chalk.dim(' Extract GIF frames'));
			console.log(chalk.dim('\n  Run "piclet --help" for full documentation.'));
			console.log();
		});
}
