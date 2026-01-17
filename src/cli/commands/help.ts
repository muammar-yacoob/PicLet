import type { Command } from 'commander';
import { showHelp } from '../index.js';

export function registerHelpCommand(program: Command): void {
	program
		.command('help')
		.description('Show help')
		.action(() => {
			showHelp();
		});
}
