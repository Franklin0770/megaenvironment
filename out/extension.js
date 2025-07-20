"use strict";
/*
TODOS:
- Maybe some MORE asyncing;
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
const path_1 = require("path");
const adm_zip_1 = __importDefault(require("adm-zip"));
let extensionSettings = {
    defaultCpu: '68000',
    superiorWarnings: false,
    signWarning: false,
    jumpsWarning: false,
    romName: '',
    romDate: true,
    prevRoms: true,
    prevAmount: 10,
    sonicDisassembly: false,
    mainName: '',
    constantsName: '',
    variablesName: '',
    listingFile: true,
    listingName: '',
    errorFile: false,
    errorName: '',
    debugFile: 'None',
    sectionListing: false,
    macroListing: false,
    sourceListing: false,
    cleaningExtensions: ['.gen', '.pre', '.lst', '.log', '.map', '.noi', '.obj', '.mac', '.i'],
    workingFolders: ['.'],
    caseSensitive: true,
    backupName: '',
    backupDate: true,
    compactSymbols: true,
    fillValue: '00',
    errorLevel: 0,
    errorNumber: false,
    asErrors: false,
    lowercaseHex: false,
    compatibilityMode: false,
    suppressWarnings: false,
    quietOperation: false,
    verboseOperation: false,
    warningsAsErrors: false
};
const settingDescriptors = [
    { key: 'codeOptions.defaultCPU', target: 'defaultCpu' },
    { key: 'codeOptions.superiorModeWarnings', target: 'superiorWarnings' },
    { key: 'codeOptions.compatibilityMode', target: 'compatibilityMode' },
    { key: 'codeOptions.signExtensionWarning', target: 'signWarning' },
    { key: 'codeOptions.absoluteJumpsWarning', target: 'jumpsWarning' },
    { key: 'codeOptions.caseSensitiveMode', target: 'caseSensitive' },
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
    { key: 'backupOptions.backupFileName', target: 'backupName' },
    { key: 'backupOptions.includeBackupDate', target: 'backupDate' },
    { key: 'miscellaneous.fillValue', target: 'fillValue' },
    { key: 'miscellaneous.errorLevel', target: 'errorLevel' },
    { key: 'miscellaneous.displayErrorNumber', target: 'errorNumber' },
    { key: 'miscellaneous.AS-StyledErrors', target: 'AsErrors' },
    { key: 'miscellaneous.lowercaseHexadecimal', target: 'lowercaseHex' },
    { key: 'miscellaneous.suppressWarnings', target: 'suppressWarnings' },
    { key: 'miscellaneous.quietOperation', target: 'quietOperation' },
    { key: 'miscellaneous.verboseOperation', target: 'verboseOperation' },
    { key: 'miscellaneous.warningsAsErrors', target: 'warningsAsErrors' }
];
let assemblerFolder;
let assemblerPath;
let compilerPath;
let isDownloading;
let firstActivation = true;
const outputChannel = vscode_1.window.createOutputChannel('The Macroassembler AS');
async function downloadAssembler(assemblerType) {
    const windowsBinary = ['windows-x86', 'windows-x86_64'];
    const macOSx86Binary = ['mac-x86_64', 'mac-universal'];
    const macOSarm64Binary = ['mac-arm64', 'mac-universal'];
    let zipName;
    const proc = process;
    switch (proc.platform) {
        case 'win32':
            zipName = windowsBinary[assemblerType];
            break;
        case 'darwin':
            if (proc.arch === 'x64') {
                zipName = macOSx86Binary[assemblerType];
            }
            else {
                zipName = macOSarm64Binary[assemblerType];
            }
            break;
        case 'linux':
            if (proc.arch === 'x64') {
                zipName = 'linux-x86_64';
            }
            else {
                zipName = 'linux-arm64';
            }
            break;
        default:
            vscode_1.window.showErrorMessage("Hey, what platform is this? Please, let me know which operative system you're running VS Code on!");
            return false;
    }
    zipName += '.zip';
    const releaseTag = ['latest', 'v1.42b_212f'];
    let response;
    try {
        response = await fetch('https://github.com/Franklin0770/AS-releases/releases/download/' + releaseTag[assemblerType] + '/' + zipName);
    }
    catch {
        if ((0, fs_1.existsSync)(assemblerPath) && (0, fs_1.existsSync)(compilerPath)) {
            vscode_1.window.showWarningMessage("Internet connection is either missing or insufficient, we'll have to stick with what we have.");
            return true;
        }
        vscode_1.window.showErrorMessage("Failed to download the latest AS compiler. We can't proceed since there's no previously downloaded versions. Make sure you have a stable Internet connection.");
        return false;
    }
    if (!response.ok || !response.body) {
        if (response.status === 404) {
            if ((0, fs_1.existsSync)(assemblerPath) && (0, fs_1.existsSync)(compilerPath)) {
                vscode_1.window.showWarningMessage('Hmm, it appears the download source is deprecated and incorrect, we can stick with what we have, though. Try updating the extension, if possible.', 'Last Resort Guide')
                    .then(selection => {
                    if (selection === 'Last Resort Guide') {
                        throw new Error('[Not implemented yet]');
                    }
                });
                return true;
            }
            vscode_1.window.showErrorMessage("Unfortunately, the download source is deprecated and incorrect, and we may not proceed since there isn't a previously downloaded version in your system. If there aren't any available updates then sorry, I might have discontinued this extension!", 'Last Resort Guide!')
                .then(selection => {
                if (selection === 'Last Resort Guide!') {
                    throw new Error('[Not implemented yet]');
                }
            });
            return false;
        }
        vscode_1.window.showErrorMessage('Failed to download the latest AS compiler. ' + response.statusText);
        return false;
    }
    if (!(0, fs_1.existsSync)(assemblerFolder)) {
        (0, fs_1.mkdirSync)(assemblerFolder, { recursive: true });
    }
    proc.chdir(assemblerFolder);
    const zipPath = (0, path_1.join)(assemblerFolder, zipName);
    const fileStream = (0, fs_1.createWriteStream)(zipPath);
    await new Promise((resolve) => {
        (0, stream_1.pipeline)(response.body, fileStream, () => {
            resolve();
        });
    });
    let zip;
    try {
        zip = new adm_zip_1.default(zipPath);
    }
    catch {
        if ((0, fs_1.existsSync)(assemblerPath) && (0, fs_1.existsSync)(compilerPath)) {
            vscode_1.window.showWarningMessage('Hmm, it appears the download source is deprecated and incorrect, we can stick with what we have, though. Try updating the extension, if possible.', 'Last Resort Guide')
                .then(selection => {
                if (selection === 'Last Resort Guide') {
                    throw new Error('[Not implemented yet]');
                }
            });
            return true;
        }
        vscode_1.window.showErrorMessage("Unfortunately, the download source is deprecated and incorrect, and we may not proceed since there isn't a previously downloaded version in your system. If there aren't any available updates then sorry, I might have discontinued this extension!", 'Last Resort Guide!')
            .then(selection => {
            if (selection === 'Last Resort Guide!') {
                throw new Error('[Not implemented yet]');
            }
        });
        return false;
    }
    const entries = zip.getEntries();
    for (const entry of entries) {
        const filePath = (0, path_1.join)('.', entry.entryName);
        // Remove the first folder from the path
        (0, fs_1.writeFileSync)(filePath, entry.getData());
        if (proc.platform !== 'win32') {
            (0, fs_1.chmodSync)(filePath, 0o755); // Get permissions (rwx) for Unix-based systems
        }
    }
    (0, fs_1.unlink)(zipPath, (error) => {
        if (error) {
            vscode_1.window.showWarningMessage('Could not remove the temporary ZIP file located at ' + zipPath);
        }
    });
    firstActivation = false;
    return true;
}
async function promptEmulatorPath(emulator) {
    const config = vscode_1.workspace.getConfiguration('megaenvironment');
    const path = config.get(`paths.${emulator}`, '');
    if ((0, fs_1.existsSync)(path)) {
        return;
    }
    vscode_1.window.showWarningMessage(`The path you provided for ${emulator} is either missing or incorrect. Be sure to put it in the text box which just appeared!`);
    const input = await vscode_1.window.showInputBox({
        title: `Set ${emulator} Path`,
        prompt: 'Enter the full path to your emulator',
        placeHolder: path,
        ignoreFocusOut: true
    });
    await config.update(`paths.${emulator}`, input, true // true = global setting
    );
}
async function assemblerChecks() {
    if (!vscode_1.workspace.workspaceFolders) {
        vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
        return false;
    }
    if (isDownloading) {
        if (!firstActivation) {
            vscode_1.window.showInformationMessage('Hold on until your tools finished downloading!');
        }
        return new Promise((resolve) => {
            const check = () => {
                if (isDownloading) {
                    setTimeout(check, 200);
                }
                else {
                    resolve(true);
                }
            };
            check();
        });
    }
    return true;
}
function executeAssemblyCommand() {
    if (!(0, fs_1.existsSync)(extensionSettings.mainName)) {
        vscode_1.window.showErrorMessage(`The main source code is missing. Name it to "${extensionSettings.mainName}", or change it through the settings.`);
        return -1;
    }
    outputChannel.clear();
    let command = `"${assemblerPath}" "${extensionSettings.mainName}" -o "${(0, path_1.join)(assemblerFolder, "rom.p")}" -`;
    const shortFlags = [
        [extensionSettings.compactSymbols, 'A'],
        [extensionSettings.listingFile, 'L'],
        [extensionSettings.caseSensitive, 'U'],
        [!!extensionSettings.errorLevel, 'x'.repeat(extensionSettings.errorLevel)],
        [extensionSettings.errorNumber, 'n'],
        [extensionSettings.lowercaseHex, 'h'],
        [extensionSettings.suppressWarnings, 'w'],
        [extensionSettings.sectionListing, 's'],
        [extensionSettings.macroListing, 'M'],
        [extensionSettings.sourceListing, 'P'],
        [extensionSettings.warningsAsErrors, ' -Werror'],
        [!extensionSettings.asErrors, ' -gnuerrors'],
        [!extensionSettings.superiorWarnings, ' -supmode'],
        [extensionSettings.compatibilityMode, ' -compmode'],
        [extensionSettings.signWarning, ' -wsign-extension'],
        [extensionSettings.jumpsWarning, ' -wrelative']
    ];
    for (const [condition, flag] of shortFlags) {
        if (condition) {
            command += flag;
        }
    }
    if (extensionSettings.errorFile) {
        if (extensionSettings.errorName) {
            command += ' -E ' + extensionSettings.errorName + '.log';
        }
        else {
            command += ' -E';
        }
    }
    if (extensionSettings.debugFile !== 'None') {
        command += ' -g ' + extensionSettings.debugFile;
    }
    if (extensionSettings.defaultCpu) {
        command += ' -cpu ' + extensionSettings.defaultCpu;
    }
    if (extensionSettings.workingFolders.length > 0) {
        command += ' -i "' + extensionSettings.workingFolders.join('";"') + '"';
    }
    console.log(command);
    const output = (0, child_process_1.spawnSync)(command, { encoding: 'ascii', shell: true });
    if (output.status === 0) {
        outputChannel.append(output.stdout);
        if (extensionSettings.verboseOperation) {
            outputChannel.show();
        }
        if (output.stderr === '' || extensionSettings.suppressWarnings) {
            return 0;
        }
        else {
            outputChannel.appendLine('\n==================== ASSEMBLER WARNINGS ====================\n');
            outputChannel.appendLine(output.stderr);
            outputChannel.appendLine('============================================================');
            return 1;
        }
    }
    else {
        outputChannel.append(output.stdout + '\n');
        let errorLocation = 'log file';
        if (!extensionSettings.errorFile) {
            outputChannel.appendLine('==================== ASSEMBLER ERROR ====================\n');
            outputChannel.append(output.stderr);
            outputChannel.show();
            errorLocation = 'terminal';
        }
        switch (output.status) {
            case 2:
                vscode_1.window.showErrorMessage(`Build failed. An error was thrown by the assembler. Check the ${errorLocation} for more details.`);
                break;
            case 3:
                vscode_1.window.showErrorMessage(`Build failed. A fatal error was thrown by the assembler. Check the ${errorLocation} for more details.`);
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
    let command = `"${compilerPath}" rom.p -l 0x${extensionSettings.fillValue} -k`;
    process.chdir(assemblerFolder);
    try {
        const output = (0, child_process_1.execSync)(command, { encoding: 'ascii' });
        outputChannel.append('\n' + output);
        return true;
    }
    catch (error) {
        outputChannel.append(error.stdout + '\n');
        outputChannel.appendLine('==================== COMPILER ERROR ====================\n');
        outputChannel.append(error.stderr);
        vscode_1.window.showErrorMessage('The compiler has thrown an unknown error. Check the terminal for more details.');
        return false;
    }
}
async function assembleROM() {
    if (!(await assemblerChecks())) {
        return;
    }
    const projectFolder = vscode_1.workspace.workspaceFolders[0].uri.fsPath;
    process.chdir(projectFolder);
    let warnings = false;
    switch (executeAssemblyCommand()) {
        case 0:
            break;
        case 1:
            warnings = true;
            break;
        default:
            return;
    }
    const files = (0, fs_1.readdirSync)('.'); // Reads all files and folders and put them into a string array
    // Checks if there are any files that have the .gen extension. If so, it gets renamed with .pre and a number
    for (const checkName of files) {
        if (!checkName.endsWith('.gen')) {
            continue;
        } // Indentantions are less clean
        if (!extensionSettings.prevRoms) {
            (0, fs_1.unlink)(checkName, (error) => {
                if (error) {
                    vscode_1.window.showErrorMessage('Cannot remove the previous .gen ROM.');
                }
            });
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
                if (!extensionSettings.quietOperation) {
                    vscode_1.window.showInformationMessage(`Limit of previous ROMs reached. Replacing the oldest version "${oldest.name}".`);
                }
                (0, fs_1.unlink)(oldest.name, (error) => {
                    if (error) {
                        vscode_1.window.showErrorMessage('Unable to remove the oldest previous ROM.');
                    }
                });
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
            else if (!extensionSettings.quietOperation) {
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
    if (extensionSettings.romName === '') {
        const lastDot = extensionSettings.mainName.lastIndexOf('.');
        fileName = lastDot !== -1 ? extensionSettings.mainName.substring(0, lastDot) : extensionSettings.mainName;
    }
    else {
        fileName = extensionSettings.romName;
    }
    if (extensionSettings.romDate) {
        fileName += `_${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}_${hours}.${minutes}.${seconds}`;
    }
    // Renames and moves the rom.bin file outside assemblerFolder since P2BIN doesn't have a switch to change the output file name for some reason
    (0, fs_1.rename)('rom.bin', `${(0, path_1.join)(projectFolder, fileName)}.gen`, (error) => {
        if (error) {
            if (error?.code !== 'ENOENT') {
                vscode_1.window.showWarningMessage(`Could not rename your ROM, try to take it from "${assemblerFolder}" if it exists. ${error.message}`);
            }
            else {
                vscode_1.window.showErrorMessage('Cannot rename your ROM, there might be a problem with the compiler. ' + error.message);
            }
        }
    });
    if (!warnings) {
        if (extensionSettings.quietOperation) {
            return;
        }
        vscode_1.window.showInformationMessage(`Build succeded at ${hours}:${minutes}:${seconds}. (Hurray!)`);
    }
    else {
        vscode_1.window.showWarningMessage(`Build succeded with warnings at ${hours}:${minutes}:${seconds}.`, 'Show Terminal')
            .then(selection => {
            if (selection === 'Show Terminal') {
                outputChannel.show();
            }
        });
    }
}
async function findAndRunROM(emulator) {
    if (!vscode_1.workspace.workspaceFolders) {
        vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
        return;
    }
    await promptEmulatorPath(emulator);
    const projectFolder = vscode_1.workspace.workspaceFolders[0].uri.fsPath;
    process.chdir(projectFolder);
    const rom = (0, fs_1.readdirSync)('.').find(file => file.endsWith('.gen'));
    if (!rom) {
        vscode_1.window.showErrorMessage('There are no ROMs to run. Build something first.');
        return;
    }
    let errorCode = false;
    (0, child_process_1.exec)(`"${vscode_1.workspace.getConfiguration(`megaenvironment`).get(`paths.${emulator}`)}" "${(0, path_1.join)(projectFolder, rom)}"`, (error) => {
        if (error) {
            vscode_1.window.showErrorMessage('Cannot run the latest build. ' + error.message);
            errorCode = true;
            return;
        }
    });
    if (errorCode || extensionSettings.quietOperation) {
        return;
    }
    vscode_1.window.showInformationMessage(`Running "${rom}" with ${emulator}.`);
}
async function runTemporaryROM(emulator) {
    if (!(await assemblerChecks())) {
        return;
    }
    await promptEmulatorPath(emulator);
    process.chdir(vscode_1.workspace.workspaceFolders[0].uri.fsPath);
    let warnings = false;
    switch (executeAssemblyCommand()) {
        case 0:
            break;
        case 1:
            warnings = true;
            break;
        default:
            return;
    }
    if (!executeCompileCommand()) {
        return;
    }
    let errorCode = false;
    (0, child_process_1.exec)(`"${vscode_1.workspace.getConfiguration(`megaenvironment`).get(`paths.${emulator}`)}" "${(0, path_1.join)(assemblerFolder, "rom.bin")}"`, (error) => {
        if (error) {
            vscode_1.window.showErrorMessage('Cannot run the build. ' + error.message);
            errorCode = true;
            return;
        }
        (0, fs_1.unlink)((0, path_1.join)(assemblerFolder, 'rom.bin'), (error) => {
            if (error) {
                vscode_1.window.showErrorMessage('Could not delete the temporary ROM for cleanup. You may want to do this by yourself. ' + error.message);
                return;
            }
        });
    });
    if (errorCode) {
        return;
    }
    const currentDate = new Date();
    if (!warnings) {
        if (extensionSettings.quietOperation) {
            return;
        }
        vscode_1.window.showInformationMessage(`Build succeded at ${currentDate.getHours().toString().padStart(2, '0')}:${currentDate.getMinutes().toString().padStart(2, '0')}:${currentDate.getSeconds().toString().padStart(2, '0')}, running it with ${emulator}. (Oh yes!)`);
    }
    else {
        vscode_1.window.showWarningMessage(`Build succeded with warnings at ${currentDate.getHours().toString().padStart(2, '0')}:${currentDate.getMinutes().toString().padStart(2, '0')}:${currentDate.getSeconds().toString().padStart(2, '0')}, running it with ${emulator}.`, 'Show Terminal')
            .then(selection => {
            if (selection === 'Show Terminal') {
                outputChannel.show();
            }
        });
    }
}
function cleanProjectFolder() {
    let items = 0;
    (0, fs_1.readdirSync)('.').forEach((item) => {
        const shouldDelete = extensionSettings.cleaningExtensions.some((ext) => {
            if (ext === '.pre') {
                return /\.pre\d+$/.test(item); // handles .pre0, .pre1, .pre999...
            }
            return item.endsWith(ext);
        });
        if (shouldDelete) {
            (0, fs_1.unlink)(item, (error) => {
                if (error) {
                    vscode_1.window.showErrorMessage(`The file ${item} was skipped because it couldn't be cleaned up.`);
                }
            });
            items++;
        }
    });
    if (extensionSettings.quietOperation) {
        return;
    }
    vscode_1.window.showInformationMessage(`Cleanup completed. ${items} items were removed.`);
}
// This method is called when the extension is activated
// An extension is activated the very first time the command is executed
async function activate(context) {
    assemblerFolder = context.globalStorageUri.fsPath;
    assemblerPath = (0, path_1.join)(assemblerFolder, 'asl');
    compilerPath = (0, path_1.join)(assemblerFolder, 'p2bin');
    if (process.platform === 'win32') {
        assemblerPath += '.exe';
        compilerPath += '.exe';
    }
    const config = vscode_1.workspace.getConfiguration('megaenvironment');
    for (const setting of settingDescriptors) {
        extensionSettings[setting.target] = config.get(setting.key);
    }
    extensionSettings.sonicDisassembly = config.get('buildControl.sonicDisassemblySupport', false);
    if (!(downloadAssembler(+extensionSettings.sonicDisassembly))) {
        return;
    }
    //
    //	Commands
    //
    const assemble = vscode_1.commands.registerCommand('megaenvironment.assemble', () => {
        assembleROM();
    });
    const clean_and_assemble = vscode_1.commands.registerCommand('megaenvironment.clean_assemble', () => {
        if (!vscode_1.workspace.workspaceFolders) {
            vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
            return;
        }
        const projectFolder = vscode_1.workspace.workspaceFolders[0].uri.fsPath; // Get the full path to the currently opened folder
        process.chdir(projectFolder);
        cleanProjectFolder();
        let warnings = false;
        switch (executeAssemblyCommand()) {
            case 0:
                break;
            case 1:
                warnings = true;
                break;
            default:
                return;
        }
        if (!executeCompileCommand()) {
            return;
        }
        renameRom(projectFolder, warnings);
    });
    const run_BlastEm = vscode_1.commands.registerCommand('megaenvironment.run_blastem', () => {
        findAndRunROM('BlastEm');
    });
    const run_Regen = vscode_1.commands.registerCommand('megaenvironment.run_regen', () => {
        const platform = process.platform;
        if (platform !== 'win32' && platform !== 'linux') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform. Regen is only available for Windows and Linux, unfortunately.');
            return;
        }
        findAndRunROM('Regen');
    });
    const run_ClownMdEmu = vscode_1.commands.registerCommand('megaenvironment.run_clownmdemu', () => {
        const platform = process.platform;
        if (platform !== 'win32' && platform !== 'linux') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform... but hold your horses! ClownMDEmu could be available for your platform if you use your web browser.', 'Visit Site')
                .then(selection => {
                if (selection === 'Visit Site') {
                    vscode_1.env.openExternal(vscode_1.Uri.parse('http://clownmdemu.clownacy.com/'));
                }
            });
            return;
        }
        findAndRunROM('ClownMDEmu');
    });
    const run_OpenEmu = vscode_1.commands.registerCommand('megaenvironment.run_openemu', () => {
        if (process.platform !== 'darwin') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform. OpenEmu is only available for macOS, unfortunately.');
            return;
        }
        if (!vscode_1.workspace.workspaceFolders) {
            vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
            return;
        }
        if (!(0, fs_1.existsSync)('/Applications/OpenEmu.app')) {
            vscode_1.window.showErrorMessage("Looks like you haven't installed OpenEmu yet. Make sure it's located in the \"\\Applications\" folder when installed, or else it won't run properly.");
            return;
        }
        const projectFolder = vscode_1.workspace.workspaceFolders[0].uri.fsPath;
        process.chdir(projectFolder);
        const rom = (0, fs_1.readdirSync)('.').find(file => file.endsWith('.gen'));
        if (!rom) {
            vscode_1.window.showErrorMessage('There are no ROMs to run. Build something first.');
            return;
        }
        let errorCode = false;
        (0, child_process_1.exec)(`open -a "OpenEmu" "${(0, path_1.join)(projectFolder, rom)}"`, (error) => {
            if (error) {
                vscode_1.window.showErrorMessage('Cannot run the latest build. ' + error.message);
                errorCode = true;
                return;
            }
        });
        if (errorCode || extensionSettings.quietOperation) {
            return;
        }
        vscode_1.window.showInformationMessage(`Running "${rom}" with OpenEmu.`);
    });
    const assemble_and_run_BlastEm = vscode_1.commands.registerCommand('megaenvironment.assemble_run_blastem', () => {
        runTemporaryROM('BlastEm');
    });
    const assemble_and_run_Regen = vscode_1.commands.registerCommand('megaenvironment.assemble_run_regen', () => {
        const platform = process.platform;
        if (platform !== 'win32' && platform !== 'linux') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform. Regen is only available for Windows and Linux, unfortunately.');
            return;
        }
        runTemporaryROM('Regen');
    });
    const assemble_and_run_ClownMDEmu = vscode_1.commands.registerCommand('megaenvironment.assemble_run_clownmdemu', () => {
        const platform = process.platform;
        if (platform !== 'win32' && platform !== 'linux') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform... but hold your horses! ClownMDEmu could be available for your platform if you use your web browser.', 'Visit Site')
                .then(selection => {
                if (selection === 'Visit Site') {
                    vscode_1.env.openExternal(vscode_1.Uri.parse('http://clownmdemu.clownacy.com/'));
                }
            });
            return;
        }
        runTemporaryROM('ClownMDEmu');
    });
    const assemble_and_run_OpenEmu = vscode_1.commands.registerCommand('megaenvironment.assemble_run_openemu', async () => {
        if (process.platform !== 'darwin') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform. OpenEmu is only available for macOS, unfortunately.');
            return;
        }
        if (!vscode_1.workspace.workspaceFolders) {
            vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
            return;
        }
        if (!(0, fs_1.existsSync)('/Applications/OpenEmu.app')) {
            vscode_1.window.showErrorMessage("Looks like you haven't installed OpenEmu yet. Make sure it's located in the \"\\Applications\" folder when installed, or else it won't run properly.");
            return;
        }
        if (!(await assemblerChecks())) {
            return;
        }
        process.chdir(vscode_1.workspace.workspaceFolders[0].uri.fsPath);
        let warnings = false;
        switch (executeAssemblyCommand()) {
            case 0:
                break;
            case 1:
                warnings = true;
                break;
            default:
                return;
        }
        if (!executeCompileCommand()) {
            return;
        }
        await new Promise((resolve, reject) => {
            (0, child_process_1.exec)(`open -a "OpenEmu" "${(0, path_1.join)(assemblerFolder, 'rom.bin')}"`, (error) => {
                if (error) {
                    vscode_1.window.showErrorMessage('Cannot run the build. ' + error.message);
                    reject();
                }
                resolve();
            });
        });
        (0, fs_1.unlink)((0, path_1.join)(assemblerFolder, 'rom.bin'), (error) => {
            if (error) {
                vscode_1.window.showErrorMessage('Could not delete the temporary ROM for cleanup. You may want to do this by yourself. ' + error.message);
                return;
            }
        });
        const currentDate = new Date();
        if (!warnings) {
            if (extensionSettings.quietOperation) {
                return;
            }
            vscode_1.window.showInformationMessage(`Build succeded at ${currentDate.getHours().toString().padStart(2, '0')}:${currentDate.getMinutes().toString().padStart(2, '0')}:${currentDate.getSeconds().toString().padStart(2, '0')}, running it with OpenEmu. (Oh yes!)`);
        }
        else {
            vscode_1.window.showWarningMessage(`Build succeded with warnings at ${currentDate.getHours().toString().padStart(2, '0')}:${currentDate.getMinutes().toString().padStart(2, '0')}:${currentDate.getSeconds().toString().padStart(2, '0')}, running it with OpenEmu.`, 'Show Terminal')
                .then(selection => {
                if (selection === 'Show Terminal') {
                    outputChannel.show();
                }
            });
        }
    });
    const open_EASy68k = vscode_1.commands.registerCommand('megaenvironment.open_easy68k', () => {
        if (process.platform !== 'win32') {
            vscode_1.window.showErrorMessage('This command is not supported in your platform. EASy68k is only available for Windows, unfortunately.');
            return;
        }
        if (!vscode_1.workspace.workspaceFolders) {
            vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
            return;
        }
        promptEmulatorPath('EASy68k');
        const editor = vscode_1.window.activeTextEditor;
        if (!editor) {
            vscode_1.window.showErrorMessage("Seems like you forgot to open any text editor.");
            return;
        }
        const projectFolder = vscode_1.workspace.workspaceFolders[0].uri.fsPath;
        const selectedText = editor.document.getText(editor.selection);
        process.chdir(assemblerFolder);
        let text;
        let constantsLocation = '';
        const constantsName = extensionSettings.constantsName;
        if (constantsName !== '') {
            constantsLocation = (0, path_1.join)(projectFolder, constantsName);
        }
        let variablesExists = false;
        let variablesLocation = '';
        const variablesName = extensionSettings.variablesName;
        if (variablesName !== '') {
            variablesLocation = (0, path_1.join)(projectFolder, variablesName);
            if ((0, fs_1.existsSync)(variablesLocation)) {
                variablesExists = true;
            }
        }
        if ((0, fs_1.existsSync)(constantsLocation)) {
            if (variablesExists) {
                text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n\torg\t$FF0000\n\n; Variables\n\n${(0, fs_1.readFileSync)(variablesLocation, 'utf-8')}\n\n; Constants\n\n${(0, fs_1.readFileSync)(constantsLocation, 'utf-8')}\n\n\tend\tstart`;
            }
            else {
                text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n; Constants\n\n${(0, fs_1.readFileSync)(constantsLocation, 'utf-8')}\n\n\torg\t$FF0000\n\n\tend\tstart`;
            }
        }
        else if (variablesExists) {
            text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\norg\t$FF0000\n\n; Variables${(0, fs_1.readFileSync)(variablesLocation, 'utf-8')}\n\n\tend\tstart`;
        }
        else {
            text = `; Code\n\n\torg\t0\n\nstart:\n\n${selectedText}\n\n\tsimhalt\n\n\tend\tstart`;
        }
        try {
            (0, fs_1.writeFileSync)('temp.txt', new TextEncoder().encode(text));
        }
        catch (error) {
            vscode_1.window.showErrorMessage('Unable to create file for testing. ' + error.message);
            return;
        }
        let errorCode = false;
        (0, child_process_1.exec)(`"${vscode_1.workspace.getConfiguration('megaenvironment').get('paths.EASy68k')}" "temp.txt"`, (error) => {
            if (error) {
                vscode_1.window.showErrorMessage('Cannot run EASy68k for testing. ' + error.message);
                errorCode = true;
            }
            (0, fs_1.readdirSync)(assemblerFolder).forEach((file) => {
                if (file !== assemblerPath && file !== compilerPath && file !== 'LICENSE.txt') {
                    (0, fs_1.unlink)(file, (error) => {
                        if (error) {
                            vscode_1.window.showWarningMessage(`Could not remove "${file}" for cleanup. You may want to do this by yourself. ${error.message}`);
                        }
                    });
                }
            });
            process.chdir(projectFolder);
        });
        if (errorCode || extensionSettings.quietOperation) {
            return;
        }
        vscode_1.window.showInformationMessage('Debugging your current selection with EASy68k.');
    });
    const backup = vscode_1.commands.registerCommand('megaenvironment.backup', () => {
        if (!vscode_1.workspace.workspaceFolders) {
            vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
            return;
        }
        process.chdir(vscode_1.workspace.workspaceFolders[0].uri.fsPath); // Change current working folder to the project one
        const zip = new adm_zip_1.default(); // Create zip archive reference
        const items = (0, fs_1.readdirSync)('.'); // Read all content in the project folder
        if (!(0, fs_1.existsSync)('Backups')) {
            vscode_1.window.showInformationMessage('No "Backups" folder found. Fixing.');
            (0, fs_1.mkdirSync)('Backups');
        }
        else {
            items.splice(items.indexOf('Backups'), 1); // Remove Backups folder
        }
        let files = 0;
        items.forEach((item) => {
            zip.addLocalFile(item);
            if (extensionSettings.cleaningExtensions.some(v => item.includes(v))) {
                (0, fs_1.unlink)(item, (error) => {
                    if (error) {
                        vscode_1.window.showWarningMessage(`Could not remove "${item}" for cleanup. You may want to do this by yourself. ${error.message}`);
                    }
                });
            }
            files++;
        });
        const currentDate = new Date();
        const backupName = extensionSettings.backupName;
        let fileName = backupName === '' ? 'Backup' : backupName;
        if (extensionSettings.backupDate) {
            fileName += `_${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}_${currentDate.getHours().toString().padStart(2, '0')}.${currentDate.getMinutes().toString().padStart(2, '0')}.${currentDate.getSeconds().toString().padStart(2, '0')}`; // I am aware that this line is extraordinarily long
        }
        zip.writeZip((0, path_1.join)('Backups', `${fileName}.zip`));
        if (extensionSettings.quietOperation) {
            return;
        }
        vscode_1.window.showInformationMessage(`${files} files were backed up successfully.`);
    });
    const cleanup = vscode_1.commands.registerCommand('megaenvironment.cleanup', () => {
        if (!vscode_1.workspace.workspaceFolders) {
            vscode_1.window.showErrorMessage('You have no opened projects. Please, open a folder containing the correct structure.');
            return;
        }
        process.chdir(vscode_1.workspace.workspaceFolders[0].uri.fsPath);
        cleanProjectFolder();
    });
    context.subscriptions.push(assemble, clean_and_assemble, run_BlastEm, run_Regen, run_ClownMdEmu, run_OpenEmu, assemble_and_run_BlastEm, assemble_and_run_Regen, assemble_and_run_ClownMDEmu, assemble_and_run_ClownMDEmu, assemble_and_run_OpenEmu, backup, cleanup, open_EASy68k);
}
vscode_1.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('megaenvironment')) {
        const config = vscode_1.workspace.getConfiguration('megaenvironment');
        for (const setting of settingDescriptors) {
            const key = setting.key;
            if (event.affectsConfiguration(`megaenvironment.${key}`)) {
                extensionSettings[setting.target] = config.get(key);
            }
        }
        if (event.affectsConfiguration('megaenvironment.buildControl.sonicDisassemblySupport')) {
            extensionSettings.sonicDisassembly = config.get('buildControl.sonicDisassemblySupport', false);
            (async () => {
                if (!extensionSettings.quietOperation) {
                    vscode_1.window.showInformationMessage('Swapping versions...');
                }
                isDownloading = true;
                await downloadAssembler(+extensionSettings.sonicDisassembly); // + to auto-convert to a number (integer)
                isDownloading = false;
            })(); // () is for calling the anonymous function
        }
    }
});
//# sourceMappingURL=extension.js.map