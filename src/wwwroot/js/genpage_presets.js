
let allPresets = [];
let currentPresets = [];

let preset_to_edit = null;

function fixPresetParamClickables() {
    for (let param of gen_param_types) {
        if (param.visible) {
            doToggleEnable(`preset_input_${param.id}`);
        }
    }
}

function getPresetByTitle(title) {
    title = title.toLowerCase();
    return allPresets.find(p => p.title.toLowerCase() == title);
}

function getPresetTypes() {
    return gen_param_types.filter(type => type.visible && (!type.toggleable || getRequiredElementById(`input_${type.id}_toggle`).checked));
}

function clearPresetView() {
    preset_to_edit = null;
    getRequiredElementById('preset_advanced_options_checkbox').checked = false;
    preset_toggle_advanced();
    getRequiredElementById('new_preset_name').value = '';
    getRequiredElementById('preset_description').value = '';
    getRequiredElementById('new_preset_modal_error').value = '';
    getRequiredElementById('new_preset_image').innerHTML = '';
    let enableImage = getRequiredElementById('new_preset_enable_image');
    enableImage.checked = false;
    enableImage.disabled = true;
    for (let type of getPresetTypes()) {
        let presetElem = getRequiredElementById('preset_input_' + type.id);
        if (type.type == "boolean") {
            presetElem.checked = false;
        }
        else if (type.type == "text") {
            presetElem.value = "{value}";
        }
        else {
            presetElem.value = '';
        }
        getRequiredElementById(presetElem.id + '_toggle').checked = false;
        presetElem.disabled = true;
    }
}

function create_new_preset_button() {
    clearPresetView();
    let curImg = document.getElementById('current_image_img');
    if (curImg) {
        let newImg = curImg.cloneNode(true);
        getRequiredElementById('new_preset_image').appendChild(newImg);
        let enableImage = getRequiredElementById('new_preset_enable_image');
        enableImage.checked = true;
        enableImage.disabled = false;
    }
    for (let type of getPresetTypes()) {
        let elem = getRequiredElementById('input_' + type.id);
        let presetElem = getRequiredElementById('preset_input_' + type.id);
        if (type.type == "boolean") {
            presetElem.checked = elem.checked;
        }
        else if (type.type == "text") {
            presetElem.value = "{value} " + elem.value;
        }
        else {
            presetElem.value = elem.value;
        }
    }
    $('#add_preset_modal').modal('show');
    fixPresetParamClickables();
}

function close_create_new_preset() {
    $('#add_preset_modal').modal('hide');
}

function save_new_preset() {
    let errorOut = getRequiredElementById('new_preset_modal_error');
    let name = getRequiredElementById('new_preset_name').value;
    if (name == '') {
        errorOut.innerText = "Must set a Preset Name.";
        return;
    }
    let description = getRequiredElementById('preset_description').value;
    let data = {};
    for (let type of getPresetTypes()) {
        if (!getRequiredElementById(`preset_input_${type.id}_toggle`).checked) {
            continue;
        }
        let elem = getRequiredElementById(`preset_input_${type.id}`);
        if (type.type == "boolean") {
            data[type.id] = elem.checked;
        }
        else {
            data[type.id] = elem.value;
        }
    }
    if (Object.keys(data).length == 0) {
        errorOut.innerText = "Must enable at least one parameter.";
        return;
    }
    if (preset_to_edit) {
        data['image'] = preset_to_edit.preview_image;
        data['is_edit'] = 'true';
    }
    if (getRequiredElementById('new_preset_enable_image').checked) {
        let img = getRequiredElementById('new_preset_image').getElementsByTagName('img')[0].src;
        let index = img.indexOf('/Output/');
        if (index != -1) {
            img = img.substring(index);
        }
        data['image'] = img;
    }
    genericRequest('AddNewPreset', { name: name, description: description, data: data }, data => {
        if (Object.keys(data).includes("preset_fail")) {
            errorOut.innerText = data.preset_fail;
            return;
        }
        loadUserData();
        $('#add_preset_modal').modal('hide');
    });
}

function preset_toggle_advanced() {
    let advancedArea = getRequiredElementById('new_preset_modal_advanced_inputs');
    let toggler = getRequiredElementById('preset_advanced_options_checkbox');
    advancedArea.style.display = toggler.checked ? 'block' : 'none';
    fixPresetParamClickables();
}

function preset_toggle_advanced_checkbox_manual() {
    let toggler = getRequiredElementById('preset_advanced_options_checkbox');
    toggler.checked = !toggler.checked;
    preset_toggle_advanced();
}

function updatePresetList() {
    let view = getRequiredElementById('current_preset_list_view');
    view.innerHTML = '';
    for (let param of gen_param_types) {
        getRequiredElementById(`input_${param.id}`).disabled = false;
        if (param.toggleable) {
            getRequiredElementById(`input_${param.id}_toggle`).disabled = false;
        }
    }
    let overrideCount = 0;
    for (let preset of currentPresets) {
        let div = createDiv(null, 'preset-in-list');
        div.innerText = preset.title;
        let removeButton = createDiv(null, 'preset-remove-button');
        removeButton.innerHTML = '&times;';
        removeButton.title = "Remove this preset";
        removeButton.addEventListener('click', () => {
            currentPresets.splice(currentPresets.indexOf(preset), 1);
            updatePresetList();
        });
        div.appendChild(removeButton);
        view.appendChild(div);
        for (let key of Object.keys(preset.param_map)) {
            let param = gen_param_types.filter(p => p.id == key)[0];
            if (param) {
                if (param.type != "text" || !preset.param_map[key].includes("{value}")) {
                    let elem = getRequiredElementById(`input_${param.id}`);
                    overrideCount += 1;
                    elem.disabled = true;
                    if (param.toggleable) {
                        getRequiredElementById(`input_${param.id}_toggle`).disabled = true;
                    }
                }
            }
        }
    }
    getRequiredElementById('current_presets_wrapper').style.display = currentPresets.length > 0 ? 'inline-block' : 'none';
    getRequiredElementById('preset_info_slot').innerText = ` (${currentPresets.length}, overriding ${overrideCount} params)`;
}

function applyOnePreset(preset) {
    for (let key of Object.keys(preset.param_map)) {
        let param = gen_param_types.filter(p => p.id == key)[0];
        if (param) {
            let elem = getRequiredElementById(`input_${param.id}`);
            if (param.type == "boolean") {
                elem.checked = preset.param_map[key];
            }
            else if (preset.param_map[key].includes("{value}")) {
                elem.value = preset.param_map[key].replace("{value}", elem.value);
            }
            else {
                elem.value = preset.param_map[key];
            }
        }
    }
}

function apply_presets() {
    for (let preset of currentPresets) {
        applyOnePreset(preset);
    }
    currentPresets = [];
    updatePresetList();
}

function editPreset(preset) {
    clearPresetView();
    preset_to_edit = preset;
    getRequiredElementById('new_preset_name').value = preset.title;
    getRequiredElementById('preset_description').value = preset.description;
    let curImg = document.getElementById('current_image_img');
    if (curImg) {
        let newImg = curImg.cloneNode(true);
        getRequiredElementById('new_preset_image').appendChild(newImg);
        let enableImage = getRequiredElementById('new_preset_enable_image');
        enableImage.checked = false;
        enableImage.disabled = false;
    }
    for (let key of Object.keys(preset.param_map)) {
        let type = gen_param_types.filter(p => p.id == key)[0];
        if (type) {
            let presetElem = getRequiredElementById(`preset_input_${type.id}`);
            if (type.type == "boolean") {
                presetElem.checked = preset.param_map[key] == "true";
            }
            else {
                presetElem.value = preset.param_map[key];
            }
            presetElem.disabled = false;
            getRequiredElementById(`preset_input_${type.id}_toggle`).checked = true;
        }
    }
    $('#add_preset_modal').modal('show');
    fixPresetParamClickables();
}

let currPresetMenuPreset = null;

function presetMenuEdit() {
    if (currPresetMenuPreset == null) {
        return;
    }
    editPreset(currPresetMenuPreset);
}

function presetMenuDelete() {
    if (currPresetMenuPreset == null) {
        return;
    }
    if (confirm("Are you sure want to delete that preset?")) {
        genericRequest('DeletePreset', { preset: preset.title }, data => {
            loadUserData();
        });
    }
}

function addPreset(preset) {
    allPresets.push(preset);
    let div = createDiv(null, 'model-block preset-block');
    let img = document.createElement('img');
    img.src = preset.preview_image;
    div.appendChild(img);
    let desc = createDiv(null, 'model-descblock preset-descblock');
    desc.innerText = preset.title + ":\n" + preset.description + "\n";
    let addButton = createDiv(null, 'basic-button');
    addButton.innerText = ' Use ';
    let useClick = () => {
        if (!currentPresets.some(p => p.title == preset.title)) {
            currentPresets.push(preset);
            updatePresetList();
            div.classList.add('preset-block-selected');
            addButton.innerText = ' Remove ';
        }
        else {
            currentPresets.splice(currentPresets.indexOf(preset), 1);
            updatePresetList();
            div.classList.remove('preset-block-selected');
            addButton.innerText = ' Use ';
        }
    };
    addButton.addEventListener('click', useClick);
    img.addEventListener('click', useClick);
    desc.appendChild(addButton);
    let applyButton = createDiv(null, 'basic-button');
    applyButton.innerText = ' Direct Apply ';
    applyButton.addEventListener('click', () => {
        applyOnePreset(preset);
    });
    desc.appendChild(applyButton);
    div.appendChild(desc);
    let menu = createDiv(null, 'model-block-menu-button');
    menu.innerText = '⬤⬤⬤';
    menu.addEventListener('click', () => {
        currPresetMenuPreset = preset;
        doPopover('presetmenu');
    });
    div.appendChild(menu);
    div.title = Object.keys(preset.param_map).map(key => `${key}: ${preset.param_map[key]}`).join('\n');
    getRequiredElementById('preset_list').appendChild(div);
}
