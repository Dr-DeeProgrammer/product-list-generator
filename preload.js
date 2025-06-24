const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    saveCompanyData: (data) => ipcRenderer.invoke('save-company-data', data),
    selectImageFile: () => ipcRenderer.invoke('select-image'),
    convertImageToBytecode: (imagePath) => ipcRenderer.invoke('convert-image-to-bytecode', imagePath),
    injectJsIntoHtml: (jsCode) => ipcRenderer.invoke('inject-js-into-html', jsCode),
    importProductData: (dbpath,dirPath,settings) => ipcRenderer.invoke('import-product-data', dbpath,dirPath,settings),
    removeImage: (imageSrc) => ipcRenderer.invoke('remove-image', imageSrc),
    saveImage: (imageSrc) => ipcRenderer.invoke('save-image', imageSrc),
    saveDroppedImage: (fileData) => ipcRenderer.invoke('save-dropped-image', fileData),
    injectJsAndSaveFile: (filename, outputDir, jsCode) => ipcRenderer.invoke('inject-js-and-save', filename, outputDir, jsCode),
    getCompanyJsonPath: () => ipcRenderer.invoke('get-company-json-path'),
    saveHTML: (filename, outputText, outputFolder) => ipcRenderer.invoke("save-html", filename, outputText, outputFolder)
});