import chalk from 'chalk';
import type { Command } from 'commander';
import * as rescale from '../../tools/rescale.js';
import { runToolOnFiles, validateExtensions } from '../utils.js';

export function registerScaleCommand(program: Command): void {
	program
		.command('scale <files...>')
		.alias('rescale')
		.description('Resize image with optional padding')
		.option('-y, --yes', 'Use defaults, skip prompts')
		.option('-g, --gui', 'Use GUI for options')
		.action(async (files: string[], options: { yes?: boolean; gui?: boolean }) => {
			// GUI mode
			if (options.gui) {
				const { valid, invalid } = validateExtensions(files, rescale.config.extensions);
				if (invalid.length > 0) {
					console.error(chalk.red('Invalid file types:'));
					for (const file of invalid) {
						console.error(chalk.red(`  - ${file}`));
					}
				}
				if (valid.length === 0) {
					process.exit(1);
				}
				const result = await rescale.runGUI(valid[0]);
				process.exit(result ? 0 : 1);
			}

			const success = await runToolOnFiles(
				'rescale',
				files,
				options.yes ?? false,
			);
			process.exit(success ? 0 : 1);
		});
}
