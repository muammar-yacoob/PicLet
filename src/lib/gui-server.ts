/**
 * GUI Server - Serves HTML interface and handles API calls
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { deletePreset, savePreset, type Preset } from './presets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Signal the loading HTA to close by creating a temp file
 */
function signalReady(): void {
	// Write ready signal to Windows temp directory using PowerShell (no window flash)
	spawn('powershell.exe', ['-WindowStyle', 'Hidden', '-Command', 'New-Item -Path $env:TEMP\\piclet-ready.tmp -ItemType File -Force | Out-Null'], {
		stdio: 'ignore',
		windowsHide: true,
	});
}

/**
 * Open URL in Edge app mode (standalone window without browser UI)
 */
function openAppWindow(url: string): void {
	// Use PowerShell with hidden window to launch Edge - prevents terminal flash
	spawn('powershell.exe', [
		'-WindowStyle', 'Hidden',
		'-Command',
		`Start-Process msedge -ArgumentList '--app=${url}'`
	], {
		detached: true,
		stdio: 'ignore',
		windowsHide: true,
	}).unref();

	// Signal loading window to close immediately - Edge starts fast
	signalReady();
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
		frameCount?: number;
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
		outputPath?: string; // Full path to single output file (for preview)
		error?: string;
		logs: Array<{ type: string; message: string }>;
	}>;
	onLoadImage?: (data: { fileName: string; data: string; mimeType: string }) => Promise<{
		success: boolean;
		filePath?: string;
		fileName?: string;
		width?: number;
		height?: number;
		borderColor?: string | null;
		frameCount?: number;
		error?: string;
	}>;
	onFrameThumbnail?: (frameIndex: number) => Promise<{
		success: boolean;
		imageData?: string;
		error?: string;
	}>;
	onFramePreview?: (frameIndex: number, options: Record<string, unknown>) => Promise<{
		success: boolean;
		imageData?: string;
		error?: string;
	}>;
	onSimplifyGif?: (skipFactor: number) => Promise<{
		success: boolean;
		filePath?: string;
		fileName?: string;
		width?: number;
		height?: number;
		frameCount?: number;
		error?: string;
	}>;
	onDeleteFrame?: (frameIndex: number) => Promise<{
		success: boolean;
		frameCount?: number;
		error?: string;
	}>;
	onReplaceFrame?: (frameIndex: number, imageData: string) => Promise<{
		success: boolean;
		frameCount?: number;
		error?: string;
	}>;
}

/**
 * Start GUI server and open Edge app window
 * Returns a promise that resolves when the window is closed
 */
export function startGuiServer(options: GuiServerOptions): Promise<boolean> {
	return new Promise((resolve) => {
		const app = express();
		app.use(express.json({ limit: '50mb' })); // Allow large base64 images

		// Handle JSON parse errors
		app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
			if (err instanceof SyntaxError && 'body' in err) {
				res.status(400).json({ success: false, error: 'Invalid JSON: ' + err.message });
				return;
			}
			next(err);
		});

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
				frameCount: options.imageInfo.frameCount || 1,
				defaults: options.defaults,
			});
		});

		// API: Get frame thumbnail (for GIFs)
		app.post('/api/frame-thumbnail', async (req, res) => {
			if (!options.onFrameThumbnail) {
				res.json({ success: false, error: 'Frame thumbnails not supported' });
				return;
			}
			try {
				const frameIndex = (req.body.frameIndex as number) ?? 0;
				const result = await options.onFrameThumbnail(frameIndex);
				res.json(result);
			} catch (err) {
				res.json({ success: false, error: (err as Error).message });
			}
		});

		// API: Get processed frame preview (for GIFs)
		app.post('/api/frame-preview', async (req, res) => {
			if (!options.onFramePreview) {
				res.json({ success: false, error: 'Frame preview not supported' });
				return;
			}
			try {
				const { frameIndex, ...opts } = req.body;
				const result = await options.onFramePreview(frameIndex ?? 0, opts);
				res.json(result);
			} catch (err) {
				res.json({ success: false, error: (err as Error).message });
			}
		});

		// API: Simplify GIF by skipping frames
		app.post('/api/simplify-gif', async (req, res) => {
			if (!options.onSimplifyGif) {
				res.json({ success: false, error: 'GIF simplification not supported' });
				return;
			}
			try {
				const skipFactor = (req.body.skipFactor as number) ?? 2;
				const result = await options.onSimplifyGif(skipFactor);
				if (result.success) {
					// Update current image info
					options.imageInfo.filePath = result.filePath!;
					options.imageInfo.fileName = result.fileName!;
					options.imageInfo.width = result.width!;
					options.imageInfo.height = result.height!;
					options.imageInfo.frameCount = result.frameCount;
				}
				res.json(result);
			} catch (err) {
				res.json({ success: false, error: (err as Error).message });
			}
		});

		// API: Delete a frame from GIF
		app.post('/api/delete-frame', async (req, res) => {
			if (!options.onDeleteFrame) {
				res.json({ success: false, error: 'Frame deletion not supported' });
				return;
			}
			try {
				const frameIndex = req.body.frameIndex as number;
				const result = await options.onDeleteFrame(frameIndex);
				if (result.success) {
					options.imageInfo.frameCount = result.frameCount;
				}
				res.json(result);
			} catch (err) {
				res.json({ success: false, error: (err as Error).message });
			}
		});

		// API: Replace a frame in GIF
		app.post('/api/replace-frame', async (req, res) => {
			if (!options.onReplaceFrame) {
				res.json({ success: false, error: 'Frame replacement not supported' });
				return;
			}
			try {
				const { frameIndex, imageData } = req.body;
				const result = await options.onReplaceFrame(frameIndex, imageData);
				if (result.success) {
					options.imageInfo.frameCount = result.frameCount;
				}
				res.json(result);
			} catch (err) {
				res.json({ success: false, error: (err as Error).message });
			}
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
				// Store output path for preview
				if (result.outputPath) {
					(options as { lastOutputPath?: string }).lastOutputPath = result.outputPath;
				} else {
					(options as { lastOutputPath?: string }).lastOutputPath = undefined;
				}
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

		// API: Load new image
		app.post('/api/load', async (req, res) => {
			if (!options.onLoadImage) {
				res.json({ success: false, error: 'Load not supported' });
				return;
			}
			try {
				const result = await options.onLoadImage(req.body);
				if (result.success) {
					// Update current image info
					options.imageInfo.filePath = result.filePath!;
					options.imageInfo.fileName = result.fileName!;
					options.imageInfo.width = result.width!;
					options.imageInfo.height = result.height!;
					options.imageInfo.borderColor = result.borderColor ?? null;
				}
				res.json(result);
			} catch (err) {
				res.json({ success: false, error: (err as Error).message });
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

		// API: Save preset
		app.post('/api/save-preset', (req, res) => {
			try {
				const preset = req.body as Preset;
				if (!preset.id || !preset.name || !preset.icons?.length) {
					res.json({ success: false, error: 'Invalid preset data' });
					return;
				}
				savePreset(preset);
				res.json({ success: true });
			} catch (err) {
				res.json({ success: false, error: (err as Error).message });
			}
		});

		// API: Delete preset
		app.post('/api/delete-preset', (req, res) => {
			try {
				const { id } = req.body;
				if (!id) {
					res.json({ success: false, error: 'Missing preset ID' });
					return;
				}
				const result = deletePreset(id);
				res.json(result);
			} catch (err) {
				res.json({ success: false, error: (err as Error).message });
			}
		});

		// API: Open URL in default browser
		app.post('/api/open-url', (req, res) => {
			const { url } = req.body;
			if (!url || typeof url !== 'string') {
				res.json({ success: false, error: 'Missing URL' });
				return;
			}
			// Use PowerShell Start-Process which opens in default browser
			spawn('powershell.exe', ['-WindowStyle', 'Hidden', '-Command', `Start-Process '${url}'`], {
				detached: true,
				stdio: 'ignore',
				windowsHide: true,
			}).unref();
			res.json({ success: true });
		});

		// API: Get output file as base64 for preview
		app.get('/api/output-preview', (_req, res) => {
			const outputPath = (options as { lastOutputPath?: string }).lastOutputPath;
			if (!outputPath) {
				res.json({ success: false, error: 'No output file' });
				return;
			}
			try {
				if (!existsSync(outputPath)) {
					res.json({ success: false, error: 'Output file not found' });
					return;
				}
				const buffer = readFileSync(outputPath);
				const ext = extname(outputPath).toLowerCase();
				const mimeTypes: Record<string, string> = {
					'.png': 'image/png',
					'.jpg': 'image/jpeg',
					'.jpeg': 'image/jpeg',
					'.gif': 'image/gif',
					'.ico': 'image/x-icon',
				};
				const mimeType = mimeTypes[ext] || 'image/png';
				res.json({
					success: true,
					imageData: `data:${mimeType};base64,${buffer.toString('base64')}`,
					isGif: ext === '.gif',
				});
			} catch (err) {
				res.json({ success: false, error: (err as Error).message });
			}
		});

		// API: Open output folder in Explorer
		app.post('/api/open-folder', (_req, res) => {
			// Use output path if available, otherwise fall back to input file directory
			const outputPath = (options as { lastOutputPath?: string }).lastOutputPath;
			const filePath = outputPath || options.imageInfo.filePath;

			// Convert WSL path to Windows path for explorer
			// /mnt/c/path -> C:\path
			let winPath = filePath;
			const wslMatch = filePath.match(/^\/mnt\/([a-z])\/(.*)$/);
			if (wslMatch) {
				const drive = wslMatch[1].toUpperCase();
				const rest = wslMatch[2].replace(/\//g, '\\');
				winPath = `${drive}:\\${rest}`;
			}

			// Get directory from the file path
			const lastSep = Math.max(winPath.lastIndexOf('\\'), winPath.lastIndexOf('/'));
			const dir = lastSep > 0 ? winPath.substring(0, lastSep) : winPath;

			// Open folder and select the file if we have an output path
			const explorerCmd = outputPath
				? `explorer.exe /select,"${winPath}"`
				: `explorer.exe "${dir}"`;

			spawn('powershell.exe', ['-WindowStyle', 'Hidden', '-Command', explorerCmd], {
				detached: true,
				stdio: 'ignore',
				windowsHide: true,
			}).unref();
			res.json({ success: true });
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
