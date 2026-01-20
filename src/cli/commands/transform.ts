import chalk from 'chalk';
import type { Command } from 'commander';
import * as transform from '../../tools/transform.js';
import { runToolOnFiles, validateExtensions } from '../utils.js';

export function registerTransformCommand(program: Command): void {
	program
		.command('transform <files...>')
		.alias('flip')
		.description('Flip or rotate images')
		.option('-y, --yes', 'Use defaults, skip prompts')
		.option('-g, --gui', 'Use GUI for options')
		.action(async (files: string[], options: { yes?: boolean; gui?: boolean }) => {
			if (options.gui) {
				const { valid, invalid } = validateExtensions(files, transform.config.extensions);
				if (invalid.length > 0) {
					console.error(chalk.red('Invalid file types:'));
					for (const file of invalid) {
						console.error(chalk.red(`  - ${file}`));
					}
				}
				if (valid.length === 0) {
					process.exit(1);
				}
				const result = await transform.runGUI(valid[0]);
				process.exit(result ? 0 : 1);
			}

			const success = await runToolOnFiles(
				'transform',
				files,
				options.yes ?? false,
			);
			process.exit(success ? 0 : 1);
		});
}
