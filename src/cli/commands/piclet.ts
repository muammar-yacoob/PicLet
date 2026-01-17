import chalk from 'chalk';
import type { Command } from 'commander';
import { picletTool } from '../tools.js';
import { validateExtensions } from '../utils.js';

export function registerPicletCommand(program: Command): void {
	program
		.command('piclet <file>')
		.description('Open unified PicLet window with all tools')
		.option('-g, --gui', 'Use GUI (default)')
		.action(async (file: string) => {
			const { valid, invalid } = validateExtensions([file], picletTool.config.extensions);
			if (invalid.length > 0) {
				console.error(chalk.red(`Invalid file type: ${file}`));
				console.error(chalk.yellow(`Supported: ${picletTool.config.extensions.join(', ')}`));
				process.exit(1);
			}
			const result = await picletTool.runGUI(valid[0]);
			process.exit(result ? 0 : 1);
		});
}
