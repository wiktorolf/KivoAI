const api = typeof browser !== 'undefined' ? browser : chrome;

if (api.sidePanel && api.sidePanel.setPanelBehavior) {
    api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(console.error);
}

if (api.sidebarAction && api.sidebarAction.open) {
    api.action.onClicked.addListener(() => {
        api.sidebarAction.open();
    });
}
