'use strict';

const { app, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
global.$ = require('lodash');

// classes
const MainRouter = require('./src/main/mainRouter.build');
const EntryServer = require('./src/main/electron/serverProcessManager');
const WindowManager = require('./src/main/electron/windowManager');
const CommonUtils = require('./src/main/electron/commonUtils');

// functions
const parseCommandLine = require('./src/main/electron/functions/parseCommandLine');
const configInit = require('./src/main/electron/functions/configInitialize');
const registerGlobalShortcut = require('./src/main/electron/functions/registerGlobalShortcut');
const checkUpdate = require('./src/main/electron/functions/checkUpdate');

let mainWindow = null;
let mainRouter = null;
let entryServer = null;

const argv = process.argv.slice(1);
const commandLineOptions = parseCommandLine(argv);
const configuration = configInit(commandLineOptions.config);
const { roomIds = [], hardwareVersion } = configuration;
if (argv.indexOf('entryhw:')) {
    const data = CommonUtils.getArgsParseData(argv);
    if (data) {
        roomIds.push(data);
    }
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
} else {
    app.on('window-all-closed', () => {
        app.quit();
    });

    // 어플리케이션을 중복 실행했습니다. 주 어플리케이션 인스턴스를 활성화 합니다.
    app.on('second-instance', (event, argv, workingDirectory) => {
        let parseData = {};
        if (argv.indexOf('entryhw:')) {
            parseData = CommonUtils.getArgsParseData(argv);
        }

        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();

            if (mainWindow.webContents) {
                if (roomIds.indexOf(parseData) === -1) {
                    roomIds.push(parseData);
                }
                mainWindow.webContents.send('customArgs', parseData);
                mainRouter.addRoomId(parseData);
            }
        }
    });

    ipcMain.on('reload', () => {
        entryServer.close();
        app.relaunch();
        app.exit(0);
    });

    app.commandLine.appendSwitch('enable-experimental-web-platform-features', true);
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
    app.commandLine.appendSwitch('enable-web-bluetooth');
    app.setAsDefaultProtocolClient('entryhw');
    app.once('ready', () => {
        Menu.setApplicationMenu(null);
        WindowManager.createMainWindow({ debug: commandLineOptions.debug });
        mainWindow = WindowManager.mainWindow;
        WindowManager.createAboutWindow(mainWindow);

        registerGlobalShortcut();
        entryServer = new EntryServer();
        mainRouter = new MainRouter(mainWindow, entryServer);
    });

    ipcMain.on('hardwareForceClose', () => {
        WindowManager.mainWindowCloseConfirmed = true;
        mainWindow.close();
    });

    ipcMain.on('showMessageBox', (e, msg) => {
        dialog.showMessageBoxSync({
            type: 'none',
            message: msg,
            detail: msg,
        });
    });

    ipcMain.on('openAboutWindow', () => {
        WindowManager.aboutWindow && WindowManager.aboutWindow.show();
    });

    ipcMain.handle('checkUpdate', async () => await checkUpdate());

    ipcMain.handle('getOpenSourceText', async () => {
        const openSourceFile = path.resolve(__dirname, 'OPENSOURCE.md');
        return await fs.promises.readFile(openSourceFile, 'utf8');
    });
}

process.on('uncaughtException', (error) => {
    const whichButtonClicked = dialog.showMessageBoxSync({
        type: 'error',
        title: 'Unexpected Error',
        message: 'Unexpected Error',
        detail: error.toString(),
        buttons: ['ignore', 'exit'],
    });
    console.error(error.message, error.stack);
    if (whichButtonClicked === 1) {
        process.exit(-1);
    }
});
