/*
TODOS:
- Maybe some asyncing; (Done!)
- Maybe some classes for encapsulation.
*/

import { ExtensionContext, extensions, workspace, commands, window, Uri } from 'vscode';
import { exec, execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rename, unlink, createWriteStream, chmodSync, unlinkSync } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { join } from 'path';
import AdmZip from 'adm-zip';

let romName: string;
let romDate: boolean;
let prevRoms: boolean;
let prevAmount: number;
let mainName: string;
let constantsName: string;
let variablesName: string;
let listingFile: boolean;
let listingName: string;
let backupName: string;
let backupDate: boolean;
let fillValue: string;
let errorLevel: number;
let suppressWarnings: boolean;
let quietOperation: boolean;
let verboseOperation: boolean;

let assemblerFolder: string;
let assemblerPath: string;
let compilerName: string;
const outputChannel = window.createOutputChannel("The Macro Assembler AS");

const extensionId = "clcxce.motorola-68k-assembly";
const streamPipeline = promisify(pipeline);

if (!extensions.getExtension(extensionId)) {
	window.showWarningMessage(`The extension "${extensionId}" is not installed. Its installation is recommended for text highlighting.`);
}

function executeAssemblyCommand(): boolean {
	if (!existsSync(mainName)) {
		window.showErrorMessage(`The main source code is missing. Name it to "${mainName}"`);
		return false;
	}

	outputChannel.clear();

	let command = `"${assemblerPath}" "${mainName}" -o "${join(assemblerFolder, "rom.p")}" -AU`;

	if (listingFile) {
		command += 'L';
	}

	for (let i = errorLevel; i > 0; i--) {
		command += 'x';
	}

	if (suppressWarnings) {
		command += 'w';
	}

	if (quietOperation) {
		command += 'q';
	}

	if (listingName !== "") {
		command += " -olist " + listingName + ".lst";
	}

	try {
		const output = execSync(command, { encoding: 'ascii' });

		if (!quietOperation) {
			outputChannel.append(output);
		}

		if (verboseOperation) {
			outputChannel.show();
		}

		return true;
	}
	catch (error: any) {
		if (!quietOperation) {
			outputChannel.append(error.stdout + '\n');
		}
		outputChannel.appendLine("==================== ASSEMBLER ERROR ====================\n");
		outputChannel.append(error.stderr);
		outputChannel.show();

		switch (error.status) {
			case 2:
				window.showErrorMessage("Build failed. An assembly error was thrown by the assembler. Check the terminal for more details."); // This happens in case the assembler gets an error
				break;

			case 3:
				window.showErrorMessage("Build failed. A user error was thrown by the assembler. Check the terminal for more details.");
				break;

			default:
				window.showErrorMessage("The assembler has thrown an unknown error. Check the terminal for more details.");
				break;
		}

		return false;
	}
}

// Executes a program synchronously, returns true if successful, false if an error occurred
function executeCompileCommand(): boolean {
	let command = `"${compilerName}" rom.p -l 0x${fillValue} -k`;

	if (quietOperation) {
		command += 'q';
	}

	process.chdir(assemblerFolder);

	try {
		const output = execSync(command, { encoding: 'ascii' });

		if (!quietOperation) {
			outputChannel.append(output);
		}

		return true;
	}
	catch (error: any) {
		if (!quietOperation) {
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

	if (!executeAssemblyCommand()) {
		return; // Hate this
	}

	const files = readdirSync('.'); // Reads all files and folders and put them into a string array

	// Checks if there are any files that have the .gen extension. If so, it gets renamed with .pre and a number
	for (const checkName of files) {
		if (checkName.endsWith(".gen")) {
			if (!prevRoms) {
				unlinkSync(checkName);
				break;
			}

			// Collects all .pre<number> files
			const preFiles = files
				.filter(f => /^.*\.pre\d+$/.test(f)) // Gets all the previous ROMs
				.map(f => ({
					name: f, // References the name with "f"
					index: parseInt(f.match(/\.pre(\d+)$/)?.[1] || '0', 10) // Adds an index property
				})) // Gets the way to sort files
				.sort((a, b) => a.index - b.index); // Sorts them in numerical order

			// Determines the next available index
			let number = 0;
			if (preFiles.length > 0) {
				number = preFiles[preFiles.length - 1].index + 1;
			}

			// Enforces the limit
			if (prevAmount !== 0 && preFiles.length >= prevAmount) {
				const oldest = preFiles[0];
				window.showInformationMessage(`Limit of previous ROMs reached. Replacing the oldest version "${oldest.name}"`);
				unlinkSync(oldest.name);
				number = oldest.index; // Reuses the lowest available index
			}

			// Renames the file
			const newName = checkName.replace(/\.gen$/, `.pre${number}`); // Replace ".gen" extension with ".pre<number>"
			rename(checkName, newName, (error) => {
				if (error) {
					window.showWarningMessage(`Could not rename the previous ROM. To avoid conflicts, please rename it to "${newName}" manually.`);
				} else {
					window.showInformationMessage(`Renamed latest build to "${newName}".`);
				}
			});

			break;
		}
	}


	if (!executeCompileCommand()) {
		return;
	}

	renameRom(projectFolder);
}

function renameRom(projectFolder:string) {
	const currentDate = new Date();
	const hours = currentDate.getHours().toString().padStart(2, '0');
	const minutes = currentDate.getMinutes().toString().padStart(2, '0');
	const seconds = currentDate.getSeconds().toString().padStart(2, '0');

	let fileName: string;

	if (romName === "") {
		const lastDot = mainName.lastIndexOf('.');
		fileName = lastDot !== -1 ? mainName.substring(0, lastDot) : mainName;
	}
	else {
		fileName = romName;
	}

	if (romDate) {
		fileName += `_${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}_${hours}.${minutes}.${seconds}`;
	}

	// Renames and moves the rom.bin file outside assemblerFolder since p2bin doesn't have a switch to change the output file name for some reason
	rename("rom.bin", `${join(projectFolder, fileName)}.gen`, (error) => {
		if (error) {
			if (error?.code !== "ENOENT") {
				window.showWarningMessage(`Could not rename your ROM, try to take it from "${assemblerFolder}" if it exists. ${error}`);
			}
			else {
				window.showErrorMessage("Cannot rename your ROM, there might be a problem with the compiler. " + error);
			}
		}
	});

	window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}. (Hurray!)`);
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
	}
	else {
		window.showErrorMessage("There are no ROMs to run. Build something first.");
	}
}

function runTemporaryROM(systemVariable: string) {
	if (!workspace.workspaceFolders) {
		window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
		return;
	}

	process.chdir(workspace.workspaceFolders[0].uri.fsPath);

	if (!existsSync(mainName)) {
		window.showErrorMessage(`The main source code is missing. Name it to "${mainName}"`);
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

function cleanProjectFolder(): boolean {
	let success = true;
	let items = 0;

	readdirSync('.').forEach((item) => {
		if (item.endsWith(".gen") || item.includes(".pre") || item.endsWith(".lst")) {
			unlink(item, (error) => {
				if (error) {
					window.showWarningMessage(`Could not remove "${item}" for cleanup. You may want to do this by yourself. ${error}`);
					success = false;
				}

				items++;
			});
		}
	});

	window.showInformationMessage(`Cleanup completed. ${items} items were removed.`);

	return success;
}

// This method is called when the extension is activated
// An extension is activated the very first time the command is executed
export async function activate(context: ExtensionContext) {
	const config = workspace.getConfiguration('megaenvironment');
	romName = config.get<string>("buildControl.outputRomName", "");
	romDate = config.get<boolean>("buildControl.includeRomDate", true);
	prevRoms = config.get<boolean>("buildControl.enablePreviousBuilds", true);
	prevAmount = config.get<number>("buildControl.previousRomsAmount", 10);
	mainName = config.get<string>("sourceCodeControl.mainFileName", "Sonic.asm");
	constantsName = config.get<string>("sourceCodeControl.constantsFileName", "Constants.asm");
	variablesName = config.get<string>("sourceCodeControl.variablesFileName", "Variables.asm");
	listingFile = config.get<boolean>("sourceCodeControl.generateCodeListing", true);
	listingName = config.get<string>("sourceCodeControl.listingFileName", "");
	backupName = config.get<string>("backupOptions.backupFileName", "");
	backupDate = config.get<boolean>("backupOptions.includeBackupDate", true);
	fillValue = config.get<string>("miscellaneous.fillValue", "FF");
	errorLevel = config.get<number>("miscellaneous.errorLevel", 2);
	suppressWarnings = config.get<boolean>("miscellaneous.suppressWarnings", false);
	quietOperation = config.get<boolean>("miscellaneous.quietOperation", false);
	verboseOperation = config.get<boolean>("miscellaneous.verboseOperation", false);

	assemblerFolder = context.globalStorageUri.fsPath;
	assemblerPath = join(assemblerFolder, "asl");
	compilerName = join(assemblerFolder, "p2bin");

	if (!existsSync(assemblerFolder)) {
		let zipName: string;

		switch (process.platform) {
			case 'win32':
				zipName = "windows-x86.zip";
				assemblerPath += ".exe";
				compilerName += ".exe";
				break;
			case 'darwin':
				zipName = "mac-arm64.zip";
				break;
			case 'linux':
				window.showErrorMessage("Linux isn't supported yet. Sorry.");
				return;
			default:
				window.showErrorMessage("What platform is this? Please, let me know which operative system you're running VS Code on!");
				return;
		}

		window.showInformationMessage("Downloading the latest tools...");

		mkdirSync(assemblerFolder, { recursive: true });

		process.chdir(assemblerFolder);

		const url = "https://github.com/Franklin0770/AS-releases/releases/download/v1.42b_288/" + zipName;
		const zipPath = join('.', zipName);

		const response = await fetch(url);

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
	}

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

		if (!cleanProjectFolder()) {
			return;
		}

		if (!executeAssemblyCommand()) {
			return;
		}

		if (!executeCompileCommand()) {
			return;
		}

		renameRom(projectFolder);
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
		}
		else {
			window.showErrorMessage("You don't have an opened editor.");
			return;
		}

		if (selectedText === "") {
			window.showWarningMessage("You haven't selected any text field. To make sure you want to debug a portion of your code, select the text you want to analyze.");
		}

		let text: string;
		const constantsLocation = join("..", constantsName);
		const variablesLocation = join("..", variablesName);
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
		}
		else if (constantsExists) {
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n; Constants\n\n${readFileSync(constantsLocation)}\n\n\torg\t$FF0000\n\n\tend\tstart`;
		}
		else if (variablesExists) {
			text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\norg\t$FF0000\n\n; Variables${readFileSync(variablesLocation)}\n\n\tend\tstart`;
		}
		else {
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
		}
		else {
			items.splice(items.indexOf("Backups"), 1); // Remove Backups folder
		}

		let files = 0;

		items.forEach((item) => {
			zip.addLocalFile(item);

			if (item.endsWith(".gen") || item.includes(".pre") || item.endsWith(".lst")) {
				unlink(item, (error) => {
					if (error) {
						window.showWarningMessage(`Could not remove "${item}" for cleanup. You may want to do this by yourself. ${error}`);
					}
				});
			}

			files++;
		});

		const currentDate = new Date();

		let fileName = backupName === "" ? "Backup" : backupName;

		if (backupDate) {
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

workspace.onDidChangeConfiguration((event) => {
	const config = workspace.getConfiguration('megaenvironment'); // "megaenvironment" with the double quotes doesn't work, what?
	// You want to kick me I know
	if (event.affectsConfiguration("megaenvironment.buildControl.outputRomName")) {
		romName = config.get<string>("buildControl.outputRomName", "");
	}
	else if (event.affectsConfiguration("megaenvironment.buildControl.includeRomDate")) {
		romDate = config.get<boolean>("buildControl.includeRomDate", true);
	}
	else if (event.affectsConfiguration("megaenvironment.buildControl.enablePreviousBuilds")) {
		prevRoms = config.get<boolean>("buildControl.enablePreviousBuilds", true);
	}
	else if (event.affectsConfiguration("megaenvironment.buildControl.previousRomsAmount")) {
		prevAmount = config.get<number>("buildControl.previousRomsAmount", 10);
	}
	else if (event.affectsConfiguration("megaenvironment.sourceCodeControl.mainFileName")) {
		mainName = config.get<string>("sourceCodeControl.mainFileName", "Sonic.asm");
	}
	else if (event.affectsConfiguration("megaenvironment.sourceCodeControl.constantsFileName")) {
		constantsName = config.get<string>("sourceCodeControl.constantsFileName", "Constants.asm");
	}
	else if (event.affectsConfiguration("megaenvironment.sourceCodeControl.variablesFileName")) {
		variablesName = config.get<string>("sourceCodeControl.variablesFileName", "Variables.asm");
	}
	else if (event.affectsConfiguration("megaenvironment.sourceCodeControl.generateCodeListing")) {
		listingFile = config.get<boolean>("sourceCodeControl.generateCodeListing", true);
	}
	else if (event.affectsConfiguration("megaenvironment.sourceCodeControl.listingFileName")) {
		listingName = config.get<string>("sourceCodeControl.listingFileName", "");
	}
	else if (event.affectsConfiguration("megaenvironment.backupOptions.backupFileName")) {
		backupName = config.get<string>("backupOptions.backupFileName", "");
	}
	else if (event.affectsConfiguration("megaenvironment.backupOptions.includeBackupDate")) {
		backupDate = config.get<boolean>("backupOptions.includeBackupDate", true);
	}
	else if (event.affectsConfiguration("megaenvironment.miscellaneous.fillValue")) {
		fillValue = config.get<string>("miscellaneous.fillValue", "00");
	}
	else if (event.affectsConfiguration("megaenvironment.miscellaneous.errorLevel")) {
		errorLevel = config.get<number>("miscellaneous.errorLevel", 2);
	}
	else if (event.affectsConfiguration("megaenvironment.suppressWarnings")) {
		suppressWarnings = config.get<boolean>("suppressWarnings", false);
	}
	else if (event.affectsConfiguration("megaenvironment.quietOperation")) {
		quietOperation = config.get<boolean>("quietOperation", false);
	}
	else if (event.affectsConfiguration("megaenvironment.miscellaneous.verboseOperation")) {
		verboseOperation = config.get<boolean>("miscellaneous.verboseOperation", false);
	}
});