import chalk from 'chalk';
import type { Command } from 'commander';
import { showBanner } from '../../lib/banner.js';
import { isWSL } from '../../lib/registry.js';
import { registerAllTools, unregisterAllTools } from '../registry.js';

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

			// Group results by tool name
			const grouped = new Map<string, { extensions: string[]; allSuccess: boolean }>();
			for (const result of results) {
				const existing = grouped.get(result.toolName);
				if (existing) {
					existing.extensions.push(result.extension);
					existing.allSuccess = existing.allSuccess && result.success;
				} else {
					grouped.set(result.toolName, {
						extensions: [result.extension],
						allSuccess: result.success,
					});
				}
			}

			// Display grouped results
			let successCount = 0;
			for (const [toolName, { extensions, allSuccess }] of grouped) {
				const extList = extensions.join(', ');
				if (allSuccess) {
					console.log(`${chalk.green('✓')} ${toolName} ${chalk.dim(`[${extList}]`)}`);
					successCount++;
				} else {
					console.log(`${chalk.red('✗')} ${toolName} ${chalk.dim(`[${extList}]`)} ${chalk.red('(failed)')}`);
				}
			}

			console.log();
			if (successCount === grouped.size) {
				console.log(
					chalk.green(`✓ Registered ${grouped.size} context menu entries.`),
				);
			} else {
				console.log(
					chalk.yellow(`! Registered ${successCount}/${grouped.size} entries.`),
				);
			}

			console.log(chalk.bold('\nUsage:'));
			console.log('  Right-click any supported image in Windows Explorer.');
			console.log('  Multi-select supported for batch processing.');
			console.log();
		});
}
