import chalk from 'chalk';
import type { Command } from 'commander';
import { showBanner } from '../../lib/banner.js';
import { wslToWindows } from '../../lib/paths.js';
import { isWSL, isWSLInteropEnabled } from '../../lib/registry.js';
import { generateUninstallRegFile, unregisterAllTools } from '../registry.js';

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

			if (!isWSLInteropEnabled()) {
				console.log(chalk.yellow('WSL Interop not available. Generating registry file...\n'));

				const regPath = await generateUninstallRegFile();
				const winPath = wslToWindows(regPath);

				console.log(chalk.green('✓ Generated uninstall registry file:'));
				console.log(chalk.cyan(`  ${winPath}\n`));
				console.log(chalk.bold('To uninstall, either:'));
				console.log(chalk.dim('  1. Double-click the .reg file in Windows Explorer'));
				console.log(chalk.dim(`  2. Run in elevated PowerShell: reg import "${winPath}"`));
				console.log();
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
