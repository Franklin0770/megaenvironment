/*
TODOS:
- Maybe some MORE asyncing (Done!);
- Fix sonicDisassemblySupport configuration switch loop when it couldn't update the assembler (Done!);
- Some classes for encapsulation and separation.
*/

// Import just what we need
import { 
	ExtensionContext, workspace, commands, debug, window, env, Uri, 
	ProgressLocation, TreeItem, TreeItemCollapsibleState, ThemeIcon, EventEmitter,
	Command, TreeDataProvider, ConfigurationChangeEvent, StatusBarAlignment, Progress
} from 'vscode';
import {
	existsSync, writeFile, rename, unlink, createWriteStream, promises
} from 'fs';
import { join, basename, extname, normalize, dirname } from 'path';
import { ChildProcess, exec, spawn } from 'child_process';
import { pipeline } from 'stream';
import AdmZip from 'adm-zip';

import PcmProcessing from './PCM Processing';

// Settings variable declaration (some of them are not here since they get read once)
interface ExtensionSettings {
	defaultCpu: string;
	superiorWarnings: boolean;
	compatibilityMode: boolean;
	caseSensitive: boolean;
	radix: number,
	relaxedMode: boolean;
	signWarning: boolean;
	jumpsWarning: boolean;
	addSyntax: Array<string>;
	removeSyntax: Array<string>;
	underscoreMacroArgs: boolean;
	passWarning: string;
	forwardReferences: number;

	mainName: string;
    constantsName: string;
    variablesName: string;
    listingFile: boolean;
    listingName: string;
	listingRadix: number;
	listUnknown: boolean;
	splitByte: string;
	errorFile: boolean;
	errorName: string;
	debugFile: string;
	crossReferencesListing: boolean;
	sectionListing: boolean;
	macroListing: boolean;
	sourceListing: boolean;
	workingFolders: Array<string>;
	cleaningExtensions: Array<string>;
	templateSelector: Array<string>;

    romName: string;
    romDate: boolean;
    prevRoms: boolean;
    prevAmount: number;
	generateChecksum: boolean;
	sonicDisassembly: boolean;
	compressionAlg: string;
	startingAddress: string;
	segmentSize: string;
	insertionMethod: string;
	wavConversion: boolean;

    backupName: string;
    backupDate: boolean;

	compactSymbols: boolean;
    fillValue: string;
    errorLevel: number;
	maximumErrors: string;
	errorNumber: boolean;
	asErrors: boolean;
	suppressWarnings: boolean;
	warningsAsErrors: boolean;
	lowercaseHex: boolean;
    quietOperation: boolean;
    verboseOperation: boolean;
	blastEmDebugger: boolean;

	singleFileOutput: string;

	checkUpdates: boolean;
	showChecksum: boolean;
}

let extensionSettings: ExtensionSettings = { // Settings variable assignments
	defaultCpu: '68000',
	superiorWarnings: false,
	compatibilityMode: false,
	caseSensitive: true,
	radix: 10,
	relaxedMode: false,
	signWarning: false,
	jumpsWarning: false,
	addSyntax: [],
	removeSyntax: [],
	underscoreMacroArgs: false,
	passWarning: '',
	forwardReferences: 1,

	mainName: '',
    constantsName: '',
    variablesName: '',
    listingFile: true,
    listingName: '',
	listingRadix: 16,
	listUnknown: false,
	splitByte: '',
	errorFile: false,
	errorName: '',
	debugFile: 'None',
	crossReferencesListing: false,
	sectionListing: false,
	macroListing: false,
	sourceListing: false,
	workingFolders: [ '.' ],
	cleaningExtensions: [ '.gen', '.pre', '.lst', '.log', '.map', '.noi', '.obj', '.mac', '.i' ],
	templateSelector: [ '68k vectors', 'ROM header', 'Jump table', 'VDP initialization', 'Controllers initialization', 'Z80 initialization', 'Constants', 'Variables' ],

    romName: '',
    romDate: true,
    prevRoms: true,
    prevAmount: 10,
	generateChecksum: true,
	sonicDisassembly: false,
	compressionAlg: 'kosinski',
	startingAddress: '0',
	segmentSize: 'Size_of_DAC_driver_guess',
	insertionMethod: 'after',
	wavConversion: true,

    backupName: '',
    backupDate: true,

	compactSymbols: true,
    fillValue: '00',
    errorLevel: 1,
	maximumErrors: '',
	errorNumber: false,
	asErrors: false,
	suppressWarnings: false,
	warningsAsErrors: false,
	lowercaseHex: false,
    quietOperation: false,
    verboseOperation: false,
	blastEmDebugger: false,

	singleFileOutput: '',

	checkUpdates: true,
	showChecksum: true
};

// Every setting name and variable to target, with a flag to indicate whether the Sonic assembler supports it or not
const settingDescriptors = [
	{ key: 'codeOptions.defaultCPU',								target: 'defaultCpu' },
	{ key: 'codeOptions.superiorModeWarnings',						target: 'superiorWarnings' },
	{ key: 'codeOptions.compatibilityMode',							target: 'compatibilityMode' },
	{ key: 'codeOptions.caseSensitiveMode',							target: 'caseSensitive' },
	{ key: 'codeOptions.radix',										target: 'radix' },
	{ key: 'codeOptions.RELAXEDMode',								target: 'relaxedMode' },
	{ key: 'codeOptions.signExtensionWarning',						target: 'signWarning' },
	{ key: 'codeOptions.absoluteJumpsWarning',						target: 'jumpsWarning' },
	{ key: 'codeOptions.addIntegerSyntax',							target: 'addSyntax' },
	{ key: 'codeOptions.removeIntegerSyntax',						target: 'removeSyntax' },
	{ key: 'codeOptions.macroArgumentsWithUnderscore',				target: 'underscoreMacroArgs' },
	{ key: 'codeOptions.additionalPassWarning',						target: 'passWarning' },
	{ key: 'codeOptions.maximumForwardReferences',					target: 'forwardReferences' },
	{ key: 'sourceCodeControl.mainFileName',   						target: 'mainName' },
	{ key: 'sourceCodeControl.constantsFileName',					target: 'constantsName' },
	{ key: 'sourceCodeControl.variablesFileName',					target: 'variablesName' },
	{ key: 'sourceCodeControl.generateCodeListing',					target: 'listingFile' },
	{ key: 'sourceCodeControl.listingFileName',						target: 'listingName' },
	{ key: 'sourceCodeControl.radixInListing',						target: 'listingRadix' },
	{ key: 'sourceCodeControl.byteSplitInListing',					target: 'splitByte' },
	{ key: 'sourceCodeControl.generateErrorListing',				target: 'errorFile' },
	{ key: 'sourceCodeControl.errorListingFileName',				target: 'errorName' },
	{ key: 'sourceCodeControl.generateDebugFile',					target: 'debugFile' },
	{ key: 'sourceCodeControl.generateSectionListing',				target: 'sectionListing' },
	{ key: 'sourceCodeControl.generateMacroListing',				target: 'macroListing' },
	{ key: 'sourceCodeControl.generateSourceListing',				target: 'sourceListing' },
	{ key: 'sourceCodeControl.currentWorkingFolders',				target: 'workingFolders' },
	{ key: 'sourceCodeControl.cleaningExtensionSelector',			target: 'cleaningExtensions' },
	{ key: 'sourceCodeControl.templateSelector',					target: 'templateSelector' },
	{ key: 'sourceCodeControl.listUnknownValues',					target: 'listUnknown' },
	{ key: 'buildControl.outputRomName',							target: 'romName' },
	{ key: 'buildControl.includeRomDate',							target: 'romDate' },
	{ key: 'buildControl.enablePreviousBuilds',						target: 'prevRoms' },
	{ key: 'buildControl.previousRomsAmount',						target: 'prevAmount' },
	{ key: 'buildControl.generateChecksum',							target: 'generateChecksum' },
	// 'buildControl.sonicDisassemblySupport' is handled differently
	{ key: 'buildControl.segmentCompression.compressionAlgorithm',	target: 'compressionAlg' },
	{ key: 'buildControl.segmentCompression.startingAddress',		target: 'startingAddress' },
	{ key: 'buildControl.segmentCompression.segmentSize',			target: 'segmentSize' },
	{ key: 'buildControl.segmentCompression.insertionMethod',		target: 'insertionMethod' },
	{ key: 'buildControl.convertWavFilesInDirectory',				target: 'wavConversion' },
	{ key: 'backupOptions.backupFileName',							target: 'backupName' },
	{ key: 'backupOptions.includeBackupDate',						target: 'backupDate' },
	{ key: 'miscellaneous.compactGlobalSymbols', 					target: 'compactSymbols' },
	{ key: 'miscellaneous.fillValue',								target: 'fillValue' },
	{ key: 'miscellaneous.errorLevel',								target: 'errorLevel' },
	{ key: 'miscellaneous.maximumErrors',							target: 'maximumErrors' },
	{ key: 'miscellaneous.displayErrorNumber',						target: 'errorNumber' },
	{ key: 'miscellaneous.AS-StyledErrors',							target: 'asErrors' },
	{ key: 'miscellaneous.suppressWarnings',						target: 'suppressWarnings' },
	{ key: 'miscellaneous.warningsAsErrors',						target: 'warningsAsErrors' },
	{ key: 'miscellaneous.lowercaseHexadecimal',					target: 'lowercaseHex' },
	{ key: 'miscellaneous.quietOperation',							target: 'quietOperation' },
	{ key: 'miscellaneous.verboseOperation',						target: 'verboseOperation' },
	{ key: 'miscellaneous.startBlastemWithDebuggers',				target: 'blastEmDebugger' },
	{ key: 'paths.outputPathWithoutWorkspace',						target: 'singleFileOutput' },
	// Rest of path variables are unlikely to get edited directly in the settings UI, so it doesn't make sense for them to stay here
	{ key: 'extensionOptions.checkForUpdates',						target: 'checkUpdates' },
	// 'extensionOptions.hideUnsupportedEmulators' is handled differently
	{ key: 'extensionOptions.showChecksumValue',					target: 'showChecksum' }
];

// Global variables that get assigned during activation
let assemblerFolder: string;
let assemblerPath: string;
let compilerPath: string;

let regenCompatible: boolean;
let gensCompatible: boolean;
let bizhawkCompatible: boolean;
let openemuCompatible: boolean;

// These get assigned in "projectCheck()"
let sourceCodeFolder: string;
let onProject: boolean;

let toolsDownloading: boolean; // Gets assigned in "downloadAssembler()"

let activeAssembler: ChildProcess | null;
let buttonProvider: ButtonProvider;

const outputChannel = window.createOutputChannel('AS');

async function downloadAssembler(fixedAssembler: boolean, force: boolean): Promise<0 | 1 | -1> {
	toolsDownloading = true;
	// A progress indicator that shows in the Status Bar at the bottom.
	// Returns 0 if successfull, 1 if there was an error but the code can continue, -1 if the code can't continue due to an error.
	// Every report there's an increment value.
	const exitCode = await window.withProgress(
		{
			location: ProgressLocation.Window,
			title: !fixedAssembler ? 'Original assembler' : "Sonic's assembler",
			cancellable: true
		},
		async (progress, token) => {
			token.onCancellationRequested(async () => {
				const selection = await window.showErrorMessage("Operation was cancelled! You can retry if you didn't mean to stop the download.", 'Re-attempt Download');
				
				if (selection === 'Re-attempt Download') {
					downloadAssembler(fixedAssembler, true);
				}

				return 0;
			});

			progress.report({ message: 'checking for updates...', increment: 0 });

			let folderName: string;
			let zipName: string;

			switch (process.platform) {
				case 'win32':
					folderName = 'Windows_x86';
					zipName = 'windows-x86.zip';
					break;
				case 'darwin':
					if (process.arch === 'arm64') {
						folderName = 'macOS_arm64';
						zipName = 'mac-arm64.zip';
					} else {
						folderName = 'macOS_x86_64';
						zipName = 'mac-x86_64.zip';
					}
					break;
				case 'linux':
					if (process.arch === 'x64') {
						folderName = 'Linux_x86_64';
						zipName = 'linux-x86_64.zip';
					} else {
						folderName = 'Linux_arm64';
						zipName = 'linux-arm64.zip';
					}
					break;
				default:
					return -1;
			}

			const type = +fixedAssembler;
			const windowsExtension = process.platform === 'win32' ? '.exe' : '';

			const folderToUpdate = join(dirname(normalize(assemblerFolder)),[ 'Original', 'Fixed' ][type]);
			const assemblerToUpdate = join(folderToUpdate, 'asl' + windowsExtension);
			const compilerToUpdate = join(folderToUpdate, 'p2bin' + windowsExtension);

			const assemblerName = [ 'the original AS assembler', "Sonic's fixed assembler" ][type];

			if (existsSync(folderToUpdate)) {
				if (!force && existsSync(join(folderToUpdate, 'version.txt'))) {
					let response: Response | undefined;

					response = await fetch('https://raw.githubusercontent.com/Franklin0770/AS-releases/main/' + [ 'Original', 'Fixed' ][type] + '/' + folderName + '/version.txt');
					
					if (!response || !response.ok || !response.body) {
						if (existsSync(assemblerToUpdate) && existsSync(compilerToUpdate)) {
							window.showWarningMessage(`Failed to get version to check for updates for ${assemblerName}. Internet connection is either missing or insufficient, we'll have to stick with the assembler we have.`);
							return 1;
						} else {
							const selection = await window.showErrorMessage(`Failed to get version to check for updates for ${assemblerName} and we can't continue since there's no previously downloaded versions. Make sure you have an Internet connection.`, 'Retry');

							if (selection === 'Retry') {
								downloadAssembler(fixedAssembler, true);
							}

							return -1;
						}
					}

					const localBuild = +await promises.readFile(join(folderToUpdate, 'version.txt'), 'ascii');
					const onlineBuild = +await response!.text();
					
					if (localBuild >= onlineBuild) { return 0; } // No need for updates

					if (!extensionSettings.quietOperation) {
						window.showInformationMessage(`Upgrading ${assemblerName} from build ${localBuild} to build ${onlineBuild}.`);
					}
				}
			} else {
				try {
					await promises.mkdir(folderToUpdate);
				} catch (error) {
					console.log(error);
				}
			}

			progress.report({ message: 'requesting version...', increment: 20 });

			let response: Response;
			
			try {
				response = await fetch('https://github.com/Franklin0770/AS-releases/releases/download/' + [ 'latest', 'latest_fixed' ][type] + '/' + zipName);
			} catch (error: any) {
				if (existsSync(assemblerToUpdate) && existsSync(compilerToUpdate)) {
					window.showWarningMessage(`Internet connection is either missing or insufficient to download ${assemblerName}, we'll have to stick with the assembler we have. ${error.message}`);
					return 1;
				}

				window.showErrorMessage(`Failed to download the latest AS compiler for ${assemblerName}. We can't proceed since there's no previously downloaded versions. Make sure you have a stable Internet connection. ${error.message}`);
				return -1;
			}

			if (!response.ok || !response.body) {
				if (response.status === 404) { // The classic "not found"
					if (existsSync(assemblerToUpdate) && existsSync(compilerToUpdate)) {
						window.showWarningMessage("Hmm, it appears the download source is missing, but we can stick with what we have. It might be because I've forgotten to upload some files, sorry! If this doesn't get corrected in a few days, please let me know!");
						return 1;
					}

					window.showErrorMessage("Unfortunately, the download source is missing, and we may not proceed since there isn't a previously downloaded version in your system. It might be because I've forgotten to upload some files, sorry! If this doesn't get corrected in a few days, please let me know!");
					return -1;
				}

				window.showErrorMessage(`Failed to download ${assemblerName}. ${response.statusText}`);

				unlink(zipName, (error) => {
					if (error) {
						window.showWarningMessage("Couldn't remove the temporary ZIP file. " + error.message);
					}
				});

				return -1;
			}

			progress.report({ message: 'downloading archive...', increment: 20 });

			if (!existsSync(folderToUpdate)) {
				await promises.mkdir(folderToUpdate, { recursive: true });
			}

			process.chdir(folderToUpdate);
			const fileStream = createWriteStream(zipName);

			const exitCode = await new Promise<boolean>((resolve) => {
				let retries = 3;
				const retry = () => {
					pipeline(response.body as ReadableStream<string>, fileStream, (error) => {
						if (!error) {
							resolve(true);
						} else {
							if (retries > 0) {
								progress.report({ message: `downloading archive... (take number ${retries})`, increment: 0 });
								retries--;
								setTimeout(retry, 1000);
							} else {
								if (existsSync(assemblerToUpdate) && existsSync(compilerToUpdate)) {
									window.showWarningMessage('Even though it turned out to be impossible to download the assembler, we still have the previous version we can use! ' + error.message);
									resolve(true);
								} else {
									window.showErrorMessage('After multiple tries, it turned out to be impossible to download the assembler. Make sure you have a fast enough Internet connection. ' + error.message);
									resolve(false);
								}
							}
						}
					});
				};

				retry(); // This is where it starts
			});

			if (!exitCode) { return -1; }

			progress.report({ message: 'extracting archive...', increment: 50 });

			let zip: AdmZip;

			try {
				zip = new AdmZip(zipName);
			} catch {
				if (existsSync(assemblerToUpdate) && existsSync(compilerToUpdate)) {
					window.showWarningMessage("Hmm, it seems the file structure is incorrect, but we can stick with what we have. This happens because I could have messed up the download, sorry! If this doesn't get corrected in a few days, please let me know!");
					return 1;
				}

				window.showErrorMessage("Unfortunately, the download source is deprecated and incorrect, and we may not proceed since there isn't a previously downloaded version in your system. This happens because I could have messed up the download, sorry! If this doesn't get corrected in a few days, please let me know!");
				return -1;
			}

			const { writeFile, chmod, readdir } = promises;
			const entries = zip.getEntries();
			// Manual extraction with file permission assignment if it's a Unix system
			for (const entry of entries) {
				const name = entry.name;
				
				try {
					await writeFile(name, entry.getData());
				} catch (error: any) {
					window.showErrorMessage(`Cannot extract the file: ${name}. ${error.message}. This happens because I messed up the file structure while uploading the pre-releases, sorry! If it doesn't get fixed in a matter of minutes, let me know.`);
				}

				if (process.platform !== 'win32') {
					try {
						await chmod(name, 0o755); // Get permissions (rwx) for Unix-based systems
					} catch (error: any) {
						window.showErrorMessage(`Cannot get read and write permissions for the file: ${name}. ${error.message}`);
					}
				}
			}

			try {
				const files = await readdir('.');

				for (const item of files) {
					if (item === zipName || !extensionSettings.sonicDisassembly && (item === 'as.msg' || item === 'cmdarg.msg' || item === 'ioerrs.msg')) {
						unlink(item, (error) => {
							if (error) {
								window.showWarningMessage(`Could not remove the temporary file located at ${join(assemblerToUpdate, item)}. ${error.message}`);
							}
						});
					}
				}
			} catch (error: any) {
				window.showWarningMessage('Cannot read the assembler folder to cleanup files. ' + error.message);
				return 1;
			}

			progress.report({ message: 'done! (This message will almost never be seen...)', increment: 10 });

			return 0;
		}
	);

	toolsDownloading = false;
	return exitCode;
}

// This function prompts a dialog to select the emulator executable if it hasn't been provided before
async function promptEmulatorPath(emulator: string): Promise<boolean> {
	const configuration =  workspace.getConfiguration('megaenvironment.paths');
	const selectedPath = configuration.get<string>(emulator, '');

	if (existsSync(selectedPath) && (await promises.stat(selectedPath)).isFile()) { return true; } // The emulator is already there, no need to ask anything

	const executableExtension = process.platform === 'win32' ? [ 'exe' ] : [ '*' ];

	const uri = await window.showOpenDialog({
		title: 'Select the executable of ' + emulator,
		canSelectFolders: false,
		canSelectFiles: true,
		canSelectMany: false,
		filters: { 'Executable files': executableExtension },
		openLabel: 'Found it'
	});

	if (!uri || uri.length === 0) { return false; }

	await configuration.update(
		emulator,
		uri[0].fsPath,
		true // true = global setting
	);

	return true;
}

// This function checks if there are the conditions to assemble the source code
// If false, it means we didn't find the source code, so we can't continue
async function assemblerChecks(temporary: boolean): Promise<boolean> {
	if (onProject) {
		if (!workspace.workspaceFolders) {
			window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
			return false;
		}

		if (!existsSync(join(sourceCodeFolder, extensionSettings.mainName))) {
			const selection = await window.showErrorMessage(`The main source code could not be located. Name it to "${extensionSettings.mainName}", or change it through the settings.`, 'Change Setting');
			
			if (selection === 'Change Setting') {
				commands.executeCommand(
					'workbench.action.openSettings',
					'megaenvironment.sourceCodeControl.mainFileName'
				);
			}

			return false;
		}
	} else {
		const editor = window.activeTextEditor;

		if (!editor) {
			window.showErrorMessage('In order to assemble, you have to open and select your source code file.');
			return false;
		}

		const fileName = window.activeTextEditor!.document.fileName;

		// When the document it's an actual file and when the document is effectively unsaved
		// (when we focus to another editor "editor.document.isUntitled" doesn't work later on)
		if (editor.document.uri.scheme !== 'file' && !fileName.startsWith('Untitled')) { // Focus might shift onto the wrong text editor (such as the terminal)
			window.showWarningMessage('Please, change focus on your code by clicking into it, then retry. If this message still pops up, start with a fresh new file instead.');
			return false;
		}

		if (editor.document.isUntitled) { // If we didn't save the code document yet
			await promises.writeFile(join(assemblerFolder, fileName + '.asm'), Buffer.from(editor.document.getText(), 'utf8')); // AS assumes the extension is '.asm' when providing a blank extension file name
			sourceCodeFolder = assemblerFolder;
		} else {
			sourceCodeFolder = dirname(fileName);
		}

		if (temporary) { return true; } // We are only requesting to save the file since we have to run an emulator

		const configuration = workspace.getConfiguration('megaenvironment.paths');
		const outputPath = extensionSettings.singleFileOutput;

		if (existsSync(outputPath) && (await promises.stat(outputPath)).isDirectory()) { return true; } // We already know where to put the assembled files

		const uri = await window.showOpenDialog({
			title: 'Select the output folder to put your ROMs',
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
			openLabel: 'This one'
		});

		if (!uri || uri.length === 0) { return false; }

		const selectedPath = uri[0].fsPath;

		if ((await promises.readdir(selectedPath)).length > 0) {
			const selection = await window.showWarningMessage('This directory is not empty, which means the selected files for cleaning can be accidentally wiped forever!', 'I take this risk!', 'Never mind');

			if (selection !== 'I take this risk!') { return false; }
		}

		await configuration.update(
			'outputPathWithoutWorkspace',
			selectedPath,
			true // true = global setting
		);
	}

	return true;
}

// Assembles and compiles a ROM
// 0 if successful, 1 if successful with warnings and -1 if there's an error or a fatal one
// If the number is negative we shall not proceed (this case only -1)
async function executeAssemblyCommand(progress: Progress<{ message: string; increment: number }>): Promise<0 | 1 | -1> {
	if (activeAssembler) {
		outputChannel.show();
		window.showErrorMessage("Slow down, please! You're already assembling something.");
		return -1;
	}

	// We proceed with the assembler, which creates the program file
	outputChannel.clear();
	const settings = extensionSettings;
	const sonicDisassembly = settings.sonicDisassembly;

	if (sonicDisassembly && settings.wavConversion && onProject) {
		await PcmProcessing.generateAudioFiles(progress);
	}

	progress.report({ increment: !sonicDisassembly ? 15 : 0, message: 'Assembling...' }); // 0, 30

	const sourceCode = onProject ? settings.mainName : basename(window.activeTextEditor!.document.fileName);

	let warnings = false;

	const aslArgs: string[] = [
		join(sourceCodeFolder, sourceCode),
		...['-o', join(assemblerFolder, 'code.p')],
		...(settings.compactSymbols ? ['-A'] : []),
		...(settings.listingFile ? ['-L'] : []),
		...(settings.caseSensitive ? ['-U'] : []),
		...(settings.errorLevel ? ['-x'.repeat(settings.errorLevel)] : []),
		...(settings.errorNumber ? ['-n'] : []),
		...(settings.lowercaseHex ? ['-h'] : []),
		...(settings.suppressWarnings ? ['-w'] : []),
		...(settings.passWarning ? ['-r', settings.passWarning] : []),
		...(settings.crossReferencesListing ? ['-C'] : []),
		...(settings.sectionListing ? ['-s'] : []),
		...(settings.macroListing ? ['-M'] : []),
		...(settings.sourceListing ? ['-P'] : []),
		...(settings.warningsAsErrors ? ['-Werror'] : []),
		...(!settings.asErrors ? ['-gnuerrors'] : []),
		...(!settings.superiorWarnings ? ['-supmode'] : []),
		...(settings.compatibilityMode ? ['-compmode'] : []),
		...(settings.relaxedMode ? ['-relaxed'] : []),
		...(!settings.signWarning && !sonicDisassembly ? ['-wno-implicit-sign-extension'] : []),
		...(settings.jumpsWarning && !sonicDisassembly ? ['-wrelative'] : []),
		...(settings.listUnknown && !sonicDisassembly ? ['-list-unknown-values'] : []),
		...(settings.forwardReferences !== 1 && !sonicDisassembly ? ['-maxsympass', settings.forwardReferences.toString()] : []),
		...(settings.underscoreMacroArgs && !sonicDisassembly ? ['-underscore-macroargs'] : []),
		...(settings.debugFile !== 'None' && onProject ? ['-g', settings.debugFile] : []),
		...(settings.defaultCpu ? ['-cpu', settings.defaultCpu] : []),
		...(settings.radix !== 10 ? ['-RADIX', settings.radix.toString()] : []),
		...(settings.listingRadix !== 16 ? ['-LISTRADIX', settings.listingRadix.toString()] : []),
		...(settings.splitByte ? ['-SPLITBYTE', settings.splitByte] : []),
		...(settings.maximumErrors ? ['-maxerrors', settings.maximumErrors] : []),
		...(settings.sonicDisassembly ? ['-c', '-shareout', join(assemblerFolder, 'code.h')] : [])
	];

	// We must output the listing file in the right spot when we have a standalone file,
	// because AS automatically puts the listing file to where the source code is located (and not in relation to CWD)
	if (!onProject && settings.listingFile) {
		aslArgs.push(
			'-OLIST',
			join(settings.singleFileOutput,
			(settings.listingName ? settings.listingName : 'Code') + '.lst')
		);
	} else if (settings.listingName) {
		aslArgs.push('-OLIST', settings.listingName, '.lst');
	}

	if (settings.errorFile) {
		if (settings.errorName !== '') {
			const errorPath = onProject
				? settings.errorName + '.log'
				: join(settings.singleFileOutput, settings.errorName + '.log');
			aslArgs.push('-E', errorPath);
		} else {
			aslArgs.push('-E');
			if (!onProject) {
				aslArgs.push(join(settings.singleFileOutput, settings.errorName + '.log'));
			}
		}
	}

	if (!sonicDisassembly && (settings.addSyntax.length || settings.removeSyntax.length)) { // If we filled at least one setting
		const parts: string[] = [];
		const addSyntax = settings.addSyntax;
		const removeSyntax = settings.removeSyntax;

		if (addSyntax.length) {
			parts.push('+' + addSyntax.join(',+')); // Add syntax with + so AS knows what to do
		}

		if (removeSyntax.length) {
			parts.push('-' + removeSyntax.join(',-'));
		}

		aslArgs.push('-INTSYNTAX', parts.join(','));
	}

	if (settings.workingFolders.length > 0 && onProject) {
		aslArgs.push('-i', settings.workingFolders.join(';'));
	} else if (sonicDisassembly && !onProject) {
		window.showWarningMessage('You have cleared the assets folders in the settings! Brace yourself for "include" errors.');
	}

	if (toolsDownloading) {
		new Promise<void>((resolve) => {
			const check = () => {
				if (toolsDownloading) {
					setTimeout(check, 200);
				} else {
					resolve();
				}
			};
			
			check();
		});
	}

	// AS exit code convention: 0 if successful, 1 if crash, 2 if error, 3 if fatal error
	// My exit code convention: -1 if cancelled

	let aslErr = '';

	const { aslCode } = await new Promise<{ aslCode: number }>((resolve) => {
		activeAssembler = spawn(assemblerPath, aslArgs, { cwd: sourceCodeFolder });

		activeAssembler.stdout!.on('data', (data) => {
			outputChannel.append(data.toString());
		});

		activeAssembler.stderr!.on('data', (data) => {
			aslErr += data.toString();
		});
		
		activeAssembler.on('close', (code, signal) => {
			if (signal !== 'SIGQUIT') {
				resolve({ aslCode: code ?? 0 });
			} else {
				resolve({ aslCode: -1 });
			}

			activeAssembler = null;
		});

		activeAssembler.on('error', (error: any) => {
			outputChannel.appendLine(error.message);
			activeAssembler = null;
			resolve({ aslCode: 4 });
		});
	});

	switch (aslCode) {
		case 0:
			if (settings.verboseOperation) {
				outputChannel.show();
			}

			if (aslErr && !settings.suppressWarnings) {
				outputChannel.appendLine('\n==================== ASSEMBLER WARNINGS ====================\n');
				outputChannel.appendLine(aslErr);
				outputChannel.appendLine('============================================================');
				warnings = true;
			}
			break;

		default:
			let errorLocation = 'log file';

			if (!settings.errorFile) {
				outputChannel.appendLine('\n==================== ASSEMBLER ERRORS ====================\n');
				outputChannel.append(aslErr);
				outputChannel.show();
				errorLocation = 'terminal';
			}

			switch (aslCode) {
				case 2:
					window.showErrorMessage(`Build failed. An error was thrown by the assembler. Check the ${errorLocation} for more details.`);
					return -1;

				case 3:
					window.showErrorMessage(`Build failed. A fatal error was thrown by the assembler. Check the ${errorLocation} for more details.`);
					return -1;

				case 4:
					window.showErrorMessage('Looks like the assembler got incorrectly set up by the extension! As a temporal fix, try to reset some settings. I apologize for the inconvenience and please, report this mistake as soon as possible!');
					return -1;

				case 255:
					window.showErrorMessage("Looks like some files are missing because I messed up the structure, sorry! If this doesn't get fixed in a few days, please let me know!");
					return -1;
					
				default:
					window.showErrorMessage(`The assembler has thrown an unknown error. You can check the ${errorLocation} for further information. If you believe this doesn't depend on you, please let me know!`);
					return -1;
			}

		case -1:
			return -1;

		case 1:
			window.showErrorMessage('The assembler crashed! If you terminated the process manually, please use the cancelling function if the execution gets stuck.');
			return -1;
	}

	progress.report({ increment: !sonicDisassembly ? 50 : 40, message: 'Compiling...' }); // 10, 30

	// Now, to the compiler!

	if (activeAssembler) {
		outputChannel.show();
		window.showErrorMessage("One more second! I'm still compiling.");
		return -1;
	}

	process.chdir(assemblerFolder);

	const p2binArgs = !sonicDisassembly 
		? [ 'code.p', 'rom.bin', '-l', `0x${settings.fillValue}`, '-k' ]
		: [
			`-p=${settings.fillValue}`,
			`-z=${settings.startingAddress},${settings.compressionAlg},${settings.segmentSize},${settings.insertionMethod}`,
			'code.p',
			'rom.bin',
			'code.h'
		];

	let p2binErr = '';
	
	const { p2binCode } = await new Promise<{ p2binCode: number }>((resolve) => {
		if (activeAssembler) {
			resolve({ p2binCode: -2 });
			return;
		}

		activeAssembler = spawn(compilerPath, p2binArgs);

		if (!sonicDisassembly) {
			activeAssembler.stdout!.on('data', (data) => {
				outputChannel.append('\n' + data.toString());
			});
		}

		activeAssembler.stderr!.on('data', (data) => {
			p2binErr += data.toString();
		});
		
		activeAssembler.on('close', (code, signal) => {
			if (signal !== 'SIGQUIT') {
				resolve({ p2binCode: code ?? 0 });
			} else {
				resolve({ p2binCode: -1 });
			}

			activeAssembler = null;
		});

		activeAssembler.on('error', (error: any) => {
			outputChannel.appendLine(error.message);
			activeAssembler = null;
			resolve({ p2binCode: 1 });
		});
	});

	if (sonicDisassembly) {
		await promises.unlink('code.p');
		await promises.unlink('code.h');
	}

	switch (p2binCode) {
		case 0:
			if (p2binErr && settings.suppressWarnings) {
				outputChannel.appendLine('\n==================== COMPILER WARNINGS ====================\n');
				outputChannel.appendLine(p2binErr);
				outputChannel.appendLine('===========================================================');
				warnings = true;
			}
			break;

		default:
			outputChannel.appendLine('\n==================== COMPILER ERRORS ====================\n');
			outputChannel.append(p2binErr);

			window.showErrorMessage("The compiler has thrown an unknown error. Check the terminal for more details. If you believe this doesn't depend on you, please let me know!");

			return -1; // There's more than 1 error anyway

		case -1:
			return -1;
	}

	// Let's generate the checksum!

	progress.report({ increment: !sonicDisassembly ? 30 : 20, message: 'Generating checksum...' }); // 60, 70

	if (settings.generateChecksum) {
		try {
			const fileHandler = await promises.open('rom.bin', 'r+');

			const size = (await fileHandler.stat()).size - 0x200; // Need to subtract the skipped values

			// If the file isn't big enough to support the checksum feature
			if (size <= 0) {
				outputChannel.append('\nChecksum not calculated due to ROM being too small to include headers.');
				await fileHandler.close();
				return (+warnings) as 0 | 1;
			}

			const readBuffer = Buffer.alloc(size);
			await fileHandler.read(readBuffer, 0, size, 0x200); // Offset: 0, position: 0x200

			const sum = new Uint16Array(1); // The only elegant way to create an unsigned 16-bit variable

			// Even though we are adding 2 to the index due to words being read,
			// the file size is always even (due to the 68k architecture), so no worries about misalignment
			for (let i = 0; i < size - 1; i += 2) {
				sum[0] += readBuffer.readUInt16BE(i);
			}

			const writeBuffer = Buffer.alloc(2);
			writeBuffer.writeUint16BE(sum[0], 0);

			await fileHandler.write(writeBuffer, 0, 2, 0x18E); // Patch by writing the value to the ROM
			await fileHandler.close();

			if (settings.showChecksum) {
				outputChannel.append('\nChecksum value: 0x' + sum[0].toString(16).toUpperCase());
			}
		} catch (error: any) {
			window.showErrorMessage('Cannot patch your ROM with its checksum. ' + error.message);
			if (settings.showChecksum) {
				outputChannel.append('\nChecksum not generated due to unexpected error.');
			}

			return 1;
		}
	}

	return (+warnings) as 0 | 1; // Reuse "warnings" if there were prior warnings. 0 if false, 1 if true
}

async function assembleRom(progress: Progress<{ message: string; increment?: number }>) {
	progress.report({ message: 'Checking folders...' });

	if (!await assemblerChecks(false)) { return; }

	const sonicDisassembly = extensionSettings.sonicDisassembly;

	progress.report({ increment: !sonicDisassembly ? 10 : 0, message: 'Assembling...' }); // 0, 30

	let warnings = false;

	const result = await executeAssemblyCommand(progress);

	if (result === 1) {
		warnings = true;
	} else if (result !== 0) {
		return; // If it couldn't compile a ROM we'd better get out of here
	}
	
	progress.report({ message: 'Versioning...', increment: 10 });

	// If we are in a workspace (project) the output folder is the same as the source code one, else we have to take the user's custom one
	const outputPath = onProject ? sourceCodeFolder : extensionSettings.singleFileOutput;

	process.chdir(outputPath);

	const { unlink, rename } = promises;

	// This versioning logic makes sure no files get overwritten and instead get marked as previous versions

	// First case: no ROMs.
	// Starts off with outputting a .gen file name if it didn't find one that already exists.

	// Second case: one latest ROM (.gen file).
	// If we find an already existing .gen ROM then we change its extension to .pre0 and generate the new ROM name with .gen extension.

	// Third case: multiple previous ROMs and the latest one (.preX files and one .gen file)
	// When we find multiple .preX files along with a .gen file, then the .gen file gets renamed to the maximum .preX number + 1.

	// Fourth case: previous ROMs limit hits.
	// Whether we hit the .preX amount limit, we restart from the oldest previous file (the minimum number) and then we start replacing
	// the rest of the previous ROMs if we continue to build new ROMs.

	try {
		// We can save some performance by using VS Code's indexed search if we are in a workspace
		const items = onProject ? (await workspace.findFiles('*.{gen,pre*}')).map(uri => uri.fsPath) : await promises.readdir(extensionSettings.singleFileOutput);

		// Precompute .pre<number> files once
		const preFiles = items
			.filter(f => /\.pre\d+$/.test(f))
			.map(f => ({
				name: f,
				index: parseInt(f.match(/\.pre(\d+)$/)![1])
			}));

		for (const checkName of items) {
			if (!checkName.endsWith('.gen')) { continue; } // Skip files that don't end with .gen

			if (!extensionSettings.prevRoms) { // If versioning is disabled, simply delete the latest .gen
				try {
					await unlink(checkName);
				} catch (error: any) {
					window.showErrorMessage('Cannot remove the previous .gen ROM. ' + error.message);
				}
				break; // Only handle the first .gen file
			}

			let number = 0; // Determine the new index for .preX

			if (preFiles.length > 0) { // Skip this logic if there's only a .gen file
				const latest = Math.max(...preFiles.map(f => f.index));
				const oldest = preFiles.reduce((min, curr) => curr.index < min.index ? curr : min);
				// If we haven't hit the limit yet or if we know we have to output an infinite amount of ROMs
				if (latest < extensionSettings.prevAmount - 1 || extensionSettings.prevAmount === 0) {
					number = latest + 1; // We progress the .preX count
				} else {
					if (!extensionSettings.quietOperation) {
						window.showInformationMessage(`Limit of previous ROMs reached. Replacing the oldest version "${basename(oldest.name)}".`);
					}
					try {
						await unlink(oldest.name);
					} catch (error: any) {
						window.showErrorMessage('Unable to remove the oldest previous ROM. ' + error.message);
					}
					number = oldest.index; // Reuse the index (we start to replace each ROM from the oldest one again)
				}
			}

			const newName = checkName.substring(0, checkName.length - 4) + `.pre${number}`; // Replace the .gen extension to .preX
			try {
				await rename(checkName, newName); // Rename files to apply versioning
				if (!extensionSettings.quietOperation) {
					window.showInformationMessage(`Latest build exists. Renamed to "${basename(newName)}".`);
				}
			} catch (error: any) {
				window.showWarningMessage(`Could not rename the previous ROM. Please, manually rename it to "${newName}". ${error.message}`);
			}

			break; // Stop after handling the first .gen file
		}
	} catch (error: any) {
		window.showErrorMessage('Cannot read your project folder to check for previous ROMs. ' + error.message);
		return;
	}

	await renameRom(outputPath, warnings, progress);
}

// After versioning, we can rename the lastest ROM from "rom.bin" to whatever we need
async function renameRom(outputPath: string, warnings: boolean, progress: Progress<{ message?: string; increment?: number; }>) {
	const currentDate = new Date();
	const hours = currentDate.getHours().toString().padStart(2, '0');
	const minutes = currentDate.getMinutes().toString().padStart(2, '0');
	const seconds = currentDate.getSeconds().toString().padStart(2, '0');

	let fileName: string;

	if (extensionSettings.romName) { // If the user has set a custom name, we use it
		fileName = extensionSettings.romName;
	} else if (onProject) { // If not, strip the extension from path if we're in a project
		const lastDot = extensionSettings.mainName.lastIndexOf('.');
		fileName = lastDot !== -1 ? extensionSettings.mainName.substring(0, lastDot) : extensionSettings.mainName;
	} else { // If we aren't in a project, use the file name of the document
		const name = basename(window.activeTextEditor!.document.fileName);
		const lastDot = name.lastIndexOf('.');
		fileName = lastDot !== -1 ? name.substring(0, lastDot) : name;
	}

	if (extensionSettings.romDate) {
		fileName += `_${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}_${hours}.${minutes}.${seconds}`;
	}

	// Renames and moves the "rom.bin" file outside "assemblerFolder"
	rename(join(assemblerFolder, 'rom.bin'), `${join(outputPath, fileName)}.gen`, (error) => {
		if (error) {
			if (error.code !== 'ENOENT') {
				window.showWarningMessage(`Could not rename your ROM, try to take it from "${assemblerFolder}" if it exists. ${error.message}`);
			} else {
				window.showErrorMessage('Cannot rename your ROM, there might be a problem with the compiler. ' + error.message);
			}
		}
	});

	progress.report({ increment: 10 }); // 90, 90

	// Detach this code block execution from the rest so the progress indicator doesn't hang until the messages disappear
	void (async () => {
		let selection: 'Show Terminal' | 'Open Folder' | undefined;

		if (!warnings) {
			if (extensionSettings.quietOperation) { return; }
			selection = onProject
				? await window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}. (Hurray!)`)
				: await window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}. (Hurray!)`, 'Open Folder');
		} else {
			selection = onProject
				? await window.showWarningMessage(`Build succeded with warnings at ${hours}:${minutes}:${seconds}.`, 'Show Terminal')
				: await window.showWarningMessage(`Build succeded with warnings at ${hours}:${minutes}:${seconds}.`, 'Show Terminal', 'Open Folder');
		}

		switch (selection) {
			case 'Show Terminal':
				outputChannel.show();
				return;

			case 'Open Folder':
				await commands.executeCommand('revealFileInOS', Uri.file(extensionSettings.singleFileOutput));
				return;

			default: // Undefined
				return;
		}
	});
}

// Only works with workspaces, because it searches the project folder for ROMs to run with an emulator
async function findAndRunROM(emulator: string) {
	if (!workspace.workspaceFolders) {
		window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
		return;
	}

	if (!await promptEmulatorPath(emulator)) { return; }
	
	const rom = await workspace.findFiles('*.gen', undefined, 1);

	if (rom.length === 0) {
		window.showErrorMessage('There are no ROMs to run. Build something first!');
		return;
	}

	let errorCode = false;

	const configuration = workspace.getConfiguration('megaenvironment');

	const debuggerFlag = extensionSettings.blastEmDebugger && emulator === 'BlastEm' ? ' -d' : '';

	exec(`"${configuration.get<string>('paths.' + emulator)}" "${rom[0].fsPath}"` + debuggerFlag, (error) => {
		if (error) {
			window.showErrorMessage('Cannot run the latest build. ' + error.message);
			errorCode = true;
			return;
		}
	});

	if (errorCode || extensionSettings.quietOperation) { return; }

	window.showInformationMessage(`Running "${basename(rom[0].fsPath)}" with ${emulator}.`);
}

// From QuickRun commands. It doesn't rename the ROM outside the assembler folder, then it gets deleted automatically after execution
async function runTemporaryRom(emulator: string, progress: Progress<{ message?: string; increment?: number; }>) {
	progress.report({ message: 'Checking folders...' });

	if (!await assemblerChecks(true) || !await promptEmulatorPath(emulator)) { return; }

	let warnings = false;

	const result = await executeAssemblyCommand(progress);

	progress.report({ increment: 10 }); // 90, 90

	if (result === 1) {
		warnings = true;
	} else if (result !== 0) {
		return;
	}

	const configuration = workspace.getConfiguration('megaenvironment');

	const debuggerFlag = extensionSettings.blastEmDebugger && emulator === 'BlastEm' ? ' -d' : '';

	exec(`"${configuration.get<string>('paths.' + emulator)}" "${join(assemblerFolder, 'rom.bin')}"` + debuggerFlag, (error) => {
		if (error) {
			window.showErrorMessage('Cannot run the build. ' + error.message);
		}

		unlink(join(assemblerFolder, 'rom.bin'), (error) => {
			if (error && error.code !== 'ENOENT') {
				window.showErrorMessage('Could not delete the temporary ROM for cleanup. You may want to do this by yourself. ' + error.message);
				return;
			}
		});
	});
	
	const currentDate = new Date();
	if (!warnings) {
		if (extensionSettings.quietOperation) { return; }
		window.showInformationMessage(`Build succeded at ${currentDate.getHours().toString().padStart(2, '0')}:${currentDate.getMinutes().toString().padStart(2, '0')}:${currentDate.getSeconds().toString().padStart(2, '0')}, running it with ${emulator}. (Oh yes!)`);
	} else {
		const selection = await window.showWarningMessage(`Build succeded with warnings at ${currentDate.getHours().toString().padStart(2, '0')}:${currentDate.getMinutes().toString().padStart(2, '0')}:${currentDate.getSeconds().toString().padStart(2, '0')}, running it with ${emulator}.`, 'Show Terminal');

		if (selection === 'Show Terminal') {
			outputChannel.show();
		}
	}
}

function runTemporaryROMWithProgress(emulator: string) {
	return window.withProgress(
		{
			location: ProgressLocation.Window,
			cancellable: true
		},
		async (progress, token) => {
			token.onCancellationRequested(() => {
				activeAssembler!.kill('SIGQUIT');				
				activeAssembler = null;
			});

			await runTemporaryRom(emulator, progress);
		}
	);
}

// Cleans the project folder or the output folder when in standalone mode by matching the extensions
async function cleanProjectFolder() {
	let items: string[];

	if (onProject) {
		const patterns = extensionSettings.cleaningExtensions.map(ext => ext !== '.pre' ? `*${ext}` : '*.pre*');
		items = (await workspace.findFiles(`{${patterns.join(',')}}`)).map(uri => uri.fsPath);
	} else {
		const outputPath = extensionSettings.singleFileOutput;
		items = (await promises.readdir(outputPath, { withFileTypes: true }))
			.filter(e => e.isFile())
			.map(e => join(outputPath, e.name));
	}
	
	const failedItems: string[] = [];

	for (const item of items) {
		unlink(item, (error) => {
			if (error) {
				failedItems.push(basename(item));
			}
		});
	}

	if (failedItems.length > 0) {
		window.showErrorMessage("Cleanup wasn't completed because the following files couldn't be deleted: " + failedItems.join(', '));
		return;
	}

	if (extensionSettings.quietOperation) { return; }

	switch (items.length) {
		default:
			window.showInformationMessage(`Cleanup completed. ${items.length} items were removed.`);
			return;
		case 0:
			window.showInformationMessage('No items to wipe this time.');
			return;
		case 1:
			window.showInformationMessage('Cleanup completed. 1 item was removed.');
			return;
	}
}

// This method is called when the extension is activated
// This extension gets activated when it detects a project or when the user is using a contributed language
export async function activate(context: ExtensionContext) {
	if (!projectCheck()) { return; }

	const sonicDisassembly = workspace.getConfiguration('megaenvironment.buildControl').get('sonicDisassemblySupport', false);

	assemblerFolder = join(context.globalStorageUri.fsPath, !sonicDisassembly ? 'Original' : 'Fixed');
	assemblerPath = join(assemblerFolder, 'asl');
	compilerPath = join(assemblerFolder, 'p2bin');

	switch (process.platform) {
		case 'win32':
			assemblerPath += '.exe';
			compilerPath += '.exe';
			commands.executeCommand('setContext', 'megaenvironment.Regen.compatiblePlatform', true);
			regenCompatible = true;
			commands.executeCommand('setContext', 'megaenvironment.Gens.compatiblePlatform', true);
			gensCompatible = true;
			commands.executeCommand('setContext', 'megaenvironment.BizHawk.compatiblePlatform', true);
			bizhawkCompatible = true;
			commands.executeCommand('setContext', 'megaenvironment.OpenEmu.compatiblePlatform', false);
			openemuCompatible = false;
			commands.executeCommand('setContext', 'megaenvironment.EASy68k.compatiblePlatform', true);
			break;
		case 'darwin':
			commands.executeCommand('setContext', 'megaenvironment.Regen.compatiblePlatform', false);
			regenCompatible = false;
			commands.executeCommand('setContext', 'megaenvironment.Gens.compatiblePlatform', false);
			gensCompatible = false;
			commands.executeCommand('setContext', 'megaenvironment.BizHawk.compatiblePlatform', false);
			bizhawkCompatible = false;
			commands.executeCommand('setContext', 'megaenvironment.OpenEmu.compatiblePlatform', true);
			openemuCompatible = true;
			commands.executeCommand('setContext', 'megaenvironment.EASy68k.compatiblePlatform', false);
			break;
		case 'linux':
			commands.executeCommand('setContext', 'megaenvironment.Regen.compatiblePlatform', true);
			regenCompatible = true;
			commands.executeCommand('setContext', 'megaenvironment.Gens.compatiblePlatform', true);
			gensCompatible = true;
			commands.executeCommand('setContext', 'megaenvironment.BizHawk.compatiblePlatform', false);
			bizhawkCompatible = false;
			commands.executeCommand('setContext', 'megaenvironment.OpenEmu.compatiblePlatform', false);
			openemuCompatible = false;
			commands.executeCommand('setContext', 'megaenvironment.EASy68k.compatiblePlatform', false);
			break;
		default:
			window.showErrorMessage("Hey, what platform is this? Please, let me know which operative system you're running VS Code on!");
			return;
	}

	const configuration = workspace.getConfiguration('megaenvironment');
	
	for (const setting of settingDescriptors) {
		(extensionSettings as any)[setting.target] = configuration.get(setting.key);
	}

	extensionSettings.sonicDisassembly = configuration.get<boolean>('buildControl.sonicDisassemblySupport', false);

	buttonProvider = new ButtonProvider();

	const treeView = window.registerTreeDataProvider('run_emulator', buttonProvider);

	const redownloadTools = commands.registerCommand('megaenvironment.redownload_tools', async () => {
		if (toolsDownloading) {
			window.showInformationMessage('Please, be patient! Your tools are already downloading.');
			return;
		}
		
		if (await downloadAssembler(extensionSettings.sonicDisassembly, true) !== 0 || extensionSettings.quietOperation) { return; }

		window.showInformationMessage('Build tools successfully re-downloaded.');
	});

	// A small button located at the bottom of the screen to force download the assembler
	const runButton = window.createStatusBarItem(StatusBarAlignment.Left, 49); // As close as possible to the problems counter
	runButton.name = 'Force Assembler Download';
	runButton.text = '$(cloud-download)';
	runButton.tooltip = 'Re-download the Assembler';
	runButton.command = 'megaenvironment.redownload_tools';
	runButton.show();

	const result1 = await downloadAssembler(false, false);
	const result2 = await downloadAssembler(true, false);

	if (extensionSettings.checkUpdates && result1 === -1 && result2 === -1) { return; }

	//
	//	Main commands
	//

	const assemble = commands.registerCommand('megaenvironment.assemble', () => {
		console.log('started');
		return window.withProgress(
			{
				location: ProgressLocation.Window,
				cancellable: true
			},
			async (progress, token) => {
				token.onCancellationRequested(() => {
					activeAssembler!.kill('SIGQUIT');
					activeAssembler = null;
				});

				await assembleRom(progress);
				console.log('done');
			}
		);
	});

	const clean_and_assemble = commands.registerCommand('megaenvironment.clean_assemble', () => {
		return window.withProgress(
			{
				location: ProgressLocation.Window,
				cancellable: true
			},
			async (progress, token) => {
				token.onCancellationRequested(() => {
					activeAssembler!.kill('SIGQUIT');					
					activeAssembler = null;
				});
				
				progress.report({ message: 'Cleaning folder...' });

				await cleanProjectFolder();

				let warnings = false;

				const result = await executeAssemblyCommand(progress);

				if (result === 1) {
					warnings = true;
				} else if (result !== 0) {
					return;
				}

				await renameRom(sourceCodeFolder, warnings, progress);
			}
		);
	});

	const run_BlastEm = commands.registerCommand('megaenvironment.run_blastem', () => findAndRunROM('BlastEm'));

	const run_Regen = commands.registerCommand('megaenvironment.run_regen', () => findAndRunROM('Regen'));

	const run_Gens = commands.registerCommand('megaenvironment.run_gens', () => findAndRunROM('Gens'));

	const run_BizHawk = commands.registerCommand('megaenvironment.run_bizhawk', () => findAndRunROM('BizHawk'));

	const run_Fusion = commands.registerCommand('megaenvironment.run_fusion', () => findAndRunROM('Fusion'));

	const run_ClownMdEmu = commands.registerCommand('megaenvironment.run_clownmdemu', async () => {
		const platform = process.platform;
		if (platform !== 'win32' && platform !== 'linux') {
			const selection = await window.showErrorMessage('This command is not supported in your platform... but hold your horses! ClownMDEmu could be available for your platform if you use your web browser.', 'Visit Site');
			
			if (selection === 'Visit Site') {
				env.openExternal(Uri.parse('http://clownmdemu.clownacy.com/'));
			}

			return;
		}

		findAndRunROM('ClownMDEmu');
	});

	const run_OpenEmu = commands.registerCommand('megaenvironment.run_openemu', async () => {
		if (!workspace.workspaceFolders) {
			window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
			return;
		}

		if (!existsSync('/Applications/OpenEmu.app')) {
			window.showErrorMessage("Looks like you haven't installed OpenEmu yet. Make sure it's located in the \"\\Applications\" folder when installed, or else it won't run properly.");
			return;
		}

		const rom = await workspace.findFiles('*.gen', undefined, 1);

		if (rom.length === 0) {
			window.showErrorMessage('There are no ROMs to run. Build something first.');
			return;
		}

		exec(`open -a OpenEmu -W "${rom[0].fsPath}"`, (error) => {
			if (error) {
				window.showErrorMessage('Cannot run the latest build. ' + error.message);
			}
		});

		if (extensionSettings.quietOperation) { return; }

		window.showInformationMessage(`Running "${basename(rom[0].fsPath)}" with OpenEmu.`);
	});

	const assemble_and_run_BlastEm = commands.registerCommand('megaenvironment.assemble_run_blastem', () => runTemporaryROMWithProgress('BlastEm'));

	const assemble_and_run_Regen = commands.registerCommand('megaenvironment.assemble_run_regen', () => runTemporaryROMWithProgress('Regen'));

	const assemble_and_run_Gens = commands.registerCommand('megaenvironment.assemble_run_gens', () => runTemporaryROMWithProgress('Gens'));

	const assemble_and_run_BizHawk = commands.registerCommand('megaenvironment.assemble_run_bizhawk', () => runTemporaryROMWithProgress('BizHawk'));

	const assemble_and_run_Fusion = commands.registerCommand('megaenvironment.assemble_run_fusion', () => runTemporaryROMWithProgress('Fusion'));

	const assemble_and_run_ClownMDEmu = commands.registerCommand('megaenvironment.assemble_run_clownmdemu', async () => {
		const platform = process.platform;
		if (platform !== 'win32' && platform !== 'linux') {
			const selection = await window.showErrorMessage('This command is not supported in your platform... but hold your horses! ClownMDEmu could be available for your platform if you use your web browser.', 'Visit Site');

			if (selection === 'Visit Site') {
				env.openExternal(Uri.parse('http://clownmdemu.clownacy.com/'));
			}

			return;
		}

		return window.withProgress(
			{
				location: ProgressLocation.Window,
				cancellable: true
			},
			async (progress, token) => {
				token.onCancellationRequested(() => {
					activeAssembler!.kill('SIGQUIT');					
					activeAssembler = null;
				});

				await runTemporaryRom('ClownMDEmu', progress);
			}
		);
	});

	const assemble_and_run_OpenEmu = commands.registerCommand('megaenvironment.assemble_run_openemu', () => {
		return window.withProgress(
			{
				location: ProgressLocation.Window,
				cancellable: true
			},
			async (progress, token) => {
				token.onCancellationRequested(() => {
					activeAssembler!.kill('SIGQUIT');
					activeAssembler = null;
				});

				progress.report({ message: 'Checking folders...' });

				if (!existsSync('/Applications/OpenEmu.app')) {
					window.showErrorMessage("Looks like you haven't installed OpenEmu yet. Make sure it's located in the \"\\Applications\" folder when installed, or else it won't run properly.");
					return;
				}

				if (!await assemblerChecks(true)) { return; }

				let warnings = false;

				const result = await executeAssemblyCommand(progress);

				progress.report({ increment: 100 }); // 0, 30

				if (result === 1) {
					warnings = true;
				} else if (result !== 0) {
					return;
				}

				const currentDate = new Date();
				const hours = currentDate.getHours().toString().padStart(2, '0');
				const minutes = currentDate.getMinutes().toString().padStart(2, '0');
				const seconds = currentDate.getSeconds().toString().padStart(2, '0');
				const romPath = join(assemblerFolder, `Temporary ROM at ${hours}:${minutes}:${seconds}.bin`);

				try {
					await promises.rename(join(assemblerFolder, 'rom.bin'), romPath);
				} catch (error: any) {
					window.showErrorMessage('Cannot rename the ROM for OpenEmu. ' + error.message);
					return;
				}

				// "-W" switch is a macOS exclusive to wait for the app before exiting the shell command (to make "await" actually work)
				exec(`open -a OpenEmu -W "${romPath}"`, (error) => {
					if (error) {
						window.showErrorMessage('Cannot run the build. ' + error.message);
					}

					unlink(romPath, (error) => {
						if (error && error.code !== 'ENOENT') {
							window.showErrorMessage('Could not delete the temporary ROM for cleanup. You may want to do this by yourself. ' + error.message);
							return;
						}
					});
				});

				if (!warnings) {
					if (extensionSettings.quietOperation) { return; }
					window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}, running it with OpenEmu. (Oh yes!)`);
				} else {
					const selection = await window.showWarningMessage(`Build succeded with warnings at ${hours}:${minutes}:${seconds}, running it with OpenEmu.`, 'Show Terminal');

					if (selection === 'Show Terminal') {
						outputChannel.show();
					}
				}
			}
		);
	});

	const open_EASy68k = commands.registerCommand('megaenvironment.open_easy68k', async () => {
		const editor = window.activeTextEditor;

		if (!editor) {
			window.showErrorMessage('It seems you forgot to open any text editor.');
			return;
		}

		process.chdir(assemblerFolder);
		
		const selectedText = editor.document.getText(editor.selection);
		let text: string;

		if (workspace.workspaceFolders) {				
			let constantsLocation = '';
			const constantsName = extensionSettings.constantsName;

			if (constantsName) {
				constantsLocation = join(sourceCodeFolder, constantsName);
			}

			let variablesExists = false;
			let variablesLocation = '';
			const variablesName = extensionSettings.variablesName;

			if (variablesName) {
				variablesLocation = join(sourceCodeFolder, variablesName);
				if (existsSync(variablesLocation)) {
					variablesExists = true;
				}
			}

			const { readFile } = promises;

			if (existsSync(constantsLocation)) {
				if (variablesExists) {
					text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n\torg\t$FF0000\n\n; Variables\n\n${await readFile(variablesLocation, 'utf-8')}\n\n; Constants\n\n${await readFile(constantsLocation, 'utf-8')}\n\n\tend\tstart`;
				} else {
					text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n; Constants\n\n${await readFile(constantsLocation, 'utf-8')}\n\n\torg\t$FF0000\n\n\tend\tstart`;
				}
			} else if (variablesExists) {
				text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\norg\t$FF0000\n\n; Variables${await readFile(variablesLocation, 'utf-8')}\n\n\tend\tstart`;
			} else {
				text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n\tend\tstart`;
			}
		} else {
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n\tend\tstart`;
		}

		if (!await promptEmulatorPath('EASy68k')) { return; }

		try {
			await promises.writeFile('temp.txt', new TextEncoder().encode(text));
		} catch (error: any) {
			window.showErrorMessage('Unable to create a temporary file for testing. ' + error.message);
			return;
		}

		let success = true;
		
		exec(`"${workspace.getConfiguration('megaenvironment.paths').get<string>('EASy68k')}" "temp.txt"`, (error) => {
			if (error) {
				window.showErrorMessage('Cannot run EASy68k for testing. ' + error.message);
				success = false;
			}

			// EASy68k can leave some files when we execute the code with the simulator
			[ 'temp.txt', 'temp.L68', 'temp.S68' ].map(path => unlink(path, (error) => {
				if (error && error.code !== 'ENOENT') {
					window.showErrorMessage(`Could not remove a temporary file for cleanup. You may want to do this by yourself. ${error.message}`);
				}
			}));
		});

		if (!success || extensionSettings.quietOperation) { return; }

		window.showInformationMessage('Debugging your current selection with EASy68k.');
	});

	const backup = commands.registerCommand('megaenvironment.backup', async () => {
		if (!workspace.workspaceFolders) {
			window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
			return;
		}

		const outputPath = onProject ? sourceCodeFolder : extensionSettings.singleFileOutput;
		process.chdir(outputPath); // Change current working folder to the project one

		const zip = new AdmZip(); // Create zip archive reference
		let files = 0;

		try {
			const items = await promises.readdir('.');
			const index = items.indexOf('Backups');
			if (index !== -1) {
				items.splice(index, 1); // Remove Backups folder
			} else {
				if (!extensionSettings.quietOperation) {
					window.showInformationMessage('No "Backups" folder found. Fixing!');
				}

				await promises.mkdir('Backups');
			}

			for (const item of items) {
				if ((await promises.stat(item)).isFile()) {
					zip.addLocalFile(item);
				} else {
					zip.addLocalFolder(item, basename(item));
				}

				if (extensionSettings.cleaningExtensions.includes(extname(item).toLowerCase())) {
					unlink(item, (error) => {
						if (error) {
							window.showWarningMessage(`Could not remove "${item}" for cleanup. You may want to do this by yourself. ${error.message}`);
						}
					});
				}

				files++;
			}
		} catch (error: any) {
			window.showErrorMessage('Cannot back up your files. ' + error.message);
			return;
		}

		const currentDate = new Date();
		const backupName = extensionSettings.backupName;

		let fileName = backupName === '' ? 'Backup' : backupName;

		if (extensionSettings.backupDate) {
			fileName += `_${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}_${currentDate.getHours().toString().padStart(2, '0')}.${currentDate.getMinutes().toString().padStart(2, '0')}.${currentDate.getSeconds().toString().padStart(2, '0')}`; // I am aware that this line is extraordinarily long
		}

		zip.writeZip(join('Backups', `${fileName}.zip`));

		if (extensionSettings.quietOperation) { return; }

		if (files !== 0) {
			window.showInformationMessage(`${files} files were backed up successfully.`);
		} else {
			window.showErrorMessage('Cannot backup an empty folder.');
		}
	});

	const cleanup = commands.registerCommand('megaenvironment.cleanup', () => cleanProjectFolder());

	const newProject = commands.registerCommand('megaenvironment.new_project', async () => {
		const uri = await window.showOpenDialog({
			title: 'Select the folder for your new project',
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
			openLabel: 'This one'
		});

		if (!uri || uri.length === 0) { return; }

		const newPath = uri[0].fsPath;
		const extensions = [ '.asm', '.68k', '.s', '.z80', ...extensionSettings.cleaningExtensions ];

		let hasConflictingFiles: boolean;

		try {
			const files = await promises.readdir(newPath);
			hasConflictingFiles = files.some(item => extensions.some(ext => item.endsWith(ext)));
		} catch (error: any) {
			window.showErrorMessage('Cannot read the selected folder to check for existing projects.' + error.message);
			return;
		}

		if (hasConflictingFiles) {
			const selection = await window.showWarningMessage(
				'Looks like this folder already contains a project! If you continue, some files might get overwritten. Do you wish to proceed?',
				'Sure!',
				'Take me back'
			);

			if (selection !== 'Sure!') { return; }
		}

		const selector = extensionSettings.templateSelector;

		let templates = '';

		if (selector.includes('Constants')) {
			templates += '\tinclude "Constants.asm"\n';

			writeFile(join(newPath, 'Constants.asm'), strings.megaDriveConstants, (error) => {
				if (error) {
					window.showErrorMessage('Unable to create the constants source file. ' + error.message);
					return;
				}
			});
		} else {
			const selection = await window.showWarningMessage('The use of constants is strongly recommended since they are in use by code templates.', 'Change Setting', 'Ignore');

			if (selection === 'Change Setting') {
				commands.executeCommand(
					'workbench.action.openSettings',
					'megaenvironment.sourceCodeControl.templateSelector'
				);
				return;
			}
		}

		const map: Record<string, string> = {
			'68k vectors': strings.megaDriveVectors,
			'ROM header': strings.megaDriveHeader,
			'Jump table': strings.megaDriveJumpTable,
			'VDP initialization': strings.megaDriveVDPInitialization,
			'Controllers initialization': strings.megaDriveJoystickInitialization,
			'Z80 initialization': strings.megaDriveCoprocessorInitialization
		};

		if (selector.includes('Variables')) {
			templates += '\tinclude "Variables.asm"\n';

			writeFile(join(newPath, 'Variables.asm'), strings.megaDriveVariables, (error) => {
				if (error) {
					window.showErrorMessage('Unable to create the variables source file. ' + error.message);
					return;
				}
			});
		}

		for (const key of selector) {
			const content = map[key];

			if (content) {
				templates += content;
			}
		}

		if (selector.includes('Z80 initialization')) {
			writeFile(join(newPath, 'Main.z80'), strings.megaDriveZ80Code, (error) => {
				if (error) {
					window.showErrorMessage('Unable to create the Z80 code source file. ' + error.message);
					return;
				}
			});

			templates += '\n\t; Your code goes here\n\n\t; Your resources go here (from "Assets" folder)\n\n\tinclude "Main.z80"\n\nROM_End';
		} else {
			templates += '\n\t; Your code goes here\n\n\t; Your resources go here (from "Assets" folder)\n\nROM_End';
		}

		writeFile(join(newPath, 'Main.68k'), templates, (error) => {
			if (error) {
				window.showErrorMessage('Unable to create the main code source file. ' + error.message);
				return;
			}
		});

		await promises.mkdir(join(newPath, 'Assets'), { recursive: true });
		await promises.mkdir(join(newPath, '.vscode'), { recursive: true });

		writeFile(join(newPath, '.vscode', 'settings.json'), strings.workspaceSettings, (error) => {
			if (error) {
				window.showErrorMessage('Unable to create the workspace settings file. ' + error.message);
				return;
			}
		});

		commands.executeCommand('vscode.openFolder', Uri.file(newPath), true);
	});

	const generateConfiguration = commands.registerCommand('megaenvironment.generate_configuration', async () => {
		if (!workspace.workspaceFolders) {
			window.showErrorMessage('Please, have an opened project to make it possible to write your configuration into it!');
			return;
		}

		const vscodeFolder = join(sourceCodeFolder, '.vscode');
		if (!existsSync(vscodeFolder)) {
			await promises.mkdir(sourceCodeFolder);
		}

		if (existsSync(join(vscodeFolder, 'launch.json'))) {
			const selection = await window.showWarningMessage('\"launch.json\" is already present! Are you sure you want to replace it?', 'Replace!', 'I change my mind');
			
			if (selection !== 'Replace!') { return; }
		}

		writeFile(join(vscodeFolder, 'launch.json'), strings.launchJson, (error) => {
			if (error) {
				window.showErrorMessage('Cannot create the "launch.json" file for custom settings. You need manually to set the main file name to "Main.asm" and a current working folder to "Assets". ' + error.message);
			}
		});
	});

	// Hacky way to get a somewhat-debugger integrated into VS Code
	const fakeDebugger = debug.registerDebugConfigurationProvider('megaenvironment-nondebugger', {
		resolveDebugConfiguration() {
			commands.executeCommand('megaenvironment.open_easy68k');
			return undefined; // Prevent actual debug session
		}
	});

	context.subscriptions.push(
		workspace.onDidChangeConfiguration(event => updateConfiguration(event)), workspace.onDidChangeWorkspaceFolders(projectCheck),// workspace.onDidOpenTextDocument(projectCheck),
		assemble, clean_and_assemble,
		run_BlastEm, run_ClownMdEmu, run_Regen, run_Gens, run_BizHawk, run_Fusion, run_OpenEmu,
		assemble_and_run_BlastEm, assemble_and_run_ClownMDEmu, assemble_and_run_Regen, assemble_and_run_Gens, assemble_and_run_BizHawk, assemble_and_run_Fusion, assemble_and_run_OpenEmu,
		backup, cleanup, open_EASy68k, newProject, redownloadTools, runButton, generateConfiguration, fakeDebugger, treeView
	);
}

// Performs various checks to see it the extension should activate while being in a project (valid workspace) or in an opened assembly file
// It also assigns the source code folder path to "sourceCodeFolder"
// If false the code cannot continue
async function projectCheck(): Promise<boolean> {
	if (workspace.getConfiguration('megaenvironment.extensionOptions').get<boolean>('alwaysActive')) { // There's only this check, this is why putting it to extensionSettings is redundant
		commands.executeCommand('setContext', 'megaenvironment.shouldActivate', true);
		onProject = true;
		return true;
	}

	const projectFolders = workspace.workspaceFolders;
	const editor = window.activeTextEditor;
	
	if (projectFolders && (await workspace.findFiles('*.{68k,z80,asm}', undefined, 1)).length > 0) { // If it finds a project with the right files
		commands.executeCommand('setContext', 'megaenvironment.shouldActivate', true);
		onProject = true;
		sourceCodeFolder = projectFolders[0].uri.fsPath;

		if ((await promises.readdir(sourceCodeFolder)).some(f => strings.sonicDisassemblyFolders.includes(f)) && !extensionSettings.sonicDisassembly) {
			const selection = await window.showWarningMessage("It looks like you're using a Sonic disassembly. Please, turn on the associated compatibility setting to make compiling work, or else you'll get random errors!", 'Change Setting');
			
			if (selection === 'Change Setting') {
				commands.executeCommand(
					'workbench.action.openSettings',
					'megaenvironment.buildControl.sonicDisassemblySupport'
				);
			}
		}

		return true;
	} else if ((editor && [ 'm68k-as', 'z80-as', 'm68k-sdisasm', 'asm-collection' ].includes(editor.document.languageId))) { // If the standalone file is using one of the associated languages
		commands.executeCommand('setContext', 'megaenvironment.shouldActivate', true);
		onProject = false;
		return true;
	}

	commands.executeCommand('setContext', 'megaenvironment.shouldActivate', false); // If we didn't find anything, we have no reason to activate, so
	onProject = false;
	return false;
}

async function updateConfiguration(event: ConfigurationChangeEvent) {
	if (!event.affectsConfiguration('megaenvironment')) { return; } // Quick return if the extension isn't involved

	const configuration = workspace.getConfiguration('megaenvironment');
	// This setting requires different management
	if (event.affectsConfiguration('megaenvironment.buildControl.sonicDisassemblySupport')) {
		extensionSettings.sonicDisassembly = configuration.get<boolean>('buildControl.sonicDisassemblySupport', false);
		assemblerFolder = join(dirname(normalize(assemblerFolder)), !extensionSettings.sonicDisassembly ? 'Original' : 'Fixed');
		const windowsExtension = process.platform === 'win32' ? '.exe' : '';
		assemblerPath = join(assemblerFolder, 'asl' + windowsExtension);
		compilerPath = join(assemblerFolder, 'p2bin' + windowsExtension);
	} else if (event.affectsConfiguration('megaenvironment.extensionOptions.hideUnsupportedEmulators')) {
		buttonProvider.refresh(); // Update the TreeView with the new setting
	}

	// Updates "settingsDescriptors" each time a setting is changed

	for (const setting of settingDescriptors) {
		if (!event.affectsConfiguration(`megaenvironment.${setting.key}`)) { continue; }

		(extensionSettings as any)[setting.target] = configuration.get(setting.key);

		return;
	}
}

class EmulatorTreeItem extends TreeItem {
	constructor (
		public readonly label: string,
		public readonly command: Command,
		public readonly compatible: boolean
	) {
		super(label, TreeItemCollapsibleState.None);

		this.iconPath = compatible
			? new ThemeIcon('play-circle')
			: new ThemeIcon('error');
	}
}

interface EmulatorEntry {
	command: string;
	title: string;
	tooltip: string;
	isCompatible(): boolean; // It must be a function or else it won't actively update
}

const EMULATORS: EmulatorEntry[] = [
	{
		command: 'megaenvironment.run_blastem',
		title: 'Run with BlastEm',
		tooltip: 'Run lastest ROM (.gen) using BlastEm emulator',
		isCompatible: () => true
	},
	{
		command: 'megaenvironment.run_clownmdemu',
		title: 'Run with ClownMDEmu',
		tooltip: 'Run lastest ROM (.gen) using ClownMDEmu emulator',
		isCompatible: () => true
	},
	{
		command: 'megaenvironment.run_regen',
		title: 'Run with Regen',
		tooltip: 'Run lastest ROM (.gen) using Regen emulator',
		isCompatible: () => regenCompatible
	},
	{
		command: 'megaenvironment.run_gens',
		title: 'Run with Gens',
		tooltip: 'Run lastest ROM (.gen) using Gens emulator',
		isCompatible: () => gensCompatible
	},
	{
		command: 'megaenvironment.run_bizhawk',
		title: 'Run with BizHawk',
		tooltip: 'Run lastest ROM (.gen) using BizHawk emulator',
		isCompatible: () => bizhawkCompatible
	},
	{
		command: 'megaenvironment.run_fusion',
		title: 'Run with Fusion',
		tooltip: 'Run lastest ROM (.gen) using Fusion emulator',
		isCompatible: () => true
	},
	{
		command: 'megaenvironment.run_openemu',
		title: 'Run with OpenEmu',
		tooltip: 'Run lastest ROM (.gen) using OpenEmu emulator',
		isCompatible: () => openemuCompatible
	}
];

class ButtonProvider implements TreeDataProvider<TreeItem> {
	private _onDidChangeTreeData = new EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: EmulatorTreeItem): TreeItem { return element; }

	getChildren(element?: TreeItem): TreeItem[] {
		const hideEmulators = workspace.getConfiguration('megaenvironment').get<boolean>('extensionOptions.hideUnsupportedEmulators', false);

		if (!element) {
			if (!hideEmulators) {
				return EMULATORS // View with all emulators
					.map(e => new EmulatorTreeItem(e.title, {
						command: e.command,
						title: e.title,
						tooltip: e.tooltip
					}, e.isCompatible()));
			} else {
				return EMULATORS // View with compatible emulators only
					.filter(e => e.isCompatible())
					.map(e => new EmulatorTreeItem(e.title, {
						command: e.command,
						title: e.title,
						tooltip: e.tooltip
					}, true)); // The only emulators that are not hidden are the compatible ones, so
			}
		}

		return [];
	}
}

// Strings section

const strings = {
	workspaceSettings: String.raw
`{
	"workbench.colorTheme": "MegaEnvironment Dark",
	"megaenvironment.sourceCodeControl.currentWorkingFolders": [ "Assets" ],
	"megaenvironment.sourceCodeControl.mainFileName": "Main.68k"
}`,

	launchJson: String.raw
`{
	"version": "0.2.0",
	"configurations": [
		{
			"name": "Debug selection with EASy68k",
			"type": "megaenvironment-nondebugger", // Ignore the eventual warnings, everything is fine
			"request": "launch"
		}
	]
}`,

	megaDriveVectors: String.raw
`
ROM_Start

	org 0

; ================================================================
; 68000 vectors (with its error code in square brackets, AAAAAAxx)
; ================================================================

		dc.l M68K.STACK			; Initial stack pointer value (SP value)
		dc.l EntryPoint			; Start of program (PC value)
		dc.l BusError			; Bus error							[1]
		dc.l AddressError		; Address error						[2]
		dc.l IllegalInstruction	; Illegal instruction				[3]
		dc.l DivisionByZero		; Division by zero					[4]
		dc.l CHKException		; CHK exception						[5]
		dc.l TRAPVException		; TRAPV exception					[6]
		dc.l PrivilegeViolation	; Privilege violation				[7]
		dc.l TRACEException		; TRACE exception					[8]
		dc.l LineAEmulator		; Line-A emulator					[9]
		dc.l LineFEmulator		; Line-F emulator					[10]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l SpuriousException	; Spurious exception				[11]
		dc.l InterruptRequest	; IRQ level 1						[12]
		dc.l InterruptRequest	; IRQ level 2						[12]
		dc.l InterruptRequest	; IRQ level 3 						[12]
		dc.l VDP_HBlank			; IRQ level 4 (horizontal retrace)
		dc.l InterruptRequest	; IRQ level 5						[12]
		dc.l VDP_VBlank			; IRQ level 6 (vertical retrace)
		dc.l InterruptRequest	; IRQ level 7						[12]
		dc.l TRAPException		; TRAP #00 exception				[13]
		dc.l TRAPException		; TRAP #01 exception				[13]
		dc.l TRAPException		; TRAP #02 exception				[13]
		dc.l TRAPException		; TRAP #03 exception				[13]
		dc.l TRAPException		; TRAP #04 exception				[13]
		dc.l TRAPException		; TRAP #05 exception				[13]
		dc.l TRAPException		; TRAP #06 exception				[13]
		dc.l TRAPException		; TRAP #07 exception				[13]
		dc.l TRAPException		; TRAP #08 exception				[13]
		dc.l TRAPException		; TRAP #09 exception				[13]
		dc.l TRAPException		; TRAP #10 exception				[13]
		dc.l TRAPException		; TRAP #11 exception				[13]
		dc.l TRAPException		; TRAP #12 exception				[13]
		dc.l TRAPException		; TRAP #13 exception				[13]
		dc.l TRAPException		; TRAP #14 exception				[13]
		dc.l TRAPException		; TRAP #15 exception				[13]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
		dc.l UnknownError		; Unused (reserved)					[14]
`,
	megaDriveJumpTable: String.raw
`
; ========================
; Error handler jump table
; ========================

BusError:
	move.l	#$AAAAAAA1,d7
	stop #$2700 ; Don't use Gens, it doesn't recognize this instruction

AddressError:
	move.l	#$AAAAAAA2,d7
	stop #$2700

IllegalInstruction:
	move.l	#$AAAAAAA3,d7
	stop #$2700

DivisionByZero:
	move.l	#$AAAAAAA4,d7
	stop #$2700

CHKException:
	move.l	#$AAAAAAA5,d7
	stop #$2700

TRAPVException:
	move.l	#$AAAAAAA6,d7
	stop #$2700

PrivilegeViolation:
	move.l	#$AAAAAAA7,d7
	stop #$2700

TRACEException:
	move.l	#$AAAAAAA8,d7
	stop #$2700

LineAEmulator:
	move.l	#$AAAAAAA9,d7
	stop #$2700

LineFEmulator:
	move.l	#$AAAAAA10,d7
	stop #$2700

SpuriousException:
	move.l	#$AAAAAA11,d7
	stop #$2700

InterruptRequest:
	move.l	#$AAAAAA12,d7
	stop #$2700

TRAPException:
	move.l	#$AAAAAA13,d7
	stop #$2700

UnknownError:
	move.l	#$AAAAAA14,d7
	stop #$2700

; ==========================

; Vertical interrupt
VDP_VBlank:
	rte

; Horizontal interrupt
VDP_HBlank:
	rte

; ==========================

EntryPoint:`,

	megaDriveHeader: String.raw
`
; ===================================================================
; Mega Drive ROM header (reference: https://plutiedev.com/rom-header)
; ===================================================================

		dc.b "SEGA MEGA DRIVE "										; System type - 16 bytes
		dc.b "(C).... YYYY.MMM"										; Copyright, release year and month (e.g. "(C)SEGA 1991.APR") - 16 bytes
		dc.b "                                                "		; Domestic name - 48 bytes
		dc.b "                                                "		; Overseas name - 48 bytes
		dc.b "GM-12345678-00"										; Serial number ("xx-yyyyyyyy-zz") - 14 bytes
		dc.w $0000													; Where this ROM gets patched with a 16-bit checksum - 2 bytes
		dc.b "J               "										; Device support (e.g. "J" for 3-button controller) - 16 bytes
		dc.l ROM_Start												; Start address of ROM - 4 bytes
		dc.l ROM_End												; End address of ROM - 4 bytes
		dc.l $FF0000												; Start address of WRAM - 4 bytes
		dc.l $FFFFFF 												; End address of WRAM - 4 bytes
		dc.b "                                                                " ; Padding for reserved space - 64 bytes
		dc.b "JUE"													; Region support - 16 bytes
		dc.b "             "										; Padding for reserved space (you can put a comment if you want!) - 13 bytes
`,

	megaDriveVariables: String.raw
`; --------------------------
;		Motorola 68000
; --------------------------

	org M68K.WRAM	; Main work RAM address space

; Your 68000 variables go here

; ----------------------
;		Zilog Z80
; ----------------------

	padding off

	org $1000	; Away from code and stack

; Your Z80 variables go here

	padding on
`,

	megaDriveVDPInitialization: String.raw
`
; ============================
; VDP initialization and setup
; ============================

; VDP setup reference: https://plutiedev.com/vdp-setup

	lea	(VDP.CTRL),a0

	tst.w 	(a0) ; Reading the VDP control port safely resets it
	
; Register reference: https://plutiedev.com/vdp-registers

	move.l  #(VDP_REG.MODE1|%00000100)<<16|(VDP_REG.MODE2|%01110100),(a0)	; Mode register #1 and Mode register #2
	move.l  #(VDP_REG.MODE3|%00000000)<<16|(VDP_REG.MODE4|%10000001),(a0)	; Mode register #3 and Mode Register #4
    
; Planes reference: https://segaretro.org/Sega_Mega_Drive/Planes

	move.l  #VDP_REG.PLANEA|(VDP_VRAM.PLANEA>>10)<<16|(VDP_REG.PLANEB|(VDP_VRAM.PLANEB>>13)),(a0)	; Plane A and Plane B address
	move.l  #VDP_REG.SPRITE|(VDP_VRAM.SPRITE>>9)<<16|(VDP_REG.WINDOW|(VDP_VRAM.WINDOW>>10)),(a0)	; Sprite and Window address
	move.w  #VDP_REG.HSCROLL|(VDP_VRAM.HSCROLL>>10),(a0)											; Horizontal scroll address
    
	move.l  #(VDP_REG.WINX|$00)<<16|(VDP_REG.WINY|$00),(a0)			; Window X split and Window Y split
	move.l  #(VDP_REG.SIZE|%00000001)<<16|(VDP_REG.BGCOL|$00),(a0)	; Tilemap size and Background color
	move.l  #(VDP_REG.INCR|$02)<<16|(VDP_REG.HRATE|$FF),(a0)		; Autoincrement and HBlank IRQ rate
`,

	megaDriveJoystickInitialization: String.raw
`
; ================================================================
; Controllers setup (reference: https://plutiedev.com/controllers)
; ================================================================

	moveq 	#$40,d0
	move.b	d0,(JOY1.CTRL)
	move.b	d0,(JOY1.DATA)
	move.b	d0,(JOY2.CTRL)
	move.b	d0,(JOY2.DATA)
`,

	megaDriveCoprocessorInitialization: String.raw
`
; =================================================================================
; Z80 program upload and execution (reference: https://plutiedev.com/using-the-z80)
; =================================================================================

	lea (Z80_ROM_Start),a0
	lea (Z80_CTRL.WRAM),a1
	lea (Z80_CTRL.RESET),a2
	lea (Z80_CTRL.BUSREQ),a3

	move.w	#$000,a2	; Assert Z80 reset
	move.w	#$100,a3	; Hold (or request) Z80 bus
	move.w	#$100,a2	; Deassert Z80 reset

	move.w	#(Z80_ROM_Start-Z80_ROM_End)-1,d0

$$loop:	; Load Z80 program into its RAM
	move.b	(a0)+,(a1)+
	dbf	d0,$$loop

	move.w	#$100,a2	; Release Z80 reset
	move.w	#$000,a3	; Release Z80 bus
`,

	megaDriveConstants: String.raw
`; M68K: Motorola 68000 related constant
; Z80: Z80 related constant
; JOYx: controller related constant
; EXP: expansion related constant
; VDP: VDP memory map related constant
; VDP_REG: VDP register related constant
; PSG: PSG related constant
; YM2612: YM2612 related constant
; REG: miscellaneous Mega Drive register related constant
; SIZE: size of a memory space

; ---------------------------------
;		From: Motorola 68000
; ---------------------------------

; Mega Drive memory spaces
M68K:
.WRAM:	equ $FF0000			; 68000 memory start address
.STACK:	equ $FF0000			; 68000 stack
.PSG:	equ $C00011			; PSG port
JOY1:
.CTRL:		equ $A10009		; Controller 1 control port
.DATA:		equ $A10003   	; Controller 1 data port
.SER_TRAN:	equ $A1000E		; Controller 1 serial transmit
.SER_REC:	equ $A10010		; Controller 1 serial receive
.SER_CTRL:	equ $A10012		; Controller 1 serial control
JOY2:
.CTRL:		equ $A10005		; Controller 2 control port
.DATA:		equ $A1000B   	; Controller 2 data port
.SER_TRAN:	equ $A10014		; Controller 2 serial transmit
.SER_REC:	equ $A10016		; Controller 2 serial receive
.SER_CTRL:	equ $A10018		; Controller 2 serial control

EXP:
.CTRL:		equ $A1000D		; Expansion control port
.DATA:		equ $A10006		; Expansion data port
.SER_TRAN:	equ $A1001A		; Expansion serial transmit
.SER_REC:	equ $A1001C		; Expansion serial receive
.SER_CTRL:	equ $A1001E		; Expansion serial control

REG:
.SRAM:	equ $A130F1			; SRAM access register

.VERSION:		equ $A10001		; Version register
.MEMORYMODE:	equ $A11000		; Memory mode register

.TMSS:		equ $A14000		; TMSS "SEGA" register
.TMSS_CART:	equ $A14101		; TMSS cartridge register

.TIME:	equ $A13000		; TIME signal to cartridge ($00-$FF)
.32X:	equ $A130EC		; Becomes "MARS" when a 32X is attached

; VDP memory addresses
VDP:
.DATA:		equ $C00000		; VDP data port
.CTRL:		equ $C00004		; VDP control port and Status Register
.HVCOUNTER:	equ $C00008		; H/V counter
.DEBUG:		equ $C0001C		; Debug register

; VDP commands
VDP_CMD:
.VRAM:	equ	$40000000		; Video memory address command
.VSRAM:	equ $40000010		; Vertical scroll memory address command
.CRAM: 	equ $C0000000		; Color memory address command

.VDP_VRAM.DMA:	equ $40000080	; DMA video memory write command
.VSRAM_DMA:		equ $40000090	; DMA vertical scroll memory write command
.RAM_DMA:		equ $C0000080	; DMA color memory write command

; VDP registers
VDP_REG:
.MODE1:     equ $8000  ; Mode register #1
.MODE2:     equ $8100  ; Mode register #2
.MODE3:     equ $8B00  ; Mode register #3
.MODE4:     equ $8C00  ; Mode register #4

.PLANEA:    equ $8200  ; Plane A table address
.PLANEB:    equ $8400  ; Plane B table address
.SPRITE:    equ $8500  ; Sprite table address
.WINDOW:    equ $8300  ; Window table address
.HSCROLL:   equ $8D00  ; HScroll table address

.SIZE:      equ $9000  ; Plane A and B size
.WINX:      equ $9100  ; Window X split position
.WINY:      equ $9200  ; Window Y split position
.INCR:      equ $8F00  ; Autoincrement
.BGCOL:     equ $8700  ; Background color
.HRATE:     equ $8A00  ; HBlank interrupt rate

.DMALEN_L:  equ $9300  ; DMA length (low)
.DMALEN_H:  equ $9400  ; DMA length (high)
.DMASRC_L:  equ $9500  ; DMA source (low)
.DMASRC_M:  equ $9600  ; DMA source (mid)
.DMASRC_H:  equ $9700  ; DMA source (high)

; VRAM management (you can change these)
VDP_VRAM:
.PLANEA:	equ $E000	; Plane A name table address
.PLANEB:	equ $C000	; Plane B name table address
.SPRITE:	equ $F000	; Sprite name table address
.WINDOW:	equ $FFFF	; Window plane name table address
.HSCROLL:	equ $FFFF	; Plane x coordinate

; Z80 control from 68000
Z80_CTRL:
.WRAM:		equ $A00000  ; Z80 RAM start
.BUSREQ:	equ $A11100  ; Z80 bus request line
.RESET:		equ $A11200  ; Z80 reset line

; YM2612 memory addresses from 68000
YM2612_68K:
.CTRL0:	equ $A04000		; YM2612 bank 0 control port from 68000
.DATA0:	equ $A04001		; YM2612 bank 0 data port from 68000
.CTRL1:	equ $A04002		; YM2612 bank 1 control port from 68000
.DATA1:	equ $A04003		; YM2612 bank 1 data port from 68000

; ----------------------------
;		From: Zilog Z80
; ----------------------------

; Z80 side addresses
Z80:
.STACK:	equ $2000
.PSG:	equ $7F11	; PSG port from Z80 on 68k bus

; YM2612 memory addresses from Z80
YM2612:
.CTRL0:	equ $4000		; YM2612 bank 0 control port
.DATA0:	equ $4001		; YM2612 bank 0 data port
.CTRL1:	equ $4002		; YM2612 bank 1 control port
.DATA1:	equ $4003		; YM2612 bank 1 data port

; Z80 bus arbiter
Z80_BANK:
.CTRL:		equ $6000	; Bank selector (9 LSB serial writes)
.WINDOW:	equ $8000	; Access window (8000h-FFFFh)

; --------------------------
;		Generic Labels
; --------------------------

; Various memory spaces sizes in bytes
SIZE:
.WRAM: 		equ 65535	; 68000 RAM size (64 KB)
.VRAM:		equ 65535	; VDP VRAM size (64 KB)
.VSRAM:		equ 80		; VDP vertical scroll RAM size (80 bytes)
.CRAM:		equ 128		; VDP color RAM size (128 bytes, 64 colors)
.Z80WRAM:	equ 8192	; Z80 RAM size (8 KB)

; VDP name table addresses
NOFLIP: equ $0000  ; Don't flip (default)
HFLIP:  equ $0800  ; Flip horizontally
VFLIP:  equ $1000  ; Flip vertically
HVFLIP: equ $1800  ; Flip both ways (180° flip)

PAL0:   equ $0000  ; Use palette 0 (default)
PAL1:   equ $2000  ; Use palette 1
PAL2:   equ $4000  ; Use palette 2
PAL3:   equ $6000  ; Use palette 3

LOPRI:  equ $0000  ; Low priority (default)
HIPRI:  equ $8000  ; High priority

; Controller labels
JOY:
.C:	equ 5
.B:	equ 4
.R:	equ 3
.L:	equ 2
.D:	equ 1
.U:	equ 0

; YM2612 labels
LFO_ENABLE:		equ $22		; Enable Low Frequency Oscillator
TIMER_A_H:		equ $24		; Timer A frequency (high)
TIMER_A_L:		equ $25		; Timer A frequency (low)
TIMER_B:		equ $26		; Timer B frequency
CH3_TIMERCTRL:	equ $27		; Channel 3 Mode and Timer control
KEY_ON_OFF:		equ $28		; Key-on and Key-off
DAC_OUT:		equ $2A		; DAC output (or input)
DAC_ENABLE:		equ $2B		; DAC enable
DAC_BOOST:		equ $2C		; Undocumented debug register that amplifies the DAC channel output

CH1_4_OP1_MUL_DT:	equ $30		; Channel 1/4 operator 1 Multiply and Detune
CH1_4_OP2_MUL_DT:	equ $38		; Channel 1/4 operator 2 Multiply and Detune
CH1_4_OP3_MUL_DT:	equ $34		; Channel 1/4 operator 3 Multiply and Detune
CH1_4_OP4_MUL_DT:	equ $3C		; Channel 1/4 operator 4 Multiply and Detune

CH2_5_OP1_MUL_DT:	equ $31		; Channel 2/5 operator 1 Multiply and Detune
CH2_5_OP2_MUL_DT:	equ $39		; Channel 2/5 operator 2 Multiply and Detune
CH2_5_OP3_MUL_DT:	equ $35		; Channel 2/5 operator 3 Multiply and Detune
CH2_5_OP4_MUL_DT:	equ $3D		; Channel 2/5 operator 4 Multiply and Detune

CH3_6_OP1_MUL_DT:	equ $32		; Channel 3/6 operator 1 Multiply and Detune
CH3_6_OP2_MUL_DT:	equ $3A		; Channel 3/6 operator 2 Multiply and Detune
CH3_6_OP3_MUL_DT:	equ $36		; Channel 3/6 operator 3 Multiply and Detune
CH3_6_OP4_MUL_DT:	equ $3E		; Channel 3/6 operator 4 Multiply and Detune

CH1_4_OP1_TL:	equ $40		; Channel 1/4 operator 1 Total Level
CH1_4_OP2_TL:	equ $48		; Channel 1/4 operator 2 Total Level
CH1_4_OP3_TL:	equ $44		; Channel 1/4 operator 3 Total Level
CH1_4_OP4_TL:	equ $4C		; Channel 1/4 operator 4 Total Level

CH2_5_OP1_TL:	equ $41		; Channel 2/5 operator 1 Total Level
CH2_5_OP2_TL:	equ $49		; Channel 2/5 operator 2 Total Level
CH2_5_OP3_TL:	equ $45		; Channel 2/5 operator 3 Total Level
CH2_5_OP4_TL:	equ $4D		; Channel 2/5 operator 4 Total Level

CH3_6_OP1_TL:	equ $42		; Channel 3/6 operator 1 Total Level
CH3_6_OP2_TL:	equ $4A		; Channel 3/6 operator 2 Total Level
CH3_6_OP3_TL:	equ $46		; Channel 3/6 operator 3 Total Level
CH3_6_OP4_TL:	equ $4E		; Channel 3/6 operator 4 Total Level

CH1_4_OP1_AR_RS:	equ $50		; Channel 1/4 operator 1 Attack Rate and Rate Scaling
CH1_4_OP2_AR_RS:	equ $58		; Channel 1/4 operator 2 Attack Rate and Rate Scaling
CH1_4_OP3_AR_RS:	equ $54		; Channel 1/4 operator 3 Attack Rate and Rate Scaling
CH1_4_OP4_AR_RS:	equ $5C		; Channel 1/4 operator 4 Attack Rate and Rate Scaling

CH2_5_OP1_AR_RS:	equ $51		; Channel 2/5 operator 1 Attack Rate and Rate Scaling
CH2_5_OP2_AR_RS:	equ $59		; Channel 2/5 operator 2 Attack Rate and Rate Scaling
CH2_5_OP3_AR_RS:	equ $55		; Channel 2/5 operator 3 Attack Rate and Rate Scaling
CH2_5_OP4_AR_RS:	equ $5D		; Channel 2/5 operator 4 Attack Rate and Rate Scaling

CH3_6_OP1_AR_RS:	equ $52		; Channel 3/6 operator 1 Attack Rate and Rate Scaling
CH3_6_OP2_AR_RS:	equ $5A		; Channel 3/6 operator 2 Attack Rate and Rate Scaling
CH3_6_OP3_AR_RS:	equ $56		; Channel 3/6 operator 3 Attack Rate and Rate Scaling
CH3_6_OP4_AR_RS:	equ $5E		; Channel 3/6 operator 4 Attack Rate and Rate Scaling

CH1_4_OP1_DR_AM:	equ $60		; Channel 1/4 operator 1 Decay Rate and Amplitude Modulation enable
CH1_4_OP2_DR_AM:	equ $68		; Channel 1/4 operator 2 Decay Rate and Amplitude Modulation enable
CH1_4_OP3_DR_AM:	equ $64		; Channel 1/4 operator 3 Decay Rate and Amplitude Modulation enable
CH1_4_OP4_DR_AM:	equ $6C		; Channel 1/4 operator 4 Decay Rate and Amplitude Modulation enable

CH2_5_OP1_DR_AM:	equ $61		; Channel 2/5 operator 1 Decay Rate and Amplitude Modulation enable
CH2_5_OP2_DR_AM:	equ $69		; Channel 2/5 operator 2 Decay Rate and Amplitude Modulation enable
CH2_5_OP3_DR_AM:	equ $65		; Channel 2/5 operator 3 Decay Rate and Amplitude Modulation enable
CH2_5_OP4_DR_AM:	equ $6D		; Channel 2/5 operator 4 Decay Rate and Amplitude Modulation enable

CH3_6_OP1_DR_AM:	equ $62		; Channel 3/6 operator 1 Decay Rate and Amplitude Modulation enable
CH3_6_OP2_DR_AM:	equ $6A		; Channel 3/6 operator 2 Decay Rate and Amplitude Modulation enable
CH3_6_OP3_DR_AM:	equ $66		; Channel 3/6 operator 3 Decay Rate and Amplitude Modulation enable
CH3_6_OP4_DR_AM:	equ $6E		; Channel 3/6 operator 4 Decay Rate and Amplitude Modulation enable

CH1_4_OP1_SR:	equ $70		; Channel 1/4 operator 1 Sustain Rate
CH1_4_OP2_SR:	equ $78		; Channel 1/4 operator 2 Sustain Rate
CH1_4_OP3_SR:	equ $74		; Channel 1/4 operator 3 Sustain Rate
CH1_4_OP4_SR:	equ $7C		; Channel 1/4 operator 4 Sustain Rate

CH2_5_OP1_SR:	equ $71		; Channel 2/5 operator 1 Sustain Rate
CH2_5_OP2_SR:	equ $79		; Channel 2/5 operator 2 Sustain Rate
CH2_5_OP3_SR:	equ $75		; Channel 2/5 operator 3 Sustain Rate
CH2_5_OP4_SR:	equ $7D		; Channel 2/5 operator 4 Sustain Rate

CH3_6_OP1_SR:	equ $72		; Channel 3/6 operator 1 Sustain Rate
CH3_6_OP2_SR:	equ $7A		; Channel 3/6 operator 2 Sustain Rate
CH3_6_OP3_SR:	equ $76		; Channel 3/6 operator 3 Sustain Rate
CH3_6_OP4_SR:	equ $7E		; Channel 3/6 operator 4 Sustain Rate

CH1_4_OP1_RR_SL:	equ $80		; Channel 1/4 operator 1 Release Rate and Sustain Level
CH1_4_OP2_RR_SL:	equ $88		; Channel 1/4 operator 2 Release Rate and Sustain Level
CH1_4_OP3_RR_SL:	equ $84		; Channel 1/4 operator 3 Release Rate and Sustain Level
CH1_4_OP4_RR_SL:	equ $8C		; Channel 1/4 operator 4 Release Rate and Sustain Level

CH2_5_OP1_RR_SL:	equ $81		; Channel 2/5 operator 1 Release Rate and Sustain Level
CH2_5_OP2_RR_SL:	equ $89		; Channel 2/5 operator 2 Release Rate and Sustain Level
CH2_5_OP3_RR_SL:	equ $85		; Channel 2/5 operator 3 Release Rate and Sustain Level
CH2_5_OP4_RR_SL:	equ $8D		; Channel 2/5 operator 4 Release Rate and Sustain Level

CH3_6_OP1_RR_SL:	equ $82		; Channel 3/6 operator 1 Release Rate and Sustain Level
CH3_6_OP2_RR_SL:	equ $8A		; Channel 3/6 operator 2 Release Rate and Sustain Level
CH3_6_OP3_RR_SL:	equ $86		; Channel 3/6 operator 3 Release Rate and Sustain Level
CH3_6_OP4_RR_SL:	equ $8E		; Channel 3/6 operator 4 Release Rate and Sustain Level

CH1_4_OP1_SSG_EG:	equ $90		; Channel 1/4 operator 1 envelope shape
CH1_4_OP2_SSG_EG:	equ $98		; Channel 1/4 operator 2 envelope shape
CH1_4_OP3_SSG_EG:	equ $94		; Channel 1/4 operator 3 envelope shape
CH1_4_OP4_SSG_EG:	equ $9C		; Channel 1/4 operator 4 envelope shape

CH2_5_OP1_SSG_EG:	equ $91		; Channel 2/5 operator 1 envelope shape
CH2_5_OP2_SSG_EG:	equ $99		; Channel 2/5 operator 2 envelope shape
CH2_5_OP3_SSG_EG:	equ $95		; Channel 2/5 operator 3 envelope shape
CH2_5_OP4_SSG_EG:	equ $9D		; Channel 2/5 operator 4 envelope shape

CH3_6_OP1_SSG_EG:	equ $92		; Channel 3/6 operator 1 envelope shape
CH3_6_OP2_SSG_EG:	equ $9A		; Channel 3/6 operator 2 envelope shape
CH3_6_OP3_SSG_EG:	equ $96		; Channel 3/6 operator 3 envelope shape
CH3_6_OP4_SSG_EG:	equ $9E		; Channel 3/6 operator 4 envelope shape

CH1_4_FREQ_H:	equ $A4		; Channel 1/4 frequency (high)
CH2_5_FREQ_H:	equ $A5		; Channel 2/5 frequency (high)
CH3_6_FREQ_H:	equ $A6		; Channel 3/6 frequency (high)

CH1_4_FREQ_L:	equ $A0		; Channel 1/4 frequency (low)
CH2_5_FREQ_L:	equ $A1		; Channel 2/5 frequency (low)
CH3_6_FREQ_L:	equ $A2		; Channel 3/6 frequency (low)

CH3_OP1_FREQ_H:	equ $AD		; Channel 3 operator 1 frequency (high)
CH3_OP2_FREQ_H:	equ $AE		; Channel 3 operator 2 frequency (high)
CH3_OP3_FREQ_H:	equ $AC		; Channel 3 operator 3 frequency (high)
CH3_OP4_FREQ_H:	equ $A6		; Channel 3 operator 4 frequency (high)

CH3_OP1_FREQ_L:	equ $A9		; Channel 3 operator 1 frequency (low)
CH3_OP2_FREQ_L:	equ $AA		; Channel 3 operator 2 frequency (low)
CH3_OP3_FREQ_L:	equ $A8		; Channel 3 operator 3 frequency (low)
CH3_OP4_FREQ_L:	equ $A2		; Channel 3 operator 4 frequency (low)

CH1_4_ALG_FB:	equ $B0		; Channel 1/4 Algorithm and Feedback
CH2_5_ALG_FB:	equ $B1		; Channel 2/5 Algorithm and Feedback
CH3_6_ALG_FB:	equ $B2		; Channel 3/6 Algorithm and Feedback

CH1_4_PAN_PMS_AMS:	equ $B4		; Channel 1/4 Panning, Phase Modulation Sensitivity and Amplitude Modulation Sensitivity
CH2_5_PAN_PMS_AMS:	equ $B5		; Channel 2/5 Panning, Phase Modulation Sensitivity and Amplitude Modulation Sensitivity
CH3_6_PAN_PMS_AMS:	equ $B6		; Channel 3/6 Panning, Phase Modulation Sensitivity and Amplitude Modulation Sensitivity

; Generic address selectors for macros
OP1:	equ %0000
OP2:	equ %1000
OP3:	equ %0100
OP4:	equ %1100

CH1_4:	equ %0000
CH2_4:	equ %0001
CH3_6:	equ %0010`,

	megaDriveZ80Code: String.raw
`	save	; Remember previous assembler options
	cpu Z80	; Or set to Z80UNDOC if you want the additional undocumented opcodes
	phase 0	; Set label addresses to the start of the Z80 RAM

Z80_ROM_Start

	; Your Z80 code goes here

Z80_ROM_End

	dephase	; The rest of the labels resume normal mapping
	restore	; Restore the previous assembler options`,

	sonicDisassemblyFolders: [ '_amin', '_inc', '_incObj', '_maps', 'artkos', 'artnem', 'artunc' ]
};