/**
 * GUI Server - Serves HTML interface and handles API calls
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Signal the loading HTA to close by creating a temp file
 */
function signalReady(): void {
	// Write ready signal to Windows temp directory
	spawn('cmd.exe', ['/c', 'echo.>', '%TEMP%\\piclet-ready.tmp'], {
		stdio: 'ignore',
		windowsHide: true,
	});
}

/**
 * Open URL in Edge app mode (standalone window without browser UI)
 */
function openAppWindow(url: string): void {
	// Use cmd.exe with start command - windowsHide hides the cmd window
	// The start command launches Edge which creates its own visible window
	spawn('cmd.exe', ['/c', 'start', '""', 'msedge', `--app=${url}`], {
		detached: true,
		stdio: 'ignore',
		windowsHide: true,
	}).unref();

	// Signal loading window to close after a brief delay for Edge to appear
	setTimeout(signalReady, 500);
}

export interface GuiServerOptions {
	htmlFile: string;
	title: string;
	imageInfo: {
		filePath: string;
		fileName: string;
		width: number;
		height: number;
		borderColor: string | null;
	};
	defaults: Record<string, unknown>;
	onPreview?: (options: Record<string, unknown>) => Promise<{
		success: boolean;
		imageData?: string; // Base64 data URL
		width?: number;
		height?: number;
		error?: string;
	}>;
	onProcess: (options: Record<string, unknown>) => Promise<{
		success: boolean;
		output?: string;
		error?: string;
		logs: Array<{ type: string; message: string }>;
	}>;
}

/**
 * Start GUI server and open Edge app window
 * Returns a promise that resolves when the window is closed
 */
export function startGuiServer(options: GuiServerOptions): Promise<boolean> {
	return new Promise((resolve) => {
		const app = express();
		app.use(express.json());

		let processResult: boolean | null = null;
		let server: ReturnType<typeof createServer> | null = null;

		// Serve static files (CSS, JS, etc.)
		const guiDir = join(__dirname, 'gui');
		const iconsDir = join(__dirname, 'icons');
		app.use(express.static(guiDir));
		app.use('/icons', express.static(iconsDir));

		// Serve favicon from icons directory
		app.get('/favicon.ico', (_req, res) => {
			res.sendFile(join(iconsDir, 'banana.ico'));
		});

		// API: Get image info and defaults
		app.get('/api/info', (_req, res) => {
			res.json({
				fileName: options.imageInfo.fileName,
				width: options.imageInfo.width,
				height: options.imageInfo.height,
				borderColor: options.imageInfo.borderColor,
				defaults: options.defaults,
			});
		});

		// API: Preview image (if supported)
		app.post('/api/preview', async (req, res) => {
			if (!options.onPreview) {
				res.json({ success: false, error: 'Preview not supported' });
				return;
			}
			try {
				const result = await options.onPreview(req.body);
				res.json(result);
			} catch (err) {
				res.json({
					success: false,
					error: (err as Error).message,
				});
			}
		});

		// API: Process image
		app.post('/api/process', async (req, res) => {
			try {
				const result = await options.onProcess(req.body);
				processResult = result.success;
				res.json(result);
			} catch (err) {
				processResult = false;
				res.json({
					success: false,
					error: (err as Error).message,
					logs: [{ type: 'error', message: (err as Error).message }],
				});
			}
		});

		// API: Cancel/close
		app.post('/api/cancel', (_req, res) => {
			processResult = false;
			res.json({ ok: true });
			shutdown();
		});

		// API: Close after completion
		app.post('/api/close', (_req, res) => {
			res.json({ ok: true });
			shutdown();
		});

		function shutdown() {
			setTimeout(() => {
				server?.close();
				resolve(processResult ?? false);
			}, 100);
		}

		// Find available port and start
		server = createServer(app);
		server.listen(0, '127.0.0.1', () => {
			const addr = server!.address();
			if (typeof addr === 'object' && addr) {
				const port = addr.port;
				const url = `http://127.0.0.1:${port}/${options.htmlFile}`;

				openAppWindow(url);

				// Auto-close after 5 minutes of inactivity
				setTimeout(() => {
					if (processResult === null) {
						shutdown();
					}
				}, 5 * 60 * 1000);
			}
		});

		server.on('error', (err) => {
			console.error('GUI server error:', err.message);
			resolve(false);
		});
	});
}
