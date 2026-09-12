Ext.define('PVE.grid.ResourceGrid', {
    extend: 'Ext.grid.GridPanel',
    alias: ['widget.pveResourceGrid'],

    border: false,
    defaultSorter: {
        property: 'type',
        direction: 'ASC',
    },
    userCls: 'proxmox-tags-full',
    initComponent: function () {
        let me = this;

        let rstore = PVE.data.ResourceStore;

        let store = Ext.create('Ext.data.Store', {
            model: 'PVEResources',
            sorters: me.defaultSorter,
            proxy: {
                type: 'memory',
            },
        });

        let textfilter = '';
        let textfilterMatch = function (item) {
            for (const field of ['name', 'storage', 'node', 'type', 'text']) {
                let v = item.data[field];
                if (v && v.toLowerCase().indexOf(textfilter) >= 0) {
                    return true;
                }
            }
            // reuse existing tag handling for filtering
            if (item.data.tags) {
                let tags = item.data.tags.split(/[;, ]/);
                for (let tag of tags) {
                    if (tag && tag.toLowerCase().indexOf(textfilter) >= 0) {
                        return true;
                    }
                }
            }
            return false;
        };

        let buildColumnMenu = function () {
            // Reuse existing default columns, preserve defaults, persist via grid state.
            let columns = me.headerCt ? me.headerCt.getGridColumns() : [];
            let items = [];
            columns.forEach(function (col) {
                if (!col.dataIndex) {
                    return;
                }
                let header = col.text || col.header || col.dataIndex;
                items.push({
                    text: header,
                    dataIndex: col.dataIndex,
                    checked: !col.hidden,
                    disabled: col.hideable === false,
                    hideOnClick: false,
                    checkHandler: function (item, checked) {
                        let target = me.headerCt
                            .getGridColumns()
                            .find((c) => c.dataIndex === item.dataIndex);
                        if (target) {
                            target.setVisible(checked);
                        }
                    },
                });
            });
            return items;
        };

        let updateGrid = function () {
            var filterfn = me.viewFilter ? me.viewFilter.filterfn : null;

            store.suspendEvents();

            let nodeidx = {};
            let gather_child_nodes;
            gather_child_nodes = function (node) {
                if (!node || !node.childNodes) {
                    return;
                }
                for (let child of node.childNodes) {
                    let orgNode = rstore.data.get(child.data.realId ?? child.data.id);
                    if (orgNode) {
                        if (
                            (!filterfn || filterfn(child)) &&
                            (!textfilter || textfilterMatch(child))
                        ) {
                            nodeidx[child.data.id] = orgNode;
                        }
                    }
                    gather_child_nodes(child);
                }
            };
            gather_child_nodes(me.pveSelNode);

            // remove vanished items
            let rmlist = [];
            store.each((olditem) => {
                if (!nodeidx[olditem.data.id]) {
                    rmlist.push(olditem);
                }
            });
            if (rmlist.length) {
                store.remove(rmlist);
            }

            // add new items
            let addlist = [];
            for (const [_key, item] of Object.entries(nodeidx)) {
                // getById() use find(), which is slow (ExtJS4 DP5)
                let olditem = store.data.get(item.data.id);
                if (!olditem) {
                    addlist.push(item);
                    continue;
                }
                let changes = false;
                for (let field of PVE.data.ResourceStore.fieldNames) {
                    if (field !== 'id' && item.data[field] !== olditem.data[field]) {
                        changes = true;
                        olditem.beginEdit();
                        olditem.set(field, item.data[field]);
                    }
                }
                if (changes) {
                    olditem.endEdit(true);
                    olditem.commit(true);
                }
            }
            if (addlist.length) {
                store.add(addlist);
            }
            store.sort();
            store.resumeEvents();
            store.fireEvent('refresh', store);
        };

        let getSelectedGuests = function () {
            let sm = me.getSelectionModel();
            let selection = sm ? sm.getSelection() : [];
            return selection.filter(
                (rec) =>
                    rec &&
                    rec.data &&
                    (rec.data.type === 'qemu' || rec.data.type === 'lxc') &&
                    Ext.isNumeric(rec.data.vmid) &&
                    !rec.data.template,
            );
        };

        let updateBulkButtons = function () {
            if (!me.rendered) {
                return;
            }
            let guests = getSelectedGuests();
            let caps = Ext.state.Manager.get('GuiCap');
            let canPower = !!caps.vms['VM.PowerMgmt'];
            let count = guests.length;
            let running = guests.filter((r) => r.data.status === 'running').length;
            let stopped = count - running;
            me.down('#bulkInfo').setText(
                count ? Ext.String.format(gettext('Selected: {0}'), count) : '',
            );
            me.down('#bulkStart').setDisabled(!canPower || stopped === 0);
            me.down('#bulkShutdown').setDisabled(!canPower || running === 0);
            me.down('#bulkReboot').setDisabled(!canPower || running === 0);
            me.down('#bulkStop').setDisabled(!canPower || running === 0);
        };

        let showBulkResult = function (action, results) {
            let lines = results.map(function (r) {
                let label = Ext.htmlEncode(
                    `${r.type === 'lxc' ? 'CT' : 'VM'} ${r.vmid}${r.name ? ' (' + r.name + ')' : ''}`,
                );
                if (r.ok) {
                    return `${label} &nbsp; &#10003;`;
                }
                // response.htmlStatus is pre-encoded framework HTML, rendered
                // unescaped like every other Proxmox error dialog.
                let err = r.error || Ext.htmlEncode(gettext('Failed'));
                return `${label} &nbsp; &#10007; ${err}`;
            });
            let actionText = action === 'reboot' ? gettext('Reboot') : gettext('Stop');
            Ext.Msg.show({
                title: Ext.String.format(gettext('Bulk {0}'), actionText),
                msg: `<div style="max-height:300px;overflow:auto;">${lines.join('<br>')}</div>`,
                buttons: Ext.Msg.OK,
                icon: Ext.Msg.INFO,
            });
        };

        let doBulkStartShutdown = function (action) {
            let guests = getSelectedGuests();
            // Only send compatible operations: start stopped, shutdown running.
            let eligible =
                action === 'start'
                    ? guests.filter((r) => r.data.status !== 'running')
                    : guests.filter((r) => r.data.status === 'running');
            if (!eligible.length) {
                Ext.Msg.alert(gettext('Info'), gettext('No compatible guests selected.'));
                return;
            }
            let vms = eligible.map((r) => r.data.vmid);
            let msg =
                action === 'start'
                    ? Ext.String.format(gettext('Start {0} guest(s)?'), vms.length)
                    : Ext.String.format(gettext('Shutdown {0} guest(s)?'), vms.length);
            Ext.Msg.confirm(gettext('Confirm'), msg, function (btn) {
                if (btn !== 'yes') {
                    return;
                }
                Proxmox.Utils.API2Request({
                    url: `/cluster/bulk-action/guest/${action === 'start' ? 'start' : 'shutdown'}`,
                    method: 'POST',
                    params: { vms: vms },
                    failure: (response) => Ext.Msg.alert('Error', response.htmlStatus),
                    success: function ({ result }) {
                        Ext.create('Proxmox.window.TaskViewer', {
                            autoShow: true,
                            upid: result.data,
                        });
                    },
                });
            });
        };

        let doBulkPerGuest = function (action) {
            let guests = getSelectedGuests().filter((r) => r.data.status === 'running');
            if (!guests.length) {
                Ext.Msg.alert(gettext('Info'), gettext('No running guests selected.'));
                return;
            }
            let msg =
                action === 'reboot'
                    ? Ext.String.format(gettext('Reboot {0} guest(s)?'), guests.length)
                    : Ext.String.format(gettext('Stop {0} guest(s)?'), guests.length);
            Ext.Msg.confirm(gettext('Confirm'), msg, function (btn) {
                if (btn !== 'yes') {
                    return;
                }
                let pending = guests.length;
                let results = [];
                guests.forEach(function (rec) {
                    let type = rec.data.type;
                    let vmid = rec.data.vmid;
                    let node = rec.data.node;
                    Proxmox.Utils.API2Request({
                        url: `/nodes/${node}/${type}/${vmid}/status/${action}`,
                        method: 'POST',
                        success: function () {
                            results.push({ vmid: vmid, name: rec.data.name, type: type, ok: true });
                            if (--pending === 0) {
                                showBulkResult(action, results);
                            }
                        },
                        failure: function (response) {
                            results.push({
                                vmid: vmid,
                                name: rec.data.name,
                                type: type,
                                ok: false,
                                error: response.htmlStatus,
                            });
                            if (--pending === 0) {
                                showBulkResult(action, results);
                            }
                        },
                    });
                });
            });
        };

        Ext.apply(me, {
            store: store,
            stateful: true,
            stateId: 'grid-resource',
            selModel: {
                selType: 'checkboxmodel',
                mode: 'SIMPLE',
            },
            tbar: [
                {
                    text: gettext('Columns'),
                    iconCls: 'fa fa-columns',
                    tooltip: gettext('Choose which columns are displayed'),
                    menu: {
                        listeners: {
                            beforeshow: function (menu) {
                                menu.removeAll();
                                menu.add(buildColumnMenu());
                            },
                        },
                    },
                },
                '->',
                gettext('Search') + ':',
                ' ',
                {
                    xtype: 'textfield',
                    width: 200,
                    value: textfilter,
                    enableKeyEvents: true,
                    emptyText: gettext('Name, node, tag, ...'),
                    listeners: {
                        buffer: 500,
                        keyup: function (field, e) {
                            textfilter = field.getValue().toLowerCase();
                            updateGrid();
                        },
                    },
                },
            ],
            bbar: [
                {
                    xtype: 'tbtext',
                    itemId: 'bulkInfo',
                    text: '',
                },
                '->',
                {
                    text: gettext('Start'),
                    itemId: 'bulkStart',
                    iconCls: 'fa fa-play',
                    disabled: true,
                    handler: () => doBulkStartShutdown('start'),
                },
                {
                    text: gettext('Shutdown'),
                    itemId: 'bulkShutdown',
                    iconCls: 'fa fa-power-off',
                    disabled: true,
                    handler: () => doBulkStartShutdown('shutdown'),
                },
                {
                    text: gettext('Reboot'),
                    itemId: 'bulkReboot',
                    iconCls: 'fa fa-refresh',
                    disabled: true,
                    handler: () => doBulkPerGuest('reboot'),
                },
                {
                    text: gettext('Stop'),
                    itemId: 'bulkStop',
                    iconCls: 'fa fa-stop',
                    disabled: true,
                    handler: () => doBulkPerGuest('stop'),
                },
            ],
            viewConfig: {
                stripeRows: true,
            },
            listeners: {
                itemcontextmenu: PVE.Utils.createCmdMenu,
                itemdblclick: function (v, record) {
                    var ws = me.up('pveStdWorkspace');
                    ws.selectById(record.data.id);
                },
                afterrender: function () {
                    updateGrid();
                    updateBulkButtons();
                },
                selectionchange: function () {
                    updateBulkButtons();
                },
            },
            columns: rstore.defaultColumns(),
        });
        me.callParent();
        me.mon(rstore, 'load', () => updateGrid());
    },
});
