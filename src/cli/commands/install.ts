import chalk from 'chalk';
import type { Command } from 'commander';
import { showBanner } from '../../lib/banner.js';
import { isWSL } from '../../lib/registry.js';
import { registerAllTools, unregisterAllTools } from '../registry.js';
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

			// Clean up existing entries first
			console.log(chalk.dim('Removing old entries...'));
			await unregisterAllTools();
			console.log();

			const results = await registerAllTools();
			const allSuccess = results.every((r) => r.success);

			// Display each tool with its extensions
			for (const { config } of tools) {
				const extList = config.extensions.join(', ');
				console.log(`${chalk.green('✓')} ${config.name} [${extList}]`);
			}

			console.log();
			if (allSuccess) {
				console.log(
					chalk.green(`✓ Registered ${tools.length} context menu entries.`),
				);
			} else {
				const successCount = results.filter((r) => r.success).length;
				console.log(
					chalk.yellow(`! Registered ${successCount}/${results.length} entries.`),
				);
			}

			console.log(chalk.bold('\nUsage:'));
			console.log('  Right-click any supported image in Windows Explorer.');
			console.log('  Multi-select supported for batch processing.');
			console.log();
		});
}
