class Product {
    constructor(name, rate, discount, stock, description, prioritized) {
        this.stock = stock;
        this.name = name;
        this.rate = rate;
        this.description = description;
        this.discount = discount;
        this.categories = null;
        this.prioritized = prioritized;
        this.imgAddress = '';
    }
    updateCategoryParent(category, row) {
        if (category) {
            const categoryContainer =
                document.querySelector(`.table-category-container[data-category-value="${category}"]`) || addNewCategoryContainer(category);
            categoryContainer.append(row);
        } else {
            document.querySelector(`.table-category-container[data-category-value="No Company"]`).append(row);
        }
    }
    async saveDroppedImage(file) {
        await this.deleteImage();
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result.split(',')[1];

            const fileData = {
                name: file.name,
                data: base64String,
                type: file.type
            };
            const response = await window.electron.saveDroppedImage(fileData);

            if (response.success) {
                this.imgAddress = response.imgAddress;
                setImagAddressofSameProducts(this);
                showDialogue(`Added Image to ${this.name}`, "success");
            } else {
                showDialogue('Error saving image');
            }
        };
        reader.readAsDataURL(file);

    }
    setCategories() {
        this.categories = Array.from(document.querySelectorAll('.categories-choosen .category-option'))
            .map(element => element.textContent);
    }
    updateEditingRow(containsImage) {
        const editingRow = document.querySelector('.data-row.editing');
        const newRow = getDataRow(this);
        const previousCategory = editingRow.parentElement.getAttribute("data-category-value");
        const currentCategory = this.categories?.[0];
        if (currentCategory) {
            if (currentCategory != previousCategory) {
                this.updateCategoryParent(currentCategory, newRow);
            } else {
                editingRow.insertAdjacentElement("afterend", newRow);
            }
        } else if (previousCategory) {
            this.updateCategoryParent(null, newRow);
        }
        if (containsImage) {
            newRow.classList.add('img-data-row');
        }
        editingRow.remove();
    }
    async deleteImage() {
        if (!this.imgAddress) return;

        let imgPath = this.imgAddress;

        if (imgPath.startsWith("file:///")) {
            imgPath = decodeURIComponent(imgPath.replace(/^file:[/]+/, ""));
        }

        const deleteResult = await window.electron.removeImage(imgPath);

        if (!deleteResult.success) {
            showDialogue("Failed to remove Image", "error");
            return;
        }
        this.imgAddress = '';
        setImagAddressofSameProducts(this);
    }
    async saveImage(imageElement) {
        const imageAddress = imageElement ? decodeURIComponent(imageElement.src.replace(/^file:[/]+/, "")) : null;
        if (imageAddress) {
            const saveResult = await window.electron.saveImage(imageAddress);
            if (saveResult.success) {
                this.imgAddress = saveResult.imgAddress;
                setImagAddressofSameProducts(this);
            } else {
                showDialogue("Failed to save image", saveResult.message);
            }
        } else {
            showDialogue("No Image was selected", "error");
        }
    }
    async updateFromUpdateProductForm() {
        const getValue = (id) => document.getElementById(id)?.value || "";

        this.name = getValue('product-name') || this.name;
        this.description = getValue('product-description');
        this.discount = parseFloat(getValue('product-discount')) || 0;
        this.stock = parseFloat(getValue('product-stock')) || 0;
        this.rate = parseFloat(getValue('product-rate')) || 0;

        this.setCategories();

        const imageElement = document.querySelector('.image-display img');
        const newImageSrc = imageElement ? imageElement.src : '';
        const getFileName = (path) =>
            path ? decodeURIComponent(path.replace(/\\/g, "/").split("/").pop()) : "";

        if (imageElement || this.imgAddress) {
            if (getFileName(this.imgAddress) != getFileName(newImageSrc)) {
                if (this.imgAddress) {
                    await this.deleteImage();
                }
                if (imageElement) {
                    await this.saveImage(imageElement);
                }
            }
        }

        this.updateEditingRow(imageElement);
    }
    updateData(row) {
        this.rate = parseFloat(row.querySelector('.product-rate input').value);
        this.stock = parseInt(row.querySelector('.product-stock input').value);
        this.discount = parseFloat(row.querySelector('.product-discount input').value);
        this.description = row.querySelector('.product-description input').value;
        this.prioritized = row.querySelector('.prioritized') !== null;
    }
}
class List {
    constructor(name) {
        this.name = name;
        this.products = [];
    }
    getProductByName(productName) {
        return this.products.find(p => p.name.toLowerCase() == productName.toLowerCase());
    }
    getUniqueCategories() {
        if (this.NA_CategoryProducts().length) {
            return ["No Company", ...new Set(this.products.flatMap(p => p.categories))];
        }
        return [...new Set(this.products.flatMap(p => p.categories))];
    }
    getProductsCount(category) {
        return this.products.filter(p => p.categories.includes(category)).length;
    }
    getProductsByCategory(category) {
        return this.products.filter(p => p.categories.includes(category));
    }
    removeDuplicates(groups, categories) {
        const seen = new Set();
        categories.forEach(category => {
            groups[category] = groups[category].filter(product => {
                if (seen.has(product.name)) return false;
                seen.add(product.name);
                return true;
            });
        });
        return groups;
    }
    NA_CategoryProducts() {
        return this.products.length ? this.products.filter(p => p.categories.length == 0) : [];
    }
    groupByCategories(categories) {
        const groups = {};
        categories.forEach(c => {
            groups[c] = [...this.getProductsByCategory(c)];
        });
        groups["No Company"] = [...this.NA_CategoryProducts()];
        return groups;
    }
    removeCategory(catg) {
        this.products.forEach(product => {
            if (product.categories.includes(catg)) {
                product.categories = product.categories.filter(category => category !== catg);
            }
        });
    }
    async removeProduct(product) {
        const categorName = product.categories[0];
        const totalProductsofCategory = this.getProductsByCategory(categorName).length;
        if (totalProductsofCategory.length == 1) {
            document.querySelector(`.filter-option:has(input[value="${categorName}"])`).remove();
        }
        await product.deleteImage();
        this.products = this.products.filter(p => p != product);
    }
}


class Company {
    constructor() {
        this.companyName = '';
        this.companyAddress = '';
        this.companyDescription = '';
        this.companyPhoneNumber = '';
        this.inputDir = '';
        this.outputDir = '';
        this.lowStockLimit = 3;
        this.dbFileName = '';
        this.removeLowStock = "false";
        this.updateStock = "true";
        this.updateRates = "true";
        this.addNewProducts = "true";
        this.updateDiscount = "false";
        this.products = new List("All Products");
        this.lists = [];
        this.categories = [];
        this.lastUpdated = "";
    }
    isCompanySettedup() {
        return this.companyName && this.companyAddress && this.companyDescription && this.companyPhoneNumber && this.inputDir && this.outputDir && this.dbFileName;
    }
    getListByName(listName) {
        if (listName == "All Products") return this.products;
        return this.lists.find(list => list.name == listName);
    }
    transferProducts() {
        const destinationList = this.selectedDestinationList();
        const sourceList = this.selectedSourceList();
        const rows = Array.from(document.querySelectorAll('.data-row:has(input:checked)'));
        const products = rows.map(row => {
            const name = row.getAttribute("data-value-tp");
            const p = sourceList.getProductByName(name);
            const new_product = new Product(p.name, p.rate, p.discount, p.stock, p.description, p.prioritized);
            new_product.categories = [...p.categories];
            new_product.imgAddress = p.imgAddress;
            return new_product;
        });
        destinationList.products.push(...products);
        showDialogue(`${products.length} product(s) added to ${destinationList.name}`, "success");
        document.getElementById('select-all-products').checked = false;
        saveCompanyData(this);
        this.updateTransferProducts();
    }
    selectedSourceList() {
        const listName = document.querySelector('#source-list').value;
        return [this.products, ...this.lists].find(l => l.name == listName);
    }
    selectedDestinationList() {
        const listName = document.querySelector('#destination-list').value;
        return [this.products, ...this.lists].find(l => l.name == listName);
    }

    updateTransferProducts() {
        function getCheckBoxCell() {
            const div = document.createElement('cell');
            div.classList.add('cell');
            const input = document.createElement('input');
            input.type = 'checkbox';
            div.append(input);
            return div;
        }
        function getDataCell(cellData) {
            const div = document.createElement('div');
            div.classList.add('cell', `product-${cellData.className}`);
            div.textContent = cellData.value;
            return div;
        }
        function manageSelectAll() {
            // to Build
        }
        function getSearchResults(prods) {
            const keys = ["stock", "name", "rate", "discount"];
            return prods.map(p => {
                const div = document.createElement('div')
                div.classList.add('data-row');
                div.setAttribute("data-value-tp", p.name);
                div.append(getCheckBoxCell())
                keys.forEach(key => {
                    div.append(getDataCell({ className: key, value: p[key] }));
                });
                div.addEventListener('click', (e) => {
                    const input = e.currentTarget.querySelector('input');
                    input.checked = !input.checked;
                    manageSelectAll();
                });
                return div;
            });
        }
        function getTotalProductsBox(n) {
            const div = document.createElement('div');
            div.classList.add('total-products');
            div.textContent = `${n} product(s)`;
            return div;
        }
        const searchValue = document.getElementById('search-product-2').value.toLowerCase();
        const tableBody = document.querySelector('.create-list-window .table-container .body');
        tableBody.innerHTML = '';
        const activeList = this.selectedSourceList();
        const destinationList = this.selectedDestinationList();
        let products = null;
        if (searchValue) {
            products = activeList.products.filter(p => p.name.toLowerCase().includes(searchValue));
        } else {
            products = activeList.products;
        }
        products = products.filter(
            p1 => !destinationList.products.some(p2 => p2.name === p1.name)
        );
        products.sort((a, b) => a.name.localeCompare(b.name));
        tableBody.append(...getSearchResults(products));
        tableBody.append(getTotalProductsBox(products.length))
    }
    updateListTransferOptions(selected) {
        const source = document.querySelector('#source-list');
        const destination = document.querySelector('#destination-list');
        source.innerHTML = '';
        destination.innerHTML = '';
        this.getAllLists().forEach(listName => {
            const option = document.createElement('option');
            option.value = listName;
            option.textContent = listName;
            source.append(option);
            destination.append(option.cloneNode(true));
        });
        destination.value = selected;
        this.updateTransferProducts();
    }
    getListMarkUp(l, newButtonClicked) {
        const handleDeletion = (div, listName) => {
            showConfirmationDialogue("Are You Sure?",
                `"${listName}" will be removed .`,
                {
                    "Yes": () => {
                        const index = this.lists.findIndex(list => list.name === listName);
                        const toRemoveOption = this.selectedList().name == listName;
                        if (index !== -1) this.lists.splice(index, 1);
                        div.remove();
                        if (toRemoveOption) {
                            this.updateListMarkupOptions();
                        } else {
                            document.getElementById('list-select').querySelector(`[value="${listName}"]`).remove();
                        }
                        showDialogue("List Delete", "success");
                        saveCompanyData(this);
                    },
                    "No": null
                }
            );
        }
        const handleEditing = (e) => {
            const listContainer = e.currentTarget.closest('.list');
            const selected = listContainer.querySelector('#list-name').value;
            this.updateListTransferOptions(selected);
            document.querySelector('.active-window').classList.remove('active-window');
            document.querySelector('.create-list-window').classList.add('active-window');
        }


        const div = document.createElement('div');
        const input = document.createElement('input');
        const prodCount = document.createElement('div');
        const btnDiv = document.createElement('div');
        const deleteBtn = document.createElement('button');
        const addProductBtn = document.createElement('button');
        div.classList.add('list');
        input.id = 'list-name';
        btnDiv.classList.add('buttons-container');
        prodCount.classList.add('list-products-count');
        deleteBtn.id = 'delete-btn';
        addProductBtn.id = 'add-btn';

        if (newButtonClicked) {
            prodCount.textContent = `0 product(s)`;
        } else {
            input.disabled = true;
            prodCount.textContent = `${l.products.length} product(s)`;
        }
        deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
        addProductBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>';
        input.type = 'text';
        input.value = l.name;

        btnDiv.append(deleteBtn, addProductBtn)
        div.append(input, prodCount, btnDiv);


        addProductBtn.addEventListener('click', handleEditing);
        deleteBtn.addEventListener('click', () => handleDeletion(div, l.name))

        return div;
    }
    removeCategory(catg) {
        this.categories = this.categories.filter(category => category !== catg);
        this.products.removeCategory(catg);
        this.lists.forEach(list => {
            list.removeCategory(catg);
        });
        this.updateCategoriesFilters();

        const categoryContainer = document.querySelector(`.table-category-container[data-category-value="${catg}"]`);
        const noCompanyContainer = document.querySelector('.table-category-container[data-category-value="No Company"]');

        if (categoryContainer && noCompanyContainer) {
            const rows = categoryContainer.getElementsByClassName('data-row');
            noCompanyContainer.append(...rows);
            categoryContainer.remove();
        }
    }

    getCategoryMarkUp(c, newButtonClicked) {
        const handleDeletion = (div, c) => {
            const msg = `"${c}" will be removed from everywhere.`;
            showConfirmationDialogue("Are You Sure?",
                msg,
                {
                    "Yes": () => {
                        div.remove();
                        this.removeCategory(c);
                        saveCompanyData(this);
                    },
                    "No": null
                }
            );
        }
        const handleViewing = (catg) => {
            const flag = this.products.products.some(prod => prod.categories.includes(catg));
            if (flag) {
                document.querySelector('.active-window').classList.remove('active-window');
                document.getElementById('list-select').value = 'All Products';
                const filters = Array.from(document.querySelectorAll('.filter-option'));
                filters.forEach(filter => {
                    const filterLabel = filter.querySelector('label');
                    if (filterLabel.textContent.toLowerCase() == catg.toLowerCase()) {
                        if (filter.querySelector('input').checked != true) {
                            filterLabel.click();
                        }
                    } else {
                        if (filter.querySelector('input').checked != false) {
                            filterLabel.click();
                        }

                    }
                });
            } else {
                showDialogue("No Products Available", "error");
            }
        }

        const div = document.createElement('div');
        const input = document.createElement('input');
        const prodCount = document.createElement('div');
        const btnDiv = document.createElement('div');
        const deleteBtn = document.createElement('button');
        const viewBtn = document.createElement('button');
        div.classList.add('category');
        input.id = 'category-name';
        btnDiv.classList.add('buttons-container');
        prodCount.classList.add('category-products-count');
        deleteBtn.id = 'delete-btn';
        viewBtn.id = 'view-btn';

        if (!newButtonClicked) {
            input.disabled = true;
            prodCount.textContent = `${company.products.getProductsCount(c)} product(s)`;
        } else {
            prodCount.textContent = `0 product(s)`;
        }
        deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
        viewBtn.textContent = 'View';
        input.type = 'text';
        input.value = c;

        deleteBtn.addEventListener('click', () => handleDeletion(div, c))
        viewBtn.addEventListener('click', () => handleViewing(c))

        btnDiv.append(deleteBtn, viewBtn)
        div.append(input, prodCount, btnDiv);
        return div;

    }
    getAllCategories_MarkUp(isList) {

        const array = isList ? this.lists : this.categories;

        return array.map(a => {
            return isList ? this.getListMarkUp(a) : this.getCategoryMarkUp(a);
        });
    }
    getCategoryOptions_MarkUp() {
        function moveBetweenContainers(e) {
            const options = document.querySelector('.category-options .category-option-parent');
            const selections = document.querySelector('.categories-choosen .category-option-parent');
            const clickedDiv = e.currentTarget;
            if (clickedDiv.parentElement == options) {
                if (!selections.querySelector('.category-option'))
                    selections.append(clickedDiv);
            } else {
                options.append(clickedDiv);
            }
        }

        const categoriesMarkUp = this.categories.map((category) => {
            const div = document.createElement('div');
            div.classList.add('category-option')
            div.textContent = category;
            div.addEventListener('click', moveBetweenContainers)
            return div;
        });
        return Array.from(categoriesMarkUp);
    }
    getAllLists() {
        return [this.products.name, ...company.lists.map(l => l.name)];
    }
    updateListMarkupOptions() {
        const all_lists = this.getAllLists();
        const div = document.getElementById('list-select');
        div.innerHTML = '';

        all_lists.forEach(li => {
            const option = document.createElement('option');
            option.value = li;
            option.textContent = li;
            div.append(option);
        });
        this.updateDataTable();
    }
    selectedList() {
        const listName = document.querySelector('#list-select').value;
        return this.getListByName(listName);
    }
    selectedCategories() {
        const selectedOptions = Array.from(document.querySelectorAll('.options input:checked'));
        return selectedOptions.map(opt => opt.value);
    }
    updateCategoriesFilters() {
        const filterOptionMarkUp = (value) => {
            const neutralValue = value.split(' ').join('');
            const p = document.createElement('p');
            const input = document.createElement('input');
            const label = document.createElement('label');
            input.id = neutralValue;
            label.htmlFor = neutralValue;
            input.value = value;
            input.type = "checkbox";
            input.checked = true;
            input.addEventListener('change', filterCategoriesResults);
            label.textContent = value;
            p.append(input, label)
            p.classList.add('filter-option');
            return p;
        }

        const div = document.querySelector('.filter-options .options');
        div.innerHTML = '';
        const activeList = this.selectedList();
        const catgs = activeList.getUniqueCategories();
        div.append(...catgs.map(catg => filterOptionMarkUp(catg)));
    }
    updateProductData(prodName, row) {
        const list = this.selectedList();
        const product = list.getProductByName(prodName);
        product.updateData(row);
    }
    filterSearchResults() {
        const searchValue = document.getElementById('search-product').value.toLowerCase();
        const query = this.selectedCategories()
            .map(c => `.table-category-container[data-category-value="${c}" i] .data-row`)
            .join(',');

        const rows = query ? document.querySelectorAll(query) : [];
        if (!searchValue) {
            rows.forEach(row => {
                row.classList.remove('hide')
            });
        } else if (searchValue.startsWith(':')) {
            smartFilterRows(searchValue);
        } else {
            rows.forEach(row => {
                if (row.getAttribute('data-value').toLowerCase().includes(searchValue)) {
                    row.classList.remove('hide');
                } else {
                    row.classList.add('hide');
                }
            })
        }
        setMainTotalProducts();
    }
    updateDataTable() {
        const tableBody = document.querySelector('.main-body .body');
        tableBody.innerHTML = "";
        document.getElementById('allow-product-editing').checked = false;
        const activeList = this.selectedList();
        const activeCategories = activeList.getUniqueCategories();

        const prodByCatg = Object.fromEntries(
            Object.entries(activeList.groupByCategories(activeCategories))
                .sort(([, a], [, b]) => b.length - a.length)
        );

        const fragment = document.createDocumentFragment();

        Object.keys(prodByCatg).forEach(catg => {
            const categoryContainer = addNewCategoryContainer(catg, tableBody);
            categoryContainer.append(...prodByCatg[catg].map(p => getDataRow(p)));
            fragment.appendChild(categoryContainer);
        });

        tableBody.appendChild(fragment);

        this.updateCategoriesFilters();
        setMainTotalProducts();
        document.getElementById('search-product').value = '';
    }

    updateSettings() {
        const emptyInputs = Array.from(document.querySelectorAll('.settings-window input:placeholder-shown'));
        const phoneValue = document.getElementById('company-phone').value.trim();
        if (emptyInputs.length) {
            emptyInputs[0].focus();
            if (emptyInputs[0].disabled) {
                if (phoneValue) {
                    showDialogue("Paths are not set", "error");
                } else {
                    showDialogue("Phone Number is not set", "error");
                }
            }
        } else if (areSettingsValueSet()) {
            if (isValidPhoneNumber(phoneValue)) {
                if (arePathCorrect()) {
                    this.companyName = document.getElementById('company-name').value.trim() || "Company Name";
                    this.companyAddress = document.getElementById('company-address').value.trim() || "Company Address";
                    this.companyDescription = document.getElementById('company-description').value.trim() || "Company Description";
                    this.companyPhoneNumber = phoneValue;
                    this.inputDir = document.getElementById('input-dir').value; ``
                    this.outputDir = document.getElementById('output-dir').value;
                    this.dbFileName = document.getElementById('input-db').value;
                    this.lowStockLimit = document.getElementById('low-stock-limit').value.trim();
                    this.removeLowStock = document.getElementById('remove-low-stock-toggle').getAttribute("on");
                    this.updateStock = document.getElementById('update-stock-toggle').getAttribute("on");
                    this.updateRates = document.getElementById('update-rates-toggle').getAttribute("on");
                    this.addNewProducts = document.getElementById('add-new-products-toggle').getAttribute("on");
                    this.updateDiscount = document.getElementById('update-discount-toggle').getAttribute("on");
                    disabledSettingsInputs();
                    saveCompanyData(this);
                    showDialogue("Changes Saved", "success");
                    document.querySelector('.settings-window').classList.remove('active-window');
                } else {
                    showDialogue("Path(s) are incorrect!", "error");
                }
            } else {
                showDialogue("Phone Number is Incorrect", "error");
            }
        } else {
            showDialogue("Fill all fields", "error");
        }
    }
    updateSettingsWindow() {
        document.getElementById('company-name').value = this.companyName || "Company Name";
        document.getElementById('company-address').value = this.companyAddress || "Company Address";
        document.getElementById('company-description').value = this.companyDescription || "Company Description";
        document.getElementById('company-phone').value = this.companyPhoneNumber;
        document.getElementById('input-dir').value = this.inputDir;
        document.getElementById('output-dir').value = this.outputDir;
        document.getElementById('input-db').value = this.dbFileName;
        document.getElementById('low-stock-limit').value = this.lowStockLimit ? this.lowStockLimit : 0;
        document.getElementById('remove-low-stock-toggle').setAttribute("on", new String(this.removeLowStock == "true"));
        document.getElementById('update-stock-toggle').setAttribute("on", new String(this.updateStock == "true"));
        document.getElementById('update-rates-toggle').setAttribute("on", new String(this.updateRates == "true"));
        document.getElementById('update-discount-toggle').setAttribute("on", new String(this.updateDiscount == "true"));
        document.getElementById('add-new-products-toggle').setAttribute("on", new String(this.addNewProducts == "true"));
    }
}
function parseIntoProduct(p) {
    const product = new Product(p.name, p.rate, p.discount, p.stock, p.description, p.prioritized);
    product.categories = p.categories;
    product.imgAddress = p.imgAddress || '';
    return product;
}

function parseIntoList(items) {
    const list = new List(items.name);
    list.products = items.products.map(p => parseIntoProduct(p));
    return list;
}
function parseCompany(data) {
    if (data) {
        const system = new Company();
        system.products = parseIntoList(data.products || new List("All Products"));
        system.lists = data.lists.map(l => parseIntoList(l));
        system.categories = data.categories;
        system.lastUpdated = data.lastUpdated;
        system.companyName = data.companyName;
        system.companyAddress = data.companyAddress;
        system.companyPhoneNumber = data.companyPhoneNumber;
        system.companyDescription = data.companyDescription;
        system.inputDir = data.inputDir;
        system.outputDir = data.outputDir;
        system.lowStockLimit = data.lowStockLimit;
        system.removeLowStock = data.removeLowStock;
        system.updateStock = data.updateStock;
        system.updateRates = data.updateRates;
        system.addNewProducts = data.addNewProducts;
        system.updateDiscount = data.updateDiscount;
        system.dbFileName = data.dbFileName;
        return system;
    } else {
        return null;
    }
}


async function loadData(filePath) {
    const response = await fetch(filePath);
    if (!response.ok) return null;

    const text = await response.text();
    return text ? JSON.parse(text) : null;
}


async function saveCompanyData(companyData) {
    try {
        const cleanedData = JSON.parse(JSON.stringify(companyData));
        await window.electron.saveCompanyData(cleanedData);
        console.log('Company data saved successfully!');
    } catch (error) {
        console.error('Error saving company data:', error);
    }
}


let company = null;


const newProductBtn = document.getElementById('new-product-btn');
const closeProductWinBtn = document.querySelector('.new-product-window #close-window-btn');
const manageCategoryBtn = document.getElementById('manage-categories-btn');
const closeCategoryWinBtn = document.querySelector('.manage-category-window #close-window-btn');
const manageListsBtn = document.getElementById('manage-lists-btn');
const closeListWinBtn = document.querySelector('.manage-list-window #close-window-btn');
const closeTransferListWinBtn = document.querySelector('.create-list-window #close-window-btn');
const settingsBtn = document.getElementById('settings-btn');
const saveProductBtn = document.querySelector('.new-product-window #save-btn');
const resetProductBtn = document.querySelector('.new-product-window #reset-btn');
const newCategoryBtn = document.getElementById('new-category-btn');
const newListBtn = document.getElementById('new-list-btn');
const selectAllCheckBox = document.querySelector('#select-all-container input');
const transferBtn = document.querySelector('#transfer-button');

const sourceList = document.getElementById('source-list');
const destinationList = document.getElementById('destination-list');



const listSelect = document.getElementById('list-select');
const searchBox = document.getElementById('search-product');
const searchBox2 = document.getElementById('search-product-2');

const unlockInputs = document.getElementById('allow-product-editing');
const openCategoryPanelBtn = document.getElementById('open-category-panel-btn');
const closeCategoryPanelBtn = document.getElementById('close-category-panel-btn');
const openSettingsWindowBtn = document.getElementById('settings-btn');
const closeSettingsWindowBtn = document.querySelector('.settings-window #close-window-btn');
const resetSettingsBtn = document.getElementById('reset-settings-changes-btn');
const saveSettingsBtn = document.getElementById('save-settings-changes-btn');
const openExportWindowBtn = document.getElementById('export-btn');
const closeExportWindowBtn = document.querySelector('.export-window #close-window-btn');
const resetExportFormBtn = document.querySelector('.export-window #reset-btn');
const exportBtn = document.querySelector('.export-window #export-btn');
const exportStaticBtn = document.querySelector('.export-window #export-static-btn');
const openImportWindowBtn = document.getElementById('import-btn');
const closeImportWindowBtn = document.querySelector('.import-window #close-window-btn');
const importBtn = document.querySelector('.import-window #import-btn');
const resetImportForm = document.querySelector('.import-window #reset-btn');
const removeLowStockToggle = document.getElementById('remove-low-stock-toggle');
const setInputDirBtn = document.getElementById('change-input-dir-btn');
const setOutputDirBtn = document.getElementById('change-output-dir-btn');
const selectImageBtn = document.getElementById('add-image-btn');
const allowFullScreenBtn = document.getElementById('allow-full-screen');



function extractNumber(str) {
    return (str.match(/-?\d+(\.\d+)?/g) || []).map(Number)?.[0];
}
function extractOperator(str) {
    return str.match(/[<=>]/g)?.[0] || null;
}
function smartFilterRows(searchValue) {
    company.updateCategoriesFilters();
    const rows = Array.from(document.querySelectorAll('.data-row'));
    if (searchValue.includes('vip')) {
        rows.forEach(row => {
            if (!row.querySelector('.prioritized')) {
                row.classList.add('hide');
            } else {
                row.classList.remove('hide');
            }
        });
    }
    if (searchValue.includes('pic')) {
        rows.forEach(row => {
            if (!row.classList.contains('img-data-row')) {
                row.classList.add('hide');
            } else {
                row.classList.remove('hide');
            }
        });
    } else if (searchValue.includes('stock')) {
        rows.forEach(row => {
            const pName = row.getAttribute("data-value");
            const product = company.selectedList().getProductByName(pName);
            const operator = extractOperator(searchValue);
            const value = parseInt(extractNumber(searchValue));
            if (value) {
                if (!((operator == '<' && product.stock < value) || (operator == '>' && product.stock > value))) {
                    row.classList.add('hide');
                } else {
                    row.classList.remove('hide');
                }
            }
        });
    }
    else if (searchValue.includes('disc')) {
        rows.forEach(row => {
            const pName = row.getAttribute("data-value");
            const product = company.selectedList().getProductByName(pName);
            const operator = extractOperator(searchValue);
            const value = parseFloat(extractNumber(searchValue));
            if (value) {
                if (!(operator == '<' && parseFloat(product.discount) < value) || (operator == '>' && parseFloat(product.discount) > value)) {
                    row.classList.add('hide');
                }
            }
        });
    }

}

function getListDate() {
    const dateInput = document.getElementById('valid-from').value;

    if (!dateInput) return '';

    const date = new Date(dateInput);
    const options = { day: '2-digit', month: 'long', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}
async function getExportType_Product(product) {
    const includeImages = document.getElementById('include-images').checked;
    let imageData = '';

    if (includeImages && product.imgAddress) {
        const result = await window.electron.convertImageToBytecode(product.imgAddress);

        if (result && typeof result === 'object' && 'error' in result) {
            console.error("Image conversion error:", result.error);
            imageData = '';
        } else if (typeof result === 'string') {
            imageData = result;
        }
    }

    return {
        name: product.name,
        rate: product.rate,
        discount: product.discount,
        qty: 0,
        description: product.description,
        prioritized: product.prioritized,
        "image-data": imageData
    };
}

async function getProductsForExport() {
    const dataRows = Array.from(document.querySelectorAll('.main-body .data-row:not(.hide)'));
    let products = dataRows.map(row => company.selectedList().getProductByName(row.getAttribute("data-value")) || '');
    const newList = new List("temp");
    newList.products = products;
    const catgs = newList.getUniqueCategories();
    products = newList.groupByCategories(catgs);

    const productEntries = await Promise.all(
        Object.entries(products).map(async ([category, productList]) => {
            const processedProducts = await Promise.all(productList.map(product => getExportType_Product(product)));
            return [category, processedProducts];
        })
    );

    return Object.fromEntries(productEntries);
}

async function getExportDataObject() {
    let code = 'const system = ';
    const data = {
        companyName: company.companyName,
        phoneNumber: company.companyPhoneNumber,
        companyDescription: company.companyDescription,
        companyAddress: company.companyAddress,
        listDate: getListDate(),
        products: await getProductsForExport()
    };
    return code + JSON.stringify(data) + ';';
}

function allowForEditing() {
    Array.from(document.querySelectorAll('.settings-window .settings-category:not(:nth-child(2)) input,.settings-category:nth-child(2) .settings-option:first-child input')).forEach(input => {
        input.disabled = false;
    });
}
function disabledSettingsInputs() {
    Array.from(document.querySelectorAll('.settings-window input:not(:disabled)')).forEach(input => {
        input.disabled = true;
    });
}
function areSettingsValueSet() {
    return document.getElementById('company-name').value.trim() &&
        document.getElementById('company-address').value.trim() &&
        document.getElementById('company-description').value.trim() &&
        document.getElementById('company-phone').value.trim() &&
        document.getElementById('input-db').value.trim() &&
        document.getElementById('input-dir').value.trim() &&
        document.getElementById('output-dir').value.trim();
}
function isValidPhoneNumber(number) {
    const regex = /^\+92\d{10}$/;
    return regex.test(number);
}
function arePathCorrect() {
    const regex = /^[a-zA-Z]:\\(?:[^<>:"/\\|?*\r\n]+\\)*[^<>:"/\\|?*\r\n]*$/;
    return regex.test(document.getElementById('input-dir').value.trim())
        &&
        regex.test(document.getElementById('output-dir').value.trim());
}
function getProductFormData() {
    const name = document.querySelector('.new-product-window #product-name').value.trim();
    const description = document.querySelector('.new-product-window #product-description').value.trim();
    if (!name) {
        showDialogue('Product name cannot be empty', "error");
        return null;
    }
    const rate = parseFloat(document.querySelector('.new-product-window #product-rate').value);
    const discount = Math.max(0, parseFloat(document.querySelector('.new-product-window #product-discount').value) || 0);
    const stock = parseFloat(document.querySelector('.new-product-window #product-stock').value);
    if (isNaN(rate) || rate < 0) {
        showDialogue('Invalid rate value', "error");
        return null;
    } if (isNaN(stock) || stock < 0) {
        showDialogue("Invalid stock value", "error");
        return null;
    }
    const newProduct = new Product(name, rate, discount, stock, description, false);

    const imgTag = document.querySelector('.new-product-window img');
    newProduct.imgAddress = imgTag ? imgTag.src : '';
    newProduct.setCategories();
    return newProduct;
}

function showDialogue(message, dialogType) {
    document.querySelector('.dialog-box')?.remove();

    const div = document.createElement('div');
    div.classList.add(`dialog-box`, `${dialogType}-message`);

    div.textContent = message || "Unknown Error Occured";
    setTimeout(() => div.remove(), 2000);
    document.body.append(div);
}
function showConfirmationDialogue(heading, message, buttons) {
    const div = document.createElement('div');
    const header = document.createElement('h4');
    const msg = document.createElement('p');
    const btnsContainer = document.createElement('div');
    div.classList.add('confirmation-dialogue');
    header.classList.add('dialogue-header');
    msg.classList.add('dialogue-message');
    btnsContainer.classList.add('dialogue-btns');

    header.textContent = heading;
    msg.textContent = message;

    const btns = Object.keys(buttons);
    btns.forEach(btn => {
        const Btn = document.createElement('button');
        Btn.textContent = btn;
        if (buttons[btn]) {
            Btn.addEventListener('click', buttons[btn]);
        }
        Btn.addEventListener('click', () => div.remove())
        btnsContainer.append(Btn);
    });
    div.append(header, msg, btnsContainer);
    document.body.append(div);
}

function resetProductForm() {
    document.querySelector('.new-product-window #product-name').value = '';
    document.querySelector('.new-product-window #product-rate').value = '';
    document.querySelector('.new-product-window #product-discount').value = '';
    document.querySelector('.new-product-window #product-stock').value = '';
    document.querySelector('.new-product-window #product-description').value = '';
    document.querySelector('.image-display img')?.remove();
    removeCategories('categories-choosen .category-option-parent');
    removeCategories('category-options .category-option-parent');
    document.querySelector('.category-options .category-option-parent').append(...company.getCategoryOptions_MarkUp())
}
function getEditingProduct() {
    const name = document.querySelector('.data-row.editing')?.getAttribute("data-value");
    if (name != undefined) {
        return company.selectedList().getProductByName(name);
    } else {
        return null
    }
}
function categoryHeader(category) {
    const div = document.createElement('div');
    div.classList.add('category-header');
    div.textContent = category;
    return div;
}
function buttonCell(text, handler, prioritized) {
    const div = document.createElement('div');
    div.classList.add('cell');
    const btn = document.createElement('button');
    btn.tabIndex = -1;
    if (prioritized) {
        btn.classList.add('prioritized')
    }
    btn.innerHTML = text;
    btn.addEventListener('click', handler);
    div.append(btn);
    return div;
}
const getDataCell = (cellData) => {
    const hasInputChild = ["product-rate", "product-discount", 'product-stock', "product-description"].includes(cellData.className);
    const div = document.createElement('div');
    div.classList.add('cell', cellData.className);
    if (hasInputChild) {
        const input = document.createElement('input');
        input.type = cellData.className == "product-description" ? "text" : "number";
        input.value = cellData.value;
        input.disabled = true;
        div.append(input);
        input.addEventListener('keyup', (e) => {
            const row = e.currentTarget.closest('.data-row');
            const prodName = row.getAttribute("data-value").toLowerCase();
            company.updateProductData(prodName, row);
        });
        input.addEventListener('focusout', () => {
            saveCompanyData(company);
        });
    } else {
        div.textContent = cellData.value;
    }
    return div;
}
function addNewCategoryContainer(new_category, tableBody) {
    if (!tableBody) {
        tableBody = document.querySelector('.main-body .body');
    }
    const categoryContainer = document.createElement('div');
    categoryContainer.append(categoryHeader(new_category));
    categoryContainer.classList.add('table-category-container');
    categoryContainer.setAttribute('data-category-value', new_category);
    tableBody.append(categoryContainer);
    return categoryContainer;
}
function getDataRow(product) {
    const cells = ["stock", "name", "rate", "discount", "description"].map(key => ({ value: product[key], className: `product-${key}` }));
    const div = document.createElement('div');
    div.classList.add('data-row');
    if (product.stock < company.lowStockLimit) {
        div.classList.add('low-stock');
    }
    if (product.imgAddress) {
        div.classList.add('img-data-row');
    }
    div.setAttribute("data-value", product.name.toLowerCase());
    div.append(...cells.map(cell => getDataCell(cell)))
    div.append(buttonCell("<span class='material-symbols-outlined'>delete</span>", () => {
        company.selectedList().removeProduct(product);
        div.remove();
        saveCompanyData(company);
        setMainTotalProducts();
        showDialogue(`${product.name} Delete`, "success");
    }))
    div.append(buttonCell("<span class='material-symbols-outlined'>priority</span>", (e) => {
        e.currentTarget.classList.toggle('prioritized');
        const row = e.currentTarget.closest('.data-row');
        const prodName = row.getAttribute("data-value").toLowerCase();
        company.updateProductData(prodName, row);
        saveCompanyData(company);
    }, product.prioritized));
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        popEditButton(e, e.currentTarget);
    });
    return div;
}
function insertNewProduct(catg, prod) {
    const row = getDataRow(prod);
    prod.updateCategoryParent(catg, row);
}
async function createNewProduct() {
    const editingProduct = getEditingProduct();
    let success = false;
    if (editingProduct) {
        try {
            await editingProduct.updateFromUpdateProductForm();
            showDialogue(`Product Updtated`, "success");
            success = true;
        }
        catch {
            showDialogue(`Failed to update Product`, "error");
        }
        closeNewProductWindow(null, true);
    } else {
        const newProduct = getProductFormData();
        if (newProduct) {
            const productExists = company.products.getProductByName(newProduct.name);
            if (productExists) {
                showDialogue("Product Already Exists!!", "error");
            } else {
                company.products.products.push(newProduct);
                await newProduct.saveImage(document.querySelector('.new-product-window img'));
                insertNewProduct(newProduct.categories[0], newProduct);
                showDialogue('Product Saved Successfully!', "success")
                success = true;
            }
        } else {
            return;
        }
    }
    if (success) {
        company.updateCategoriesFilters();
        resetProductForm();
        saveCompanyData(company);
    }

}

function removeCategories(class_selector) {
    Array.from(document.querySelectorAll(`.${class_selector} .category-option`)).forEach((option => option.remove()));
}
function openNewProductWindow() {
    document.querySelector('.new-product-window').classList.add('active-window');
    const categoriesContainer = document.querySelector('.category-options .category-option-parent');
    categoriesContainer.innerHTML = '';
    categoriesContainer.append(...company.getCategoryOptions_MarkUp())
}
function closeNewProductWindow(event, forceClose) {
    if (forceClose || !detectProductChanges()) {
        document.querySelector('.new-product-window').classList.remove('active-window');
        document.querySelector('.data-row.editing')?.classList.remove('editing');
        resetProductForm();
        productWindow2save();
    }
}

function openCategoryWindow() {
    document.querySelector('.manage-category-window').classList.add("active-window");
    const div = document.querySelector('.categories-container')
    Array.from(div.querySelectorAll('.category')).forEach(div => div.remove())
    div.append(...company.getAllCategories_MarkUp());
}
function closeCategoryWindow() {
    document.querySelector('.manage-category-window').classList.remove("active-window");
}
function createNewCategory(e) {
    const new_category_div = company.getCategoryMarkUp("New Category", true);
    const btn = e.currentTarget;
    btn.insertAdjacentElement('afterend', new_category_div);
    const input = new_category_div.querySelector('input')
    input.addEventListener('keyup', (e) => {
        if (e.key == 'Enter') {
            const new_category = input.value.trim();
            if (new_category) {
                const isDuplicated = company.categories.some(c => c.toLowerCase() == new_category.toLowerCase());
                if (isDuplicated) {
                    showDialogue("Category already exists", "error");
                } else {
                    company.categories.push(new_category);
                    input.disabled = true;
                    // if (company.selectedList().name == "All Products") {
                    //     addNewCategoryContainer(new_category);
                    // }
                    saveCompanyData(company);
                    showDialogue(`${new_category} Created`, "success");
                    input.blur();
                }
            } else {
                showDialogue("Category cannot be empty.");
            }
        }
    });
    input.select();
}

function openListWindow() {
    document.querySelector('.manage-list-window').classList.add("active-window");
    const div = document.querySelector('.lists-container');
    Array.from(div.querySelectorAll('.list')).forEach(div => div.remove());
    div.append(...company.getAllCategories_MarkUp(true));
}

function closeListWindow() {
    document.querySelector('.manage-list-window').classList.remove("active-window");
}
function createNewList(e) {
    const newList = new List("New List");
    const new_list_div = company.getListMarkUp(newList, true);
    const btn = e.currentTarget;
    btn.insertAdjacentElement('afterend', new_list_div);
    const input = new_list_div.querySelector('input')
    input.addEventListener('keyup', (e) => {
        if (e.key == 'Enter') {
            const new_list = input.value.trim();
            if (new_list) {
                const isDuplicated = company.lists.some(l => l.name.toLowerCase() == new_list.toLowerCase());
                if (isDuplicated) {
                    showDialogue("List already exists", "error");
                } else {
                    newList.name = new_list;
                    company.lists.push(newList);
                    input.disabled = true;
                    addOptiontoListSelection(new_list);
                    saveCompanyData(company);
                    showDialogue(`"${new_list}" Created`, "success");
                }
            } else {
                showDialogue("Give List a name", "error");
            }
        }
    });
    input.select();
}
function addOptiontoListSelection(li) {
    const div = document.getElementById('list-select');
    const option = document.createElement('option');
    option.value = li;
    option.textContent = li;
    div.append(option);
}
function addOptiontoCategoryFilters(catg) {
    const filterOptionMarkUp = (value) => {
        const neutralValue = value.split(' ').join('');
        const p = document.createElement('p');
        const input = document.createElement('input');
        const label = document.createElement('label');
        input.id = neutralValue;
        input.value = value;
        label.htmlFor = neutralValue;
        input.type = "checkbox";
        input.checked = true;
        input.addEventListener('change', filterCategoriesResults);
        label.textContent = value;
        p.append(input, label)
        p.classList.add('filter-option');
        return p;
    }
    document.querySelector('.filter-options .options').append(filterOptionMarkUp(catg));
}
function selectAllProducts(e) {
    const checkValue = e.currentTarget.checked;
    const element = Array.from(document.querySelectorAll('.table-container input[type="checkbox"]'));
    element.forEach(element => {
        element.checked = checkValue;
    });
}
function handleChangedSourceList() {
    company.updateTransferProducts();
}
function handleChangedDestinaionList() {
    company.updateTransferProducts();
}
function handleUnlockingInputs(e) {
    const value = !e.currentTarget.checked;
    const inputs = Array.from(document.querySelectorAll('.data-row input'));
    inputs.forEach(input => {
        input.disabled = !input.disabled;
    })
}
function handleClosingCategoryPanel() {
    document.querySelector('.category-panel').classList.remove('active');
}
function handleOpeningCategoryPanel() {
    function getMarkup(catgs) {
        return catgs.sort().map(catg => {
            const div = document.createElement('div');
            div.classList.add('category');
            div.setAttribute("data-category", catg);
            div.draggable = true;
            div.textContent = catg;
            div.addEventListener("dragstart", (e) => {
                e.dataTransfer.setData("text/plain", e.target.dataset.category);
            });
            return div;
        });
    }

    document.querySelector('.category-panel').classList.add('active');
    const div = document.querySelector('.categories-draggable');
    div.innerHTML = '';
    div.append(...getMarkup(company.categories));
}

function openSettingsWindow() {
    document.querySelector('.settings-window').classList.add('active-window');
    company.updateSettingsWindow();
}
function getAllSettings() {
    return ({
        companyName: document.getElementById('company-name').value.trim(),
        companyAddress: document.getElementById('company-address').value.trim(),
        companyDescription: document.getElementById('company-description').value.trim(),
        companyPhone: document.getElementById('company-phone').value,
        inputDir: document.getElementById('input-dir').value,
        outputDir: document.getElementById('output-dir').value,
        dbFileName: document.getElementById('input-db').value,
        lowStockLimit: parseInt(document.getElementById('low-stock-limit').value.trim()),
        removeLowStock: document.getElementById('remove-low-stock-toggle').getAttribute("on"),
        updateStock: document.getElementById('update-stock-toggle').getAttribute("on"),
        updateRates: document.getElementById('update-rates-toggle').getAttribute("on"),
        addNewProducts: document.getElementById('add-new-products-toggle').getAttribute("on"),
        updateDiscount: document.getElementById('update-discount-toggle').getAttribute("on")
    });
}


function closeWindow() {
    document.querySelector('active-window')?.classList.remove('active-window');
}
function areProductsDifferent(obj1, obj2) {
    const getFileName = (path) =>
        path ? decodeURIComponent(path.replace(/\\/g, "/").split("/").pop()) : "";

    const obj1FileName = getFileName(obj1.imgAddress);
    const obj2FileName = getFileName(obj2.imgAddress);

    const excludedKeys = ["prioritized"];

    const cleanObject = (obj) => {
        let newObj = { ...obj, imgAddress: getFileName(obj.imgAddress) };
        excludedKeys.forEach((key) => delete newObj[key]);
        return newObj;
    };

    return JSON.stringify(cleanObject(obj1)) === JSON.stringify(cleanObject(obj2));
}


function detectProductChanges() {
    const editingProduct = getEditingProduct();
    if (editingProduct) {
        const new_product = getProductFormData();
        if (!areProductsDifferent(editingProduct, new_product)) {
            showConfirmationDialogue("Confirmation", `Update Product Data`, {
                "Yes": async () => { await createNewProduct(); closeNewProductWindow(undefined, true); },
                "No": () => closeNewProductWindow(undefined, true)
            });
            return true;
        }
    } else if (
        document.querySelector('.new-product-window img') ||
        document.querySelector('.categories-choosen .category-option') ||
        document.querySelector('.new-product-window input:not(:placeholder-shown)')
    ) {
        showConfirmationDialogue("Confirmation", `Discard Changes?`, {
            "Yes": () => closeNewProductWindow(undefined, true),
            "No": null
        });
        return true;
    }
    return false;
}
function detectedSettingChanges() {
    const currentSettings = getAllSettings();
    return !(
        currentSettings.companyName == company.companyName &&
        currentSettings.companyAddress == company.companyAddress &&
        currentSettings.companyDescription == company.companyDescription &&
        currentSettings.companyPhone == company.companyPhoneNumber &&
        currentSettings.inputDir == company.inputDir &&
        currentSettings.outputDir == company.outputDir &&
        currentSettings.dbFileName == company.dbFileName &&
        currentSettings.lowStockLimit == company.lowStockLimit &&
        currentSettings.removeLowStock == company.removeLowStock &&
        currentSettings.updateStock == company.updateStock &&
        currentSettings.updateRates == company.updateRates &&
        currentSettings.addNewProducts == company.addNewProducts &&
        currentSettings.updateDiscount == company.updateDiscount
    );
}

function closeSettingsWindow() {
    if (detectedSettingChanges()) {
        showConfirmationDialogue("Confirmation", "Save Changes?", {
            "Yes": () => company.updateSettings(),
            "No": () => { document.querySelector('.settings-window').classList.remove('active-window'); disabledSettingsInputs() }
        });
    } else {
        disabledSettingsInputs();
        document.querySelector('.settings-window').classList.remove('active-window');
    }
}
function openExportWindow() {
    document.querySelector('.export-window').classList.add('active-window');
    resetExportForm();
    showExportedContent();
}
function closeExportWindow() {
    document.querySelector('.export-window').classList.remove('active-window');
    document.querySelector('.export-window iframe')?.remove();
}
function companySetUp() {
    openSettingsWindow();
    allowForEditing();
}
function changeToggleValue(e) {
    const button = e.currentTarget;
    const value = button.getAttribute("on");
    if (value == "true") {
        button.setAttribute("on", "false");
    } else {
        button.setAttribute("on", "true");
    }
}

async function setInputPath() {
    const path = await window.electron.selectDirectory();
    if (path) {
        document.getElementById('input-dir').value = path;
    }
}
async function setOutputPath() {
    const path = await window.electron.selectDirectory();
    if (path) {
        document.getElementById('output-dir').value = path;
    }
}
async function selectImage() {
    const newImageSrc = await window.electron.selectImageFile();
    if (newImageSrc) {
        const imgElement = document.createElement('img');
        imgElement.src = newImageSrc;
        document.querySelector('.image-display').append(imgElement);
    } else {
        console.log('No image selected.');
    }
}
function productWindow2update() {
    document.querySelector('.new-product-window #save-btn').textContent = "Update";
    document.querySelector('.new-product-window .window-title').textContent = "Update Product";
}
function productWindow2save() {
    document.querySelector('.new-product-window #save-btn').textContent = "Save";
    document.querySelector('.new-product-window .window-title').textContent = "New Product";
}

function fillNewWindowForm(row) {
    document.querySelector('.editing')?.classList.remove('editing');
    row.classList.add('editing');
    const productName = row.querySelector('.cell:nth-child(2)').textContent;
    const activeList = company.selectedList();
    const activeProduct = activeList.getProductByName(productName);
    document.getElementById('product-name').value = activeProduct.name;
    document.getElementById('product-rate').value = activeProduct.rate;
    document.getElementById('product-discount').value = activeProduct.discount;
    document.getElementById('product-description').value = activeProduct.description;
    document.getElementById('product-stock').value = activeProduct.stock;
    if (activeProduct.imgAddress) {
        const img = document.createElement('img');
        img.src = activeProduct.imgAddress;
        document.querySelector('.new-product-window .image-display').append(img);
    }
    const div = document.querySelector('.category-options .category-option-parent');
    div.innerHTML = '';
    const catgs = company.getCategoryOptions_MarkUp();
    div.append(...catgs);
    catgs.forEach(catg => {
        if (activeProduct.categories.includes(catg.textContent)) {
            catg.click();
        }
    });
    productWindow2update();
    document.querySelector('.new-product-window').classList.add('active-window');
}


function popEditButton(event, element) {
    document.getElementById('floating-edit-btn')?.remove();
    const editButton = document.createElement('button');
    editButton.innerHTML = '<span class="material-symbols-outlined">edit</span>' + element.getAttribute("data-value");
    editButton.style.position = 'absolute';
    editButton.style.top = `${event.clientY}px`;
    editButton.style.left = `${event.clientX}px`;
    editButton.id = 'floating-edit-btn';

    editButton.addEventListener('click', () => fillNewWindowForm(element))

    const removeButtonOnClickOutside = (e) => {
        if (!editButton.contains(e.target) && e.target !== element) {
            editButton.remove();
            document.removeEventListener('click', removeButtonOnClickOutside);
        }
    };

    document.addEventListener('click', removeButtonOnClickOutside);
    editButton.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(editButton);
}

async function showExportedContent() {
    const jscode = await getExportDataObject();
    window.electron.injectJsIntoHtml(jscode).then((htmlContent) => {
        if (htmlContent) {
            const targetDiv = document.querySelector('.mobile-app');

            const iframe = document.createElement('iframe');
            iframe.style.width = '200%';
            iframe.style.height = '200%';
            iframe.style.border = 'none';
            iframe.style.overflow = 'hidden';
            iframe.style.scrolling = 'no';

            targetDiv.innerHTML = '';
            targetDiv.appendChild(iframe);

            const iframeDoc = iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(htmlContent);
            iframeDoc.close();

            iframe.onload = () => {
                const iframeBody = iframe.contentWindow.document.body;
                iframeBody.style.transform = "scale(0.5)";
                iframeBody.style.transformOrigin = "top left";
                iframeBody.style.width = "100vw";
                iframeBody.style.height = "100vh";
            };

        } else {
            showDialogue("Error while exporting", "error");
        }
    });
}



function handleImageSelection() {
    const imgTag = document.querySelector('.new-product-window img');
    if (imgTag) {
        imgTag.remove();
    } else {
        selectImage();
    }
}
function resetExportForm() {
    document.getElementById('file-name').value = '';
    document.getElementById('file-note').value = '';
    document.getElementById('valid-from').value = new Date().toISOString().split('T')[0];
    document.getElementById('valid-to').value = new Date().toISOString().split('T')[0];
}
function sanitizeFileName(fileName) {
    return fileName
        .replace(/[<>:"\/\\|?*]+/g, '')
        .replace(/^\.+|\s+$/g, '')
        .substring(0, 255);
}
function handleExporting() {
    const products = Array.from(document.querySelectorAll('.main-body .data-row'));
    const productsCount = products.filter(product => !product.classList.contains('hide'));
    if (productsCount) {
        showConfirmationDialogue(
            "Export Confirmation",
            `Export ${productsCount} out of ${products.length} Products`,
            {
                "Yes": exportProductList,
                "No": null
            });
    } else {
        showDialogue("No Products to Export", "error");
    }
}
async function exportStaticProductList() {
    let filename = document.getElementById('file-name').value;
    let data = await getExportDataObject();
    data = data.replace(/^const system = /, '');
    data = data.replace(/;$/,'');
    data = JSON.parse(data);
    const outputDir = company.outputDir;
    if (!filename) {
        showDialogue("List name cannot be empty", "error");
        return;
    }
    filename = sanitizeFileName(filename);
    if (!filename) {
        showDialogue("List name is invalid", "error");
        return;
    }
    if (!outputDir) {
        showDialogue("Invalid Output Directory", "error");
        return;
    }
    const output = `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=0.8">
    <title>Usman Medicine</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        .app {

            --bg-clr: white;
            --txt-clr: #343A40;
            --tbl-header-bg-clr: #E0F0F9;
            --tbl-header-clr: #002A5C;
            --rows-bg-clr: white;
            --even-row-bg-clr: #edf1f4;
            --order-btn-bg-clr: #002A5C;
            --download-btn-bg-clr: #007BFF;
            position: relative;
        }

        main {
            background-color: whitesmoke;
        }

        header {
            padding: 0 10px;
            transition: height 500ms linear;
            overflow: hidden;
        }

        header>p {
            width: 90%;
            margin: 3px auto;
            color: var(--txt-clr);
            text-align: center;
            font-size: 0.75rem;
        }

        header .company-address {
            white-space: nowrap;
            animation: slide 10s linear infinite;
        }

        .company-name {
            margin: 10px 0;
            color: #002A5C;
            text-align: center;
        }

        header .whatsapp-link {
            color: #25D366;
            text-decoration: none;
            padding: 3px 5px;
            display: inline-block;
            font-weight: bold;
        }

        .content-title {
            text-align: center;
            margin: 10px 0;
        }

        .list-date {
            color: #343A40;
            font-style: italic;
            font-size: 1rem;
            padding: 0 10px;
        }

        .table-body {
            min-height: 350px;
        }


        .table {
            margin: 0 5px;
            background-color: var(--bg-clr);
            color: var(--txt-clr);
        }

        .table .header-row {
            background-color: var(--tbl-header-bg-clr);
            color: var(--tbl-header-clr);
            font-weight: bold;
            font-size: 1.05rem;
            text-align: center;
        }

        .table .row {
            display: grid;
            grid-template-columns: 3.25fr 1.25fr 1.25fr 1.5fr;
            padding: 3px 0;
        }

        .row:not(:has(input:focus)) .cell:has(img) {
            display: none;
        }

        .cell:has(img) {
            grid-column: span 4;
            width: 300px;
            padding: 5px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 5px auto;
        }

        .cell img {
            border-radius: 15px;
            box-shadow: 0 0 5px 0 grey;
            width: 100%;
            aspect-ratio: 1 / 1;
        }

        .table .data-row+.category-row {
            margin-top: 10px;
        }

        .table .category-row {
            font-weight: bols;
            font-size: 1.2rem;
            color: white;
            padding: 5px 0;
            text-align: center;
            background-color: rgba(0, 123, 255, 0.4);
            text-shadow: 0 0 5px #002A5C;

        }

        .table .data-row:nth-child(even) {
            background-color: var(--even-row-bg-clr);
        }

        .data-row:has(input:focus) {
            margin: 15px 0;
            border: 2px solid #007BFF;
            border-radius: 3px;
            padding: 5px;
        }

        .table:has(input:focus) .header-row .cell:last-child {
            display: none;
        }

        .table:has(input:focus) .data-row:not(:has(input:focus)) {
            filter: blur(0.5px);
        }

        .data-row:has(input:focus) .cell:last-child {
            background-color: var(--tbl-header-bg-clr);
            text-align: center;
            color: #007BFF;
        }

        .cell:last-child {
            font-weight: bold;
        }

        .cell:not(:has(input)) {
            padding: 3px;
        }

        .data-row .cell:nth-child(3) {
            color: red !important;
        }

        .data-row .cell:nth-child(3)::after {
            content: '%';
        }

        .content-title {
            display: flex;
            justify-content: center;
            align-items: center;
        }


        .data-row.prioritized .cell:nth-child(2)::before {
            content: '🔥';
        }
    </style>
</head>

<body>
    <div class="app">
        <header>
            <h1 class="company-name">${data.companyName}</h1>
            <p class="company-description">${data.companyDescription}</p>
            <p class="company-address">Address: ${data.companyAddress}</p>
            <p>Phone: <a class="whatsapp-link" href="https://wa.me/${data.phoneNumber}">${data.phoneNumber}</a></p>
        </header>
        <main>
            <h2 class="content-title">Product Offers<p class="list-date">(${data.listDate})</p>
            </h2>
            <div class="table">
                <div class="header-row row">
                    <div class="cell">Product Name</div>
                    <div class="cell">Rate</div>
                    <div class="cell">Disc.(%)</div>
                    <div class="cell">Description</div>
                </div>
                <div class="table-body">
                    ${Object.keys(data.products).map(category => {
                        return `
                                <div class="category-row">${category}</div>
                                ${data.products[category].map(p => `
                                        <div class="data-row row">
                                            <div class="cell">${p.name}</div>
                                            <div class="cell">${p.rate}</div>
                                            <div class="cell">${p.discount}</div>
                                            <div class="cell">${p.description}</div>
                                        </div>
                                `).join('')}`;
                    }).join('')
                        }
                </div>
            </div>
        </main>
</body>

</html>`;
    window.electron.saveHTML(filename, output, outputDir);
    showDialogue("Static File Exported")
}
async function exportProductList() {
    let filename = document.getElementById('file-name').value;
    const jsCode = await getExportDataObject();
    const outputDir = company.outputDir;
    if (!filename) {
        showDialogue("List name cannot be empty", "error");
        return;
    }
    filename = sanitizeFileName(filename);
    if (!filename) {
        showDialogue("List name is invalid", "error");
        return;
    }
    if (!outputDir) {
        showDialogue("Invalid Output Directory", "error");
        return;
    }
    if (!jsCode) {
        showDialogue("Code file not found", "error");
        return;
    }

    window.electron.injectJsAndSaveFile(filename, outputDir, jsCode)
        .then(() => {
            showDialogue(`File exported as ${filename}`, "success");
            closeExportWindow();
        })
        .catch((error) => {
            showDialogue("Error saving the file", "error");
            console.error(error);
        });
}
function openImportWindow() {
    company.updateSettingsWindow();
    document.querySelector('.import-window').classList.add('active-window');
    document.querySelector('.import-window .import-settings').append(...(
        document.querySelectorAll('.settings-window .import-settings div[class$="settings-option"]')
    ));
}
function closeImportWindow() {
    document.querySelector('.import-window').classList.remove('active-window');
    document.querySelector('.settings-window .import-settings .settings-options').append(...(
        document.querySelectorAll('.import-window .import-settings div[class$="settings-option"]')
    ));
}
function getImportSettings() {
    return ({
        removeLowStock: document.getElementById('remove-low-stock-toggle').getAttribute("on") == "true",
        lowStockLimit: parseInt(document.getElementById('low-stock-limit').value) || 0,
        updateStock: document.getElementById('update-stock-toggle').getAttribute("on") == "true",
        updateDiscount: document.getElementById('update-discount-toggle').getAttribute("on") == "true",
        addNewProducts: document.getElementById('add-new-products-toggle').getAttribute("on") == "true",
        updateRates: document.getElementById('update-rates-toggle').getAttribute("on") == "true"
    });
}
async function importData() {
    const settings = getImportSettings();
    const inputDir = company.inputDir;
    const dbFileName = company.dbFileName;
    if (inputDir && dbFileName) {
        const data = await window.electron.importProductData(dbFileName, inputDir, settings);
        company = parseCompany(data);
        if (data) {
            company.updateListMarkupOptions();
            company.updateCategoriesFilters();
            company.updateDataTable();
            company.lastUpdated = new Date().toLocaleString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            }).replace(',', '');

            showDialogue("Data Imported", "success");
            openImportWindowBtn.setAttribute("title", "Last Imported : " + company.lastUpdated);
            closeImportWindow();
        }
    } else {
        showDialogue("Set Input Directory and Database File Name", "error");
    }
}
function filterCategoriesResults(e) {
    const checkbox = e ? e.currentTarget : { checked: true };
    const category = checkbox.value;
    const rows = Array.from(document.querySelectorAll(`.table-category-container[data-category-value="${category}"] .data-row`));
    if (checkbox.checked) {
        rows.forEach(row => row.classList.remove('hide'));
    } else {
        rows.forEach(row => row.classList.add('hide'));
    }
    company.filterSearchResults();
}
function setMainTotalProducts() {
    const products = Array.from(document.querySelectorAll('.data-row'));
    const shown = document.querySelectorAll('.main-body .data-row:not(.hide)');
    document.querySelector('.main-total-products').textContent = `(${shown.length} / ${products.length})`;
}
function closeTransferListWindow() {
    document.querySelector('.active-window').classList.remove('active-window');
    document.querySelector('.create-list-window .body').innerHTML = '';
    const rows = Array.from(document.getElementsByClassName('data-row'));
    if (rows.length != company.selectedList().length) {
        company.updateDataTable();
    }
}
function setImagAddressofSameProducts(p) {
    const product = company.products.getProductByName(p.name);
    product.imgAddress = p.imgAddress;
    company.lists.forEach(list => {
        const product = list.getProductByName(p.name);
        product.imgAddress = p.imgAddress;
    });
}



newProductBtn.addEventListener('click', openNewProductWindow);
saveProductBtn.addEventListener('click', createNewProduct);
resetProductBtn.addEventListener('click', resetProductForm);
closeProductWinBtn.addEventListener('click', closeNewProductWindow);

manageCategoryBtn.addEventListener('click', openCategoryWindow)
closeCategoryWinBtn.addEventListener('click', closeCategoryWindow)
newCategoryBtn.addEventListener('click', createNewCategory);

manageListsBtn.addEventListener('click', openListWindow);
closeListWinBtn.addEventListener('click', closeListWindow);
newListBtn.addEventListener('click', createNewList);

closeTransferListWinBtn.addEventListener('click', closeTransferListWindow);

listSelect.addEventListener('change', () => { company.updateCategoriesFilters(); company.updateDataTable() });
searchBox.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        company.filterSearchResults();
    } else if (e.key === 'Backspace' && e.currentTarget.value.length < 2) {
        e.currentTarget.value = '';
        company.filterSearchResults();
        setMainTotalProducts();
    }
});

searchBox2.addEventListener('keyup', () => company.updateTransferProducts());
selectAllCheckBox.addEventListener('change', selectAllProducts);
transferBtn.addEventListener('click', () => company.transferProducts());
sourceList.addEventListener('change', handleChangedSourceList);
destinationList.addEventListener('change', handleChangedDestinaionList);

unlockInputs.addEventListener('change', handleUnlockingInputs)
openCategoryPanelBtn.addEventListener('click', handleOpeningCategoryPanel)
closeCategoryPanelBtn.addEventListener('click', handleClosingCategoryPanel)
openSettingsWindowBtn.addEventListener('click', openSettingsWindow);
closeSettingsWindowBtn.addEventListener('click', closeSettingsWindow);
resetSettingsBtn.addEventListener('click', () => company.updateSettingsWindow());
openExportWindowBtn.addEventListener('click', openExportWindow);
closeExportWindowBtn.addEventListener('click', closeExportWindow);
saveSettingsBtn.addEventListener('click', () => company.updateSettings())
setInputDirBtn.addEventListener('click', setInputPath);
setOutputDirBtn.addEventListener('click', setOutputPath);
selectImageBtn.addEventListener('click', handleImageSelection);
resetExportFormBtn.addEventListener('click', resetExportForm);
exportBtn.addEventListener('click', exportProductList);
exportStaticBtn.addEventListener('click', exportStaticProductList);
openImportWindowBtn.addEventListener('click', openImportWindow);
closeImportWindowBtn.addEventListener('click', closeImportWindow);
importBtn.addEventListener('click', importData);
resetImportForm.addEventListener('click', () => company.updateSettingsWindow());
Array.from(document.querySelectorAll('button[id$="toggle"]')).forEach(toggleBtn => {
    toggleBtn.addEventListener('click', changeToggleValue);
});
Array.from(document.querySelectorAll('.settings-window .settings-category:not(:nth-child(2)) input,#input-db')).forEach(input => {
    const relatedBtn = input.closest('[class$="settings-option"]').querySelector('button');
    relatedBtn.addEventListener('click', () => { input.disabled = false; input.focus(); });
});

const tableBody = document.querySelector('.main-body .body');
tableBody.addEventListener("dragover", (e) => {
    const row = e.target.closest(".data-row");
    if (!row) return;

    e.preventDefault();
    row.classList.add("drag-over");
});

tableBody.addEventListener("dragleave", (e) => {
    const row = e.target.closest(".data-row");
    if (!row) return;

    row.classList.remove("drag-over");
});

tableBody.addEventListener("drop", async (e) => {
    let row = null;
    if (e.target.classList.contains('data-row')) {
        row = e.target;
    } else {
        row = e.target.closest(".data-row");
    }
    if (!row || !row.querySelector(".product-name")) return;

    e.preventDefault();
    row.classList.remove("drag-over");

    const textData = e.dataTransfer.getData("text/plain");
    const files = e.dataTransfer.files;

    const productName = row.getAttribute("data-value");
    const product = company.selectedList().getProductByName(productName);

    if (!product) return;

    if (textData && company.categories.includes(textData)) {
        product.categories[0] = textData;
        product.updateCategoryParent(textData, row);

        if (company.selectedList().getProductsByCategory(textData).length == 1) {
            addOptiontoCategoryFilters(textData);
        }
        saveCompanyData(company);
        showDialogue(`"${textData}" Assigned to  ${product.name}?`, "success");
    }
    if (files.length > 0) {
        if (files[0].type.startsWith("image/")) {
            await product.saveDroppedImage(files[0]);
            saveCompanyData(company);
            row.classList.add('img-data-row');
        }
    }
});


(async () => {
    try {
        const path = await window.electron.getCompanyJsonPath();

        const data = await loadData(path);
        company = parseCompany(data) || new Company();
    } catch {
        company = new Company();
    }

    if (!company.isCompanySettedup()) {
        showConfirmationDialogue("Welcome", "Setup First to get Started", { "Ok": companySetUp });
        saveCompanyData(company);
    }
    company.updateListMarkupOptions();
    openImportWindowBtn.setAttribute("title", `Last Imported: ${!company.lastUpdated ? 'never' : company.lastUpdated}`);
})();
