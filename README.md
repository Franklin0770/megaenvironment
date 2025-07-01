# What does this thing do?
It's a Visual Studio Code extension developed to integrate a command-like UI with [The Macroassembler AS](http://john.ccac.rwth-aachen.de:8000/as/).  
The purpose of this extension is primarily for Sega Mega Drive homebrew development.  

## What it can do
You can:
- Assemble files and produce a ROM output in various ways;
- Some basic versioning, useful for producing multiple builds and be able to distinguish between them;
- Shortcuts to manage and organise your project folder;
- Speaking of versioning and file management, you can also backup your project quickly;
- Run ROMs with mostly Windows emulators (you need to set a system variable for this!);
- Utilise nearly every option available of the assembler, using the UI-friendly settings screen of VS Code;
- Avoid to include build tools or such, the extension downloads the necessary files to compile;
- 68k and Z80 code highlighting, with three supported VS themes (Dark, Abyss and Sonic Disassembly);
- Basic autocompletion, indentation and other integrated VS Code features.

![Commands](https://github.com/Franklin0770/megaenvironment/blob/main/papers/Commands.png)

## What you need to install this
First of all, make sure you have [Node.js](https://nodejs.org/) installed. [Git](https://git-scm.com) is recommended if you want to clone this repository.  

Then, after installing Node, you must install [Adm-Zip](https://www.npmjs.com/package/adm-zip), a file zipper required for this extension to make backups:
```
npm install adm-zip
```
Since Node needs this package's node module, you'll want to issue this command as well:
```
cd megaenvironment
npm i --save-dev @types/adm-zip
```
## Some screenshots (so you get the idea)
![Settings1](https://github.com/Franklin0770/megaenvironment/blob/main/papers/Settings%201.png)
![Settings2](https://github.com/Franklin0770/megaenvironment/blob/main/papers/Settings%202.png)
![Assembly1](https://github.com/Franklin0770/megaenvironment/blob/main/papers/Assembly%201.png)
![Assembly2](https://github.com/Franklin0770/megaenvironment/blob/main/papers/Assembly%202.png)
## The Credits Section
The assembler and compiler: http://john.ccac.rwth-aachen.de:8000/as/  
How I learnt to make this extension: https://code.visualstudio.com/api/get-started/your-first-extension  
This is were the files are downloaded from: https://github.com/Franklin0770/AS-releases.git
