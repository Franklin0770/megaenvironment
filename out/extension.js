"use strict";
/*
TODOS:
- Maybe some asyncing; (Done!)
- Maybe some classes for encapsulation.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode_1 = require("vscode");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const stream_1 = require("stream");
const util_1 = require("util");
const path_1 = require("path");
const adm_zip_1 = __importDefault(require("adm-zip"));
let extensionSettings = {
    defaultCpu: "68000",
    superiorWarnings: false,
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
    debugFile: "None",
    sectionListing: false,
    macroListing: false,
    sourceListing: false,
    cleaningExtensions: [".gen", ".pre", ".lst", ".log", ".map", ".noi", ".obj", ".mac", ".i"],
    workingFolders: ['.'],
    caseSensitive: true,
    backupName: "",
    backupDate: true,
    fillValue: "00",
    errorLevel: 0,
    errorNumber: false,
    AsErrors: false,
    lowercaseHex: false,
    suppressWarnings: false,
    quietOperation: false,
    verboseOperation: false
};
let assemblerFolder;
let assemblerPath;
let compilerName;
const outputChannel = vscode_1.window.createOutputChannel("The Macroassembler AS");
const extensionId = "clcxce.motorola-68k-assembly";
const streamPipeline = (0, util_1.promisify)(stream_1.pipeline);
if (!vscode_1.extensions.getExtension(extensionId)) {
    vscode_1.window.showWarningMessage(`The extension "${extensionId}" is not installed. Its installation is recommended for text highlighting.`);
}
function executeAssemblyCommand() {
    if (!(0, fs_1.existsSync)(extensionSettings.mainName)) {
        vscode_1.window.showErrorMessage(`The main source code is missing. Name it to "${extensionSettings.mainName}", or change it through the settings.`);
        return -1;
    }
    outputChannel.clear();
    let command = `"${assemblerPath}" "${extensionSettings.mainName}" -o "${(0, path_1.join)(assemblerFolder, "rom.p")}" -A`;
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
    if (extensionSettings.sectionListing) {
        command += 's';
    }
    if (extensionSettings.macroListing) {
        command += 'M';
    }
    if (extensionSettings.sourceListing) {
        command += 'P';
    }
    if (!extensionSettings.superiorWarnings) {
        command += ' -supmode';
    }
    if (!extensionSettings.AsErrors) {
        command += ' -gnuerrors';
    }
    if (extensionSettings.listingName !== "") {
        command += ' -olist ' + extensionSettings.listingName + ".lst";
    }
    if (extensionSettings.errorFile) {
        if (extensionSettings.errorName !== "") {
            command += ' -E ' + extensionSettings.errorName + ".log";
        }
        else {
            command += ' -E';
        }
    }
    if (extensionSettings.debugFile !== 'None') {
        command += ' -g ' + extensionSettings.debugFile;
    }
    if (extensionSettings.defaultCpu !== '') {
        command += " -cpu " + extensionSettings.defaultCpu;
    }
    if (extensionSettings.workingFolders.length > 0) {
        command += ' -i ';
        for (let directory of extensionSettings.workingFolders) {
            command += `"${directory}";`;
        }
    }
    console.log(command);
    const output = (0, child_process_1.spawnSync)(command, { encoding: 'ascii', shell: true });
    if (output.status === 0) {
        if (!extensionSettings.quietOperation) {
            outputChannel.append(output.stdout);
        }
        if (extensionSettings.verboseOperation) {
            outputChannel.show();
        }
        if (output.stderr === "" || extensionSettings.suppressWarnings) {
            return 0;
        }
        else {
            outputChannel.appendLine("\n==================== ASSEMBLER WARNINGS ====================\n");
            outputChannel.appendLine(output.stderr);
            outputChannel.appendLine("============================================================");
            return 1;
        }
    }
    else {
        if (!extensionSettings.quietOperation) {
            outputChannel.append(output.stdout + '\n');
        }
        let errorLocation = "log file";
        if (!extensionSettings.errorFile) {
            outputChannel.appendLine("==================== ASSEMBLER ERROR ====================\n");
            outputChannel.append(output.stderr);
            outputChannel.show();
            errorLocation = "terminal";
        }
        switch (output.status) {
            case 2:
                vscode_1.window.showErrorMessage(`Build failed. An error was thrown by the assembler. Check the ${errorLocation} for more details.`);
                break;
            case 3:
                vscode_1.window.showErrorMessage(`Build failed. A fatal was thrown by the assembler. Check the ${errorLocation} for more details.`);
                break;
            default:
                vscode_1.window.showErrorMessage(`The assembler has thrown an unknown error. Check the ${errorLocation} for more details.`);
                break;
        }
        return -1;
    }
}
// Executes a program synchronously, returns true if successful, false if an error occurred
function executeCompileCommand() {
    let command = `"${compilerName}" rom.p -l 0x${extensionSettings.fillValue} -k`;
    if (extensionSettings.quietOperation) {
        command += 'q';
    }
    process.chdir(assemblerFolder);
    try {
        const output = (0, child_process_1.execSync)(command, { encoding: 'ascii' });
        if (!extensionSettings.quietOperation) {
            outputChannel.append('\n' + output);
        }
        return true;
    }
    catch (error) {
        if (!extensionSettings.quietOperation) {
            outputChannel.append(error.stdout + '\n');
        }
        outputChannel.appendLine("==================== COMPILER ERROR ====================\n");
        outputChannel.append(error.stderr);
        vscode_1.window.showErrorMessage("The compiler has thrown an unknown error. Check the terminal for more details.");
        return false;
    }
}
function assembleROM() {
    if (!vscode_1.workspace.workspaceFolders) {
        vscode_1.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
        return;
    }
    const projectFolder = vscode_1.workspace.workspaceFolders[0].uri.fsPath;
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
    const files = (0, fs_1.readdirSync)('.'); // Reads all files and folders and put them into a string array
    // Checks if there are any files that have the .gen extension. If so, it gets renamed with .pre and a number
    for (const checkName of files) {
        if (!checkName.endsWith(".gen")) {
            continue;
        } // Indentantions are less clean
        if (!extensionSettings.prevRoms) {
            (0, fs_1.unlinkSync)(checkName);
            break;
        }
        // Collects all .pre<number> files
        const preFiles = files
            .filter(f => /\.pre(\d+)$/.test(f)) // Get .pre files
            .map(f => ({
            name: f,
            index: parseInt(f.match(/\.pre(\d+)$/)[1], 10)
        })); // Assigns an index to it
        let number = 0; // Index
        if (preFiles.length > 0) {
            const latest = Math.max(...preFiles.map(f => f.index));
            const oldest = preFiles.reduce((min, curr) => curr.index < min.index ? curr : min);
            // Enforce limit
            if (extensionSettings.prevAmount !== 0 && latest >= extensionSettings.prevAmount - 1) {
                vscode_1.window.showInformationMessage(`Limit of previous ROMs reached. Replacing the oldest version "${oldest.name}".`);
                (0, fs_1.unlinkSync)(oldest.name);
                number = oldest.index; // Reuse the index
            }
            else {
                number = latest + 1;
            }
        }
        const newName = checkName.replace(/\.gen$/, `.pre${number}`);
        (0, fs_1.rename)(checkName, newName, (error) => {
            if (error) {
                vscode_1.window.showWarningMessage(`Could not rename the previous ROM. Please manually rename it to "${newName}".`);
            }
            else {
                vscode_1.window.showInformationMessage(`Latest build exists. Renamed to "${newName}".`);
            }
        });
        break;
    }
    if (!executeCompileCommand()) {
        return;
    }
    renameRom(projectFolder, warnings);
}
function renameRom(projectFolder, warnings) {
    const currentDate = new Date();
    const hours = currentDate.getHours().toString().padStart(2, '0');
    const minutes = currentDate.getMinutes().toString().padStart(2, '0');
    const seconds = currentDate.getSeconds().toString().padStart(2, '0');
    let fileName;
    if (extensionSettings.romName === "") {
        const lastDot = extensionSettings.mainName.lastIndexOf('.');
        fileName = lastDot !== -1 ? extensionSettings.mainName.substring(0, lastDot) : extensionSettings.mainName;
    }
    else {
        fileName = extensionSettings.romName;
    }
    if (extensionSettings.romDate) {
        fileName += `_${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}_${hours}.${minutes}.${seconds}`;
    }
    // Renames and moves the rom.bin file outside assemblerFolder since p2bin doesn't have a switch to change the output file name for some reason
    (0, fs_1.rename)("rom.bin", `${(0, path_1.join)(projectFolder, fileName)}.gen`, (error) => {
        if (error) {
            if (error?.code !== "ENOENT") {
                vscode_1.window.showWarningMessage(`Could not rename your ROM, try to take it from "${assemblerFolder}" if it exists. ${error}`);
            }
            else {
                vscode_1.window.showErrorMessage("Cannot rename your ROM, there might be a problem with the compiler. " + error);
            }
        }
    });
    if (!warnings) {
        vscode_1.window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}. (Hurray!)`);
    }
    else {
        vscode_1.window.showWarningMessage(`Build succeded with warnings at ${hours}:${minutes}:${seconds}.`);
    }
}
function findAndRunROM(systemVariable) {
    if (!vscode_1.workspace.workspaceFolders) {
        vscode_1.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
        return;
    }
    process.chdir(vscode_1.workspace.workspaceFolders[0].uri.fsPath);
    const files = (0, fs_1.readdirSync)('.');
    const rom = files.find(file => file.endsWith(".gen"));
    if (rom) {
        (0, child_process_1.exec)(`"${systemVariable}" "${rom}"`, (error) => {
            if (error) {
                vscode_1.window.showErrorMessage("Cannot run the latest build. " + error.message);
                return;
            }
            vscode_1.window.showInformationMessage(`Running "${rom}" with BlastEm.`);
        });
    }
    else {
        vscode_1.window.showErrorMessage("There are no ROMs to run. Build something first.");
    }
}
function runTemporaryROM(systemVariable) {
    if (!vscode_1.workspace.workspaceFolders) {
        vscode_1.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
        return;
    }
    process.chdir(vscode_1.workspace.workspaceFolders[0].uri.fsPath);
    if (!(0, fs_1.existsSync)(extensionSettings.mainName)) {
        vscode_1.window.showErrorMessage(`The main source code is missing. Name it to "${extensionSettings.mainName}."`);
        return false;
    }
    outputChannel.clear();
    if (!executeAssemblyCommand()) {
        return;
    }
    if (!executeCompileCommand()) {
        return;
    }
    (0, child_process_1.exec)(`"${systemVariable}" ${(0, path_1.join)(assemblerFolder, "rom.bin")}`, (error) => {
        if (error) {
            vscode_1.window.showErrorMessage("Cannot run the build. " + error);
        }
        (0, fs_1.unlink)((0, path_1.join)(assemblerFolder, "rom.p"), (error) => {
            vscode_1.window.showErrorMessage("Could not delete the temporary ROM for cleanup. You may want to do this by yourself. " + error);
        });
    });
    const currentDate = new Date();
    vscode_1.window.showInformationMessage(`Build succeded at ${currentDate.getHours().toString().padStart(2, '0')}:${currentDate.getMinutes().toString().padStart(2, '0')}:${currentDate.getSeconds().toString().padStart(2, '0')}, running it with BlastEm. (Hurray!)`);
}
function cleanProjectFolder() {
    let items = 0;
    (0, fs_1.readdirSync)('.').forEach((item) => {
        if (extensionSettings.cleaningExtensions.some(v => item.includes(v))) {
            (0, fs_1.unlinkSync)(item);
            items++;
        }
    });
    vscode_1.window.showInformationMessage(`Cleanup completed. ${items} items were removed.`);
}
// This method is called when the extension is activated
// An extension is activated the very first time the command is executed
async function activate(context) {
    const config = vscode_1.workspace.getConfiguration('megaenvironment');
    for (const setting of settingDescriptors) {
        const value = config.get(setting.key);
        extensionSettings[setting.target] = value;
    }
    assemblerFolder = context.globalStorageUri.fsPath;
    assemblerPath = (0, path_1.join)(assemblerFolder, "asl");
    compilerName = (0, path_1.join)(assemblerFolder, "p2bin");
    let zipName;
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
            }
            else {
                zipName = "mac-arm64.zip";
            }
            break;
        case 'linux':
            if (proc.arch === 'x64') {
                zipName = "linux-x86_64.zip";
            }
            else {
                zipName = "linux-arm64.zip";
            }
            return;
        default:
            vscode_1.window.showErrorMessage("What platform is this? Please, let me know which operative system you're running VS Code on!");
            return;
    }
    vscode_1.window.showInformationMessage("Downloading the latest tools...");
    if ((0, fs_1.existsSync)(assemblerFolder)) {
        (0, fs_1.rmSync)(assemblerFolder, { recursive: true, force: true });
    }
    (0, fs_1.mkdirSync)(assemblerFolder, { recursive: true });
    process.chdir(assemblerFolder);
    const zipPath = (0, path_1.join)('.', zipName);
    const response = await fetch("https://github.com/Franklin0770/AS-releases/releases/download/latest/" + zipName);
    const fileStream = (0, fs_1.createWriteStream)(zipPath);
    if (!response.ok || !response.body) {
        vscode_1.window.showErrorMessage("Failed to download the latest AS compiler. " + response.statusText);
        return;
    }
    await streamPipeline(response.body, fileStream);
    const zip = new adm_zip_1.default(zipPath);
    for (const entry of zip.getEntries()) {
        const path = (0, path_1.join)('.', entry.entryName);
        // Remove the first folder from the path
        (0, fs_1.writeFileSync)(path, entry.getData());
        if (process.platform !== 'win32') {
            (0, fs_1.chmodSync)(path, 0o755); // Get permissions (rwx) for Unix-based systems
        }
    }
    (0, fs_1.unlinkSync)(zipPath);
    //
    //	Commands
    //
    const assemble = vscode_1.commands.registerCommand('megaenvironment.assemble', () => {
        assembleROM();
    });
    const clean_and_assemble = vscode_1.commands.registerCommand('megaenvironment.clean_assemble', () => {
        if (!vscode_1.workspace.workspaceFolders) {
            vscode_1.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
            return;
        }
        const projectFolder = vscode_1.workspace.workspaceFolders[0].uri.fsPath; // Get the full path to the currently opened folder
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
    const run_BlastEm = vscode_1.commands.registerCommand('megaenvironment.run_blastem', () => {
        if (process.platform !== 'win32') {
            vscode_1.window.showErrorMessage("This command is not supported in your platform. BlastEm is only available for Windows, unfortunately.");
            return;
        }
        const systemVariable = process.env.BlastEm;
        // Throws an error if the BlastEm variable is missing or not set up correctly
        if (systemVariable === undefined || !systemVariable.endsWith("blastem.exe")) {
            vscode_1.window.showErrorMessage("You haven't set up the \"BlastEm\" environment variable correctly. You must set this variable to the \"blastem.exe\" executable. The current variable value is: " + systemVariable);
            return;
        }
        findAndRunROM(systemVariable);
    });
    const run_Regen = vscode_1.commands.registerCommand('megaenvironment.run_regen', () => {
        if (process.platform !== 'win32') {
            vscode_1.window.showErrorMessage("This command is not supported in your platform. Regen is only available for Windows, unfortunately.");
            return;
        }
        const systemVariable = process.env.Regen;
        // Throws an error if the Regen variable is missing or not set up correctly
        if (systemVariable === undefined || !systemVariable.endsWith("Regen.exe")) {
            vscode_1.window.showErrorMessage("You haven't set up the \"Regen\" environment variable correctly. You must set this variable to the \"Regen.exe\" executable. The current variable value is: " + systemVariable);
            return;
        }
        findAndRunROM(systemVariable);
    });
    const assemble_and_run_BlastEm = vscode_1.commands.registerCommand("megaenvironment.assemble_run_blastem", () => {
        if (process.platform !== 'win32') {
            vscode_1.window.showErrorMessage("This command is not supported in your platform. BlastEm is only available for Windows, unfortunately.");
            return;
        }
        const systemVariable = process.env.BlastEm;
        // Throws an error if the BlastEm variable is missing or not set up correctly
        if (systemVariable === undefined || !systemVariable.endsWith("blastem.exe")) {
            vscode_1.window.showErrorMessage("You haven't set up the \"BlastEm\" environment variable correctly. You must set this variable to the \"blastem.exe\" executable. The current variable value is: " + systemVariable);
            return;
        }
        runTemporaryROM(systemVariable);
    });
    const assemble_and_run_Regen = vscode_1.commands.registerCommand("megaenvironment.assemble_run_regen", () => {
        if (process.platform !== 'win32') {
            vscode_1.window.showErrorMessage("This command is not supported in your platform. Regen is only available for Windows, unfortunately.");
            return;
        }
        const systemVariable = process.env.Regen;
        // Throws an error if the BlastEm variable is missing or not set up correctly
        if (systemVariable === undefined || !systemVariable.endsWith("Regen.exe")) {
            vscode_1.window.showErrorMessage("You haven't set up the \"Regen\" environment variable correctly. You must set this variable to the \"Regen.exe\" executable. The current variable value is: " + systemVariable);
            return;
        }
        runTemporaryROM(systemVariable);
    });
    const open_EASy68k = vscode_1.commands.registerCommand("megaenvironment.open_easy68k", () => {
        if (process.platform !== 'win32') {
            vscode_1.window.showErrorMessage("This command is not supported in your platform. EASy68k is only available for Windows, unfortunately.");
            return;
        }
        if (!vscode_1.workspace.workspaceFolders) {
            vscode_1.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
            return;
        }
        const projectFolder = vscode_1.workspace.workspaceFolders[0].uri.fsPath;
        const systemVariable = process.env.EASy68k;
        if (systemVariable === undefined || !systemVariable.endsWith("EDIT68K.exe")) {
            vscode_1.window.showErrorMessage("You haven't set up the \"EASy68k\" environment variable correctly. You must set this variable to the \"EDIT68K.exe\" executable. The current variable value is: " + systemVariable);
            return;
        }
        process.chdir(assemblerFolder);
        const editor = vscode_1.window.activeTextEditor;
        let selectedText;
        if (editor) {
            selectedText = editor.document.getText(editor.selection);
        }
        else {
            vscode_1.window.showErrorMessage("You don't have an opened editor.");
            return;
        }
        if (selectedText === "") {
            vscode_1.window.showWarningMessage("You haven't selected any text field. To make sure you want to debug a portion of your code, select the text you want to analyze.");
        }
        let text;
        const constantsLocation = (0, path_1.join)("..", extensionSettings.constantsName);
        const variablesLocation = (0, path_1.join)("..", extensionSettings.variablesName);
        let constantsExists = false;
        let variablesExists = false;
        if ((0, fs_1.existsSync)(constantsLocation)) {
            constantsExists = true;
        }
        if ((0, fs_1.existsSync)(variablesLocation)) {
            variablesExists = true;
        }
        if (constantsExists && variablesExists) {
            text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n\torg\t$FF0000\n\n; Variables\n\n${(0, fs_1.readFileSync)(variablesLocation)}\n\n; Constants\n\n${(0, fs_1.readFileSync)(constantsLocation)}\n\n\tend\tstart`;
        }
        else if (constantsExists) {
            text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n; Constants\n\n${(0, fs_1.readFileSync)(constantsLocation)}\n\n\torg\t$FF0000\n\n\tend\tstart`;
        }
        else if (variablesExists) {
            text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\norg\t$FF0000\n\n; Variables${(0, fs_1.readFileSync)(variablesLocation)}\n\n\tend\tstart`;
        }
        else {
            text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n\tend\tstart`;
        }
        try {
            vscode_1.workspace.fs.writeFile(vscode_1.Uri.file("temp.txt"), new TextEncoder().encode(text));
        }
        catch (error) {
            vscode_1.window.showErrorMessage("Unable to create file for testing. " + error);
            return;
        }
        vscode_1.window.showInformationMessage("Debugging your current selection with EASy68k.");
        (0, child_process_1.exec)(`"${systemVariable}" "temp.txt"`, (error) => {
            if (error) {
                vscode_1.window.showErrorMessage("Cannot run EASy68k for testing. " + error);
            }
            (0, fs_1.readdirSync)(assemblerFolder).forEach((file) => {
                if (file !== assemblerPath && file !== compilerName) {
                    (0, fs_1.unlink)(file, (error) => {
                        if (error) {
                            vscode_1.window.showWarningMessage(`Could not remove "${file}" for cleanup. You may want to do this by yourself. ${error}`);
                        }
                    });
                }
            });
            process.chdir(projectFolder);
        });
    });
    const backup = vscode_1.commands.registerCommand("megaenvironment.backup", () => {
        if (!vscode_1.workspace.workspaceFolders) {
            vscode_1.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
            return;
        }
        process.chdir(vscode_1.workspace.workspaceFolders[0].uri.fsPath); // Change current working folder to the project one
        const zip = new adm_zip_1.default(); // Create zip archive reference
        const items = (0, fs_1.readdirSync)('.'); // Read all content in the project folder
        if (!(0, fs_1.existsSync)("Backups")) {
            vscode_1.window.showInformationMessage("No \"Backups\" folder found. Fixing.");
            (0, fs_1.mkdirSync)("Backups");
        }
        else {
            items.splice(items.indexOf("Backups"), 1); // Remove Backups folder
        }
        let files = 0;
        items.forEach((item) => {
            zip.addLocalFile(item);
            if (extensionSettings.cleaningExtensions.some(v => item.includes(v))) {
                (0, fs_1.unlink)(item, (error) => {
                    if (error) {
                        vscode_1.window.showWarningMessage(`Could not remove "${item}" for cleanup. You may want to do this by yourself. ${error}`);
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
        zip.writeZip((0, path_1.join)("Backups", `${fileName}.zip`));
        vscode_1.window.showInformationMessage(`${files} files were backed up successfully.`);
    });
    const cleanup = vscode_1.commands.registerCommand("megaenvironment.cleanup", () => {
        if (!vscode_1.workspace.workspaceFolders) {
            vscode_1.window.showErrorMessage("You have no opened projects. Please, open a folder containing the correct structure.");
            return;
        }
        process.chdir(vscode_1.workspace.workspaceFolders[0].uri.fsPath);
        cleanProjectFolder();
    });
    context.subscriptions.push(assemble, clean_and_assemble, run_BlastEm, run_Regen, assemble_and_run_BlastEm, assemble_and_run_Regen, backup, cleanup, open_EASy68k);
}
const settingDescriptors = [
    { key: 'codeOptions.defaultCPU', target: 'defaultCpu' },
    { key: 'codeOptions.superiorModeWarnings', target: 'superiorWarnings' },
    { key: 'buildControl.outputRomName', target: 'romName' },
    { key: 'buildControl.includeRomDate', target: 'romDate' },
    { key: 'buildControl.enablePreviousBuilds', target: 'prevRoms' },
    { key: 'buildControl.previousRomsAmount', target: 'prevAmount' },
    { key: 'sourceCodeControl.mainFileName', target: 'mainName' },
    { key: 'sourceCodeControl.constantsFileName', target: 'constantsName' },
    { key: 'sourceCodeControl.variablesFileName', target: 'variablesName' },
    { key: 'sourceCodeControl.generateCodeListing', target: 'listingFile' },
    { key: 'sourceCodeControl.listingFileName', target: 'listingName' },
    { key: 'sourceCodeControl.generateErrorListing', target: 'errorFile' },
    { key: 'sourceCodeControl.errorFileName', target: 'errorName' },
    { key: 'sourceCodeControl.generateDebugFile', target: 'debugFile' },
    { key: 'sourceCodeControl.generateSectionListing', target: 'sectionListing' },
    { key: 'sourceCodeControl.generateMacroListing', target: 'macroListing' },
    { key: 'sourceCodeControl.generateSourceListing', target: 'sourceListing' },
    { key: 'sourceCodeControl.cleaningExtensionSelector', target: 'cleaningExtensions' },
    { key: 'sourceCodeControl.currentWorkingFolders', target: 'workingFolders' },
    { key: 'sourceCodeControl.caseSensitiveMode', target: 'caseSensitive' },
    { key: 'backupOptions.backupFileName', target: 'backupName' },
    { key: 'backupOptions.includeBackupDate', target: 'backupDate' },
    { key: 'miscellaneous.fillValue', target: 'fillValue' },
    { key: 'miscellaneous.errorLevel', target: 'errorLevel' },
    { key: 'miscellaneous.displayErrorNumber', target: 'errorNumber' },
    { key: 'miscellaneous.AS-StyledErrors', target: 'AsErrors' },
    { key: 'miscellaneous.lowercaseHexadecimal', target: 'lowercaseHex' },
    { key: 'miscellaneous.suppressWarnings', target: 'suppressWarnings' },
    { key: 'miscellaneous.quietOperation', target: 'quietOperation' },
    { key: 'miscellaneous.verboseOperation', target: 'verboseOperation' }
];
vscode_1.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('megaenvironment')) {
        const config = vscode_1.workspace.getConfiguration('megaenvironment'); // "megaenvironment" with the double quotes doesn't work, what?
        for (const setting of settingDescriptors) {
            if (event.affectsConfiguration(`megaenvironment.${setting.key}`)) {
                const value = config.get(setting.key);
                extensionSettings[setting.target] = value;
            }
        }
    }
});
//# sourceMappingURL=extension.js.map