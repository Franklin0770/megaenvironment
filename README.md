# What does this thing do?
MDE is a Visual Studio Code extension developed to integrate a cross-platform UI with [The Macroassembler AS](http://john.ccac.rwth-aachen.de:8000/as/).  
The purpose of this extension is primarily for Sega Mega Drive homebrew development. It also supports Sonic Disassemblies and aims to bring a familiar UI to fellow Sonic ROM hackers.  

## What it can do
#### You can:
- Assemble files and produce a ROM output in various ways;
- Make use of some basic versioning, useful for producing multiple builds and be able to distinguish between them;
- Gain speedy productivity from shortcuts to manage and organise your project folder;
- Backup your project quickly, too;
- Run ROMs with emulators with one click;
- Utilize nearly every option available of the assembler, using the UI-friendly settings screen of VS Code;
- Avoid to include build tools or such, the extension downloads the necessary files to compile;
- Highlight 68k and Z80 code, with two supported VS themes (Dark and Sonic Disassembly);
- Enjoy basic autocompletion, indentation and other integrated VS Code features.

![Assembly](https://raw.githubusercontent.com/Franklin0770/megaenvironment/main/papers/Assembly1.png)

## What you need to set up this (in case you want to modify it)
You can check [this tutorial](https://code.visualstudio.com/api) out if you don't know much about VS extensions.

First of all, make sure you have [Node.js](https://nodejs.org/) installed. [Git](https://git-scm.com) is recommended if you want to clone this repository.  

To clone this repository (so you have Git's convenient source control and versioning) in a folder, type this in your terminal:
```
cd <folder where you want to clone>
git clone https://github.com/Franklin0770/megaenvironment.git
```
Then, after installing Node, you must get the node modules by issuing the following command:
```
cd megaenvironment
npm install
```
This way you have all the packages you need (including VS Code API and [Adm-Zip](https://www.npmjs.com/package/adm-zip)).  

Now that you're almost done, you'll want to compile the extension, so you can run it and do all of the experimentation you want by yourself:
```
cd megaenvironment
npm run compile
```
After done compiling, you should see an "out" folder. This contains all of your compiled code in JavaScript.  

To publish it as an installable extension for VS Code, you should package it by doing so:
```
cd megaenvironment
vsce package
```
This command will output your freshly packaged VSIX, ready to be installed in VS Code.
## Some screenshots (so you get the idea)
![Macro code example](https://raw.githubusercontent.com/Franklin0770/megaenvironment/main/papers/Assembly2.png)
![Building](https://raw.githubusercontent.com/Franklin0770/megaenvironment/main/papers/Assembly3.png)
![Building with errors](https://raw.githubusercontent.com/Franklin0770/megaenvironment/main/papers/Assembly4.png)
![Building with warnings](https://raw.githubusercontent.com/Franklin0770/megaenvironment/main/papers/Assembly5.png)
![One click away from emulators!](https://raw.githubusercontent.com/Franklin0770/megaenvironment/main/papers/Emulators.png)
![Fast debugging](https://raw.githubusercontent.com/Franklin0770/megaenvironment/main/papers/Debugging.png)
![One-click backups](https://raw.githubusercontent.com/Franklin0770/megaenvironment/main/papers/Backup.png)
![Some settings](https://raw.githubusercontent.com/Franklin0770/megaenvironment/main/papers/Settings1.png)
![Some settings](https://raw.githubusercontent.com/Franklin0770/megaenvironment/main/papers/Settings2.png)
![Some settings](https://raw.githubusercontent.com/Franklin0770/megaenvironment/main/papers/Settings3.png)
![Some settings](https://raw.githubusercontent.com/Franklin0770/megaenvironment/main/papers/Settings4.png)
## The Credits Section
The assembler and compiler: http://john.ccac.rwth-aachen.de:8000/as/  
How I learnt to make this extension: https://code.visualstudio.com/api/get-started/your-first-extension  
This is were the files are downloaded from: https://github.com/Franklin0770/AS-releases.git

I've just found out it has been more than a year of development since the first release... _time flies!_