import chalk from 'chalk';
import type { Command } from 'commander';
import { showBanner } from '../../lib/banner.js';
import { isWSL } from '../../lib/registry.js';
import { unregisterAllTools } from '../registry.js';

export function registerUninstallCommand(program: Command): void {
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
}
