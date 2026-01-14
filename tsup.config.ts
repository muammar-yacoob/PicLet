import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/cli.ts'],
	format: ['esm'],
	target: 'node18',
	clean: true,
	sourcemap: true,
	dts: false,
	shims: true,
	onSuccess: async () => {
		const { cpSync, readFileSync, writeFileSync } = await import('node:fs');

		// Copy icons for registry
		cpSync('src/icons', 'dist/icons', { recursive: true });

		// Add shebang to cli.js
		const cliPath = 'dist/cli.js';
		const content = readFileSync(cliPath, 'utf-8');
		if (!content.startsWith('#!/usr/bin/env node')) {
			writeFileSync(cliPath, `#!/usr/bin/env node\n${content}`);
		}

		console.log('Copied icons to dist/');
	},
});
