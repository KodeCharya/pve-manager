/*
 *  This is a global search field it loads the /cluster/resources on focus and displays the
 *  result in a floating grid. Filtering and sorting is done in the customFilter function
 *
 *  Accepts key up/down and enter for input, and it opens to CTRL+K, CTRL+SHIFT+F and CTRL+SPACE.
 *  Prefix the query with '>' to run a guest action, e.g. '> stop 101' or '> console web01'.
 *  Supported actions: start, shutdown, stop, reboot, console, snapshot.
 */
Ext.define('PVE.form.GlobalSearchField', {
    extend: 'Ext.form.field.Text',
    alias: 'widget.pveGlobalSearchField',

    emptyText: gettext('Search'),
    enableKeyEvents: true,
    selectOnFocus: true,
    padding: '0 5 0 5',

    grid: {
        xtype: 'gridpanel',
        userCls: 'proxmox-tags-full',
        focusOnToFront: false,
        floating: true,
        emptyText: Proxmox.Utils.noneText,
        width: 600,
        height: 400,
        scrollable: {
            xtype: 'scroller',
            y: true,
            x: true,
        },
        store: {
            model: 'PVEResources',
            proxy: {
                type: 'proxmox',
                url: '/api2/extjs/cluster/resources',
            },
        },
        plugins: {
            ptype: 'bufferedrenderer',
            trailingBufferZone: 20,
            leadingBufferZone: 20,
        },

        hideMe: function () {
            var me = this;
            if (typeof me.ctxMenu !== 'undefined' && me.ctxMenu.isVisible()) {
                return;
            }
            me.hasFocus = false;
            if (!me.textfield.hasFocus) {
                me.hide();
            }
        },

        setFocus: function () {
            var me = this;
            me.hasFocus = true;
        },

        listeners: {
            rowclick: function (grid, record) {
                var me = this;
                me.textfield.selectAndHide(record.id);
            },
            itemcontextmenu: function (v, record, item, index, event) {
                var me = this;
                me.ctxMenu = PVE.Utils.createCmdMenu(v, record, item, index, event);
            },
            focusleave: 'hideMe',
            focusenter: 'setFocus',
        },

        columns: [
            {
                text: gettext('Type'),
                dataIndex: 'type',
                width: 100,
                renderer: PVE.Utils.render_resource_type,
            },
            {
                text: gettext('Description'),
                flex: 1,
                dataIndex: 'text',
                renderer: function (value, mD, rec) {
                    let overrides = PVE.UIOptions.tagOverrides;
                    let tags = PVE.Utils.renderTags(rec.data.tags, overrides);
                    return `${value}${tags}`;
                },
            },
            {
                text: gettext('Node'),
                dataIndex: 'node',
            },
            {
                text: gettext('Pool'),
                dataIndex: 'pool',
            },
        ],
    },

    commandActions: ['start', 'shutdown', 'stop', 'reboot', 'console', 'snapshot'],

    parseCommand: function (val) {
        let raw = (val || '').toLowerCase().trim();
        if (raw[0] !== '>') {
            return { action: null, query: raw };
        }
        let rest = raw.slice(1).trim().split(/\s+/).filter(Boolean);
        let first = rest[0] || '';
        if (this.commandActions.indexOf(first) !== -1) {
            return { action: first, query: rest.slice(1).join(' ') };
        }
        return { action: null, query: rest.join(' ') };
    },

    customFilter: function (item) {
        let me = this;

        if (me.filterVal === '') {
            item.data.relevance = 0;
            return true;
        }
        // different types have different fields to search, e.g., a node will never have a pool
        const fieldMap = {
            pool: ['type', 'pool', 'text'],
            node: ['type', 'node', 'text'],
            storage: ['type', 'pool', 'node', 'storage'],
            default: ['name', 'type', 'node', 'pool', 'vmid'],
        };
        let fields = fieldMap[item.data.type] || fieldMap.default;
        let fieldArr = fields.map((field) => item.data[field]?.toString().toLowerCase());
        if (item.data.tags) {
            let tags = item.data.tags.split(/[;, ]/);
            fieldArr.push(...tags);
        }

        let filterWords = me.filterVal.split(/\s+/);

        // all text is case insensitive and each split-out word is searched for separately.
        // a row gets 1 point for every partial match, and and additional point for every exact match
        let match = 0;
        for (let fieldValue of fieldArr) {
            if (fieldValue === undefined || fieldValue === '') {
                continue;
            }
            for (let filterWord of filterWords) {
                if (fieldValue.indexOf(filterWord) !== -1) {
                    match++; // partial match
                    if (fieldValue === filterWord) {
                        match++; // exact match is worth more
                    }
                }
            }
        }
        item.data.relevance = match; // set the row's virtual 'relevance' value for ordering
        return match > 0;
    },

    updateFilter: function (field, newValue, oldValue) {
        let me = this;
        // parse input and filter store, show grid
        // '>' prefix runs a guest action, filter by the query part only
        let cmd = me.parseCommand(newValue);
        me.grid.store.filterVal = cmd.query;
        me.grid.store.clearFilter(true);
        me.grid.store.filterBy(me.customFilter);
        me.grid.getSelectionModel().select(0);
    },

    selectAndHide: function (id) {
        var me = this;
        me.tree.selectById(id);
        me.grid.hide();
        me.setValue('');
        me.blur();
    },

    runCommandAction: function (action, record) {
        var me = this;
        if (!record || !record.data) {
            return;
        }
        let data = record.data;
        if (data.type !== 'qemu' && data.type !== 'lxc') {
            me.selectAndHide(record.data.id);
            return;
        }
        let caps = Ext.state.Manager.get('GuiCap');
        let vmid = data.vmid;
        let node = data.node;
        let name = data.name;
        let type = data.type;
        let running = data.status === 'running';

        let guestCommand = function (cmd, params, task) {
            Proxmox.Utils.API2Request({
                params: params,
                url: `/nodes/${node}/${type}/${vmid}/status/${cmd}`,
                method: 'POST',
                failure: (response) => Ext.Msg.alert(gettext('Error'), response.htmlStatus),
            });
        };
        let confirmedGuestCommand = function (cmd, params, task) {
            let msg = PVE.Utils.formatGuestTaskConfirmation(task, vmid, name);
            Ext.Msg.confirm(gettext('Confirm'), msg, function (btn) {
                if (btn === 'yes') {
                    guestCommand(cmd, params, task);
                }
            });
        };

        // Power actions share one permission and one confirmation pattern;
        // only 'start' runs without confirmation, like the guest CmdMenu.
        const powerActions = ['start', 'shutdown', 'stop', 'reboot'];
        if (powerActions.indexOf(action) !== -1) {
            if (!caps.vms['VM.PowerMgmt']) {
                Ext.Msg.alert(gettext('Error'), gettext('Permission denied'));
                return;
            }
            if (action === 'start') {
                guestCommand('start');
            } else {
                let prefix = type === 'qemu' ? 'qm' : 'vz';
                confirmedGuestCommand(action, undefined, prefix + action);
            }
        } else if (action === 'console') {
            if (!caps.vms['VM.Console']) {
                Ext.Msg.alert(gettext('Error'), gettext('Permission denied'));
                return;
            }
            if (type === 'qemu') {
                Proxmox.Utils.API2Request({
                    url: `/nodes/${node}/qemu/${vmid}/status/current`,
                    failure: (response) => Ext.Msg.alert('Error', response.htmlStatus),
                    success: function ({ result: { data: cur } }) {
                        PVE.Utils.openDefaultConsoleWindow(
                            { spice: cur.spice, xtermjs: cur.serial },
                            'kvm',
                            vmid,
                            node,
                            name,
                        );
                    },
                });
            } else {
                PVE.Utils.openDefaultConsoleWindow(true, 'lxc', vmid, node, name);
            }
        } else if (action === 'snapshot') {
            if (!caps.vms['VM.Snapshot']) {
                Ext.Msg.alert(gettext('Error'), gettext('Permission denied'));
                return;
            }
            Ext.create('PVE.window.Snapshot', {
                nodename: node,
                vmid: vmid,
                vmname: name,
                viewonly: false,
                type: type,
                isCreate: true,
                submitText: gettext('Take Snapshot'),
                autoShow: true,
                running: running,
            });
        } else {
            me.selectAndHide(record.data.id);
            return;
        }
        me.grid.hide();
        me.setValue('');
        me.blur();
    },

    onKey: function (field, e) {
        var me = this;
        var key = e.getKey();

        switch (key) {
            case Ext.event.Event.ENTER:
                // go to first entry if there is one, or run '> action' command
                if (me.grid.store.getCount() > 0) {
                    let rec = me.grid.getSelection()[0];
                    // parse live value to avoid change-buffer race; an action
                    // without a query never runs (avoids acting on row 1 by accident)
                    let cmd = me.parseCommand(field.getValue());
                    if (cmd.action && cmd.query) {
                        me.runCommandAction(cmd.action, rec);
                    } else {
                        me.selectAndHide(rec.data.id);
                    }
                }
                break;
            case Ext.event.Event.UP:
                me.grid.getSelectionModel().selectPrevious();
                break;
            case Ext.event.Event.DOWN:
                me.grid.getSelectionModel().selectNext();
                break;
            case Ext.event.Event.ESC:
                me.grid.hide();
                me.blur();
                break;
        }
    },

    loadValues: function (field) {
        let me = this;
        me.hasFocus = true;
        me.grid.textfield = me;
        me.grid.store.load();
        me.grid.showBy(me, 'tl-bl');
    },

    hideGrid: function () {
        let me = this;
        me.hasFocus = false;
        if (!me.grid.hasFocus) {
            me.grid.hide();
        }
    },

    listeners: {
        change: {
            fn: 'updateFilter',
            buffer: 250,
        },
        specialkey: 'onKey',
        focusenter: 'loadValues',
        focusleave: {
            fn: 'hideGrid',
            delay: 100,
        },
    },

    toggleFocus: function () {
        let me = this;
        if (!me.hasFocus) {
            me.focus();
        } else {
            me.blur();
        }
    },

    initComponent: function () {
        let me = this;

        if (!me.tree) {
            throw 'no tree given';
        }

        me.grid = Ext.create(me.grid);

        me.callParent();

        // bind CTRL + K, CTRL + SHIFT + F and CTRL + SPACE to open/close the search
        me.keymap = new Ext.KeyMap({
            target: Ext.get(document),
            binding: [
                {
                    key: 'K',
                    ctrl: true,
                    fn: me.toggleFocus,
                    scope: me,
                },
                {
                    key: 'F',
                    ctrl: true,
                    shift: true,
                    fn: me.toggleFocus,
                    scope: me,
                },
                {
                    key: ' ',
                    ctrl: true,
                    fn: me.toggleFocus,
                    scope: me,
                },
            ],
        });

        // always select first item and sort by relevance after load
        me.mon(me.grid.store, 'load', function () {
            me.grid.getSelectionModel().select(0);
            me.grid.store.sort({
                property: 'relevance',
                direction: 'DESC',
            });
        });
    },
});
