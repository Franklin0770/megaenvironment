/*
TODOS:
- Maybe some asyncing; (Done!)
- Maybe some classes for encapsulation.
*/

import { ExtensionContext, extensions, workspace, commands, window, Uri } from 'vscode';
import { exec, execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, rename, unlink, createWriteStream, chmodSync, unlinkSync } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { join } from 'path';
import AdmZip from 'adm-zip';

interface ExtensionSettings {
    romName: string;
    romDate: boolean;
    prevRoms: boolean;
    prevAmount: number;
    mainName: string;
    constantsName: string;
    variablesName: string;
    listingFile: boolean;
    listingName: string;
	errorFile: boolean;
	errorName: string;
	caseSensitive: boolean;
    backupName: string;
    backupDate: boolean;
    fillValue: string;
    errorLevel: number;
	errorNumber: boolean,
	lowercaseHex: boolean,
    suppressWarnings: boolean;
    quietOperation: boolean;
    verboseOperation: boolean;
}

let extensionSettings: ExtensionSettings = {
    romName: "",
    romDate: true,
    prevRoms: true,
    prevAmount: 10,
    mainName: "",
    constantsName: "",
    variablesName: "",
    listingFile: false,
    listingName: "",
	errorFile: false,
	errorName: "",
	caseSensitive: true,
    backupName: "",
    backupDate: true,
    fillValue: "00",
    errorLevel: 0,
	errorNumber: false,
	lowercaseHex: false,
    suppressWarnings: false,
    quietOperation: false,
    verboseOperation: false
};

let assemblerFolder: string;
let assemblerPath: string;
let compilerName: string;
const outputChannel = window.createOutputChannel("The Macroassembler AS");

const extensionId = "clcxce.motorola-68k-assembly";
const streamPipeline = promisify(pipeline);

if (!extensions.getExtension(extensionId)) {
	window.showWarningMessage(`The extension "${extensionId}" is not installed. Its installation is recommended for text highlighting.`);
}

function executeAssemblyCommand(): number {
	if (!existsSync(extensionSettings.mainName)) {
		window.showErrorMessage(`The main source code is missing. Name it to "${extensionSettings.mainName}", or change it through the settings.`);
		return -1;
	}

	outputChannel.clear();

	let command = `"${assemblerPath}" "${extensionSettings.mainName}" -o "${join(assemblerFolder, "rom.p")}" -A`;

	if (extensionSettings.listingFile) {
		command += 'L';
	}

	if (extensionSettings.caseSensitive) {
		command += 'U';
	}

	command += 'x'.repeat(extensionSettings.errorLevel);

	if (extensionSettings.errorNumber) {
		command += 'n';
	}

	if (extensionSettings.lowercaseHex) {
		command += 'h';
	}

	if (extensionSettings.suppressWarnings) {
		command += 'w';
	}

	if (extensionSettings.quietOperation) {
		command += 'q';
	}

	if (extensionSettings.listingName !== "") {
		command += " -olist " + extensionSettings.listingName + ".lst";
	}

	if (extensionSettings.errorFile) {
		let name = "";
		if (extensionSettings.errorName !== "") {
			name = extensionSettings.errorName + ".log";
		}
		command += " -E " + name;
	}

	try {
		const output = spawnSync(command, { encoding: 'ascii', shell: true });

		if (!extensionSettings.quietOperation) {
			outputChannel.append(output.stdout);
		}

		if (extensionSettings.verboseOperation) {
			outputChannel.show();
		}

		if (output.stderr === "" || extensionSettings.suppressWarnings) {
			return 0;
		} else {
			outputChannel.appendLine("\n==================== ASSEMBLER WARNING ====================\n");
			outputChannel.append(output.stderr);
			return 1;
		}
	}
	catch (error: any) {
		if (!extensionSettings.quietOperation) {
			outputChannel.append(error.stdout + '\n');
		}

		let errorLocation = "log file";

		if (!extensionSettings.errorFile) {
			outputChannel.appendLine("==================== ASSEMBLER ERROR ====================\n");
			outputChannel.append(error.stderr);
			outputChannel.show();
			errorLocation = "terminal";
		}

		switch (error.status) {
			case 2:
				window.showErrorMessage(`Build failed. An error was thrown by the assembler. Check the ${errorLocation} for more details.`);
				break;

			case 3:
				window.showErrorMessage(`Build failed. A fatal was thrown by the assembler. Check the ${errorLocation} for more details.`);
				break;

			default:
				window.showErrorMessage("The assembler has thrown an unknown error. Check the terminal for more details.");
				break;
		}

		return -1;
	}
}

// Executes a program synchronously, returns true if successful, false if an error occurred
function executeCompileCommand(): boolean {
	let command = `"${compilerName}" rom.p -l 0x${extensionSettings.fillValue} -k`;

	if (extensionSettings.quietOperation) {
		command += 'q';
	}

	process.chdir(assemblerFolder);

	try {
		const output = execSync(command, { encoding: 'ascii' });

		if (!extensionSettings.quietOperation) {
			outputChannel.append('\n' + output);
		}

		return true;
	}
	catch (error: any) {
		if (!extensionSettings.quietOperation) {
			outputChannel.append(error.stdout + '\n');
		}

		outputChannel.appendLine("==================== COMPILER ERROR ====================\n");
		outputChannel.append(error.stderr);

		window.showErrorMessage("The compiler has thrown an unknown error. Check the terminal for more details.");

		return false;
	}
}

function assembleROM() {
	if (!workspace.workspaceFolders) {
		window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
		return;
	}

	const projectFolder = workspace.workspaceFolders[0].uri.fsPath;

	process.chdir(projectFolder);

	let warnings = false;

	switch (executeAssemblyCommand()) {
		case 1:
			warnings = true;
			break;
		case -1:
			return;
		default:
			break;
	}

	const files = readdirSync('.'); // Reads all files and folders and put them into a string array

	// Checks if there are any files that have the .gen extension. If so, it gets renamed with .pre and a number
	for (const checkName of files) {
		if (!checkName.endsWith(".gen")) { continue; } // Indentantions are less clean

		if (!extensionSettings.prevRoms) {
			unlinkSync(checkName);
			break;
		}

		// Collects all .pre<number> files
		const preFiles = files
		.filter(f => /\.pre(\d+)$/.test(f)) // Get .pre files
		.map(f => ({
			name: f,
			index: parseInt(f.match(/\.pre(\d+)$/)![1], 10)
		})); // Assigns an index to it

		let number = 0; // Index

		if (preFiles.length > 0) {
			const latest = Math.max(...preFiles.map(f => f.index));
			const oldest = preFiles.reduce((min, curr) => curr.index < min.index ? curr : min);

			// Enforce limit
			if (extensionSettings.prevAmount !== 0 && latest >= extensionSettings.prevAmount - 1) {
				window.showInformationMessage(`Limit of previous ROMs reached. Replacing the oldest version "${oldest.name}".`);
				unlinkSync(oldest.name);
				number = oldest.index; // Reuse the index
			} else {
				number = latest + 1;
			}
		}

		const newName = checkName.replace(/\.gen$/, `.pre${number}`);
		rename(checkName, newName, (error) => {
			if (error) {
				window.showWarningMessage(`Could not rename the previous ROM. Please manually rename it to "${newName}".`);
			} else {
				window.showInformationMessage(`Latest build exists. Renamed to "${newName}".`);
			}
		});

		break;
	}


	if (!executeCompileCommand()) {
		return;
	}

	renameRom(projectFolder, warnings);
}

function renameRom(projectFolder: string, warnings: boolean) {
	const currentDate = new Date();
	const hours = currentDate.getHours().toString().padStart(2, '0');
	const minutes = currentDate.getMinutes().toString().padStart(2, '0');
	const seconds = currentDate.getSeconds().toString().padStart(2, '0');

	let fileName: string;

	if (extensionSettings.romName === "") {
		const lastDot = extensionSettings.mainName.lastIndexOf('.');
		fileName = lastDot !== -1 ? extensionSettings.mainName.substring(0, lastDot) : extensionSettings.mainName;
	} else {
		fileName = extensionSettings.romName;
	}

	if (extensionSettings.romDate) {
		fileName += `_${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}_${hours}.${minutes}.${seconds}`;
	}

	// Renames and moves the rom.bin file outside assemblerFolder since p2bin doesn't have a switch to change the output file name for some reason
	rename("rom.bin", `${join(projectFolder, fileName)}.gen`, (error) => {
		if (error) {
			if (error?.code !== "ENOENT") {
				window.showWarningMessage(`Could not rename your ROM, try to take it from "${assemblerFolder}" if it exists. ${error}`);
			} else {
				window.showErrorMessage("Cannot rename your ROM, there might be a problem with the compiler. " + error);
			}
		}
	});

	if (!warnings) {
		window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}. (Hurray!)`);
	} else {
		window.showWarningMessage(`Build succeded with warnings at ${hours}:${minutes}:${seconds}.`);
	}
}

function findAndRunROM(systemVariable: string) {
	if (!workspace.workspaceFolders) {
		window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
		return;
	}

	process.chdir(workspace.workspaceFolders[0].uri.fsPath);

	const files = readdirSync('.');
	const rom = files.find(file => file.endsWith(".gen"));

	if (rom) {
		exec(`"${systemVariable}" "${rom}"`, (error) => {
			if (error) {
				window.showErrorMessage("Cannot run the latest build. " + error.message);
				return;
			}

			window.showInformationMessage(`Running "${rom}" with BlastEm.`);
		});
	} else {
		window.showErrorMessage("There are no ROMs to run. Build something first.");
	}
}

function runTemporaryROM(systemVariable: string) {
	if (!workspace.workspaceFolders) {
		window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
		return;
	}

	process.chdir(workspace.workspaceFolders[0].uri.fsPath);

	if (!existsSync(extensionSettings.mainName)) {
		window.showErrorMessage(`The main source code is missing. Name it to "${extensionSettings.mainName}."`);
		return false;
	}

	outputChannel.clear();

	if (!executeAssemblyCommand()) {
		return;
	}
	
	if (!executeCompileCommand()) {
		return;
	}

	exec(`"${systemVariable}" ${join(assemblerFolder, "rom.bin")}`, (error) => {
		if (error) {
			window.showErrorMessage("Cannot run the build. " + error);
		}

		unlink(join(assemblerFolder, "rom.p"), (error) => {
			window.showErrorMessage("Could not delete the temporary ROM for cleanup. You may want to do this by yourself. " + error);
		});
	});

	const currentDate = new Date();
	window.showInformationMessage(`Build succeded at ${currentDate.getHours().toString().padStart(2, '0')}:${currentDate.getMinutes().toString().padStart(2, '0')}:${currentDate.getSeconds().toString().padStart(2, '0')}, running it with BlastEm. (Hurray!)`);
}

function cleanProjectFolder() {
	let items = 0;

	readdirSync('.').forEach((item) => {
		if (item.endsWith(".gen") || item.includes(".pre") || item.endsWith(".lst") || item.endsWith(".log")) {
			unlinkSync(item);
			items++;
		}
	});

	window.showInformationMessage(`Cleanup completed. ${items} items were removed.`);
}

// This method is called when the extension is activated
// An extension is activated the very first time the command is executed
export async function activate(context: ExtensionContext) {
	const config = workspace.getConfiguration('megaenvironment');

	for (const setting of settingDescriptors) {
		const value = config.get(setting.key);
		(extensionSettings as any)[setting.target] = value;
	}

	assemblerFolder = context.globalStorageUri.fsPath;
	assemblerPath = join(assemblerFolder, "asl");
	compilerName = join(assemblerFolder, "p2bin");

	let zipName: string;
	const proc = process;

	switch (proc.platform) {
		case 'win32':
			zipName = "windows-x86.zip";
			assemblerPath += ".exe";
			compilerName += ".exe";
			break;
		case 'darwin':
			if (proc.arch === 'x64') {
				zipName = "mac-x86_64.zip";
			} else {
				zipName = "mac-arm64.zip";
			}
			break;
		case 'linux':
			if (proc.arch === 'x64') {
				zipName = "linux-x86_64.zip";
			} else {
				zipName = "linux-arm64.zip";
			}
			return;
		default:
			window.showErrorMessage("What platform is this? Please, let me know which operative system you're running VS Code on!");
			return;
	}

	window.showInformationMessage("Downloading the latest tools...");

	if (existsSync(assemblerFolder)) {
		rmSync(assemblerFolder, { recursive: true, force: true });
	}

	mkdirSync(assemblerFolder, { recursive: true });

	process.chdir(assemblerFolder);

	const zipPath = join('.', zipName);

	const response = await fetch("https://github.com/Franklin0770/AS-releases/releases/download/latest/" + zipName);

	const fileStream = createWriteStream(zipPath);

	if (!response.ok || !response.body) {
		window.showErrorMessage("Failed to download the latest AS compiler. " + response.statusText);
		return;
	}

	await streamPipeline(response.body, fileStream);

	const zip = new AdmZip(zipPath);

	for (const entry of zip.getEntries()) {
		const path = join('.', entry.entryName);
		// Remove the first folder from the path
		writeFileSync(path, entry.getData());

		if (process.platform !== 'win32') {
			chmodSync(path, 0o755); // Get permissions (rwx) for Unix-based systems
		}
	}

	unlinkSync(zipPath);

	//
	//	Commands
	//

	const assemble = commands.registerCommand('megaenvironment.assemble', () => {
		assembleROM();
	});

	const clean_and_assemble = commands.registerCommand('megaenvironment.clean_assemble', () => {
		if (!workspace.workspaceFolders) {
			window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
			return;
		}

		const projectFolder = workspace.workspaceFolders[0].uri.fsPath; // Get the full path to the currently opened folder

		process.chdir(projectFolder);

		cleanProjectFolder();

		let warnings = false;

		switch (executeAssemblyCommand()) {
		case 1:
			warnings = true;
			break;
		case -1:
			return;
		default:
			break;
		}

		if (!executeCompileCommand()) {
			return;
		}

		renameRom(projectFolder, warnings);
	});

	const run_BlastEm = commands.registerCommand('megaenvironment.run_blastem', () => {
		if (process.platform !== 'win32') {
			window.showErrorMessage("This command is not supported in your platform. BlastEm is only available for Windows, unfortunately.");
			return;
		}

		const systemVariable = process.env.BlastEm;

		// Throws an error if the BlastEm variable is missing or not set up correctly
		if (systemVariable === undefined || !systemVariable.endsWith("blastem.exe")) {
			window.showErrorMessage("You haven't set up the \"BlastEm\" environment variable correctly. You must set this variable to the \"blastem.exe\" executable. The current variable value is: " + systemVariable);
			return;
		}

		findAndRunROM(systemVariable);
	});

	const run_Regen = commands.registerCommand('megaenvironment.run_regen', () => {
		if (process.platform !== 'win32') {
			window.showErrorMessage("This command is not supported in your platform. Regen is only available for Windows, unfortunately.");
			return;
		}

		const systemVariable = process.env.Regen;

		// Throws an error if the Regen variable is missing or not set up correctly
		if (systemVariable === undefined || !systemVariable.endsWith("Regen.exe")) {
			window.showErrorMessage("You haven't set up the \"Regen\" environment variable correctly. You must set this variable to the \"Regen.exe\" executable. The current variable value is: " + systemVariable);
			return;
		}

		findAndRunROM(systemVariable);
	});

	const assemble_and_run_BlastEm = commands.registerCommand("megaenvironment.assemble_run_blastem", () => {
		if (process.platform !== 'win32') {
			window.showErrorMessage("This command is not supported in your platform. BlastEm is only available for Windows, unfortunately.");
			return;
		}
		
		const systemVariable = process.env.BlastEm;

		// Throws an error if the BlastEm variable is missing or not set up correctly
		if (systemVariable === undefined || !systemVariable.endsWith("blastem.exe")) {
			window.showErrorMessage("You haven't set up the \"BlastEm\" environment variable correctly. You must set this variable to the \"blastem.exe\" executable. The current variable value is: " + systemVariable);
			return;
		}
		
		runTemporaryROM(systemVariable);
	});

	const assemble_and_run_Regen = commands.registerCommand("megaenvironment.assemble_run_regen", () => {
		if (process.platform !== 'win32') {
			window.showErrorMessage("This command is not supported in your platform. Regen is only available for Windows, unfortunately.");
			return;
		}

		const systemVariable = process.env.Regen;

		// Throws an error if the BlastEm variable is missing or not set up correctly
		if (systemVariable === undefined || !systemVariable.endsWith("Regen.exe")) {
			window.showErrorMessage("You haven't set up the \"Regen\" environment variable correctly. You must set this variable to the \"Regen.exe\" executable. The current variable value is: " + systemVariable);
			return;
		}
		
		runTemporaryROM(systemVariable);
	});

	const open_EASy68k = commands.registerCommand("megaenvironment.open_easy68k", () => {
		if (process.platform !== 'win32') {
			window.showErrorMessage("This command is not supported in your platform. EASy68k is only available for Windows, unfortunately.");
			return;
		}

		if (!workspace.workspaceFolders) {
			window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
			return;
		}

		const projectFolder = workspace.workspaceFolders[0].uri.fsPath;

		const systemVariable = process.env.EASy68k;

		if (systemVariable === undefined || !systemVariable.endsWith("EDIT68K.exe")) {
			window.showErrorMessage("You haven't set up the \"EASy68k\" environment variable correctly. You must set this variable to the \"EDIT68K.exe\" executable. The current variable value is: " + systemVariable);
			return;
		}

		process.chdir(assemblerFolder);

		const editor = window.activeTextEditor;
		let selectedText;

		if (editor) {
			selectedText = editor.document.getText(editor.selection);
		} else {
			window.showErrorMessage("You don't have an opened editor.");
			return;
		}

		if (selectedText === "") {
			window.showWarningMessage("You haven't selected any text field. To make sure you want to debug a portion of your code, select the text you want to analyze.");
		}

		let text: string;
		const constantsLocation = join("..", extensionSettings.constantsName);
		const variablesLocation = join("..", extensionSettings.variablesName);
		let constantsExists = false;
		let variablesExists = false;

		if (existsSync(constantsLocation)) {
			constantsExists = true;
		}

		if (existsSync(variablesLocation)) {
			variablesExists = true;
		}

		if (constantsExists && variablesExists) {
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n\torg\t$FF0000\n\n; Variables\n\n${readFileSync(variablesLocation)}\n\n; Constants\n\n${readFileSync(constantsLocation)}\n\n\tend\tstart`;
		} else if (constantsExists) {
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n; Constants\n\n${readFileSync(constantsLocation)}\n\n\torg\t$FF0000\n\n\tend\tstart`;
		} else if (variablesExists) {
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\norg\t$FF0000\n\n; Variables${readFileSync(variablesLocation)}\n\n\tend\tstart`;
		} else {
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n\tend\tstart`;
		}

		try {
			workspace.fs.writeFile(Uri.file("temp.txt"), new TextEncoder().encode(text));
		}
		catch (error: any) {
			window.showErrorMessage("Unable to create file for testing. " + error);
			return;
		}

		window.showInformationMessage("Debugging your current selection with EASy68k.");

		exec(`"${systemVariable}" "temp.txt"`, (error) => {
			if (error) {
				window.showErrorMessage("Cannot run EASy68k for testing. " + error);
			}

			readdirSync(assemblerFolder).forEach((file) => {
				if (file !== assemblerPath && file !== compilerName) {
					unlink(file, (error) => {
						if (error) {
							window.showWarningMessage(`Could not remove "${file}" for cleanup. You may want to do this by yourself. ${error}`);
						}
					});
				}
			});

			process.chdir(projectFolder);
		});
	});

	const backup = commands.registerCommand("megaenvironment.backup", () => {
		if (!workspace.workspaceFolders) {
			window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
			return;
		}

		process.chdir(workspace.workspaceFolders[0].uri.fsPath); // Change current working folder to the project one

		const zip = new AdmZip(); // Create zip archive reference
		const items = readdirSync('.'); // Read all content in the project folder

		if (!existsSync("Backups")) {
			window.showInformationMessage("No \"Backups\" folder found. Fixing.");
			mkdirSync("Backups");
		} else {
			items.splice(items.indexOf("Backups"), 1); // Remove Backups folder
		}

		let files = 0;

		items.forEach((item) => {
			zip.addLocalFile(item);

			if (item.endsWith(".gen") || item.includes(".pre") || item.endsWith(".lst") || item.endsWith(".log")) {
				unlink(item, (error) => {
					if (error) {
						window.showWarningMessage(`Could not remove "${item}" for cleanup. You may want to do this by yourself. ${error}`);
					}
				});
			}

			files++;
		});

		const currentDate = new Date();

		let fileName = extensionSettings.backupName === "" ? "Backup" : extensionSettings.backupName;

		if (extensionSettings.backupDate) {
			fileName += `_${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}_${currentDate.getHours().toString().padStart(2, '0')}.${currentDate.getMinutes().toString().padStart(2, '0')}.${currentDate.getSeconds().toString().padStart(2, '0')}`; // I am aware that this line is extraordinarily long
		}

		zip.writeZip(join("Backups", `${fileName}.zip`));
		window.showInformationMessage(`${files} files were backed up successfully.`);
	});

	const cleanup = commands.registerCommand("megaenvironment.cleanup", () => {
		if (!workspace.workspaceFolders) {
			window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
			return;
		}

		process.chdir(workspace.workspaceFolders[0].uri.fsPath);

		cleanProjectFolder();
	});

	context.subscriptions.push(assemble, clean_and_assemble, run_BlastEm, run_Regen, assemble_and_run_BlastEm, assemble_and_run_Regen, backup, cleanup, open_EASy68k);
}

const settingDescriptors = [
    { key: 'buildControl.outputRomName',				target: 'romName' },
    { key: 'buildControl.includeRomDate',				target: 'romDate' },
    { key: 'buildControl.enablePreviousBuilds',			target: 'prevRoms' },
    { key: 'buildControl.previousRomsAmount',			target: 'prevAmount' },
    { key: 'sourceCodeControl.mainFileName',   			target: 'mainName' },
    { key: 'sourceCodeControl.constantsFileName',		target: 'constantsName' },
    { key: 'sourceCodeControl.variablesFileName',		target: 'variablesName' },
    { key: 'sourceCodeControl.generateCodeListing',		target: 'listingFile' },
    { key: 'sourceCodeControl.listingFileName',			target: 'listingName' },
	{ key: 'sourceCodeControl.generateErrorListing',	target: 'errorFile' },
	{ key: 'sourceCodeControl.errorFileName',			target: 'errorName' },
	{ key: 'sourceCodeControl.caseSensitiveMode',		target: 'caseSensitive' },
    { key: 'backupOptions.backupFileName',				target: 'backupName' },
    { key: 'backupOptions.includeBackupDate',			target: 'backupDate' },
    { key: 'miscellaneous.fillValue',					target: 'fillValue' },
    { key: 'miscellaneous.errorLevel',					target: 'errorLevel' },
	{ key: 'miscellaneous.displayErrorNumber',			target: 'errorNumber'},
	{ key: 'miscellaneous.lowercaseHexadecimal',		target: 'lowercaseHex'},
    { key: 'miscellaneous.suppressWarnings',			target: 'suppressWarnings' },
    { key: 'miscellaneous.quietOperation',				target: 'quietOperation' },
    { key: 'miscellaneous.verboseOperation',			target: 'verboseOperation' }
];

workspace.onDidChangeConfiguration((event) => {
	if (event.affectsConfiguration('megaenvironment')) {
		const config = workspace.getConfiguration('megaenvironment'); // "megaenvironment" with the double quotes doesn't work, what?

		for (const setting of settingDescriptors) {
			if (event.affectsConfiguration(`megaenvironment.${setting.key}`)) {
				const value = config.get(setting.key);
        		(extensionSettings as any)[setting.target] = value;
			}
		}
	}
});