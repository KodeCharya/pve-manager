Ext.define('PVE.panel.GuestAgentInfoBase', {
    extend: 'Ext.container.Container',
    xtype: 'pveGuestAgentInfoBase',

    layout: {
        type: 'vbox',
        align: 'stretch',
    },

    hostname: null,
    osText: null,

    items: [
        {
            xtype: 'container',
            itemId: 'hostnameRow',
            layout: {
                type: 'hbox',
                align: 'top',
            },
            items: [
                {
                    xtype: 'box',
                    html: '<i class="fa fa-desktop"></i> ' + gettext('Hostname'),
                },
                {
                    xtype: 'container',
                    flex: 1,
                    layout: {
                        type: 'hbox',
                        align: 'middle',
                        pack: 'end',
                    },
                    items: [
                        {
                            xtype: 'label',
                            itemId: 'hostnameValue',
                            style: {
                                'text-align': 'right',
                            },
                            text: Proxmox.Utils.unknownText,
                        },
                        {
                            xtype: 'button',
                            itemId: 'hostnameCopy',
                            hidden: true,
                            ui: 'default-toolbar',
                            iconCls: 'fa fa-clipboard',
                            tooltip: gettext('Copy hostname'),
                            margin: '0 0 0 5',
                            handler: function (btn) {
                                let view =
                                    btn.up('pveGuestAgentInfoQEMU') ||
                                    btn.up('pveGuestAgentInfoLXC');
                                PVE.Utils.copyTextWithFeedback(
                                    (view && view.hostname) || '',
                                    btn,
                                );
                            },
                        },
                    ],
                },
            ],
        },
        {
            xtype: 'container',
            itemId: 'osRow',
            layout: {
                type: 'hbox',
                align: 'top',
            },
            margin: '2 0 0 0',
            items: [
                {
                    xtype: 'box',
                    html: '<i class="fa fa-cube"></i> ' + gettext('OS'),
                },
                {
                    xtype: 'container',
                    flex: 1,
                    layout: {
                        type: 'hbox',
                        align: 'middle',
                        pack: 'end',
                    },
                    items: [
                        {
                            xtype: 'label',
                            itemId: 'osValue',
                            style: {
                                'text-align': 'right',
                            },
                            text: Proxmox.Utils.unknownText,
                        },
                        {
                            xtype: 'button',
                            itemId: 'osCopy',
                            hidden: true,
                            ui: 'default-toolbar',
                            iconCls: 'fa fa-clipboard',
                            tooltip: gettext('Copy OS information'),
                            margin: '0 0 0 5',
                            handler: function (btn) {
                                let view =
                                    btn.up('pveGuestAgentInfoQEMU') ||
                                    btn.up('pveGuestAgentInfoLXC');
                                PVE.Utils.copyTextWithFeedback(
                                    (view && view.osText) || '',
                                    btn,
                                );
                            },
                        },
                    ],
                },
            ],
        },
        {
            xtype: 'container',
            layout: {
                type: 'hbox',
                pack: 'end',
            },
            margin: '4 0 0 0',
            items: [
                {
                    xtype: 'button',
                    itemId: 'copyConnectionBtn',
                    ui: 'default-toolbar',
                    iconCls: 'fa fa-clipboard',
                    text: gettext('Copy connection information'),
                    tooltip: gettext('Copy non-sensitive connection information'),
                    handler: function (btn) {
                        let view =
                            btn.up('pveGuestAgentInfoQEMU') ||
                            btn.up('pveGuestAgentInfoLXC');
                        if (view) {
                            view.copyConnectionInfo(btn);
                        }
                    },
                },
            ],
        },
    ],

    // Cache last shown values so the 1s status polling does not rewrite the DOM.
    lastHostnameText: undefined,
    lastOsText: undefined,

    setRowValue: function (valueId, copyId, cacheKey, text, copyable) {
        let me = this;
        if (me.isDestroyed || me.isDestroying) {
            return;
        }
        if (me[cacheKey] === text + (copyable ? '|c' : '|')) {
            return;
        }
        me[cacheKey] = text + (copyable ? '|c' : '|');
        let label = me.down('#' + valueId);
        let copyBtn = me.down('#' + copyId);
        if (label) {
            // Explicitly encode: agent/config values are untrusted (guest-controlled).
            label.update(Ext.htmlEncode(text || ''));
        }
        if (copyBtn) {
            copyBtn.setVisible(!!copyable && !!text);
        }
    },

    setHostname: function (text, copyable) {
        let me = this;
        me.hostname = copyable ? text : null;
        me.setRowValue('hostnameValue', 'hostnameCopy', 'lastHostnameText', text, copyable);
    },

    setOs: function (text, copyable) {
        let me = this;
        me.osText = copyable ? text : null;
        me.setRowValue('osValue', 'osCopy', 'lastOsText', text, copyable);
    },

    copyConnectionInfo: function (btn) {
        let me = this;
        let data = me.pveSelNode ? me.pveSelNode.data : {};
        let ip = null;
        try {
            let statusView = me.up('pveGuestStatusView');
            let ipView = statusView ? statusView.down('pveIPViewBase') : null;
            if (ipView && ipView.getCopyableIps) {
                let ips = ipView.getCopyableIps();
                if (ips.length > 0) {
                    ip = ips[0];
                }
            }
        } catch (_e) {
            // ignore, IP is optional
        }
        let info = {
            vmid: data.vmid,
            name: data.name,
            node: data.node,
            hostname: me.hostname,
            ip: ip,
        };
        let text = PVE.Utils.formatGuestConnectionInfo(info);
        if (!text) {
            text = '';
        }
        PVE.Utils.copyTextWithFeedback(text, btn);
    },

    initComponent: function () {
        var me = this;

        if (!me.rstore) {
            throw 'rstore not given';
        }

        if (!me.pveSelNode) {
            throw 'pveSelNode not given';
        }

        me.callParent();
    },
});

Ext.define('PVE.panel.GuestAgentInfoQEMU', {
    extend: 'PVE.panel.GuestAgentInfoBase',
    xtype: 'pveGuestAgentInfoQEMU',

    interval: 15000,

    // Canonical QGA fields (guest-get-host-name returns {"host-name": ...}).
    extractHostname: function (result) {
        if (!result) {
            return null;
        }
        if (Ext.isString(result)) {
            return result || null;
        }
        return result['host-name'] || null;
    },

    // Canonical QGA guest-get-osinfo fields: id, name, pretty-name, version,
    // version-id, kernel-release (uname -r), kernel-version (uname -v).
    extractOs: function (result) {
        if (!result) {
            return { os: null, kernel: null };
        }
        let os =
            result['pretty-name'] ||
            (result.name && result.version ? `${result.name} ${result.version}` : result.name) ||
            result.id ||
            null;
        let kernel = result['kernel-release'] || result['kernel-version'] || null;
        if (os && kernel) {
            os = `${os} (${kernel})`;
        } else if (kernel) {
            os = kernel;
        }
        return { os: os, kernel: kernel };
    },

    createAgentStores: function (nodename, vmid) {
        let me = this;

        // Note: store reads go out as GET via the proxmox proxy, matching the
        // canonical backend registration (GET) of these agent endpoints.
        me.hostNameStore = Ext.create('Proxmox.data.UpdateStore', {
            interval: me.interval,
            storeid: `pve-qemu-agent-hostname-${vmid}`,
            proxy: {
                type: 'proxmox',
                url: `/api2/json/nodes/${nodename}/qemu/${vmid}/agent/get-host-name`,
            },
        });

        me.osInfoStore = Ext.create('Proxmox.data.UpdateStore', {
            interval: me.interval,
            storeid: `pve-qemu-agent-osinfo-${vmid}`,
            proxy: {
                type: 'proxmox',
                url: `/api2/json/nodes/${nodename}/qemu/${vmid}/agent/get-osinfo`,
            },
        });

        me.mon(me.hostNameStore, 'load', function (_store, records, success) {
            if (me.isDestroyed || me.isDestroying) {
                return;
            }
            if (!success || !records || !records.length) {
                me.hostnameFailed = true;
                me.updateAgentStatus();
                return;
            }
            me.hostnameFailed = false;
            me.hostnameResult = records[0].data.result;
            me.updateAgentStatus();
        });

        me.mon(me.osInfoStore, 'load', function (_store, records, success) {
            if (me.isDestroyed || me.isDestroying) {
                return;
            }
            if (!success || !records || !records.length) {
                me.osFailed = true;
                me.updateAgentStatus();
                return;
            }
            me.osFailed = false;
            me.osResult = records[0].data.result;
            me.updateAgentStatus();
        });

        me.on('destroy', function () {
            me.hostNameStore.stopUpdate();
            me.osInfoStore.stopUpdate();
        });
    },

    updateAgentStatus: function () {
        let me = this;

        if (!me.hasGuestAgentPerm) {
            let msg = Ext.String.format(
                gettext("Requires '{0}' Privileges"),
                'VM.GuestAgent.Audit',
            );
            me.setHostname(msg, false);
            me.setOs(msg, false);
            return;
        }

        if (!me.agentConfigured) {
            let msg = gettext('No Guest Agent configured');
            me.setHostname(msg, false);
            me.setOs(msg, false);
            return;
        }

        if (!me.guestRunning) {
            let msg = gettext('Guest Agent not running');
            me.setHostname(msg, false);
            me.setOs(msg, false);
            return;
        }

        // Each field is evaluated independently: a failing osinfo query must not
        // hide an available hostname and vice versa.
        if (me.hostnameFailed) {
            me.setHostname(gettext('Not available'), false);
        } else {
            let hostname = me.extractHostname(me.hostnameResult);
            if (hostname) {
                me.setHostname(hostname, true);
            } else if (me.hostnameResult !== undefined) {
                me.setHostname(gettext('Unknown'), false);
            } else {
                me.setHostname(gettext('Not available'), false);
            }
        }

        if (me.osFailed) {
            me.setOs(gettext('Not available'), false);
        } else {
            let { os } = me.extractOs(me.osResult);
            if (os) {
                me.setOs(os, true);
            } else if (me.osResult !== undefined) {
                me.setOs(gettext('Unknown'), false);
            } else {
                me.setOs(gettext('Not available'), false);
            }
        }
    },

    startAgentStores: function (store) {
        let me = this;

        let agentRec = store.getById('agent');
        let state = store.getById('status');

        me.agentConfigured = agentRec && agentRec.data.value === 1;
        me.guestRunning = state && state.data.value === 'running';

        let caps = Ext.state.Manager.get('GuiCap');
        me.hasGuestAgentPerm = !!caps.vms['VM.GuestAgent.Audit'];

        if (!me.hasGuestAgentPerm || !me.agentConfigured || !me.guestRunning) {
            me.hostNameStore.stopUpdate();
            me.osInfoStore.stopUpdate();
            me.updateAgentStatus();
            return;
        }

        if (me.hostNameStore.isStopped) {
            me.hostNameStore.startUpdate();
        }
        if (me.osInfoStore.isStopped) {
            me.osInfoStore.startUpdate();
        }
        me.updateAgentStatus();
    },

    initComponent: function () {
        var me = this;
        me.callParent();

        let { node, vmid } = me.pveSelNode.data;
        me.createAgentStores(node, vmid);

        if (me.rstore.getCount()) {
            me.startAgentStores(me.rstore);
        }
        me.mon(me.rstore, 'load', me.startAgentStores, me);
    },
});

Ext.define('PVE.panel.GuestAgentInfoLXC', {
    extend: 'PVE.panel.GuestAgentInfoBase',
    xtype: 'pveGuestAgentInfoLXC',

    loadLxcInfo: function () {
        let me = this;
        let { node, vmid } = me.pveSelNode.data;

        let caps = Ext.state.Manager.get('GuiCap');
        if (!caps.vms['VM.Audit']) {
            let msg = Ext.String.format(gettext("Requires '{0}' Privileges"), 'VM.Audit');
            me.setHostname(msg, false);
            me.setOs(msg, false);
            return;
        }

        Proxmox.Utils.API2Request({
            url: `/api2/extjs/nodes/${node}/lxc/${vmid}/config`,
            method: 'GET',
            success: function ({ result }) {
                if (me.isDestroyed || me.isDestroying) {
                    return;
                }
                let hostname = result.data.hostname || null;
                if (hostname) {
                    me.setHostname(hostname, true);
                } else {
                    me.setHostname(gettext('Unknown'), false);
                }

                let ostype = result.data.ostype || null;
                if (ostype && ostype !== 'unmanaged') {
                    const namemap = {
                        archlinux: 'Arch Linux',
                        nixos: 'NixOS',
                        opensuse: 'openSUSE',
                        centos: 'CentOS',
                    };
                    let distro = namemap[ostype] ?? Ext.String.capitalize(ostype);
                    me.setOs(distro, true);
                } else if (ostype) {
                    me.setOs(ostype, false);
                } else {
                    me.setOs(gettext('Unknown'), false);
                }
            },
            failure: function () {
                if (me.isDestroyed || me.isDestroying) {
                    return;
                }
                me.setHostname(gettext('Not available'), false);
                me.setOs(gettext('Not available'), false);
            },
        });
    },

    initComponent: function () {
        var me = this;
        me.callParent();
        me.loadLxcInfo();
    },
});
