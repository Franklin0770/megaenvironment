# What does this thing do?
It's a Visual Studio Code extension developed to integrate a command-like UI with [The Macroassembler AS](http://john.ccac.rwth-aachen.de:8000/as/).  
The purpose of this extension is primarily for Sega Mega Drive homebrew development. It also supports Sonic Disassemblies and aims to bring a familiar UI to fellow Sonic ROM hackers, but with some caveats.  

## What it can do
#### You can:
- Assemble files and produce a ROM output in various ways;
- Make use of some basic versioning, useful for producing multiple builds and be able to distinguish between them;
- Gain speedy productivity from shortcuts to manage and organise your project folder;
- Backup your project quickly, too;
- Run ROMs with mostly Windows emulators (you need to set a system variable for this!);
- Utilise nearly every option available of the assembler, using the UI-friendly settings screen of VS Code;
- Avoid to include build tools or such, the extension downloads the necessary files to compile;
- Highlight 68k and Z80 code, with three supported VS themes (Dark, Abyss and Sonic Disassembly);
- Enjoy basic autocompletion, indentation and other integrated VS Code features.

![Commands](https://github.com/Franklin0770/megaenvironment/blob/main/papers/Commands.png)

## What you need to setup this (in case you want to modify it)
You can check [this tutorial](https://code.visualstudio.com/api) out if you don't know much about VS extensions.

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
