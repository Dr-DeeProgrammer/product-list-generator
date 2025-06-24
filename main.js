const { app, BrowserWindow, globalShortcut, screen, dialog, ipcMain } = require('electron');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const jsonpatch = require('fast-json-patch');


const imagesDir = path.join(app.getPath('documents'), 'ProductListData', 'images');
const dataDir = path.join(app.getPath('documents'), 'ProductListData');
const dataPath = path.join(app.getPath('documents'), 'ProductListData', 'company.json');

if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, JSON.stringify(defaultCompanyData(), null, 2));
} else {
    try {
        const data = fs.readFileSync(dataPath, 'utf-8');
        JSON.parse(data); // Validate JSON
    } catch (error) {
        console.error("Corrupted company.json, resetting.");
        fs.writeFileSync(dataPath, JSON.stringify(defaultCompanyData(), null, 2));
    }
}

function defaultCompanyData() {
    return {
        companyName: "",
        companyAddress: "",
        companyDescription: "",
        companyPhoneNumber: "",
        inputDir: "",
        outputDir: "",
        lowStockLimit: "5",
        dbFileName: "",
        removeLowStock: "true",
        updateStock: "true",
        updateRates: "true",
        addNewProducts: "true",
        updateDiscount: "false",
        products: { name: "All Products", products: [] },
        lists: [],
        categories: [],
        lastUpdated: ""
    };
}



let win;
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.whenReady().then(createWindow);
}

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    win = new BrowserWindow({
        width: width,
        height: height,
        icon: path.join(app.getAppPath(), 'icon.ico'),
        webPreferences: {
            preload: path.join(app.getAppPath(), 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false,
        },
    });

    win.setMenu(null);
    win.loadFile(path.join(app.getAppPath(), 'index.html'));

    win.webContents.on("did-fail-load", () => {
        console.error("Page failed to load. Retrying...");
        setTimeout(() => win.loadFile('index.html'), 1000);
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});


ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    return result.filePaths[0] || '';
});



ipcMain.handle('save-company-data', async (event, companyData) => {
    try {
        const dataPath = path.join(app.getPath('documents'), 'ProductListData', 'company.json');

        if (!fs.existsSync(path.dirname(dataPath))) {
            fs.mkdirSync(path.dirname(dataPath), { recursive: true });
        }

        let data = {};
        if (fs.existsSync(dataPath)) {
            try {
                const fileContent = fs.readFileSync(dataPath, 'utf-8');
                data = fileContent ? JSON.parse(fileContent) : {};
            } catch (err) {
                console.error("Error reading company.json, resetting file.");
                data = {}; // Reset on JSON error
            }
        } else {
            fs.writeFileSync(dataPath, JSON.stringify({}, null, 2));
        }

        if (!companyData || typeof companyData !== 'object') {
            console.error("Invalid company data received. Skipping save.");
            return { success: false, message: 'Invalid company data.' };
        }

        const patchData = jsonpatch.compare(data, companyData);
        const updatedData = jsonpatch.applyPatch(data, patchData).newDocument;

        fs.writeFileSync(dataPath, JSON.stringify(updatedData, null, 2));

        return { success: true, message: 'Company data updated successfully!' };
    } catch (error) {
        console.error('Error saving data:', error);
        return { success: false, message: 'Error saving data.' };
    }
});




async function getProductDataFromDatabase(dbName, directoryPath) {
    return new Promise((resolve, reject) => {
        fs.readdir(directoryPath, (err, files) => {
            if (err) return reject(err);

            const dbFileName = path.basename(dbName);
            const filteredFiles = files.filter(file => file.startsWith(dbFileName));

            if (filteredFiles.length === 0) {
                return reject(new Error('No matching files found in the directory.'));
            }

            // 🔹 Optimized logic to find the latest file
            const latestFile = filteredFiles.reduce((latest, file) => {
                const filePath = path.join(directoryPath, file);
                return (fs.statSync(filePath).mtime > fs.statSync(path.join(directoryPath, latest)).mtime) ? file : latest;
            }, filteredFiles[0]);

            const latestFilePath = path.join(directoryPath, latestFile);
            const db = new sqlite3.Database(latestFilePath, sqlite3.OPEN_READWRITE, (err) => {
                if (err) return reject(err);
            });

            // Set WAL mode for better performance
            db.exec("PRAGMA journal_mode = WAL;");

            const query = `
                WITH ItemInfo AS (
    SELECT item, defaultsellingprice, defaultdiscountpercent
    FROM item_measure
), StockInfo AS (
    SELECT item, SUM(purchased) - SUM(sold) AS available_stock
    FROM (
        SELECT item, units AS purchased, 0 AS sold FROM purchases
        UNION ALL
        SELECT item, 0 AS purchased, units AS sold FROM sales
    ) AS transactions
    GROUP BY item
)
SELECT 
    si.item,
    ROUND(si.available_stock, 2) AS available_stock,
    ROUND(ii.defaultsellingprice, 2) AS defaultsellingprice,
    ROUND(ii.defaultdiscountpercent, 2) AS default_discount_percent
FROM StockInfo AS si
INNER JOIN ItemInfo AS ii ON si.item = ii.item;`;

            db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    const productData = rows.map(row => ({
                        stock: row.available_stock,
                        name: row.item,
                        rate: row.defaultsellingprice,
                        discount: row.default_discount_percent,
                    }));
                    resolve(productData);
                }
            });

            db.close((err) => {
                if (err) console.error("Error closing database:", err);
            });
        });
    });
}


const updateCompanyJsonWithProducts = (productData, settings) => {
    const companyJsonPath = path.join(app.getPath('documents'), 'ProductListData', 'company.json');
    let companyData = JSON.parse(fs.readFileSync(companyJsonPath, 'utf-8'));
    let allProducts = companyData.products.products;

    productData.forEach(dbProduct => {
        const toRemove = settings.removeLowStock && dbProduct.stock < settings.lowStockLimit;
        let matchedProduct = allProducts.find(p => p.name === dbProduct.name);

        if (!toRemove) {
            if (matchedProduct) {
                if (settings.updateStock) {
                    matchedProduct.stock = dbProduct.stock;
                }
                if (settings.updateRates) {
                    matchedProduct.rate = dbProduct.rate;
                }
                if (settings.updateDiscount) {
                    matchedProduct.discount = dbProduct.discount;
                }
            } else if (settings.addNewProducts) {
                allProducts.push({
                    name: dbProduct.name,
                    stock: dbProduct.stock,
                    rate: dbProduct.rate,
                    description: "",
                    discount: dbProduct.discount,
                    categories: [],
                    prioritized: false,
                    imgAddress: ''
                });
            }
        }
    });

    if (settings.removeLowStock) {
        companyData.products.products = allProducts.filter(p => p.stock >= settings.lowStockLimit);
    }

    companyData.lists.forEach(list => {
        list.products.forEach(product => {
            const matchedProduct = productData.find(p => p.name === product.name);
            if (matchedProduct) {
                if (settings.updateStock) product.stock = matchedProduct.stock;
                if (settings.updateRates) product.rate = matchedProduct.rate;
                if (settings.updateDiscount) product.discount = matchedProduct.discount;
            }
        });

        if (settings.removeLowStock) {
            list.products = list.products.filter(product => product.stock >= settings.lowStockLimit);
        }
    });

    fs.writeFileSync(companyJsonPath, JSON.stringify(companyData, null, 2), 'utf-8');
    return companyData;
};



ipcMain.handle('import-product-data', async (event, dbName, dirPath, settings) => {
    try {
        const productData = await getProductDataFromDatabase(dbName, dirPath);

        return updateCompanyJsonWithProducts(productData, settings);
    } catch (error) {
        console.error("Error in IPC handler:", error);
        return null;
    }
});
ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif'] }
        ]
    });
    if (result.filePaths && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

ipcMain.handle('remove-image', (event, absolutePath) => {
    if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        return { success: true, message: 'Image removed successfully.' };
    } else {
        return { success: false, message: 'Image not found.' };
    }
});


ipcMain.handle("save-image", (event, filePath) => {
    try {
        if (!fs.existsSync(filePath)) {
            return { success: false, message: "Source file not found." };
        }

        const imagesDir = path.join(app.getPath('documents'), 'ProductListData', 'images');
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

        const fileName = getUniqueFileName(path.basename(filePath));
        const destPath = path.join(imagesDir, fileName);

        fs.copyFileSync(filePath, destPath);

        return { success: true, imgAddress: destPath };  // ✅ Return absolute path
    } catch (error) {
        return { success: false, message: error.message };
    }
});


ipcMain.handle("save-dropped-image", (event, fileData) => {
    const { name, data } = fileData;
    const imagesDir = path.join(app.getPath('documents'), 'ProductListData', 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

    const fileName = getUniqueFileName(path.basename(name));
    const destPath = path.join(imagesDir, fileName);

    const buffer = Buffer.from(data, "base64");

    try {
        fs.writeFileSync(destPath, buffer);
        return { success: true, imgAddress: destPath };  // ✅ Return absolute path
    } catch (error) {
        console.error("Error saving image:", error);
        return { success: false, message: error.message };
    }
});


function getUniqueFileName(fileName) {
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    let newFileName = fileName;
    let counter = 1;

    while (fs.existsSync(path.join(imagesDir, newFileName))) {
        newFileName = `${baseName}(${counter})${ext}`;
        counter++;
    }

    return newFileName;
}
ipcMain.handle('inject-js-into-html', async (event, jsCode) => {
    try {
        const filePath = path.join(app.getAppPath(), 'template.html');
        let htmlContent = fs.readFileSync(filePath, 'utf-8');

        htmlContent = htmlContent.replace("<script>", `<script>\n${jsCode}\n`);

        return htmlContent;
    } catch (error) {
        console.error('Error injecting JS:', error);
        return null;
    }
});
ipcMain.handle('inject-js-and-save', async (event, outputFilename, outputDir, jsCode) => {
    try {
        const inputFilePath = path.join(app.getAppPath(), 'template.html');

        const outputFilePath = path.join(outputDir, (outputFilename + ".html"));

        if (!fs.existsSync(inputFilePath)) {
            throw new Error(`template.html not found in ${outputDir}`);
        }

        let htmlContent = fs.readFileSync(inputFilePath, 'utf-8');

        htmlContent = htmlContent.replace("<script>", `<script>\n${jsCode}\n`);

        fs.writeFileSync(outputFilePath, htmlContent, 'utf-8');

        return { success: true, message: `Injected JS and saved output as ${outputFilePath}` };
    } catch (error) {
        console.error('Error injecting JS:', error);
        return { success: false, message: error.message };
    }
});
ipcMain.handle('convert-image-to-bytecode', async (event, absolutePath) => {
    try {
        console.log(absolutePath);
        if (!fs.existsSync(absolutePath)) {
            throw new Error(`File not found: ${absolutePath}`);
        }

        const imageBuffer = fs.readFileSync(absolutePath);
        return imageBuffer.toString('base64');
    } catch (error) {
        console.error('Error reading image:', error);
        return null;
    }
});

ipcMain.handle('get-company-json-path', async () => {
    return path.join(app.getPath('documents'), 'ProductListData', 'company.json');
});


ipcMain.handle("save-html", async (event, filename, outputText, outputFolder) => {
    try {
        const filePath = path.join(outputFolder, `${filename}.html`);
        fs.writeFileSync(filePath, outputText, "utf8");
        return { success: true, path: filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});