import chalk from 'chalk';
import type { Command } from 'commander';
import * as filter from '../../tools/filter.js';
import { runToolOnFiles, validateExtensions } from '../utils.js';

export function registerFilterCommand(program: Command): void {
	program
		.command('filter <files...>')
		.description('Apply color filters (grayscale, sepia, etc.)')
		.option('-y, --yes', 'Use defaults, skip prompts')
		.option('-g, --gui', 'Use GUI for options')
		.action(async (files: string[], options: { yes?: boolean; gui?: boolean }) => {
			if (options.gui) {
				const { valid, invalid } = validateExtensions(files, filter.config.extensions);
				if (invalid.length > 0) {
					console.error(chalk.red('Invalid file types:'));
					for (const file of invalid) {
						console.error(chalk.red(`  - ${file}`));
					}
				}
				if (valid.length === 0) {
					process.exit(1);
				}
				const result = await filter.runGUI(valid[0]);
				process.exit(result ? 0 : 1);
			}

			const success = await runToolOnFiles(
				'filter',
				files,
				options.yes ?? false,
			);
			process.exit(success ? 0 : 1);
		});
}
