#!/usr/bin/env node

import chalk from 'chalk';
import { createProgram } from './cli/index.js';

const program = createProgram();

program.parseAsync(process.argv).catch((error) => {
	console.error(chalk.red(`Error: ${error.message}`));
	process.exit(1);
});
