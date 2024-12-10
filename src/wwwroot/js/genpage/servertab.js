class ExtensionsManager {
    constructor() {
        this.newInstallsCard = getRequiredElementById('extensions_installed_card');
    }

    installExtension(name, button) {
        button.disabled = true;
        let infoDiv = createDiv(null, 'installing_info', 'Installing (check server logs for details)...');
        button.parentElement.querySelectorAll('.installing_info').forEach(e => e.remove());
        button.parentElement.appendChild(infoDiv);
        genericRequest('InstallExtension', {'extensionName': name}, data => {
            button.parentElement.innerHTML = 'Installed, restart to load';
            this.newInstallsCard.style.display = 'block';
        }, 0, e => {
            infoDiv.innerText = 'Failed to install: ' + e;
            button.disabled = false;
        });
    }

    restartServer() {
        let restartButton = getRequiredElementById('extension_restart_button');
        restartButton.disabled = true;
        restartButton.parentElement.appendChild(createDiv(null, null, 'Restarting server... please wait a moment then refresh the page'));
        genericRequest('UpdateAndRestart', {'force': true}, data => {});
    }

    updateExtension(name, button) {
        button.disabled = true;
        button.parentElement.querySelectorAll('.installing_info').forEach(e => e.remove());
        let infoDiv = createDiv(null, 'installing_info', 'Updating (check server logs for details)...');
        button.parentElement.appendChild(infoDiv);
        genericRequest('UpdateExtension', {'extensionName': name}, data => {
            if (data.success) {
                button.parentElement.innerHTML = 'Updated, restart to load';
                this.newInstallsCard.style.display = 'block';
            }
            else {
                button.disabled = false;
                infoDiv.innerText = 'No update available';
            }
        }, 0, e => {
            infoDiv.innerText = 'Failed to update: ' + e;
            button.disabled = false;
        });
    }

    uninstallExtension(name, button) {
        button.disabled = true;
        button.parentElement.querySelectorAll('.installing_info').forEach(e => e.remove());
        let infoDiv = createDiv(null, 'installing_info', 'Uninstalling (check server logs for details)...');
        button.parentElement.appendChild(infoDiv);
        genericRequest('UninstallExtension', {'extensionName': name}, data => {
            button.parentElement.innerHTML = 'Uninstalled, restart to apply';
            this.newInstallsCard.style.display = 'block';
        }, 0, e => {
            infoDiv.innerText = 'Failed to uninstall: ' + e;
            button.disabled = false;
        });
    }
}

extensionsManager = new ExtensionsManager();

class UserAdminManager {
    constructor() {
        this.tabButton = getRequiredElementById('manageusersbutton');
        this.tabButton.addEventListener('click', () => this.onTabButtonClick());
        this.leftBoxRoleList = getRequiredElementById('manage_users_leftbox_content_rolelist');
        this.leftBoxUserList = getRequiredElementById('manage_users_leftbox_content_userlist');
        this.rightBox = getRequiredElementById('manage_users_rightbox_content');
        this.addUserMenuInputs = getRequiredElementById('add_user_menu_inputs');
        this.addUserMenuInputs.innerHTML =
            makeGenericPopover('addusermenu_name', 'Username', 'text', "The name to give to the user.\nThis will be used as a unique lookup ID, so keep it simple.\nNo funky symbols, spaces, etc.", '')
            + makeTextInput(null, 'addusermenu_name', '', 'Username', '', '', 'normal', "New user's name...", false, false, true)
            + makeGenericPopover('addusermenu_pass', 'Password', 'text', "Initial password to give to the user. The user will be asked to change this immediately after logging in automatically.", '')
            + makeTextInput(null, 'addusermenu_pass', '', 'Password', '', '', 'password', "New user's password...", false, false, true)
            + makeGenericPopover('addusermenu_role', 'Role', 'dropdown', "Initial role to give to the user. This can be changed later.", '')
            + makeDropdownInput(null, 'addusermenu_role', '', 'Role', '', ['user', 'guest'], 'user', false, true, ['User', 'Guest']);
        this.addUserNameInput = getRequiredElementById('addusermenu_name');
        this.addUserPassInput = getRequiredElementById('addusermenu_pass');
        this.addUserRoleInput = getRequiredElementById('addusermenu_role');
        this.addRoleMenuInputs = getRequiredElementById('add_role_menu_inputs');
        this.addRoleMenuInputs.innerHTML =
            makeGenericPopover('addrolemenu_name', 'Role Name', 'text', "The name to give to the role.\nThis will be used as a unique lookup ID, so keep it simple.\nNo funky symbols, spaces, etc.", '')
            + makeTextInput(null, 'addrolemenu_name', '', 'Role Name', '', '', 'normal', "New role's name...", false, false, true);
        this.addRoleNameInput = getRequiredElementById('addrolemenu_name');
        this.displayedRole = null;
        this.displayedUser = null;
    }

    onTabButtonClick() {
        this.rebuildRoleList();
        this.setRightboxDefault();
        genericRequest('AdminListUsers', {}, data => {
            let html = '';
            for (let user of data.users) {
                html += `<div class="admin-user-manage-name" onclick="userAdminManager.clickUser('${escapeHtml(user)}')" title="Click to manage user '${escapeHtml(user)}'">${escapeHtml(user)}</div>`;
            }
            this.leftBoxUserList.innerHTML = html;
        });
    }

    setNothingDisplayed() {
        this.displayedRole = null;
        this.displayedUser = null;
    }

    setStaticRightBox(html) {
        this.setNothingDisplayed();
        this.rightBox.innerHTML = html;
    }

    setRightboxDefault() {
        this.setStaticRightBox(`<span class="translate">Welcome, admin! Select a user on the left to configure them.</span><br><br><b>THIS IS A PLACEHOLDER, IT DOES NOT WORK YET</b>`);
    }

    setRightboxLoading() {
        this.setStaticRightBox(`<span class="translate">Loading...</span><div class="loading-spinner-parent"><div class="loading-spinner"><div class="loadspin1"></div><div class="loadspin2"></div><div class="loadspin3"></div></div></div>`);
        uiImprover.runLoadSpinner(this.rightBox);
    }

    clickUser(name) {
        this.setRightboxLoading();
        // TODO
    }

    clickRole(roleId) {
        this.setRightboxLoading();
        // TODO
        genericRequest('AdminListRoles', {}, data => {
            if (!(roleId in data.roles)) {
                this.setStaticRightBox(`<span class="translate">Role not found, something went wrong</span>`);
                return;
            }
            let role = data.roles[roleId];
            let html = `<div class="admin-user-right-titlebar">Role: <span class="admin-user-right-titlebar-name">${escapeHtml(role.name)}</span></div>`
                + (role.is_auto_generated ? `<div class="admin-user-manage-notice translate">This is an auto-generated role. It may not be deleted, and some automations may apply to it (such as new permissions automatically enabling when first loaded).</div>` : `<button type="button" class="basic-button translate" onclick="userAdminManager.deleteRole('${escapeHtml(roleId)}')">Delete Role</button>`)
                + '<br><br>'
                + makeGenericPopover('adminrolemenu_description', 'Description', 'text', "Human-readable description text about this role.\nThis is for admin reference when picking roles.\nProbably describe here when/why a user should receive this role, and a short bit about what it unlocks.", '')
                + makeTextInput(null, 'adminrolemenu_description', '', 'Description', '', '', 'big', "Role description...", false, false, true)
                + makeGenericPopover('adminrolemenu_maxoutpathdepth', 'Max OutPath Depth', 'number', "How many directories deep a user's custom OutPath can be.\nDefault is 5.\nThis is just a minor protection to avoid filesystem corruption. Higher values are perfectly fine in most cases.\nThe actual limit applied to a user is whatever the highest value of all their roles is.", '')
                + makeNumberInput(null, 'adminrolemenu_maxoutpathdepth', '', 'Max OutPath Depth', '', 5, 1, 100, 1, 'normal', false, true)
                + makeGenericPopover('adminrolemenu_maxt2isimultaneous', 'Max T2I Simultaneous', 'number', "How many images this user can have actively generating at once.\nDefault is 32.\nThis is naturally sub-limited by the number of available backends.\nThis is a protection for many-backend servers, to guarantee one user cannot steal all backends at once.\nYou can set this to a very low value if you have few backends but many users.\nSet this to a very high value if you have many backends and no concern for their distribution.\nThe actual limit applied to a user is whatever the highest value of all their roles is.", '')
                + makeNumberInput(null, 'adminrolemenu_maxt2isimultaneous', '', 'Max T2I Simultaneous', '', 32, 1, 10000, 1, 'normal', false, true)
                + makeGenericPopover('adminrolemenu_allowunsafeoutpaths', 'Allow Unsafe OutPaths', 'checkbox', "Whether the '.' symbol can be used in OutPath - if enabled, users may cause file system issues or perform folder escapes.", '')
                + makeCheckboxInput(null, 'adminrolemenu_allowunsafeoutpaths', '', 'Allow Unsafe OutPaths', '', false, false, true)
                + makeGenericPopover('adminrolemenu_modelwhitelist', 'Model Whitelist', 'text', "What models are allowed, as a list of prefixes.\nFor example 'sdxl/' allows only models in the SDXL folder.\nOr, 'sdxl/,flux/' allows models in the SDXL or Flux folders.\nIf empty, no whitelist logic is applied.\nNote that blacklist is 'more powerful' than whitelist and overrides it.\nThis stacks between roles, roles can add whitelist entries together.", '')
                + makeTextInput(null, 'adminrolemenu_modelwhitelist', '', 'Model Whitelist', '', '', 'normal', "Model Whitelist...", false, false, true)
                + makeGenericPopover('adminrolemenu_modelblacklist', 'Model Blacklist', 'text', "What models are forbidden, as a list of prefixes.\nFor example 'sdxl/' forbids models in the SDXL folder.\nOr, 'sdxl/,flux/' forbids models in the SDXL or Flux folders.\nIf empty, no blacklist logic is applied.\nNote that blacklist is 'more powerful' than whitelist and overrides it.\nThis stacks between roles, roles can add blacklist entries together.", '')
                + makeTextInput(null, 'adminrolemenu_modelblacklist', '', 'Model Blacklist', '', '', 'normal', "Model Blacklist...", false, false, true)
                + '<br><br>';
            this.setNothingDisplayed();
            this.displayedRole = roleId;
            this.rightBox.innerHTML = html;
            let descriptionBox = getRequiredElementById('adminrolemenu_description');
            descriptionBox.value = role.description;
            dynamicSizeTextBox(descriptionBox);
            getRequiredElementById('adminrolemenu_maxoutpathdepth').value = role.max_outpath_depth;
            getRequiredElementById('adminrolemenu_maxt2isimultaneous').value = role.max_t2i_simultaneous;
            getRequiredElementById('adminrolemenu_allowunsafeoutpaths').checked = role.allow_unsafe_outpaths;
            getRequiredElementById('adminrolemenu_modelwhitelist').value = role.model_whitelist.join(', ');
            getRequiredElementById('adminrolemenu_modelblacklist').value = role.model_blacklist.join(', ');
            // TODO: Permissions list
            // TODO: cancel/save changes
        });
    }

    deleteRole(roleId) {
        if (!confirm(`Are you sure you want to delete the role '${roleId}'?\nThis action cannot be undone.`)) {
            return;
        }
        genericRequest('AdminDeleteRole', {'name': roleId}, data => {
            this.rebuildRoleList();
            this.setStaticRightBox(`<span class="translate">Role deleted successfully</span>`);
        });
    }

    rebuildRoleList() {
        if (!permissions.hasPermission('configure_roles')) {
            return;
        }
        genericRequest('AdminListRoles', {}, data => {
            let selected = this.addUserRoleInput.value;
            let roleListHtml = '';
            let optionListHtml = '';
            for (let roleId of Object.keys(data.roles)) {
                let role = data.roles[roleId];
                roleListHtml += `<div class="admin-user-manage-name" onclick="userAdminManager.clickRole('${escapeHtml(roleId)}')" title="${escapeHtml(role.description)}">${escapeHtml(role.name)}</div>`;
                optionListHtml += `<option value="${escapeHtml(roleId)}" title="${escapeHtml(role.description)}">${escapeHtml(role.name)}</option>`;
            }
            this.leftBoxRoleList.innerHTML = roleListHtml;
            this.addUserRoleInput.innerHTML = optionListHtml;
            this.addUserRoleInput.value = selected;
        });
    }

    showAddUserMenu() {
        this.addUserNameInput.value = '';
        this.addUserPassInput.value = '';
        this.addUserRoleInput.value = 'user';
        this.rebuildRoleList();
        $('#server_add_user_menu').modal('show');
    }

    addUserMenuSubmit() {
        let name = this.addUserNameInput.value;
        if (!name) {
            alert('Please fill in the name field, or cancel');
            return;
        }
        let pass = this.addUserPassInput.value;
        let role = this.addUserRoleInput.value;
        if (!pass) {
            alert('Please fill in the password field, or cancel');
            return;
        }
        $('#server_add_user_menu').modal('hide');
        genericRequest('AdminAddUser', {'name': name, 'password': pass, 'role': role}, data => {
            this.onTabButtonClick();
        });
    }

    showAddRoleMenu() {
        this.addRoleNameInput.value = '';
        this.rebuildRoleList();
        $('#server_add_role_menu').modal('show');
    }

    addRoleMenuSubmit() {
        let name = this.addRoleNameInput.value;
        if (!name) {
            alert('Please fill in the name field, or cancel');
            return;
        }
        $('#server_add_role_menu').modal('hide');
        genericRequest('AdminAddRole', {'name': name}, data => {
            this.rebuildRoleList();
        });
    }
}

userAdminManager = new UserAdminManager();

//// TODO: Put these in classes

let shutdownConfirmationText = translatable("Are you sure you want to shut SwarmUI down?");

function shutdown_server() {
    if (confirm(shutdownConfirmationText.get())) {
        genericRequest('ShutdownServer', {}, data => {
            close();
        });
    }
}

let restartConfirmationText = translatable("Are you sure you want to update and restart SwarmUI?");
let checkingForUpdatesText = translatable("Checking for updates...");

function update_and_restart_server() {
    let noticeArea = getRequiredElementById('shutdown_notice_area');
    noticeArea.style.display = 'block';
    if (confirm(restartConfirmationText.get())) {
        noticeArea.innerText = checkingForUpdatesText.get();
        genericRequest('UpdateAndRestart', {}, data => {
            noticeArea.innerText = data.result;
        }, 0, e => {
            noticeArea.innerText = e;
        });
    }
}

function server_clear_vram() {
    genericRequest('FreeBackendMemory', { 'system_ram': false }, data => {});
}

function server_clear_sysram() {
    genericRequest('FreeBackendMemory', { 'system_ram': true }, data => {});
}
